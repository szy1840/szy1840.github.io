+++
date = '2025-10-28T10:00:00-04:00'
draft = false
title = 'SwiftUI 侧边栏实现：三层结构和踩坑记录'
tags = ['swift', 'swiftui', 'ios', 'debug']
ShowToc = true
+++

# SwiftUI 侧边栏实现：三层结构和踩坑记录

侧边栏（Side Drawer）是移动端中常见的交互模式，从屏幕边缘滑入/点击菜单按键显示菜单或附加功能。本文总结了我在实现 Profile 页侧边栏时的设计思路和踩过的坑：为什么需要三层 ZStack 结构，以及如何避免抖动问题。

目标效果，侧边栏打开时：
```
视觉焦点 → 侧边栏（最亮、最清晰）
           ↓ 覆盖
        遮罩层（半透明黑色）
           ↓ 变暗
        主内容（仍可见但失焦）
```

## 三层 ZStack 设计

层级结构设计：

```swift
ZStack(alignment: .topLeading) {
    // 第1层：主内容（Profile 内容）
    ScrollView {
        // Profile 页面内容
    }
    
    // 第2层：半透明遮罩层（仅侧边栏显示时出现）
    if isDrawerVisible {
        Color.black.opacity(0.25)
            .ignoresSafeArea()
            .onTapGesture { isDrawerVisible = false }
            .gesture(closeDrawerGesture)
    }
    
    // 第3层：侧边栏（始终存在，通过 offset 控制位置）
    ProfileDrawerView()
        .frame(width: 300)
        .offset(x: isDrawerVisible ? 0 : -320)
        .allowsHitTesting(isDrawerVisible)
}
```

为什么需要三层结构？首先，第一层，即主内容层必然存在，用于显示本身 Profile 的内容；其次，第三层，侧边栏层也必然存在，用于显示侧边栏内容（账号信息、菜单等）。关键在于还需要有一层半透明遮罩层。

另外注意，第三层使用 `offset` 动画而非条件渲染（`if isDrawerVisible`），性能更好。同时，通过 `.allowsHitTesting(isDrawerVisible)` 控制交互性，避免隐藏时拦截事件。从设计思路来讲，Drawer 并不是 显示/隐藏 两种状态下的两个不同视图，它始终存在于视图层级中，只是通过位移控制可见性，通过 hit-testing 控制交互性。

### 遮罩层设计

遮罩层承担多重作用：

**交互拦截 + 自定义响应**
- 提供一个全屏的可点击区域
- 点击任意位置关闭侧边栏
- 防止用户的操作穿透到第一层，比如误触主内容层的按钮或交互元素
- 拦截之后，可以用于响应点击/滑动等手势，实现关闭侧边栏

**视觉引导**
- 通过半透明黑色（opacity 0.25）让主内容变暗
- 用户注意力自然集中到侧边栏


很明显遮罩层必须在中间，因为：

- 在主内容之上：才能拦截主内容的交互事件
- 在侧边栏之下：侧边栏的内的按钮（菜单等）必须可点击，不能被遮罩拦截


### 替代方案局限性

使用 `.sheet()` 或 `.fullScreenCover()`**：

```swift
.sheet(isPresented: $showDrawer) { 
    DrawerView() 
}
```

Sheet 只能从底部弹出，不符合侧边栏从左侧滑入的设计，也无法自定义动画方向，并且会完全遮挡主内容。

> 为什么苹果不提供左/右 Drawer？因为 iOS 官方导航模式是 TabBar + NavigationStack,而 Drawer 是更像 Android Navigation Drawer 的交互范式。


## 踩坑记录：结构稳定性（Structural Stability）

实现时，一直出现的问题是，侧边栏打开的瞬间，整个 Profile 页面会轻微向下跳动。

首先，排除可能：ZStack 内的后两个层只是 overlay（覆盖层），并不影响第一层 ScrollView 的 layout。特别是注意到，侧边栏层是使用 offset 实现的，出现/隐藏不影响布局，只影响渲染位置，因此也不会触发re-calculation。这两层是不可能引发页面跳动的。

问题出在 NavigationBar 的 toolbar 代码。已知菜单按钮不是放在 ScrollView 里，而是放在 NavigationBar 里：

```swift
// 错误写法
ToolbarItem(placement: .navigationBarLeading) {
    if !isDrawerVisible {
        Button(action: { isDrawerVisible = true }) {
            Image(systemName: "line.3.horizontal")
        }
    }
}
```

当 `isDrawerVisible` 变为 `true` 时，这个按钮会从视图层级中移除。SwiftUI 里这不只是一个按钮的显示/隐藏，而是整个 toolbar 的结构发生了变化，于是触发 layout 重排，导致整个页面抖动。

因此，解决方案就是，不让按钮消失，而是让它依然存在，只是透明且禁用：

```swift
// 正确写法
ToolbarItem(placement: .navigationBarLeading) {
    Button(action: { isDrawerVisible = true }) {
        Image(systemName: "line.3.horizontal")
            .foregroundColor(isDrawerVisible ? .clear : .primary)
    }
    .disabled(isDrawerVisible)
}
```

这样视图结构没有变化，只是按钮的视觉样式和交互状态改变了，不会触发重新计算布局。

总结就是，在 SwiftUI 中，只要视图结构（View Hierarchy）发生变化，布局系统就会重新计算 Safe Area、导航栏高度、过渡动画基线等，这属于一次昂贵的重新布局。而使用 if 条件渲染会直接改变视图树，从而触发这种重新计算。因此，当只想改变视觉或交互状态时，应该优先使用：

- `.opacity()` / `.foregroundColor(.clear)`
- `.disabled()`
- `.hidden()`

等，来保持结构稳定性（Structural Stability）。
