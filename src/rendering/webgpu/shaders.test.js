import { describe, expect, test } from "vitest";

import { WAVE_SIMULATION_CONFIG } from "@/config/waves";

import {
  backgroundShader,
  fragmentShader,
  gemShader,
  waveSimulationShader,
} from "./shaders";

describe("background shader", () => {
  test("refracts the sand through the simulated water surface", () => {
    expect(backgroundShader).toContain("var sandTexture: texture_2d<f32>;");
    expect(backgroundShader).toContain("var waveTexture: texture_2d<f32>;");
    expect(backgroundShader).toContain(
      "fn sampleWaterSurface(uv: vec2f) -> WaterSurface",
    );
    expect(backgroundShader).toContain("const WATER_IOR: f32 = 1.333;");
    expect(backgroundShader).toContain("const SAND_FEATURE_SCALE: f32 = 2.0;");
    expect(backgroundShader).toContain(
      "const CAUSTIC_FEATURE_SCALE: f32 = 0.75;",
    );
    expect(backgroundShader).toContain(
      "let energy = abs(state.y) + length(state.zw) * 0.5;",
    );
    expect(backgroundShader).toContain("normalize(vec3f(-gradient, 1.0))");
    expect(backgroundShader).toContain("AIR_IOR / WATER_IOR");
    expect(backgroundShader).toContain("let refractionDirection = refract(");
    expect(backgroundShader).toContain(
      "refractionDirection.xy * opticalPathLength * 0.85",
    );
    expect(backgroundShader).toContain(
      "(uv - vec2f(0.5)) / SAND_FEATURE_SCALE + refractionOffset",
    );
    expect(backgroundShader).toContain("sandSampler,\n    sandUv");
  });

  test("highlights simulated displacement and wave energy", () => {
    expect(backgroundShader).toContain(
      "smoothstep(0.00025, 0.012, waterSurface.energy)",
    );
    expect(backgroundShader).toContain(
      "let displacedWater = smoothstep(0.00075, 0.012, abs(waterSurface.height));",
    );
    expect(backgroundShader).toContain(
      "(wavefront * 0.34 + displacedWater * 0.16) *",
    );
    expect(backgroundShader.match(/textureLoad\(/g)).toHaveLength(4);
  });

  test("uses dielectric Fresnel, reflection, and Beer-Lambert absorption", () => {
    expect(backgroundShader).toContain(
      "const WATER_ABSORPTION: vec3f = vec3f(6.0, 3.4, 1.2);",
    );
    expect(backgroundShader).toContain(
      "const WATER_SCATTERING: vec3f = vec3f(0.03, 0.18, 0.68);",
    );
    expect(backgroundShader).toContain(
      "const WATER_AMBIENT_RADIANCE: vec3f = vec3f(0.02, 0.16, 0.82);",
    );
    expect(backgroundShader).toContain(
      "const WATER_LIGHT_COLOR: vec3f = vec3f(0.72, 0.9, 1.0);",
    );
    expect(backgroundShader).toContain("const MEAN_WATER_DEPTH: f32 = 0.25;");
    expect(backgroundShader).toContain(
      "const WATER_RAY_INTENSITY: f32 = 0.045;",
    );
    expect(backgroundShader).toContain("fn fresnelDielectric(");
    expect(backgroundShader).toContain(
      "let reflectionDirection = reflect(incidentDirection, surfaceNormal);",
    );
    expect(backgroundShader).toContain(
      "let extinction = WATER_ABSORPTION + WATER_SCATTERING;",
    );
    expect(backgroundShader).toContain(
      "let transmittance = exp(-extinction * opticalPathLength);",
    );
    expect(backgroundShader).toContain(
      "MEAN_WATER_DEPTH + waterSurface.height * WAVE_HEIGHT_DEPTH_SCALE",
    );
    expect(backgroundShader).toContain(
      "let singleScatteringAlbedo = WATER_SCATTERING / extinction;",
    );
    expect(backgroundShader).toContain(
      "WATER_AMBIENT_RADIANCE *\n    singleScatteringAlbedo",
    );
    expect(backgroundShader).toContain(
      "WATER_LIGHT_COLOR * (rays + light) * transmittance",
    );
    expect(backgroundShader).toContain(
      "var color = mix(transmission, reflection, fresnel);",
    );
    expect(backgroundShader).toContain(
      "return sky + vec3f(7.0, 6.4, 5.2) * sun;",
    );
    expect(backgroundShader).toContain(
      "(refractedUv - vec2f(0.5)) / CAUSTIC_FEATURE_SCALE",
    );
    expect(backgroundShader).toContain(
      "let light = caustic(causticUv, time * 1.8)",
    );
    expect(backgroundShader).toContain("const BUBBLE_COUNT: i32 = 0;");
  });
});

describe("wave simulation shader", () => {
  test("advances a damped finite-difference wave field", () => {
    expect(waveSimulationShader).toContain("@compute @workgroup_size(8, 8)");
    expect(waveSimulationShader).toContain("let laplacian =");
    expect(waveSimulationShader).toContain("laplacian * WAVE_SPEED");
    expect(waveSimulationShader).toContain("const WAVE_SPEED: f32 = 0.28;");
    expect(waveSimulationShader).toContain(
      "state.y * pow(VELOCITY_DAMPING, deltaFrames)",
    );
    expect(waveSimulationShader).toContain(
      "const VELOCITY_DAMPING: f32 = 0.996;",
    );
    expect(waveSimulationShader).toContain(
      "const EDGE_DAMPING_MINIMUM: f32 = 0.97;",
    );
    expect(waveSimulationShader).toContain(
      "const HEIGHT_RESTORING_FORCE: f32 = 0.0001;",
    );
    expect(waveSimulationShader).toContain("height * HEIGHT_RESTORING_FORCE");
    expect(waveSimulationShader).toContain(
      "vec4f(nextHeight, nextVelocity, surfaceGradient)",
    );
    expect(waveSimulationShader).toContain(
      "let surfaceGradient = vec2f(right - left, top - bottom);",
    );
  });

  test("injects zero-sum clear ripples and absorbs wave energy at the edges", () => {
    expect(waveSimulationShader).toContain(
      "@group(0) @binding(3) var<storage, read> impulses: array<vec4f>;",
    );
    expect(waveSimulationShader).toContain(
      "impulseVelocity += impulse.z * zeroSumWavelet;",
    );
    expect(waveSimulationShader).toContain(
      "if (distanceSquared >= IMPULSE_SUPPORT_SQUARED) { return 0.0; }",
    );
    expect(waveSimulationShader).toContain(
      "let distanceSquared = dot(normalizedOffset, normalizedOffset);",
    );
    expect(waveSimulationShader).toContain("4.0 * centerProfile -");
    expect(waveSimulationShader.match(/clampedImpulseProfile\(/g)).toHaveLength(
      5,
    );
    expect(waveSimulationShader).toContain(
      "smoothstep(0.0, 0.08, edgeDistance)",
    );
  });

  test("keeps the discrete clear impulse sum at zero", () => {
    const resolution = 64;
    const texelSize = 1 / resolution;
    const radius = 0.036;
    const impulseCenters = [
      [0.5, 0.5],
      [0.02, 0.48],
      [0.99, 0.01],
    ];
    const profile = (column, row, [centerX, centerY]) => {
      const sampleX =
        (Math.min(resolution - 1, Math.max(0, column)) + 0.5) * texelSize;
      const sampleY =
        (Math.min(resolution - 1, Math.max(0, row)) + 0.5) * texelSize;
      const normalizedX = (sampleX - centerX) / radius;
      const normalizedY = (sampleY - centerY) / radius;
      const distanceSquared = normalizedX ** 2 + normalizedY ** 2;
      return distanceSquared >= 4 ? 0 : Math.exp(-distanceSquared * 2.4);
    };

    for (const impulseCenter of impulseCenters) {
      let impulseSum = 0;
      for (let row = 0; row < resolution; row += 1) {
        for (let column = 0; column < resolution; column += 1) {
          impulseSum +=
            4 * profile(column, row, impulseCenter) -
            profile(column - 1, row, impulseCenter) -
            profile(column + 1, row, impulseCenter) -
            profile(column, row - 1, impulseCenter) -
            profile(column, row + 1, impulseCenter);
        }
      }
      expect(impulseSum).toBeCloseTo(0, 12);
    }
  });

  test("restores a displaced mean surface height toward zero", () => {
    const resolution = WAVE_SIMULATION_CONFIG.resolution;
    const cellCount = resolution * resolution;
    let heights = new Float32Array(cellCount).fill(0.12);
    let velocities = new Float32Array(cellCount);

    for (let frame = 0; frame < 1_800; frame += 1) {
      const nextHeights = new Float32Array(cellCount);
      const nextVelocities = new Float32Array(cellCount);
      for (let row = 0; row < resolution; row += 1) {
        for (let column = 0; column < resolution; column += 1) {
          const index = row * resolution + column;
          const sampleHeight = (sampleColumn, sampleRow) => {
            const clampedColumn = Math.min(
              resolution - 1,
              Math.max(0, sampleColumn),
            );
            const clampedRow = Math.min(resolution - 1, Math.max(0, sampleRow));
            return heights[clampedRow * resolution + clampedColumn] ?? 0;
          };
          const height = heights[index] ?? 0;
          const laplacian =
            sampleHeight(column - 1, row) +
            sampleHeight(column + 1, row) +
            sampleHeight(column, row - 1) +
            sampleHeight(column, row + 1) -
            4 * height;
          const normalizedX = (column + 0.5) / resolution;
          const normalizedY = (row + 0.5) / resolution;
          const edgeDistance = Math.min(
            normalizedX,
            1 - normalizedX,
            normalizedY,
            1 - normalizedY,
          );
          const edgeProgress = Math.min(1, Math.max(0, edgeDistance / 0.08));
          const smoothEdgeProgress =
            edgeProgress * edgeProgress * (3 - 2 * edgeProgress);
          const edgeDamping =
            WAVE_SIMULATION_CONFIG.edgeDampingMinimum +
            (1 - WAVE_SIMULATION_CONFIG.edgeDampingMinimum) *
              smoothEdgeProgress;
          const nextVelocity =
            ((velocities[index] ?? 0) *
              WAVE_SIMULATION_CONFIG.velocityDampingPerFrame +
              (laplacian * WAVE_SIMULATION_CONFIG.gridCoupling -
                height * WAVE_SIMULATION_CONFIG.heightRestoringForcePerFrame)) *
            edgeDamping;
          nextVelocities[index] = nextVelocity;
          nextHeights[index] = Math.min(
            0.16,
            Math.max(-0.16, height + nextVelocity),
          );
        }
      }
      heights = nextHeights;
      velocities = nextVelocities;
    }

    const restoredMean =
      heights.reduce((sum, height) => sum + height, 0) / cellCount;
    expect(Math.abs(restoredMean)).toBeLessThan(0.01);
  });
});

describe("gem shader optics", () => {
  test("samples the background for reflection and refraction", () => {
    expect(gemShader).toContain("texture_2d<f32>");
    expect(gemShader).toContain("refract(");
    expect(gemShader).toContain("reflect(");
    expect(gemShader.match(/textureSample\(/g)).toHaveLength(2);
  });

  test("varies transmission alpha by optical depth", () => {
    expect(gemShader).toContain("const SHALLOW_GEM_ALPHA: f32 = 0.9;");
    expect(gemShader).toContain("const DEEP_GEM_ALPHA: f32 = 1;");
    expect(gemShader).toContain("fn gemOpticalDepth(");
    expect(gemShader).toContain("vec4f(blendSourceColor, surfaceAlpha)");
    expect(gemShader).toContain("fn refractedViewDirection(");
    expect(gemShader).toContain(
      "thickness / max(\n      abs(refractionDirection.z),",
    );
  });

  test("strengthens body color while reducing background transmission", () => {
    expect(gemShader).toContain(
      "const SHALLOW_BACKGROUND_TRANSMISSION: f32 = 0.34;",
    );
    expect(gemShader).toContain(
      "const DEEP_BACKGROUND_TRANSMISSION: f32 = 0.04;",
    );
    expect(gemShader).toContain(
      "refractedBackground * transmissionTint * backgroundTransmission",
    );
    expect(gemShader).toContain("const SHALLOW_GEM_BODY_LIGHT: f32 = 0.62;");
    expect(gemShader).toContain("const DEEP_GEM_BODY_LIGHT: f32 = 0.78;");
    expect(gemShader).toContain("const TRANSMISSION_GEM_TINT: f32 = 0.88;");
  });

  test("keeps specular and ridge highlights outside surface alpha", () => {
    expect(gemShader).toContain(
      "baseColor * surfaceAlpha + unattenuatedHighlight;",
    );
  });

  test("uses fixed corner cuts for chamfered square faces", () => {
    expect(gemShader).toContain("const OUTER_CORNER_CUT: f32 = 0.18;");
    expect(gemShader).toContain("const TABLE_CORNER_CUT: f32 = 0.28;");
    expect(gemShader).toContain("fn chamferedSquare(");
    expect(gemShader).toContain("fn chamferBoundary(");
    expect(gemShader).toContain(
      "max(chamferAxis(p), chamferCorner(p, cornerCut))",
    );
    expect(gemShader).toContain("fn surfaceCornerCut(");
    expect(gemShader).toContain("chamferBoundary(p, surfaceCornerCut(p))");
  });

  test("keeps the chamfer boundary continuous at the girdle", () => {
    const tableCornerCut = 0.28;
    const outerCornerCut = 0.18;
    const tableRadius = 0.68;
    const girdleStart = 0.9;
    const smoothstep = (start, end, value) => {
      const progress = Math.min(
        1,
        Math.max(0, (value - start) / (end - start)),
      );
      return progress * progress * (3 - 2 * progress);
    };
    const surfaceCornerCut = (silhouette) =>
      tableCornerCut +
      (outerCornerCut - tableCornerCut) *
        smoothstep(tableRadius, girdleStart, silhouette);

    expect(surfaceCornerCut(tableRadius)).toBe(tableCornerCut);
    expect(surfaceCornerCut(girdleStart)).toBe(outerCornerCut);
    expect(
      Math.abs(
        surfaceCornerCut(girdleStart - 0.001) -
          surfaceCornerCut(girdleStart + 0.001),
      ),
    ).toBeLessThan(0.0001);
    expect(gemShader).toContain(
      "smoothstep(TABLE_RADIUS, GIRDLE_START, gemSilhouette(p))",
    );
  });
});

describe("fragment shader", () => {
  test("renders only drifting gem-colored fragments", () => {
    expect(fragmentShader).toContain(
      "let fragmentColor = color * FRAGMENT_COLOR_INTENSITY;",
    );
    expect(fragmentShader).not.toContain("twinkle");
    expect(fragmentShader).not.toContain("flutter");
    expect(fragmentShader).not.toContain("pulse");
    expect(fragmentShader).not.toContain("instance.seed");
    expect(fragmentShader).not.toContain("FRAGMENT_EFFECT_");
    expect(fragmentShader).not.toContain("effectKind");
    expect(fragmentShader).not.toContain("sparkle");
    expect(fragmentShader).not.toContain("shardColor");
    expect(fragmentShader).not.toContain("FRAGMENT_EFFECT_SHOCKWAVE");
    expect(fragmentShader).not.toContain("ringDistance");
    expect(fragmentShader).not.toContain("ringColor");
    expect(fragmentShader).not.toContain("let spectralEdge = mix(");
    expect(fragmentShader).not.toContain(
      "let dustColor = mix(color, vec3f(1.0)",
    );
  });

  test("keeps fragment interiors solid with only a narrow edge fade", () => {
    expect(fragmentShader).toContain(
      "const FRAGMENT_EDGE_FADE_START: f32 = 0.88;",
    );
    expect(fragmentShader).toContain("const FRAGMENT_EDGE_RADIUS: f32 = 0.94;");
    expect(fragmentShader).toContain(`let edgeCoverage = 1.0 - smoothstep(
    FRAGMENT_EDGE_FADE_START,
    FRAGMENT_EDGE_RADIUS,
    radius
  );`);
    expect(fragmentShader).toContain("edgeCoverage * fade");
    expect(fragmentShader).not.toContain("let mote =");
    expect(fragmentShader).not.toContain("let core =");
  });

  test("animates drifting dust", () => {
    expect(fragmentShader).toContain("let elapsedSeconds = elapsed / 1000.0");
    expect(fragmentShader).not.toContain("let ticks =");
    expect(fragmentShader).not.toContain("1000.0 / 60.0");
    expect(fragmentShader).toContain("REFERENCE_FRAGMENT_DRAG_RATE");
    expect(fragmentShader).toContain(
      "REFERENCE_FRAGMENT_DRAG_RATE / instance.mass",
    );
    expect(fragmentShader).toContain(
      "instance.velocityX * velocityTravelSeconds",
    );
    expect(fragmentShader).toContain(
      "instance.gravity * gravityTravelSecondsSquared",
    );
    expect(fragmentShader).not.toContain("instance.rotation");
    expect(fragmentShader).not.toContain("instance.rotationSpeed");
    expect(fragmentShader).toContain("if (age >= 1.0)");
  });
});
