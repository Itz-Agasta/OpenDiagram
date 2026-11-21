# Harness tests

`just test` from the repo root runs them (with the web suite); `bun test` here runs only these.

| Folder        | What goes there                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/`       | One file per source area (`pinned` for `layoutPinned`, `labels` for `router/labels.ts`, ...). Fixed inputs, hand-worked expectations. |
| `properties/` | Invariants over random specs (fast-check): what must hold for any diagram.                                                            |
| `fixtures/`   | Stored specs: the golden-score corpus, and `stress.ts` (synthetic stress shapes and fixed regressions, never user prompts).           |
| `snapshots/`  | The stress corpus laid out: hard checks plus a geometry snapshot per fixture (boxes and waypoints on a 4px grid).                     |
| `support/`    | Shared builders: `helpers.ts` (hand-built drawings, geometry checks), `arb.ts` (the random-spec generator).                           |

## Rules

- Assert what should happen, worked out from the intent, never output copied from a run. A new test that fails on current code found a bug: fix the code, don't loosen the test. Snapshots are the one exception: they record a run, so a baseline is only committed after its render was checked by eye.
- Prove a test guards its line: break that line, watch the test fail, restore it.
- A property counterexample becomes a `unit/` test with readable ids and labels once fixed (see `unit/align.test.ts`).

## Snapshots

A layout or routing change shows up as a snapshot diff. Render the changed fixtures, look at them, and only then run `just snapshots` and commit the new `.snap` with the change. CI never writes snapshots, so a missing or stale one fails.

## Property runs

CI uses a fixed seed and run count. To explore:

```bash
FC_RUNS=500 bun test properties          # more specs
FC_SEED=123 bun test properties          # another sample
```

A failure prints the seed, the path and a shrunk counterexample; rerun with the printed seed to reproduce.
