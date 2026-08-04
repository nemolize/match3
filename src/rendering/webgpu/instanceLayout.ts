type InstanceGroup = readonly [name: string, components: readonly string[]];

type ComponentName<Groups extends readonly InstanceGroup[]> =
  Groups[number][1][number];

const createInstanceLayout = <const Groups extends readonly InstanceGroup[]>(
  structName: string,
  groups: Groups,
) => {
  const offsets = new Map<string, number>();
  let offset = 0;
  groups.forEach(([, components]) => {
    components.forEach((component) => {
      offsets.set(component, offset);
      offset += 1;
    });
  });
  const offsetOf = (component: ComponentName<Groups>): number => {
    const componentOffset = offsets.get(component);
    if (componentOffset === undefined) {
      throw new Error(`Unknown ${structName} component: ${component}`);
    }
    return componentOffset;
  };
  const wgsl = `struct ${structName} {
${groups
  .flatMap(([, components]) =>
    components.map((component) => `  ${component}: f32,`),
  )
  .join("\n")}
}`;
  return { offsetOf, stride: offset, wgsl };
};

const gemInstance = createInstanceLayout("GemInstance", [
  ["cells", ["fromCol", "fromRow", "toCol", "toRow"]],
  ["timingAndStyle", ["startedAt", "duration", "gemType", "selected"]],
  ["animation", ["animationMode", "reserved0", "reserved1", "reserved2"]],
] as const);

const fragmentInstance = createInstanceLayout("FragmentInstance", [
  ["centerSizeVelocityX", ["centerX", "centerY", "size", "velocityX"]],
  ["motionAndTime", ["velocityY", "spawnedAt", "gemType", "lifetime"]],
  ["physics", ["gravity", "mass"]],
] as const);

export const GEM_INSTANCE_LAYOUT = {
  fromCol: gemInstance.offsetOf("fromCol"),
  fromRow: gemInstance.offsetOf("fromRow"),
  toCol: gemInstance.offsetOf("toCol"),
  toRow: gemInstance.offsetOf("toRow"),
  startedAt: gemInstance.offsetOf("startedAt"),
  duration: gemInstance.offsetOf("duration"),
  gemType: gemInstance.offsetOf("gemType"),
  selected: gemInstance.offsetOf("selected"),
  animationMode: gemInstance.offsetOf("animationMode"),
  reserved0: gemInstance.offsetOf("reserved0"),
  reserved1: gemInstance.offsetOf("reserved1"),
  reserved2: gemInstance.offsetOf("reserved2"),
};
export const GEM_INSTANCE_STRIDE = gemInstance.stride;
export const gemInstanceStruct = gemInstance.wgsl;

export const FRAGMENT_INSTANCE_LAYOUT = {
  centerX: fragmentInstance.offsetOf("centerX"),
  centerY: fragmentInstance.offsetOf("centerY"),
  size: fragmentInstance.offsetOf("size"),
  velocityX: fragmentInstance.offsetOf("velocityX"),
  velocityY: fragmentInstance.offsetOf("velocityY"),
  spawnedAt: fragmentInstance.offsetOf("spawnedAt"),
  gemType: fragmentInstance.offsetOf("gemType"),
  lifetime: fragmentInstance.offsetOf("lifetime"),
  gravity: fragmentInstance.offsetOf("gravity"),
  mass: fragmentInstance.offsetOf("mass"),
};
export const FRAGMENT_INSTANCE_STRIDE = fragmentInstance.stride;
export const fragmentInstanceStruct = fragmentInstance.wgsl;
