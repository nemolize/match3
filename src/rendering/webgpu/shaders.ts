import { fragmentInstanceStruct, gemInstanceStruct } from "./instanceLayout";

const frameUniformStruct = /* wgsl */ `
struct Frame {
  canvas: vec2f,
  boardOrigin: vec2f,
  boardSize: f32,
  timeMs: f32,
  waterTimeMs: f32,
  gap: f32,
  cellSize: f32,
  reducedMotion: f32,
  devicePixelRatio: f32,
  padding: f32,
}
`;

const gemColorFunction = /* wgsl */ `
fn gemColor(gemType: i32) -> vec3f {
  switch gemType {
    case 0: { return vec3f(1.0, 0.12, 0.34); }
    case 1: { return vec3f(0.12, 0.84, 1.0); }
    case 2: { return vec3f(0.08, 0.82, 0.34); }
    case 3: { return vec3f(1.0, 0.86, 0.14); }
    case 4: { return vec3f(0.78, 0.3, 1.0); }
    default: { return vec3f(1.0, 0.52, 0.12); }
  }
}
`;

const gemMaterialParameters = {
  ior: 1.47,
  shallowAlpha: 0.82,
  deepAlpha: 0.98,
  opticalDepthStart: 0.18,
  minimumRefractionZ: 0.2,
  shallowBackgroundTransmission: 0.58,
  deepBackgroundTransmission: 0.18,
  shallowBodyLight: 0.38,
  deepBodyLight: 0.56,
} as const;

export const backgroundShader = /* wgsl */ `
${frameUniformStruct}
@group(0) @binding(0) var<uniform> frame: Frame;

@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0)
  );
  return vec4f(positions[index], 0.0, 1.0);
}

fn caustic(uv: vec2f, time: f32) -> f32 {
  let a = sin((uv.x * 20.0) + sin(uv.y * 13.0 + time));
  let b = sin((uv.y * 24.0) + sin(uv.x * 15.0 - time * 0.8));
  return pow(max(0.0, 1.0 - abs(a + b) * 0.62), 5.0);
}

fn hash(seed: f32) -> f32 {
  return fract(sin(seed * 12.9898) * 43758.5453);
}

@fragment fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let uv = position.xy / (frame.canvas * frame.devicePixelRatio);
  let time = select(frame.waterTimeMs * 0.001, 0.0, frame.reducedMotion > 0.5);
  let surface = vec3f(0.08, 0.69, 0.82);
  let depth = vec3f(0.025, 0.16, 0.34);
  var color = mix(surface, depth, smoothstep(0.0, 1.0, uv.y));
  let rays = pow(max(0.0, sin(uv.x * 18.0 + time * 0.35)), 14.0) *
    (1.0 - uv.y) * 0.14;
  let light = caustic(uv, time * 1.8) * 0.28;
  color += vec3f(rays + light, rays + light, (rays + light) * 0.72);
  for (var index = 0; index < 18; index += 1) {
    let seed = f32(index);
    let center = vec2f(
      hash(seed + 1.0),
      1.0 - fract(hash(seed + 2.0) + time * mix(0.025, 0.075, hash(seed + 3.0)))
    );
    let radius = mix(2.0, 5.5, hash(seed + 4.0));
    let distancePx = length((uv - center) * frame.canvas);
    let ring = smoothstep(radius - 2.0, radius - 1.0, distancePx) *
      (1.0 - smoothstep(radius - 1.0, radius, distancePx));
    color += vec3f(0.42, 0.82, 0.92) * ring * 0.32;
  }
  return vec4f(color, 1.0);
}
`;

export const blitShader = /* wgsl */ `
@group(0) @binding(0) var sourceSampler: sampler;
@group(0) @binding(1) var sourceTexture: texture_2d<f32>;

struct Output {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> Output {
  let positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0)
  );
  let position = positions[index];
  var output: Output;
  output.position = vec4f(position, 0.0, 1.0);
  output.uv = vec2f(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
  return output;
}

@fragment fn fragmentMain(input: Output) -> @location(0) vec4f {
  return textureSample(sourceTexture, sourceSampler, input.uv);
}
`;

