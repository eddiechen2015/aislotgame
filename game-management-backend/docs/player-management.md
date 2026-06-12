# Player Management

Player Management is responsible for maintaining player records on behalf of operators and managing the session lifecycle that gates access to games.

## Responsibilities

| In scope | Out of scope |
|----------|--------------|
| Register players when operators log them in | Operator main wallet balances |
| Map operator player IDs to internal GMS player records | Game math or spin logic |
| Create, validate, refresh, and revoke sessions | Player self-registration UI |
| Enforce operator tenancy (player belongs to one operator) | KYC / compliance workflows |

## Player Identity Model

Each player in GMS is identified by a composite key:

```text
(operatorId, operatorPlayerId)
```

- **operatorId** — Internal GMS identifier for the integrating operator.
- **operatorPlayerId** — The player ID as defined by the operator (string, opaque to GMS).

GMS also assigns an internal `playerId` (GUID) used in all internal references and game launch URLs.

### Player Record Fields (Planned)

| Field | Description |
|-------|-------------|
| `id` | GMS internal GUID |
| `operatorId` | Owning operator |
| `operatorPlayerId` | Operator-supplied player identifier |
| `currency` | ISO 4217 code (e.g. USD, CNY) |
| `locale` | Optional BCP 47 locale |
| `displayName` | Optional display name from operator |
| `status` | `Active`, `Suspended`, `Closed` |
| `walletType` | Inherited from operator config: `Normal` or `Seamless` |
| `createdAt` | First registration timestamp |
| `lastLoginAt` | Last successful login timestamp |

## Registration Flow

Registration is **implicit** during login — there is no separate register endpoint.

```text
1. Operator calls POST /api/v1/players/login
2. GMS looks up (operatorId, operatorPlayerId)
3. If not found → create new Player record with supplied metadata
4. If found → update lastLoginAt and optional metadata
5. Create new Session
6. Return sessionId + player summary
```

### Rules

- A player created under operator A cannot be accessed by operator B, even with the same `operatorPlayerId`.
- Re-login does not invalidate existing sessions unless configured (see Session Policy).
- Player `currency` is set on first login and should not change without an explicit migration path.

## Session Management

Sessions represent an authenticated play context between the operator platform and GMS.

### Session Record Fields (Planned)

| Field | Description |
|-------|-------------|
| `id` | Opaque session token returned to operator |
| `playerId` | Linked GMS player |
| `operatorId` | Owning operator |
| `expiresAt` | Absolute expiry (UTC) |
| `revokedAt` | Set when session is explicitly invalidated |
| `createdAt` | Creation timestamp |
| `clientIp` | Optional, for audit |
| `userAgent` | Optional, for audit |

### Session Lifecycle

```text
Created ──► Active ──► Expired (TTL reached)
              │
              └──► Revoked (explicit logout or security event)
```

### Session Policy (Defaults — Configurable per Operator)

| Setting | Default | Description |
|---------|---------|-------------|
| `sessionTtl` | 4 hours | Absolute session lifetime |
| `idleTtl` | 30 minutes | Optional idle timeout (extends on activity) |
| `maxConcurrentSessions` | 1 | New login revokes previous sessions |
| `extendOnActivity` | true | Game activity refreshes idle timer |

### Session Validation

Operators and game services call validation to confirm a session is still usable:

```text
POST /api/v1/sessions/validate
  Input:  sessionId
  Output: valid (bool), playerId, expiresAt, walletType
```

Validation checks:

1. Session exists
2. `revokedAt` is null
3. `expiresAt` > now (and idle timeout not exceeded, if enabled)
4. Player status is `Active`

Invalid sessions return `valid: false` with a reason code (`expired`, `revoked`, `player_suspended`, `not_found`).

## Operator API Touchpoints

| Endpoint | Player Mgmt Role |
|----------|------------------|
| `POST /players/login` | Register or update player; create session |
| `POST /sessions/validate` | Check session validity |
| `POST /games/launch` | Validate session before issuing launch URL |

## Internal APIs (Game Engine → GMS)

Game engines will call internal endpoints (not exposed to operators):

| Endpoint | Purpose |
|----------|---------|
| `GET /internal/sessions/{sessionId}` | Resolve session + player context for a spin |
| `POST /internal/sessions/{sessionId}/touch` | Extend idle TTL on player activity |

## Error Handling

| Condition | HTTP Status | Code |
|-----------|-------------|------|
| Unknown operator (auth failure) | 401 | `unauthorized` |
| Player suspended | 403 | `player_suspended` |
| Session not found | 404 | `session_not_found` |
| Session expired | 401 | `session_expired` |
| Session revoked | 401 | `session_revoked` |

## Audit Events

| Event | Payload |
|-------|---------|
| `player.created` | operatorId, operatorPlayerId, playerId |
| `player.login` | playerId, sessionId |
| `session.created` | sessionId, playerId, expiresAt |
| `session.validated` | sessionId, result |
| `session.revoked` | sessionId, reason |

## Future Considerations

- Session refresh token for long-lived operator integrations
- Player merge / duplicate detection within an operator
- Geo / jurisdiction flags per player for game availability gating
