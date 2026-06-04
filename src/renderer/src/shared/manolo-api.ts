export type ManoloApi = Window['manolo'];

/** Returns the preload-exposed API, or undefined when the bridge is unavailable. */
export function getManoloApi(): ManoloApi | undefined {
  return (window as { manolo?: ManoloApi }).manolo;
}
