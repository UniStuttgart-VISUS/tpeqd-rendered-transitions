import type { GeoProjection } from "d3-geo";
import {extent, interpolateZoom, range, ticks}from'd3';
import { DOMMatrix, DOMPoint } from "canvas";

import { Coordinate, Vertex } from "../common/datatypes";
import { zoomToScale, scaleFactor, scaleToZoom } from "../common/utils";
import { generateProjection } from "../common/generate-projection";
import { CANVAS_SIZE } from "../common/constants";
import { writeFile } from "fs/promises";

// van Wijk and Nuij, 2003
const rho = 1.4;
const interpolatorGenerator = (interpolateZoom as unknown as { rho: (_arg0: number) => typeof interpolateZoom }).rho(rho);


export function generateTransitionV2(
  v1: Vertex,
  v2: Vertex
) {
  const proj = generateProjection([v1.coords, v2.coords]);

  const [u1x, u1y] = proj(v1.coords) as Coordinate;
  const [u2x, u2y] = proj(v2.coords) as Coordinate;

  // Get scale back to slippy map scale.
  // The projection domain width is invariant of distance between v1 and v2
  // (i.e., the projected scale does not change). 4/pi seems to be nearly
  // right. So nearly that it is probably the right value (log2(256)/2pi), but
  // distorted by some minor floating point inaccuracies in the rather large
  // range of orders of magnitude in the values throughout the computations.
  //
  // Maybe the discrepancy also stems from the scale distortion in WebMercator:
  // Zoom level 12 at the equator probably has a different geographical extent
  // than near the poles. In TPEQD projection, the scale is independent of the
  // latitude, at least close to the projection nodes. We should test this
  // hypothesis.
  const w = 4 / Math.PI;  // how wide is the original projected domain

  const scale1 = zoomToScale(v1.zoom) / 256;
  const scale2 = zoomToScale(v2.zoom) / 256;

  const interpolator = interpolatorGenerator(
    [u1x, u1y, w / scale1],
    [u2x, u2y, w / scale2],
  );

  const scaleTranslate = function(t: number): { scale: number, translate: [number, number] } {
    const [x, y, s] = interpolator(t);
    const scale = CANVAS_SIZE / s;
    return { scale, translate: [x, y] };
  };

  return {
    scaleTranslate,
    duration: interpolator.duration,
  };
}