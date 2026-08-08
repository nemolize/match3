import { WAVE_SIMULATION_CONFIG } from "@/config/waves";
import { REFERENCE_FRAGMENT_DRAG_RATE_PER_SECOND } from "@/constants/physics";

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
  shallowAlpha: 0.9,
  deepAlpha: 1,
  opticalDepthStart: 0.18,
  minimumRefractionZ: 0.2,
  shallowBackgroundTransmission: 0.34,
  deepBackgroundTransmission: 0.04,
  shallowBodyLight: 0.62,
  deepBodyLight: 0.78,
} as const;

const waterCausticPreamble = /* wgsl */ `
const AIR_IOR: f32 = 1.000293;
const WATER_IOR: f32 = 1.333;
const WAVE_HEIGHT_DEPTH_SCALE: f32 = 1.35;
const WAVE_NORMAL_STRENGTH: f32 = 34.0;
const MEAN_WATER_DEPTH: f32 = 0.25;

struct WaterSurface {
  normal: vec3f,
  height: f32,
  energy: f32,
}
`;

const waterSurfaceFunctions = /* wgsl */ `
fn sunlightDirection() -> vec3f {
  return normalize(vec3f(-0.25, -0.3, 0.92));
}

fn waveStateAtUv(uv: vec2f) -> vec4f {
  return textureSampleLevel(
    waveTexture,
    surfaceSampler,
    clamp(uv, vec2f(0.002), vec2f(0.998)),
    0.0
  );
}

fn sampleWaterSurface(uv: vec2f) -> WaterSurface {
  let state = waveStateAtUv(uv);
  let gradient = state.zw * WAVE_NORMAL_STRENGTH;
  let energy = abs(state.y) + length(state.zw) * 0.5;
  return WaterSurface(
    normalize(vec3f(-gradient, 1.0)),
    state.x,
    energy
  );
}
`;

const waveCausticFunctions = /* wgsl */ `
fn projectSunlightToFloor(uv: vec2f, waterSurface: WaterSurface) -> vec2f {
  let refractedLightDirection = refract(
    -sunlightDirection(),
    waterSurface.normal,
    AIR_IOR / WATER_IOR
  );
  let waterDepth = max(
    0.025,
    MEAN_WATER_DEPTH + waterSurface.height * WAVE_HEIGHT_DEPTH_SCALE
  );
  let lightPathLength =
    waterDepth / max(0.2, abs(refractedLightDirection.z));
  return uv + refractedLightDirection.xy * lightPathLength * 0.85;
}

fn traceSunlightSource(floorUv: vec2f) -> vec2f {
  let flatSurface = WaterSurface(vec3f(0.0, 0.0, 1.0), 0.0, 0.0);
  let flatProjectedUv = projectSunlightToFloor(floorUv, flatSurface);
  var sourceUv = floorUv - (flatProjectedUv - floorUv);
  for (var iteration = 0; iteration < 1; iteration += 1) {
    let sourceSurface = sampleWaterSurface(sourceUv);
    let projectedUv = projectSunlightToFloor(sourceUv, sourceSurface);
    sourceUv = clamp(
      sourceUv + (floorUv - projectedUv),
      vec2f(0.002),
      vec2f(0.998)
    );
  }
  return sourceUv;
}

fn waveCaustic(
  floorUv: vec2f,
  sourceUv: vec2f,
  projectedUv: vec2f,
  surfaceEnergy: f32
) -> f32 {
  let sourceArea = abs(determinant(mat2x2f(dpdx(sourceUv), dpdy(sourceUv))));
  let projectedArea = abs(
    determinant(mat2x2f(dpdx(projectedUv), dpdy(projectedUv)))
  );
  let concentration =
    sourceArea / max(projectedArea, max(sourceArea * 0.2, 0.000000000001));
  let focusedLight = smoothstep(1.05, 3.25, concentration);
  let wavePresence = smoothstep(0.00002, 0.0015, surfaceEnergy);
  let projectionError = length(projectedUv - floorUv);
  let hitConfidence = 1.0 - smoothstep(0.001, 0.02, projectionError);
  let causticLight = focusedLight * wavePresence * hitConfidence;
  return select(0.0, causticLight, surfaceEnergy > 0.00002);
}
`;

