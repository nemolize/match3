import { waveCausticShader } from "@/rendering/webgpu/shaders";

const WAVE_RESOLUTION = 64;
const WAVE_CHANNEL_COUNT = 4;
const BYTES_PER_WAVE_TEXEL = WAVE_CHANNEL_COUNT * Uint16Array.BYTES_PER_ELEMENT;
const float32Value = new Float32Array(1);
const float32Bits = new Uint32Array(float32Value.buffer);

const floatToHalfBits = (value: number): number => {
  float32Value[0] = value;
  const bits = float32Bits[0] ?? 0;
  const sign = (bits >>> 16) & 0x8000;
  const exponent = ((bits >>> 23) & 0xff) - 127 + 15;
  let mantissa = bits & 0x7fffff;
  if (exponent < -10) return sign;
  if (exponent <= 0) {
    mantissa |= 0x800000;
    const shift = 14 - exponent;
    return sign + ((mantissa + (1 << (shift - 1))) >> shift);
  }
  if (exponent >= 31) return sign | 0x7c00;
  return sign + (exponent << 10) + ((mantissa + 0x1000) >> 13);
};

const encodeWaveState = (values: Float32Array): Uint16Array => {
  const encoded = new Uint16Array(values.length);
  values.forEach((value, index) => {
    encoded[index] = floatToHalfBits(value);
  });
  return encoded;
};

const createRippleWaveState = (): Float32Array => {
  const values = new Float32Array(
    WAVE_RESOLUTION * WAVE_RESOLUTION * WAVE_CHANNEL_COUNT,
  );
  const waveNumber = 42;
  const amplitude = 0.018;
  const damping = 5;
  const gradientSampleDistance = 2 / WAVE_RESOLUTION;

  for (let row = 0; row < WAVE_RESOLUTION; row += 1) {
    for (let column = 0; column < WAVE_RESOLUTION; column += 1) {
      const x = (column + 0.5) / WAVE_RESOLUTION - 0.44;
      const y = (row + 0.5) / WAVE_RESOLUTION - 0.46;
      const radius = Math.hypot(x, y);
      const envelope = Math.exp(-radius * damping);
      const phase = radius * waveNumber;
      const height = amplitude * Math.cos(phase) * envelope;
      const radialDerivative =
        amplitude *
        envelope *
        (-waveNumber * Math.sin(phase) - damping * Math.cos(phase));
      const inverseRadius = radius > 0.0001 ? 1 / radius : 0;
      const offset = (row * WAVE_RESOLUTION + column) * WAVE_CHANNEL_COUNT;
      values[offset] = height;
      values[offset + 1] = Math.abs(height) * 0.35;
      values[offset + 2] =
        radialDerivative * x * inverseRadius * gradientSampleDistance;
      values[offset + 3] =
        radialDerivative * y * inverseRadius * gradientSampleDistance;
    }
  }

  return values;
};

const reportUnavailable = (message: string): void => {
  const alert = document.querySelector<HTMLElement>('[role="alert"]');
  if (!alert) return;
  alert.hidden = false;
  alert.textContent = message;
};

const setup = async (): Promise<void> => {
  const canvas = document.querySelector("canvas");
  const button = document.querySelector("button");
  if (!canvas || !button || !navigator.gpu) {
    reportUnavailable("WebGPU is unavailable.");
    return;
  }

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter?.requestDevice();
  const context = canvas.getContext("webgpu");
  if (!device || !context) {
    reportUnavailable("A WebGPU rendering context is unavailable.");
    return;
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ alphaMode: "opaque", device, format });
  const module = device.createShaderModule({
    code: waveCausticShader,
    label: "caustic-validation",
  });
  const compilationInfo = await module.getCompilationInfo();
  const errors = compilationInfo.messages.filter(
    (message) => message.type === "error",
  );
  if (errors.length > 0) {
    reportUnavailable(errors.map((message) => message.message).join("; "));
    return;
  }

  const pipeline = device.createRenderPipeline({
    fragment: {
      entryPoint: "fragmentMain",
      module,
      targets: [{ format }],
    },
    label: "caustic-validation",
    layout: "auto",
    primitive: { topology: "triangle-list" },
    vertex: { entryPoint: "vertexMain", module },
  });
  const waveTexture = device.createTexture({
    format: "rgba16float",
    label: "controlled-wave-state",
    size: {
      height: WAVE_RESOLUTION,
      width: WAVE_RESOLUTION,
    },
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
  });
  const bindGroup = device.createBindGroup({
    entries: [
      { binding: 0, resource: waveTexture.createView() },
      {
        binding: 1,
        resource: device.createSampler({
          magFilter: "linear",
          minFilter: "linear",
        }),
      },
    ],
    layout: pipeline.getBindGroupLayout(0),
  });

  const render = async (waveState: Float32Array): Promise<void> => {
    device.queue.writeTexture(
      { texture: waveTexture },
      encodeWaveState(waveState),
      {
        bytesPerRow: WAVE_RESOLUTION * BYTES_PER_WAVE_TEXEL,
        rowsPerImage: WAVE_RESOLUTION,
      },
      { height: WAVE_RESOLUTION, width: WAVE_RESOLUTION },
    );
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          clearValue: { a: 1, b: 0, g: 0, r: 0 },
          loadOp: "clear",
          storeOp: "store",
          view: context.getCurrentTexture().createView(),
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
  };

  await render(
    new Float32Array(WAVE_RESOLUTION * WAVE_RESOLUTION * WAVE_CHANNEL_COUNT),
  );
  canvas.dataset.rendererStatus = "ready";
  canvas.dataset.waveState = "flat";
  button.addEventListener("click", () => {
    button.disabled = true;
    void render(createRippleWaveState()).then(() => {
      canvas.dataset.waveState = "ripple";
    });
  });
};

void setup();
