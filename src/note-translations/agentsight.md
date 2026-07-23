---
title: "AgentSight: Zero-Intrusion Observability for AI Agent LLM Traffic with eBPF"
lang: en
ref: agentsight
---

**ANOLISA** is the Agentic OS that Alibaba Cloud open-sourced in March 2026 (the Agent-oriented evolution of Anolis OS), assembled from components such as Copilot Shell, OS Skills, Agent Sec Core, and AgentSight, and positioned as the first server-side operating system that treats "the Agent as the user."

Among them, **AgentSight** comes from the upstream open-source project [eunomia-bpf/agentsight](https://github.com/eunomia-bpf/agentsight) (MIT), integrated by ANOLISA as its observability component, whose core is zero-intrusion monitoring of an AI Agent's LLM traffic built on eBPF.

These are my study notes on how it works.

## eBPF

eBPF (extended Berkeley Packet Filter) lets you load a small program into the Linux kernel that runs when a specific event fires (a function is called, a syscall happens, a scheduler event, etc.).

The workflow is: write an eBPF program, compile it to eBPF bytecode, then load it via the `bpf()` syscall. At load time the kernel's **verifier** statically checks the program: no unbounded loops, no out-of-bounds memory access, nothing that can crash the kernel. Once it passes verification, the JIT compiles the bytecode into native machine code and attaches it to a hook point. From then on, every time that event happens, the program runs once in kernel space.

There are many kinds of hook points:

- **kprobe / kretprobe** — attach to the entry/return of any kernel function
- **uprobe / uretprobe** — attach to user-space functions
- **tracepoint** — stable, predefined instrumentation points in the kernel, e.g. the `execve` syscall
- **XDP / tc** — the network data path, able to process/drop packets at the earliest stage
- **LSM hook** — security-policy decision points

The kernel-side program and the user-space program exchange data through **maps** (shared-memory structures like hash tables, arrays, ring buffers).

AgentSight mainly uses **uprobe/uretprobe**: it sets breakpoints on functions like `SSL_read` and `SSL_write` to run our own eBPF program, so we can read the plaintext of LLM traffic before it is encrypted and after it is decrypted. The final performance overhead is under **3%**.

**Permissions**: obviously, loading eBPF programs and attaching probes requires `CAP_BPF` + `CAP_SYS_ADMIN` (reading other processes' memory, installing kernel hooks). In practice that means sudo, or granting those capabilities.

## The verifier

The safety of an eBPF program is enforced by the kernel verifier at load time:

- **Verified programs.** Before a program is accepted, the verifier proves it terminates (only bounded loops allowed), never dereferences an unchecked pointer, and never overflows the stack.
- **No raw pointer dereferences.** Reading the target process's memory must go through helpers like `bpf_probe_read_user`, which fails gracefully (returns nonzero) instead of crashing when the address is invalid. The code checks the return value: on failure it marks the buffer empty rather than emitting garbage.
- **Explicit bounds clamping for the verifier.** The copy length is bit-masked first, then clamped to a maximum.
- **Bounded maps.** Every map has a fixed capacity cap (the tables that stash buffer addresses and timestamps hold on the order of ten thousand entries each, and the ring buffer is fixed-length too). Memory in the kernel does not grow unbounded.
- **Truncation, not overflow.** A payload exceeding the cap is copied only up to the cap; the real length is still recorded separately.
- **AddressSanitizer in debug builds** (`cd bpf && make debug`) to test the user-space loader side.

## The implementation

The core trick of SSL capture is to attach one probe at the function's entry and one at its return:

- **On entry**, the function arguments are still in registers, so we can grab the buffer pointer the caller passed in—but the buffer has no data yet (especially obvious for read, where it's empty at this point). So this pass only stashes the buffer address and a timestamp into a hash map keyed by thread id (tid).
- **On return**, the function has finished its work: read's plaintext is filled in, write's plaintext is still there. The return value tells us how many bytes were actually read/written, so using the address stashed on entry we copy out exactly that many bytes and submit.

**Why use tid as the key**: entry and return are two independent firings, so there must be an identifier in between to recover "the buffer I just recorded." A single function call always happens on the same thread, so tid is the most natural choice.

Data leaves the kernel through a ring buffer map. The user-space loader drains it, emitting one JSON object per line.

### Why not just read on return?

Because arguments are passed in registers, and once the function body starts executing, those argument registers are very likely reused as ordinary scratch registers. So we need to grab the second argument—the buffer address—at function entry.

## SSL

**What is SSL?** OpenSSL and GnuTLS are both TLS/SSL crypto libraries—the low-level software that lets a program establish encrypted network connections (the "S" in HTTPS).

When your program sends a request to `https://api.anthropic.com`, the data cannot travel over the network in plaintext; it has to be encrypted. But "implementing the TLS protocol" is complex: key negotiation, certificate validation, symmetric/asymmetric encryption, all the cipher suites… nobody writes it from scratch. So the vast majority of programs link against an existing TLS library:

- **OpenSSL**, Apache-licensed, virtually everywhere: Nginx, Python's requests, curl, and the underlying HTTP clients of many languages all use OpenSSL.
- **GnuTLS**: the GNU project's alternative implementation, LGPL-licensed. Some projects pick it for license compatibility (OpenSSL's old license conflicted with the GPL) or preference, e.g. the GnuPG ecosystem and some GNOME components.

There are also **BoringSSL** (Google's fork of OpenSSL, used by Chrome/Android), LibreSSL, mbedTLS, and Go's and Rust's own native TLS implementations, etc.

This reveals one of AgentSight's **limitations**: it depends on the two symbol-name families `SSL_read`/`SSL_write` (the OpenSSL family, including BoringSSL and LibreSSL) and `gnutls_record_send`/`gnutls_record_recv` (GnuTLS). Go's `crypto/tls` and Rust's rustls are completely independent native implementations; if the Agent uses those, LLM traffic simply cannot be intercepted at all.

### Handling static linking

As the `.so` above suggests, this is aimed at dynamically linked libraries. But some agents use static linking. For example:

- **Claude Code / Bun**: BoringSSL is statically linked into their own binary, and the symbol table is stripped.
- **All of Node.js**: OpenSSL is statically linked in.
- **Gemini CLI**: runs on Node, same story.

This case fails by default, because a uprobe needs to attach to a specific address inside some executable file: the kernel needs a concrete file + in-file offset to set a breakpoint there. With no hints, sslsniff defaults to looking up `SSL_read`/`SSL_write` by symbol name in the system `libssl.so`.

With static linking, `SSL_write` is still being called; it's just that the function isn't in the system `libssl.so`, it's statically linked into the application's own binary. So we have to find that location.

**A two-tier strategy**:

- **Symbol lookup.** If the binary isn't stripped, the symbol table gives the offset of `SSL_write` directly.
- **Byte signatures when symbols are gone.** A stripped binary has no symbols to look up, so we fall back to scanning the file's contents for three signature strings: `SSL_write`, `BoringSSLError`, and `OPENSSL_internal`.

## Request–response correlation

What the kernel captures is a stream of isolated SSL reads and writes; it doesn't know which `SSL_read` (response) corresponds to which `SSL_write` (request). Only by pairing a request with a response can you compute "how long this call took, how many tokens, success or failure"—i.e. one call record.

The core matching data structure:

- **The key is (pid, tid)**: a request-response pair happens on the same thread.
- **The value is the pending-match queue.** Essentially a bounded queue with oldest-first eviction. Size 16, TTL 5 minutes.

Each time a response comes in, it is matched. Matching goes through three tiers from most to least trustworthy, assigning each match a confidence score:

| Case | Basis | Score |
| --- | --- | --- |
| Response carries a request_id | exact id match in the queue | 0.95 |
| Only 1 left in the queue | unique, matched directly | 0.75 |
| Multiple pending, only 1 has body/model | pick the most likely one | 0.70 |
| Multiple look plausible, indistinguishable | give up, leave an orphan | — |

**TTL eviction**: run opportunistically on every incoming event. Its main job is to handle the case where a request is sent but the response never arrives (the network drops, the process crashes); after 5 minutes it ages out of memory automatically.

## Token usage

It doesn't rely on any character-to-token estimation and doesn't use a tokenizer—it relies on the vendors' own output. There are two main handling paths: streaming and non-streaming.

**Non-streaming responses**: just read the fields in the body. Each vendor names them differently; a few examples:

| Unified field | Anthropic | OpenAI | Gemini |
| --- | --- | --- | --- |
| Input | `input_tokens` | `prompt_tokens` | `promptTokenCount` |
| Output | `output_tokens` | `completion_tokens` | `candidatesTokenCount` + `thoughtsTokenCount` |
| Cache creation | `cache_creation_input_tokens` | — | — |
| Cache read | `cache_read_input_tokens` | — | `cachedContentTokenCount` |
| Total | sum of the four | sum of the four | `totalTokenCount` |

**Streaming responses**: usage isn't given all at once but scattered across many small events—the opening event gives the input first, and subsequent incremental events repeatedly report the cumulative output so far. So our merge strategy is simply to **take the maximum**. Since the cumulative value is naturally monotonically increasing, the maximum is the final value. The benefit of this approach is that it's naturally idempotent.

**Other side channels**: for example, you can read the agent's native session files. Reading the session records in `~/.claude` and `~/.codex` gives you the per-model usage the agent itself recorded. Of course, the response usage observed on the network is the primary source of truth; native session logs are only used to supplement and backfill when a network call wasn't captured. If multiple pieces of data are observed for the same call, only the highest-priority one is kept.

## Reflections

While building dev_pulse, I immediately felt that, to account for usage, my implementation was heavily dependent on the LLM vendors' specific implementations, e.g. the `.claude/` directory layout and so on. So I wanted to look for a solution that didn't depend on vendor implementation details. When I learned about this low-level eBPF-based approach, I found it quite interesting. But on closer inspection it still depends on plenty of specifics: it depends on the SSL library type, token accounting still depends on vendor fields, it may still depend on concrete directories and local storage contents like those under `.claude/`, and static linking may even depend on byte signatures.

I can only say this is yet another tradeoff: using higher privileges to intercept and obtain LLM traffic, in exchange for reducing part of the dependence on the LLM vendors' specific local storage contents and structures. But fundamentally you can't escape dependence on implementation details of some kind. I suspect that eventually LLM vendors will settle on a common stateless/stateful request-response protocol, which would make everyone's life easier.