export const backgroundShader = /* wgsl */ `
${frameUniformStruct}
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var surfaceSampler: sampler;
@group(0) @binding(2) var sandTexture: texture_2d<f32>;
@group(0) @binding(3) var waveTexture: texture_2d<f32>;
@group(0) @binding(4) var causticTexture: texture_2d<f32>;

${waterCausticPreamble}

const SAND_FEATURE_SCALE: f32 = 2.0;
const LIGHT_RAY_FEATURE_SCALE: f32 = 2.0;
const WATER_RAY_INTENSITY: f32 = 0.045;
const WATER_CAUSTIC_INTENSITY: f32 = 0.28;
const WATER_ABSORPTION: vec3f = vec3f(6.0, 3.4, 1.2);
const WATER_SCATTERING: vec3f = vec3f(0.03, 0.18, 0.68);
const WATER_AMBIENT_RADIANCE: vec3f = vec3f(0.02, 0.16, 0.82);
const WATER_LIGHT_COLOR: vec3f = vec3f(0.72, 0.9, 1.0);
const BUBBLE_COUNT: i32 = 0;

@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0)
  );
  return vec4f(positions[index], 0.0, 1.0);
}

fn hash(seed: f32) -> f32 {
  return fract(sin(seed * 12.9898) * 43758.5453);
}

${waterSurfaceFunctions}

fn fresnelDielectric(cosineIncident: f32, incidentIor: f32, transmittedIor: f32) -> f32 {
  let clampedCosine = clamp(cosineIncident, 0.0, 1.0);
  let eta = incidentIor / transmittedIor;
  let sineTransmittedSquared =
    eta * eta * max(0.0, 1.0 - clampedCosine * clampedCosine);
  if (sineTransmittedSquared >= 1.0) {
    return 1.0;
  }
  let cosineTransmitted = sqrt(1.0 - sineTransmittedSquared);
  let parallel =
    (transmittedIor * clampedCosine - incidentIor * cosineTransmitted) /
    (transmittedIor * clampedCosine + incidentIor * cosineTransmitted);
  let perpendicular =
    (incidentIor * clampedCosine - transmittedIor * cosineTransmitted) /
    (incidentIor * clampedCosine + transmittedIor * cosineTransmitted);
  return 0.5 * (parallel * parallel + perpendicular * perpendicular);
}

fn sampleSky(direction: vec3f) -> vec3f {
  let upness = clamp(direction.z, 0.0, 1.0);
  let horizon = vec3f(0.58, 0.8, 0.88);
  let zenith = vec3f(0.1, 0.38, 0.68);
  let sky = mix(horizon, zenith, smoothstep(0.0, 1.0, upness));
  let sun = pow(max(0.0, dot(direction, sunlightDirection())), 32.0);
  return sky + vec3f(7.0, 6.4, 5.2) * sun;
}

@fragment fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let uv = position.xy / (frame.canvas * frame.devicePixelRatio);
  let time = select(frame.waterTimeMs * 0.001, 0.0, frame.reducedMotion > 0.5);
  let waterSurface = sampleWaterSurface(uv);
  let surfaceNormal = waterSurface.normal;
  let viewDirection = vec3f(0.0, 0.0, 1.0);
  let incidentDirection = -viewDirection;
  let refractionDirection = refract(
    incidentDirection,
    surfaceNormal,
    AIR_IOR / WATER_IOR
  );
  let waterDepth = max(
    0.025,
    MEAN_WATER_DEPTH + waterSurface.height * WAVE_HEIGHT_DEPTH_SCALE
  );
  let opticalPathLength =
    waterDepth / max(0.2, abs(refractionDirection.z));
  let refractionOffset = refractionDirection.xy * opticalPathLength * 0.85;
  let floorUv = clamp(
    uv + refractionOffset,
    vec2f(0.002),
    vec2f(0.998)
  );
  let sandUv = clamp(
    vec2f(0.5) + (uv - vec2f(0.5)) / SAND_FEATURE_SCALE + refractionOffset,
    vec2f(0.002),
    vec2f(0.998)
  );
  let sampledSand = textureSample(
    sandTexture,
    surfaceSampler,
    sandUv
  ).rgb;
  let sand = sampledSand * vec3f(0.82, 0.82, 0.78);
  let extinction = WATER_ABSORPTION + WATER_SCATTERING;
  let transmittance = exp(-extinction * opticalPathLength);
  let singleScatteringAlbedo = WATER_SCATTERING / extinction;
  let inscattering =
    WATER_AMBIENT_RADIANCE *
    singleScatteringAlbedo *
    (vec3f(1.0) - transmittance);
  var transmission = sand * transmittance + inscattering;
  let rays = pow(
    max(0.0, sin(uv.x * (18.0 / LIGHT_RAY_FEATURE_SCALE) + time * 0.35)),
    14.0
  ) * WATER_RAY_INTENSITY;
  let light = textureSampleLevel(
    causticTexture,
    surfaceSampler,
    floorUv,
    0.0
  ).r * WATER_CAUSTIC_INTENSITY;
  transmission +=
    WATER_LIGHT_COLOR * (rays + light) * transmittance;

  let reflectionDirection = reflect(incidentDirection, surfaceNormal);
  let reflection = sampleSky(reflectionDirection);
  let fresnel = fresnelDielectric(
    dot(viewDirection, surfaceNormal),
    AIR_IOR,
    WATER_IOR
  );
  var color = mix(transmission, reflection, fresnel);
  let wavefront = smoothstep(0.00025, 0.012, waterSurface.energy);
  let displacedWater = smoothstep(0.00075, 0.012, abs(waterSurface.height));
  color += WATER_LIGHT_COLOR *
    (wavefront * 0.34 + displacedWater * 0.16) *
    transmittance;
  for (var index = 0; index < BUBBLE_COUNT; index += 1) {
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

export const waveCausticShader = /* wgsl */ `
@group(0) @binding(0) var waveTexture: texture_2d<f32>;
@group(0) @binding(1) var surfaceSampler: sampler;

