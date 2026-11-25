---
title: "Chinese Input for ESP32 iPhone Agent: A Keyboard with No Keys"
lang: en
ref: esp32-iphone-agent-keyboard
---

I had the idea of letting a model operate a real iPhone about a month ago, and then found a project that was almost exactly what I had in mind: [ESP32 iPhone Agent](https://github.com/onehumanbeing/esp32-iphone-agent)[^1]. It works like this: the phone mirrors its screen to a small ESP32-S3 board, an iOS app reads the picture and asks a vision model what to do next, and the board then acts on the phone as a mouse and keyboard.

The idea works, but I think speed is the bottleneck, and right now the usability is too poor. I tried a few things, and one important direction is making Chinese input faster, which is what this note is about: a keyboard with no keys for the agent, so it can put a whole text straight into the input field. I'll write up the agent-side optimizations later.

## The cost of typing Chinese key by key

To the phone, the board is a hardware keyboard, and all it can do is send keys. English is fine: one letter, one key. Chinese has to go through an input method: type the Pinyin, wait for the candidates, pick one so it is committed, then check that what was committed is the text you wanted. This comes with typing Chinese on the system keyboard at all, and has nothing to do with which input method the phone is set to. It is the same with the default full Pinyin.

Upstream's `HanTyper` does exactly this. It types toneless full Pinyin. It first tries to type the whole sentence in one go and reads the screen once to check. The top candidate for a whole sentence is often not the sentence you wanted, and in that case it deletes it and types word by word, reading the screen every few words. The cost comes from two places:

- **Keys**: my test sentence is 17 characters, which is more than forty keys of Pinyin. The log has two inputs that only sent keys, with no read-back, and they took 4.0 and 4.6 seconds.
- **Reading back**: one screen read takes 1 to 2 seconds. When typing word by word, each word takes about 0.3 seconds, and the screen is read at least once every four words.

So even when everything goes well, one sentence takes several seconds, and longer sentences take longer. The clipboard is no help here either: the agent's app is in the background while a task runs, and iOS refuses clipboard writes from a background app.

## An extra problem when the input method is different

All of the above assumes the input method is the one the app expects. My test phone is an iPhone 17 on iOS 26.6, with the Chinese keyboard set to Xiaohe Shuangpin, and that adds another layer.

The task was "open Notes, create a new note, and type: 今天天气不错，我们下午去公园散步吧" (roughly "The weather is nice today, let's take a walk in the park this afternoon"). One full attempt took about 22 seconds, and this is what came out:

<figure style="margin: 1.6em 0;">
  <img src="typing-before.jpg" alt="The text in Notes after typing: 集虐差虐差集虐差呢提案起不粗哦,我么呢洗啊呜去过能预案撒您是吧" width="600" height="393" style="max-width: 100%; height: auto;">
  <figcaption style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--muted);">Full Pinyin typed into a Shuangpin keyboard (screenshot cropped to the top half)</figcaption>
</figure>

The reason is simple. In Shuangpin, every syllable is two keys. In full Pinyin, tianqi (天气) is six keys. The Shuangpin keyboard cuts them into three syllables, ti, an and qi, and out comes "提案起". bucuo (不错) becomes "不粗哦", and women (我们) becomes "我么呢". Of the nine words in the sentence, only "去" and "吧" came out right, because qu and ba are two keys each to begin with.

Worse, the app did not notice. The log records this step as "typed and read back". The log also shows why: when `HanTyper` cannot read a word back, it treats the word as committed as long as its Pinyin letters are gone from the field ("not read back, but its pinyin is gone; taken as committed"). With Shuangpin the Pinyin letters were indeed gone. They had just turned into other characters.

The model saw in the screenshot that the text was wrong, cleared it and typed again. It retyped seven times with the same result every time, and after a bit more than five minutes I stopped the run by hand.

I would not call this an upstream bug: `HanTyper` assumes a full Pinyin keyboard, and my phone is set to Shuangpin. But users' input method settings differ anyway, and an app can hardly support every one of them. As long as text is put together through an input method, every extra configuration is one more way to go wrong, and you often only find out after the first attempt has failed, and then spend time retyping.

## The fix: a keyboard with no keys

