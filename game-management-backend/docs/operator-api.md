# Operator Service-to-Service API

This document defines the HTTP API that third-party operators call to integrate with the Game Management Backend (GMS).

**Base URL:** `https://gms.example.com/api/v1`  
**Protocol:** HTTPS only  
**Format:** JSON request and response bodies  
**Versioning:** URL path prefix (`/v1`); breaking changes increment version

## Authentication

All requests require operator credentials.

```http
Authorization: Bearer <api-key>
X-GMS-Timestamp: 2026-06-12T10:00:00Z
X-GMS-Signature: <hmac-sha256 of method + path + timestamp + body>
```

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | Bearer token (operator API key) |
| `X-GMS-Timestamp` | Yes | ISO 8601 UTC; requests older than 5 minutes rejected |
| `X-GMS-Signature` | Yes | HMAC-SHA256 hex digest using operator secret |
| `Idempotency-Key` | Conditional | Required for money transfer; recommended for login |
| `X-Request-Id` | Optional | Client correlation ID; echoed in response |

## Common Response Envelope

### Success

```json
{
  "success": true,
  "data": { },
  "requestId": "req-uuid"
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "insufficient_funds",
    "message": "Human-readable description"
  },
  "requestId": "req-uuid"
}
```

### Standard Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `unauthorized` | 401 | Invalid or missing credentials |
| `forbidden` | 403 | Operator not permitted for this resource |
| `not_found` | 404 | Player, session, or game not found |
| `validation_error` | 400 | Invalid request body or parameters |
| `session_expired` | 401 | Session TTL exceeded |
| `session_revoked` | 401 | Session explicitly invalidated |
| `player_suspended` | 403 | Player account suspended |
| `insufficient_funds` | 402 | Casino wallet balance too low |
| `wallet_type_mismatch` | 400 | Endpoint not available for operator wallet type |
| `game_unavailable` | 404 | Game not enabled for this operator |
| `internal_error` | 500 | Unexpected server error |

---

## API Endpoints

### a. Player Login / Register

Creates a player if one does not exist, then opens a new session.

**`POST /players/login`**

Available for: Normal wallet ✓ | Seamless wallet ✓

#### Request

```json
{
  "operatorPlayerId": "player-12345",
  "currency": "USD",
  "locale": "en-US",
  "displayName": "Player One",
  "metadata": {
    "brand": "casino-a"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `operatorPlayerId` | Yes | Operator's unique player identifier |
| `currency` | Yes | ISO 4217; locked on first registration |
| `locale` | No | BCP 47 locale for game UI |
| `displayName` | No | Display name in game |
| `metadata` | No | Opaque key-value passthrough |

#### Response

```json
{
  "success": true,
  "data": {
    "playerId": "gms-player-uuid",
    "operatorPlayerId": "player-12345",
    "sessionId": "session-token-uuid",
    "expiresAt": "2026-06-12T14:00:00Z",
    "walletType": "Normal",
    "isNewPlayer": false
  }
}
```

#### Behavior

- If `(operator, operatorPlayerId)` not found → create player, `isNewPlayer: true`
- If found → update `lastLoginAt`, return existing `playerId`
- Always create a new session (subject to concurrent session policy)
- `walletType` reflects operator configuration

---

### b. Session Validation

Check whether a session is still valid.

**`POST /sessions/validate`**

Available for: Normal wallet ✓ | Seamless wallet ✓

#### Request

```json
{
  "sessionId": "session-token-uuid"
}
```

#### Response — Valid

```json
{
  "success": true,
  "data": {
    "valid": true,
    "playerId": "gms-player-uuid",
    "operatorPlayerId": "player-12345",
    "expiresAt": "2026-06-12T14:00:00Z",
    "walletType": "Normal",
    "currency": "USD"
  }
}
```

#### Response — Invalid

```json
{
  "success": true,
  "data": {
    "valid": false,
    "reason": "session_expired"
  }
}
```

---

### c. Money Transfer

Transfer funds from operator main wallet into GMS casino wallet.

**`POST /wallet/transfer`**

Available for: Normal wallet ✓ | Seamless wallet ✗

#### Request

```json
{
  "sessionId": "session-token-uuid",
  "amount": "100.00",
  "currency": "USD",
  "reference": "operator-tx-98765"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `sessionId` | Yes | Active player session |
| `amount` | Yes | Positive decimal string |
| `currency` | Yes | Must match player currency |
| `reference` | No | Operator-side transaction reference for reconciliation |

**Header:** `Idempotency-Key` required.

#### Response

```json
{
  "success": true,
  "data": {
    "transactionId": "gms-tx-uuid",
    "balance": "150.00",
    "currency": "USD"
  }
}
```

#### Errors

| Code | Condition |
|------|-----------|
| `wallet_type_mismatch` | Operator uses seamless wallet |
| `session_expired` | Session no longer valid |
| `validation_error` | Amount ≤ 0 or currency mismatch |

---

### d. Game List

Retrieve games available to the authenticated operator.

**`GET /games`**

Available for: Normal wallet ✓ | Seamless wallet ✓

#### Query Parameters

| Param | Required | Description |
|-------|----------|-------------|
| `locale` | No | Filter/localize game names |
| `category` | No | Filter by category (e.g. `slots`) |
| `page` | No | Page number (default 1) |
| `pageSize` | No | Items per page (default 50, max 100) |

#### Response

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
  }
}
```

---

### e. Game Information

Get detailed information for a specific game.

**`GET /games/{gameId}`**

Available for: Normal wallet ✓ | Seamless wallet ✓

#### Response

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
  }
}
```

