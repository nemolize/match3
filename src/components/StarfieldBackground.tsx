import { useEffect, useRef } from "react";

import {
  drawNebulaWisps,
  drawStars,
  type DustParticle,
  makeDustParticle,
  makeStars,
  updateAndDrawDust,
} from "@/utils/starfieldLogic";

const BACKGROUND_COLOR = "#050310";

export const StarfieldBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    let elapsed = 0;
    let lastTime = performance.now();

    const stars = makeStars();
    let dust: DustParticle[] = [];

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Screen-space trail anchors are stale after a resize; re-anchor next frame.
      for (const star of stars) {
        star.prev = null;
      }

      if (dust.length === 0) {
        dust = Array.from({ length: 60 }, () =>
          makeDustParticle(Math.random() * width, Math.random() * height),
        );
      }
    };

    resize();
    window.addEventListener("resize", resize);

    const drawFrame = (deltaMs: number) => {
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);

      const hue1 = 260 + Math.sin(elapsed * 0.00018) * 20;
      const hue2 = 220 + Math.cos(elapsed * 0.00012) * 20;

      const grad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.4,
        0,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.85,
      );
      grad.addColorStop(0, `hsl(${hue1}, 55%, 14%)`);
      grad.addColorStop(0.5, `hsl(${(hue1 + hue2) / 2}, 60%, 8%)`);
      grad.addColorStop(1, `hsl(${hue2}, 70%, 4%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      drawStars(ctx, stars, width, height, deltaMs);
      updateAndDrawDust(ctx, dust, width, height, deltaMs);
      drawNebulaWisps(ctx, width, height, elapsed, hue1);
    };

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const loop = (now: number) => {
      // Clamp so a backgrounded tab doesn't teleport the simulation on resume.
      const deltaMs = Math.min(now - lastTime, 50);
      lastTime = now;
      elapsed += deltaMs;

      drawFrame(deltaMs);
      animId = requestAnimationFrame(loop);
    };

    const start = () => {
      if (reducedMotion.matches) {
        drawFrame(0);
        return;
      }
      lastTime = performance.now();
      animId = requestAnimationFrame(loop);
    };

    const handleMotionPreferenceChange = () => {
      cancelAnimationFrame(animId);
      start();
    };

    start();
    reducedMotion.addEventListener("change", handleMotionPreferenceChange);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      reducedMotion.removeEventListener("change", handleMotionPreferenceChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 -z-10 block"
      style={{ backgroundColor: BACKGROUND_COLOR }}
    />
  );
};
