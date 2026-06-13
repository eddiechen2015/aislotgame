# Running & Testing Guide / 运行与测试指南

---

## English Version

### System Overview

This system consists of three services that work together:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SYSTEM ARCHITECTURE                               │
│                                                                             │
│   ┌──────────────────┐      S2S API       ┌──────────────────┐             │
│   │  Seamless Demo   │───────────────────►│  GMS Backend     │             │
│   │  (Operator Site) │◄───────────────────│  (Game Mgmt)     │             │
│   │  Port: 9090      │   Wallet Callbacks │  Port: 5080      │             │
│   │                  │◄───────────────────│                  │             │
│   └────────┬─────────┘                    └────────┬─────────┘             │
│            │                                       │                        │
│            │  Player browses                       │  Internal API          │
│            │  login + lobby                        │  (session + wallet)    │
│            │                                       │                        │
│            ▼                                       ▼                        │
│   ┌──────────────────────────────────────────────────────┐                 │
│   │                    Player's Browser                   │                 │
│   │                                                       │                 │
│   │   1. Login at :9090        3. Redirected to :3000     │                 │
│   │   2. View lobby at :9090   4. Play game at :3000      │                 │
│   └───────────────────────────────┬───────────────────────┘                 │
│                                   │                                         │
│                                   │  launchToken (JWT)                      │
│                                   ▼                                         │
│                          ┌──────────────────┐                               │
│                          │  Game Engine     │                               │
│                          │  (Slot Game)     │                               │
│                          │  Port: 3000      │                               │
│                          └──────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Service | Port | Tech Stack | Role |
|---------|------|-----------|------|
| **Seamless Demo** | 9090 | C# ASP.NET 9 | Demo operator website with player login, game lobby, and seamless wallet |
| **GMS Backend** | 5080 | C# ASP.NET 9 | Game management system — player registration, game catalog, session & wallet orchestration |
| **Game Engine** | 3000 | Node.js / TypeScript | Slot game server — math engine, spin logic, game UI |

---

### Prerequisites

1. **.NET 9 SDK** — required for GMS Backend and Seamless Demo
   ```bash
   # Verify installation
   dotnet --version
   # Should output 9.x.x
   ```

2. **Node.js 18+** — required for Game Engine
   ```bash
   node --version
   # Should output v18.x.x or higher
   ```

3. **npm packages installed** (one-time setup)
   ```bash
   cd /path/to/aislotgame
   npm install
   ```

---

### Step 1: Start All Services

Open **three terminal windows** and start each service:

#### Terminal 1 — GMS Backend (Port 5080)

```bash
cd /path/to/aislotgame/game-management-backend/src/Gms.Api
dotnet run
```

Expected output:
```
info: Microsoft.Hosting.Lifetime[14]
      Now listening on: http://localhost:5080
```

Verify it's running:
```bash
curl http://localhost:5080/health
# Should return: {"status":"healthy","timestamp":"..."}
```

#### Terminal 2 — Seamless Demo Operator Website (Port 9090)

```bash
cd /path/to/aislotgame/seamless-demo
dotnet run
```

Expected output:
```
info: SeamlessDemo[0]
      === Seamless Demo Operator Website ===
info: SeamlessDemo[0]
      Login page:   http://localhost:9090
```

Verify it's running:
```bash
curl http://localhost:9090/api/auth/players
# Should return list of 5 demo players with balances
```

#### Terminal 3 — Game Engine (Port 3000)

```bash
cd /path/to/aislotgame
npm run dev
```

Expected output:
```
Asian Tour server listening on http://127.0.0.1:3000
Test page:  http://127.0.0.1:3000/
```

---

### Step 2: Player Journey — Login to Play

#### 2.1 Open the Operator Website

Open your browser and navigate to:
```
http://localhost:9090
```

You will see the **Seamless Demo Casino** login page with 5 demo players:

| Player | Display Name | Starting Balance |
|--------|-------------|-----------------|
| alice | Alice Wang | $1,000.00 |
| bob | Bob Chen | $1,000.00 |
| charlie | Charlie Liu | $2,500.00 |
| diana | Diana Zhang | $500.00 |
| eve | Eve Li | $5,000.00 |

#### 2.2 Login as a Demo Player

1. **Click on a player card** (e.g., "Alice Wang") — the card highlights with a gold border
2. **Click the "Login as alice" button**

