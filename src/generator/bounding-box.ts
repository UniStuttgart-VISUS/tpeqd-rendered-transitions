import { max, min } from "d3-array";
import { format } from 'd3-format';
import type { Polygon, LineString } from 'geojson';

export default class BoundingBox {
  constructor(
    readonly south: number,
    readonly west: number,
    readonly north: number,
    readonly east: number,
  ) {}

  toOGRString(): string {
    const f_ = format('.6f');
    const f = (d: number) => f_(d).replace('−', '-');  // d3.format uses Unicode minus. Overpass API requires ASCII dash
    return `${f(this.west)} ${f(this.south)} ${f(this.east)} ${f(this.north)}`;
  }

  toString(): string {
    const f_ = format('.6f');
    const f = (d: number) => f_(d).replace('−', '-');  // d3.format uses Unicode minus. Overpass API requires ASCII dash
    return `${f(this.south)},${f(this.west)},${f(this.north)},${f(this.east)}`;
  }

  asPolygon(): Polygon {
    return {
      type: 'Polygon',
      coordinates: [[
        [this.east, this.south],
        [this.west, this.south],
        [this.west, this.north],
        [this.east, this.north],
        [this.east, this.south],
      ]],
    }
  }

  asLineString(): LineString {
    return {
      type: 'LineString',
      coordinates: [
        [this.east, this.south],
        [this.west, this.south],
        [this.west, this.north],
        [this.east, this.north],
        [this.east, this.south],
      ],
    }
  }

  toJSON(): [number, number, number, number] {
    return [this.south, this.west, this.north, this.east];
  }

  static fromJSON(vals: [number, number, number, number]): BoundingBox {
    return new BoundingBox(...vals);
  }
}

export function unionBoundingBox(bboxs: Array<BoundingBox>): BoundingBox {
  const west = min(bboxs, d => d.west);
  const east = max(bboxs, d => d.east);
  const south = min(bboxs, d => d.south);
  const north = max(bboxs, d => d.north);

  return new BoundingBox(
    south ?? 0,
    west ?? 0,
    north ?? 0,
    east ?? 0
  );
}