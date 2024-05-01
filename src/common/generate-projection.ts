import { geoInterpolate, geoDistance, type GeoProjection } from 'd3-geo';
import { geoTwoPointEquidistant } from 'd3-geo-projection';
import { geoClipPolygon } from 'd3-geo-polygon';

import { CANVAS_SIZE } from './constants';
import { Coordinate, Pair } from "./datatypes";

const tpeqdMinDistanceDegrees = 8;

export function generateProjection(
  foci: Pair<Coordinate>,
): GeoProjection {
  let [p1, p2] = foci;

  const areIdentical = (geoDistance(p1, p2) === 0);
  const areTooClose = (geoDistance(p1, p2) * 180 / Math.PI <= tpeqdMinDistanceDegrees);
  if (areTooClose) {
    console.debug('tpeqd with two close foci, moving one slightly to avoid rendering bugs');
    // XXX: is it the scale?
    const diff = (p2[1] > 0) ? -tpeqdMinDistanceDegrees : tpeqdMinDistanceDegrees;
    p2 = [p2[0], p2[1] + diff];
  }

  // sort points by east coordinate
  if (p1[0] > p2[0]) [p2, p1] = [p1, p2];

  const epsilon = 1e-2;
  const r = geoDistance(p1, p2) / 2 * 180 / Math.PI;

  const clipPolygon = geoClipPolygon({
    type: 'Polygon',
    coordinates: [
      [
        [180 - r - epsilon, epsilon],
        [180 - r - epsilon, -epsilon],
        [-180 + r + epsilon, -epsilon],
        [-180 + r + epsilon, epsilon],
        [180 - r - epsilon, epsilon]
      ]
    ],
  });

  const proj = geoTwoPointEquidistant(p1, p2)
    .scale(1)
    .clipExtent([[0, 0], [CANVAS_SIZE, CANVAS_SIZE]])
    .translate([0, 0])
    .precision(0.0001)
    .preclip(clipPolygon);
  //.clipAngle(180 - r)


  // rotate midpoint north
  const midpoint = geoInterpolate(p1, p2)(0.5);
  const diffAngle = getAzimuth(proj, midpoint, true);
  if (isNaN(diffAngle)) {
    console.error('Azimuth calculation failed. p1:', p1, '; p2:', p2);
    proj.angle(0);
  } else if (areIdentical) {
    proj.angle(getAzimuth(proj, p1, true));
  } else {
    proj.angle(diffAngle);
  }

  proj.clipExtent([[-200, -200], [200, 200]])  // XXX
  return proj;
}

export function getAzimuth(
  projection: GeoProjection,
  coordinate: Coordinate,
  toPole: boolean = false,
): number {
  const pointProj = projection(coordinate)!;
  const poleProj = projection(
    toPole
      ? [0, 90]
      : [coordinate[0], Math.min(90, coordinate[1] + 1e-3)]
  )!;
  const angle = Math.atan2(poleProj[1] - pointProj[1], poleProj[0] - pointProj[0]);
  const diffAngle = (180 * angle / Math.PI) + 90;  // up is 90deg

  return diffAngle;
}


export function getCenter(
  projection: GeoProjection,
  scale: number,
  [x, y]: [number, number],
): Coordinate {
  const oldScale = projection.scale();
  const oldTranslate = projection.translate();

  projection.scale(scale)
    .translate([
      -x * scale + CANVAS_SIZE / 2,
      -y * scale + CANVAS_SIZE / 2,
    ]);

  const center = projection.invert?.([CANVAS_SIZE/2, CANVAS_SIZE/2]) ?? [0,0];
  projection.scale(oldScale).translate(oldTranslate);
  return center;
}