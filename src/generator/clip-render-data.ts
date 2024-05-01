import bboxClip from '@turf/bbox-clip';
import type { Feature } from 'geojson';

import { RenderData } from "../common/datatypes";
import BoundingBox from "./bounding-box";

export default function clipRenderData(
  renderData: RenderData,
  bbox: BoundingBox,
): RenderData {
  const clipBbox = [bbox.west, bbox.south, bbox.east, bbox.north];

  return renderData.flatMap(layer => {
    const { data, ...rest } = layer;
    if (data.type === 'Sphere') return layer;

    if (data.type === 'Feature') {
      const clippedData = clipFeature(data, clipBbox);
      if (clippedData === null) return null;
      return { ...rest, data: clippedData };
    } else if (data.type === 'FeatureCollection') {
      const { features, ...rest2 } = data;
      const featuresClipped = features
        .map((d: any) => clipFeature(d, clipBbox))
        .filter((d: any) => d !== null);

      if (featuresClipped.length === 0) return null;
      return { ...rest, data: { ...rest2, features: featuresClipped }};
    } else {
      console.error(`Unhandled data type: ${data.type}`);
      return null;
    }
  }).filter(d => d !== null) as RenderData;
}

function clipFeature(
  feature: Feature,
  bbox: Array<number>,
): Feature | null {
  if (feature.geometry === null) return null;
  if (feature.geometry.type === 'Point') return feature;

  const clipped = bboxClip(feature as any, bbox as any);
  return clipped;
}