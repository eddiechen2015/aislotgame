# Math Specification

---

# 1. Core Math Targets

## RTP

```yaml
rtp:
  target: 96.20
  tolerance: 0.10
```

---

## Volatility

```yaml
volatility:
  level: high
```

---

## Hit Frequency

```yaml
hit_frequency:
  target: 30%
```

---

## Max Win

```yaml
max_win:
  cap: 10000x
```

---

# 2. Bet Configuration

```yaml
bet:
  min: 0.10
  default: 1.00
  max: 100.00
```

---

# 3. Reel Configuration

## Reel Type

```yaml
reel:
  type: ways
```

---

## Grid Size

```yaml
grid:
  rows: 3
  cols: 5
```

---

## Win Direction

```yaml
win_direction:
  - left_to_right
```

---

## Minimum Match

```yaml
ways:
  min_match: 3
```

## Ways Evaluation Rules

```yaml
ways_evaluation:

  # Reels must be consecutive starting from Reel 1 (left-to-right only)
  consecutive_reels_required: true
  start_reel: 1

  # Ways count = product of matching symbol positions on each qualifying reel
  # Example: 2 positions on R1 × 3 on R2 × 2 on R3 = 12 ways
  ways_count_method: multiply_positions

  # Each way pays independently; all ways for the same symbol are summed
  payout_method: sum_all_ways

  # Wild occupying multiple positions on a reel counts each position separately
  # Example: Wild on all 3 rows of R2 counts as 3 positions
  wild_position_count: all_positions

  # When the same symbol appears in multiple ways AND also triggers a higher
  # match count on a subset of reels, only the highest match count pays
  # Example: symbol on R1+R2+R3+R4 also contains R1+R2+R3 — only 4-match pays
  highest_match_only: true

  # Ways payout formula:
  # win = symbol_payout(match_count) × ways_count × bet_per_ways
  # where bet_per_ways = total_bet / total_ways_available (243 for 3×5 grid)
  payout_formula: symbol_payout × ways_count × (total_bet / 243)
```

> **Total ways available:** A full 3-row × 5-reel grid = 3⁵ = 243 ways.
> All bets are divided across 243 ways. There is no per-line bet concept.

---

# 4. Symbol Definitions

> **Math profile note:** The tables in this section define the baseline design
> paytable and symbol categories. Production math may use profile-specific base
> and free-spin paytables as long as the approved profile passes the validation
> targets in Section 13 and is documented with its profile version.

## Low Symbols

| Symbol | Type | Weight | 3 Match | 4 Match | 5 Match |
| ------ | ---- | ------ | ------- | ------- | ------- |
| A      | low  | 60     | 0.5x    | 1x      | 5x      |
| K      | low  | 55     | 0.6x    | 1.5x    | 6x      |
| Q      | low  | 50     | 0.8x    | 2x      | 8x      |
| J      | low  | 45     | 1x      | 3x      | 10x     |
| 10     | low  | 40     | 1.5x    | 4x      | 15x     |

---

## Premium Symbols

> The `Weight Range` column shows min weight (Reels 1/5) → max weight (Reel 3).
> See Section 8 for the exact weight on each reel.

| Symbol  | Type    | Weight Range | 3 Match | 4 Match | 5 Match |
| ------- | ------- | ------------ | ------- | ------- | ------- |
| Ninja   | premium | 15 – 20      | 5x      | 15x     | 50x     |
| Dragon  | premium | 10 – 15      | 8x      | 25x     | 80x     |
| Phoenix | premium | 6 – 10       | 12x     | 40x     | 120x    |
| Shogun  | premium | 3 – 5        | 20x     | 80x     | 250x    |

---

## Free Spin Paytable

```yaml
free_spin_paytable:
  enabled: true
  source: approved_math_profile
  fallback: same_as_base_paytable
```

