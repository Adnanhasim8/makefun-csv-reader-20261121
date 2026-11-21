[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Adnanhasim8/makefun-csv-reader-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Adnanhasim8/makefun-csv-reader-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# Faster csv-reader

A faster drop-in for make.fun's own csv-reader 1.0.0: `solve.js` answers every
case exactly as csv-reader does — same `{columns, rows, errors}` for the same
`{text, header}`, including its broken-row policy (stray CRs, quote junk,
unterminated quotes, short and long rows, blank lines, BOM) — but reads with
slices instead of one character at a time, so it runs several times faster on
CPU time.

## Layout

- `solve.js` — the entry: an ES module whose `run(input)` returns csv-reader's
  answer for one case's input. Dependency-free.
- `main.ts` — the program the harness runs: reads every case from
  `/input/cases.json`, answers each with `run`, writes `/output/answers.json`.
- `LICENSE` — MIT.

## Run locally

```sh
node main.ts   # with MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR set, or /input and /output
```

Node 22 or later. No dependencies, no network, no build step.

---

<sub>Entered on [make.fun](https://make.fun/?ref=vev5ehp3&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
