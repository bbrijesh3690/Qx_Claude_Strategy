# Phase 2, round 2: Fable 5.1 response

Relayed by the owner on 2026-09-15 and recorded as received, before any of the
measurements it proposes were run. The prompt is in `phase2-round2.md`.

---

**1. Critique**

The VR table says the 1m closes are a driftless random walk at every horizon from 1 minute to 4 hours, on all nine assets: ρ₁ within one sd of zero everywhere, VR(15) and VR(60) inside noise, and mean VR(240) of 0.92 is −1.1 SE from 1. If that hint of slow reversion is real it implies a half-life of ~16 h, worth ~55% at 15m, not 70%. GBP/NZD (0.55) and USD/PHP (0.67) are within what nine draws at sd 0.22 produce.

h001's 40.6% kills the tether at any speed: a pull with any half-life predicts a fade rate above 50%. Status: OU anchoring at any horizon a 15m expiry can reach — ruled out. Fast jitter and publishing smoothing — ruled out by ρ₁. Drift regimes/momentum — ruled out by VR ≤ 1 at all lags. Hard clip — weakened (a binding boundary depresses VR(240); seven assets show ≈1) but untested. Anti-trader shading — untouched.

On "follow the deviation": no. The only pre-registrable continuation mechanism is trend injection, and VR(15)=VR(60)=1 with VR(240)<1 excludes it. Trades blocked 15 bars apart on the same excursion probably mean 25–40 effective trials; 40.6% is then ~1σ from 50%, uncorrected for clustering or Holm. Read it as a coin flip. One number would settle it: distinct excursions among the 106 trades, with win rate by direction.

**2. h002**

Don't spend the slot yet; the odds fell, but a free test decides it. A clip pins touches to one price; a random walk scatters them across the 0.5σ band. On the existing train window, for each of the 53 fires report the spread (max − min, in ticks) of the touching bars' highs (lows for support), per asset. A clip shows as a mass at 0–1 tick on at least one asset; a random walk spreads across the band. Also report what fraction of decision bars the 8σ guard nulled — if the diffs are fat-tailed it blanks many 6-hour windows and depresses h002's fire rate for a reason unrelated to the mechanism. If pinning appears, screen h002 unchanged on a fresh capture of ~8 days (62 trades at ~10/day, plus a 6-hour warmup lost after every gap); GBP/NZD and USD/PHP are where it would carry. If no pinning, drop it — a boundary that never binds in five days on seven of nine assets is not a 75% setup on any of them.

**3. Decision: (c)**

Two measurements, no slot spent.

The first is the h002 fingerprint above.

The second targets the only structure left that carries direction. Between shocks the feed is a martingale; the shocks are level resets. If the resets are re-syncs to an external reference, the pre-reset gap to that reference predicts the reset's sign, and if resets are scheduled or threshold-triggered, its timing. Build the shock catalogue from the train window (UTC time, asset, size, sign) and line the OTC series up against read-only 1m OHLC of the real pairs for the same minutes — feasible for the four NZD crosses, MXN and BRL; BDT, IDR and PHP are unlikely to have usable minute bars. Three questions: (i) does the post-shock OTC close land within ~0.1% of the real rate far more often than the pre-shock close does; (ii) are shock times concentrated at particular UTC minutes or hours; (iii) does |OTC − real| just before a shock cluster at a fixed band. A "yes" on (i) plus a "yes" on (ii) or (iii) yields the one hypothesis on this feed I'd expect to clear 75%: a jump whose direction is known in advance and whose timing is predictable. It would fire ~3 trades/day across nine assets, so 62 trades needs ~3 weeks of capture, and the loader would need a second series passed through ctx, which is outside the current form. Three "no"s mean the feed is a random walk with unpredictable resets, and I'd recommend stopping at that point.

Why not (a) now: the two measurements resolve the only structures the VR table leaves room for, at zero budget. Why not (b): I cannot name a mechanism the table leaves room for at ≤15m that isn't already h002 or contingent on the second measurement; anything else registered now is a 50% rule spending a slot.

**4. Probability update**

About 5% → about 2%. What moved it: a random walk at every horizon a closed-bar rule at ≤15m can exploit, on every asset, which by construction makes those rules coin flips at −5.3% EV; h001 dead in the direction the last surviving tether mechanism required. The remaining 2% is clip-or-scheduled-reset, both measurable rather than screenable. Even a confirmed scheduled reset faces a second hurdle: a counterparty who sees it exploited can change the schedule, and "out of sample" then means "before they notice."
