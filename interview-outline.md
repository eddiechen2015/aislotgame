# Interview Outline

## Goal

This outline is designed to help explain the project clearly in interviews.

It is optimized for:

- game backend roles
- engine/platform roles
- simulation-heavy systems roles
- AI-assisted engineering discussions

---

## 1. 30-Second Version

I took a TypeScript slot game prototype and turned it into a production-oriented math engine platform. The work included correcting payout logic, separating raw engine math from wallet settlement, adding market-specific payout caps and audit events, introducing runtime math profiles, building separate base and free-spin reel/paytable models, and creating Monte Carlo search and verification tooling for RTP optimization.

---

## 2. 2-Minute Version

The project started as a working 243-ways cascading slot, but it had several prototype-level issues: payout math shortcuts that broke under capped wild multipliers, independent weighted symbol generation instead of a proper reel-strip model, inconsistent wallet versus simulator money semantics, and no real workflow for tuning RTP.

I approached it like a systems-engineering problem rather than a code-generation task. First, I fixed correctness issues in the evaluator and settlement path. Then I refactored the architecture so the engine, settlement layer, server APIs, and simulation tooling were clearly separated. After that, I added runtime math profiles, separate base/free-spin reel sets and paytables, automated RTP search, profile verification, and regression tests. The result is no longer just a slot game implementation; it is a tunable and verifiable slot math platform.

---

## 3. Strong Interview Story Structure

### Problem

- The codebase looked complete, but important rules were only approximately implemented.
- Wallet settlement and simulator reporting could diverge.
- The reel model did not match documented strip behavior.
- There was no production-friendly workflow for tuning RTP and feature structure.

### Actions

- Rewrote payout evaluation for exact per-way capped behavior.
- Introduced a dedicated settlement layer.
- Moved balances to integer cents.
- Added market-specific absolute payout caps and audit events.
- Replaced weighted cell sampling with reel strips and visible windows.
- Added runtime math profiles and profile validation.
- Added separate base/free-spin reel sets and paytables.
- Built RTP search and verification tooling.
- Added deterministic regression tests.

### Result

- The system became much more reliable and production-oriented.
- Math experiments became reproducible and safer.
- The project gained a full workflow for profile export, search, verification, and future promotion.

---

## 4. Key Points To Emphasize

### Architectural Thinking

Talk about how you separated:

- raw engine math
- settlement
- API responses
- market rules
- simulation/search infrastructure

This shows systems design maturity.

### Correctness Thinking

Talk about how you identified places where “almost correct” math is still wrong in a regulated-style game system:

- per-way multiplier caps
- event rounding
- wallet vs simulator consistency
- cascade lifetime constraints

This shows rigor, not just coding speed.

### AI Engineering Thinking

Frame the project as:

- AI-assisted debugging
- AI-assisted refactoring
- AI-assisted architecture evolution

not just:

- AI wrote some code

This makes the project much stronger in interviews.

### Tooling Mindset

Highlight that you did not stop at fixing bugs.
You also built the tooling required to continue math tuning safely:

- profile export
- profile verification
- RTP search
- regression tests

This signals long-term engineering thinking.

---

## 5. Typical Interview Questions and Good Angles

### Q: What was the hardest technical issue?

Good answer:

The hardest issue was not a syntax bug. It was realizing that the payout evaluator’s aggregation shortcut was invalid once the rules required a per-way capped multiplier. That forced a deeper rewrite to an exact DP-based evaluation model. It was a correctness problem hidden behind apparently reasonable code.

### Q: What was the biggest architectural improvement?

Good answer:

Separating the raw engine from the settlement layer. Once that was done, wallet math, simulator math, API math, and market caps became consistent and testable. That was the point where the system became production-capable instead of prototype-like.

### Q: How did AI help in this project?

Good answer:

AI was useful as a fast architectural and implementation partner. It helped surface hidden assumptions, iterate through refactors quickly, and scaffold tooling around the engine. But the important part was treating the work as engineering review and systems design, not as blind code generation.

### Q: What did you learn from the tuning workflow?

Good answer:

I learned that total RTP alone is a weak target. A slot can hit the total RTP target while still having the wrong base/feature split, hit rate, or trigger frequency. That is why I added separate free-spin reel and paytable dimensions and a profile-based search workflow.

### Q: What is still unfinished?

Good answer:

The engine architecture is close to production-grade, but the default math profile still needs more structured optimization to fully align total RTP, base/feature split, hit frequency, and trigger frequency at the same time. The key point is that the platform now supports that tuning process properly.

---

## 6. Strong Phrases To Reuse

- “I treated it as a correctness-critical systems problem, not just a gameplay feature.”
- “The biggest shift was separating raw engine math from credited wallet settlement.”
- “The project evolved from a slot prototype into a math platform.”
- “The value was not only fixing bugs, but building repeatable math workflows.”
- “AI was most useful as an engineering accelerator around auditing, refactoring, and tooling.”

---

## 7. Red Flags To Avoid in Interviews

Avoid saying:

- “I just tuned some numbers until RTP looked right.”
- “AI wrote most of it for me.”
- “The engine was fine; I only added documentation.”

These weaken the project significantly.

Better framing is:

- identified hidden correctness issues
- formalized engine/settlement boundaries
- built a profile-driven tuning workflow
- used AI to accelerate complex engineering iteration

---

## 8. Suggested Interview Closing

What I like about this project is that it demonstrates a full engineering loop: code review, mathematical correction, architecture refactoring, settlement safety, simulation tooling, and profile-based optimization. It is a much better representation of how I use AI in practice than a simple code-generation demo because the value came from systematic engineering judgment.
