import { describe, expect, test } from "vitest";

import { gemShader } from "./shaders";

describe("gem shader optics", () => {
  test("samples the background for reflection and refraction", () => {
    expect(gemShader).toContain("texture_2d<f32>");
    expect(gemShader).toContain("refract(");
    expect(gemShader).toContain("reflect(");
    expect(gemShader.match(/textureSample\(/g)).toHaveLength(2);
  });

  test("keeps the optical surface translucent", () => {
    expect(gemShader).toContain("const GEM_SURFACE_ALPHA: f32 = 0.9;");
    expect(gemShader).toContain("vec4f(color, GEM_SURFACE_ALPHA)");
  });
});
