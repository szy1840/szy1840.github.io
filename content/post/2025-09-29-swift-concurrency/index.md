+++
date = '2025-09-29T11:22:13-04:00'
draft = false
title = 'Swift 并发入门：Task、Actor、Async/Await 与线程模型'
tags = ['swift', 'concurrency', 'ios']
ShowToc = true
+++

# Swift 并发入门：Task、Actor、Async/Await 与线程模型

Swift 并发编程是 iOS 15+ 引入的现代异步编程范式，通过 Task、Actor 和 async/await 语法提供了更安全、更易用的并发解决方案。

## Swift 并发方案演进

Swift 的并发编程经历了三个主要阶段：

### GCD（Grand Central Dispatch）

GCD 是苹果最早提供的并发解决方案，基于队列管理任务执行：

```swift
DispatchQueue.global().async {
    print("在后台线程执行")
}

DispatchQueue.main.async {
    print("回到主线程更新UI")
}
```

### Operation / OperationQueue

Operation 提供了比 GCD 更面向对象的并发管理，支持任务取消、依赖关系和复用：

```swift
let queue = OperationQueue()
queue.addOperation {
    print("任务1")
}
```

### Swift Concurrency（推荐）

Swift Concurrency 是苹果在 iOS 15+ 推荐的新方案，通过 async/await 语法避免回调地狱：

```swift
func fetchData() async -> String {
    return "结果"
}

Task {
    let data = await fetchData()
    print(data)
}
```

## 核心概念和执行模型

Swift 并发编程基于三个核心概念：Task、async/await 和 Actor。与传统的线程模型不同，Swift 并发采用任务级别的调度，线程作为底层实现细节被抽象化。

### 核心概念

**Task**：表示一个并发执行的工作单元，相当于在 Java 里的 Runnable 或 Callable。

**async/await**：标记异步函数的关键字，允许函数在等待结果时挂起而不阻塞线程。

**Actor**：提供一个串行化的执行上下文，确保其内部状态不会被多个任务同时访问，实现并发安全。

### 执行模型

Swift 并发执行模型特点：

- **任务级调度**：Swift 的 async/await 基于任务级别调度，线程是底层实现细节
- **协作式调度**：当遇到 await 时，任务会主动挂起，让出线程给其他任务
- **系统线程池**：使用系统管理的线程池，而非为每个任务创建新线程

### 协作式调度机制

```swift
func fetchData() async -> String {
    // 模拟网络请求
    try? await Task.sleep(nanoseconds: 2_000_000_000) // 2秒
    return "数据"
}

Task {
    print("开始请求")
    let result = await fetchData()
    print("拿到结果: \(result)")
}
```

执行流程：
1. Task 开始执行
2. 遇到 await fetchData()，Task 挂起
3. 系统线程可以去执行其他 Task
4. 2秒后 fetchData 完成，Task 被唤醒继续执行

## Task

Task 是 Swift 并发编程的基础工作单元，可以在任何地方创建：全局作用域，函数内部，Actor 内部。Task 的主要作用是启动异步执行，可以包含 await 调用：

```swift
// 在函数中创建 Task
func performAsyncWork() {
    Task {
        let result = await fetchData()
        print("结果: \(result)")
    }
}
```

对比：
- Thread：操作系统级的执行上下文，重量级。
- Actor：隔离状态的执行上下文，保证串行访问。
- Task：异步的执行上下文，轻量级，由 Swift runtime 管理。

Task 会默认继承当前的执行上下文/调用环境。

### Task 取消
`cancel()` 只是向任务发送取消信号，任务必须主动调用 Task.`checkCancellation()` 或其他抛出 `CancellationError` 的操作（比如 `Task.sleep()`）来响应取消。

如果想在外部获取任务结果，需要用 `try await task.value`，此时如果任务被取消，会抛出 `CancellationError`。

```swift
let task = Task {
    for i in 1...5 {
        try Task.checkCancellation() // 检查是否被取消
        print("执行第 \(i) 步")
        try await Task.sleep(nanoseconds: 1_000_000_000)
    }
    return "完成"
}

// 取消任务
task.cancel()
```

### TaskGroup
TaskGroup（并发任务组），当需要同时执行多个异步任务并等待它们完成时使用：

```swift
func fetchAllData() async -> [String] {
    await withTaskGroup(of: String.self) { group -> [String] in
        group.addTask { await fetchData(id: 1) }
        group.addTask { await fetchData(id: 2) }
        var results = [String]()
        for await result in group {
            results.append(result)
        }
        return results
    }
}
```

上面这种写法是按照返回结果的顺序收集的数据，如果想要保持这种id顺序，可以写：

```swift
func fetchAllData() async -> [String] {
    async let data1 = fetchData(id: 1)
    async let data2 = fetchData(id: 2)
    return await [data1, data2]
}
```

