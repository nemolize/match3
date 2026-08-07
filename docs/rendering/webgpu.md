# WebGPU board renderer

The board uses one WebGPU device and presentation context for its visual
rendering. React remains authoritative for gameplay state and renders a
transparent DOM grid for pointer, keyboard, focus, and accessibility semantics.

## Render graph

Each frame is submitted as one command buffer with four ordered render passes.
When motion is enabled, they are preceded by a wave-simulation stage of one to
three compute substep passes:

1. `waveSimulation` advances persistent 64x64 ping-pong wave textures. Gem
   clears inject cell-centered velocity impulses, and bounded substeps preserve
   stability without dropping elapsed time.
2. `backgroundCaustics` refracts the sand through the simulated wave height and
   normals, applies depth-modulated Beer-Lambert extinction, single scattering,
   and caustics, then blends a reflected sky using dielectric Fresnel into
   `background-color`.
3. `gemRefraction` copies that attachment to `scene-color`, then draws packed
   gem instances. This pass is the layer-interaction boundary for future
   background sampling and optical materials.
4. `fragments` loads `scene-color` and draws absolute-time ballistic fragment
   instances.
5. `composite` samples `scene-color` into the current presentation texture.

The two intermediate color textures prevent a pass from sampling the attachment
it is writing. The wave state textures are separate storage textures; the
background pass samples the latest state directly.

`gridCoupling` is the finite-difference coupling in simulation-cell space, not
a resolution-independent screen-space speed. The 64x64 resolution is therefore
part of the propagation tuning as well as the fidelity and GPU-cost tradeoff.

Renderer resources are persistent. Frame uniforms are uploaded every frame,
gem instances only when the board snapshot changes, fragment instances only
when bursts start or expire, and dimension-dependent textures only on resize.

## Time and deterministic state

- Water uses an accumulated clock with frame deltas clamped to 50 ms, so it
  does not jump after a background-tab stall. Entering reduced motion clears
  the wave state so motion does not remain frozen onscreen or resume later.
- Gem transitions retain identity by gem ID and evaluate swap/drop descriptors
  from absolute time.
- Fragment descriptors reuse the seeded CPU initializer in
  `src/utils/particleLogic.ts`; WGSL evaluates the same absolute-time ballistic
  equations so frame stalls do not alter trajectories.

`src/rendering/webgpu/sceneState.ts` is the pure test seam for deterministic
descriptor construction. Pixel-exact equality across GPU vendors is not a
supported determinism guarantee.

## Failure and measurement

Unsupported APIs, missing adapters or contexts, shader compilation failures,
validation failures, uncaptured GPU errors, and device loss produce a visible
diagnostic. Device loss is terminal for this PoC; recovery would require
recreating every device-owned resource from CPU shadow state.

When `timestamp-query` is available, the renderer implements
`globalThis.__match3RendererPerformance` for the five pass names above. Hardware
performance claims must use the versioned `hardware-gpu` profile and the
compatible baseline selected in `performance-baselines/index.json`. The
`cpu-stress` profile permits its declared SwiftShader adapter for functional
and CPU-pressure measurements; it is not a hardware performance claim.

The presentation canvas intentionally retains the baseline panel dimensions.
Fragments are therefore clipped at the canvas boundary; preserving the former
DOM overflow envelope would require an overscan presentation surface and a new
layout baseline.
