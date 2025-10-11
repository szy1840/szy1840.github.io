---
title: "Firebase 入门指南：从零构建现代 Web 与移动后端"
date: 2025-10-11T15:00:00-04:00
draft: false
tags: ["firebase", "baas", "serverless"]
ShowToc: true
---

## Firebase 入门指南：从零构建现代 Web 与移动后端

Firebase 是 Google 提供的BaaS平台，非常适合独立开发者、全栈工程师或小团队快速构建 Web、iOS、Android 应用。它集成了数据库、身份验证、托管、函数、存储等核心能力，让开发者几乎不需要传统后端就能构建完整的应用。

---

### Firebase 的 BaaS 服务

在传统架构中通常需要开发前端后端，其中后端包括：

- 搭建服务器（如 Node.js）
- 管理数据库（MySQL / MongoDB）
- 配置认证、部署、日志、安全规则……

而 Firebase 提供了一整套即开即用的托管服务：

| 功能 | 模块 | 说明 |
|------|------|------|
| 数据库 | Firestore / Realtime Database | 文档型数据库，实时同步 |
| 云函数 | Cloud Functions | 事件驱动的 Serverless 后端逻辑 |
| 认证 | Firebase Auth | 支持邮箱、Google、Apple登录等 |
| 存储 | Firebase Storage | 文件、图片、视频存储 |
| 托管 | Firebase Hosting / App Hosting | 静态站点或 SPA 托管 |
| 分析与通知 | Analytics / FCM | 用户行为分析与推送服务 |

这意味着我们可以用前端（Vue / React / SwiftUI）+ Firebase 直接构建完整产品，无需再自行部署传统后端。

---

### 项目初始化与结构

Firebase 命令行安装和初始化项目：

```bash
npm install -g firebase-tools
firebase login
firebase init
```

初始化时选择所需模块（常用的包括 Hosting、Firestore、Functions）。
项目结构通常如下：

```text
my-app/
 ├─ public/           # 前端构建产物 (Vite / React / Vue build 输出)
 ├─ functions/        # 云函数（Node.js 运行）
├─ firestore.rules    # 数据库访问控制
├─ firebase.json      # 全局配置
└─ .firebaserc        # 项目别名和关联信息
```

### Firestore 数据库与操作

Firestore 是一个文档型数据库，数据以集合（collection）和文档（document）层级组织：

```text
users (collection)
 └── userId (document)
     ├── name: "Alice"
     ├── age: 25
     └── conversations (subcollection)
          └── messageId (document)
```


典型用法（以 Swift 的 Firebase SDK 为例）：

```swift
let db = Firestore.firestore()
try await db.collection("users").document("alice").setData([
    "name": "Alice",
    "age": 25
])

let snapshot = try await db.collection("users").getDocuments()
for doc in snapshot.documents {
    print(doc.data())
}
```


Firestore 的监听机制：

```swift
Firestore.firestore()
    .collection("users")
    .addSnapshotListener { snapshot, _ in
        guard let snapshot else { return }
        // 实时更新用户列表
    }
```


这样可以实时监听并响应数据变更，非常适合比如即时通讯功能的实现。

### 安全规则与权限控制

Firebase 依靠 Firestore Rules 实现细粒度访问控制。
一个最小安全规则示例：

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Cloud Functions

当需要调用外部 API（如 GPT）或进行复杂计算时，可以使用 Cloud Functions：

```ts
import { onRequest } from "firebase-functions/v2/https";
import fetch from "node-fetch";

export const callGPT = onRequest(async (req, res) => {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-4o", messages: req.body.messages }),
  });
  const data = await response.json();
  res.json(data);
});
```


部署这些 Cloud Functions 的命令：

```bash
firebase deploy --only functions
```

可以在 console 看到函数被触发了多少次等统计信息。

另外，Logs Explorer 是 GCP 的日志系统，可以查看 Cloud Functions / Firestore / Hosting 等所有 Firebase 服务的运行日志。

### Firebase Hosting 与前端部署

对于前端项目（例如 Vue + Vite），只需构建并部署：

```bash
npm run build
firebase deploy --only hosting
```

### 总结
Firebase 的核心思维：数据即后端，事件即逻辑，规则即安全。

最后，Firebase 在中国大陆可能存在访问问题，可考虑腾讯云 CloudBase 作为替代方案，对微信登录等相关生态支持也更好。
