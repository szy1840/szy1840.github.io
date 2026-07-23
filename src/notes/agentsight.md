---
title: "AgentSight：用 eBPF 零侵入地观测 AI Agent 的 LLM 流量"
date: 2026-07-23
tags: ["AI Agent", "eBPF", "Observability", "LLM"]
lang: zh
ref: agentsight
---

**ANOLISA** 是阿里云 2026 年 3 月开源的 Agentic OS（Anolis OS 的 Agent 演进版），由 Copilot Shell、OS Skills、Agent Sec Core、AgentSight 等组件组装而成，定位为首个"以 Agent 为用户主体"的服务端操作系统。

其中 **AgentSight** 来自上游开源项目 [eunomia-bpf/agentsight](https://github.com/eunomia-bpf/agentsight)（MIT），被 ANOLISA 集成为可观测性组件，核心是基于 eBPF、对 AI Agent 的 LLM 流量提供零侵入式监控。

本文是对它的实现思路的一篇学习笔记。

## eBPF

eBPF（extended Berkeley Packet Filter）可以把一小段程序加载进 Linux 内核，在特定事件触发时运行（某个函数被调用、发生某个系统调用、调度器事件等）。

使用方法是：写一段 eBPF，编译成 eBPF 字节码，然后通过 `bpf()` 系统调用加载。加载时内核的 **verifier（校验器）** 会静态检查这段程序：不能有无界循环、不能越界访问内存、不能让内核崩溃。通过校验后，JIT 把字节码编译成本机机器码，挂到某个 hook 点上。之后每次那个事件发生，这段程序就在内核态跑一次。

hook 点可以是很多种：

- **kprobe / kretprobe** —— 挂在任意内核函数的入口/返回
- **uprobe / uretprobe** —— 挂在用户态函数上
- **tracepoint** —— 内核里预定义的稳定埋点，比如 `execve` 系统调用
- **XDP / tc** —— 网络数据路径，能在最早期处理/丢弃包
- **LSM hook** —— 安全策略决策点

内核态程序和用户态程序之间通过 **maps**（哈希表、数组、ring buffer 等共享内存结构）交换数据。

AgentSight 用的主要是 **uprobe/uretprobe**，通过在 `SSL_read`、`SSL_write` 等函数上触发断点，运行我们自己的 eBPF 程序，这样我们就可以在加密之前、解密之后读到 LLM 流量的明文数据。最终的性能开销不超过 **3%**。

**权限**：很明显，加载 eBPF 程序、挂探针需要 `CAP_BPF` + `CAP_SYS_ADMIN`（读别的进程内存、装内核 hook）。实际就是需要 sudo，或授予这些 capability。

## verifier

eBPF 程序的安全是内核 verifier 在加载时强制保证的：

- **verifier 校验过的程序。** 程序被接受前，verifier 会证明它会终止（只允许有界循环）、绝不解引用未检查的指针、栈不越界。
- **不裸解引用指针。** 读目标进程内存必须走 `bpf_probe_read_user` 这类 helper，地址非法时它优雅失败（返回非零）而不是崩溃。代码会检查返回值：失败时把缓冲区标记为空，而不是输出垃圾。
- **给 verifier 的显式边界裁剪。** 拷贝长度先做位掩码再裁到上限。
- **有界 map。** 每个 map 都有固定容量上限（暂存缓冲区地址和时间戳的那几张表各一万条量级，ring buffer 也是定长）。内核里内存不会无限增长。
- **截断而非溢出。** 超过上限的载荷只拷到上限；真实长度仍单独记着。
- **调试构建可用 AddressSanitizer**（`cd bpf && make debug`）测用户态加载器那一侧。

## 具体实现

SSL 捕获的核心技巧是在函数的进入和返回处各挂一个探针：

- **进入时**，函数参数还在寄存器里，能拿到调用方传进来的缓冲区指针，但缓冲区里还没有数据（read 尤其明显，此时是空的）。所以这一刀只是把缓冲区地址和时间戳暂存进一张以线程号（tid）为 key 的 hash map。
- **返回时**，函数已经干完活：read 的明文填好了、write 的明文还在。返回值告诉我们实际读/写了多少字节，于是根据进入时暂存的地址，精确拷贝这么多字节出来并 submit。

**为什么用 tid 当 key**：进入和返回是两次独立触发，中间必须有个标识把"我刚记下的缓冲区"找回来。同一次函数调用一定发生在同一个线程里，所以 tid 是最自然的选择。

数据通过 ring buffer map 离开内核。用户态加载器抽干它，每行输出一个 JSON 对象。

### 为什么不只在返回的时候读？

因为函数参数是通过寄存器传的，函数体一开始执行，那几个参数寄存器就很可能被当普通临时寄存器覆盖掉了。因此我们需要在函数进入的时候，拿到第二个参数：缓冲区地址。

## SSL

**SSL 是什么？** OpenSSL 和 GnuTLS 都是 TLS/SSL 加密库——就是让程序能建立加密网络连接（HTTPS 那个 "S"）的底层软件库。

当你的程序要往 `https://api.anthropic.com` 发请求时，数据不能明文过网络，得加密。但"实现 TLS 协议"这件事很复杂：密钥协商、证书验证、对称/非对称加密、各种算法套件……没人会自己从头写。所以绝大多数程序都是链接一个现成的 TLS 库：

- **OpenSSL**，Apache 许可证，几乎无处不在：Nginx、Python 的 requests、curl、大量语言的 HTTP 客户端底层都用的是 OpenSSL。
- **GnuTLS**：GNU 项目的替代实现，LGPL 许可证。有些项目出于许可证兼容性（早年 OpenSSL 的许可证和 GPL 有冲突）或偏好选它，比如 GnuPG 生态、一些 GNOME 组件。

此外还有 **BoringSSL**（Google 从 OpenSSL fork 出来的，Chrome/Android 在用）、LibreSSL、mbedTLS、Go 和 Rust 各自的原生 TLS 实现等等。

这里也能看到 AgentSight 的一个**限制**：AgentSight 依赖 `SSL_read`/`SSL_write`（OpenSSL 系，含 BoringSSL、LibreSSL）和 `gnutls_record_send`/`gnutls_record_recv`（GnuTLS）这两套符号名。Go 的 `crypto/tls`、Rust 的 rustls 是完全独立的原生实现，如果 Agent 用的是这些，就完全无法拦截到 LLM 流量了。

### 静态链接如何处理

上面的 `.so` 也能看出来，这是针对动态链接库的。但一些 agent 采用的是静态链接。比如：

- **Claude Code / Bun**：把 BoringSSL 静态链进自己的二进制，而且 strip 掉了符号表。
- **所有 Node.js**：把 OpenSSL 静态链进去。
- **Gemini CLI**：跑在 Node 上，同理。

这种情况默认会失败，因为 uprobe 需要挂载到某个可执行文件里的某个地址：内核需要一个具体文件 + 文件内偏移，才能在那里下断点。sslsniff 在没有任何提示时，默认去系统 `libssl.so` 里按符号名找 `SSL_read`/`SSL_write`。

在静态链接的时候，`SSL_write` 照样在被调用，只是这个函数不在系统 `libssl.so` 里，而是被静态链进了应用自己的二进制。因此我们就要找到这个位置。

**两级策略**：

- **符号查找。** 二进制没 strip 的话，符号表里直接查得到 `SSL_write` 的偏移。
- **符号没了就靠字节特征。** stripped 二进制查不到符号，于是退回去扫描文件内容，找三个特征串：`SSL_write`、`BoringSSLError`、`OPENSSL_internal`。

## 请求–响应关联（correlation）

内核抓到的是一条条孤立的 SSL 读写，它不知道哪个 `SSL_read`（响应）对应哪个 `SSL_write`（请求）。把请求和响应配成一对，才能算出"这次调用多久、多少 token、成功还是失败"，即一行调用记录。

核心匹配数据结构：

- **key 是 (pid, tid)**：一次请求-响应，发生在同一线程。
- **value 就是待匹配队列。** 本质就是一个有界队列，最旧优先淘汰。大小 16，TTL 5 分钟。

每次进来一条响应，进行配对。配对按可信度从高到低三档，并给每次配对 confidence 分：

| 情况 | 依据 | 分数 |
| --- | --- | --- |
| 响应带 request_id | 队列里精确 id 匹配 | 0.95 |
| 队列里只剩 1 个 | 唯一，就直接匹配 | 0.75 |
| 多个待配，只有 1 个带 body/model | 取那个最像的 | 0.70 |
| 多个都像样，分不清 | 放弃，留 orphan | — |

**TTL 淘汰**：每来一个事件就顺手跑一次。主要是处理请求发出去响应永远不来（网断了、进程崩了）的情况，5 分钟后从内存自动老化。

## Token 用量

并不依赖任何字符-token 估算，也不使用分词器，就是依靠厂商的输出。主要分流式和非流式两种处理方式。

**非流式响应**：直接读 body 里的字段。各家字段名不同，几个例子是：

| 统一字段 | Anthropic | OpenAI | Gemini |
| --- | --- | --- | --- |
| 输入 | `input_tokens` | `prompt_tokens` | `promptTokenCount` |
| 输出 | `output_tokens` | `completion_tokens` | `candidatesTokenCount` + `thoughtsTokenCount` |
| 新建缓存 | `cache_creation_input_tokens` | — | — |
| 读缓存 | `cache_read_input_tokens` | — | `cachedContentTokenCount` |
| 总计 | 四项相加 | 四项相加 | `totalTokenCount` |

**流式响应**：usage 不是一次给全的，而是散在多个小事件里，开头的事件先给输入，后续的增量事件反复报到目前为止的累计输出。因此我们的合并策略就是**取最大值**。当然，累积值天然是递增的，最大值就是最终值。这个处理方法提供的好处是天然幂等。

**其他旁路**：比如，可以读取 agent 原生会话文件。读 `~/.claude`、`~/.codex` 里的会话记录，取它自己记的每模型用量。当然，网络观测到的响应用量是首要事实来源，原生会话日志只在没抓到网络调用时做补充和回填。同一个调用如果观测到多个数据，只保留优先级最高的数据。

## 感想

在开发 dev_pulse 的时候，马上就感觉到为了统计用量，我的实现非常依赖 LLM 厂商的具体实现，比如 `.claude/` 目录结构等等。因此我想尝试找一些不依赖厂商实现方式的解决方案。了解到这个基于 eBPF 的底层方案的时候，感觉还是挺有意思的。但最终细看下来，还是依赖非常多具体实现：依赖 SSL 库类型，token 统计还是依赖厂商字段，还是可能依赖类似 `.claude/` 下的这种具体目录和本地存储内容，静态链接甚至可能依赖字节特征。

只能说这又是另一次 tradeoff：用更高的权限去做拦截获取 LLM 流量，换取了减少一部分对 LLM 厂商的具体本地存储内容和结构的依赖。但本质是无法摆脱各种实现细节的依赖的。我觉得或许之后 LLM 厂商会有通用无状态/有状态请求-响应的协议，这样可以让所有人的 life easier。
