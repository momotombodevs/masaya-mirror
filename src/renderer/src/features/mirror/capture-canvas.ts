export async function captureCanvasPng(canvas: HTMLCanvasElement): Promise<ArrayBuffer | null> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (!blob || blob.size === 0) {
    return null;
  }
  return blob.arrayBuffer();
}
