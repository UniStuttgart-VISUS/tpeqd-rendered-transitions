export const scaleFactor = 128 / Math.PI;

export function scaleToZoom(scale: number): number {
  return Math.log2(scale / scaleFactor);
}

export function zoomToScale(zoom: number): number {
  return Math.pow(2, zoom) * scaleFactor;
}