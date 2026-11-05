---
title: "An Agent's Sense of Time"
date: 2026-10-07
lang: en
ref: agent-time-sense
---

Lately, working with coding agents, I've started to feel a real trust issue with them. After some research and testing, I found what might be the cause, and it's an interesting one.

## 1. Estimating in human hours

The first problem is that AI still estimates work the pre-AI way. It will tell you a change needs half a day, a day, or 2–3 days, when in practice a single session often finishes it in 20 minutes. The number it gives you is how long a human engineer in 2022 would need, not how long it needs itself.

This has already been written about. Martin Monperrus, a software engineering professor at KTH, wrote a blog post in September[^1] that calls it *anthropocentric time bias*. He sees two main causes, and I agree with both:

- **Training data**: blog posts, sprint estimates, and pre-2022 GitHub all record how fast humans work, so the only conversion between effort and time the model has learned is the human one.
- **No clock**: the model knows that "writing an API takes a few days," but it can't feel that it actually wrote one in 90 seconds.

There are quantitative studies too. A paper at an ICLR 2026 workshop, "Can LLMs Perceive Time?"[^2], tested 68 tasks and found that models' pre-task estimates overshoot actual duration by 4–7x, and by 5–10x in multi-step agent settings. A LessWrong post from August, "Your Agents Are Not Time Aware"[^3], ran Claude Code and Codex on a few hundred tasks and found that no matter how long a task actually takes, the agents like to predict around "an hour and a half."

> The Claude team has noticed this.
>
> Claude Code's system prompt once had a section called "Planning without timelines," which said: Never suggest timelines like "this will take 2-3 weeks" or "we can do this later." The npm release history shows it was added in 2.0.43 in November 2025 and removed in 2.1.9 in January 2026[^4]. Why it was removed isn't known. Either way, the rule only stopped Claude from *saying* it; it couldn't change how Claude *thinks*.

Someone also filed an issue on Claude Code's GitHub[^5]: the agent kept pushing back on small changes with "not worth the complexity" or "we can do that later," and those changes turned out to be 4 lines of code that it finished as soon as it was pushed. Even when Claude isn't allowed to talk about time, it is still budgeting as if the job takes three days; it just says "not worth it," "later," or "out of scope" instead.

## 2. The agent remembers deadlines

The second one is subtler, and it has to do with Claude Code's auto memory.

Claude Code writes its own memories. According to the official docs[^6], it saves only four kinds: user (who you are and how you work), feedback (corrections you've given it), project (how the project is going), and reference (where to find outside information). The project type covers "ongoing work, deadlines, and decisions," as long as they can't be derived from the code or git history.

I also dug into the prompt for this inside the Claude Code package[^7], which is more specific. When should it save a project memory? "When you learn who is doing what, why, or by when." Relative dates like "Thursday" have to be converted to absolute dates before saving. Each memory also gets a "How to apply" line saying how the fact should shape its suggestions later. The example in the prompt: the user says non-critical merges are frozen after Thursday, and the agent saves "merge freeze begins 2026-03-05 for mobile release cut. Flag any non-critical PR work scheduled after that date."

So it really does pay attention to deadlines, and it is explicitly told to let them shape its suggestions. The design is reasonable on its own, but combined with the first bias it can form a chain. Say the memory says we launch in three days, and I want to build a feature and ask the agent which implementation it recommends. Sometimes it will:

1. Recommend a simple, temporary workaround
2. Suggest holding off, since we're launching "soon"

Add the fact that LLMs already lean toward recommending the conservative option[^8][^9], and the agent becomes more likely to stop, or to work well below the pace we'd expect.

### Then again

In a big company, this behavior might well be more acceptable. But in a startup, or when we're building our own projects, it's hard to accept. A change often costs one 20-minute session, and rolling it back if something breaks is just as quick. There's no reason to skip it just because a date is close.

Seen this way, there are two possible directions. One is to stop the agent from remembering deadlines at all, or at least from using them to shape suggestions unprompted. The other is to give the agent more context, such as telling it we're working at a startup, or just hacking on a project, and let it work out what a deadline means here.

It's an interesting, dialectical question: we could try adjusting the agent's behavior in two completely opposite directions.

## TODO

- Reproduce this in a clean environment
- Test how to adjust this behavior

[^1]: Martin Monperrus (professor of software engineering, KTH Royal Institute of Technology) and Evita Stenqvist, [Coding Agents Have Completely Wrong Sense of Time](https://www.monperrus.net/martin/coding-agents-sense-of-time), blog post, September 2026
[^2]: Aniketh Garikaparthi, [Can LLMs Perceive Time? An Empirical Investigation](https://arxiv.org/abs/2604.00010), ICLR 2026 workshop
[^3]: Michael Ofengenden and Maksym Andriushchenko, [Your Agents Are Not Time Aware](https://www.lesswrong.com/posts/eAbuPXbjakop5rSJx/your-agents-are-not-time-aware), LessWrong, August 2026
[^4]: `cli.js` in the npm package `@anthropic-ai/claude-code`, versions 2.0.43 (2025-11-17) through 2.1.8 (2026-01-15), section "Planning without timelines"
[^5]: anthropics/claude-code issue [#20270](https://github.com/anthropics/claude-code/issues/20270): "No time estimates" rule might be making Claude Code lazy, January 2026
[^6]: Anthropic, Claude Code docs, [How Claude remembers your project](https://code.claude.com/docs/en/memory), "Auto memory" section
[^7]: The auto memory prompt in the Claude Code 2.1.220 package, definition of the project type
[^8]: anthropics/claude-code issue [#96621](https://github.com/anthropics/claude-code/issues/96621): Claude Code defaults to recommending the narrowest/cheapest option on scope decisions, September 2026
[^9]: anthropics/claude-code issue [#31815](https://github.com/anthropics/claude-code/issues/31815): Claude defaults to 'defer' instead of 'try', March 2026
