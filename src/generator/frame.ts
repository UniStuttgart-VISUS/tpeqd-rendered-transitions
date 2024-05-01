import { GeoProjection, extent, min, range, ticks } from "d3";

import BoundingBox from "./bounding-box";
import { CANVAS_SIZE } from "../common/constants";
import type { Pair, Coordinate } from "../common/datatypes";
import { scaleToZoom } from "../common/utils";
import { DOMMatrix, DOMPoint } from "canvas";
import { generateProjection } from "../common/generate-projection";

export default class Frame {
  readonly boundingBox: BoundingBox;
  readonly zoom: number;
  readonly transform: DOMMatrix;
  readonly projection: GeoProjection;
  readonly bounds: Array<[number, number]>;

  constructor(
    projection: GeoProjection | null,
    readonly projectionNodes: Pair<Coordinate>,
    readonly scale: number,
    readonly translate: [number, number],
    readonly key: string,
    readonly index: number,
    readonly name: string = '',
    boundingBox: BoundingBox | null,
    readonly postRotation: number = 0,
  ) {
    // consider postRotation here, instead of doing a sqrt(2) factor bbox growth for all
    const radiansBounded = (Math.abs(postRotation) % 90) * Math.PI / 180;
    const rotationGrowthFactor = Math.cos(radiansBounded) + Math.sin(radiansBounded);

    if (projection) this.projection = projection;
    else this.projection = generateProjection(this.projectionNodes);

    if (boundingBox) this.boundingBox = boundingBox;
    else this.boundingBox = calculateBoundingBox(this.projection, scale, translate, rotationGrowthFactor);

    this.zoom = scaleToZoom(scale);

    this.transform = new DOMMatrix([1, 0, 0, 1, 0, 0])
      .scale(scale)
      .rotate(postRotation)
      .translate(-translate[0], -translate[1])

    // there's got to be a better way... but it works
    const viewportTransform = new DOMMatrix([1, 0, 0, 1, CANVAS_SIZE/2, CANVAS_SIZE/2]);
    this.transform.preMultiplySelf(viewportTransform);

    this.bounds = calculateBounds(this.transform);
  }

  toJSON(): any {
    return {
      boundingBox: this.boundingBox.toJSON(),
      projectionNodes: this.projectionNodes,
      scale: this.scale,
      translate: this.translate,
      key: this.key,
      index: this.index,
      name: this.name,
      postRotation: this.postRotation,
    };
  }

  static fromJSON(json: any): Frame {
    const {
      boundingBox,
      projectionNodes,
      scale,
      translate,
      key,
      index,
      name,
      postRotation,
    } = json;
    const bbox = BoundingBox.fromJSON(boundingBox);

    return new Frame(
      null,
      projectionNodes,
      scale,
      translate,
      key,
      index,
      name,
      bbox,
      postRotation,
    );
  }
};


function calculateBoundingBox(
  projection: GeoProjection,
  scale: number,
  [x, y]: [number, number],
  rotationGrowthFactor: number = 0,
): BoundingBox {
  const lats = new Array<number>();
  const lngs = new Array<number>();

  const scaleOld = projection.scale();
  const [tx, ty] = projection.translate();
  const paddedScale = 1/rotationGrowthFactor * 0.99 * scale;
  projection.scale(paddedScale)
    .translate([
      -x * paddedScale + CANVAS_SIZE / 2,
      -y * paddedScale + CANVAS_SIZE / 2,
    ]);

  // the projections can be rotated, so sample a set of points at all edges
  range(0, CANVAS_SIZE * 1.1, CANVAS_SIZE/10).forEach(tick => {
    [
      [0, tick],
      [tick, 0],
      [CANVAS_SIZE, tick],
      [tick, CANVAS_SIZE],
    ].forEach(([x, y]) => {
      const vals = projection.invert?.([x, y]);
      if (vals) {
        lngs.push(vals[0]);
        lats.push(vals[1]);
      }
    });
  });

  // TODO: this behavior breaks at the antimeridian
  const [west, east] = extent<number, number>(lngs, d => d);
  const [south, north] = extent<number, number>(lats, d => d);

  projection.scale(scaleOld).translate([tx, ty]);

  return new BoundingBox(
    south ?? 0,
    west ?? 0,
    north ?? 0,
    east ?? 0
  );
}



function calculateBounds(
  transform: DOMMatrix,
) {
  const coords = new Array<[number, number]>();

  [
    [0, 0],
    [0, CANVAS_SIZE],
    [CANVAS_SIZE, CANVAS_SIZE],
    [CANVAS_SIZE, 0]
  ].forEach(([x, y]) => {
    const p0 = new DOMPoint();
    p0.x = x;
    p0.y = y;

    const p = transform.inverse().transformPoint(p0);
    coords.push([p.x, p.y]);
  });

  return coords;
}