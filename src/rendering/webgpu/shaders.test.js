import { describe, expect, test } from "vitest";

import { backgroundShader, gemShader } from "./shaders";

describe("background shader", () => {
  test("refracts the sand through an animated water surface", () => {
    expect(backgroundShader).toContain("var sandTexture: texture_2d<f32>;");
    expect(backgroundShader).toContain(
      "fn waterSurfaceNormal(uv: vec2f, time: f32) -> vec3f",
    );
    expect(backgroundShader).toContain("const WATER_IOR: f32 = 1.333;");
    expect(backgroundShader).toContain("AIR_IOR / WATER_IOR");
    expect(backgroundShader).toContain("let refractionDirection = refract(");
    expect(backgroundShader).toContain(
      "uv + refractionDirection.xy * opticalPathLength * 0.65",
    );
    expect(backgroundShader).toContain("sandSampler,\n    refractedUv");
  });

  test("uses dielectric Fresnel, reflection, and Beer-Lambert absorption", () => {
    expect(backgroundShader).toContain("fn fresnelDielectric(");
    expect(backgroundShader).toContain(
      "let reflectionDirection = reflect(incidentDirection, surfaceNormal);",
    );
    expect(backgroundShader).toContain(
      "let transmittance = exp(-WATER_ABSORPTION * opticalPathLength);",
    );
    expect(backgroundShader).toContain(
      "var color = mix(transmission, reflection, fresnel);",
    );
    expect(backgroundShader).toContain(
      "return sky + vec3f(7.0, 6.4, 5.2) * sun;",
    );
    expect(backgroundShader).toContain(
      "let light = caustic(refractedUv, time * 1.8)",
    );
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