Free spins may use a dedicated paytable separate from the base game paytable.
This is an intentional math-tuning control, not a separate bonus feature. Its
purpose is to allow the free-spin feature to carry the intended RTP contribution
and high-volatility payout profile without over-inflating base-game hit
frequency.

Rules:

- The payable symbols remain the same as the base game: low symbols and premium
  symbols only.
- Wild and Scatter do not receive paytable entries.
- Wild substitution, Wild multipliers, and spin-level free-spin multipliers keep
  the operation order defined in Section 5.
- The approved free-spin paytable must be exported and verified as part of the
  active math profile.

If no dedicated free-spin paytable is supplied in a profile, the free-spin
paytable defaults to the base-game paytable.

---

## Special Symbols

> Weights are reel-specific. See Section 8 for per-reel values.
> The table below shows the **base weight range** across all reels for reference.

| Symbol  | Type              | Reel 1 | Reel 2 | Reel 3 | Reel 4 | Reel 5 | Substitutes |
| ------- | ----------------- | ------ | ------ | ------ | ------ | ------ | ----------- |
| Wild    | substitute        | 2      | 3      | 4      | 3      | 2      | low + premium only (not Scatter) |
| Scatter | free_spin_trigger | 8      | 10     | 14     | 10     | 8      | none (never substitutes) |

> **Scatter weight note:** Scatter appears on all 5 reels with a centre-heavy
> distribution (Reel 3 highest). This produces a free spin trigger frequency of
> approximately **1 in 130 spins** (0.77%), which is within the typical industry
> range of 1-in-100 to 1-in-200 and supports the 38.2% free spin RTP contribution
> target in Section 10.
>
> Previous weights (0, 1, 2, 1, 0) produced a trigger frequency of ~1-in-462,000
> which was mathematically incompatible with the free spin RTP target and has been
> corrected here and in Section 8.

---

# 5. Wild Rules

```yaml
wild:
  substitute:
    - low_symbols
    - premium_symbols

  exclude:
    - scatter

  multiplier_enabled: true

  multiplier_values:
    - 2x
    - 3x
    - 5x

  # multiplier_stack is fully defined below — see 'Wild multiplier stacking' block
  max_wilds_per_spin: 5

  # ── Wild-only win ────────────────────────────────────────────────────────
  # DECISION: Wild-only wins are NOT allowed.
  # A winning combination requires at least one non-Wild symbol to anchor it.
  # Wild symbols may fill remaining positions in a combination but cannot
  # form a winning combination by themselves.
  # Reason: prevents degenerate high-frequency micro-wins that inflate
  # hit rate without meaningful player value, and avoids a separate
  # Wild-only paytable complicating the evaluator.
  wild_only_win: false

  # ── Wild multiplier scope ────────────────────────────────────────────────
  # DECISION: Wild multipliers are active in BOTH base game and free spins.
  # In free spins, Wild multipliers also interact with the spin-level
  # increasing multiplier via multiplication (see Section 7).
  # Reason: allows the free spin feature to build toward very large wins
  # through compounding multipliers, supporting the high-volatility profile.
  multiplier_active_in:
    - base_game
    - free_spins

  # ── Wild multiplier stacking ─────────────────────────────────────────────
  # When multiple Wilds contribute to the same winning way, their multipliers
  # are multiplied together (not added).
  # Example: Wild(2x) + Wild(3x) in same way = 6x total Wild multiplier.
  multiplier_stack:
    type: multiply
    max_combined: 100x   # hard cap matches exposure.max_multiplier_cap

  # ── Wild multiplier operation order (unambiguous) ─────────────────────────
  # Step 1: Calculate base way win
  #   base_way_win = symbol_payout(match_count) × ways_count × (total_bet / 243)
  #
  # Step 2: Apply Wild multiplier (product of all Wilds in that way, capped at 100x)
  #   wild_mult = min(Wild1_mult × Wild2_mult × ..., 100)
  #   way_win_after_wild = base_way_win × wild_mult
  #
  # Step 3: Apply spin-level free spin multiplier (base game = 1x, no effect)
  #   final_way_win = way_win_after_wild × spin_mult
  #
  # Step 4: Sum all way wins for the spin
  #   spin_win = sum(final_way_win for all winning ways)
  #
  # Step 5: Apply 10,000x cap to spin_win (see Section 11)
  #
  # Concrete example — Free spins, spin multiplier at step 5 (10x):
  #   Shogun 5-match, 6 ways, one Wild(3x) contributing to all 6 ways:
  #   base_way_win = 250x × 6 × (bet/243) = 6.17x bet
  #   way_win_after_wild = 6.17x × 3 = 18.52x bet
  #   final_way_win = 18.52x × 10 = 185.2x bet
  #   → Capped at 10,000x if total spin accumulation reaches cap
  #
  # Note: Wild multiplier applies per-way. A Wild contributing to multiple
  # ways applies its multiplier independently to each way it participates in.
  operation_order: base_way → wild_mult → spin_mult → sum_ways → win_cap

  # ── Max Wilds enforcement ────────────────────────────────────────────────
  # The max_wilds_per_spin cap is enforced during reel generation (pre-evaluation).
  # Method: after weighted RNG generates all 15 symbol positions, count Wilds.
  # If count > 5, randomly demote excess Wilds to the next-weighted symbol
  # on that reel (excluding Wild and Scatter) until count == 5.
  # This preserves overall weight distribution with minimal distortion.
  max_wilds_per_spin: 5
  max_wilds_enforcement: post_generation_demotion
```

