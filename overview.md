# Game Overview

---

# Basic Information

## Game Name
Asian Tour

## Internal Code Name
ASIAN-TOUR-01

## Version
```yaml
version: 0.1.0
```

## Changelog
```yaml
changelog:
  - version: 0.1.0
    date: 2026-05-28
    author: ""
    notes: "Initial draft. Theme, art, and core math confirmed."
```

## Owner
```yaml
product_owner: "[填写]"
math_owner: "[填写]"
frontend_owner: "[填写]"
backend_owner: "[填写]"
```

---

# Core Concept

## Theme
Asian Fantasy

Symbols draw from classic East Asian mythology and martial culture:
Ninja, Dragon, Phoenix, Shogun — rendered in a ukiyo-e art style.
The world evokes feudal Japan reimagined through woodblock print aesthetics.

---

## Core Fantasy
Players journey through ancient Asian kingdoms, summoning legendary warriors
and mythical creatures to unleash cascading chain reactions and multiplying riches.

---

## Core Experience
High volatility slot with cascading wins, rising free spin multipliers,
and ukiyo-e visual drama — built for players who chase explosive big-win moments.

---

# Market Positioning

## Target Audience

```yaml
player_type:
  - casual        # accessible bet range (€0.10 min), clear visual feedback
  - hardcore      # high volatility, 243-ways depth, cascade chain chasing
  - streamer-friendly  # see definition below
```

> **Streamer-friendly definition:** The game must support the following
> to qualify as streamer-friendly:
> - Big win celebration screens (thresholds: 25x, 50x, 100x, 250x, 500x+ of total bet)
> - Visible multiplier counter during free spins at all times
> - High-contrast win amount display readable on stream
> - Free spin entry and retrigger animations with sufficient dramatic build-up
> - No auto-skip on win animations (player-controlled)

## Target Markets

```yaml
markets:
  - MGA           # Malta Gaming Authority — primary launch market
  - Curacao       # Curacao eGaming — secondary; note regulatory phase-out risk
  - Brazil        # Emerging regulated market — see compliance notes
  - Sweepstake    # US sweepstake model — no real-money gambling license required
```

> **Per-market compliance notes:**
>
> | Market     | Key Requirement |
> |------------|-----------------|
> | MGA        | GLI-11 cert required. Responsible gambling features mandatory. RTP must be disclosed to players. |
> | Curacao    | Lower compliance bar currently, but Curacao is tightening regulation in 2024–2025. Plan for MGA-level compliance. |
> | Brazil     | Law 14,790/2023 in effect. Local server requirements may apply. Portuguese localisation required. |
> | Sweepstake | No bonus buy permitted. Real-money RTP rules may not apply but maintain for consistency. |

---

# Platform Support

```yaml
platforms:
  - web
  - ios
  - android
```

---

# Technical Stack

## Frontend
```yaml
frontend:
  engine: pixijs
  framework: react
```

## Backend
```yaml
backend:
  language: typescript
  framework: nestjs
```

## Database
```yaml
database:
  type: postgresql
```

---

# Game Structure

## Reel Configuration
```yaml
reel_type: ways
rows: 3
cols: 5
total_ways: 243
```

## Main Features

```yaml
features:
  - cascading       # winning symbols removed, new symbols fall from above
  - free_spins      # triggered by 3+ scatters; 10 spins base + up to 5 retriggers (max 35 total)
  - multiplier      # wild multipliers (2x/3x/5x) + increasing free spin multiplier [1,2,3,5,10]
  - profile_math    # approved math profile may define FS-specific reels and paytable
```

> Note: `sticky_wild` is **disabled** in this version. Wilds that do not
> participate in a win remain on the grid for the next cascade only —
> they are not persistent across spins. See math.md Section 5 and Section 9.
>
> Note: Free spin retriggers are **capped at 5** per session (max 35 total spins)
> for MGA compliance. See math.md Section 7.
>
> Note: Free spins may use a dedicated reel set and dedicated paytable from the
> approved math profile. This is intentional and supports the target RTP split
> between base game and free spins. If a profile does not provide FS-specific
> values, free spins fall back to the base-game reel set and paytable. See
> math.md Sections 4, 7, 8, and 10.

---

# Session Design

## Average Session Time
```yaml
avg_session_minutes: 18
```

## Target RTP
```yaml
target_rtp: 96.2
```

## Volatility
```yaml
volatility: high
```

---

# Monetization

## Monetization Type

```yaml
monetization:
  - real_money
```

## Bonus Buy
```yaml
bonus_buy: false
# Bonus buy is not included in this version.
# To be reconsidered in a future version after base game math is certified.
# Note: Bonus buy is also prohibited in the Sweepstake market variant.
```

---

# Visual Direction

## Art Style
Ukiyo-e (浮世絵)

Japanese woodblock print aesthetic applied to a digital slot context:
- Bold ink outlines with flat colour fills and visible texture grain
- Rich indigo, vermillion, gold, and ink-black palette
- Symbols styled as woodblock illustrations: Ninja, Dragon, Phoenix, Shogun
- Background: layered landscape inspired by Hokusai and Hiroshige compositions
- Low symbols (A / K / Q / J / 10) rendered as decorative kanji-style cards
- UI chrome (frames, buttons) use lacquerware and gold-leaf motifs