Behind the scenes, the following happens:
```
Browser                    Seamless Demo (:9090)              GMS Backend (:5080)
   │                              │                               │
   │── POST /api/auth/login ───► │                               │
   │   { playerId: "alice" }     │                               │
   │                              │── POST /api/v1/players/login ►│
   │                              │   Authorization: Bearer demo-seamless-key
   │                              │   X-GMS-Timestamp: 2026-06-12T...
   │                              │   X-GMS-Signature: <hmac>
   │                              │   { operatorPlayerId: "alice",│
   │                              │     currency: "USD",          │
   │                              │     displayName: "Alice Wang"}│
   │                              │                               │
   │                              │◄── 200 OK ────────────────────│
   │                              │   { sessionId: "a3f8...",     │
   │                              │     playerId: "guid...",      │
   │                              │     isNewPlayer: true }       │
   │                              │                               │
   │◄── 200 OK ──────────────────│                               │
   │   { token: "demo-token",    │                               │
   │     balance: "1000.00" }    │                               │
   │                              │                               │
   │── REDIRECT to /lobby.html ──►│                               │
```

After successful login, you are automatically redirected to the **Game Lobby**.

#### 2.3 Browse the Game Lobby

The lobby page shows:
- **Player info bar** at the top — your name, balance, and currency
- **Game cards** — fetched from GMS via S2S API
- **Transaction history** — shows recent wallet operations (empty initially)

The lobby fetches games like this:
```
Browser                    Seamless Demo (:9090)              GMS Backend (:5080)
   │                              │                               │
   │── GET /api/lobby/games ────►│                               │
   │   Authorization: Bearer <demo-token>                        │
   │                              │── GET /api/v1/games ─────────►│
   │                              │   Authorization: Bearer demo-seamless-key
   │                              │                               │
   │                              │◄── 200 OK ────────────────────│
   │                              │   { games: [                  │
   │                              │     { gameId: "asian-tour-01",│
   │                              │       name: "Asian Tour",     │
   │                              │       category: "slots",      │
   │                              │       minBet: "0.10",         │
   │                              │       maxBet: "100.00" }      │
   │                              │   ]}                          │
   │◄── games list ──────────────│                               │
```

You should see the **Asian Tour** slot game card with a 🎰 icon.

#### 2.4 Launch a Game

1. **Click the "Play Now" button** on the Asian Tour game card

Behind the scenes:
```
Browser                    Seamless Demo (:9090)              GMS Backend (:5080)
   │                              │                               │
   │── POST /api/lobby/launch ──►│                               │
   │   { gameId: "asian-tour-01"}│                               │
   │                              │── POST /api/v1/games/launch ─►│
   │                              │   { gameId: "asian-tour-01",  │
   │                              │     sessionId: "a3f8...",     │
   │                              │     lobbyUrl: "http://localhost:9090/lobby.html" }
   │                              │                               │
   │                              │◄── 200 OK ────────────────────│
   │                              │   { launchUrl: "http://localhost:3000/play/asian-tour-01?launchToken=eyJ..." }
   │                              │                               │
   │◄── launchUrl ───────────────│                               │
   │                              │                               │
   │══ window.open(launchUrl) ══════════════════════════════════════► Game Engine (:3000)
```

2. **A new browser tab opens** with the game at `http://localhost:3000/play/asian-tour-01?launchToken=...`

> **Note:** The current Game Engine runs as a standalone demo server with its own session system. The launchToken from GMS is passed in the URL but the game engine does not yet validate it against GMS. For the full seamless wallet flow (where every spin triggers wallet callbacks), the Game Engine needs to be integrated with GMS's Internal API — this is planned as a future task.

#### 2.5 Play the Game (Current Behavior)

Since the Game Engine currently runs independently:
- The game page at `:3000` serves its own test UI
- You can log in with any username on the game's built-in login
- Spins use the game engine's own in-memory wallet (not the seamless demo wallet)

#### 2.6 Wallet Callbacks (When Game Engine is Integrated)

Once the Game Engine is integrated with GMS, each spin will trigger seamless wallet callbacks:

