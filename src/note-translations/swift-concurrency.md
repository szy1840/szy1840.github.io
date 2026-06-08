---
title: "Getting Started with Swift Concurrency: Task, Actor, Async/Await, and the Threading Model"
lang: en
ref: swift-concurrency
---

Swift concurrency is the modern asynchronous programming model introduced in iOS 15+. Through Task, Actor, and the async/await syntax, it offers a safer and more ergonomic approach to concurrency.

## The Evolution of Swift's Concurrency Approaches

Swift's concurrency story has gone through three main stages.

### GCD (Grand Central Dispatch)

GCD was Apple's earliest concurrency solution, managing task execution via queues:

```swift
DispatchQueue.global().async {
    print("Running on a background thread")
}

DispatchQueue.main.async {
    print("Back on the main thread to update the UI")
}
```

### Operation / OperationQueue

`Operation` provides a more object-oriented form of concurrency than GCD, supporting cancellation, dependencies, and reuse:

```swift
let queue = OperationQueue()
queue.addOperation {
    print("Task 1")
}
```

### Swift Concurrency (Recommended)

Swift Concurrency is the new approach Apple recommends on iOS 15+. Its async/await syntax avoids callback hell:

```swift
func fetchData() async -> String {
    return "result"
}

Task {
    let data = await fetchData()
    print(data)
}
```

## Core Concepts and the Execution Model

Swift concurrency rests on three core concepts: Task, async/await, and Actor. Unlike the traditional threading model, Swift concurrency schedules at the level of *tasks*, with threads abstracted away as an implementation detail.

### Core Concepts

**Task**: a unit of concurrent work — analogous to a `Runnable` or `Callable` in Java.

**async/await**: keywords that mark asynchronous functions, letting a function suspend while waiting for a result instead of blocking a thread.

**Actor**: provides a serialized execution context, ensuring its internal state can't be accessed by multiple tasks at once — giving you concurrency safety.

### The Execution Model

Characteristics of Swift's concurrency execution model:

- **Task-level scheduling**: async/await schedules at the task level; threads are an implementation detail.
- **Cooperative scheduling**: when a task hits `await`, it voluntarily suspends and yields its thread to other tasks.
- **A system-managed thread pool**: rather than spawning a new thread per task, it uses a thread pool managed by the system.

### The Cooperative Scheduling Mechanism

```swift
func fetchData() async -> String {
    // Simulate a network request
    try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
    return "data"
}

Task {
    print("Starting the request")
    let result = await fetchData()
    print("Got result: \(result)")
}
```

Execution flow:

1. The Task begins executing.
2. It hits `await fetchData()` and suspends.
3. The system thread is free to run other Tasks.
4. After 2 seconds `fetchData` completes, and the Task is resumed.

## Task

A Task is the fundamental unit of work in Swift concurrency, and can be created almost anywhere: at global scope, inside a function, or inside an Actor. Its main job is to start asynchronous execution and it may contain `await` calls:

```swift
// Creating a Task inside a function
func performAsyncWork() {
    Task {
        let result = await fetchData()
        print("Result: \(result)")
    }
}
```

A comparison:

- Thread: an OS-level execution context — heavyweight.
- Actor: an execution context that isolates state and guarantees serial access.
- Task: an asynchronous execution context — lightweight, managed by the Swift runtime.

A Task inherits the current execution context / calling environment by default.

### Cancelling a Task

`cancel()` merely *signals* cancellation to the task; the task itself must actively call `Task.checkCancellation()` (or some other operation that throws `CancellationError`, such as `Task.sleep()`) to respond to it.

If you want the result from outside, use `try await task.value` — if the task was cancelled, this throws `CancellationError`.

```swift
let task = Task {
    for i in 1...5 {
        try Task.checkCancellation() // Check whether we've been cancelled
        print("Executing step \(i)")
        try await Task.sleep(nanoseconds: 1_000_000_000)
    }
    return "done"
}

// Cancel the task
task.cancel()
```

### TaskGroup

Use a `TaskGroup` (a concurrent group of tasks) when you need to run several async tasks at once and wait for them all to finish:

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

The code above collects results in the order they *return*. If you want to preserve the original `id` order instead, write:

```swift
func fetchAllData() async -> [String] {
    async let data1 = fetchData(id: 1)
    async let data2 = fetchData(id: 2)
    return await [data1, data2]
}
```

## Actor

