---
title: "Agent 的时间感"
date: 2026-10-07
lang: zh
ref: agent-time-sense
---

最近用 coding agent 的时候，感觉和 agent 产生了严重的 trust issue。研究测试下来，发现了一个可能的、有意思的问题。

## 1. 用人类工时估算

第一个是，ai 还在用 pre-AI era 的方式估算工作量。它经常会说这个改动需要半天、1 天，或者 2–3 天，但实际上很多时候一个 session 跑 20 分钟就做完了。它报出来的其实是一个 2022 年的人类工程师需要的时间，而不是它自己需要的时间。

这个问题已经有人专门讨论过。KTH 做软件工程的教授 Martin Monperrus 今年 9 月写过一篇博客[^1]，把它叫做 anthropocentric time bias，也就是以人类为中心的时间偏差。他认为（我也非常同意）原因主要有两个：

- **训练数据**：博客、sprint 估算、2022 年以前的 GitHub，记录的基本都是人类的产出速度，所以模型学到的工作量和时间之间的换算，只有人类这一种。
- **没有时钟**：模型知道"写一个 API 大概要几天"，但它感知不到自己其实 90 秒就写完了。

也有一些量化的研究。ICLR 2026 一个 workshop 上的论文《Can LLMs Perceive Time?》[^2]测了 68 个任务，发现模型事前的预估比实际耗时高 4–7 倍，放到多步的 agent 场景里是 5–10 倍。LessWrong 上 8 月有一篇文章《Your Agents Are Not Time Aware》[^3]，作者用 Claude Code 和 Codex 跑了几百个任务，发现不管任务实际要多久，agent 的预测都喜欢落在一个半小时左右。

> Claude 团队意识到过这个问题：
>
> Claude Code 的 system prompt 里曾经有过一条规则：不要说"这要 2–3 周"或者"可以以后再做"。从 npm 上的历史可以查到，这一节是 2025 年 11 月的 2.0.43 加进去的，2026 年 1 月的 2.1.9 又删掉了[^4]。具体原因未知。不过，很明显，这条规则本质上只是“不让 Claude 说”，但没办法改变其内部的“思考”方式。

Claude Code 的 GitHub issue 区里有人也发过 issue[^5]：agent 一直用 "not worth the complexity"、"we can do that later" 推掉一些小改动，结果那些改动只有 4 行代码，一催它就做完了。就算不让 Claude 说时间，它其实还是按三天在算，只是说出来的话变成了"不值得"、"之后再做"或者 "out of scope"。

## 2. Agent 自动记忆 deadline

第二个更隐蔽一些，和 Claude Code 的 auto memory 有关。

Claude Code 会自己往 memory 里写东西。官方文档[^6]里说它只存四类信息：user（你是谁、你的工作习惯）、feedback（你纠正过它什么）、project（项目的进展）和 reference（外部资料在哪）。其中 project 这一类写的是 "ongoing work, deadlines, and decisions"，也就是正在做的事、deadline 和做过的决定，前提是这些从代码和 git 历史里看不出来。

我又去 Claude Code 的安装包里翻了这部分的 prompt[^7]，写得更具体。什么时候存 project memory？"When you learn who is doing what, why, or by when"，也就是谁在做什么、为什么做、什么时候之前要做完；而且要把 "Thursday" 这种相对日期换成具体日期再存。每条 memory 后面还要写一行 How to apply，说明这条信息应该怎么影响它之后的建议。prompt 里给的例子是：用户说周四之后冻结非关键的 merge，agent 就存一条"2026-03-05 起冻结 merge，之后排的非关键 PR 要提醒用户"。

所以它确实很关注 deadline，而且是被明确要求拿 deadline 去影响建议的。这个设计本身是合理的，但它和第一个 bias 叠在一起，就可能形成一条逻辑链：比如 memory 里写着三天之后 launch，这时候我想做某个 feature，问 agent 推荐哪个 impl 方案，它有时候会：

1. 推荐给我简单的临时方案
2. 由于“马上”要 launch 了，所以建议先不做

再加上 LLM 本来就倾向于推荐保守的方案[^8][^9]，agent 就更容易停下来，或者达不到我们期待的效率。

### 话又说回来

当然，其实换到一个大公司里，这个 Agent 的行为可能更容易被接受的。但 startup 里，或者我们自己写 project 的时候，这种表现就很难接受了。很多时候，改动的成本就是一个二十分钟的 session，出了问题回滚也很快，没有理由因为日期近了就不做。

所以从这个角度想，可能有两个方向：一是干脆不让 agent 记下 deadline 这类信息，至少不让它主动拿来影响建议；二是让 agent 理解更多的背景，比如告诉它我们正在 startup 里工作，或者只是在 hacking 一个项目，让它自己判断 deadline 在这里意味着什么。

这是个挺有意思的、辩证的问题：我们可以往两个截然不同的方向去尝试调整 Agent 的表现行为。

## TODO

- 在干净的环境里复现
- 测试怎么调整这个行为



[^1]: Martin Monperrus（KTH 皇家理工学院软件工程教授）、Evita Stenqvist，[Coding Agents Have Completely Wrong Sense of Time](https://www.monperrus.net/martin/coding-agents-sense-of-time)，博客，2026 年 9 月
[^2]: Aniketh Garikaparthi，[Can LLMs Perceive Time? An Empirical Investigation](https://arxiv.org/abs/2604.00010)，ICLR 2026 workshop
[^3]: Michael Ofengenden、Maksym Andriushchenko，[Your Agents Are Not Time Aware](https://www.lesswrong.com/posts/eAbuPXbjakop5rSJx/your-agents-are-not-time-aware)，LessWrong，2026 年 8 月
[^4]: npm 包 `@anthropic-ai/claude-code` 2.0.43（2025-11-17）到 2.1.8（2026-01-15）的 `cli.js`，"Planning without timelines" 一节
[^5]: anthropics/claude-code issue [#20270](https://github.com/anthropics/claude-code/issues/20270)："No time estimates" rule might be making Claude Code lazy，2026 年 1 月
[^6]: Anthropic，Claude Code 官方文档 [How Claude remembers your project](https://code.claude.com/docs/en/memory)，"Auto memory" 一节
[^7]: Claude Code 2.1.220 安装包里 auto memory 的 prompt，project 类型的定义
[^8]: anthropics/claude-code issue [#96621](https://github.com/anthropics/claude-code/issues/96621)：defaults to recommending the narrowest/cheapest option on scope decisions，2026 年 9 月
[^9]: anthropics/claude-code issue [#31815](https://github.com/anthropics/claude-code/issues/31815)：Claude defaults to 'defer' instead of 'try'，2026 年 3 月
