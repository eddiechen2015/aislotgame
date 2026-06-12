# Wallet Management

Wallet Management handles all monetary operations for players integrated through GMS. It supports two distinct models configured per operator: **normal wallet** and **seamless wallet**.

## Wallet Types Overview

| Aspect | Normal Wallet | Seamless Wallet |
|--------|---------------|-----------------|
| Balance held in GMS | Yes — casino wallet per player | No |
| Authoritative balance | Casino wallet in GMS (for play) | Operator main wallet |
| Fund entry | Operator transfer API | N/A (funds stay on operator) |
| Bet debit | Deduct from casino wallet | Callback to operator |
| Win credit | Credit casino wallet | Callback to operator |
| Transfer API | Required | Not available |

## Normal Wallet

### Concept

```text
┌──────────────────┐         transfer in          ┌──────────────────┐
│  Operator        │ ───────────────────────────► │  GMS Casino      │
│  Main Wallet     │         (via API)            │  Wallet          │
│  (operator side) │ ◄─────────────────────────── │  (GMS side)      │
└──────────────────┘         transfer out         └──────────────────┘
                              (future / optional)
```

The operator's main wallet is the source of truth for the player's overall funds. For gameplay, the operator moves a portion into the GMS casino wallet. All bets and wins during a session operate on the casino wallet.

### Casino Wallet Record

| Field | Description |
|-------|-------------|
| `playerId` | Linked player |
| `currency` | Must match player currency |
| `balance` | Current available balance (decimal, high precision) |
| `updatedAt` | Last mutation timestamp |

### Ledger Entries

Every balance change appends an immutable ledger entry:

| Field | Description |
|-------|-------------|
| `id` | Transaction GUID |
| `playerId` | Player reference |
| `type` | `TransferIn`, `TransferOut`, `Bet`, `Win`, `Rollback` |
| `amount` | Positive for credits, negative for debits |
| `balanceAfter` | Running balance snapshot |
| `referenceId` | Idempotency key or game round ID |
| `createdAt` | Timestamp |

### Transfer In (Operator API)

```text
POST /api/v1/wallet/transfer
```

Operator moves funds from main wallet (on their side) into the casino wallet (GMS side).

**Preconditions:**

- Player has an active session (or session ID provided)
- Operator has already debited main wallet on their side
- Amount > 0
- Currency matches player currency

**Effects:**

- Credit casino wallet balance
- Append `TransferIn` ledger entry
- Return new balance

**Idempotency:** Duplicate `Idempotency-Key` returns original result.

### Bet and Win (Internal — Game Engine)

When a spin occurs under normal wallet:

```text
1. Game engine requests bet debit (amount, roundId)
2. GMS checks casino wallet balance ≥ amount
3. If insufficient → reject spin (insufficient_funds)
4. Debit casino wallet, append Bet ledger entry
5. Execute spin via game engine
6. On win → credit casino wallet, append Win ledger entry
7. On rollback (failed spin) → reverse bet, append Rollback entry
```

All bet/win operations use `roundId` as idempotency key to prevent double settlement.

### Transfer Out (Future)

Allow operator to pull remaining casino wallet balance back to main wallet. Not in v1 operator API scope but ledger type is reserved.

## Seamless Wallet

### Concept

```text
┌──────────────────┐                              ┌──────────────────┐
│  Operator        │ ◄──── debit / credit ────────│  GMS             │
│  Main Wallet     │       callback API           │  (no balance)    │
│  (authoritative) │                              │                  │
└──────────────────┘                              └──────────────────┘
```

GMS never holds a balance. Every monetary action is delegated to the operator via HTTP callbacks.

### Operator Callback Contract (GMS → Operator)

The operator must implement these endpoints (base URL configured per operator):

| Callback | Method | Purpose |
|----------|--------|---------|
| `{baseUrl}/wallet/debit` | POST | Deduct bet amount before spin |
| `{baseUrl}/wallet/credit` | POST | Credit win amount after spin |
| `{baseUrl}/wallet/rollback` | POST | Reverse a failed or cancelled debit |

#### Debit Request (GMS → Operator)

```json
{
  "operatorPlayerId": "string",
  "amount": "10.00",
  "currency": "USD",
  "roundId": "uuid",
  "gameId": "asian-tour-01",
  "transactionId": "uuid",
  "timestamp": "2026-06-12T10:00:00Z"
}
```

#### Debit Response (Operator → GMS)

```json
{
  "success": true,
  "balance": "990.00",
  "operatorTransactionId": "op-tx-123"
}
```

On failure:

```json
{
  "success": false,
  "errorCode": "insufficient_funds",
  "message": "Player balance too low"
}
```

### Seamless Spin Flow

```text
1. Game engine → GMS: request bet (sessionId, amount, roundId)
2. GMS → Operator: POST /wallet/debit
3. If operator returns success:
     a. Record pending transaction (status: debited)
     b. Allow spin to proceed
4. If operator returns failure:
     a. Reject spin immediately (no retry unless configured)
5. After spin result:
     a. If win > 0 → GMS → Operator: POST /wallet/credit
     b. If spin failed after debit → GMS → Operator: POST /wallet/rollback
6. Mark transaction settled
```

### Callback Requirements

| Requirement | Detail |
|-------------|--------|
| Timeout | GMS waits up to 5s (configurable); timeout = bet failure |
| Idempotency | `transactionId` must be unique; operator returns same result on retry |
| Authentication | HMAC signature in `X-GMS-Signature` header |
| Ordering | Debit must succeed before spin; credit/rollback after spin only |

### Failure Modes

| Scenario | GMS Behavior |
|----------|--------------|
| Debit timeout | Fail spin; optionally retry debit with same transactionId |
| Debit success, spin crash | Rollback debit via operator callback |
| Credit timeout after win | Queue retry with exponential backoff; alert ops |
| Operator unreachable | Fail closed — no spins until operator recovers |

## Wallet Type Configuration

Set at the **operator** level during onboarding:

```json
{
  "operatorId": "op-abc",
  "walletType": "Seamless",
  "callbackBaseUrl": "https://operator.example.com/gms",
  "callbackSecret": "<shared-secret>"
}
```

Players inherit wallet type from their operator. Mixed wallet types per player are not supported.

## Reconciliation

### Normal Wallet

- GMS ledger is source of truth for casino wallet
- Operators reconcile transfer-in amounts against their main wallet debits
- Periodic statements: opening balance, transfers, bets, wins, closing balance

### Seamless Wallet

- GMS transaction log maps `transactionId` ↔ `operatorTransactionId`
- Operators reconcile callback logs against game round reports
- Mismatch alerts for missing credits or orphan debits

## Audit Events

| Event | Wallet Type |
|-------|-------------|
| `wallet.transfer_in` | Normal |
| `wallet.transfer_out` | Normal (future) |
| `wallet.bet` | Normal |
| `wallet.win` | Normal |
| `wallet.callback.debit` | Seamless |
| `wallet.callback.credit` | Seamless |
| `wallet.callback.rollback` | Seamless |
| `wallet.insufficient_funds` | Both |

## Security

- All monetary amounts use `decimal` type; never floating point
- Currency mismatch between request and player record is rejected
- Negative transfer amounts rejected at API boundary
- Rate limiting on transfer endpoint per operator
- Seamless callback URLs must be HTTPS
