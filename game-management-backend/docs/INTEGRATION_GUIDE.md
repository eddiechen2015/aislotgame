# GMS Operator Integration Guide

> **Version:** 1.0  
> **Last Updated:** 2026-06-12  
> **Base URL:** `https://gms.yourstudio.com` (replace with your deployment URL)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Getting Started](#2-getting-started)
3. [Authentication](#3-authentication)
4. [Integration Workflow](#4-integration-workflow)
5. [API Reference](#5-api-reference)
6. [Seamless Wallet Callbacks](#6-seamless-wallet-callbacks)
7. [Error Handling](#7-error-handling)
8. [Session Management](#8-session-management)
9. [Security Best Practices](#9-security-best-practices)
10. [Code Examples](#10-code-examples)
11. [Testing & Sandbox](#11-testing--sandbox)
12. [FAQ](#12-faq)

---

## 1. Overview

The **Game Management System (GMS)** provides a service-to-service (S2S) API that allows operator websites to integrate slot games into their platforms. GMS handles player registration, game catalog management, session lifecycle, and wallet orchestration.

### Wallet Models

GMS supports two wallet integration models:

| Model | Description | Who Manages Balance | Recommended For |
|-------|-------------|-------------------|-----------------|
| **Normal** | GMS maintains player wallets internally. Operators transfer funds into GMS wallets. | GMS | Operators without existing wallet infrastructure |
| **Seamless** | Operators maintain player wallets on their own platform. GMS calls operator APIs for every financial transaction. | Operator | Operators with existing wallet/payment systems |

### Architecture

```
                         ┌──────────────────────────────────────┐
                         │         OPERATOR WEBSITE              │
                         │                                      │
                         │  ┌─────────┐    ┌────────────────┐  │
                         │  │ Frontend │    │ Backend Server │  │
                         │  │ (Player  │    │ (S2S Calls to  │  │
                         │  │  facing) │    │  GMS + Wallet  │  │
                         │  │         │    │  Callbacks)    │  │
                         │  └────┬────┘    └───┬────▲───────┘  │
                         │       │             │    │           │
                         └───────┼─────────────┼────┼───────────┘
                                 │             │    │
                    Player       │    S2S API  │    │ Wallet Callbacks
                    Browser      │   (HTTPS)   │    │ (Seamless only)
                                 │             │    │
                         ┌───────┼─────────────┼────┼───────────┐
                         │       │             ▼    │           │
                         │  ┌────┴─────────────────────────┐   │
                         │  │          GMS Backend          │   │
                         │  │  • Player Registration        │   │
                         │  │  • Game Catalog               │   │
                         │  │  • Session Management         │   │
                         │  │  • Wallet Orchestration       │   │
                         │  └──────────────┬───────────────┘   │
                         │                 │                    │
                         │                 │ Internal API       │
                         │                 ▼                    │
                         │  ┌──────────────────────────────┐   │
                         │  │       Game Engine Server      │   │
                         │  │   (Slot game logic + UI)      │   │
                         │  └──────────────────────────────┘   │
                         │              GMS PLATFORM            │
                         └─────────────────────────────────────┘
```

---

## 2. Getting Started

### Onboarding Checklist

1. **Receive credentials** from GMS — you will be provided:
   - `API Key` — your public operator identifier
   - `API Secret` — your private HMAC signing key (**keep this secret**)
   - `Wallet Type` — Normal or Seamless
   - `Callback Secret` — (Seamless only) secret for verifying GMS callback signatures

2. **Provide configuration** to GMS:
   - Your `Callback Base URL` (Seamless only) — e.g., `https://api.yoursite.com`
   - Session TTL preference (default: 240 minutes)
   - Maximum concurrent sessions per player (default: 1)

3. **Implement the integration** as described in this guide.

4. **Test** in the sandbox environment before going live.

### Base URLs

| Environment | URL |
|-------------|-----|
| Sandbox | `https://gms-sandbox.yourstudio.com` |
| Production | `https://gms.yourstudio.com` |

---

## 3. Authentication

All S2S API requests to GMS must be authenticated using **API Key + HMAC Signature**.

### Required Headers

| Header | Description | Example |
|--------|-------------|---------|
| `Authorization` | `Bearer {API_KEY}` | `Bearer op-live-abc123` |
| `X-GMS-Timestamp` | Current UTC time in ISO 8601 | `2026-06-12T15:30:45.1234567Z` |
| `X-GMS-Signature` | HMAC-SHA256 signature (hex) | `a1b2c3d4e5f6...` |
| `Content-Type` | Must be `application/json` | `application/json` |

### Signature Computation

The signature proves that you possess the API Secret and that the request has not been tampered with.

**Algorithm:**

```
signature_payload = "{HTTP_METHOD}{REQUEST_PATH}{TIMESTAMP}{REQUEST_BODY}"
signature = HMAC-SHA256(API_SECRET, signature_payload).ToHexLowerCase()
```

**Field definitions:**

| Field | Description | Example |
|-------|-------------|---------|
| `HTTP_METHOD` | Uppercase HTTP method | `POST`, `GET` |
| `REQUEST_PATH` | Path without query string | `/api/v1/players/login` |
| `TIMESTAMP` | Exact value from `X-GMS-Timestamp` header | `2026-06-12T15:30:45.1234567Z` |
| `REQUEST_BODY` | Raw JSON body (empty string `""` for GET) | `{"operatorPlayerId":"p123"}` |

**Example — signing a POST request:**

```
HTTP_METHOD    = "POST"
REQUEST_PATH   = "/api/v1/players/login"
TIMESTAMP      = "2026-06-12T15:30:45.1234567Z"
REQUEST_BODY   = '{"operatorPlayerId":"player-001","currency":"USD","displayName":"John"}'

signature_payload = 'POST/api/v1/players/login2026-06-12T15:30:45.1234567Z{"operatorPlayerId":"player-001","currency":"USD","displayName":"John"}'

signature = HMAC-SHA256("your-api-secret", signature_payload)
          = "8a3f2b1c..."  (hex, lowercase)
```

**Example — signing a GET request:**

```
HTTP_METHOD    = "GET"
REQUEST_PATH   = "/api/v1/games"       ← path only, NOT "/api/v1/games?page=1"
TIMESTAMP      = "2026-06-12T15:30:45Z"
REQUEST_BODY   = ""                     ← empty string for GET requests

signature_payload = 'GET/api/v1/games2026-06-12T15:30:45Z'
```

### Timestamp Validation

- Timestamps must be within **±5 minutes** of the server's current UTC time.
- Use UTC time and ISO 8601 format.
- Requests with stale timestamps are rejected with `401 Unauthorized`.

---

## 4. Integration Workflow

### Complete Player Flow

```
┌─────────┐          ┌───────────────┐          ┌─────────┐          ┌─────────────┐
│ Player  │          │  Operator     │          │  GMS    │          │ Game Engine │
│ Browser │          │  Backend      │          │ Backend │          │  Server     │
└────┬────┘          └──────┬────────┘          └────┬────┘          └──────┬──────┘
     │                      │                        │                      │
     │  1. Login to          │                        │                      │
     │     operator site     │                        │                      │
     │─────────────────────►│                        │                      │
     │                      │                        │                      │
     │                      │  2. POST /players/login│                      │
     │                      │───────────────────────►│                      │
     │                      │                        │                      │
     │                      │  3. { sessionId,       │                      │
     │                      │       playerId }       │                      │
     │                      │◄───────────────────────│                      │
     │                      │                        │                      │
     │  4. Player sees       │                        │                      │
     │     game lobby        │                        │                      │
     │◄─────────────────────│                        │                      │
     │                      │                        │                      │
     │  5. Click "Play"     │                        │                      │
     │─────────────────────►│                        │                      │
     │                      │  6. GET /games          │                      │
     │                      │───────────────────────►│                      │
     │                      │◄───────────────────────│                      │
     │                      │                        │                      │
     │                      │  7. POST /games/launch │                      │
     │                      │───────────────────────►│                      │
     │                      │                        │                      │
     │                      │  8. { launchUrl }       │                      │
     │                      │◄───────────────────────│                      │
     │                      │                        │                      │
     │  9. Redirect/iframe   │                        │                      │
     │     to launchUrl      │                        │                      │
     │────────────────────────────────────────────────────────────────────►│
     │                      │                        │                      │
     │  10. Player spins     │                        │                      │
     │◄────────────────────────────────────────────────────────────────────│
     │                      │                        │  11. Debit/Credit    │
     │                      │                        │◄─────────────────────│
     │                      │  12. Wallet callback   │                      │
     │                      │◄───────────────────────│  (Seamless only)     │
     │                      │───────────────────────►│                      │
     │                      │                        │─────────────────────►│
     │                      │                        │                      │
```

### Step-by-Step

| Step | Action | API | Who |
|------|--------|-----|-----|
| 1 | Player logs into operator website | Your auth system | Operator |
| 2 | Register/login player at GMS | `POST /api/v1/players/login` | Operator → GMS |
| 3 | Store returned `sessionId` | — | Operator |
| 4 | Show game lobby | `GET /api/v1/games` | Operator → GMS |
| 5 | Player selects a game | — | Player |
| 6 | Get game launch URL | `POST /api/v1/games/launch` | Operator → GMS |
| 7 | Redirect player to game | `launchUrl` from step 6 | Operator → Player |
| 8 | Player plays the game | — | Player ↔ Game Engine |
| 9 | (Seamless) Handle wallet callbacks | `POST /wallet/debit`, etc. | GMS → Operator |

---

## 5. API Reference

### Standard Response Format

All responses follow this envelope:

```json
{
  "success": true,
  "data": { ... },
  "requestId": "trace-id-for-debugging"
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "error_code",
    "message": "Human-readable description"
  },
  "requestId": "trace-id-for-debugging"
}
```

---

### 5.1 Player Login / Register

Registers a new player or logs in an existing player. Call this **every time** a player navigates to your game lobby or launches a game — GMS creates a fresh session each time.

```
POST /api/v1/players/login
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `operatorPlayerId` | string | Yes | Your unique player identifier. Must be consistent across calls. |
| `currency` | string | Yes | ISO 4217 currency code, exactly 3 uppercase characters (e.g., `"USD"`, `"EUR"`, `"CNY"`). **Immutable** — cannot change after first registration. |
| `locale` | string | No | Player's language preference (e.g., `"en-US"`, `"zh-CN"`). |
| `displayName` | string | No | Player's display name. |
| `metadata` | object | No | Key-value pairs for custom data (e.g., `{"vipLevel": "gold"}`). |

**Example Request:**

```json
{
  "operatorPlayerId": "player-12345",
  "currency": "USD",
  "locale": "en-US",
  "displayName": "John Doe",
  "metadata": {
    "vipLevel": "gold",
    "country": "US"
  }
}
```

**Response — `200 OK`:**

```json
{
  "success": true,
  "data": {
    "playerId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "operatorPlayerId": "player-12345",
    "sessionId": "a3f8c1b2d4e5f67890abcdef12345678a3f8c1b2d4e5f67890abcdef12345678",
    "expiresAt": "2026-06-12T19:30:45Z",
    "walletType": "Seamless",
    "isNewPlayer": true
  },
  "requestId": "0HN8G3..."
}
```

**Response Fields:**

| Field | Description |
|-------|-------------|
| `playerId` | GMS internal player ID (GUID). Store this for reference. |
| `operatorPlayerId` | Echo of your player ID. |
| `sessionId` | Session token (64-char hex string). **Required** for game launch and session validation. |
| `expiresAt` | Session expiration time (UTC). |
| `walletType` | `"Normal"` or `"Seamless"` — matches your operator configuration. |
| `isNewPlayer` | `true` if this is the first time this player is registered. |

**Important Notes:**
- `currency` is **immutable** — if you send a different currency for an existing player, GMS returns `400`.
- `sessionId` is a one-time-use token — call login again to get a new session.
- If `maxConcurrentSessions` is configured (default: 1), logging in revokes all previous active sessions.

---

### 5.2 Get Game List (Lobby)

Retrieve the list of games available for your operator.

```
GET /api/v1/games?category={category}&page={page}&pageSize={pageSize}
```

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `category` | string | (all) | Filter by game category: `"slots"`, `"table"`, `"live"` |
| `page` | int | 1 | Page number (1-based) |
| `pageSize` | int | 50 | Items per page (max 100) |

**Response — `200 OK`:**

```json
{
  "success": true,
  "data": {
    "games": [
      {
        "gameId": "asian-tour-01",
        "name": "Asian Tour",
        "category": "slots",
        "thumbnailUrl": "https://cdn.example.com/games/asian-tour/thumb.png",
        "status": "active",
        "minBet": "0.10",
        "maxBet": "100.00",
        "currencies": ["USD", "CNY"]
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 50,
      "total": 1
    }
  },
  "requestId": "0HN8G3..."
}
```

---

### 5.3 Get Game Detail

Retrieve detailed information about a specific game.

```
GET /api/v1/games/{gameId}
```

**Response — `200 OK`:**

```json
{
  "success": true,
  "data": {
    "gameId": "asian-tour-01",
    "name": "Asian Tour",
    "description": "High volatility cascading slot with free spins.",
    "category": "slots",
    "provider": "Your Studio",
    "version": "0.2.0",
    "status": "active",
    "thumbnailUrl": "https://cdn.example.com/games/asian-tour/thumb.png",
    "bannerUrl": "https://cdn.example.com/games/asian-tour/banner.png",
    "minBet": "0.10",
    "maxBet": "100.00",
    "currencies": ["USD", "CNY"],
    "locales": ["en-US", "zh-CN"],
    "features": ["cascading", "free-spins", "multiplier"],
    "rtp": "96.50"
  },
  "requestId": "0HN8G3..."
}
```

---

### 5.4 Launch Game

Generate a game launch URL for a player. The URL contains a signed JWT token that authorizes the player to play the game.

```
POST /api/v1/games/launch
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `gameId` | string | Yes | Game identifier from the game list. |
| `sessionId` | string | Yes | Active session ID from player login. |
| `locale` | string | No | Override player's locale for this game session. |
| `returnUrl` | string | No | URL to redirect when player exits the game. |
| `lobbyUrl` | string | No | URL for the "Back to Lobby" button inside the game. |
| `device` | string | No | `"desktop"` or `"mobile"` (default: `"desktop"`). |

**Example Request:**

```json
{
  "gameId": "asian-tour-01",
  "sessionId": "a3f8c1b2d4e5f67890abcdef12345678a3f8c1b2d4e5f67890abcdef12345678",
  "locale": "en-US",
  "returnUrl": "https://yoursite.com/games",
  "lobbyUrl": "https://yoursite.com/lobby",
  "device": "desktop"
}
```

**Response — `200 OK`:**

```json
{
  "success": true,
  "data": {
    "launchUrl": "https://play.yourstudio.com/play/asian-tour-01?launchToken=eyJhbGci...",
    "expiresAt": "2026-06-12T15:35:45Z",
    "gameId": "asian-tour-01",
    "sessionId": "a3f8c1b2..."
  },
  "requestId": "0HN8G3..."
}
```

**How to use `launchUrl`:**
- **Redirect** the player's browser to `launchUrl`, OR
- **Embed** it in an `<iframe>` on your page

The launch token expires in **5 minutes** — redirect the player immediately.

**Pre-launch Validations (performed by GMS):**
- Game must be enabled for your operator and in `Active` status.
- Session must be valid (not expired, not revoked).
- Player must not be suspended.
- (Normal wallet only) Player balance must meet minimum launch balance.

---

### 5.5 Validate Session

Check whether a session is still valid. Use this to verify session status before performing operations.

```
POST /api/v1/sessions/validate
```

**Request Body:**

```json
{
  "sessionId": "a3f8c1b2d4e5f67890abcdef12345678a3f8c1b2d4e5f67890abcdef12345678"
}
```

**Response — `200 OK`:**

```json
{
  "success": true,
  "data": {
    "valid": true,
    "playerId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "operatorPlayerId": "player-12345",
    "expiresAt": "2026-06-12T19:30:45Z",
    "walletType": "Seamless",
    "currency": "USD",
    "reason": null
  },
  "requestId": "0HN8G3..."
}
```

**If session is invalid:**

```json
{
  "success": true,
  "data": {
    "valid": false,
    "reason": "session_expired"
  }
}
```

**Possible `reason` values:**

| Reason | Description |
|--------|-------------|
| `not_found` | Session ID does not exist |
| `session_expired` | Session TTL has elapsed |
| `revoked` | Session was revoked (e.g., player logged in again) |
| `player_suspended` | Player account has been suspended |

---

### 5.6 Transfer Funds (Normal Wallet Only)

Transfer funds from the operator into a player's GMS wallet. **Not available for Seamless wallet operators.**

```
POST /api/v1/wallet/transfer
```

**Required Headers:**

| Header | Description |
|--------|-------------|
| `Idempotency-Key` | Unique key for this transfer. GMS returns cached response on duplicates. |

**Request Body:**

```json
{
  "sessionId": "a3f8c1b2...",
  "amount": "50.00",
  "currency": "USD",
  "reference": "deposit-ref-12345"
}
```

**Response — `200 OK`:**

```json
{
  "success": true,
  "data": {
    "transactionId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "balance": "1050.00",
    "currency": "USD"
  },
  "requestId": "0HN8G3..."
}
```

---

## 6. Seamless Wallet Callbacks

> **This section applies only to Seamless wallet operators.**

When a player plays a game, GMS calls your backend APIs for every financial operation. You must implement these endpoints at your `Callback Base URL`.

### Callback Authentication

GMS signs every callback request with your `Callback Secret`:

```
signature = HMAC-SHA256(CALLBACK_SECRET, REQUEST_BODY_JSON)
```

The signature is sent in the `X-GMS-Signature` header (hex, lowercase).

**You MUST verify this signature** on every callback to prevent unauthorized calls.

### Callback Request Format

All three callback endpoints receive the same request body format:

```json
{
  "operatorPlayerId": "player-12345",
  "amount": "10.00",
  "currency": "USD",
  "roundId": "b7e1c2d3-4f5a-6b7c-8d9e-0f1a2b3c4d5e",
  "gameId": "asian-tour-01",
  "transactionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2026-06-12T15:30:45.1234567Z"
}
```

| Field | Description |
|-------|-------------|
| `operatorPlayerId` | Your player identifier (same value you sent in login). |
| `amount` | Transaction amount as string with 2 decimal places. `"0.00"` for rollback. |
| `currency` | Player's currency code. |
| `roundId` | Unique game round identifier. Links debit + credit + rollback for same round. |
| `gameId` | Game identifier. |
| `transactionId` | GMS-generated unique transaction ID. Use this for idempotency. |
| `timestamp` | When GMS initiated the transaction (ISO 8601 UTC). |

### Expected Response Format

All callback endpoints must return:

```json
{
  "success": true,
  "balance": "990.00",
  "operatorTransactionId": "your-internal-tx-id",
  "errorCode": null,
  "message": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `success` | boolean | Yes | `true` if the operation succeeded. |
| `balance` | string | Yes | Player's balance **after** the operation. Must be a decimal string (e.g., `"990.00"`). |
| `operatorTransactionId` | string | No | Your internal transaction reference. Stored by GMS for reconciliation. |
| `errorCode` | string | No | Error code if `success` is `false`. |
| `message` | string | No | Human-readable error description. |

### 6.1 Debit (Bet)

Called when a player places a bet. Deduct the specified amount from the player's balance.

```
POST {CALLBACK_BASE_URL}/wallet/debit
```

**Your implementation must:**
1. Verify the `X-GMS-Signature` header.
2. Check the player exists and has sufficient balance.
3. Deduct `amount` from the player's balance atomically.
4. Return the new balance.

**Error case — insufficient funds:**

```json
{
  "success": false,
  "balance": "5.00",
  "operatorTransactionId": null,
  "errorCode": "insufficient_funds",
  "message": "Player does not have enough balance"
}
```

When GMS receives `success: false` with `errorCode: "insufficient_funds"`, the spin is rejected and the player sees an "insufficient balance" error in the game.

### 6.2 Credit (Win)

Called when a player wins. Add the specified amount to the player's balance.

```
POST {CALLBACK_BASE_URL}/wallet/credit
```

**Your implementation must:**
1. Verify the `X-GMS-Signature` header.
2. Add `amount` to the player's balance atomically.
3. Return the new balance.

**Note:** Credit should always succeed. If a credit fails, GMS treats it as a critical error.

### 6.3 Rollback

Called when a game round needs to be reversed (e.g., game server error, network timeout during a spin). Reverse the original debit for the given `roundId`.

```
POST {CALLBACK_BASE_URL}/wallet/rollback
```

**Your implementation must:**
1. Verify the `X-GMS-Signature` header.
2. Find the original debit transaction by `roundId`.
3. If found, reverse it (add the debited amount back).
4. If not found (debit never reached you), return success with current balance.
5. Return the balance after rollback.

**Important:** `amount` in the rollback request is `"0.00"` — you should look up the original debit amount by `roundId`.

### Idempotency

GMS may retry callback requests due to network issues. **Your callbacks must be idempotent.**

Use the `transactionId` field to detect duplicates:
- If you have already processed a `transactionId`, return the same response without performing the operation again.
- Never debit a player twice for the same `transactionId`.

### Callback Sequence Per Spin

```
Normal spin (player bets $1.00, wins $2.50):
  1. POST /wallet/debit   { amount: "1.00",  roundId: "round-X" }
  2. POST /wallet/credit   { amount: "2.50",  roundId: "round-X" }

Losing spin (player bets $1.00, wins nothing):
  1. POST /wallet/debit   { amount: "1.00",  roundId: "round-Y" }
  2. POST /wallet/credit   { amount: "0.00",  roundId: "round-Y" }  ← zero win

Error during spin (debit succeeded, game crashed):
  1. POST /wallet/debit   { amount: "1.00",  roundId: "round-Z" }
  2. POST /wallet/rollback { amount: "0.00",  roundId: "round-Z" }  ← reversal
```

---

## 7. Error Handling

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `400` | Bad Request — invalid input, validation error |
| `401` | Unauthorized — invalid API key, bad signature, or expired timestamp |
| `402` | Payment Required — insufficient funds |
| `403` | Forbidden — player suspended, wrong operator |
| `404` | Not Found — session, game, or player not found |
| `409` | Conflict — concurrent update conflict |
| `500` | Internal Server Error |

### Error Codes Reference

| Code | HTTP | Description |
|------|------|-------------|
| `unauthorized` | 401 | Invalid or missing operator credentials |
| `forbidden` | 403 | Session belongs to a different operator |
| `not_found` | 404 | Resource not found |
| `validation_error` | 400 | Invalid request parameters |
| `game_unavailable` | 404 | Game not active or not enabled for operator |
| `insufficient_funds` | 402 | Wallet balance too low |
| `session_expired` | 401 | Session TTL or idle timeout exceeded |
| `session_revoked` | 401 | Session revoked by new login |
| `player_suspended` | 403 | Player account suspended |
| `conflict` | 409 | Concurrency conflict (retry the request) |
| `wallet_type_mismatch` | 400 | Operation not available for your wallet type |
| `callback_not_configured` | 500 | Seamless callback URL not configured |
| `callback_timeout` | 500 | Seamless callback to operator failed |

### Retry Strategy

| Error Type | Action |
|------------|--------|
| `409` Conflict | Retry immediately (up to 3 times) |
| `5xx` Server Error | Retry with exponential backoff (1s, 2s, 4s) |
| `401` Unauthorized | Check credentials and timestamp — do not retry |
| `4xx` Client Error | Fix the request — do not retry |

---

## 8. Session Management

### Session Lifecycle

```
                    Login
Player ──────────► [Active] ─────────► [Expired]
                      │                    (TTL elapsed)
                      │
                      ├──► [Revoked]    (new login created)
                      │
                      └──► [Invalid]    (player suspended)
```

### Session Configuration (Per Operator)

| Setting | Default | Description |
|---------|---------|-------------|
| `sessionTtlMinutes` | 240 | How long a session stays valid (max lifetime). |
| `idleTtlMinutes` | 30 | Session expires after this many minutes of inactivity. |
| `maxConcurrentSessions` | 1 | Max active sessions per player. New login revokes oldest. Set to 0 for unlimited. |
| `extendOnActivity` | true | Reset idle timeout on every game action. |

### Best Practices

1. **Call login every time** the player visits your game lobby — don't reuse old session IDs.
2. **Store `sessionId`** server-side, associated with your own session.
3. **Handle revoked sessions** — if a player opens your site in two tabs, the first tab's session is revoked. Show a "session expired" message and prompt re-login.
4. **Use `POST /sessions/validate`** to check session status before launching a game, especially if the player has been idle.

---

## 9. Security Best Practices

### For S2S Communication

1. **Always validate HMAC signatures** in production. Never skip signature validation.
2. **Use HTTPS** for all API calls. Never send credentials over plain HTTP.
3. **Keep your API Secret private.** Store it in a secrets manager (e.g., AWS Secrets Manager, Azure Key Vault), not in source code or config files.
4. **Validate timestamps** — reject requests with timestamps more than 5 minutes old.
5. **Log all S2S API calls** for audit and debugging purposes.

### For Seamless Wallet Callbacks

1. **Always verify the `X-GMS-Signature`** on every callback request before processing.
2. **Implement idempotency** using `transactionId` — this prevents double-deduction from retried requests.
3. **Use atomic operations** for balance updates — ensure no race conditions between concurrent callbacks.
4. **Return accurate balances** — the balance in your response is what the player sees in the game UI.
5. **Never reject credit (win) callbacks** — if a player won, you must pay them. Only reject debits for insufficient funds.
6. **Handle rollbacks gracefully** — even if you never received the original debit, return success with the current balance.

### For Player-Facing Pages

1. **Never expose API keys** or session IDs in client-side JavaScript.
2. **Validate the `launchUrl`** before redirecting — ensure it points to the expected game server domain.
3. **Use `returnUrl` and `lobbyUrl`** so players can navigate back to your site from the game.

---

## 10. Code Examples

### Python

```python
import hashlib
import hmac
import json
import time
from datetime import datetime, timezone

import requests

GMS_BASE_URL = "https://gms.yourstudio.com"
API_KEY = "your-api-key"
API_SECRET = "your-api-secret"


def compute_signature(method: str, path: str, timestamp: str, body: str) -> str:
    payload = f"{method}{path}{timestamp}{body}"
    return hmac.new(
        API_SECRET.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()


def gms_request(method: str, path: str, body: dict | None = None) -> dict:
    timestamp = datetime.now(timezone.utc).isoformat()
    json_body = json.dumps(body, separators=(",", ":")) if body else ""
    # Strip query string for signature
    sign_path = path.split("?")[0]
    signature = compute_signature(method, sign_path, timestamp, json_body)

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "X-GMS-Timestamp": timestamp,
        "X-GMS-Signature": signature,
        "Content-Type": "application/json",
    }

    resp = requests.request(
        method, f"{GMS_BASE_URL}{path}",
        headers=headers,
        data=json_body if body else None,
    )
    resp.raise_for_status()
    return resp.json()


# --- Player Login ---
login_result = gms_request("POST", "/api/v1/players/login", {
    "operatorPlayerId": "player-001",
    "currency": "USD",
    "displayName": "John Doe",
})
session_id = login_result["data"]["sessionId"]
print(f"Session ID: {session_id}")

# --- Get Game List ---
games = gms_request("GET", "/api/v1/games?category=slots")
for game in games["data"]["games"]:
    print(f"  {game['gameId']}: {game['name']}")

# --- Launch Game ---
launch = gms_request("POST", "/api/v1/games/launch", {
    "gameId": "asian-tour-01",
    "sessionId": session_id,
    "lobbyUrl": "https://yoursite.com/lobby",
})
print(f"Launch URL: {launch['data']['launchUrl']}")
```

### Python — Seamless Wallet Callback Handler (Flask)

```python
import hashlib
import hmac
import json
from flask import Flask, request, jsonify

app = Flask(__name__)
CALLBACK_SECRET = "your-callback-secret"

# In-memory wallet (replace with database in production)
wallets = {"player-001": 1000.00}
processed_txns = {}  # transactionId -> operatorTransactionId


def verify_signature(body_bytes: bytes) -> bool:
    expected = hmac.new(
        CALLBACK_SECRET.encode(), body_bytes, hashlib.sha256
    ).hexdigest()
    received = request.headers.get("X-GMS-Signature", "")
    return hmac.compare_digest(expected.lower(), received.lower())


@app.post("/wallet/debit")
def debit():
    body = request.get_data()
    if not verify_signature(body):
        return jsonify(success=False, errorCode="invalid_signature"), 401

    data = json.loads(body)
    player_id = data["operatorPlayerId"]
    amount = float(data["amount"])
    tx_id = data["transactionId"]

    # Idempotency check
    if tx_id in processed_txns:
        return jsonify(
            success=True,
            balance=f"{wallets.get(player_id, 0):.2f}",
            operatorTransactionId=processed_txns[tx_id],
        )

    balance = wallets.get(player_id, 0)
    if balance < amount:
        return jsonify(
            success=False, balance=f"{balance:.2f}",
            errorCode="insufficient_funds",
            message="Not enough balance",
        )

    wallets[player_id] = balance - amount
    op_tx_id = f"op-{tx_id[:8]}"
    processed_txns[tx_id] = op_tx_id

    return jsonify(
        success=True,
        balance=f"{wallets[player_id]:.2f}",
        operatorTransactionId=op_tx_id,
    )


@app.post("/wallet/credit")
def credit():
    body = request.get_data()
    if not verify_signature(body):
        return jsonify(success=False, errorCode="invalid_signature"), 401

    data = json.loads(body)
    player_id = data["operatorPlayerId"]
    amount = float(data["amount"])
    tx_id = data["transactionId"]

    if tx_id in processed_txns:
        return jsonify(
            success=True,
            balance=f"{wallets.get(player_id, 0):.2f}",
            operatorTransactionId=processed_txns[tx_id],
        )

    wallets[player_id] = wallets.get(player_id, 0) + amount
    op_tx_id = f"op-{tx_id[:8]}"
    processed_txns[tx_id] = op_tx_id

    return jsonify(
        success=True,
        balance=f"{wallets[player_id]:.2f}",
        operatorTransactionId=op_tx_id,
    )


@app.post("/wallet/rollback")
def rollback():
    body = request.get_data()
    if not verify_signature(body):
        return jsonify(success=False, errorCode="invalid_signature"), 401

    data = json.loads(body)
    player_id = data["operatorPlayerId"]
    tx_id = data["transactionId"]

    if tx_id in processed_txns:
        return jsonify(
            success=True,
            balance=f"{wallets.get(player_id, 0):.2f}",
            operatorTransactionId=processed_txns[tx_id],
        )

    # In production, look up the original debit by roundId and reverse it
    op_tx_id = f"op-{tx_id[:8]}"
    processed_txns[tx_id] = op_tx_id

    return jsonify(
        success=True,
        balance=f"{wallets.get(player_id, 0):.2f}",
        operatorTransactionId=op_tx_id,
    )
```

### C# (.NET)

```csharp
using System.Globalization;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

public class GmsApiClient
{
    private readonly HttpClient _http;
    private readonly string _apiKey;
    private readonly string _apiSecret;

    public GmsApiClient(string baseUrl, string apiKey, string apiSecret)
    {
        _http = new HttpClient { BaseAddress = new Uri(baseUrl) };
        _apiKey = apiKey;
        _apiSecret = apiSecret;
    }

    public async Task<JsonDocument> LoginPlayerAsync(
        string operatorPlayerId, string currency, string? displayName = null)
    {
        var body = new { operatorPlayerId, currency, displayName };
        return await SendSignedAsync(HttpMethod.Post, "/api/v1/players/login", body);
    }

    public async Task<JsonDocument> GetGamesAsync(string? category = null)
    {
        var path = "/api/v1/games";
        if (category is not null) path += $"?category={category}";
        return await SendSignedAsync(HttpMethod.Get, path, null);
    }

    public async Task<JsonDocument> LaunchGameAsync(string gameId, string sessionId)
    {
        var body = new { gameId, sessionId };
        return await SendSignedAsync(HttpMethod.Post, "/api/v1/games/launch", body);
    }

    private async Task<JsonDocument> SendSignedAsync(
        HttpMethod method, string path, object? body)
    {
        var timestamp = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);
        var json = body is not null ? JsonSerializer.Serialize(body) : "";
        var signPath = path.Split('?')[0];

        var payload = $"{method.Method}{signPath}{timestamp}{json}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_apiSecret));
        var signature = Convert.ToHexString(
            hmac.ComputeHash(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();

        using var request = new HttpRequestMessage(method, path);
        request.Headers.Add("Authorization", $"Bearer {_apiKey}");
        request.Headers.Add("X-GMS-Timestamp", timestamp);
        request.Headers.Add("X-GMS-Signature", signature);

        if (body is not null)
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");

        using var response = await _http.SendAsync(request);
        response.EnsureSuccessStatusCode();
        return await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
    }
}
```

### JavaScript (Node.js)

```javascript
const crypto = require('crypto');
const https = require('https');

const GMS_BASE_URL = 'https://gms.yourstudio.com';
const API_KEY = 'your-api-key';
const API_SECRET = 'your-api-secret';

function computeSignature(method, path, timestamp, body) {
  const payload = `${method}${path}${timestamp}${body}`;
  return crypto.createHmac('sha256', API_SECRET).update(payload).digest('hex');
}

async function gmsRequest(method, path, body = null) {
  const timestamp = new Date().toISOString();
  const jsonBody = body ? JSON.stringify(body) : '';
  const signPath = path.split('?')[0];
  const signature = computeSignature(method, signPath, timestamp, jsonBody);

  const res = await fetch(`${GMS_BASE_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'X-GMS-Timestamp': timestamp,
      'X-GMS-Signature': signature,
      'Content-Type': 'application/json',
    },
    body: body ? jsonBody : undefined,
  });

  if (!res.ok) throw new Error(`GMS error: ${res.status} ${await res.text()}`);
  return res.json();
}

// --- Usage ---
async function main() {
  // Login
  const login = await gmsRequest('POST', '/api/v1/players/login', {
    operatorPlayerId: 'player-001',
    currency: 'USD',
    displayName: 'John Doe',
  });
  const sessionId = login.data.sessionId;
  console.log('Session:', sessionId);

  // Get games
  const games = await gmsRequest('GET', '/api/v1/games');
  console.log('Games:', games.data.games.map(g => g.name));

  // Launch
  const launch = await gmsRequest('POST', '/api/v1/games/launch', {
    gameId: 'asian-tour-01',
    sessionId,
  });
  console.log('Launch URL:', launch.data.launchUrl);
}

main().catch(console.error);
```

### JavaScript — Seamless Wallet Callback Handler (Express)

```javascript
const express = require('express');
const crypto = require('crypto');

const app = express();
const CALLBACK_SECRET = 'your-callback-secret';

// In-memory wallet (replace with database in production)
const wallets = { 'player-001': 1000.00 };
const processedTxns = new Map();

// Middleware: capture raw body for signature verification
app.use('/wallet', express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));

function verifySignature(req) {
  const expected = crypto
    .createHmac('sha256', CALLBACK_SECRET)
    .update(req.rawBody)
    .digest('hex');
  const received = req.headers['x-gms-signature'] || '';
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(received.toLowerCase(), 'hex')
  );
}

app.post('/wallet/debit', (req, res) => {
  if (!verifySignature(req))
    return res.status(401).json({ success: false, errorCode: 'invalid_signature' });

  const { operatorPlayerId, amount, transactionId } = req.body;
  const amt = parseFloat(amount);

  // Idempotency
  if (processedTxns.has(transactionId)) {
    return res.json({
      success: true,
      balance: (wallets[operatorPlayerId] || 0).toFixed(2),
      operatorTransactionId: processedTxns.get(transactionId),
    });
  }

  const balance = wallets[operatorPlayerId] || 0;
  if (balance < amt) {
    return res.json({
      success: false, balance: balance.toFixed(2),
      errorCode: 'insufficient_funds', message: 'Not enough balance',
    });
  }

  wallets[operatorPlayerId] = balance - amt;
  const opTxId = `op-${transactionId.slice(0, 8)}`;
  processedTxns.set(transactionId, opTxId);

  res.json({
    success: true,
    balance: wallets[operatorPlayerId].toFixed(2),
    operatorTransactionId: opTxId,
  });
});

// credit and rollback follow the same pattern...

app.listen(9090, () => console.log('Wallet callback server on :9090'));
```

---

## 11. Testing & Sandbox

### Sandbox Credentials

| Field | Value |
|-------|-------|
| API Key (Normal) | `demo-normal-key` |
| API Secret (Normal) | `demo-normal-secret` |
| API Key (Seamless) | `demo-seamless-key` |
| API Secret (Seamless) | `demo-seamless-secret` |
| Callback Secret | `demo-callback-secret` |

> **Note:** In sandbox, HMAC signature validation is **disabled** (`SkipSignatureValidation: true`). You can call the API with just the `Authorization: Bearer {API_KEY}` header for quick testing. Always implement proper signing for production.

### Quick Test with curl

```bash
# 1. Health check
curl -s http://localhost:5080/health | jq .

# 2. Login a player
curl -s -X POST http://localhost:5080/api/v1/players/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer demo-seamless-key" \
  -d '{"operatorPlayerId":"test-player","currency":"USD","displayName":"Test Player"}' \
  | jq .

# 3. Get game list
curl -s http://localhost:5080/api/v1/games \
  -H "Authorization: Bearer demo-seamless-key" \
  | jq .

# 4. Launch game (replace SESSION_ID)
curl -s -X POST http://localhost:5080/api/v1/games/launch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer demo-seamless-key" \
  -d '{"gameId":"asian-tour-01","sessionId":"SESSION_ID"}' \
  | jq .

# 5. Validate session
curl -s -X POST http://localhost:5080/api/v1/sessions/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer demo-seamless-key" \
  -d '{"sessionId":"SESSION_ID"}' \
  | jq .
```

### Integration Test Checklist

- [ ] Player login/register works
- [ ] Same player ID returns `isNewPlayer: false` on second login
- [ ] Currency mismatch returns 400 error
- [ ] Game list returns enabled games
- [ ] Game launch returns valid `launchUrl`
- [ ] Expired session returns appropriate error
- [ ] Session validation returns correct status
- [ ] (Normal) Transfer funds updates balance
- [ ] (Seamless) Debit callback deducts balance
- [ ] (Seamless) Credit callback adds balance
- [ ] (Seamless) Rollback reverses original debit
- [ ] (Seamless) Duplicate `transactionId` returns idempotent response
- [ ] (Seamless) Insufficient funds returns `success: false`
- [ ] (Seamless) Invalid signature returns 401
- [ ] HMAC signature computation matches GMS validation

---

## 12. FAQ

**Q: Can a player have multiple currencies?**  
A: No. Currency is set on first login and cannot be changed. Create a separate player ID per currency if needed.

**Q: What happens when a player logs in from a second device?**  
A: If `maxConcurrentSessions` is 1 (default), the first session is revoked. The game in the first tab will show a "session expired" message.

**Q: How long is the launch token valid?**  
A: 5 minutes. Redirect the player immediately after receiving `launchUrl`.

**Q: Do I need to implement all three wallet callbacks?**  
A: Yes, if you are a Seamless wallet operator. All three (debit, credit, rollback) are required.

**Q: What if my callback server is temporarily down?**  
A: GMS does not retry failed callbacks automatically. The game spin will fail, and the player will see an error. Ensure your callback server has high availability.

**Q: Can I use the same `operatorPlayerId` across different operator accounts?**  
A: Player IDs are scoped per operator. The same string in different operator accounts creates different players.

**Q: How do I test seamless callbacks without running the game engine?**  
A: Use the `seamless-demo` project included in this repository, or send test requests directly with `curl` (see Section 11).

**Q: What encoding should I use for the HMAC signature?**  
A: UTF-8 for input, hexadecimal lowercase for output. Example: `a1b2c3d4...` (not Base64, not uppercase).

---

**Need help?** Contact our integration team at `integration@yourstudio.com`.