```
Game Engine (:3000)        GMS Backend (:5080)           Seamless Demo (:9090)
       │                          │                              │
       │── POST /internal/wallet/debit ──►│                     │
       │   { sessionId, gameId,   │                              │
       │     amount: "1.00",      │                              │
       │     roundId: "round-1" } │                              │
       │                          │── POST /wallet/debit ───────►│
       │                          │   X-GMS-Signature: <hmac>    │
       │                          │   { operatorPlayerId: "alice",│
       │                          │     amount: "1.00",           │
       │                          │     roundId: "round-1" }      │
       │                          │                              │
       │                          │◄── { success: true, ─────────│
       │                          │      balance: "999.00",      │
       │                          │      operatorTransactionId } │
       │◄── { balance: "999.00" }─│                              │
       │                          │                              │
       │   (player wins $5.00)    │                              │
       │                          │                              │
       │── POST /internal/wallet/credit ─►│                     │
       │   { amount: "5.00",      │                              │
       │     roundId: "round-1" } │                              │
       │                          │── POST /wallet/credit ──────►│
       │                          │   { amount: "5.00" }         │
       │                          │◄── { balance: "1004.00" } ───│
       │◄── { balance: "1004.00" }│                              │
```

---

### Step 3: Testing the Wallet Callbacks Manually

You can test the seamless wallet callbacks directly with `curl` to verify they work correctly, even without Game Engine integration.

#### 3.1 Test Debit (Bet)

```bash
# Debit $10.00 from alice's wallet
curl -s -X POST http://localhost:9090/wallet/debit \
  -H "Content-Type: application/json" \
  -H "X-GMS-Signature: $(echo -n '{"operatorPlayerId":"alice","amount":"10.00","currency":"USD","roundId":"test-round-001","gameId":"asian-tour-01","transactionId":"tx-001","timestamp":"2026-06-12T10:00:00Z"}' | openssl dgst -sha256 -hmac 'demo-callback-secret' -hex | awk '{print $2}')" \
  -d '{"operatorPlayerId":"alice","amount":"10.00","currency":"USD","roundId":"test-round-001","gameId":"asian-tour-01","transactionId":"tx-001","timestamp":"2026-06-12T10:00:00Z"}'
```

Expected response:
```json
{
  "success": true,
  "balance": "990.00",
  "operatorTransactionId": "demo-xxxxxxxxxxxx",
  "errorCode": null,
  "message": null
}
```

#### 3.2 Test Credit (Win)

```bash
# Credit $25.00 to alice's wallet (she won!)
curl -s -X POST http://localhost:9090/wallet/credit \
  -H "Content-Type: application/json" \
  -H "X-GMS-Signature: $(echo -n '{"operatorPlayerId":"alice","amount":"25.00","currency":"USD","roundId":"test-round-001","gameId":"asian-tour-01","transactionId":"tx-002","timestamp":"2026-06-12T10:00:01Z"}' | openssl dgst -sha256 -hmac 'demo-callback-secret' -hex | awk '{print $2}')" \
  -d '{"operatorPlayerId":"alice","amount":"25.00","currency":"USD","roundId":"test-round-001","gameId":"asian-tour-01","transactionId":"tx-002","timestamp":"2026-06-12T10:00:01Z"}'
```

Expected response:
```json
{
  "success": true,
  "balance": "1015.00",
  "operatorTransactionId": "demo-xxxxxxxxxxxx"
}
```

#### 3.3 Test Rollback

```bash
# Rollback the bet from round test-round-002
# First make a debit
curl -s -X POST http://localhost:9090/wallet/debit \
  -H "Content-Type: application/json" \
  -H "X-GMS-Signature: $(echo -n '{"operatorPlayerId":"alice","amount":"5.00","currency":"USD","roundId":"test-round-002","gameId":"asian-tour-01","transactionId":"tx-003","timestamp":"2026-06-12T10:00:02Z"}' | openssl dgst -sha256 -hmac 'demo-callback-secret' -hex | awk '{print $2}')" \
  -d '{"operatorPlayerId":"alice","amount":"5.00","currency":"USD","roundId":"test-round-002","gameId":"asian-tour-01","transactionId":"tx-003","timestamp":"2026-06-12T10:00:02Z"}'

# Now rollback that round
curl -s -X POST http://localhost:9090/wallet/rollback \
  -H "Content-Type: application/json" \
  -H "X-GMS-Signature: $(echo -n '{"operatorPlayerId":"alice","amount":"0.00","currency":"USD","roundId":"test-round-002","gameId":"asian-tour-01","transactionId":"tx-004","timestamp":"2026-06-12T10:00:03Z"}' | openssl dgst -sha256 -hmac 'demo-callback-secret' -hex | awk '{print $2}')" \
  -d '{"operatorPlayerId":"alice","amount":"0.00","currency":"USD","roundId":"test-round-002","gameId":"asian-tour-01","transactionId":"tx-004","timestamp":"2026-06-12T10:00:03Z"}'
```

#### 3.4 Test Idempotency

