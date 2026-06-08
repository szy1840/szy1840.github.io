---
title: "A Firebase Primer: Building a Modern Web & Mobile Backend from Scratch"
lang: en
ref: firebase-intro
---

Firebase is Google's BaaS platform, well suited to indie developers, full-stack engineers, and small teams who want to ship web, iOS, and Android apps quickly. It bundles a database, authentication, hosting, functions, storage, and other core capabilities, so you can build a complete application with almost no traditional backend.

## Firebase's BaaS Services

In a traditional architecture you usually build both a frontend and a backend, where the backend involves:

- Standing up a server (e.g. Node.js)
- Managing a database (MySQL / MongoDB)
- Configuring auth, deployment, logging, security rules, and so on

Firebase instead offers a full set of ready-to-use managed services:

| Capability | Module | Notes |
|------|------|------|
| Database | Firestore / Realtime Database | Document database with real-time sync |
| Cloud functions | Cloud Functions | Event-driven serverless backend logic |
| Authentication | Firebase Auth | Email, Google, Apple sign-in, etc. |
| Storage | Firebase Storage | Files, images, video |
| Hosting | Firebase Hosting / App Hosting | Static sites or SPA hosting |
| Analytics & messaging | Analytics / FCM | User-behavior analytics and push notifications |

This means you can build a complete product with a frontend (Vue / React / SwiftUI) + Firebase, without deploying a traditional backend yourself.

## Project Initialization and Structure

Installing the Firebase CLI and initializing a project:

```bash
npm install -g firebase-tools
firebase login
firebase init
```

During init, choose the modules you need (Hosting, Firestore, and Functions are common). A typical project structure looks like:

```text
my-app/
 ├─ public/           # Frontend build output (Vite / React / Vue build)
 ├─ functions/        # Cloud functions (Node.js runtime)
 ├─ firestore.rules   # Database access control
 ├─ firebase.json     # Global config
 └─ .firebaserc       # Project aliases and associations
```

## The Firestore Database and Its Operations

Firestore is a document database; data is organized hierarchically into collections and documents:

```text
users (collection)
 └── userId (document)
     ├── name: "Alice"
     ├── age: 25
     └── conversations (subcollection)
          └── messageId (document)
```

Typical usage (using Swift's Firebase SDK as an example):

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

Firestore's listener mechanism:

```swift
Firestore.firestore()
    .collection("users")
    .addSnapshotListener { snapshot, _ in
        guard let snapshot else { return }
        // Update the user list in real time
    }
```

This lets you observe and react to data changes in real time — a great fit for features like instant messaging.

## Security Rules and Access Control

Firebase relies on Firestore Rules for fine-grained access control. A minimal example:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Cloud Functions

When you need to call an external API (such as GPT) or perform heavier computation, use Cloud Functions:

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

The command to deploy these Cloud Functions:

```bash
firebase deploy --only functions
```

In the console you can see statistics such as how many times a function has been invoked.

Separately, Logs Explorer is GCP's logging system, where you can view the runtime logs for all your Firebase services — Cloud Functions, Firestore, Hosting, and so on.

## Firebase Hosting and Frontend Deployment

For a frontend project (e.g. Vue + Vite), you just build and deploy:

```bash
npm run build
firebase deploy --only hosting
```

## Summary

The core Firebase mindset: data is the backend, events are the logic, and rules are the security.

One last note: Firebase can be hard to reach from mainland China. Tencent CloudBase is a reasonable alternative, and it also has better support for ecosystems such as WeChat login.
