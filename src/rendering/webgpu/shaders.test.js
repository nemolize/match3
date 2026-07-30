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
    expect(gemShader).toContain("const SHALLOW_GEM_ALPHA: f32 = 0.82;");
    expect(gemShader).toContain("const DEEP_GEM_ALPHA: f32 = 0.98;");
    expect(gemShader).toContain("fn gemOpticalDepth(");
    expect(gemShader).toContain("vec4f(blendSourceColor, surfaceAlpha)");
    expect(gemShader).toContain("fn refractedViewDirection(");
    expect(gemShader).toContain(
      "thickness / max(\n      abs(refractionDirection.z),",
    );
  });

  test("reduces background transmission through deeper facets", () => {
    expect(gemShader).toContain(
      "const SHALLOW_BACKGROUND_TRANSMISSION: f32 = 0.58;",
    );
    expect(gemShader).toContain(
      "const DEEP_BACKGROUND_TRANSMISSION: f32 = 0.18;",
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
});
