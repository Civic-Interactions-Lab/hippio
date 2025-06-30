---
sidebar_position: 4
---

# 🦛 Hippo Game Requirements


## 🧩 Functional Requirements

### 🎮 Core Gameplay
- The game must allow up to **4 Hippo players**, each positioned at one edge of the screen (top, bottom, left, right).
- Hippos must be able to **slide left-right (horizontal edges)** or **up-down (vertical edges)** only along their edge.
- Hippos can **catch or deflect Food and traps** launched from the center.
- Food must **bounce with physics**, possibly off edges, and expire after some time.
- Food and traps should have **clear visual distinction**.

### 🎯 AAC Game Conductor Role
- An **AAC (Augmentative and Alternative Communication) user** acts as the **Game Conductor**.
- The Conductor must be able to:
  - Choose the **type of food or trap**.
  - **Launch** the selected object from the center outward.
  - **Set difficulty** (speed, quantity, randomness).
  - Influence round dynamics (e.g., super food, freeze mode, etc.).

### 🍓 Object Types
- **Food** (normal, super food, etc.) are catchable for points.
- **Traps** (e.g., poison, freeze, confusion) have **negative effects** on Hippos.
- **Food expiration** removes it from play after a short time.

### 🧠 Scoring & Feedback
- Hippos earn points for **successfully catching Food**.
- There should be **audio-visual feedback** for events (e.g., catch, hit by trap).
- **Progress or game over state** shown clearly to all players.

---

## 🛠️ Non-Functional Requirements

### 💡 Accessibility
- The game must be **autism-friendly** with:
  - **Low sensory load**: plain, non-distracting background.
  - **Clear contrast** between Hippos, Food, and background.
  - Optional **muted mode** or low-noise sound effects.
- AAC interface must be **simple, large-buttoned**, and **touchscreen-friendly**.


### 📱 Usability
- Must work on **desktop, laptop, or tablet**.
- Game controls should be **easy to learn** and responsive.
- UI should be clear and **minimize text** where possible.

### ⚙️ Performance
- The game must run **smoothly (≥ 30 FPS)** even with multiple Food/traps on screen.
- **Physics simulation** (bounce, expiration, collisions) must remain accurate and lightweight.

### 🔐 Reliability
- Game state should **not crash** or freeze during normal play.
- Invalid input or unexpected behavior must be **gracefully handled**.

### 🔧 Maintainability
- Code should be **modular** (organized into separate, independent, and reusable parts), especially:
  - Movement strategies
  - Food/trap launching logic
  - AAC interface