---

# 6. Scatter Rules

```yaml
scatter:
  trigger_count: 3
  substitute: false

  # ── Scatter payout ─────────────────────────────────────────────────────
  # Scatter pays are based on TOTAL BET (not per-way or per-line).
  # Scatter payout is awarded IN ADDITION to triggering free spins.
  # Scatter payout applies in BASE GAME only.
  # During free spins, additional scatters trigger retrigger only (no scatter pay).
  payout:
    3: 5x    # of total bet
    4: 20x   # of total bet
    5: 100x  # of total bet
  payout_basis: total_bet
  payout_also_triggers_free_spins: true
  payout_active_in:
    - base_game

  # ── Mid-cascade scatter trigger ───────────────────────────────────────
  # If scatters accumulate to 3+ during cascade resolution, free spins
  # trigger after the full cascade sequence ends (not immediately).
  # Scatter payout for mid-cascade triggers is based on the total scatters
  # visible when the cascade sequence ends.
  mid_cascade_trigger: deferred_until_cascade_end
```

---

# 7. Free Spins

## Trigger

```yaml
free_spins:
  trigger_symbol: scatter
  trigger_count: 3
```

---

## Initial Spins

```yaml
free_spins_reward:
  spins: 10
```

---

## Features

```yaml
free_spins_features:
  sticky_wild: false
  cascading: true
  increasing_multiplier: true
```

---

## Multiplier Progression

```yaml
free_spins_multiplier:
  steps: [1, 2, 3, 5, 10]

  # ── Advance trigger ───────────────────────────────────────────────────
  # The multiplier advances ONCE PER SPIN (not per cascade).
  # It advances at the START of each free spin, before reels are evaluated.
  # Spin 1 starts at step 1 (1x). Spin 2 advances to step 2 (2x). Etc.
  # If free spins exceed 5 (e.g. via retrigger), multiplier stays at
  # the final step (10x) for all remaining spins.
  advance_trigger: per_spin
  advance_timing: start_of_spin

  # ── Reset rule ────────────────────────────────────────────────────────
  # The multiplier does NOT reset on retrigger.
  # Retrigger adds +5 spins at whatever multiplier step is currently active.
  # Example: retrigger on spin 3 (multiplier=3x) → 5 more spins beginning
  # at step 3, then advancing normally: 3x → 5x → 10x → 10x → 10x
  reset_on_retrigger: false

  # ── Multiplier interaction with Wild multipliers ──────────────────────
  # The spin-level multiplier is applied ON TOP of any Wild multipliers.
  # Final way win = symbol_payout × ways × bet_per_ways × wild_mult × spin_mult
  # Example: Shogun 5-match, 6 ways, Wild(3x), spin at 5x step:
  #   = 250x × 6 × (bet/243) × 3 × 5 = 22,500x × (bet/243)
  interaction_with_wild_multiplier: multiply
```

