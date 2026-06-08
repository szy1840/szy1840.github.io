---
title: "Building a Side Drawer in SwiftUI: A Three-Layer Structure and the Pitfalls"
lang: en
ref: build-a-side-drawer-in-swift-ui
---

A side drawer is a common mobile interaction pattern — sliding in from the screen edge, or tapping a menu button to reveal a menu or extra features. This note summarizes the design thinking and the pitfalls I hit while building the side drawer on a Profile screen: why a three-layer `ZStack` is needed, and how to avoid the jitter problem.

The target behavior, when the drawer is open:

```text
Visual focus → Drawer (brightest, sharpest)
              ↓ covers
        Scrim (semi-transparent black)
              ↓ dims
        Main content (still visible but defocused)
```

## The Three-Layer ZStack

Layer structure:

```swift
ZStack(alignment: .topLeading) {
    // Layer 1: main content (the Profile content)
    ScrollView {
        // Profile page content
    }

    // Layer 2: semi-transparent scrim (only present while the drawer is shown)
    if isDrawerVisible {
        Color.black.opacity(0.25)
            .ignoresSafeArea()
            .onTapGesture { isDrawerVisible = false }
            .gesture(closeDrawerGesture)
    }

    // Layer 3: drawer (always present, positioned via offset)
    ProfileDrawerView()
        .frame(width: 300)
        .offset(x: isDrawerVisible ? 0 : -320)
        .allowsHitTesting(isDrawerVisible)
}
```

Why three layers? First, layer one — the main content layer — must exist, to show the Profile content itself. Layer three — the drawer layer — must also exist, to show the drawer content (account info, menu, and so on). The key insight is that we also need a semi-transparent scrim layer in between.

Also note that layer three uses an `offset` animation rather than conditional rendering (`if isDrawerVisible`), which performs better. Interactivity is controlled with `.allowsHitTesting(isDrawerVisible)`, so the drawer doesn't intercept events while hidden. Conceptually, the drawer is not two different views for the shown/hidden states — it always lives in the view hierarchy, and only its visibility is controlled by offset and its interactivity by hit-testing.

### Designing the Scrim

The scrim plays several roles at once:

**Interaction interception + custom response**
- Provides a full-screen tappable area
- Tap anywhere to close the drawer
- Prevents touches from passing through to layer one (e.g. accidentally hitting buttons in the main content)
- Once it intercepts input, it can respond to taps/swipes to close the drawer

**Visual guidance**
- The semi-transparent black (opacity 0.25) dims the main content
- The user's attention naturally settles on the drawer

The scrim clearly has to sit in the middle, because:

- Above the main content: so it can intercept the main content's interactions
- Below the drawer: the drawer's own buttons (menu, etc.) must stay tappable and not be intercepted by the scrim

### Why the Built-in Alternatives Fall Short

Using `.sheet()` or `.fullScreenCover()`:

```swift
.sheet(isPresented: $showDrawer) {
    DrawerView()
}
```

A sheet can only present from the bottom, which doesn't match a drawer sliding in from the left; you also can't customize the animation direction, and it fully covers the main content.

> Why doesn't Apple ship a left/right drawer? Because the official iOS navigation paradigm is TabBar + NavigationStack, whereas a drawer is closer to Android's Navigation Drawer pattern.

## A Pitfall: Structural Stability

While building this, a persistent problem was that the instant the drawer opened, the whole Profile page jumped slightly downward.

First, ruling things out: the latter two layers in the `ZStack` are just overlays and don't affect the layout of layer one's `ScrollView`. In particular, the drawer layer uses `offset`, so showing/hiding it doesn't affect layout — only its rendered position — and therefore doesn't trigger a recalculation. These two layers cannot cause the page jump.

The problem was in the NavigationBar's toolbar code. The menu button isn't inside the `ScrollView` — it lives in the NavigationBar:

```swift
// Wrong
ToolbarItem(placement: .navigationBarLeading) {
    if !isDrawerVisible {
        Button(action: { isDrawerVisible = true }) {
            Image(systemName: "line.3.horizontal")
        }
    }
}
```

When `isDrawerVisible` becomes `true`, this button is removed from the view hierarchy. In SwiftUI that isn't merely showing/hiding a button — the *structure* of the entire toolbar changes, which triggers a layout pass and makes the whole page jump.

So the fix is to not let the button disappear, but keep it present — just transparent and disabled:

```swift
// Correct
ToolbarItem(placement: .navigationBarLeading) {
    Button(action: { isDrawerVisible = true }) {
        Image(systemName: "line.3.horizontal")
            .foregroundColor(isDrawerVisible ? .clear : .primary)
    }
    .disabled(isDrawerVisible)
}
```

Now the view structure doesn't change — only the button's visual style and interaction state do — so no layout recalculation is triggered.

In short: in SwiftUI, whenever the view hierarchy changes, the layout system recomputes the safe area, navigation bar height, transition baselines, and so on — an expensive relayout. Using `if` conditional rendering changes the view tree directly and triggers that recomputation. So when you only want to change visual or interaction state, prefer:

- `.opacity()` / `.foregroundColor(.clear)`
- `.disabled()`
- `.hidden()`

to preserve **structural stability**.