---

## Animation Style
Fluid ukiyo-e motion — animations suggest the energy of woodblock printing
while remaining smooth and legible on screen:

- Reel spin: ink-brush smear blur on spin, crisp settle on stop
- Cascade removal: symbols dissolve in an ink-wash splatter effect
- Wild land: brushstroke sweep across the symbol position
- Win celebration: stylised woodblock wave or flame motif expands from win cluster
- Free spin entry: full-screen ukiyo-e scroll unfurls to reveal feature screen
- Multiplier advance: stamp seal animation (hanko) marks each multiplier step

---

# Audio Direction

## BGM Style
Traditional Japanese instrumentation with cinematic tension:

- Base game: ambient koto and shakuhachi loop; calm but anticipatory
- Free spin entry: taiko drum build into full orchestral swell
- Free spins active: high-energy shamisen and taiko with layered intensity
- Big win: triumphant orchestral hit with traditional Japanese melody lead
- All BGM layers dynamically mix based on game state (idle / spinning / win / feature)

## SFX Style
Sharp, satisfying, and culturally grounded:

- Reel stop: wooden block tap (hyoshigi) per reel, left to right
- Symbol land (premium): distinct resonant tones per symbol tier
- Cascade trigger: ink-splash wet sound followed by a whoosh as symbols fall
- Wild land: deep temple bell strike
- Multiplier advance: hanko stamp thud + paper-fold crinkle
- Scatter land: chime sequence building with each scatter (1→2→3)
- Free spin trigger: full gong strike with reverb tail
- Win count-up: rapid coin/token clatter scaling with win size

---

# Compliance

## Certifications

```yaml
certifications:
  - gli11    # primary: covers RNG, math, game rules, payout accuracy
  - bmm      # secondary: independent math verification
```

## Responsible Gambling Features

> Required for MGA certification and GLI-11 compliance.
> All features below must be implemented before launch in regulated markets.

```yaml
responsible_gambling:
  reality_check:
    enabled: true
    interval_options: [30, 60, 120]   # minutes; player-selectable
    display: session_time + session_spend

  session_time_limit:
    enabled: true
    player_configurable: true

  loss_limit:
    enabled: true
    periods: [daily, weekly, monthly]
    player_configurable: true

  auto_play:
    enabled: true
    restrictions:
      - must_allow_player_to_stop_anytime
      - auto_stop_on_free_spin_trigger: true
      - auto_stop_on_win_above: player_configurable
      - auto_stop_on_loss_above: player_configurable
    max_auto_play_rounds: 100

  self_exclusion:
    operator_managed: true   # handled at platform level, not in-game

  rtp_disclosure:
    display_in_game_rules: true
    value: 96.2%
```

---

# AI Development Tasks

## Planned AI Usage

> This is the **authoritative AI task list**. math.md Section 14 lists math-engine
> tasks only and defers to this document for the complete list.

```yaml
ai_tasks:
  # Math engine
  - generate_reel_engine              # base/FS weighted RNG per reel, post-gen Wild cap
  - generate_ways_evaluator           # 243-ways consecutive left-to-right evaluation
  - generate_cascade_engine           # symbol removal, gravity refill, termination logic
  - generate_free_spin_state_machine  # entry, multiplier progression, retrigger cap (max 5), exit
  - generate_rtp_simulator            # 100M-spin Monte Carlo with all Section 13 validation targets
  - generate_paytable                 # base/FS symbol × match-count × ways payout table
  - generate_math_profile_workflow    # export, search, verify, and promote approved math profiles

  # Backend
  - generate_spin_api                 # session, bet, result, win calculation endpoint
  - generate_rng_audit_log            # certified RNG seed + result logging for GLI-11

  # Frontend
  - generate_reel_animation           # spin, stop, cascade, ink-brush effects
  - generate_win_presentation         # win lines, amount display, big win celebration
  - generate_free_spin_ui             # multiplier counter, spin count, retrigger screen
  - generate_anticipation_animation   # reel slowdown on 2-scatter visible state
```

---

# Open Questions

- [ ] Confirm product_owner / math_owner / frontend_owner / backend_owner names
- [ ] Confirm Brazil server localisation requirements (local hosting vs CDN)
- [ ] Decide Curacao strategy given ongoing regulatory changes
- [ ] Confirm big win threshold values with product (25x / 50x / 100x / 250x / 500x)
- [ ] Confirm minimum supported device specs (iOS version, Android version, browser)

---

# TODO

- [x] finalize_theme — Asian Fantasy / ukiyo-e confirmed
- [x] finalize_math — core game math resolved; remaining open items are optional future feature variants
- [x] finalize_bonus_loop — cascading + free spins + multiplier confirmed; retrigger cap set at 5; bonus buy deferred
- [x] finalize_fs_math_profile — free spins may use dedicated reel set and paytable from approved math profile
- [x] finalize_art_direction — ukiyo-e style, animation, BGM, SFX all defined
- [ ] assign_owners — product / math / frontend / backend owners still needed
- [ ] legal_review — per-market compliance notes need sign-off; absolute win caps need operator confirmation
- [ ] localisation_plan — language list, RTL support, Brazil Portuguese priority
