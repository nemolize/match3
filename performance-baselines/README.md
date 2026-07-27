# Accepted rendering performance reports

This directory is the durable, version-controlled history for rendering
performance decisions.

- `reports/` stores immutable accepted reports. A report ID can never be
  overwritten.
- `comparisons/` stores compact threshold decisions for accepted candidates.
- `index.json` records all accepted reports, the selected baseline for each
  named profile plus hardware/OS fingerprint, and the complete
  baseline-selection history. Multiple GPUs can therefore retain independent
  selected baselines.

Generated reports remain in the ignored `.performance-results/` directory until
they are accepted. See [`performance-tests/README.md`](../performance-tests/README.md)
for recording, comparison, replacement, and recovery commands.
