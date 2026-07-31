# WebGPU board renderer

The board uses one WebGPU device and presentation context for its visual
rendering. React remains authoritative for gameplay state and renders a
transparent DOM grid for pointer, keyboard, focus, and accessibility semantics.

## Render graph

Each frame is submitted as one command buffer with four ordered render passes:

1. `backgroundCaustics` refracts the sand through analytical wave normals,
   applies Beer-Lambert absorption and caustics, then blends a reflected sky
   using dielectric Fresnel into `background-color`.
2. `gemRefraction` copies that attachment to `scene-color`, then draws packed
   gem instances. This pass is the layer-interaction boundary for future
   background sampling and optical materials.
3. `fragments` loads `scene-color` and draws absolute-time ballistic fragment
   instances.
4. `composite` samples `scene-color` into the current presentation texture.

The two intermediate textures prevent a pass from sampling the attachment it is
writing. A future fluid implementation should add ping-pong state textures
before `backgroundCaustics` and bind the resulting displacement/normal texture
in `composite`; the gameplay and semantic DOM contracts do not need to change.

Renderer resources are persistent. Frame uniforms are uploaded every frame,
gem instances only when the board snapshot changes, fragment instances only
when bursts start or expire, and dimension-dependent textures only on resize.

## Time and deterministic state

- Water uses an accumulated clock with frame deltas clamped to 50 ms, so it
  does not jump after a background-tab stall. It freezes at a stable frame for
  reduced motion.
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
`globalThis.__match3RendererPerformance` for the four pass names above. Hardware
performance claims must use the versioned `hardware-gpu` profile and the
compatible baseline selected in `performance-baselines/index.json`. The
`cpu-stress` profile permits its declared SwiftShader adapter for functional
and CPU-pressure measurements; it is not a hardware performance claim.

The presentation canvas intentionally retains the baseline panel dimensions.
Fragments are therefore clipped at the canvas boundary; preserving the former
DOM overflow envelope would require an overscan presentation surface and a new
layout baseline.
