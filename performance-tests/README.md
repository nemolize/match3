# Rendering performance benchmark

This harness records reproducible Canvas2D/DOM baselines and future WebGPU
candidates. It builds the production application and the product-equivalent
benchmark fixture, warms up every scenario, and records repeated measurements.

## Profiles

Profiles are versioned in [`profiles.mjs`](./profiles.mjs). Do not override
individual workload fields for accepted measurements: a named profile is the
compatibility contract.

- `cpu-stress`: bundled headless Chromium, 4x CPU throttling, five repetitions,
  and a 3-second idle sample. Use it for deterministic main-thread stress.
- `hardware-gpu`: headed stable Chrome, no CPU throttling, seven repetitions,
  and a 5-second idle sample. Use it for official GPU comparisons.

Both profiles record frame-interval percentiles, over-budget frames, Long Tasks,
Chrome main-thread costs, presentation diagnostics, renderer identity, browser,
OS/CPU/GPU/WebGPU adapter metadata, viewport, workload, seeds, durations, and
repetition counts.

## Record a report

Run from a clean worktree:

```sh
pnpm run perf:render -- --profile cpu-stress
pnpm run perf:render -- --profile hardware-gpu
```

The command creates a unique, immutable draft in `.performance-results/`. The
name includes the UTC timestamp, profile, and source revision; recording never
silently overwrites an earlier run.

`hardware-gpu` requires an installed stable Chrome and a headed session. A
WebGPU variant fails if the adapter is unavailable or software-rendered.

For harness development only, `--allow-dirty` permits a dirty source tree. The
report records its source fingerprint, but the acceptance command rejects it:

```sh
pnpm run perf:render -- --profile cpu-stress --allow-dirty
```

## Accept and preserve a baseline

A clean report can be recorded and accepted without manual renaming:

```sh
pnpm run perf:render -- --profile hardware-gpu --accept-as baseline
```

Or accept an existing clean draft:

```sh
pnpm run perf:accept -- .performance-results/<report-id>.json --role baseline
```

Acceptance copies the immutable report into
`performance-baselines/reports/` and updates the version-controlled index. If a
profile already has a selected baseline, preserve the old report and explicitly
select the replacement:

```sh
pnpm run perf:accept -- .performance-results/<report-id>.json \
  --role baseline --replace-baseline
```

To recover a previous baseline, select any earlier baseline from
`performance-baselines/index.json`:

```sh
pnpm run perf:baseline:select -- \
  --profile hardware-gpu \
  --report-id <earlier-report-id>
```

The selection history is append-only inside the index, so replacement and
recovery remain auditable.

Accept/select operations hold `performance-baselines/.index.lock` while updating
the store. Report and comparison files are immutable and idempotent, so retrying
the same operation recovers an artifact left before an interrupted index write.
If a process is forcibly terminated, verify that no performance command is
running before removing the stale lock and retrying.

## Compare and accept a candidate

Compare any two reports directly:

```sh
pnpm run perf:compare -- \
  performance-baselines/reports/<baseline-id>.json \
  .performance-results/<candidate-id>.json
```

The command rejects browser, hardware, workload, viewport, renderer-profile,
seed, throttle, duration, or repetition mismatches. `--allow-incompatible`
prints exploratory output but does not make the reports acceptable.

Each profile defines relative thresholds plus absolute noise floors for
mean/p50/p95/p99 frame intervals, over-budget frame ratio, Long Task duration,
and Chrome Task, Script, Layout, and style-recalculation costs. The larger of
the relative or absolute allowance is used; allowances are never added
together. A regression exits with status 2. Accepting a candidate runs the same
comparison against the selected baseline for its exact hardware/OS fingerprint
and stores a compact decision in `performance-baselines/comparisons/`:

```sh
pnpm run perf:render -- \
  --profile hardware-gpu \
  --accept-as candidate
```

`--allow-regression` is an explicit project decision escape hatch. It preserves
the failed comparison instead of changing or bypassing the thresholds.

## Scenarios and GPU timing contract

The scenarios cover idle water animation and the full trigger-to-completion
lifecycle of 12 simultaneous gem-fragment bursts. The frame and Long Task
observers are armed before an rAF callback triggers the renderer-neutral
workload, then telemetry stops the interval only after all bursts complete. DOM
particle counts are sampled in a separate untimed fixture validation only as a
DOM-renderer cross-check. An independent fixed particle seed keeps fragment
trajectories stable even when a background renderer consumes a different random
sequence.

End-to-end measurements use `requestAnimationFrame`, Long Tasks, Chrome
main-thread metrics, and a separate presentation trace. Raw Chrome traces are
diagnostic only and are not retained by default. If traces are captured during
an investigation, attach them to the corresponding GitHub Actions run or PR and
record the artifact link and retention period in the PR; the accepted JSON
report and compact comparison remain permanently versioned here.

A WebGPU renderer can expose renderer-owned timestamp-query results through:

```js
globalThis.__match3RendererPerformance = {
  resetGpuTimings: async () => {},
  readGpuTimings: async () => ({
    supported: true,
    timestampPeriodNs: 1,
    passes: {
      backgroundCaustics: { durationNs: 120000, sampleCount: 60 },
      gemRefraction: { durationNs: 90000, sampleCount: 60 },
      fragments: { durationNs: 45000, sampleCount: 60 },
      composite: { durationNs: 30000, sampleCount: 60 },
    },
  }),
};
```

The benchmark resets this API before every measured repetition and persists the
returned pass data. The renderer remains responsible for feature detection,
query-set ownership, resolve/readback buffers, and converting timestamp deltas;
the harness does not insert GPU work or distort the render graph. When the
adapter exposes `timestamp-query`, every required pass must provide a finite
non-negative `durationNs` and a positive `sampleCount`. Canvas2D reports record
the API as unavailable. The idle scenario may report its unused fragment pass
as `{ status: "inactive", durationNs: 0, sampleCount: 0 }`; all passes in the
burst scenario and the other idle passes require measured samples.
