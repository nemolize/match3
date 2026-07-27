export interface Bubble {
  x: number;
  y: number;
  radius: number;
  riseSpeed: number;
  wobblePhase: number;
  wobbleFreq: number;
  wobbleAmp: number;
}

const BASE_FRAME_MS = 1000 / 60;

const GOD_RAY_COUNT = 4;

/** Screen px per caustic-buffer px. A scale of 5 keeps a ~450px board near
 * 7.5k samples before the component's every-other-frame update cadence. */
const CAUSTIC_SCALE = 5;

/** Warp-iteration depth of the caustic field. More iterations = finer
 * filament structure, linearly more per-pixel trig. */
const CAUSTIC_ITERATIONS = 3;

export const makeBubble = (
  width: number,
  height: number,
  spawnAnywhere = false,
): Bubble => ({
  x: Math.random() * width,
  y: spawnAnywhere ? Math.random() * height : height + 8,
  radius: 1.5 + Math.random() * 3.5,
  riseSpeed: 0.35 + Math.random() * 0.75,
  wobblePhase: Math.random() * Math.PI * 2,
  wobbleFreq: 0.015 + Math.random() * 0.025,
  wobbleAmp: 3 + Math.random() * 7,
});

/**
 * Advances and draws rising bubbles, recycling any that pass the surface.
 * Horizontal wobble is derived from depth so bubbles trace a sway path
 * instead of translating rigidly. Mutates `bubbles` in place.
 */
export const updateAndDrawBubbles = (
  ctx: CanvasRenderingContext2D,
  bubbles: Bubble[],
  width: number,
  height: number,
  deltaMs: number,
): void => {
  const dt = deltaMs / BASE_FRAME_MS;

  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i];
    if (!b) continue;

    b.y -= b.riseSpeed * dt;
    if (b.y < -b.radius - 4) {
      bubbles[i] = makeBubble(width, height);
      continue;
    }

    const drawX =
      b.x + Math.sin(b.wobblePhase + b.y * b.wobbleFreq) * b.wobbleAmp;
    // Fade out just below the surface so recycling never pops.
    const alpha = Math.min(1, Math.max(0, b.y / (height * 0.12))) * 0.65;
    if (alpha <= 0) continue;

    ctx.beginPath();
    ctx.arc(drawX, b.y, b.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(220, 248, 255, ${alpha * 0.18})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(230, 250, 255, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Specular glint on the upper-left rim.
    ctx.beginPath();
    ctx.arc(
      drawX - b.radius * 0.35,
      b.y - b.radius * 0.35,
      Math.max(0.4, b.radius * 0.28),
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
    ctx.fill();
  }
};

/** Buffer dimensions for `renderCaustics`, derived from the board size. */
export const causticBufferSize = (
  width: number,
  height: number,
): { w: number; h: number } => ({
  w: Math.max(1, Math.round(width / CAUSTIC_SCALE)),
  h: Math.max(1, Math.round(height / CAUSTIC_SCALE)),
});

/**
 * Renders the caustic light net into a straight-alpha RGBA buffer
 * (`w`×`h`, as from `ImageData.data`). The caller blits it upscaled onto
 * the main canvas — smoothing during the upscale gives the filaments
 * their natural softness.
 *
 * The field is the classic iterated coordinate-warp: each iteration
 * displaces the sample point through sin/cos of its own previous
 * displacement, and brightness spikes where the warped phases align.
 * That alignment set is a web of thin curves — a genuine filament net
 * that shimmers as `t` advances, unlike a sum-of-sines whose maxima are
 * round blobs.
 */
export const renderCaustics = (
  data: Uint8ClampedArray,
  w: number,
  h: number,
  elapsedMs: number,
): void => {
  const t = elapsedMs * 0.00035;
  // ~1.6 pattern periods across the larger side; offset far from the
  // origin so the 1/length term below never blows up.
  const freq = (Math.PI * 2 * 1.6) / Math.max(w, h);

  let o = 0;
  for (let y = 0; y < h; y++) {
    // Light concentrates toward the surface.
    const depthFade = 1 - (y / h) * 0.5;
    const py = y * freq - 250;

    for (let x = 0; x < w; x++) {
      const px = x * freq - 250;

      let ix = px;
      let iy = py;
      let c = 1.0;
      for (let n = 0; n < CAUSTIC_ITERATIONS; n++) {
        const tt = t * (1 - 3.5 / (n + 1));
        const nx = px + Math.cos(tt - ix) + Math.sin(tt + iy);
        const ny = py + Math.sin(tt - iy) + Math.cos(tt + ix);
        ix = nx;
        iy = ny;
        // 1/length(p * inten / phase): large only where both warped
        // phases approach their extrema together — the filament set.
        const dx = px / (Math.sin(ix + tt) * 200);
        const dy = py / (Math.cos(iy + tt) * 200);
        c += 1 / Math.sqrt(dx * dx + dy * dy);
      }
      c /= CAUSTIC_ITERATIONS;
      c = 1.17 - c * Math.sqrt(c); // ≈ c^1.4 of the classic form, w/o pow()
      let v = Math.abs(c);
      v = v * v * v * v;
      v = v * v; // v^8: crush the field so only the ridges survive
      if (v > 1) v = 1;

      data[o] = 215;
      data[o + 1] = 248;
      data[o + 2] = 255;
      data[o + 3] = (v * depthFade * 255) | 0;
      o += 4;
    }
  }
};

/** Draws slow-swaying shafts of sunlight angling down from the surface. */
export const drawGodRays = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsedMs: number,
): void => {
  const t = elapsedMs * 0.001;

  for (let i = 0; i < GOD_RAY_COUNT; i++) {
    const baseX = width * (0.12 + (0.76 * i) / (GOD_RAY_COUNT - 1));
    const topX = baseX + Math.sin(t * 0.25 + i * 1.9) * width * 0.05;
    const drift = width * 0.14 + Math.sin(t * 0.18 + i * 0.8) * width * 0.04;
    const alpha = 0.1 + 0.05 * Math.sin(t * 0.4 + i * 2.1);

    const grad = ctx.createLinearGradient(topX, 0, topX + drift, height);
    grad.addColorStop(0, `rgba(235, 253, 255, ${alpha})`);
    grad.addColorStop(1, "rgba(235, 253, 255, 0)");

    ctx.beginPath();
    ctx.moveTo(topX - width * 0.025, 0);
    ctx.lineTo(topX + width * 0.025, 0);
    ctx.lineTo(topX + drift + width * 0.07, height);
    ctx.lineTo(topX + drift - width * 0.07, height);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }
};