Send the same debit request twice with the same `transactionId`:
```bash
# Send tx-001 again — should return cached result, no double deduction
curl -s -X POST http://localhost:9090/wallet/debit \
  -H "Content-Type: application/json" \
  -H "X-GMS-Signature: $(echo -n '{"operatorPlayerId":"alice","amount":"10.00","currency":"USD","roundId":"test-round-001","gameId":"asian-tour-01","transactionId":"tx-001","timestamp":"2026-06-12T10:00:00Z"}' | openssl dgst -sha256 -hmac 'demo-callback-secret' -hex | awk '{print $2}')" \
  -d '{"operatorPlayerId":"alice","amount":"10.00","currency":"USD","roundId":"test-round-001","gameId":"asian-tour-01","transactionId":"tx-001","timestamp":"2026-06-12T10:00:00Z"}'
```

The balance should remain the same as after the first debit — no double deduction.

#### 3.5 Test Insufficient Funds

```bash
# Try to debit more than diana's $500 balance
curl -s -X POST http://localhost:9090/wallet/debit \
  -H "Content-Type: application/json" \
  -H "X-GMS-Signature: $(echo -n '{"operatorPlayerId":"diana","amount":"999.00","currency":"USD","roundId":"test-round-big","gameId":"asian-tour-01","transactionId":"tx-big","timestamp":"2026-06-12T10:00:00Z"}' | openssl dgst -sha256 -hmac 'demo-callback-secret' -hex | awk '{print $2}')" \
  -d '{"operatorPlayerId":"diana","amount":"999.00","currency":"USD","roundId":"test-round-big","gameId":"asian-tour-01","transactionId":"tx-big","timestamp":"2026-06-12T10:00:00Z"}'
```

Expected response:
```json
{
  "success": false,
  "balance": "500.00",
  "errorCode": "insufficient_funds",
  "message": "Player does not have enough balance"
}
```

#### 3.6 Check Balance in Lobby

After running wallet callbacks, go back to the lobby page in your browser:
```
http://localhost:9090/lobby.html
```

The **balance display** updates automatically (polls every 3 seconds), and the **transaction history table** shows all debit/credit/rollback operations.

---

### Step 4: Testing the S2S API Flow

You can also test the operator-to-GMS S2S flow directly:

```bash
# Login a player via GMS S2S API (with simplified auth — signature validation is skipped in dev mode)
curl -s -X POST http://localhost:5080/api/v1/players/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer demo-seamless-key" \
  -d '{"operatorPlayerId":"alice","currency":"USD","displayName":"Alice Wang"}'

# Get game list
curl -s http://localhost:5080/api/v1/games \
  -H "Authorization: Bearer demo-seamless-key"

# Launch a game (replace SESSION_ID with the sessionId from login response)
curl -s -X POST http://localhost:5080/api/v1/games/launch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer demo-seamless-key" \
  -d '{"gameId":"asian-tour-01","sessionId":"SESSION_ID"}'
```

---

### Troubleshooting

| Problem | Solution |
|---------|----------|
| `dotnet: command not found` | Install .NET 9 SDK from https://dotnet.microsoft.com/download |
| GMS returns 401 Unauthorized | Check that `ApiKey` in seamless-demo matches seed data (`demo-seamless-key`) |
| "Failed to fetch games" in lobby | Make sure GMS is running on port 5080 |
| Wallet callback signature mismatch | Ensure `CallbackSecret` matches GMS seed data (`demo-callback-secret`) |
| Game page shows its own login | Expected — Game Engine is not yet integrated with GMS |
| Balance not updating in lobby | Check seamless-demo console logs for callback activity |

---
---

## 中文版本

### 系统概览

本系统由三个服务协同工作：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            系统架构图                                       │
│                                                                             │
│   ┌──────────────────┐      S2S API       ┌──────────────────┐             │
│   │  Seamless Demo   │───────────────────►│  GMS 后端        │             │
│   │  (运营商网站)     │◄───────────────────│  (游戏管理系统)   │             │
│   │  端口: 9090      │   钱包回调          │  端口: 5080      │             │
│   │                  │◄───────────────────│                  │             │
│   └────────┬─────────┘                    └────────┬─────────┘             │
│            │                                       │                        │
│            │  玩家浏览                              │  内部 API              │
│            │  登录 + 游戏大厅                        │  (会话 + 钱包)         │
│            │                                       │                        │
│            ▼                                       ▼                        │
│   ┌──────────────────────────────────────────────────────┐                 │
│   │                     玩家浏览器                        │                 │
│   │                                                       │                 │
│   │   1. 在 :9090 登录         3. 重定向到 :3000          │                 │
│   │   2. 在 :9090 浏览游戏大厅  4. 在 :3000 玩游戏        │                 │
│   └───────────────────────────────┬───────────────────────┘                 │
│                                   │                                         │
│                                   │  launchToken (JWT)                      │
│                                   ▼                                         │
│                          ┌──────────────────┐                               │
│                          │  游戏引擎         │                               │
│                          │  (老虎机游戏)     │                               │
│                          │  端口: 3000      │                               │
│                          └──────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