---

## Retrigger

```yaml
free_spins_retrigger:
  enabled: true
  additional_spins: 5

  # ── Retrigger cap ─────────────────────────────────────────────────────────
  # DECISION: Maximum 5 retriggers per free spin session (25 additional spins).
  # After 5 retriggers, further scatters during free spins are ignored
  # (no additional spins awarded, no scatter payout).
  # Reason: unlimited retrigger + 10x multiplier + cascades creates an
  # unbounded session win exposure that is incompatible with MGA requirements
  # for responsible gambling and operator risk management.
  retrigger_cap: 5
  retrigger_cap_behavior: ignore_scatter_after_cap

  # ── Max total free spins per session ──────────────────────────────────────
  # Initial 10 spins + max 5 retriggers × 5 spins = 35 spins maximum per session
  max_total_spins_per_session: 35

  # ── Multiplier behaviour on retrigger ────────────────────────────────────
  # Multiplier does NOT reset on retrigger (see Multiplier Progression above).
  multiplier_reset: false
```

---

## State Transition

```yaml
free_spins_state_transition:

  # When triggered mid-cascade in base game:
  # 1. Current cascade sequence completes fully
  # 2. All cascade wins for that spin are paid out
  # 3. Scatter payout (5x / 20x / 100x) is awarded
  # 4. Free spin mode begins on the next spin
  entry: after_cascade_sequence_ends

  # Grid state on free spin entry:
  # Fresh spin — no symbols carry over from the triggering base game spin.
  grid_state_on_entry: fresh

  # On free spin completion:
  # Total free spin winnings are summed and displayed.
  # Player returns to base game. Multiplier resets to step 1 for any future trigger.
  multiplier_reset_on_exit: true

  # Free spin reel set:
  # Free spins may use a dedicated reel set from the approved math profile.
  # If no dedicated free spin reel set is supplied, free spins fall back to the
  # base game reel set.
  reel_set: approved_free_spin_reel_set
  fallback_reel_set: same_as_base_game
```

---

# 8. Reel Weights and Reel Sets

The game supports separate reel sets for base game and free spins:

```yaml
reel_sets:
  base_game:
    required: true
    source: approved_math_profile

  free_spins:
    enabled: true
    source: approved_math_profile
    fallback: same_as_base_game
```

The base-game reel set controls base hit frequency, scatter trigger frequency,
and base-game RTP contribution. The free-spin reel set controls feature pacing,
retrigger behaviour, feature hit profile, and free-spin RTP contribution.

This separation is allowed because Section 10 requires a high feature
contribution: 38.2 percentage points of the total 96.2% RTP. A dedicated
free-spin reel set provides the math freedom needed to raise feature value
without forcing the base game to become too frequent or too rich.

All reel sets must still obey:

- 5 reels × 3 visible rows.
- 243 total ways.
- Scatter never substitutes.
- Wild substitutes only for low and premium symbols.
- `max_wilds_per_spin` post-generation demotion.
- The approved profile must list the full symbol counts or full strips for both
  base and free-spin reel sets.

The counts below define the baseline base-game reel set.

## Reel 1

```yaml
A: 60
K: 55
Q: 50
J: 45
10: 40
Ninja: 15
Dragon: 10
Phoenix: 6
Shogun: 3
Wild: 2
Scatter: 8
# Total: 294
```

---

## Reel 2

