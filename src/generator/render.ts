import { createWriteStream } from "fs";

import { geoPath, type GeoProjection, type GeoPath } from "d3-geo";
import { createCanvas, DOMMatrix } from "canvas";
import type { CanvasRenderingContext2D } from "canvas";
import type { Feature } from 'geojson';

import type { CanvasRendererAttributes, Coordinate, RenderData } from "../common/datatypes";
import { CANVAS_SIZE } from "../common/constants";
import { scaleToZoom } from "../common/utils";
import type Frame from './frame';
import { group } from "d3";


class RenderContextRecorder {
  commands: Array<
    { action: 'moveTo', x: number, y: number }
    | { action: 'lineTo', x: number, y: number }
    | { action: 'quadraticCurveTo', cpx: number, cpy: number, x: number, y: number }
    | { action: 'bezierCurveTo', cpx1: number, cpy1: number, cpx2: number, cpy2: number, x: number, y: number }
    | { action: 'arcTo', x1: number, y1: number, x2: number, y2: number, radius: number }
    | { action: 'arc', x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise: boolean }
    | { action: 'rect', x: number, y: number, w: number, h: number }
    | { action: 'closePath' }
    | { action: 'beginPath' }
  > = [];

  moveTo(x: number, y: number) {
    this.commands.push({ action: 'moveTo', x, y });
  }

  lineTo(x: number, y: number) {
    this.commands.push({ action: 'lineTo', x, y });
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
    this.commands.push({ action: 'quadraticCurveTo', cpx, cpy, x, y });
  }

  bezierCurveTo(cpx1: number, cpy1: number, cpx2: number, cpy2: number, x: number, y: number) {
    this.commands.push({ action: 'bezierCurveTo', cpx1, cpy1, cpx2, cpy2, x, y });
  }

  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number) {
    this.commands.push({ action: 'arcTo', x1, y1, x2, y2, radius });
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise: boolean) {
    this.commands.push({ action: 'arc', x, y, radius, startAngle, endAngle, anticlockwise });
  }

  rect(x: number, y: number, w: number, h: number) {
    this.commands.push({ action: 'rect', x, y, w, h });
  }

  beginPath() {
    this.commands.push({ action: 'beginPath' });
  }

  closePath() {
    this.commands.push({ action: 'closePath' });
  }

  replay(ctx: CanvasRenderingContext2D) {
    this.commands.forEach(d => {
      switch (d.action) {
        case 'moveTo':
          ctx.moveTo(d.x, d.y);
          break;
        case 'lineTo':
          ctx.lineTo(d.x, d.y);
          break;
        case 'quadraticCurveTo':
          ctx.quadraticCurveTo(d.cpx, d.cpy, d.x, d.y);
          break;
        case 'bezierCurveTo':
          ctx.bezierCurveTo(d.cpx1, d.cpy1, d.cpx2, d.cpy2, d.x, d.y);
          break;
        case 'arcTo':
          ctx.arcTo(d.x1, d.y1, d.x2, d.y2, d.radius);
          break;
        case 'arc':
          ctx.arc(d.x, d.y, d.radius, d.startAngle, d.endAngle, d.anticlockwise);
          break;
        case 'rect':
          ctx.rect(d.x, d.y, d.w, d.h);
          break;
        case 'beginPath':
          ctx.beginPath();
          break;
        case 'closePath':
          ctx.closePath();
          break;
        default:
          console.error('Unhandled case:', (d as any).action);
      }
    });
  }

  clear() {
    this.commands.splice(0);
  }
}


const defaultRendererAttributes: CanvasRendererAttributes = {
  strokeStyle: 'black',
  lineWidth: 1,
  fillStyle: 'none',
  lineDash: [],
};


export default function render(
  frame: Frame,
  prerenderedFeatures: RenderIntermediateRepresentation,
): Buffer {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  const scale = frame.scale;
  const zoomLevel = scaleToZoom(scale);

  // project point features
  const projectedPointFeatures = prerenderedFeatures.pointFeatures
    .filter(d => (d.minZoom ?? -Infinity) <= zoomLevel && (d.maxZoom ?? Infinity) > zoomLevel)
    .map(partialLayer => {
      const { data, ...rest } = partialLayer;

      const context = new RenderContextRecorder();
      const path = geoPath(frame.projection).context(context);

      path.pointRadius(4.5 / scale)

      path(data);

      return { recordedPathOperations: context, partialLayer: rest };
    });
 
  const data = [/*...projectedPointFeatures,*/ ...prerenderedFeatures.prerenderedFeatures];

  const renderedData = data.filter(d => (d.partialLayer.minZoom ?? -Infinity) <= zoomLevel && (d.partialLayer.maxZoom ?? Infinity) > zoomLevel);
  renderedData.sort((a, b) => a.partialLayer.zIndex - b.partialLayer.zIndex);  // higher zIndex drawn later

  // clear background (optional)
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.setTransform(frame.transform)

  renderedData.forEach(({ recordedPathOperations, partialLayer }) => {
  //renderedData.forEach(partialLayer => {
    const layer = {
      ...defaultRendererAttributes,
      ...partialLayer,
    };

    ctx.fillStyle = layer.fillStyle;
    ctx.lineWidth = layer.lineWidth / scale;
    ctx.strokeStyle = layer.strokeStyle;
    ctx.setLineDash(layer.lineDash);

    ctx.beginPath();
    recordedPathOperations.replay(ctx)

    if (layer.fillStyle !== 'none') ctx.fill('evenodd');  // evenodd fill rule seems to be needed for non-bleeding (Multi)Polygons
    if (layer.strokeStyle !== 'none') ctx.stroke();
  });

  return canvas.toBuffer('image/png');
}

export interface RenderIntermediateRepresentation {
  pointFeatures: RenderData,
  prerenderedFeatures: Array<{
    partialLayer: Omit<RenderData[0], 'data'>;
    recordedPathOperations: RenderContextRecorder;
  }>;
}

export function renderIntermediateRepresentation(
  projection: GeoProjection,
  data: RenderData,
): RenderIntermediateRepresentation {
  /// XXX: assume all RenderData layers have either only point features, or none
  const grouped = group(data, d => (
    (d.data.type === 'Feature' && d.data.geometry.type === 'Point')
    || (d.data.features?.[0]?.geometry?.type === 'Point')
   ) ? 'point' : 'other');
  const pointFeatures = grouped.get('point') ?? [];
  const restFeatures = grouped.get('other') ?? [];

  const path = geoPath(projection);

  const prerenderedFeatures = restFeatures.map(partialLayer => {
    const { data, ...rest } = partialLayer;

    const context = new RenderContextRecorder();
    const path = geoPath(projection).context(context);

    path.context(context)(data);

    return { recordedPathOperations: context, partialLayer: rest };
  })

  return {
    pointFeatures,
    prerenderedFeatures,
  }
}