| 服务 | 端口 | 技术栈 | 职责 |
|------|------|--------|------|
| **Seamless Demo** | 9090 | C# ASP.NET 9 | 演示运营商网站——玩家登录、游戏大厅、Seamless 钱包管理 |
| **GMS 后端** | 5080 | C# ASP.NET 9 | 游戏管理系统——玩家注册、游戏目录、会话与钱包调度 |
| **游戏引擎** | 3000 | Node.js / TypeScript | 老虎机游戏服务——数学引擎、spin 逻辑、游戏界面 |

---

### 环境准备

1. **.NET 9 SDK** —— GMS 后端和 Seamless Demo 需要
   ```bash
   # 验证安装
   dotnet --version
   # 应该输出 9.x.x
   ```

2. **Node.js 18+** —— 游戏引擎需要
   ```bash
   node --version
   # 应该输出 v18.x.x 或更高
   ```

3. **安装 npm 依赖**（仅需一次）
   ```bash
   cd /path/to/aislotgame
   npm install
   ```

---

### 第一步：启动所有服务

打开 **三个终端窗口**，分别启动各个服务：

#### 终端 1 —— GMS 后端（端口 5080）

```bash
cd /path/to/aislotgame/game-management-backend/src/Gms.Api
dotnet run
```

预期输出：
```
info: Microsoft.Hosting.Lifetime[14]
      Now listening on: http://localhost:5080
```

验证是否运行正常：
```bash
curl http://localhost:5080/health
# 应返回: {"status":"healthy","timestamp":"..."}
```

#### 终端 2 —— Seamless Demo 运营商网站（端口 9090）

```bash
cd /path/to/aislotgame/seamless-demo
dotnet run
```

预期输出：
```
info: SeamlessDemo[0]
      === Seamless Demo Operator Website ===
info: SeamlessDemo[0]
      Login page:   http://localhost:9090
```

验证是否运行正常：
```bash
curl http://localhost:9090/api/auth/players
# 应返回 5 个演示玩家列表和余额信息
```

#### 终端 3 —— 游戏引擎（端口 3000）

```bash
cd /path/to/aislotgame
npm run dev
```

预期输出：
```
Asian Tour server listening on http://127.0.0.1:3000
Test page:  http://127.0.0.1:3000/
```

---

### 第二步：玩家流程——从登录到游玩

#### 2.1 打开运营商网站

在浏览器中访问：
```
http://localhost:9090
```

你会看到 **Seamless Demo Casino** 登录页面，展示 5 个演示玩家：

| 玩家 ID | 显示名称 | 初始余额 |
|---------|---------|---------|
| alice | Alice Wang | $1,000.00 |
| bob | Bob Chen | $1,000.00 |
| charlie | Charlie Liu | $2,500.00 |
| diana | Diana Zhang | $500.00 |
| eve | Eve Li | $5,000.00 |

#### 2.2 选择玩家并登录

1. **点击一个玩家卡片**（例如 "Alice Wang"）—— 卡片会显示金色高亮边框
2. **点击 "Login as alice" 按钮**

后台发生的事情：
```
浏览器                    Seamless Demo (:9090)              GMS 后端 (:5080)
   │                              │                               │
   │── POST /api/auth/login ───► │                               │
   │   { playerId: "alice" }     │                               │
   │                              │                               │
   │   后台做了两件事：                                            │
   │   ① 验证 alice 是合法的演示玩家                                │
   │   ② 调用 GMS S2S API 注册/登录这个玩家                        │
   │                              │                               │
   │                              │── POST /api/v1/players/login ►│
   │                              │   请求头:                      │
   │                              │   Authorization: Bearer demo-seamless-key
   │                              │   X-GMS-Timestamp: (UTC时间)   │
   │                              │   X-GMS-Signature: (HMAC签名)  │
   │                              │   请求体:                      │
   │                              │   { operatorPlayerId: "alice", │
   │                              │     currency: "USD",           │
   │                              │     displayName: "Alice Wang"} │
   │                              │                               │
   │                              │◄── 200 OK ────────────────────│
   │                              │   { sessionId: "a3f8...",      │
   │                              │     playerId: "guid...",       │
   │                              │     walletType: "Seamless",    │
   │                              │     isNewPlayer: true }        │
   │                              │                               │
   │◄── 200 OK ──────────────────│                               │
   │   { token: "demo-token",    │   (返回给浏览器的是 demo 自己    │
   │     balance: "1000.00",     │    的 token，不是 GMS 的)       │
   │     displayName: "Alice" }  │                               │
   │                              │                               │
   │── 自动跳转到 /lobby.html ──►│                               │
```

