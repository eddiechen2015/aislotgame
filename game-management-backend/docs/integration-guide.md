# Operator Integration Guide

This guide walks through end-to-end integration flows for operators connecting to the Game Management Backend (GMS).

## Prerequisites

Before integration, the game vendor provisions:

| Item | Description |
|------|-------------|
| API credentials | API key + signing secret (or mTLS certificate) |
| Operator ID | Internal GMS tenant identifier |
| Wallet type | `Normal` or `Seamless` |
| Enabled games | List of game IDs available to this operator |
| Callback base URL | Required for seamless wallet operators only |

## Integration Paths

```text
                    ┌─────────────────────┐
                    │  Choose wallet type │
                    └──────────┬──────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
     ┌─────────────────┐               ┌─────────────────┐
     │  Normal Wallet  │               │ Seamless Wallet │
     └────────┬────────┘               └────────┬────────┘
              │                                 │
              │ implement GMS APIs              │ implement GMS APIs
              │ + transfer flow                 │ + callback endpoints
              └────────────────┬────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │  Launch & play games│
                    └─────────────────────┘
```

---

## Flow 1: Normal Wallet — Full Player Journey

### Step 1 — Player selects a game on operator site

Operator backend prepares to launch a game for an authenticated operator player.

### Step 2 — Login / register with GMS

```http
POST /api/v1/players/login
```

```json
{
  "operatorPlayerId": "player-12345",
  "currency": "USD",
  "locale": "en-US",
  "displayName": "Player One"
}
```

Store the returned `sessionId`.

### Step 3 — Transfer funds to casino wallet

On the operator side, debit the player's main wallet. Then call GMS:

```http
POST /api/v1/wallet/transfer
Idempotency-Key: transfer-abc-001
```

```json
{
  "sessionId": "<sessionId>",
  "amount": "50.00",
  "currency": "USD",
  "reference": "op-main-wallet-tx-001"
}
```

Confirm `balance` reflects the transferred amount.

### Step 4 — Get launch URL

```http
POST /api/v1/games/launch
```

```json
{
  "gameId": "asian-tour-01",
  "sessionId": "<sessionId>",
  "returnUrl": "https://your-casino.com/lobby"
}
```

### Step 5 — Redirect player

Open `launchUrl` in iframe or new window. The game client loads and validates the session with GMS via the game engine.

### Step 6 — Gameplay (automatic)

- Bets debit the casino wallet inside GMS
- Wins credit the casino wallet inside GMS
- No further operator API calls needed during play

### Step 7 — Session check (optional, periodic)

While player is in lobby or between games:

```http
POST /api/v1/sessions/validate
```

```json
{ "sessionId": "<sessionId>" }
```

### Step 8 — Return to operator (future: transfer out)

When player exits, remaining casino wallet balance may be transferred back to operator main wallet (API TBD).

---

## Flow 2: Seamless Wallet — Full Player Journey

### Step 1 — Player selects a game

Same as normal wallet.

### Step 2 — Login / register with GMS

```http
POST /api/v1/players/login
```

No transfer step — funds remain on operator main wallet.

### Step 3 — Implement operator callback endpoints

Before going live, implement and test:

| Endpoint | Purpose |
|----------|---------|
| `POST {callbackBaseUrl}/wallet/debit` | Deduct bet before spin |
| `POST {callbackBaseUrl}/wallet/credit` | Credit win after spin |
| `POST {callbackBaseUrl}/wallet/rollback` | Reverse failed debit |

Verify `X-GMS-Signature` on every inbound callback.

### Step 4 — Get launch URL

```http
POST /api/v1/games/launch
```

Same as normal wallet flow.

### Step 5 — Redirect player

Open `launchUrl`. During play, GMS calls operator callbacks for each bet and win.

### Callback handling checklist

- [ ] Return `success: true` only after main wallet is actually debited/credited
- [ ] Use `transactionId` for idempotency — return same response on retry
- [ ] Respond within 3 seconds
- [ ] Return current `balance` after each operation
- [ ] Handle `insufficient_funds` with `success: false`

---

## Flow 3: Game Catalog Sync

Operators typically cache the game list and refresh periodically.

```http
GET /api/v1/games?page=1&pageSize=50
```

For game detail pages or admin panels:

```http
GET /api/v1/games/asian-tour-01
```

Recommended refresh interval: every 15–60 minutes, or on webhook (future).

---

## Testing Strategy

### Sandbox Environment

| Resource | Purpose |
|----------|---------|
| Sandbox API base URL | Isolated test tenant |
| Test API credentials | Separate from production |
| Test callback URL | For seamless wallet operators (use ngrok or similar) |
| Test game IDs | Same games with fake currency or test mode |

### Test Scenarios — Normal Wallet

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Login new player | `isNewPlayer: true`, session returned |
| 2 | Login existing player | `isNewPlayer: false`, new session |
| 3 | Transfer $100 | Balance = 100 |
| 4 | Duplicate transfer (same idempotency key) | Same result, no double credit |
| 5 | Launch game with valid session | Launch URL returned |
| 6 | Launch game with expired session | `session_expired` error |
| 7 | Validate active session | `valid: true` |
| 8 | Play until balance exhausted | Spin rejected with `insufficient_funds` |

### Test Scenarios — Seamless Wallet

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Login player | Session returned, no transfer API |
| 2 | Debit callback success | Spin proceeds |
| 3 | Debit callback insufficient funds | Spin rejected |
| 4 | Debit timeout | Spin rejected |
| 5 | Win credit callback | Player main wallet increased |
| 6 | Duplicate debit (same transactionId) | Idempotent response |
| 7 | Rollback after failed spin | Main wallet restored |

---

## Security Checklist

- [ ] Store API secret securely (never in client-side code)
- [ ] Validate GMS callback signatures on seamless endpoints
- [ ] Use HTTPS for all endpoints
- [ ] Rotate API credentials periodically
- [ ] Log all transfer and callback events with correlation IDs
- [ ] Do not expose `sessionId` in public URLs except via signed launch URL

---

## Go-Live Checklist

- [ ] Sandbox flows pass all test scenarios
- [ ] Production credentials issued
- [ ] IP allowlisting configured (if required)
- [ ] Game list verified for operator tenant
- [ ] Wallet type confirmed in GMS operator config
- [ ] Callback endpoints deployed (seamless only)
- [ ] Monitoring and alerting on callback latency / error rate
- [ ] Reconciliation process defined between operator and vendor

---

## Support and Escalation

| Issue | Contact |
|-------|---------|
| API errors / 5xx | Vendor ops on-call |
| Wallet reconciliation mismatch | Vendor finance + operator finance |
| Game launch failures | Vendor integration support |
| Callback timeouts (seamless) | Operator infra + vendor ops |

Contact details to be defined during vendor onboarding.