## Actor

Actor 是 Swift 并发编程中实现线程安全的核心机制。每个 Actor 都有独立的执行上下文，确保其内部状态不会被多个任务同时访问。

```swift
actor Counter {
    private var value = 0

    func increment() async {
        value += 1
    }

    func getValue() async -> Int {
        return value
    }
}
```

### Actor 原理

Actor 通过以下机制保证线程安全：

- 每个 Actor 都有独立的执行上下文（Executor）
- 所有对 Actor 内部状态的访问都通过串行队列执行
- 外部访问 Actor 必须使用 await 关键字

Actor 本质上是一个隐式的串行执行器（Serial Executor）。每个 Actor 在创建时，Swift 运行时会为其分配一个执行器，该执行器内部维护一个任务队列，确保任务按顺序执行。

### 执行流程分析

```swift
actor Counter {
    var value = 0
    func increment() { value += 1 } // 注意这里，并不一定要加 async
}

// 外部调用
Task {
    await counter.increment()       // 但必须加 await
}
```

执行流程：

1. 编译器识别 `await counter.increment()` 为跨 Actor 调用
2. 将调用包装成 continuation，放入 Counter 的任务队列
3. 如果 Counter 当前无任务执行，立即执行；否则等待前一个任务完成
4. 运行 increment()，修改 value，返回结果

这里的 Continuation 是 Swift 并发运行时在遇到 `await` 时生成的对象，表示“从挂起点恢复执行所需的一切信息”，包括：
- 程序状态（局部变量、栈帧）
- 挂起点之后需要继续执行的代码
- 调度上下文（任务、执行器/actor）
- 恢复接口（`resume(...)` 方法）


### Actor 访问规则

**内部访问**：在 Actor 内部可以直接访问其状态，无需 await，因为说明已经拿到执行权

**外部访问**：必须使用 await 关键字，因为需要等待 Actor 的串行访问权，即使方法本身是同步的。

所以，在 Actor 上下文中，await 并非等待异步操作完成，而是等待 Actor 的串行访问权。这确保了 Actor 内部状态的线程安全访问。这也是为什么 `increment()` 本身是同步的，但外部访问必须加 await。






### 示例探讨
稍微更复杂一点的例子：

```swift
actor Counter {
    var value = 0

    func incrementWithTask() {
        Task {
            await self.increment()  // 内部调用需要 await
        }
    }

    func increment() async {
        value += 1
    }
}
```

分析：

- `incrementWithTask()` 是同步方法，并且没有修改Actor内部状态，因此调用时不需要 await
- 内部创建 Task 来执行异步逻辑
- 调用方立即返回，异步逻辑在后台执行

相同地，这种情况调用 `incrementWithTask()` 也无需 await：

```swift
func incrementWithTask() {
    print("before task")      // 同步执行
    Task {
        await self.increment()  // 异步执行
    }
    print("after task")       // 同步执行，立即返回
}
```

但是，这种情况就需要：

```swift
func incrementWithTask() {
    print(value)   // 编译错误！
    Task {
        await self.increment()
    }
}
```

**错误原因**：`value` 是 Actor 的隔离状态，在 Task 外部无法直接访问。只有通过 await 调用或 Task 内部才能访问 Actor 的隔离状态。

### Actor 并发机制总结

Swift 的 Actor 并发机制通过编译器和运行时的协同工作来保证线程安全：

编译器保证：

- 追踪哪些方法访问了 Actor 的隔离状态
- 确保所有对 Actor 内部状态的访问都在异步安全的上下文中执行
- 强制外部访问使用 await 关键字

运行时保证：

- 维护 Actor 的串行执行队列
- 确保访问按顺序执行，实现线程安全
- 管理任务调度和上下文切换





## MainActor 与主线程

`@MainActor` 是 Swift Concurrency 提供的特殊 Actor，确保相关代码在主线程执行。常用场景是 UI 更新和主线程资源访问。

示例：

```swift
@MainActor
func updateUI() {
    // 这里一定在主线程执行
    label.text = "Hello"
}

Task {
    await updateUI() // 编译器确保切换到主线程执行
}
```

注意避免阻塞主线程。错误做法：在主线程执行耗时操作：

```swift
@MainActor
func badExample() {
    Thread.sleep(forTimeInterval: 2) // 阻塞主线程
}

这样写也不行，因为 Task 会默认继承调用环境，即会在主线程运行：
```swift
@MainActor
func badExample2() {
    Task {
        Thread.sleep(forTimeInterval: 2) // 阻塞主线程
    }
}
```

正确做法：使用 Task.detached 在后台线程执行耗时操作：

```swift
@MainActor
func Example() {
    Task.detached {
        // 后台耗时操作
        Thread.sleep(forTimeInterval: 2)
        await MainActor.run {
            // 更新 UI
        }
    }
}
```

