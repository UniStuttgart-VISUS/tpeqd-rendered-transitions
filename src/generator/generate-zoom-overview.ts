import fs from 'fs/promises';

import { format } from 'd3-format';
import { range } from 'd3';

import type { RenderData } from '../common/datatypes';
import render, { renderIntermediateRepresentation } from './render';
import { generateProjection } from '../common/generate-projection';
import { CANVAS_SIZE } from '../common/constants';
import type { Coordinate } from '../common/datatypes';
import { zoomToScale } from '../common/utils';
import Frame from './frame';
import { loadOverpassRenderData } from './overpass';
import { overpassLayerDefinitions } from './render-layer-definitions';

export async function generateZoomOverview(
  renderData: RenderData,
) {
  // create output directory
  try {
    await fs.mkdir('render', { recursive: true });
  } catch (err: any) {
    if (err.code != 'EEXISTS') throw err;
  }

  const frames: Array<Frame> = [];
  const p1: Coordinate = [9, 48];
  const p2: Coordinate = [12.6, 55.7];

  const projOrig = generateProjection([p1, p2]);

  const minZoom = 1;
  const maxZoom = 20;
  const numSteps = 40;
  const step = (maxZoom - minZoom) / (numSteps - 1);
  const zoomLevels = range(minZoom, maxZoom + step/2, step);
  const scaleLevels = zoomLevels.map(zoomToScale);

  // generate frames
  scaleLevels.forEach((scale, i) => {
    const [x, y]: Coordinate = projOrig(p2)!;
    const proj = generateProjection([p1, p2]);
    frames.push(new Frame(proj, scale, [x, y], 'cph', i));
  });

  // collect OSM data for near-zoom frames
  const additionalRenderData = await loadOverpassRenderData(frames, overpassLayerDefinitions);
  const allRenderData = [...renderData, ...additionalRenderData];
  const preparedRenderData = renderIntermediateRepresentation(projOrig, allRenderData);

  const promises = frames.map((frame, n, all) => {
    const fmt = format('03d')(n);
    const fmtZoom = format('.1f')(zoomLevels[n]);
    console.log(`Rendering image ${n+1} of ${all.length}, scale ${fmtZoom}, zoom level ${zoomLevels[n]}.`);

    const img = render(frame, preparedRenderData);

    return fs.writeFile(`render/${fmt}-${fmtZoom}.png`, img, 'binary');
  });

  return await Promise.all(promises);
}