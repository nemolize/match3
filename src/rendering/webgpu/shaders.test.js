import { describe, expect, test } from "vitest";

import { gemShader } from "./shaders";

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

  test("reduces background transmission through deeper facets", () => {
    expect(gemShader).toContain(
      "const SHALLOW_BACKGROUND_TRANSMISSION: f32 = 0.46;",
    );
    expect(gemShader).toContain(
      "const DEEP_BACKGROUND_TRANSMISSION: f32 = 0.1;",
    );
    expect(gemShader).toContain(
      "refractedBackground * transmissionTint * backgroundTransmission",
    );
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
