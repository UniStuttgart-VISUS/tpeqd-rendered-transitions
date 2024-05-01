import fs, { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream, write, writeFileSync } from 'node:fs';
import path, { resolve } from 'node:path';
import { execSync, exec as execWithCallbacks, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';

import { format } from 'd3-format';
import JSZip from 'jszip';
import { easeCubicInOut, geoDistance, geoInterpolate } from 'd3';

import type { Pair, RenderData, Graph, Vertex, Coordinate } from '../common/datatypes';
import render, { renderIntermediateRepresentation } from './render';
import { generateProjection, getAzimuth, getCenter } from '../common/generate-projection';
import { generateTransitionV2 } from "./generate-transition";
import { CANVAS_SIZE, maxNaturalEarthZoom, videoCrf } from '../common/constants';
import Frame from './frame';
import { loadOverpassRenderData, loadOverpassRenderDataForEdge, preloadOverpassRenderData } from './overpass';
import { loadRenderData, overpassLayerDefinitions } from './render-layer-definitions';
import { unionBoundingBox } from './bounding-box';
import clipRenderData from './clip-render-data';
import { LogLevel, logTime, logTimeEnd, logTimeLog } from './logger';
import loadGraph from './graph';
import { edgeName, transitionName } from '../common/names';

const exec = promisify(execWithCallbacks);

const _generateFromGraphDefaultOptions = {
  // transition speed factor, relative to recommended duration
  transitionSpeed: 1,

  // frames for a rotation from an [A,B] projection centered on A to an [A,A] projection centered on A, if A and B are antipodal
  framesForHalfRotation: 120,

  // frames of pause between rotations and transition
  framesPause: 10,

  // output directory
  outDir: 'client/data'
};

export async function generateStartTestImage(
  graph: Graph,
  vertexId: string,
  renderData: RenderData,
  fileName: string,
) {
  const from = graph.vertices[vertexId];
  const to = from;

  const { frames } = generateEdgeFramesV2(
    from,
    to,

    20,
    1,
  );
  const frame = frames.flat(3)[0];

  const additionalRenderData = await loadOverpassRenderData([frame], overpassLayerDefinitions);
  const allRenderData = [ ...renderData, ...additionalRenderData ];

  const proj = frame.projection;
  const clippedRenderData = clipRenderData(allRenderData, frame.boundingBox);
  const prerenderedData = renderIntermediateRepresentation(proj, clippedRenderData)// allRenderData);
  const img = render(frame, prerenderedData);

  await writeFile(fileName, img);
}

export async function handleGraphPregenerate(
  tempPath: string,
  graphFilePath: string,
  graphName: string,
  opts: Partial<typeof _generateFromGraphDefaultOptions> = {},
) {
  console.log(`Pre-generating frame definitions for graph ${graphName}.`);
  console.time(`Pre-generating frame definitions`);

  const options: typeof _generateFromGraphDefaultOptions = {
    ..._generateFromGraphDefaultOptions,
    ...opts,
  };

  const graph = await loadGraph(graphFilePath);

  // generate frame definitions
  const edges = graph.edges.map(([fromId, toId]) => {
    const from = graph.vertices[fromId];
    const to = graph.vertices[toId];
    const edgeId = edgeName(from, to);

    const { frames, metadata } = generateEdgeFramesV2(
      from,
      to,

      options.framesForHalfRotation,
      options.framesPause,
      options.transitionSpeed,
    );

    return { frames: frames, metadata, edgeId };
  });

  /// write temporary files
  const asJSON = edges.map(d => {
    const { frames, ...rest } = d;
    const framesJSON = frames.map(e => e.map(f => f.map(g => g.toJSON())));
    return { frames: framesJSON, ...rest };
  });
  const outFile = path.resolve(tempPath, 'edges.json');
  const metaOutFile = path.resolve(tempPath, 'metadata.json');

  const metadata = {
    ...options,
    createdAt: new Date().toISOString(),
    hostname: os.hostname(),
    user: os.userInfo().username,
    availableMemory: os.totalmem(),
  };

  await Promise.all([
    writeFile(outFile, JSON.stringify(asJSON), { encoding: 'utf-8' }),
    writeFile(metaOutFile, JSON.stringify(metadata), { encoding: 'utf-8' }),
  ]);
  console.timeEnd(`Pre-generating frame definitions`);
}


export async function handleGraphPreload(
  tempPath: string,
  graphFilePath: string,
  graphName: string,
) {
  console.log(`Pre-loading OpenStreetMap geometries for graph ${graphName}.`);
  console.time(`Pre-loading OpenStreetMap geometries for graph ${graphName}`);
  const graph = await loadGraph(graphFilePath);
  const edgeFile = path.resolve(tempPath, 'edges.json');
  const edgesString = await readFile(edgeFile, { encoding: 'utf-8' });
  const edgesJSON = JSON.parse(edgesString);
  const edges = edgesJSON.map(d => {
    const { frames: framesJSON, ...rest } = d;
    const frames = framesJSON.map(e => e.map(f => f.map(g => Frame.fromJSON(g))));
    return { frames, ...rest };
  });

  const osmDataMetadata = await preloadOverpassRenderData(edges, overpassLayerDefinitions);

  const outFile = path.resolve(tempPath, 'osm_metadata_per_edge.json');
  await writeFile(outFile, JSON.stringify(osmDataMetadata), { encoding: 'utf-8' });

  console.timeEnd(`Pre-loading OpenStreetMap geometries for graph ${graphName}`);
}


export async function handleGraphRender(
  tempPath: string,
  graphFilePath: string,
  graphName: string,
  index: number = 0,
): Promise<boolean> {
  const graph = await loadGraph(graphFilePath);
  const edgeFile = path.resolve(tempPath, 'edges.json');
  const edgesString = await readFile(edgeFile, { encoding: 'utf-8' });
  const edgesJSON = JSON.parse(edgesString);
  const edges = edgesJSON.map(d => {
    const { frames: framesJSON, ...rest } = d;
    const frames = framesJSON.map(e => e.map(f => f.map(g => Frame.fromJSON(g))));
    return { frames, ...rest };
  });
  const creationMetadata = JSON.parse(await readFile(path.resolve(tempPath, 'metadata.json'), { encoding: 'utf-8' }));

  const outDir = resolve(tempPath, 'out');
  await mkdir(outDir, { recursive: true });
  if (index === 0) {
    graph['$metadata'] = creationMetadata;
    await writeFile(resolve(outDir, 'graph.json'), JSON.stringify(graph), { encoding: 'utf-8' });
  }

  const numEdges = edges.length;
  if (index >= numEdges) {
    console.log('All edges rendered.');
    return false;
  }
  const message = `Rendering graph ${graphName}, edge ${index + 1} of ${numEdges}`;
  console.log(message);
  console.time(message);

  const edge = edges[index];
  const flatFrames = edge.frames.flat(3);

  const naturalEarthRenderData = await loadRenderData();
  const osmRenderData = await loadOverpassRenderDataForEdge(
    tempPath,
    edge.edgeId,
    flatFrames,
  );
  const allRenderData = [...naturalEarthRenderData, ...osmRenderData];

  await generateEdge(
    edge.frames,
    edge.metadata,
    outDir,
    allRenderData,
  );

  console.timeEnd(message);

  return true;
}


export async function handleGraphCommit(
  tempPath: string,
  graphFilePath: string,
  graphName: string,
) {
  console.log(`Committing graph ${graphName}.`);
  console.time(`Committing graph ${graphName}`);

  let i = 0;
  while (true) {
    try {
      const convertPath = resolve(tempPath, 'ffmpeg');
      const output = execSync(`pgrep -f ${convertPath}`, { encoding: 'utf-8' });
      const pids = output.split(/\s+/).filter(d => d.length);

      if (i % 20 === 0) console.timeLog(`Committing graph ${graphName}`, `Waiting for ${pids.length} ffmpeg processes to complete (${pids.join(', ')}).`);

      ++i;
      await new Promise<void>(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.timeLog(`Committing graph ${graphName}`, 'All ffmpeg processes completed.');
      break;
    }
  }

  const creationMetadata = JSON.parse(await readFile(path.resolve(tempPath, 'metadata.json'), { encoding: 'utf-8' }));

  const tempOutDir = resolve(tempPath, 'out');
  const targetOutDir = resolve(creationMetadata.outDir, graphName);

  await exec(`mkdir -p "${targetOutDir}"`);
  await exec(`rm -rf "${targetOutDir}"/*`);
  await exec(`cp "${tempOutDir}"/* "${targetOutDir}/"`);
  await exec(`rm -r "${tempPath}"`);

  const graphsData = await fs.readFile(path.resolve(creationMetadata.outDir, '..', 'graphs.json'), { encoding: 'utf-8' });
  const graphs = JSON.parse(graphsData) as Array<string>;
  if (!graphs.includes(graphName)) {
    console.log('Appending graph name to graph list.');
    graphs.push(graphName);
    await fs.writeFile(path.resolve(creationMetadata.outDir, '..', 'graphs.json'), JSON.stringify(graphs), { encoding: 'utf-8' });
  } else {
    console.warn('Graph already existed in graphs list.')
  }

  console.timeEnd(`Committing graph ${graphName}`);
}


// old implementation, do not use
export async function generateFromGraph(
  graph: Graph,
  renderData: RenderData,
  graphName: string,
  opts: Partial<typeof _generateFromGraphDefaultOptions> = {},
) {
  console.warn('WARNING: This function is deprecated and might easily lead to out-of-memory errors. Use the `handleGraph...` functions sequentially instead!');

  const options: typeof _generateFromGraphDefaultOptions = {
    ..._generateFromGraphDefaultOptions,
    ...opts,
  };

  // generate frame definitions
  const edges = graph.edges.map(edge => {
    const from = graph.vertices[edge[0]];
    const to = graph.vertices[edge[1]];
    const edgeId = edgeName(from, to);

    const { frames, metadata } = generateEdgeFrames(
      from, from.zoom,
      to, to.zoom,

      options.transitionSpeed,
      options.framesForHalfRotation,
      options.framesPause,
    );

    return { frames: frames, metadata, edgeId };
  });


  const allFrames = edges.map(d => d.frames).flat(3);
  const additionalRenderData = await loadOverpassRenderData(allFrames, overpassLayerDefinitions);

  const allRenderData = [ ...renderData, ...additionalRenderData ];

  const outDir = path.resolve(options.outDir, graphName);

  // create output directory
  try {
    await fs.mkdir(outDir, { recursive: true });
  } catch (err: any) {
    if (err.code != 'EEXISTS') throw err;
  }

  // generate frames for each edge
  const ffmpegPromises: Array<Promise<void>> = [];
  for (const edge of edges) {
    // return it like this so that the ZIP file creation and file IO can be waited for, but ffmpeg can continue to run asynchronously and waited for at the end
    /*const [promise] =*/ await generateEdge(
      edge.frames,
      edge.metadata,
      path.resolve(outDir),
      allRenderData,
    );
    ffmpegPromises.push(/*promise*/Promise.resolve());
  }

  await fs.writeFile(path.resolve(outDir, 'graph.json'), JSON.stringify(graph, null, 2), { encoding: 'utf8' });

  const graphsData = await fs.readFile(path.resolve(options.outDir, '..', 'graphs.json'), { encoding: 'utf-8' });
  const graphs = JSON.parse(graphsData) as Array<string>;
  if (!graphs.includes(graphName)) {
    console.log('Appending graph name to graph list.');
    graphs.push(graphName);
    await fs.writeFile(path.resolve(options.outDir, '..', 'graphs.json'), JSON.stringify(graphs), { encoding: 'utf-8' });
  } else {
    console.warn('Graph already existed in graphs list.')
  }

  await Promise.all(ffmpegPromises);
}

export function generateEdgeFramesV2(
  from: Vertex,
  to: Vertex,
  numFramesHalfRotation: number,
  numFramesBetweenPhases: number,
  transitionSpeed: number = 1,
) {
  const frameMetadata: any[] = [];

  // outer Array: grouped by clipping bounding box
  // middle Array: grouped by projection (for pre-rendering)
  // inner Array: Frames per projection
  const frames = new Array<Array<Array<Frame>>>();

  const p1 = from.coords;
  const p2 = to.coords;

  const proj = generateProjection([p1, p2]);

  const relativeDistance = geoDistance(p1, p2) / Math.PI;
  const numFramesRotation = Math.max(2, Math.round(relativeDistance * numFramesHalfRotation));

  const { scaleTranslate, duration } = generateTransitionV2(from, to);
  const recommendedFrames = Math.max(2, Math.ceil(60 * duration / 1000 * transitionSpeed));
  console.log(`Using ${recommendedFrames} frames (${Math.round(duration)}ms) for transition from "${from.label}" to "${to.label}" as per recommendation of van Wijk and Nuij.`);
  const numFramesMainTransition = recommendedFrames;

  const formatter = format('04d');

  const preRotationFrames = [ new Array<Frame>(), new Array<Frame>() ];
  // pre-rotation
  const interpolator = geoInterpolate(p1, p2);
  for (let n = 0; n < numFramesRotation; ++n) {
    const d = n / (numFramesRotation - 1);
    const pIntermediate = interpolator(easeCubicInOut(d));

    const proj = generateProjection([p1, pIntermediate]);
    const projectionNodes: Pair<Coordinate> = (n < numFramesRotation/2) ? [p1, p1] : [p1, p2];
    const actualProjection = generateProjection(projectionNodes);

    const azimuth1 = getAzimuth(proj, p1);
    const azimuth2 = getAzimuth(actualProjection, p1);
    const diffAzimuth = azimuth1 - azimuth2;

    const { scaleTranslate: actualScaleTranslate } = generateTransitionV2(from, (n < numFramesRotation/2) ? from : to);
    const { scale: actualScale, translate: actualTranslate } = actualScaleTranslate(0);

    const { scaleTranslate } = generateTransitionV2(from, { coords: pIntermediate, zoom: to.zoom, label: '', id: '' });
    const { scale, translate } = scaleTranslate(0);

    const index = n;

    frameMetadata.push({
      index,
      projection: 'tpeqd',
      projectionNodes: [p1, pIntermediate],
      scale,
      translate,
      azimuth: getAzimuth(actualProjection, p1) + diffAzimuth,
      center: p1,
    });

    const fmt = formatter(index);
    preRotationFrames[n < numFramesRotation/2 ? 0 : 1].push(new Frame(actualProjection, projectionNodes, actualScale, actualTranslate, from.id, index, fmt, null, diffAzimuth));
  }
  frames.push([preRotationFrames[0]]);

  // transition
  const transitionFrames = new Array<Frame>();
  transitionFrames.push(...preRotationFrames[1]);  // same projection

  for (let n = 0; n < numFramesMainTransition; ++n) {
    const d = n / (numFramesMainTransition - 1);
    const { scale, translate } = scaleTranslate(d);
    const proj = generateProjection([p1, p2]);

    const center = getCenter(proj, scale, translate);
    const azimuth = getAzimuth(proj, center ?? [0, 0]);

    const index = n + numFramesBetweenPhases + numFramesRotation;
    frameMetadata.push({
      index,
      projection: 'tpeqd',
      projectionNodes: [p1, p2],
      scale,
      translate,
      center,
      azimuth,
    });

    const fmt = formatter(index);
    transitionFrames.push(new Frame(proj, [p1, p2], scale, translate, n <= numFramesMainTransition/2 ? from.id : to.id, index, fmt, null));
  };

  // pauses
  const first = transitionFrames[0];
  for (let n = 0; n < numFramesBetweenPhases; ++n) {
    const { scale, translate } = scaleTranslate(0);
    const index = n + numFramesRotation;

    frameMetadata.push({
      index,
      projection: 'tpeqd',
      projectionNodes: [p1, p2],
      scale,
      translate,
      azimuth: getAzimuth(proj, p1),
      center: p1,
    });

    const fmt = formatter(index);
    transitionFrames.push(new Frame(first.projection, [p1, p2], first.scale, first.translate, from.id, index, fmt, null))
  }

  const last = transitionFrames[transitionFrames.length - 1];
  for (let n = 0; n < numFramesBetweenPhases; ++n) {
    const { scale, translate } = scaleTranslate(1);
    const index = n + numFramesBetweenPhases + numFramesRotation + numFramesMainTransition;

    frameMetadata.push({
      index,
      projection: 'tpeqd',
      projectionNodes: [p1, p2],
      scale,
      translate,
      azimuth: getAzimuth(proj, p2),
      center: p2,
    });

    const fmt = formatter(index);
    transitionFrames.push(new Frame(last.projection, [p1, p2], scale, translate, to.id, index, fmt, null))
  }

  const postRotationFrames = [ new Array<Frame>(), new Array<Frame>() ];
  // post-rotation
  for (let n = 0; n < numFramesRotation; ++n) {
    const d = n / (numFramesRotation - 1);
    const pIntermediate = interpolator(easeCubicInOut(d));

    const proj = generateProjection([p2, pIntermediate]);
    const projectionNodes: Pair<Coordinate> = (n < numFramesRotation/2) ? [p1, p2] : [p2, p2];
    const actualProjection = generateProjection(projectionNodes);

    const azimuth1 = getAzimuth(proj, p2);
    const azimuth2 = getAzimuth(actualProjection, p2);
    const diffAzimuth = azimuth1 - azimuth2;

    const { scaleTranslate: actualScaleTranslate } = generateTransitionV2((n < numFramesRotation/2) ? from : to, to);
    const { scale: actualScale, translate: actualTranslate } = actualScaleTranslate(1);

    const { scaleTranslate } = generateTransitionV2(to, { coords: pIntermediate, zoom: to.zoom, label: '', id: '' });
    const { scale, translate } = scaleTranslate(0);

    const index = n + 2 * numFramesBetweenPhases + numFramesRotation + numFramesMainTransition;
    frameMetadata.push({
      index,
      projection: 'tpeqd',
      projectionNodes: [p2, pIntermediate],
      scale,
      translate,
      azimuth: getAzimuth(actualProjection, p2) + diffAzimuth,
      center: p2,
    });

    const fmt = formatter(index);
    postRotationFrames[n < numFramesRotation/2 ? 0 : 1].push(new Frame(actualProjection, projectionNodes, actualScale, actualTranslate, to.id, index, fmt, null, diffAzimuth));
  }

  transitionFrames.push(...postRotationFrames[0]);
  frames.push([postRotationFrames[1]]);

  // group transition frames: OSM data frames at start, Natural Earth frames, OSM data frames at end
  transitionFrames.sort((a, b) => a.index - b.index);
  const firstIndex = transitionFrames.findIndex(d => d.zoom <= maxNaturalEarthZoom);
  const preNaturalEarthTransitionFrames = transitionFrames.splice(0, firstIndex);
  const secondIndex = transitionFrames.findIndex(d => d.zoom > maxNaturalEarthZoom);
  const naturalEarthTransitionFrames = transitionFrames.splice(0, secondIndex);
  frames.push([preNaturalEarthTransitionFrames], [naturalEarthTransitionFrames], [transitionFrames]);

  frameMetadata.sort((a, b) => a.index - b.index);

  const framesFiltered = frames.filter(d => d.flat(2).length);

  const metadata = {
    frames: frameMetadata,
    from,
    to,
    renderType: 'png',

    forwardFile: transitionName(from, to),
    backwardFile: transitionName(to, from),

    // frame distribution
    numFramesRotation,
    numFramesBetweenPhases,
    numFramesMainTransition,
    numFrames: 2 * numFramesRotation + 2 * numFramesBetweenPhases + numFramesMainTransition,
  };

  return { frames: framesFiltered, frameMetadata, metadata }
}

function generateEdgeFrames(
  from: Vertex,
  fromZoom: number,  // TODO: get from "from"
  to: Vertex,
  toZoom: number,  // TODO: get from "to"
  numFramesMainTransition: number,  // TODO: do not pass; use recommended. maybe a factor instead
  numFramesHalfRotation: number,
  numFramesBetweenPhases: number,
) {
  console.warn('WARNING: This function is deprecated. Use `generateEdgeFramesV2` instead!');
  const frameMetadata: any[] = [];

  // outer Array: grouped by clipping bounding box
  // middle Array: grouped by projection (for pre-rendering)
  // inner Array: Frames per projection
  const frames = new Array<Array<Array<Frame>>>();

  const p1 = from.coords;
  const p2 = to.coords;

  const proj = generateProjection([p1, p2]);
  const projOrig = generateProjection([p1, p2]);

  const relativeDistance = geoDistance(p1, p2) / Math.PI;
  const numFramesRotation = Math.max(2, Math.round(relativeDistance * numFramesHalfRotation));

  //const { position, scale: scaleFn } = generateTransition(proj, p1, p2, fromZoom, toZoom);
  const { scaleTranslate, duration } = generateTransitionV2(from, to);
  const recommendedFrames = Math.max(2, Math.ceil(60 * duration / 1000));
  console.log(`Using ${recommendedFrames} frames (${duration}ms) for transition from "${from.label}" to "${to.label}" as per recommendation of van Wijk and Nuij.`);
  numFramesMainTransition = recommendedFrames;

  const formatter = format('04d');

  const preRotationFrames = [ new Array<Frame>(), new Array<Frame>() ];
  // pre-rotation
  const interpolator = geoInterpolate(p1, p2);
  for (let n = 0; n < numFramesRotation; ++n) {
    const d = n / (numFramesRotation - 1);
    const pIntermediate = interpolator(easeCubicInOut(d));

    const proj = generateProjection([p1, pIntermediate]);
    const projectionNodes: Pair<Coordinate> = (n < numFramesRotation/2) ? [p1, p1] : [p1, p2];
    const actualProjection = generateProjection(projectionNodes);

    const azimuth1 = getAzimuth(proj, p1);
    const azimuth2 = getAzimuth(actualProjection, p1);
    const diffAzimuth = azimuth1 - azimuth2;

    const { scaleTranslate } = generateTransitionV2(from, (n < numFramesRotation/2) ? from : to);
    const { scale, translate } = scaleTranslate(0);
    const [x, y] = translate;
    const index = n;

    frameMetadata.push({
      index,
      projection: 'tpeqd',
      projectionNodes: [p1, pIntermediate],
      scale,
      translate,
      azimuth: getAzimuth(actualProjection, p1) + diffAzimuth,
      center: p1,
    });

    const fmt = formatter(index);
    preRotationFrames[n < numFramesRotation/2 ? 0 : 1].push(new Frame(actualProjection, projectionNodes, scale, [x, y], from.id, index, fmt, null, diffAzimuth));
  }
  frames.push([preRotationFrames[0]]);

  // transition
  const transitionFrames = new Array<Frame>();
  transitionFrames.push(...preRotationFrames[1]);  // same projection

  for (let n = 0; n < numFramesMainTransition; ++n) {
    const d = n / (numFramesMainTransition - 1);
    const { scale, translate } = scaleTranslate(d);
    const [x, y] = translate;
    const proj = generateProjection([p1, p2]);

    const center = projOrig.invert?.([x, y]);
    const azimuth = getAzimuth(proj, center ?? [0, 0]);

    const index = n + numFramesBetweenPhases + numFramesRotation;
    frameMetadata.push({
      index,
      projection: 'tpeqd',
      projectionNodes: [p1, p2],
      scale,
      translate,
      center,
      azimuth,
    });

    const fmt = formatter(index);
    transitionFrames.push(new Frame(proj, [p1, p2], scale, [x, y], n <= numFramesMainTransition/2 ? from.id : to.id, index, fmt, null));
  };

  // pauses
  const first = transitionFrames[0];
  for (let n = 0; n < numFramesBetweenPhases; ++n) {
    const { scale, translate } = scaleTranslate(0);
    const [x, y] = translate;
    const index = n + numFramesRotation;

    frameMetadata.push({
      index,
      projection: 'tpeqd',
      projectionNodes: [p1, p2],
      scale,
      translate,
      azimuth: getAzimuth(proj, p1),
      center: p1,
    });

    const fmt = formatter(index);
    transitionFrames.push(new Frame(first.projection, [p1, p2], first.scale, first.translate, from.id, index, fmt, null))
  }

  const last = transitionFrames[transitionFrames.length - 1];
  for (let n = 0; n < numFramesBetweenPhases; ++n) {
    const { scale, translate } = scaleTranslate(1);
    const [x, y] = translate;
    const index = n + numFramesBetweenPhases + numFramesRotation + numFramesMainTransition;

    frameMetadata.push({
      index,
      projection: 'tpeqd',
      projectionNodes: [p1, p2],
      scale,
      translate,
      azimuth: getAzimuth(proj, p2),
      center: p2,
    });

    const fmt = formatter(index);
    transitionFrames.push(new Frame(last.projection, [p1, p2], scale, [x, y], to.id, index, fmt, null))
  }

  const postRotationFrames = [ new Array<Frame>(), new Array<Frame>() ];
  // post-rotation
  for (let n = 0; n < numFramesRotation; ++n) {
    const d = n / (numFramesRotation - 1);
    const pIntermediate = interpolator(easeCubicInOut(d));

    const proj = generateProjection([p2, pIntermediate]);
    const projectionNodes: Pair<Coordinate> = (n < numFramesRotation/2) ? [p1, p2] : [p2, p2];
    const actualProjection = generateProjection(projectionNodes);

    const azimuth1 = getAzimuth(proj, p2);
    const azimuth2 = getAzimuth(actualProjection, p2);
    const diffAzimuth = azimuth1 - azimuth2;

    const { scaleTranslate } = generateTransitionV2((n < numFramesRotation/2) ? from : to, to);
    const { scale, translate } = scaleTranslate(1);
    const [x, y] = translate;

    const index = n + 2 * numFramesBetweenPhases + numFramesRotation + numFramesMainTransition;
    frameMetadata.push({
      index,
      projection: 'tpeqd',
      projectionNodes: [p2, pIntermediate],
      scale,
      translate,
      azimuth: getAzimuth(actualProjection, p2),
      center: p2,
    });

    const fmt = formatter(index);
    postRotationFrames[n < numFramesRotation/2 ? 0 : 1].push(new Frame(actualProjection, projectionNodes, scale, [x, y], to.id, index, fmt, null, diffAzimuth));
  }

  transitionFrames.push(...postRotationFrames[0]);
  frames.push([postRotationFrames[1]]);

  // group transition frames: OSM data frames at start, Natural Earth frames, OSM data frames at end
  transitionFrames.sort((a, b) => a.index - b.index);
  const firstIndex = transitionFrames.findIndex(d => d.zoom <= maxNaturalEarthZoom);
  const preNaturalEarthTransitionFrames = transitionFrames.splice(0, firstIndex);
  const secondIndex = transitionFrames.findIndex(d => d.zoom > maxNaturalEarthZoom);
  const naturalEarthTransitionFrames = transitionFrames.splice(0, secondIndex);
  frames.push([preNaturalEarthTransitionFrames], [naturalEarthTransitionFrames], [transitionFrames]);

  frameMetadata.sort((a, b) => a.index - b.index);

  const metadata = {
    frames: frameMetadata,
    from, fromZoom,
    to, toZoom,
    renderType: 'png',

    forwardFile: transitionName(from, to),
    backwardFile: transitionName(to, from),

    // frame distribution
    numFramesRotation,
    numFramesBetweenPhases,
    numFramesMainTransition,
    numFrames: 2 * numFramesRotation + 2 * numFramesBetweenPhases + numFramesMainTransition,
  };

  return { frames, frameMetadata, metadata }
}


async function generateEdge(
  frames: Array<Array<Array<Frame>>>,
  metadata: any,
  outDir: string,
  renderData: RenderData,
) {
  console.log(`Generating edge transition from "${metadata.from.label}" to "${metadata.to.label}".`);
  logTime(`[${metadata.from.id}-${metadata.to.id}] Rendering`, LogLevel.INFO);

  const zipFileName = `${edgeName(metadata.from, metadata.to)}.zip`;

  const zipFile = path.resolve(outDir, zipFileName);

  // temporary directory for frames
  const dateString = new Date().toISOString().replace(/[^0-9]/g, '');
  const day = dateString.slice(0, 8);
  const time = dateString.slice(8, 14);
  const tmpDir = await fs.mkdtemp(`/tmp/transition_${day}T${time}_${metadata.from.id}-${metadata.to.id}_`);

  const { length } = frames.flat(3);
  let count = 1;

  const zip = new JSZip();

  frames.forEach((frameBboxGroup, k, { length: frameBboxLength }) => {
    const allFrameBboxes = frameBboxGroup.flat(2).map(d => d.boundingBox);
    if (allFrameBboxes.length === 0) return;
    const bbox = unionBoundingBox(allFrameBboxes);

    logTime(`[${metadata.from.id}-${metadata.to.id} bbox ${k+1}] Clipping data to bounding box: ${bbox.toString()}`);
    const clippedRenderData = clipRenderData(renderData, bbox);
    logTimeEnd(`[${metadata.from.id}-${metadata.to.id} bbox ${k+1}] Clipping data to bounding box: ${bbox.toString()}`);

    frameBboxGroup.forEach((frameGroup, i) => {
      if (frameGroup.length === 0) return;

      const proj = frameGroup[0].projection;

      logTime(`  [${metadata.from.id}-${metadata.to.id} bbox ${k+1} group ${i+1}, ${frameGroup.length} members] Prerendering`);
      const prerenderedData = renderIntermediateRepresentation(proj, clippedRenderData);
      logTimeEnd(`  [${metadata.from.id}-${metadata.to.id} bbox ${k+1} group ${i+1}, ${frameGroup.length} members] Prerendering`);

      if (frameGroup.length > 1) logTime(`  [${metadata.from.id}-${metadata.to.id} bbox ${k+1} group ${i+1}, ${frameGroup.length} members] Rendering`);
      frameGroup.forEach(frame => {
        logTime(`    [${metadata.from.id}-${metadata.to.id} bbox ${k+1} group ${i+1}, ${frameGroup.length} members] Generated frame ${frame.name} (${count} of ${length})`);
        const img = render(frame, prerenderedData);

        // Write PNGs synchronously. Otherwise, the data stays in RAM until the
        // write promises are waited for and no other synchronous code is
        // running. Chunking the creating with setImmediate() could work, but
        // ultimately does not speed up anything.
        writeFileSync(path.resolve(tmpDir, `${frame.name}.png`), img);

        if (frame.index === 0) zip.file(`from.png`, img, { binary: true });
        if (frame.index === length - 1) zip.file(`to.png`, img, { binary: true });

        logTimeEnd(`    [${metadata.from.id}-${metadata.to.id} bbox ${k+1} group ${i+1}, ${frameGroup.length} members] Generated frame ${frame.name} (${count} of ${length})`);
        count++;

        if (count % 100 === 0) logTimeLog(`[${metadata.from.id}-${metadata.to.id}] Rendering`, LogLevel.INFO, `${count} of ${length} frames done.`);
      });
      if (frameGroup.length > 1) logTimeEnd(`  [${metadata.from.id}-${metadata.to.id} bbox ${k+1} group ${i+1}, ${frameGroup.length} members] Rendering`);
    });
  });

  zip.file(`metadata.json`, JSON.stringify(metadata));

  // spawn and detach ffmpeg video generation to ensure OSM map data can be garbage collected before the processes finish
  const command = `#!/usr/bin/env bash

set -euo pipefail

ffmpeg -nostdin -y -hide_banner -loglevel error -r 60 -f image2 -s ${CANVAS_SIZE}x${CANVAS_SIZE} -i ${tmpDir}/%04d.png -vcodec libvpx-vp9 -crf ${videoCrf} -pix_fmt yuv420p ${outDir}/${metadata.forwardFile}
ffmpeg -nostdin -y -hide_banner -loglevel error -i ${outDir}/${metadata.forwardFile} -r 60 -vcodec libvpx-vp9 -crf ${videoCrf} -pix_fmt yuv420p -vf reverse ${outDir}/${metadata.backwardFile}
rm -rf ${tmpDir}`;
  const filename = resolve(outDir, '..', `ffmpeg__${metadata.from.id}-${metadata.to.id}.sh`);
  await writeFile(filename, command, { encoding: 'utf-8', mode: 0o700, });
  const process = spawn(
    filename,
    {
      detached: true,
      stdio: 'ignore',
      shell: true,
    });
  process.unref();

  await new Promise<void>(resolve => {
    zip.generateNodeStream({ streamFiles: true, compression: 'DEFLATE', type: 'nodebuffer' })
      .pipe(createWriteStream(zipFile))
      .on('finish', () => resolve());
  });

  logTimeEnd(`[${metadata.from.id}-${metadata.to.id}] Rendering`, LogLevel.INFO);
}