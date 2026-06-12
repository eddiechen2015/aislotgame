# GMS Implementation Guide

## Run locally

```bash
cd game-management-backend
dotnet restore
dotnet build
dotnet run --project src/Gms.Api
```

API listens on `http://localhost:5080`.

## Demo operators (seeded on startup)

| Wallet type | API key | Secret |
|-------------|---------|--------|
| Normal | `demo-normal-key` | `demo-normal-secret` |
| Seamless | `demo-seamless-key` | `demo-seamless-secret` |

Signature validation is **disabled** in development (`Gms:SkipSignatureValidation: true`).

## Example: player login

```bash
curl -s -X POST http://localhost:5080/api/v1/players/login \
  -H "Authorization: Bearer demo-normal-key" \
  -H "Content-Type: application/json" \
  -d '{"operatorPlayerId":"player-1","currency":"USD","displayName":"Test"}'
```

## Example: wallet transfer

```bash
curl -s -X POST http://localhost:5080/api/v1/wallet/transfer \
  -H "Authorization: Bearer demo-normal-key" \
  -H "Idempotency-Key: transfer-001" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<sessionId>","amount":"100.00","currency":"USD"}'
```

## Example: game launch

```bash
curl -s -X POST http://localhost:5080/api/v1/games/launch \
  -H "Authorization: Bearer demo-normal-key" \
  -H "Content-Type: application/json" \
  -d '{"gameId":"asian-tour-01","sessionId":"<sessionId>"}'
```

## Internal API (Game Engine Service)

Header: `X-Internal-Api-Key: dev-internal-ges-key`

```bash
curl -s http://localhost:5080/api/v1/internal/sessions/<sessionId> \
  -H "X-Internal-Api-Key: dev-internal-ges-key"
```

## Tests

```bash
dotnet test
```