Both problems come from the same place: all the agent wants is to put this text into the field, but all it has are keys, so it can only get there indirectly, through the input method. The better way is to skip the input method and insert the text directly. The proper way on iOS to insert text into another app's field is a keyboard extension: `textDocumentProxy.insertText` on `UIInputViewController`.

I added a keyboard extension to the app, AgentKeyboard. It has no keys. Its UI is one line of status text and a globe key. The text is fed to it by the agent's app over a socket inside the phone:

- **The app** listens for TCP on the loopback address (127.0.0.1), port 47613. The protocol is one JSON object per line.
- **The keyboard** connects when it starts and sends a heartbeat once a second. The app treats the keyboard as available only if it has heard a heartbeat in the last 2.5 seconds.
- **Typing**: the app sends an Insert with an id, the keyboard calls `insertText` once to put the whole text into the current field, and answers with that id.

The whole protocol is two structs:

```swift
/// App → keyboard: insert `text` at the cursor.
struct Insert: Codable {
    var id: Int
    var text: String
}

/// Keyboard → app. With nothing set it is the once-a-second heartbeat; with `done` it answers
/// one Insert, and `ok` false means there was no field to insert into.
struct Note: Codable {
    var done: Int?
    var ok: Bool?
}
```

On the keyboard side, only one line does the real work:

```swift
func insert(_ text: String) -> Bool {
    guard isViewLoaded else { return false }
    textDocumentProxy.insertText(text)
    return true
}
```

So there are no keys to send, no candidates to wait for and no word-by-word reading back, and it no longer matters whether the phone is set to full Pinyin or Shuangpin.

**Why a socket and not an App Group**: an app and its keyboard extension would normally talk through an App Group, but that needs a paid developer team, and I sign with a free personal team. A loopback socket only needs the keyboard to have "Allow Full Access" turned on. According to Apple's documentation, a keyboard extension has no network access by default and cannot share a container with its containing app, and it gets both only with Full Access[^2]. This choice has a price: other apps on the phone can connect to a loopback port too, so secrets such as passwords should not be typed this way.

**When the keyboard is not there**: with no heartbeat, typing falls back to the board sending keys, as before.

**When the text was sent but no answer came back**: the app waits 1.5 seconds, then reports the result as unconfirmed and tells the model to look at the field first: continue if the text is there, and retype only if it is not. That way the same text is not blindly typed twice.

## An extra benefit and its cost

The benefit is that switching input methods is no longer a concern. When typing key by key, the app first has to work out whether the current keyboard is the Chinese one or the English one, and send Ctrl+Space to switch if it is the wrong one. English typed into a Pinyin keyboard comes out as uncommitted Pinyin. In a sentence that mixes Chinese and English, the first Chinese word after the English part needs another screen read to confirm the keyboard has not changed. Now `type` does not look at what language the text is in. It tries AgentKeyboard first, and English, mixed text and emoji all go through the same single `insertText`. On the key path, emoji were simply dropped.

To be clear about what was actually tested: English was tested on the device, with one 55-character sentence. Mixed Chinese and English was tested only on the simulator: 74 characters (Chinese plus a link), with the app in the background inserting into another app's field, took 57 ms. Emoji were not tested.

The cost is that the field's keyboard has to be switched to AgentKeyboard first. On the device this took 9.1 seconds, but it only has to happen once: iOS remembers the last keyboard used, unless someone switches away by hand. How to switch is the first pitfall below.

## Pitfalls along the way

### 1. There is no way to switch straight to a given keyboard

This was the hardest part. With the keyboard installed and Full Access on, it still has to become the keyboard the field is currently using. Ctrl+Space from the board, or a tap on the globe key, only goes back and forth between the two most recently used system keyboards (English and Shuangpin on my phone) and never reaches a third-party keyboard. The keyboard extension cannot do it either: Apple's documentation says there is no API for picking a particular keyboard to switch to[^2].

What works is what people do: long-press the globe key, wait for the menu, and tap the keyboard's name. The app now does this itself:

1. Use OCR to find the "123" key on screen; the globe key is right below it
2. Move the pointer there, hold for one second, then release
3. Read the screen again, find the "ESP32 Agent" row in the menu, and tap it

