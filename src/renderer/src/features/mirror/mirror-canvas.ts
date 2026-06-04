/** Finds the rendered mirror canvas within a stage container, if present. */
export function getMirrorCanvas(container: HTMLElement | null): HTMLCanvasElement | null {
  return container?.querySelector('canvas') ?? null;
}