```yaml
A: 60
K: 55
Q: 50
J: 45
10: 40
Ninja: 18
Dragon: 12
Phoenix: 8
Shogun: 4
Wild: 3
Scatter: 10
# Total: 305
```

---

## Reel 3

```yaml
A: 55
K: 50
Q: 45
J: 40
10: 35
Ninja: 20
Dragon: 15
Phoenix: 10
Shogun: 5
Wild: 4
Scatter: 14
# Total: 293
```

---

## Reel 4

```yaml
A: 60
K: 55
Q: 50
J: 45
10: 40
Ninja: 18
Dragon: 12
Phoenix: 8
Shogun: 4
Wild: 3
Scatter: 10
# Total: 305
```

---

## Reel 5

```yaml
A: 60
K: 55
Q: 50
J: 45
10: 40
Ninja: 15
Dragon: 10
Phoenix: 6
Shogun: 3
Wild: 2
Scatter: 8
# Total: 294
```

---

# 9. Cascade System

```yaml
cascade:
  enabled: true
  remove_winning_symbols: true
  gravity_direction: down
  refill_method: weighted_rng

  # ── Ways recalculation after each cascade ────────────────────────────────
  # After winning symbols are removed and new symbols fall in, the ways
  # evaluation is run fresh on the new grid state.
  # The ways count is fully recalculated from scratch each cascade.
  # There is no carry-over of positions from the previous evaluation.
  ways_recalculate_each_cascade: true

  # ── Cascade multiplier application ───────────────────────────────────────
  # In BASE GAME: no cascade-level multiplier. Each cascade win is paid
  # at face value (symbol_payout × ways × bet_per_ways).
  # In FREE SPINS: the spin-level increasing multiplier applies to ALL
  # cascade wins within that spin (not per-cascade — it advances per spin,
  # not per cascade). See Section 7 for multiplier progression rules.
  cascade_multiplier:
    base_game: none
    free_spins: spin_level_multiplier  # from free_spins_multiplier progression

  # ── Wild removal on cascade ───────────────────────────────────────────────
  # Wilds that participate in a winning combination ARE removed during cascade.
  # Wilds that do NOT participate in any winning combination on that cascade
  # step are NOT removed — they remain in place for the next cascade evaluation.
  # This is intentional: non-winning Wilds act as persistent helpers for
  # subsequent cascades within the same spin.
  wild_removal:
    if_part_of_win: true
    if_not_part_of_win: false

  # ── Scatter on cascade ────────────────────────────────────────────────────
  # Scatters landing during a cascade (via refill) DO count toward the
  # scatter trigger count. If 3+ scatters become visible at any point
  # during cascade resolution, the free spin trigger activates AFTER
  # the current cascade sequence fully completes (not mid-cascade).
  scatter_counts_during_cascade: true
  free_spin_trigger_timing: after_cascade_sequence_ends

  # ── Cascade termination ───────────────────────────────────────────────────
  # Cascade continues as long as new winning combinations are formed.
  # Cascade ends when the evaluated grid produces no winning combinations.
  # Hard cap of 20 cascades per spin (see Section 11) applies regardless.
  # When the cascade cap is reached, the spin ends immediately with no
  # additional payout for that final partial evaluation.
  termination: no_new_wins
  cap_behavior: end_spin_no_extra_payout
```

---

# 10. RTP Distribution

```yaml
rtp_distribution:
  base_game: 58.0%
  free_spins: 38.2%
  total: 96.2%
```

