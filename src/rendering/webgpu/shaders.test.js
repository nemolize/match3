import { describe, expect, test } from "vitest";

import { backgroundShader, gemShader } from "./shaders";

describe("background shader", () => {
  test("refracts the sand through an animated water surface", () => {
    expect(backgroundShader).toContain("var sandTexture: texture_2d<f32>;");
    expect(backgroundShader).toContain(
      "fn sampleWaterSurface(uv: vec2f, time: f32) -> WaterSurface",
    );
    expect(backgroundShader).toContain("const WATER_IOR: f32 = 1.333;");
    expect(backgroundShader).toContain("const WATER_FEATURE_SCALE: f32 = 2.0;");
    expect(backgroundShader).toContain("const SAND_FEATURE_SCALE: f32 = 2.0;");
    expect(backgroundShader).toContain(
      "const CAUSTIC_FEATURE_SCALE: f32 = 0.75;",
    );
    expect(backgroundShader).toContain("0.38 * WATER_FEATURE_SCALE");
    expect(backgroundShader).toContain("0.012 * WATER_FEATURE_SCALE");
    expect(backgroundShader).toContain("0.055,");
    expect(backgroundShader).toContain("0.0018,");
    expect(backgroundShader).toContain(
      "return WaterSurface(normalize(vec3f(-wave.xy, 1.0)), wave.z);",
    );
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
