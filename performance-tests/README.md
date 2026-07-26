# Rendering performance benchmark

This harness records a reproducible Canvas2D baseline that can be compared with
future WebGPU renderers. It builds the production bundle, serves the preview,
warms up each scenario, and records five measured repetitions by default.

## Record a report

Run from a clean worktree:

```sh
pnpm run perf:render
```

Reports are written to the ignored `performance-results/` directory. Each report
records the source revision, renderer stack, benchmark parameters, browser,
CPU/GPU environment, median results, per-run dispersion, and raw runs. A
presentation trace runs separately so trace collection does not distort the
frame and main-thread measurements. It is diagnostic only and is not included
in percentage comparisons.

The scenarios cover idle water animation and the exact lifetime of 12
simultaneous gem-particle bursts. An independent fixed particle seed keeps
particle trajectories stable even when a background renderer consumes a
different random sequence.

For a hardware-backed WebGPU comparison, record both the Canvas2D baseline and
WebGPU candidate with the same installed Chrome channel:

```sh
PERF_HEADLESS=0 PERF_BROWSER_CHANNEL=chrome pnpm run perf:render
```

The default bundled headless browser is useful for CPU-oriented baselines, but
may not expose a WebGPU adapter. A WebGPU report fails when no adapter is
available or a software adapter is detected. Set
`PERF_ALLOW_SOFTWARE_GPU=1` only for exploratory runs.

The following environment variables tune the benchmark:

- `PERF_BROWSER_CHANNEL`: Playwright browser channel, such as `chrome`.
- `PERF_CPU_THROTTLE`: CPU throttle rate. Defaults to `1`; use `4` for a
  repeatable low-end CPU profile.
- `PERF_HEADLESS`: set to `0` for headed hardware-GPU measurement.
- `PERF_IDLE_DURATION_MS`: idle scenario duration. Defaults to `3000`.
- `PERF_RANDOM_SEED`: deterministic page-level seed for background randomness.
  The independent particle seed is part of the recorded workload contract.
- `PERF_REPETITIONS`: measured repetitions after warm-up. Defaults to `5`.

`PERF_ALLOW_DIRTY=1` permits local harness validation, but dirty reports are not
suitable as official baselines. Their source fingerprint includes tracked and
untracked changes for traceability.

## Compare reports

```sh
pnpm run perf:compare performance-results/baseline.json performance-results/candidate.json
```

The comparison refuses reports with different browser, machine/GPU, workload,
viewport, seed, throttle, duration, or repetition settings. Use
`--allow-incompatible` only to inspect exploratory results.

The report combines `requestAnimationFrame` intervals and Long Tasks with Chrome
main-thread metrics and a presentation trace for produced/dropped frames. When a
WebGPU renderer is implemented, renderer-owned GPU timestamp queries can be
added for pass-level timing while retaining this harness as the common
end-to-end comparison.
