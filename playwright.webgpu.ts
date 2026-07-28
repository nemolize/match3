import process from "node:process";

export const softwareWebGpuLaunchArgs = [
  "--enable-unsafe-webgpu",
  "--use-webgpu-adapter=swiftshader",
  "--use-gpu-in-tests",
];

export const e2eSoftwareWebGpuLaunchArgs = [
  ...softwareWebGpuLaunchArgs,
  ...(process.platform === "linux"
    ? [
        "--enable-accelerated-2d-canvas",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-features=Vulkan",
        "--use-vulkan=swiftshader",
      ]
    : []),
];