> **Design note — High free spin RTP contribution (38.2%):**
> This is intentional for a high-volatility profile. Free spins contribute
> 38.2 percentage points of the total 96.2% RTP — meaning roughly 40% of all
> player returns come from the free spin feature, which triggers approximately
> once every 130 base game spins. This produces long cold streaks broken by
> large free spin payouts, which is consistent with the `volatility: high` target.
>
> The approved math profile may use separate base-game and free-spin reel sets
> and paytables to achieve this split. Base-game reels and paytables should
> primarily control base hit frequency and base RTP, while free-spin reels and
> paytables should primarily control feature value, retrigger pacing, and
> volatility.
>
> This split must be validated against the following constraints:
>
> - Free spin trigger frequency must be confirmed via simulation (see Section 13)
> - If any target market imposes a base-game minimum RTP floor (e.g. some
>   jurisdictions require base game alone to return ≥ 85% of total RTP),
>   the 58% base game contribution **will require adjustment**
> - The 58% / 38.2% split must be validated in the 100M-spin Monte Carlo run
>   with a tolerance of ±1% on each component (see Section 13 validation targets)

```yaml
rtp_distribution_tolerance:
  base_game: ±1.0%
  free_spins: ±1.0%
```

---

# 11. Exposure Control

```yaml
exposure:
  max_single_spin_win: 10000x
  max_multiplier_cap: 100x
  max_cascades_per_spin: 20
```

## Max Win Cap Enforcement

```yaml
max_win_enforcement:

  # The 10,000x cap applies to the TOTAL WIN of a single spin (including all
  # cascades and free spin multipliers combined).
  scope: total_spin_win

  # Enforcement method: early stop.
  # Once accumulated win reaches 10,000x total bet at any point during
  # cascade evaluation, the spin terminates immediately.
  # No further cascades are evaluated. No partial payout for the stopped cascade.
  # The player receives exactly 10,000x (or the accumulated amount if slightly below).
  method: early_stop
  payout_at_cap: accumulated_win_at_stop

  # The cap applies in BOTH base game and free spins.
  active_in:
    - base_game
    - free_spins

  # Free spin session cap: the 10,000x cap applies PER SPIN within free spins,
  # not across the entire free spin session. Total free spin winnings are
  # uncapped at the session level, subject only to the per-spin limit.
  free_spin_session_cap: per_spin_only
```

## Absolute Win Cap (Market-Specific)

> The 10,000x multiplier cap must be cross-checked against each market's
> absolute maximum payout in currency terms. At max bet €100, 10,000x = €1,000,000
> which exceeds the MGA typical operator limit. The following absolute caps apply:

```yaml
absolute_win_cap:
  # All values in EUR. Applied as: min(10000x × bet, absolute_cap)
  MGA:        500000   # MGA operator standard; confirm with operator agreement
  Curacao:    1000000  # No regulatory hard limit; use operator contract value
  Brazil:     500000   # Apply MGA-equivalent standard pending local regulation
  Sweepstake: 250000   # Platform-defined; confirm with sweepstake operator

  # Implementation: if calculated win > absolute_cap for player's market,
  # pay absolute_cap and log the capped event for audit purposes.
  enforcement: min_of_multiplier_and_absolute
  audit_log_on_cap: true
```

## Theoretical Max Win Analysis

> For documentation and cert purposes, the theoretical maximum single-spin win
> before cap is:
>
> `Shogun 5-match (250x) × 243 ways × (bet/243) × Wild mult cap (100x) × spin mult (10x)`
> `= 250x × 100x × 10x = 250,000x`
>
> This is 25× above the 10,000x cap, confirming the cap will trigger on any
> strong Shogun + max Wild + max free spin multiplier combination.
> The early-stop enforcement above handles this correctly.

---

# 12. Anticipation System

> **Note:** This section defines the trigger condition (a math/state concern).
> The visual implementation (reel slowdown, animation timing) is a frontend
> requirement documented in overview.md under Animation Style.

```yaml
anticipation:
  enabled: true

  # Math trigger: anticipation state activates when 2 scatters are visible
  # after any reel stops. The remaining reels slow down.
  trigger_conditions:
    - 2_scatter_visible

  # reel_slowdown is a frontend instruction, not a math rule.
  # Listed here as a cross-reference only.
  reel_slowdown: true   # see overview.md → Animation Style
```