登录成功后，自动跳转到**游戏大厅**。

#### 2.3 浏览游戏大厅

大厅页面展示：
- **顶部玩家信息栏** —— 你的名字、余额和货币
- **游戏卡片** —— 从 GMS 通过 S2S API 拉取的游戏列表
- **交易历史** —— 显示最近的钱包操作（初始为空）

大厅获取游戏列表的流程：
```
浏览器                    Seamless Demo (:9090)              GMS 后端 (:5080)
   │                              │                               │
   │── GET /api/lobby/games ────►│                               │
   │   (带 demo token 认证)      │                               │
   │                              │── GET /api/v1/games ─────────►│
   │                              │   (带运营商 API Key 认证)      │
   │                              │                               │
   │                              │◄── 返回游戏列表 ──────────────│
   │                              │   { games: [                  │
   │                              │     { gameId: "asian-tour-01",│
   │                              │       name: "Asian Tour",     │
   │                              │       category: "slots",      │
   │                              │       minBet: "0.10",         │
   │                              │       maxBet: "100.00" }      │
   │                              │   ]}                          │
   │◄── 游戏列表 ────────────────│                               │
```

你应该能看到 **Asian Tour** 老虎机游戏卡片，带有 🎰 图标。

#### 2.4 启动游戏

1. **点击 Asian Tour 卡片上的 "Play Now" 按钮**

后台流程：
```
浏览器                    Seamless Demo (:9090)              GMS 后端 (:5080)
   │                              │                               │
   │── POST /api/lobby/launch ──►│                               │
   │   { gameId: "asian-tour-01"}│                               │
   │                              │── POST /api/v1/games/launch ─►│
   │                              │   { gameId: "asian-tour-01",  │
   │                              │     sessionId: "a3f8..." }    │
   │                              │                               │
   │                              │◄── 200 OK ────────────────────│
   │                              │   GMS 生成了一个 JWT launch token
   │                              │   包含: sessionId, playerId,  │
   │                              │   operatorId, currency, walletType
   │                              │   { launchUrl: "http://localhost:3000│
   │                              │     /play/asian-tour-01       │
   │                              │     ?launchToken=eyJhbG..." } │
   │                              │                               │
   │◄── launchUrl ───────────────│                               │
   │                              │                               │
   │══ 新标签页打开游戏 URL ═══════════════════════════════════════► 游戏引擎 (:3000)
```

2. **浏览器会在新标签页中打开游戏**

> **注意：** 当前游戏引擎是独立运行的演示服务器，拥有自己的会话系统。GMS 的 launchToken 已经传递到了 URL 中，但游戏引擎尚未对接 GMS 的内部 API 来验证它。要实现完整的 seamless 钱包流程（每次 spin 都触发钱包回调），需要将游戏引擎与 GMS 的 Internal API 集成——这是后续计划中的任务。

#### 2.5 游玩游戏（当前行为）

由于游戏引擎目前独立运行：
- `:3000` 的游戏页面使用自己的测试界面
- 你可以在游戏自带的登录框中输入任意用户名登录
- spin 使用游戏引擎自己的内存钱包（不是 seamless demo 的钱包）

#### 2.6 钱包回调流程（游戏引擎集成后）

当游戏引擎与 GMS 集成后，每次 spin 都会触发 seamless 钱包回调：

