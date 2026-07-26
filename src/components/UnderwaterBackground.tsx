import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  type Bubble,
  causticBufferSize,
  drawGodRays,
  makeBubble,
  renderCaustics,
  updateAndDrawBubbles,
} from "@/utils/underwaterLogic";

const BUBBLE_COUNT = 26;
const BACKGROUND_FRAME_MS = 1000 / 30;
const MAX_BACKGROUND_DPR = 2;

interface UnderwaterBackgroundProps {
  isForegroundBusy?: boolean;
}

/**
 * Animated sunlit-water canvas scoped to its offset parent: it fills the
 * nearest positioned ancestor (`absolute inset-0`) and sizes its bitmap
 * to that element via ResizeObserver, so it can back any container —
 * currently the game board panel. The parent must be positioned
 * (`relative`) and should set `isolate` so the `-z-10` canvas paints
 * above the parent's own background instead of escaping behind it.
 */
export const UnderwaterBackground = ({
  isForegroundBusy = false,
}: UnderwaterBackgroundProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const foregroundBusyRef = useRef(isForegroundBusy);
  const [rendererStatus, setRendererStatus] = useState<
    "initializing" | "ready" | "unavailable"
  >("initializing");

  useLayoutEffect(() => {
    foregroundBusyRef.current = isForegroundBusy;
  }, [isForegroundBusy]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // `inset-0` spans the offsetParent's padding box, so that element —
    // not the viewport — is the sizing source.
    const host = canvas.offsetParent;
    if (!(host instanceof HTMLElement)) {
      setRendererStatus("unavailable");
      return;
    }

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      setRendererStatus("unavailable");
      return;
    }

    let animId = 0;
    let elapsed = 0;
    let lastTime = performance.now();
    let drawAccumulator = 0;
    let canvasWidth = 0;
    let canvasHeight = 0;

    let bubbles: Bubble[] = [];

    // The caustics are rendered per-pixel into this small buffer and
    // blitted upscaled — see renderCaustics for why.
    const causticCanvas = document.createElement("canvas");
    const causticCtx = causticCanvas.getContext("2d");
    let causticImage: ImageData | null = null;
    // The buffer is only re-rendered every other background frame (water
    // shimmer reads fine at 15Hz); the blit below still happens every draw.
    let causticParity = false;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const drawFrame = (deltaMs: number, refreshCaustics = true) => {
      const width = canvasWidth;
      const height = canvasHeight;
      if (width === 0 || height === 0) return;

      // Bright near the surface, deepening downward; a slow hue breath
      // keeps the water feeling alive without strobing.
      const breathe = Math.sin(elapsed * 0.0003) * 4;
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, `hsl(${186 + breathe}, 85%, 58%)`);
      grad.addColorStop(0.55, `hsl(${196 + breathe}, 85%, 38%)`);
      grad.addColorStop(1, `hsl(${208 + breathe}, 80%, 22%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      drawGodRays(ctx, width, height, elapsed);
      if (causticCtx && causticImage) {
        if (refreshCaustics) {
          causticParity = !causticParity;
          // deltaMs === 0 is the reduced-motion / just-resized static
          // frame — always render that one.
          if (causticParity || deltaMs === 0) {
            renderCaustics(
              causticImage.data,
              causticImage.width,
              causticImage.height,
              elapsed,
            );
            causticCtx.putImageData(causticImage, 0, 0);
          }
        }
        ctx.drawImage(causticCanvas, 0, 0, width, height);
      }
      updateAndDrawBubbles(ctx, bubbles, width, height, deltaMs);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_BACKGROUND_DPR);
      // clientWidth/Height = the padding box, which is exactly what the
      // `inset-0` canvas spans (a ResizeObserver entry's contentRect is
      // the content box, which excludes the panel's padding).
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width === 0 || height === 0) return;

      canvasWidth = width;
      canvasHeight = height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (bubbles.length === 0) {
        bubbles = Array.from({ length: BUBBLE_COUNT }, () =>
          makeBubble(width, height, true),
        );
      }

      if (causticCtx) {
        const buf = causticBufferSize(width, height);
        causticCanvas.width = buf.w;
        causticCanvas.height = buf.h;
        causticImage = causticCtx.createImageData(buf.w, buf.h);
      }

      // Assigning bitmap dimensions clears the opaque canvas to black.
      drawFrame(0, !foregroundBusyRef.current);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const loop = (now: number) => {
      // Clamp so a backgrounded tab doesn't teleport the simulation on resume.
      const deltaMs = Math.min(now - lastTime, 50);
      lastTime = now;
      elapsed += deltaMs;
      drawAccumulator += deltaMs;

      if (drawAccumulator >= BACKGROUND_FRAME_MS) {
        const drawDeltaMs = drawAccumulator;
        drawAccumulator = 0;
        drawFrame(drawDeltaMs, !foregroundBusyRef.current);
      }
      animId = requestAnimationFrame(loop);
    };

    const start = () => {
      if (reducedMotion.matches) {
        drawFrame(0);
        return;
      }
      lastTime = performance.now();
      drawAccumulator = 0;
      animId = requestAnimationFrame(loop);
    };

    const handleMotionPreferenceChange = () => {
      cancelAnimationFrame(animId);
      start();
    };

    start();
    setRendererStatus("ready");
    reducedMotion.addEventListener("change", handleMotionPreferenceChange);

    return () => {
      cancelAnimationFrame(animId);
      observer.disconnect();
      reducedMotion.removeEventListener("change", handleMotionPreferenceChange);
    };
  }, []);

  // bg-[#1494bf] is the CSS fallback (the gradient's mid tone) so a slow
  // first paint (or a failed canvas context) shows water instead of a
  // white flash.
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 -z-10 h-full w-full rounded-2xl bg-[#1494bf]"
      data-renderer="canvas2d"
      data-renderer-status={rendererStatus}
    />
  );
};