---

# 13. Simulation Requirements

## Monte Carlo Simulation

```yaml
simulation:
  spins: 100000000
```

---

## Validation Targets

```yaml
validation:

  actual_rtp:
    target: 96.20%
    tolerance: ±0.10%
    pass_criteria: simulated_rtp between 96.10% and 96.30%
    measurement: total_win / total_bet across all 100M spins

  hit_frequency:
    target: 30%
    tolerance: ±2%
    pass_criteria: hit_rate between 28% and 32%
    measurement: spins_with_any_win / total_spins
    # A 'win' is any spin where total payout > 0 (including scatter pays)

  free_spin_frequency:
    target: 0.77%        # ~1 in 130 base spins, derived from the approved base-game reel set
    tolerance: ±0.15%
    pass_criteria: fs_trigger_rate between 0.62% and 0.92%
    measurement: spins_triggering_free_spins / total_base_game_spins
    # Retriggers counted separately (not included in base trigger rate)

  max_exposure:
    target: 10000x cap never exceeded
    pass_criteria: zero spins in simulation pay out above 10000x total bet
    measurement: max(spin_win / bet) across all 100M spins
    expected_max: <= 10000x

  volatility_index:
    # Volatility measured as standard deviation of spin win / bet ratio
    # High volatility profile: std_dev typically 30–80 for this game type
    target_level: high
    target_std_dev: 40       # target standard deviation of win/bet ratio
    tolerance: ±10
    pass_criteria: std_dev between 30 and 50
    measurement: std_dev(spin_win / total_bet) across all 100M spins

  free_spin_rtp_contribution:
    target: 38.2%
    tolerance: ±1.0%
    pass_criteria: fs_contribution between 37.2% and 39.2%
    measurement: total_free_spin_win / total_win across all 100M spins

  base_game_rtp_contribution:
    target: 58.0%
    tolerance: ±1.0%
    pass_criteria: base_contribution between 57.0% and 59.0%
    measurement: total_base_game_win / total_win across all 100M spins
```

---

# 14. AI Tasks

> **Authoritative list is in overview.md → AI Development Tasks.**
> The list below covers math-engine specific tasks only.

## Math Engine Tasks

* Weighted RNG system (base/free-spin per-reel strips, post-gen Wild cap enforcement)
* Ways evaluator (243-ways, consecutive left-to-right, highest-match-only)
* Cascade engine (gravity refill, Wild retention, scatter deferred trigger)
* Free spin state machine (entry, multiplier progression, retrigger cap, exit)
* RTP simulator (100M-spin Monte Carlo, all validation targets in Section 13)
* Paytable generator (base/free-spin symbol × match-count × ways, operation order per Section 5)
* Math profile tooling (export, search, verify, and promote approved profiles)

---

# 15. Open Questions

> Items marked ✅ have been resolved and documented in their respective sections.

* ✅ 是否允许wild only win — **RESOLVED: No.** See Section 5 (`wild_only_win: false`)
* ✅ 是否允许wild multiplier in free spins only — **RESOLVED: Both base game and free spins.** See Section 5 (`multiplier_active_in`)
* ✅ 是否限制连续cascades — **RESOLVED: Hard cap of 20, early stop, no extra payout.** See Section 11.
* ✅ 是否允许free spin专属reel set/paytable — **RESOLVED: Yes.** Free spins may use dedicated reel sets and paytables from the approved math profile; fallback is same as base game. See Sections 4, 7, and 8.
* [ ] 是否允许4 scatter direct retrigger — currently retrigger requires 3+ scatters during free spins; decide if 4 scatters mid-free-spin grants a direct bonus round instead
* [ ] 是否增加super free spins — if yes, define trigger condition, spin count, and multiplier profile
* ✅ 是否允许max win early stop — **RESOLVED: Yes, early stop at 10,000x.** See Section 11 (`method: early_stop`)
