# Asian Tour Game Page Design

This document defines the next player-facing game page for Asian Tour.

The current `public/index.html` is a browser test harness for validating API
responses. The new game page should be a real slot client: animated reels,
cascade presentation, win celebrations, free-spin sequences, balance updates,
and clear error handling. The math and settlement remain server-authoritative.

---

# 1. Goal

Build a production-style web game page for the existing Asian Tour slot engine.

The page must:

- Render a 5x3, 243-ways slot grid.
- Animate reel spinning before revealing the server result.
- Animate winning symbol highlights and cascade removal/refill.
- Show total win, cascade win, scatter pay, free-spin progress, and balance.
- Present big-win and free-spin celebrations.
- Consume the existing server API without duplicating math logic in the client.
- Preserve deterministic auditability: the visual layer only replays server
  outcomes.

The page must not:

- Generate real spin results locally.
- Recalculate RTP or payouts independently from the server.
- Apply client-side caps, rounding, or wallet settlement.
- Hide server errors or balance failures behind fake animations.

---

# 2. Existing System Boundary

## Server-Owned Responsibilities

The server remains authoritative for:

- RNG.
- Reel results.
- Ways evaluation.
- Cascade sequence.
- Free-spin triggering and retriggering.
- Wild multipliers.
- Scatter pays.
- Per-event rounding.
- Per-spin and absolute win caps.
- Wallet debit and credit.
- Round audit logging.

## Client-Owned Responsibilities

The game page owns:

- Scene layout.
- Asset loading.
- Input state.
- Reel animation timing.
- Cascade visualization.
- Win count-up display.
- Free-spin presentation.
- Sound and music triggering.
- Accessibility-friendly motion settings.
- Displaying server-provided balances and errors.

The client is a renderer and state machine, not a math engine.

---

# 3. Recommended Frontend Architecture

The current project has no frontend build pipeline. There are two practical
implementation options.

## Option A: Single-File Canvas Client

Use a new static page, for example:

```text
public/game.html
public/game.css
public/game.js
```

This is the fastest path and fits the current Express static server.

Recommended for the first playable version.

## Option B: React + PixiJS Client

Add a frontend app with:

```text
client/
  src/
    GameApp.tsx
    scenes/
    state/
    api/
    assets/
```

This is better for long-term production UI, but requires introducing a build
tool, bundling, asset pipeline, and deployment integration.

Recommended after the first playable static version is validated.

## Initial Recommendation

Start with Option A using a canvas-driven renderer and vanilla TypeScript or
JavaScript. The server is already mature; the first milestone should prove the
gameplay presentation before adding frontend framework complexity.

---

# 4. Page Structure

The player-facing page should be separate from the test harness.

```text
/             current test harness or redirect
/game.html    real game page
```

Primary UI regions:

- Game frame: the 5x3 reels and symbol animations.
- Top HUD: game name, market/profile badge, optional menu.
- Win display: current win, total win, cascade win.
- Balance panel: balance, bet, last win.
- Controls: spin, auto-spin placeholder, bet selector.
- Feature panel: free-spin counter, multiplier step, retrigger notice.
- Overlay layer: loading, errors, free-spin intro, big win, max win.

The test harness should remain available because it is useful for engineering
debugging and raw-response inspection.

---

# 5. API Usage

## Load Config

On page boot:

```http
GET /api/config
```

Use the response for:

- Game code and version.
- Bet min/max/defaults.
- Grid size.
- Paytable display.
- Free-spin rules.
- Active math profile metadata.
- Available market list.
- Absolute win cap display if needed.

The client should not hard-code paytable values where `/api/config` already
provides them.

## Login

For the local demo:

```http
POST /api/login
Content-Type: application/json

{
  "username": "tester",
  "market": "MGA"
}
```

Production integration can replace this with the operator/session token
handoff later. The game page should isolate auth logic behind a small API
adapter so this change does not affect animation code.

## Spin

