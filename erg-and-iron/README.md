# Erg & Iron

A concurrent training dashboard and workout planner for competitive rowers who lift. It answers one question every day: how much can I do in the gym without wrecking tomorrow's row?

React, Tailwind CSS and Lucide icons. Everything runs in the browser and is saved to `localStorage`; there is no server.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Other scripts:

- `npm test`: unit tests for the training maths (`node --test`, no extra dependencies)
- `npm run build`: production build in `dist/`
- `npm run build:standalone`: one self-contained file, `dist-standalone/erg-and-iron.html`, with React loaded from cdnjs

The app opens with example data for an 88 kg rower (2k best 6:18.4 at 1:34.6, 140 kg trap bar deadlift, 64,000 m in the last week). The data is dated relative to today, so there is always a heavy deadlift session yesterday and AT intervals tomorrow. **Reset Demo Data** in the top-right corner restores it.

## Views

1. **Command Dashboard**: readiness gauges for the lower body / posterior chain and the CNS / upper body with coaching guidance, the interference alert with one-click **Auto-Adapt Today's Lift**, today's plan, and the last 7 days of metres and tonnage.
2. **Workout Logger**: log a rowing session (type, distance, split, rate, RPE, with live watts) or a lifting set block (exercise by stroke phase, sets, reps, weight, bar speed). Each form previews what logging will do to readiness.
3. **Power Transfer & Stroke Phases**: 2k and peak watts against the trap bar deadlift, front squat and weighted pull-up; the Power Transfer Ratio; an 8-week strength vs erg trend; and the split of lifting volume across catch/drive, body swing/core and finish/posture with an injury-prevention flag.
4. **Pre-Session Micro-Primer**: a six-minute, five-drill warm-up for Post-Erg → Pre-Lift or Post-Lift → Pre-Erg with a countdown timer.

## How the numbers work

All of this is in `src/lib/` and covered by `test/lib.test.js`.

**Watts.** The Concept2 formula: `watts = 2.80 / pace³`, with pace in seconds per metre (`rowing.js`).

**Readiness** (`load.js`). Every workout adds fatigue to two systems. Fatigue fades by a fixed share each night and readiness is what is left:

```
fatigue(day)   = Σ impulse(workout) × retain ^ (days since)     retain: posterior 0.55, CNS 0.45
readiness(day) = 100 × e^(−fatigue / 160)
```

- Row impulse: `(10 + minutes) × RPE × zone cost`. Sprint work costs the CNS most; long steady state costs the legs.
- Lift impulse: `sets × exercise cost × √(reps / 5) × relative load × bar speed`. Bar speed is 0.8 (explosive), 1.0 (moderate) or 1.45 (grindy). A trap bar deadlift costs the posterior chain about 30 times what a bench press does.
- 75% and above is Primed, 50–74% is Manage Load, below 50% is High Fatigue.

**Pace guidance** (`rowing.js`). Each zone is a band of 2k watts (UT2 is 45–50%). Below 85% readiness the fast end of the band is pulled back; below 60% the easy end relaxes too.

**Interference** (`plan.js`). Tomorrow's readiness is projected with the same model three ways: today's lift as planned, auto-adapted, and skipped. Each row type has a minimum (AT needs 70% posterior, 60% CNS). Auto-Adapt replaces every heavy lower-body or posterior lift with upper-body push or core work and keeps the rest.

**Stroke-phase balance** (`analytics.js`). Share of the last 7 days of lifting by working sets or by tonnage. Any phase under 15% raises a flag; any phase over 65% raises a dominance warning. Pressing is logged but sits outside the split.

**Power transfer** (`analytics.js`). Estimated 1RM uses the Epley formula. The Power Transfer Ratio is 2k watts divided by trap bar deadlift 1RM. The trend indexes the summed 1RM of the three key lifts against a chained index of best weekly watts in AT, sprint and 2k-pace pieces, each compared only with itself.

These models are simple, transparent heuristics for planning. The constants, the 2.4–3.0 "balanced" ratio band and the readiness thresholds are rules of thumb, not validated sports science, and none of it is medical advice.

## Files

- `src/lib/`: dates, rowing maths, exercise library, readiness model, plan and Auto-Adapt, analytics, coaching text, primer drills, demo data, store
- `src/components/`: shared UI and the hand-drawn SVG/HTML charts
- `src/views/`: the four views
- `tools/`: the standalone single-file build
