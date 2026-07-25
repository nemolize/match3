export interface Star {
  x: number;
  y: number;
  z: number;
  prev: { x: number; y: number } | null;
}

export interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
}

const BASE_FRAME_MS = 1000 / 60;

const STAR_COUNT = 180;
const STAR_SPEED = 0.0018;
const NEBULA_WISP_COUNT = 3;

export const makeStars = (count = STAR_COUNT): Star[] =>
  Array.from({ length: count }, () => ({
    x: Math.random() * 2 - 1,
    y: Math.random() * 2 - 1,
    z: Math.random(),
    prev: null,
  }));

export const makeDustParticle = (x: number, y: number): DustParticle => ({
  x,
  y,
  vx: (Math.random() - 0.5) * 0.6,
  vy: (Math.random() - 0.5) * 0.6 - 0.2,
  life: 0,
  maxLife: 80 + Math.random() * 120,
  size: 1 + Math.random() * 2.5,
  hue: Math.random() * 60 + 200,
});

/**
 * Advances and draws the perspective-projected starfield. Motion constants are
 * tuned in 60fps-frame units; `deltaMs` scales the step so speed is
 * frame-rate independent.
 */
export const drawStars = (
  ctx: CanvasRenderingContext2D,
  stars: Star[],
  width: number,
  height: number,
  deltaMs: number,
): void => {
  const dt = deltaMs / BASE_FRAME_MS;
  const cx = width / 2;
  const cy = height / 2;

  for (const star of stars) {
    star.z -= STAR_SPEED * dt;
    if (star.z <= 0) {
      star.x = Math.random() * 2 - 1;
      star.y = Math.random() * 2 - 1;
      star.z = 1;
      star.prev = null;
    }

    const sx = (star.x / star.z) * cx + cx;
    const sy = (star.y / star.z) * cy + cy;
    const size = Math.max(0.3, (1 - star.z) * 2.5);
    const alpha = Math.min(1, (1 - star.z) * 1.4);

    if (star.prev) {
      ctx.beginPath();
      ctx.moveTo(star.prev.x, star.prev.y);
      ctx.lineTo(sx, sy);
      ctx.strokeStyle = `rgba(200, 220, 255, ${alpha * 0.7})`;
      ctx.lineWidth = size * 0.5;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(220, 235, 255, ${alpha})`;
    ctx.fill();

    star.prev = { x: sx, y: sy };
  }
};

/**
 * Advances and draws drifting dust motes, recycling any that expire or leave
 * the viewport. Mutates `dust` in place.
 */
export const updateAndDrawDust = (
  ctx: CanvasRenderingContext2D,
  dust: DustParticle[],
  width: number,
  height: number,
  deltaMs: number,
): void => {
  const dt = deltaMs / BASE_FRAME_MS;

  for (let i = 0; i < dust.length; i++) {
    const p = dust[i];
    if (!p) continue;

    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const outOfBounds =
      p.x < -10 || p.x > width + 10 || p.y < -10 || p.y > height + 10;
    if (p.life >= p.maxLife || outOfBounds) {
      dust[i] = makeDustParticle(Math.random() * width, height + 10);
      continue;
    }

    const progress = p.life / p.maxLife;
    const alpha =
      progress < 0.2
        ? progress / 0.2
        : progress > 0.8
          ? (1 - progress) / 0.2
          : 1;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${alpha * 0.6})`;
    ctx.fill();
  }
};

/** Draws slow-orbiting translucent nebula clouds. */
export const drawNebulaWisps = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsedMs: number,
  baseHue: number,
): void => {
  const cx = width / 2;
  const cy = height / 2;

  for (let i = 0; i < NEBULA_WISP_COUNT; i++) {
    const angle = elapsedMs * 0.00006 + (i * Math.PI * 2) / NEBULA_WISP_COUNT;
    const wx = cx + Math.cos(angle) * width * 0.28;
    const wy = cy + Math.sin(angle * 0.7) * height * 0.22;
    const hue = baseHue + i * 40;

    const grad = ctx.createRadialGradient(wx, wy, 0, wx, wy, width * 0.22);
    grad.addColorStop(0, `hsla(${hue}, 70%, 40%, 0.07)`);
    grad.addColorStop(1, `hsla(${hue}, 70%, 40%, 0)`);

    ctx.beginPath();
    ctx.ellipse(
      wx,
      wy,
      width * 0.22,
      height * 0.16,
      angle * 0.3,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = grad;
    ctx.fill();
  }
};