```http
POST /api/spin
Authorization: Bearer <token>
Content-Type: application/json

{
  "bet": 1.00
}
```

The response already includes:

- `roundId`
- `balance`
- `bet`
- `totalWin`
- `capped`
- `absoluteCapped`
- `market`
- `base.initialGrid`
- `base.cascades`
- `base.scatterCount`
- `base.scatterPay`
- `base.freeSpinsTriggered`
- `freeSpins.totalSpins`
- `freeSpins.retriggerCount`
- `freeSpins.spins`

The client should animate the returned result in order.

---

# 6. Client State Machine

The game page should be implemented as an explicit state machine.

```text
boot
  -> loadingConfig
  -> loginRequired
  -> idle
  -> spinRequested
  -> spinning
  -> revealBase
  -> cascadeStep
  -> scatterAward
  -> freeSpinIntro
  -> freeSpinStep
  -> freeSpinOutro
  -> settle
  -> idle
```

Error states:

```text
apiError
insufficientBalance
sessionExpired
networkRetry
```

Rules:

- The spin button is enabled only in `idle`.
- Bet changes are allowed only in `idle`.
- Balance is debited visually only after `/api/spin` succeeds unless the server
  later exposes a separate debit event.
- A spin animation may start while the HTTP request is pending, but final stop
  positions must wait for the server response.
- If the server returns an error, stop the pre-spin animation and show the error
  without fabricating a result.

---

# 7. Spin Presentation Flow

## 7.1 Pre-Spin

When the player presses Spin:

1. Disable controls.
2. Start reel motion immediately.
3. Send `/api/spin`.
4. Keep reels spinning for a minimum presentation duration, for example
   700-1000 ms.
5. When the response arrives and the minimum time has elapsed, stop reels from
   left to right using `base.initialGrid`.

If the API response is slower than the minimum spin time, reels keep spinning
with placeholder loop symbols.

## 7.2 Reel Stop

Stop order:

```text
reel 1 -> reel 2 -> reel 3 -> reel 4 -> reel 5
```

Suggested delay:

```text
120-180 ms between reels
```

Scatter anticipation:

- If reels 1-4 reveal at least two scatters before reel 5 stops, slow the final
  reel and play an anticipation effect.
- This is visual only. It must not change the result.

## 7.3 Base Cascade

For each `base.cascades[]`:

1. Highlight winning symbols.
2. Draw ways-win labels or symbol-specific win badges.
3. Count up `cascadeWin`.
4. Remove winning positions from `removed`.
5. Drop remaining symbols with gravity.
6. Refill new symbols from above.
7. Snap to `gridAfter`.
8. Continue to the next cascade.

Important: the response currently provides `gridAfter` but not each
intermediate falling symbol path. The client can derive visual drop paths from
the previous displayed grid and the final `gridAfter`, but the final displayed
state must match `gridAfter`.

## 7.4 Scatter Pay

If `base.scatterPay > 0`:

- Highlight all scatter symbols in the base grid.
- Show scatter count.
- Add scatter pay to the displayed round win.
- If `base.freeSpinsTriggered` is true, transition into the free-spin intro.

## 7.5 Free Spins

If `freeSpins` is non-null:

1. Show a free-spin intro overlay.
2. Show total spins and multiplier ladder.
3. For each `freeSpins.spins[]`, render:
   - spin index
   - multiplier step
   - initial grid
   - spin win
   - retrigger indicator
4. If `retrigger` is true, animate additional spins being added.
5. Accumulate free-spin win into the total round win.
6. Show free-spin outro with total free-spin win.

Current API limitation:

- `freeSpins.spins[]` exposes each free-spin `initialGrid`, `cascadeWin`,
  `scatterCount`, `retrigger`, `multiplierStep`, and `spinWin`.
- It does not expose the full cascade list for each free spin in
  `SpinResponse`.

Recommendation:

- First version: animate each free spin as a stop-and-pay event using
  `initialGrid` and `spinWin`.
- Later version: extend `SpinResponse.freeSpins.spins[]` to include cascades so
  free spins can use the same cascade presentation as the base game.