<div style="display: flex; gap: 1rem; align-items: flex-start; margin: 1.6em 0;">
  <figure style="margin: 0; flex: 1; min-width: 0;">
    <img src="keyboard-menu.jpg" alt="The keyboard menu shown after long-pressing the globe key, listing English (US), Emoji, 简体双拼 (Shuangpin) and ESP32 Agent" width="540" height="1173" style="width: 100%; height: auto;">
    <figcaption style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--muted);">The menu after long-pressing the globe key</figcaption>
  </figure>
  <figure style="margin: 0; flex: 1; min-width: 0;">
    <img src="keyboard-active.jpg" alt="AgentKeyboard as the current keyboard: no keys, only a line of status text and the globe key" width="540" height="1173" style="width: 100%; height: auto;">
    <figcaption style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--muted);">After picking it: a keyboard with no keys, connected to the app</figcaption>
  </figure>
</div>

There is one more small catch here: the phone's OCR read "ESP32" and "Agent" as two separate words, so looking for the name directly finds nothing. Adjacent words on the same row have to be joined before matching.

If the keyboard cannot be picked in the menu, the rest of that run's typing goes through the board's keys, and it does not try again.

### 2. Turning on Full Access restarts the app

When you turn on Full Access for the keyboard in Settings, iOS kills the containing app and starts it again. It is a one-time setting, but do it when no task is running.

### 3. Buttons in system alerts need two clicks

On this phone, buttons in system alerts ignore the pointer's first click and only respond to the second. The current handling: if the screen has not changed after a retried click, click once more in the same place.

## Results

Same task, same sentence, and this time the text in the field is right:

<figure style="margin: 1.6em 0;">
  <img src="typing-after.jpg" alt="The text in Notes: 今天天气不错，我们下午去公园散步吧" width="600" height="393" style="max-width: 100%; height: auto;">
  <figcaption style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--muted);">Inserted as a whole through AgentKeyboard</figcaption>
</figure>

| | Before: board keys (Shuangpin keyboard) | After: AgentKeyboard |
| --- | --- | --- |
| Typing these 17 characters | About 22 s per attempt, wrong text | 0.04 s, correct text |
| The whole task (open Notes, new note, type) | Retyped seven times, stopped by hand after more than 5 minutes | 37 s the first time, 28.1 s in a later run |
| One-off cost | None | Switching to AgentKeyboard, 9.1 s |

The typing step saves about 22 seconds per attempt. More importantly, the text used to come out wrong, and the task could not finish at all. Of the 37 seconds in the first run, about 16 went to clearing the wrong text that the earlier run had left in the note. The 28.1-second run did not have that step.

If the phone were set to full Pinyin, typing key by key should come out right. I have not tested that on this phone, so I have no direct comparison. Going by the costs above, this sentence needs more than 4 seconds for the keys alone, plus at least one read of 1 to 2 seconds, against 0.04 seconds now.

With typing down to 0.04 seconds, nearly all the remaining time in the task goes to model calls (about 4 to 8 seconds each in these two runs), and it has little to do with typing anymore.

## Limits

- **Small sample**: tested on one phone only (iPhone 17, iOS 26.6), with one Chinese sentence and one English sentence, both in Notes.
- **Bluetooth input mode only**: the change was not tested with the board on USB input.
- **Needs Full Access**, and as said above, other apps can connect to the loopback port, so it is not suitable for secrets.
- **It gets in the way of a person typing**: while AgentKeyboard is the current keyboard, a person who taps a field sees an empty keyboard and has to tap the globe key to get back to their own.
- **Password fields not tested**: according to Apple's documentation, third-party keyboards cannot be used in secure text fields, where the system temporarily swaps in the system keyboard. Phone pad fields are out too, and an app can refuse third-party keyboards altogether[^2]. I have not tested whether the app correctly falls back to keys in these cases.
- **Not tested in chat apps**: I have not tried it in the input fields of apps like WeChat.

The upstream project did not have this as of commit 9b1d512, and as far as I know nobody had it working on this project before. I have not surveyed whether other projects do something similar.

[^1]: Henry Yuan, [ESP32 iPhone Agent](https://github.com/onehumanbeing/esp32-iphone-agent), MIT License
[^2]: Apple, App Extension Programming Guide, the [Custom Keyboard](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/CustomKeyboard.html) chapter. The document was last updated in 2017, and I have not verified each of its statements on iOS 26