${waterCausticPreamble}
${waterSurfaceFunctions}
${waveCausticFunctions}

struct CausticVertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> CausticVertexOutput {
  let position = array<vec2f, 3>(
    vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0)
  )[index];
  return CausticVertexOutput(
    vec4f(position, 0.0, 1.0),
    position * vec2f(0.5, -0.5) + vec2f(0.5)
  );
}

@fragment fn fragmentMain(input: CausticVertexOutput) -> @location(0) vec4f {
  let sourceUv = traceSunlightSource(input.uv);
  let surface = sampleWaterSurface(sourceUv);
  let projectedUv = projectSunlightToFloor(sourceUv, surface);
  let intensity = waveCaustic(input.uv, sourceUv, projectedUv, surface.energy);
  return vec4f(vec3f(intensity), 1.0);
}
`;

export const waveSimulationShader = /* wgsl */ `
struct WaveStep {
  timeSeconds: f32,
  deltaFrames: f32,
  impulseCount: f32,
  padding: f32,
}

@group(0) @binding(0) var inputWave: texture_2d<f32>;
@group(0) @binding(1) var outputWave: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> step: WaveStep;
@group(0) @binding(3) var<storage, read> impulses: array<vec4f>;

const TAU: f32 = 6.28318530718;
const MAX_IMPULSES: u32 = ${WAVE_SIMULATION_CONFIG.maximumImpulses}u;
const WAVE_SPEED: f32 = ${WAVE_SIMULATION_CONFIG.gridCoupling};
const VELOCITY_DAMPING: f32 = ${WAVE_SIMULATION_CONFIG.velocityDampingPerFrame};
const EDGE_DAMPING_MINIMUM: f32 = ${WAVE_SIMULATION_CONFIG.edgeDampingMinimum};
const HEIGHT_RESTORING_FORCE: f32 = ${WAVE_SIMULATION_CONFIG.heightRestoringForcePerFrame};
const IMPULSE_SUPPORT_SQUARED: f32 = 4.0;

fn waveStateAt(cell: vec2i, dimensions: vec2i) -> vec2f {
  return textureLoad(
    inputWave,
    clamp(cell, vec2i(0), dimensions - vec2i(1)),
    0
  ).rg;
}

fn impulseProfile(sampleUv: vec2f, impulse: vec4f) -> f32 {
  let normalizedOffset = (sampleUv - impulse.xy) / max(impulse.w, 0.001);
  let distanceSquared = dot(normalizedOffset, normalizedOffset);
  if (distanceSquared >= IMPULSE_SUPPORT_SQUARED) { return 0.0; }
  return exp(-distanceSquared * 2.4);
}

fn clampedImpulseProfile(
  uv: vec2f,
  offset: vec2i,
  texelSize: vec2f,
  impulse: vec4f
) -> f32 {
  let halfTexel = texelSize * 0.5;
  let offsetUv = vec2f(f32(offset.x), f32(offset.y)) * texelSize;
  let sampleUv = clamp(uv + offsetUv, halfTexel, vec2f(1.0) - halfTexel);
  return impulseProfile(sampleUv, impulse);
}