---

# 8. Visual Direction

Theme: ukiyo-e fantasy slot.

Recommended art treatment:

- Background: layered paper texture, misted mountains, shrine silhouettes, moon
  or sun disk.
- Reel frame: lacquered wood, ink-black edges, gold leaf trim.
- Symbols: bold ink outlines, textured flat colors, mythic character poses.
- Low symbols: kanji-card style tiles for A/K/Q/J/10.
- Wild: gold seal or mask, visible multiplier badge.
- Scatter: shrine gate, dragon pearl, or festival lantern.

Palette:

```text
ink black      #171512
deep indigo    #17324d
vermillion     #c9462c
aged paper     #efe2c5
gold leaf      #d7ad47
jade accent    #2e7d68
```

Typography:

- Use a display face for title art.
- Use a highly legible UI face for numbers and controls.
- Win amounts must be readable at small sizes and on stream.

---

# 9. Animation Requirements

## Reel Spin

Required:

- Vertical reel scrolling.
- Per-reel staggered stop.
- Anticipation when scatters are near a trigger.
- Final grid exactly matches server result.

Suggested timing:

```text
spin start easing: 120 ms
minimum spin:      700-1000 ms
reel stop gap:     120-180 ms
final bounce:      80-140 ms
```

## Cascade

Required:

- Win highlight pulse.
- Symbol removal.
- Gravity drop.
- Refill from above.
- Cascade win count-up.

Suggested timing:

```text
win highlight:  450-700 ms
remove symbols: 180-260 ms
drop/refill:    300-500 ms
settle pause:   150-250 ms
```

## Free Spins

Required:

- Intro transition.
- Persistent spin counter.
- Persistent multiplier step display.
- Retrigger celebration.
- Outro summary.

## Win Celebrations

Use win tiers based on total win divided by total bet:

```text
25x    Big Win
50x    Mega Win
100x   Super Win
250x   Epic Win
500x+  Legendary Win
```

If `absoluteCapped` or `capped` is true, show a clear max-win or cap indicator.
The message should be celebratory but not misleading.

---

# 10. Sound Requirements

Recommended sound channels:

- Background music.
- Reel spin loop.
- Reel stop ticks.
- Scatter anticipation.
- Win hit.
- Cascade chain increment.
- Free-spin intro.
- Free-spin retrigger.
- Big-win count-up.
- Button clicks.
- Error/disabled action.

Rules:

- Audio starts muted until the player interacts with the page.
- Provide a mute toggle.
- Do not block game flow if an audio asset fails to load.

---

# 11. Data Model for the Client

Recommended local structures:

```ts
type GamePhase =
  | "boot"
  | "loadingConfig"
  | "loginRequired"
  | "idle"
  | "spinRequested"
  | "spinning"
  | "revealBase"
  | "cascadeStep"
  | "scatterAward"
  | "freeSpinIntro"
  | "freeSpinStep"
  | "freeSpinOutro"
  | "settle"
  | "apiError";

interface ClientGameState {
  phase: GamePhase;
  token: string | null;
  username: string | null;
  market: string;
  balance: number;
  bet: number;
  displayedWin: number;
  roundId: string | null;
  latestSpin: SpinResponse | null;
  currentCascadeIndex: number;
  currentFreeSpinIndex: number;
  muted: boolean;
  fastMode: boolean;
}
```

Use server response types as the source of truth for result playback.

---

# 12. Asset Plan

Initial placeholder assets can use CSS/canvas text symbols, but the asset system
should be designed around replaceable production assets.

Recommended asset IDs:

```text
symbol_A
symbol_K
symbol_Q
symbol_J
symbol_10
symbol_NINJA
symbol_DRAGON
symbol_PHOENIX
symbol_SHOGUN
symbol_WILD
symbol_SCATTER

bg_main
frame_reels
overlay_free_spins
overlay_big_win
particle_gold
particle_ink
```

Recommended file layout:

```text
public/assets/game/
  symbols/
  backgrounds/
  ui/
  fx/
  audio/
```

The first implementation may use generated placeholders, but filenames and IDs
should match the final asset plan so art replacement is mechanical.

---

# 13. Responsive Layout

Desktop target:

- Landscape layout.
- Reels centered.
- Controls below or to the lower right.
- Paytable and menu accessible through overlays.

Mobile target:

- Portrait layout.
- Reels centered above controls.
- Bet selector as a compact drawer.
- Large spin button within thumb reach.
- Win and balance always visible.

Minimum supported viewport:

```text
360 x 640
```

The reel grid should scale to fit but keep symbol aspect ratios stable.

---

# 14. Accessibility and Responsible UX

Required:

- Mute toggle.
- Reduced-motion mode using `prefers-reduced-motion`.
- Clear balance and bet display.
- Clear insufficient-balance error.
- No hidden auto-spin behavior.
- No animation that delays error visibility indefinitely.
- RTP/profile information accessible from an info panel.

Recommended:

- Keyboard support for Spin when focused.
- Pause/skip button for long celebrations where legally allowed.
- Session time display for regulated builds.

---

# 15. Implementation Milestones

## Milestone 1: Playable Animated Page

- Add `public/game.html`, `public/game.css`, and `public/game.js`.
- Load `/api/config`.
- Login locally.
- Submit `/api/spin`.
- Animate reel spin and stop to `base.initialGrid`.
- Display balance, bet, total win, and raw errors.

## Milestone 2: Base Cascade Playback

- Animate `base.cascades[]`.
- Highlight winning ways.
- Remove `removed` positions.
- Drop/refill to `gridAfter`.
- Count up cascade wins.

## Milestone 3: Feature Presentation

- Animate scatter pay.
- Add free-spin intro/outro.
- Render free-spin sequence.
- Add retrigger messaging.
- Add win-tier celebrations.

## Milestone 4: Production Polish

- Add asset loader.
- Add sound manager.
- Add mobile responsive layout.
- Add reduced-motion mode.
- Add loading and reconnect states.
- Add smoke tests for API playback shape.

## Milestone 5: API Enhancement for Full FS Cascades

Extend `SpinResponse.freeSpins.spins[]` to expose each free-spin cascade list:

```ts
freeSpins: {
  spins: Array<{
    index: number;
    multiplierStep: number;
    retrigger: boolean;
    spinWin: number;
    initialGrid: Grid;
    cascades: Array<{
      index: number;
      wins: WaysWin[];
      cascadeWin: number;
      removed: Array<{ reel: number; row: number }>;
      gridAfter: Grid;
    }>;
    cascadeWin: number;
    scatterCount: number;
  }>;
}
```

This makes free-spin playback visually equivalent to base-game playback.

---

# 16. Acceptance Criteria

The first real game page is acceptable when:

- A player can open `/game.html`, login, select bet, and spin.
- Reels visibly spin and stop to the exact server-provided grid.
- Base-game cascades are shown in the correct order.
- Win totals match the `/api/spin` response.
- Balance display matches the server response after every spin.
- Free-spin triggers are visibly presented.
- Server errors are shown clearly.
- The test harness still works.
- No client-side math is introduced.

---

# 17. Non-Goals for the First Version

Do not include these in the first implementation unless explicitly required:

- Real-money operator authentication.
- Persistent wallet database.
- Bonus buy.
- Tournament mode.
- Auto-spin with regulatory controls.
- Full localization.
- Final art production.
- Final sound production.

These are productization tasks after the animated gameplay loop is stable.

---

# 18. Engineering Notes

The most important engineering constraint is result fidelity.

The visual layer can use anticipation, easing, particles, fake blur symbols, and
presentation delays. However, once a server response is received, every final
visible grid, cascade result, win amount, free-spin count, cap flag, and balance
must match the response.

This keeps the slot client compatible with the existing math-profile workflow,
audit replay system, market-specific caps, and statistical verification tools.