```
游戏引擎 (:3000)          GMS 后端 (:5080)              Seamless Demo (:9090)
       │                          │                              │
       │  玩家点击 spin            │                              │
       │  (下注 $1.00)            │                              │
       │                          │                              │
       │── POST /internal/wallet/debit ──►│                     │
       │   { sessionId, amount: "1.00",   │                     │
       │     roundId: "round-1" }         │                     │
       │                          │                              │
       │                  GMS 识别这是 Seamless 钱包运营商         │
       │                  调用运营商的回调 API                     │
       │                          │                              │
       │                          │── POST /wallet/debit ───────►│
       │                          │   X-GMS-Signature: <hmac>    │
       │                          │   { operatorPlayerId: "alice",│
       │                          │     amount: "1.00",           │
       │                          │     roundId: "round-1" }      │
       │                          │                              │
       │                          │  Seamless Demo 从 alice       │
       │                          │  的钱包中扣除 $1.00           │
       │                          │                              │
       │                          │◄── { success: true, ─────────│
       │                          │      balance: "999.00" }     │
       │◄── { balance: "999.00" }─│                              │
       │                          │                              │
       │  数学引擎计算 spin 结果    │                              │
       │  玩家赢了 $5.00!          │                              │
       │                          │                              │
       │── POST /internal/wallet/credit ─►│                     │
       │   { amount: "5.00",      │                              │
       │     roundId: "round-1" } │                              │
       │                          │── POST /wallet/credit ──────►│
       │                          │   { amount: "5.00" }         │
       │                          │                              │
       │                          │  Seamless Demo 向 alice       │
       │                          │  的钱包中添加 $5.00           │
       │                          │                              │
       │                          │◄── { balance: "1004.00" } ───│
       │◄── { balance: "1004.00" }│                              │
       │                          │                              │
       │  更新游戏界面显示余额      │                              │
       │  $999.00 → $1004.00      │                              │
```

---

### 第三步：手动测试钱包回调

即使没有游戏引擎集成，你也可以用 `curl` 直接测试 seamless 钱包回调接口是否正常工作。

#### 3.1 测试扣款（下注）

```bash
# 从 alice 的钱包中扣除 $10.00
curl -s -X POST http://localhost:9090/wallet/debit \
  -H "Content-Type: application/json" \
  -H "X-GMS-Signature: $(echo -n '{"operatorPlayerId":"alice","amount":"10.00","currency":"USD","roundId":"test-round-001","gameId":"asian-tour-01","transactionId":"tx-001","timestamp":"2026-06-12T10:00:00Z"}' | openssl dgst -sha256 -hmac 'demo-callback-secret' -hex | awk '{print $2}')" \
  -d '{"operatorPlayerId":"alice","amount":"10.00","currency":"USD","roundId":"test-round-001","gameId":"asian-tour-01","transactionId":"tx-001","timestamp":"2026-06-12T10:00:00Z"}'
```

预期响应：
```json
{
  "success": true,
  "balance": "990.00",
  "operatorTransactionId": "demo-xxxxxxxxxxxx",
  "errorCode": null,
  "message": null
}
```

#### 3.2 测试加款（赢钱）

```bash
# 向 alice 的钱包中添加 $25.00（她赢了！）
curl -s -X POST http://localhost:9090/wallet/credit \
  -H "Content-Type: application/json" \
  -H "X-GMS-Signature: $(echo -n '{"operatorPlayerId":"alice","amount":"25.00","currency":"USD","roundId":"test-round-001","gameId":"asian-tour-01","transactionId":"tx-002","timestamp":"2026-06-12T10:00:01Z"}' | openssl dgst -sha256 -hmac 'demo-callback-secret' -hex | awk '{print $2}')" \
  -d '{"operatorPlayerId":"alice","amount":"25.00","currency":"USD","roundId":"test-round-001","gameId":"asian-tour-01","transactionId":"tx-002","timestamp":"2026-06-12T10:00:01Z"}'
```

预期响应：
```json
{
  "success": true,
  "balance": "1015.00",
  "operatorTransactionId": "demo-xxxxxxxxxxxx"
}
```

#### 3.3 测试回滚

```bash
# 先做一次扣款
curl -s -X POST http://localhost:9090/wallet/debit \
  -H "Content-Type: application/json" \
  -H "X-GMS-Signature: $(echo -n '{"operatorPlayerId":"alice","amount":"5.00","currency":"USD","roundId":"test-round-002","gameId":"asian-tour-01","transactionId":"tx-003","timestamp":"2026-06-12T10:00:02Z"}' | openssl dgst -sha256 -hmac 'demo-callback-secret' -hex | awk '{print $2}')" \
  -d '{"operatorPlayerId":"alice","amount":"5.00","currency":"USD","roundId":"test-round-002","gameId":"asian-tour-01","transactionId":"tx-003","timestamp":"2026-06-12T10:00:02Z"}'

# 然后回滚这笔交易
curl -s -X POST http://localhost:9090/wallet/rollback \
  -H "Content-Type: application/json" \
  -H "X-GMS-Signature: $(echo -n '{"operatorPlayerId":"alice","amount":"0.00","currency":"USD","roundId":"test-round-002","gameId":"asian-tour-01","transactionId":"tx-004","timestamp":"2026-06-12T10:00:03Z"}' | openssl dgst -sha256 -hmac 'demo-callback-secret' -hex | awk '{print $2}')" \
  -d '{"operatorPlayerId":"alice","amount":"0.00","currency":"USD","roundId":"test-round-002","gameId":"asian-tour-01","transactionId":"tx-004","timestamp":"2026-06-12T10:00:03Z"}'
```