The Actor is the core mechanism for thread safety in Swift concurrency. Each Actor has its own execution context, ensuring its internal state can't be accessed by multiple tasks simultaneously.

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

### How an Actor Works

An Actor guarantees thread safety through these mechanisms:

- Each Actor has its own execution context (an Executor).
- All access to the Actor's internal state runs through a serial queue.
- External access to the Actor must use `await`.

An Actor is essentially an implicit serial executor. When an Actor is created, the Swift runtime assigns it an executor that maintains an internal task queue, ensuring tasks run in order.

### Tracing the Execution Flow

```swift
actor Counter {
    var value = 0
    func increment() { value += 1 } // Note: async is not necessarily required here
}

// Calling from outside
Task {
    await counter.increment()       // ...but await is required
}
```

Execution flow:

1. The compiler recognizes `await counter.increment()` as a cross-Actor call.
2. It wraps the call into a continuation and places it on Counter's task queue.
3. If Counter is currently idle, it runs immediately; otherwise it waits for the previous task to finish.
4. `increment()` runs, modifies `value`, and returns the result.

A *continuation* is the object the Swift concurrency runtime creates when it encounters `await`. It represents "everything needed to resume execution from the suspension point", including:

- Program state (local variables, the stack frame)
- The code that should continue running after the suspension point
- The scheduling context (the task, the executor/actor)
- The resume interface (the `resume(...)` method)

### Actor Access Rules

**Internal access**: inside the Actor you can access its state directly, without `await`, because you already hold the execution right.

**External access**: must use `await`, because you need to wait for the Actor's serial access right — even if the method itself is synchronous.

So within an Actor context, `await` doesn't mean "wait for an async operation to finish" — it means "wait for the Actor's serial access right." This is what guarantees thread-safe access to the Actor's internal state, and it's also why `increment()` itself is synchronous yet external access must still use `await`.

### A Closer Look at Some Examples

A slightly more involved example:

```swift
actor Counter {
    var value = 0

    func incrementWithTask() {
        Task {
            await self.increment()  // The internal call still needs await
        }
    }

    func increment() async {
        value += 1
    }
}
```

Analysis:

- `incrementWithTask()` is a synchronous method that doesn't touch the Actor's internal state, so calling it doesn't require `await`.
- It spins up a Task internally to run the async logic.
- The caller returns immediately; the async work runs in the background.

Likewise, calling `incrementWithTask()` here needs no `await`:

```swift
func incrementWithTask() {
    print("before task")      // Runs synchronously
    Task {
        await self.increment()  // Runs asynchronously
    }
    print("after task")       // Synchronous, returns immediately
}
```

But this version *does* require it:

```swift
func incrementWithTask() {
    print(value)   // Compile error!
    Task {
        await self.increment()
    }
}
```

**Why the error**: `value` is the Actor's isolated state and can't be accessed directly from outside a Task. You can only reach an Actor's isolated state via an `await` call or from inside a Task.

### Summary of the Actor Concurrency Mechanism

Swift's Actor mechanism guarantees thread safety through cooperation between the compiler and the runtime.

The compiler guarantees:

- Tracking which methods access the Actor's isolated state
- Ensuring all access to the Actor's internal state happens in an async-safe context
- Forcing external access to use `await`

The runtime guarantees:

- Maintaining the Actor's serial execution queue
- Ensuring access runs in order, achieving thread safety
- Managing task scheduling and context switching

## MainActor and the Main Thread

`@MainActor` is a special Actor provided by Swift Concurrency that ensures the associated code runs on the main thread. The common use cases are UI updates and accessing main-thread resources.

Example:

```swift
@MainActor
func updateUI() {
    // This always runs on the main thread
    label.text = "Hello"
}

Task {
    await updateUI() // The compiler ensures we switch to the main thread
}
```

Be careful not to block the main thread. A bad approach — doing expensive work on the main thread:

```swift
@MainActor
func badExample() {
    Thread.sleep(forTimeInterval: 2) // Blocks the main thread
}
```

This is also wrong, because a Task inherits the calling environment by default and will therefore run on the main thread:

```swift
@MainActor
func badExample2() {
    Task {
        Thread.sleep(forTimeInterval: 2) // Blocks the main thread
    }
}
```

The right approach: use `Task.detached` to run the expensive work on a background thread:

```swift
@MainActor
func Example() {
    Task.detached {
        // Expensive background work
        Thread.sleep(forTimeInterval: 2)
        await MainActor.run {
            // Update the UI
        }
    }
}
```
