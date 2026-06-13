# Seamless Demo - Operator Website

Demo operator website that integrates with the GMS (Game Management System) backend using the **seamless wallet** model.

## Architecture

```
Browser                    seamless-demo (:9090)              GMS (:5080)           Game Engine (:3000)
  │                              │                               │                        │
  │── GET / ──────────────────►  │                               │                        │
  │◄── Login page ──────────────│                               │                        │
  │                              │                               │                        │
  │── POST /api/auth/login ───► │                               │                        │
  │                              │── POST /api/v1/players/login ►│                        │
  │                              │◄── sessionId ─────────────────│                        │
  │◄── token + redirect ────────│                               │                        │
  │                              │                               │                        │
  │── GET /api/lobby/games ───► │                               │                        │
  │                              │── GET /api/v1/games ─────────►│                        │
  │                              │◄── games list ────────────────│                        │
  │◄── games ───────────────────│                               │                        │
  │                              │                               │                        │
  │── POST /api/lobby/launch ─► │                               │                        │
  │                              │── POST /api/v1/games/launch ─►│                        │
  │                              │◄── launchUrl (JWT) ───────────│                        │
  │◄── launchUrl ───────────────│                               │                        │
  │                              │                               │                        │
  │══ REDIRECT to launchUrl ══════════════════════════════════════════════════════════► │
  │                              │                               │                        │
  │                              │           (during gameplay, GMS calls back)            │
  │                              │◄── POST /wallet/debit ────────│                        │
  │                              │── { balance } ───────────────►│                        │
  │                              │◄── POST /wallet/credit ───────│                        │
  │                              │── { balance } ───────────────►│                        │
```

## Quick Start

```bash
# 1. Start GMS backend (port 5080)
cd game-management-backend/src/Gms.Api
dotnet run

# 2. Start this demo operator (port 9090)
cd seamless-demo
dotnet run

# 3. Open browser
open http://localhost:9090
```

## Demo Players

| Player  | Display Name  | Starting Balance |
|---------|---------------|-----------------|
| alice   | Alice Wang    | $1,000.00       |
| bob     | Bob Chen      | $1,000.00       |
| charlie | Charlie Liu   | $2,500.00       |
| diana   | Diana Zhang   | $500.00         |
| eve     | Eve Li        | $5,000.00       |

## API Endpoints

### Frontend API (Browser -> Demo)

| Method | Path              | Description          |
|--------|-------------------|----------------------|
| GET    | /api/auth/players | List demo players    |
| POST   | /api/auth/login   | Login as demo player |
| GET    | /api/lobby/games  | Get game lobby       |
| POST   | /api/lobby/launch | Launch a game        |
| GET    | /api/lobby/balance| Get wallet balance   |

### Wallet Callbacks (GMS -> Demo)

| Method | Path             | Description              |
|--------|------------------|--------------------------|
| POST   | /wallet/debit    | Deduct player balance    |
| POST   | /wallet/credit   | Add to player balance    |
| POST   | /wallet/rollback | Reverse a transaction    |

## Configuration

See `appsettings.json` for GMS connection settings, API keys, and demo player configuration.

Key settings:
- `GmsBaseUrl`: GMS backend URL (default: http://localhost:5080)
- `ApiKey`: Operator API key (must match GMS seed data)
- `ApiSecret`: HMAC signing secret
- `CallbackSecret`: Secret for verifying GMS callback signatures