export const gemShader = /* wgsl */ `
${frameUniformStruct}
@group(0) @binding(0) var<uniform> frame: Frame;

${gemInstanceStruct}

@group(0) @binding(1) var<storage, read> instances: array<GemInstance>;
@group(0) @binding(2) var backgroundSampler: sampler;
@group(0) @binding(3) var backgroundTexture: texture_2d<f32>;

const GEM_IOR: f32 = ${gemMaterialParameters.ior};
const REFRACTION_UV_SCALE: f32 = 0.045;
const REFLECTION_UV_SCALE: f32 = 0.06;
const SHALLOW_GEM_ALPHA: f32 = ${gemMaterialParameters.shallowAlpha};
const DEEP_GEM_ALPHA: f32 = ${gemMaterialParameters.deepAlpha};
const SILHOUETTE_MINOR_WEIGHT: f32 = 0.14;
const TABLE_MINOR_WEIGHT: f32 = 0.22;
const TABLE_RADIUS: f32 = 0.5;
const CORNER_FACET_WIDTH: f32 = 0.16;
const GIRDLE_START: f32 = 0.86;
const FACET_AMBIENT_LIGHT: f32 = 0.74;
const FACET_DIRECTIONAL_LIGHT: f32 = 0.26;
const TRANSMISSION_NEUTRAL_TINT: f32 = 0.68;
const TRANSMISSION_GEM_TINT: f32 = 0.72;
const SHALLOW_BACKGROUND_TRANSMISSION: f32 = ${gemMaterialParameters.shallowBackgroundTransmission};
const DEEP_BACKGROUND_TRANSMISSION: f32 = ${gemMaterialParameters.deepBackgroundTransmission};
const SHALLOW_GEM_BODY_LIGHT: f32 = ${gemMaterialParameters.shallowBodyLight};
const DEEP_GEM_BODY_LIGHT: f32 = ${gemMaterialParameters.deepBodyLight};
const GEM_EDGE_LIGHT: f32 = 0.07;

struct Output {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) gemType: f32,
  @location(2) @interpolate(flat) selected: f32,
  @location(3) screenUv: vec2f,
}

fn ease(progress: f32, mode: f32) -> f32 {
  if (mode < 1.5) { return progress * progress; }
  return 1.0 - pow(1.0 - progress, 3.0);
}

@vertex fn vertexMain(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> Output {
  let corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
  );
  let instance = instances[instanceIndex];
  let rawProgress = select(
    1.0,
    clamp(
      (frame.timeMs - instance.startedAt) / instance.duration,
      0.0,
      1.0
    ),
    instance.duration > 0.0
  );
  let progress = ease(rawProgress, instance.animationMode);
  let cell = mix(
    vec2f(instance.fromCol, instance.fromRow),
    vec2f(instance.toCol, instance.toRow),
    progress
  );
  let step = frame.cellSize + frame.gap;
  let center = frame.boardOrigin + vec2f(cell.x, cell.y) * step + vec2f(frame.cellSize * 0.5);
  let local = corners[vertexIndex];
  let pixel = center + local * frame.cellSize * 0.39;
  var output: Output;
  output.position = vec4f(
    pixel.x / frame.canvas.x * 2.0 - 1.0,
    1.0 - pixel.y / frame.canvas.y * 2.0,
    0.0,
    1.0
  );
  output.local = local;
  output.gemType = instance.gemType;
  output.selected = instance.selected;
  output.screenUv = pixel / frame.canvas;
  return output;
}

${gemColorFunction}

fn refractedViewDirection(surfaceNormal: vec3f) -> vec3f {
  let incidentDirection = vec3f(0.0, 0.0, -1.0);
  return refract(
    incidentDirection,
    surfaceNormal,
    1.0 / GEM_IOR
  );
}

fn sampleRefraction(screenUv: vec2f, direction: vec3f) -> vec3f {
  let refractedUv = clamp(
    screenUv + direction.xy * REFRACTION_UV_SCALE,
    vec2f(0.002),
    vec2f(0.998)
  );
  return textureSample(
    backgroundTexture,
    backgroundSampler,
    refractedUv
  ).rgb;
}

fn fresnelSchlick(cosine: f32, baseReflectance: f32) -> f32 {
  let grazing = 1.0 - cosine;
  let grazingSquared = grazing * grazing;
  return baseReflectance +
    (1.0 - baseReflectance) *
      grazingSquared *
      grazingSquared *
      grazing;
}

fn gemSilhouette(p: vec2f) -> f32 {
  return max(p.x, p.y) + min(p.x, p.y) * SILHOUETTE_MINOR_WEIGHT;
}

fn gemTableShape(p: vec2f) -> f32 {
  return max(p.x, p.y) + min(p.x, p.y) * TABLE_MINOR_WEIGHT;
}

fn gemSurfaceNormal(local: vec2f) -> vec3f {
  let p = abs(local);
  let tableShape = gemTableShape(p);
  let silhouette = gemSilhouette(p);
  var normalXY = vec2f(-0.035, -0.055);

  if (tableShape > TABLE_RADIUS) {
    if (abs(p.x - p.y) < CORNER_FACET_WIDTH) {
      normalXY = vec2f(sign(local.x) * 0.54, sign(local.y) * 0.54);
    } else if (p.x > p.y) {
      normalXY = vec2f(sign(local.x) * 0.68, sign(local.y) * 0.16);
    } else {
      normalXY = vec2f(sign(local.x) * 0.16, sign(local.y) * 0.68);
    }
  }

  if (silhouette > GIRDLE_START) {
    if (p.x > p.y) {
      normalXY = normalize(vec2f(
        sign(local.x),
        sign(local.y) * SILHOUETTE_MINOR_WEIGHT
      )) * 0.78;
    } else {
      normalXY = normalize(vec2f(
        sign(local.x) * SILHOUETTE_MINOR_WEIGHT,
        sign(local.y)
      )) * 0.78;
    }
  }

  return normalize(vec3f(
    normalXY,
    sqrt(max(0.12, 1.0 - dot(normalXY, normalXY)))
  ));
}

fn gemOpticalDepth(local: vec2f, refractionDirection: vec3f) -> f32 {
  let silhouette = gemSilhouette(abs(local));
  let thickness =
    1.0 - smoothstep(${gemMaterialParameters.opticalDepthStart}, 1.0, silhouette);
  return clamp(
    thickness / max(
      abs(refractionDirection.z),
      ${gemMaterialParameters.minimumRefractionZ}
    ),
    0.0,
    1.0
  );
}

@fragment fn fragmentMain(input: Output) -> @location(0) vec4f {
  let p = abs(input.local);
  let silhouette = gemSilhouette(p);
  if (silhouette > 1.0) { discard; }

  let surfaceNormal = gemSurfaceNormal(input.local);
  let viewDirection = vec3f(0.0, 0.0, 1.0);
  let incidentDirection = -viewDirection;
  let refractionDirection = refractedViewDirection(surfaceNormal);
  let refractedBackground = sampleRefraction(
    input.screenUv,
    refractionDirection
  );
  let uvMinimum = vec2f(0.002);
  let uvMaximum = vec2f(0.998);

  let reflectionDirection = reflect(incidentDirection, surfaceNormal);
  let reflectionUv = clamp(
    input.screenUv + reflectionDirection.xy * REFLECTION_UV_SCALE,
    uvMinimum,
    uvMaximum
  );
  let reflectedBackground = textureSample(
    backgroundTexture,
    backgroundSampler,
    reflectionUv
  ).rgb;
  let gem = gemColor(i32(input.gemType));
  let opticalDepth = gemOpticalDepth(input.local, refractionDirection);
  let radial = length(input.local);
  let keyLight = normalize(vec3f(-0.48, -0.58, 1.0));
  let facetLight =
    FACET_AMBIENT_LIGHT +
    FACET_DIRECTIONAL_LIGHT * max(0.0, dot(surfaceNormal, keyLight));
  let transmissionTint = mix(
    vec3f(TRANSMISSION_NEUTRAL_TINT),
    gem,
    TRANSMISSION_GEM_TINT
  );
  let backgroundTransmission = mix(
    SHALLOW_BACKGROUND_TRANSMISSION,
    DEEP_BACKGROUND_TRANSMISSION,
    opticalDepth
  );
  let gemBodyLight = mix(
    SHALLOW_GEM_BODY_LIGHT,
    DEEP_GEM_BODY_LIGHT,
    opticalDepth
  );
  let transmission =
    refractedBackground * transmissionTint * backgroundTransmission +
    gem * facetLight * (gemBodyLight + radial * GEM_EDGE_LIGHT);
  let fresnel = fresnelSchlick(
    clamp(dot(viewDirection, surfaceNormal), 0.0, 1.0),
    0.036
  );
  let reflection = mix(
    reflectedBackground,
    vec3f(0.72, 0.94, 1.0),
    0.28 + max(0.0, -reflectionDirection.y) * 0.28
  );
  let baseColor = mix(
    transmission,
    reflection,
    clamp(fresnel * 1.9, 0.08, 0.72)
  );
  let glossBase = max(0.0, dot(surfaceNormal, keyLight));
  let glossSquared = glossBase * glossBase;
  let glossFourth = glossSquared * glossSquared;
  let glossEighth = glossFourth * glossFourth;
  let gloss = glossEighth * glossEighth * glossEighth * glossFourth;
  var unattenuatedHighlight = vec3f(gloss * 0.7);
  let tableShape = gemTableShape(p);
  let tableRidge =
    1.0 - smoothstep(0.0, 0.035, abs(tableShape - TABLE_RADIUS));
  let crownRidge =
    (1.0 - smoothstep(
      0.0,
      0.035,
      abs(abs(p.x - p.y) - CORNER_FACET_WIDTH)
    )) *
    smoothstep(TABLE_RADIUS - 0.02, TABLE_RADIUS + 0.08, tableShape);
  let girdleRidge =
    1.0 - smoothstep(0.0, 0.025, abs(silhouette - GIRDLE_START));
  unattenuatedHighlight += mix(gem, vec3f(1.0), 0.55) *
    (tableRidge * 0.12 + crownRidge * 0.045 + girdleRidge * 0.05);
  if (input.selected > 0.5 && silhouette > 0.82) {
    return vec4f(1.0);
  }
  let surfaceAlpha = mix(
    SHALLOW_GEM_ALPHA,
    DEEP_GEM_ALPHA,
    opticalDepth
  );
  let blendSourceColor =
    baseColor * surfaceAlpha + unattenuatedHighlight;
  return vec4f(blendSourceColor, surfaceAlpha);
}
`;