@compute @workgroup_size(${WAVE_SIMULATION_CONFIG.workgroupSize}, ${WAVE_SIMULATION_CONFIG.workgroupSize})
fn computeMain(@builtin(global_invocation_id) invocation: vec3u) {
  let dimensions = textureDimensions(inputWave);
  if (any(invocation.xy >= dimensions)) { return; }

  let cell = vec2i(invocation.xy);
  let integerDimensions = vec2i(dimensions);
  let state = waveStateAt(cell, integerDimensions);
  let height = state.x;
  let left = waveStateAt(cell + vec2i(-1, 0), integerDimensions).x;
  let right = waveStateAt(cell + vec2i(1, 0), integerDimensions).x;
  let bottom = waveStateAt(cell + vec2i(0, -1), integerDimensions).x;
  let top = waveStateAt(cell + vec2i(0, 1), integerDimensions).x;
  let laplacian = left + right + bottom + top - 4.0 * height;
  let surfaceGradient = vec2f(right - left, top - bottom);
  let uv = (vec2f(invocation.xy) + vec2f(0.5)) / vec2f(dimensions);
  let texelSize = vec2f(1.0) / vec2f(dimensions);
  let deltaFrames = clamp(
    step.deltaFrames,
    0.0,
    ${WAVE_SIMULATION_CONFIG.maximumSubstepDeltaFrames}
  );
  let ambientForce =
    sin(dot(uv, normalize(vec2f(0.82, 0.57))) * TAU * 2.2 - step.timeSeconds * 1.05) * 0.000004 +
    sin(dot(uv, normalize(vec2f(-0.36, 0.93))) * TAU * 3.7 + step.timeSeconds * 1.38) * 0.000003;
  var impulseVelocity = 0.0;
  let impulseCount = min(u32(step.impulseCount), MAX_IMPULSES);
  for (var index = 0u; index < impulseCount; index += 1u) {
    let impulse = impulses[index];
    let centerProfile = impulseProfile(uv, impulse);
    let zeroSumWavelet =
      4.0 * centerProfile -
      clampedImpulseProfile(uv, vec2i(-1, 0), texelSize, impulse) -
      clampedImpulseProfile(uv, vec2i(1, 0), texelSize, impulse) -
      clampedImpulseProfile(uv, vec2i(0, -1), texelSize, impulse) -
      clampedImpulseProfile(uv, vec2i(0, 1), texelSize, impulse);
    impulseVelocity += impulse.z * zeroSumWavelet;
  }

  let edgeDistance = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  let edgeDamping = mix(
    EDGE_DAMPING_MINIMUM,
    1.0,
    smoothstep(0.0, 0.08, edgeDistance)
  );
  let nextVelocity = (
    state.y * pow(VELOCITY_DAMPING, deltaFrames) +
    (
      laplacian * WAVE_SPEED -
      height * HEIGHT_RESTORING_FORCE +
      ambientForce
    ) * deltaFrames +
    impulseVelocity
  ) * pow(edgeDamping, deltaFrames);
  let nextHeight = clamp(
    height + nextVelocity * deltaFrames,
    -0.16,
    0.16
  );
  textureStore(
    outputWave,
    cell,
    vec4f(nextHeight, nextVelocity, surfaceGradient)
  );
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
const OUTER_CORNER_CUT: f32 = 0.18;
const TABLE_CORNER_CUT: f32 = 0.28;
const TABLE_RADIUS: f32 = 0.68;
const GIRDLE_START: f32 = 0.9;
const FACET_AMBIENT_LIGHT: f32 = 0.74;
const FACET_DIRECTIONAL_LIGHT: f32 = 0.26;
const TRANSMISSION_NEUTRAL_TINT: f32 = 0.68;
const TRANSMISSION_GEM_TINT: f32 = 0.88;
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

fn chamferAxis(p: vec2f) -> f32 {
  return max(p.x, p.y);
}

fn chamferCorner(p: vec2f, cornerCut: f32) -> f32 {
  return (p.x + p.y) / (2.0 - cornerCut);
}

fn chamferedSquare(p: vec2f, cornerCut: f32) -> f32 {
  return max(chamferAxis(p), chamferCorner(p, cornerCut));
}

fn chamferBoundary(p: vec2f, cornerCut: f32) -> f32 {
  return abs(chamferCorner(p, cornerCut) - chamferAxis(p));
}

fn surfaceCornerCut(p: vec2f) -> f32 {
  return mix(
    TABLE_CORNER_CUT,
    OUTER_CORNER_CUT,
    smoothstep(TABLE_RADIUS, GIRDLE_START, gemSilhouette(p))
  );
}

fn gemSilhouette(p: vec2f) -> f32 {
  return chamferedSquare(p, OUTER_CORNER_CUT);
}

fn gemTableShape(p: vec2f) -> f32 {
  return chamferedSquare(p, TABLE_CORNER_CUT);
}

fn gemSurfaceNormal(local: vec2f) -> vec3f {
  let p = abs(local);
  let tableShape = gemTableShape(p);
  let silhouette = gemSilhouette(p);
  let axisShape = chamferAxis(p);
  let surfaceCorner = chamferCorner(p, surfaceCornerCut(p));
  var normalXY = vec2f(-0.035, -0.055);

  if (tableShape > TABLE_RADIUS) {
    if (surfaceCorner > axisShape) {
      normalXY = normalize(vec2f(sign(local.x), sign(local.y))) * 0.72;
    } else if (p.x > p.y) {
      normalXY = vec2f(sign(local.x) * 0.68, 0.0);
    } else {
      normalXY = vec2f(0.0, sign(local.y) * 0.68);
    }
  }

  if (silhouette > GIRDLE_START) {
    if (surfaceCorner > axisShape) {
      normalXY = normalize(vec2f(sign(local.x), sign(local.y))) * 0.78;
    } else if (p.x > p.y) {
      normalXY = vec2f(sign(local.x) * 0.78, 0.0);
    } else {
      normalXY = vec2f(0.0, sign(local.y) * 0.78);
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
  let cornerRidge =
    (1.0 - smoothstep(
      0.0,
      0.035,
      chamferBoundary(p, surfaceCornerCut(p))
    )) *
    smoothstep(TABLE_RADIUS - 0.02, TABLE_RADIUS + 0.08, tableShape);
  let girdleRidge =
    1.0 - smoothstep(0.0, 0.025, abs(silhouette - GIRDLE_START));
  unattenuatedHighlight += mix(gem, vec3f(1.0), 0.55) *
    (
      tableRidge * 0.12 +
      cornerRidge * 0.045 +
      girdleRidge * 0.05
    );
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

const REFERENCE_FRAGMENT_DRAG_RATE: f32 = ${REFERENCE_FRAGMENT_DRAG_RATE_PER_SECOND};
const FRAGMENT_EDGE_FADE_START: f32 = 0.88;
const FRAGMENT_EDGE_RADIUS: f32 = 0.94;
const FRAGMENT_COLOR_INTENSITY: f32 = 2.25;

struct Output {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) gemType: f32,
  @location(2) @interpolate(flat) age: f32,
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
  let elapsedSeconds = elapsed / 1000.0;
  let age = clamp(elapsed / max(instance.lifetime, 1.0), 0.0, 1.0);
  let dragRate = REFERENCE_FRAGMENT_DRAG_RATE / instance.mass;
  let velocityTravelSeconds =
    (1.0 - exp(-dragRate * elapsedSeconds)) / dragRate;
  let gravityTravelSecondsSquared =
    (elapsedSeconds - velocityTravelSeconds) / dragRate;
  let normalizedCenter = vec2f(
    instance.centerX + instance.velocityX * velocityTravelSeconds,
    instance.centerY
      + instance.velocityY * velocityTravelSeconds
      + instance.gravity * gravityTravelSecondsSquared
  );
  let center = frame.boardOrigin + normalizedCenter * frame.boardSize;
  var size = instance.size * (1.0 - 0.48 * age);
  if (age >= 1.0) {
    size = 0.0;
  }
  let local = corners[vertexIndex];
  let shaped = local * vec2f(0.78, 0.88);
  let pixel = center + shaped * size * frame.boardSize * 0.5;
  var output: Output;
  output.position = vec4f(
    pixel.x / frame.canvas.x * 2.0 - 1.0,
    1.0 - pixel.y / frame.canvas.y * 2.0,
    0.0,
    1.0
  );
  output.local = local;
  output.gemType = instance.gemType;
  output.age = age;
  return output;
}

${gemColorFunction}

@fragment fn fragmentMain(input: Output) -> @location(0) vec4f {
  let color = gemColor(i32(input.gemType));
  let fade = 1.0 - smoothstep(0.58, 1.0, input.age);
  let radius = length(input.local);
  let edgeCoverage = 1.0 - smoothstep(
    FRAGMENT_EDGE_FADE_START,
    FRAGMENT_EDGE_RADIUS,
    radius
  );
  let fragmentColor = color * FRAGMENT_COLOR_INTENSITY;
  return vec4f(fragmentColor, edgeCoverage * fade);
}
`;
