import { useEffect, useRef } from "react";

import {
  drawNebulaWisps,
  drawStars,
  type DustParticle,
  makeDustParticle,
  makeStars,
  updateAndDrawDust,
} from "@/utils/starfieldLogic";

const DUST_COUNT = 60;

/**
 * Animated starfield canvas scoped to its offset parent: it fills the
 * nearest positioned ancestor (`absolute inset-0`) and sizes its bitmap
 * to that element via ResizeObserver, so it can back any container —
 * currently the game board panel. The parent must be positioned
 * (`relative`) and should set `isolate` so the `-z-10` canvas paints
 * above the parent's own background instead of escaping behind it.
 */
export const StarfieldBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // `inset-0` spans the offsetParent's padding box, so that element —
    // not the viewport — is the sizing source.
    const host = canvas.offsetParent;
    if (!(host instanceof HTMLElement)) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    let elapsed = 0;
    let lastTime = performance.now();

    const stars = makeStars();
    let dust: DustParticle[] = [];

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const drawFrame = (deltaMs: number) => {
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);

      const hue1 = 260 + Math.sin(elapsed * 0.00036) * 30;
      const hue2 = 220 + Math.cos(elapsed * 0.00024) * 30;

      const grad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.4,
        0,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.85,
      );
      grad.addColorStop(0, `hsl(${hue1}, 70%, 22%)`);
      grad.addColorStop(0.5, `hsl(${(hue1 + hue2) / 2}, 75%, 13%)`);
      grad.addColorStop(1, `hsl(${hue2}, 80%, 7%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      drawStars(ctx, stars, width, height, deltaMs);
      updateAndDrawDust(ctx, dust, width, height, deltaMs);
      drawNebulaWisps(ctx, width, height, elapsed, hue1);
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      // clientWidth/Height = the padding box, which is exactly what the
      // `inset-0` canvas spans (a ResizeObserver entry's contentRect is
      // the content box, which excludes the panel's padding).
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width === 0 || height === 0) return;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Screen-space trail anchors are stale after a resize; re-anchor next frame.
      for (const star of stars) {
        star.prev = null;
      }

      if (dust.length === 0) {
        dust = Array.from({ length: DUST_COUNT }, () =>
          makeDustParticle(Math.random() * width, Math.random() * height),
        );
      }

      // Resizing clears the bitmap; with the loop parked we must repaint
      // the static frame ourselves.
      if (reducedMotion.matches) {
        drawFrame(0);
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

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
      observer.disconnect();
      reducedMotion.removeEventListener("change", handleMotionPreferenceChange);
    };
  }, []);

  // bg-[#050310] is the CSS fallback so a slow first paint (or a failed
  // canvas context) shows deep space instead of a white flash.
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 -z-10 h-full w-full rounded-2xl bg-[#050310]"
    />
  );
};
