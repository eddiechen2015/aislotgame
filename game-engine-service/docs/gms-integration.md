# GMS Integration

How the unified Game Engine Service (GES) integrates with the Game Management Backend (GMS) for all slot titles.

## Roles

| System | Role |
|--------|------|
| **GMS** | Operator APIs, players, sessions, wallets, game catalog, launch URLs |
| **GES** | Multi-game spin execution; validates launch tokens; calls GMS for wallet |
| **Game Client** | UI per `gameId`; talks only to GES |

Operators never call GES directly.

## End-to-End Launch

```text
1. Operator → GMS  POST /api/v1/players/login
2. Operator → GMS  POST /api/v1/wallet/transfer     (normal wallet only)
3. Operator → GMS  POST /api/v1/games/launch
                   { gameId: "asian-tour-01", sessionId, locale, returnUrl }
4. GMS returns launchUrl:
   https://play.vendor.com/play/asian-tour-01?launchToken=<jwt>
5. Player browser loads client
6. Client → GES  POST /api/v1/games/asian-tour-01/session/init { launchToken }
7. GES validates JWT, confirms session with GMS, returns gameSessionToken + balance
8. Client → GES  GET /api/v1/games/asian-tour-01/config
9. Player spins via POST /api/v1/games/asian-tour-01/spin
```

## Launch Token (GMS → Client)

GMS signs a short-lived JWT placed in the launch URL:

```json
{
  "sub": "sessionId",
  "gameId": "asian-tour-01",
  "playerId": "gms-player-uuid",
  "operatorId": "op-abc",
  "operatorPlayerId": "player-12345",
  "currency": "USD",
  "locale": "en-US",
  "market": "MGA",
  "walletType": "Normal",
  "exp": 1718190000
}
```

GES verifies signature using GMS public key or shared secret.

## GES → GMS Internal API

| Endpoint | When | Payload highlights |
|----------|------|-------------------|
| `GET /internal/sessions/{sessionId}` | session/init, optional spin | Returns validity + player context |
| `POST /internal/wallet/debit` | Before spin | `sessionId`, `gameId`, `amount`, `roundId` |
| `POST /internal/wallet/credit` | After settle | `sessionId`, `gameId`, `amount`, `roundId` |
| `POST /internal/wallet/rollback` | Spin failed after debit | `sessionId`, `roundId`, `gameId` |
| `GET /internal/wallet/balance` | session/init HUD | `sessionId` |

Every wallet call includes **`gameId`** for per-title reporting and reconciliation.

## gameId Consistency

The same `gameId` must align across:

| Location | Example |
|----------|---------|
| GMS game catalog | `asian-tour-01` |
| GMS launch request | `gameId: "asian-tour-01"` |
| Launch URL path | `/play/asian-tour-01` |
| GES plugin registry | `gameId: "asian-tour-01"` |
| GES API routes | `/api/v1/games/asian-tour-01/spin` |
| GMS wallet debit | `gameId: "asian-tour-01"` |

Mismatch at any layer is a hard error.

## GMS Catalog vs GES Registry

```text
GMS catalog (DB)                    GES registry (runtime)
├── gameId                          ├── gameId
├── name, thumbnail (marketing)     ├── name, version, min/max bet
├── operator allow list             ├── status (active/maintenance)
├── launchUrl template              └── health endpoint
└── synced from GES on deploy ◄─────── push metadata
```

GMS `GET /api/v1/games` serves operator-facing list from DB.  
GES `GET /api/v1/games` is internal — returns live registered plugins.

On GES deploy, a bootstrap job can call GMS admin API to upsert catalog entries.

## Multi-Game Launch Examples

| Game | GMS launchUrl | GES API base |
|------|---------------|--------------|
| Asian Tour | `.../play/asian-tour-01?launchToken=` | `.../api/v1/games/asian-tour-01/` |
| Dragon Fortune | `.../play/dragon-fortune-02?launchToken=` | `.../api/v1/games/dragon-fortune-02/` |

One GES deployment serves all rows. GMS `POST /games/launch` selects the correct path from catalog `gameId`.

## Spin Sequence (Any Game)

```text
Client                GES                         GMS
  │                    │                           │
  │── spin ───────────►│                           │
  │  /games/{id}/spin  │── debit(gameId) ─────────►│
  │                    │◄── ok ────────────────────│
  │                    │── plugin.playRound()      │
  │                    │── plugin.settle()         │
  │                    │── credit(gameId) ────────►│
  │                    │◄── balance ───────────────│
  │◄── result ─────────│                           │
```

GES does not branch on wallet type — GMS handles normal vs seamless internally.

## Demo Mode (Local Dev Without GMS)

```text
POST /api/v1/games/{gameId}/demo/login
GET  /api/v1/games/{gameId}/config
POST /api/v1/games/{gameId}/spin
```

Uses in-memory wallet per demo session. Disabled when `GES_MODE=production`.

## Error Propagation

| GMS error | GES HTTP | Client message |
|-----------|----------|----------------|
| `session_expired` | 401 | Session expired |
| `insufficient_funds` | 402 | Insufficient balance |
| `game_unavailable` | 404 | Game not found (GMS launch should prevent) |
| Unknown `gameId` at GES | 404 | Game not registered |

## Security

- GES is not public internet-facing for operators; it accepts player clients and GMS internal calls
- mTLS or service token between GES and GMS internal API
- `gameSessionToken` short TTL (e.g. 1 hour), refresh via silent `session/init` if launch token still valid
- CORS restricted to known client origins per `gameId`
