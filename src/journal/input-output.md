---
title: "Input 比 Output 更难"
date: 2026-07-02
lang: zh
ref: input-output
---

这个时代，output 比以往任何时候都容易。即使是非 CS 背景的人，也可以轻松 vibe coding；其实不只是写代码，基本任何白领工作都是这样。output 的门槛在快速消失。

output 变得简单，反而让 input 变得更重要，也更难。你需要刻意地相信 input 的意义，并刻意地去保持它。

在这个背景下，我越来越觉得，对一个 engineer 来说，开很多个 sub agent 并不是特别有价值的事情。它本质上只是在尝试提高 output 的 throughput。一方面，context switch 的开销是固定的，开多个 sub agent 会让自己的大脑不停地切换状态，很消耗精力；更重要的是，我认为 focus on 当前的 task，在 agent 工作的时候去做 input——review agent 的修改、审视它设计的架构、学习某个 impl 背后的相关知识、identify 需要更多决策的节点——这些事情，长期来看比提高 output throughput 重要得多。

目前我的 workflow 主要是两个 session：一个负责 impl，一个负责 deep dive。