export const fragmentShader = /* wgsl */ `
${frameUniformStruct}
@group(0) @binding(0) var<uniform> frame: Frame;

${fragmentInstanceStruct}

@group(0) @binding(1) var<storage, read> instances: array<FragmentInstance>;

struct Output {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) gemType: f32,
  @location(2) @interpolate(flat) alpha: f32,
}

@vertex fn vertexMain(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> Output {
  let corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
  );
  let instance = instances[instanceIndex];
  let elapsed = max(0.0, frame.timeMs - instance.spawnedAt);
  let ticks = elapsed / (1000.0 / 60.0);
  let normalizedCenter = vec2f(
    instance.centerX + instance.velocityX * ticks,
    instance.centerY
      + instance.velocityY * ticks
      + 0.5 * instance.gravity * ticks * ticks
  );
  let center = frame.boardOrigin + normalizedCenter * frame.boardSize;
  let angle = radians(instance.rotation + instance.rotationSpeed * ticks);
  let local = corners[vertexIndex];
  let rotated = vec2f(
    local.x * cos(angle) - local.y * sin(angle),
    local.x * sin(angle) + local.y * cos(angle)
  );
  let pixel = center + rotated * instance.size * frame.boardSize * 0.5;
  var output: Output;
  output.position = vec4f(
    pixel.x / frame.canvas.x * 2.0 - 1.0,
    1.0 - pixel.y / frame.canvas.y * 2.0,
    0.0,
    1.0
  );
  output.local = local;
  output.gemType = instance.gemType;
  output.alpha = max(0.0, 1.0 - elapsed / instance.lifetime);
  return output;
}

${gemColorFunction}

@fragment fn fragmentMain(input: Output) -> @location(0) vec4f {
  return vec4f(gemColor(i32(input.gemType)), input.alpha);
}
`;