#### Errors

| Code | Condition |
|------|-----------|
| `game_unavailable` | Game not enabled for this operator |
| `not_found` | Unknown gameId |

---

### f. Game Launch URL

Obtain a URL to launch a game for an authenticated player.

**`POST /games/launch`**

Available for: Normal wallet ✓ | Seamless wallet ✓

#### Request

```json
{
  "gameId": "asian-tour-01",
  "sessionId": "session-token-uuid",
  "locale": "en-US",
  "returnUrl": "https://operator.example.com/lobby",
  "lobbyUrl": "https://operator.example.com/lobby",
  "device": "desktop"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `gameId` | Yes | Game to launch |
| `sessionId` | Yes | Active player session |
| `locale` | No | Override session locale |
| `returnUrl` | No | URL when player exits game |
| `lobbyUrl` | No | In-game home button destination |
| `device` | No | `desktop` or `mobile` (default `desktop`) |

#### Response

```json
{
  "success": true,
  "data": {
    "launchUrl": "https://play.example.com/play/asian-tour-01?launchToken=signed-jwt",
    "expiresAt": "2026-06-12T10:05:00Z",
    "gameId": "asian-tour-01",
    "sessionId": "session-token-uuid"
  }
}
```

#### Behavior

1. Validate session (must be active)
2. Confirm game is enabled for operator
3. For normal wallet: optional minimum balance check (configurable)
4. Generate short-lived signed launch URL (default TTL: 5 minutes)
5. Return URL for operator to redirect player (iframe or new window)

#### Errors

| Code | Condition |
|------|-----------|
| `session_expired` | Session invalid |
| `game_unavailable` | Game not enabled for operator |
| `insufficient_funds` | Normal wallet below minimum (if enforced) |

---

## Rate Limits (Planned)

| Endpoint | Limit |
|----------|-------|
| `POST /players/login` | 100 req/min per operator |
| `POST /sessions/validate` | 1000 req/min per operator |
| `POST /wallet/transfer` | 200 req/min per operator |
| `GET /games` | 60 req/min per operator |
| `POST /games/launch` | 300 req/min per operator |

## Webhooks (Future)

GMS may push async events to operators (big win alerts, session anomalies). Not in v1 scope.

## OpenAPI

A machine-readable OpenAPI 3.1 specification will be generated from implementation and published at:

```text
GET /api/v1/openapi.json
```
