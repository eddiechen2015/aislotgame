# Client Integration

How game clients connect to the unified Game Engine Service (GES) after launch from GMS.

## URL Structure

| Purpose | URL pattern |
|---------|-------------|
| GMS launch (player entry) | `https://play.vendor.com/play/{gameId}?launchToken=` |
| GES API | `https://ges.vendor.com/api/v1/games/{gameId}/` |
| Static assets | `https://play.vendor.com/play/{gameId}/` |

`gameId` in the launch URL must match the GMS catalog entry and the GES registered plugin.

## Client Boot Sequence

```text
1. Parse gameId from path: /play/asian-tour-01/
2. Parse launchToken from query string
3. POST .../games/asian-tour-01/session/init { launchToken }
4. Store gameSessionToken + balance
5. GET .../games/asian-tour-01/config
6. Render UI; enable spin
```

### session/init Response

```json
{
  "gameSessionToken": "eyJ...",
  "gameId": "asian-tour-01",
  "balance": "150.00",
  "currency": "USD",
  "market": "MGA",
  "locale": "en-US"
}
```

### Authenticated Requests

```http
Authorization: Bearer <gameSessionToken>
```

## API Calls (Per Game)

```javascript
const GAME_ID = "asian-tour-01";
const API_BASE = "https://ges.vendor.com/api/v1";

async function initSession(launchToken) {
  return api(`${API_BASE}/games/${GAME_ID}/session/init`, {
    method: "POST",
    body: JSON.stringify({ launchToken }),
  });
}

async function getConfig() {
  return api(`${API_BASE}/games/${GAME_ID}/config`);
}

async function spin(bet) {
  return api(`${API_BASE}/games/${GAME_ID}/spin`, {
    method: "POST",
    body: JSON.stringify({ bet }),
  });
}
```

## Asian Tour Client Migration

Current `public/game.js` changes:

| Before | After |
|--------|-------|
| `POST /api/login` | `POST /api/v1/games/asian-tour-01/session/init` |
| `GET /api/config` | `GET /api/v1/games/asian-tour-01/config` |
| `POST /api/spin` | `POST /api/v1/games/asian-tour-01/spin` |
| Demo login overlay | Hidden in production; show only if no `launchToken` and `GES_MODE=demo` |

Hardcode `GAME_ID` per client bundle, or read from a `data-game-id` attribute on `<html>`.

## Shared vs Per-Game Clients

| Strategy | When to use |
|----------|-------------|
| **Per-game client** (current) | Different UI, art, animations per title |
| **Shared shell + game module** | Same UX framework; lazy-load `games/{id}/client-bundle.js` |

Start with per-game clients (lowest risk). Extract shared shell later if UX converges.

## returnUrl Handling

GMS launch may include `returnUrl` in the launch token. Client shows "Exit" button:

```javascript
if (session.returnUrl) {
  exitButton.href = session.returnUrl;
}
```

## Error UX

| HTTP | Code | User action |
|------|------|-------------|
| 401 | `session_expired` | Redirect to operator lobby |
| 402 | `insufficient_funds` | Show deposit message + returnUrl |
| 404 | `game_not_found` | Show error page |
| 429 | `spin_in_progress` | Disable spin button briefly |