#### 3.4 测试幂等性

用相同的 `transactionId` 发送同一笔扣款请求两次：
```bash
# 再次发送 tx-001 —— 应返回缓存结果，不会重复扣款
curl -s -X POST http://localhost:9090/wallet/debit \
  -H "Content-Type: application/json" \
  -H "X-GMS-Signature: $(echo -n '{"operatorPlayerId":"alice","amount":"10.00","currency":"USD","roundId":"test-round-001","gameId":"asian-tour-01","transactionId":"tx-001","timestamp":"2026-06-12T10:00:00Z"}' | openssl dgst -sha256 -hmac 'demo-callback-secret' -hex | awk '{print $2}')" \
  -d '{"operatorPlayerId":"alice","amount":"10.00","currency":"USD","roundId":"test-round-001","gameId":"asian-tour-01","transactionId":"tx-001","timestamp":"2026-06-12T10:00:00Z"}'
```

余额应该和第一次扣款后一样——不会重复扣除。

#### 3.5 测试余额不足

```bash
# 尝试从 diana ($500 余额) 扣除 $999
curl -s -X POST http://localhost:9090/wallet/debit \
  -H "Content-Type: application/json" \
  -H "X-GMS-Signature: $(echo -n '{"operatorPlayerId":"diana","amount":"999.00","currency":"USD","roundId":"test-round-big","gameId":"asian-tour-01","transactionId":"tx-big","timestamp":"2026-06-12T10:00:00Z"}' | openssl dgst -sha256 -hmac 'demo-callback-secret' -hex | awk '{print $2}')" \
  -d '{"operatorPlayerId":"diana","amount":"999.00","currency":"USD","roundId":"test-round-big","gameId":"asian-tour-01","transactionId":"tx-big","timestamp":"2026-06-12T10:00:00Z"}'
```

预期响应：
```json
{
  "success": false,
  "balance": "500.00",
  "errorCode": "insufficient_funds",
  "message": "Player does not have enough balance"
}
```

#### 3.6 在大厅查看余额变化

执行了钱包回调测试后，回到浏览器中的大厅页面：
```
http://localhost:9090/lobby.html
```

**余额显示**会自动更新（每 3 秒轮询一次），**交易历史表格**会显示所有的扣款/加款/回滚操作。

---

### 第四步：直接测试 S2S API

你也可以直接测试运营商到 GMS 的 S2S API 流程：

```bash
# 通过 GMS S2S API 登录玩家（开发模式下签名验证已跳过）
curl -s -X POST http://localhost:5080/api/v1/players/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer demo-seamless-key" \
  -d '{"operatorPlayerId":"alice","currency":"USD","displayName":"Alice Wang"}'

# 获取游戏列表
curl -s http://localhost:5080/api/v1/games \
  -H "Authorization: Bearer demo-seamless-key"

# 启动游戏（将 SESSION_ID 替换为登录返回的 sessionId）
curl -s -X POST http://localhost:5080/api/v1/games/launch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer demo-seamless-key" \
  -d '{"gameId":"asian-tour-01","sessionId":"SESSION_ID"}'
```

---

### 故障排查

| 问题 | 解决方案 |
|------|---------|
| `dotnet: command not found` | 从 https://dotnet.microsoft.com/download 安装 .NET 9 SDK |
| GMS 返回 401 Unauthorized | 检查 seamless-demo 的 `ApiKey` 是否匹配种子数据（`demo-seamless-key`） |
| 大厅显示 "Failed to fetch games" | 确保 GMS 后端正在端口 5080 运行 |
| 钱包回调签名不匹配 | 确保 `CallbackSecret` 匹配 GMS 种子数据（`demo-callback-secret`） |
| 游戏页面显示自己的登录框 | 预期行为——游戏引擎尚未与 GMS 集成 |
| 大厅余额不更新 | 查看 seamless-demo 控制台日志中的回调活动 |
| 端口被占用 | 用 `lsof -i :5080` 或 `lsof -i :9090` 检查并终止占用进程 |
