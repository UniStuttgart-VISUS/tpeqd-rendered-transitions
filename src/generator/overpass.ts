import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { execSync, exec as execWithCallbacks } from 'node:child_process';
import { promisify } from 'node:util';

import type { OverpassElement, OverpassWay, OverpassNode, OverpassJson, OverpassRelation, OverpassRelationMember } from 'overpass-ts';
import { overpassXml, overpassJson } from 'overpass-ts';
import { flatGroup, geoMercator, geoPath, group, max, range } from 'd3';
import type { LineString, FeatureCollection, Feature } from 'geojson';
import osmtogeojson from 'osmtogeojson';
import { DOMParser } from '@xmldom/xmldom';
import rewind from '@turf/rewind';
import intersect from '@turf/intersect';

import BoundingBox, { unionBoundingBox } from './bounding-box';
import render, { renderIntermediateRepresentation } from './render';
import { CANVAS_SIZE, maxNaturalEarthZoom } from '../common/constants';
import Frame from './frame';
import type { Coordinate, GeoJsonGeometryType, OverpassLayerDefinition, RenderData, Vertex } from '../common/datatypes';
import { generateProjection } from '../common/generate-projection';
import { scaleFactor, scaleToZoom, zoomToScale } from '../common/utils';
import * as style from './styles';
import { generateTransitionV2 } from './generate-transition';
import { loadRenderData, overpassLayerDefinitions } from './render-layer-definitions';
import { logTime, logTimeEnd } from './logger';

const exec = promisify(execWithCallbacks);

const overpassOptions = {
  endpoint: 'http://localhost:27080/api/interpreter',
};

const oceanPromise = new Promise<FeatureCollection>(async (resolve) => {
  const data = await readFile('data/ne_10m_ocean.json', { encoding: 'utf-8' });
  resolve(JSON.parse(data));
});

// TODO: use OSM coastline data:
/// https://osmdata.openstreetmap.de/data/land-polygons.html
/// or
/// https://osmdata.openstreetmap.de/data/water-polygons.html


export async function loadOverpass(
  query: string,
  boundingBox: BoundingBox,
  description: string,
): Promise<FeatureCollection> {
  console.warn('WARNING: This function is deprecated. Use `loadOverpassV2` instead!');
  // generate name and hash
  const hash = createHash('md5');
  hash.update(query);
  hash.update(boundingBox.toString());
  hash.update(description);

  const filename = `cache/${hash.digest('hex')}__${boundingBox.toString().replace(/[:,]/g, '_')}__${description.replace(/[^a-zA-Z0-9]/g, '_')}.geojson`;
  if (!existsSync('cache')) mkdirSync('cache');

  if (existsSync(filename)) {
    console.log(`Retrieving cached version of "${description}" for bbox:${boundingBox}.`);

    const data = await readFile(filename, { encoding: 'utf-8' });
    return JSON.parse(data);
  } else {
    console.log(`Data for "${description}" for bbox:${boundingBox} does not exist locally, querying Overpass API.`);

    const response = await overpassXml(`[out:xml][bbox:${boundingBox.toString()}];${query}out geom;`, overpassOptions);
    const dom = new DOMParser().parseFromString(response, 'application/xml');
    const geoJson = osmtogeojson(dom);

    await writeFile(filename, JSON.stringify(geoJson), { encoding: 'utf-8' });
    return geoJson;
  }
}

export async function loadOverpassV2(
  query: string,
  boundingBox: BoundingBox,
  description: string,
): Promise<string> {
  // generate name and hash
  const hash = createHash('md5');
  hash.update(query);
  hash.update(boundingBox.toString());
  hash.update(description);

  const filename = `cache/${hash.digest('hex')}__${boundingBox.toString().replace(/[:,]/g, '_')}__${description.replace(/[^a-zA-Z0-9]/g, '_')}.geojson`;
  if (!existsSync('cache')) mkdirSync('cache');

  if (existsSync(filename)) {
    console.debug(`Retrieving cached version of "${description}" for bbox:${boundingBox}.`);
    return filename;
  } else {
    if (query === 'oceans from file') {
      console.debug(`Data for "${description}" for bbox:${boundingBox} does not exist locally, extracting from shapefile.`);

      const bbox = boundingBox.toOGRString();
      await exec(
        [
          'ogr2ogr',
          '-of', 'GeoJSON',
          '-t_srs', 'crs:84',
          '-clipsrc', bbox,
          '-spat', bbox,
          filename,
          'data/osm_water_polygons.shp',
        ].join(' '),
      );
    } else {
      console.debug(`Data for "${description}" for bbox:${boundingBox} does not exist locally, querying Overpass API.`);

      const response = await overpassXml(`[out:xml][bbox:${boundingBox.toString()}];${query}out geom;`, overpassOptions);
      const dom = new DOMParser().parseFromString(response, 'application/xml');
      const geoJson = osmtogeojson(dom);

      await writeFile(filename, JSON.stringify(geoJson), { encoding: 'utf-8' });
    }

    return filename;
  }
}


export async function testOverpass() {
  const p1: Coordinate = [9.1044, 48.7293];
  const p2: Coordinate = [12.6, 55.7];
  const v1: Vertex = { coords: p1, zoom: 14, id: 'str', label: 'Stuttgart' };
  const v2: Vertex = { coords: p2, zoom: 14, id: 'cph', label: 'Copenhagen' };

  const proj = generateProjection([p1, p1]);
  const { scaleTranslate } = generateTransitionV2(v1, v2)

  const { scale, translate } = scaleTranslate(0);

  const frame = new Frame(proj, [p1, p2], scale, translate, 'str', 0, '', null);
  const additionalRenderData = await loadOverpassRenderData([frame], overpassLayerDefinitions);

  const prerenderedFeatures = renderIntermediateRepresentation(
    proj,
    [
      {
        data: { type: 'Sphere' },
        ...style.ocean,
      },
      ...(await loadRenderData()),
      ...additionalRenderData,
    ],

  )

  logTime('render');
  const rendered = render(
    frame,
    prerenderedFeatures,
  );
  logTimeEnd('render');

  await writeFile(`out.png`, rendered, 'binary');
}


export async function loadOverpassRenderData(
  frames: Array<Frame>,
  layerDefinitions: Array<OverpassLayerDefinition>,
): Promise<RenderData> {
  const renderData: RenderData = [];

  for (const layerDefinition of layerDefinitions) {
    const { overpassQuery, layerName, validGeometries, ...attributes } = layerDefinition;

    const relevantFrames = frames.filter(d => d.zoom >= layerDefinition.minZoom);

    // group by key (around graph nodes) to optimize bounding boxes
    const byKey = flatGroup(relevantFrames, d => d.key);

    for (const [key, framesForKey] of byKey) {
      const bbox = unionBoundingBox(framesForKey.map(d => d.boundingBox));

      const filename = await loadOverpassV2(
        overpassQuery,
        bbox,
        layerName
      );
      const data = JSON.parse(await readFile(filename, { encoding: 'utf-8' }));

      data.features = data.features
        .filter(d => (validGeometries as Array<string>).includes(d.geometry.type));

      data.features.forEach(d => {
        if (d.geometry.type === 'Polygon' || d.geometry.type === 'MultiPolygon') d.geometry = rewind(d.geometry, { reverse: true });
      });

      data.features.forEach(feature => {
        renderData.push({
          ...attributes,
          data: feature,
        });
      });
    }
  }

  // get ocean or land background for zoomed-in areas
  const relevantFrames = frames.filter(d => d.zoom >= maxNaturalEarthZoom);
  const byKey = flatGroup(relevantFrames, d => d.key);

  for (const [key, framesForKey] of byKey) {
    const bbox = unionBoundingBox(framesForKey.map(d => d.boundingBox));
    const bboxGeometry = bbox.asPolygon();
    //const oceanIntersection = intersect((await oceanPromise).features[0] as any, bboxGeometry);

    const bboxFeature = { type: 'Feature', properties: {}, geometry: rewind(bboxGeometry, { reverse: true })};
    // always put some ocean down, the Sphere seems to have problems with clipping in some cases
    renderData.push({
      data: bboxFeature,
      ...style.ocean,
    })

    //if (oceanIntersection === null) {
      //console.log('adding landmass patch for osm', frames)
      renderData.push({
        data: bboxFeature,
        ...style.osmLandmass,
        minZoom: maxNaturalEarthZoom,
      });
    //}
  }

  return renderData;
}


export async function preloadOverpassRenderData(
  edges: Array<{ edgeId: string, frames: Array<Array<Array<Frame>>>, metadata: any }>,
  layerDefinitions: Array<OverpassLayerDefinition>,
): Promise<any> {
  const frames = edges.flatMap(d => d.frames.flat(3));
  const definitionsPerKey = {};

  for (const layerDefinition of layerDefinitions) {
    const { overpassQuery, layerName, validGeometries, ...attributes } = layerDefinition;

    const relevantFrames = frames.filter(d => d.zoom >= layerDefinition.minZoom);

    // group by key (around graph nodes) to optimize bounding boxes
    const byKey = flatGroup(relevantFrames, d => d.key);

    for (const [key, framesForKey] of byKey) {
      const bbox = unionBoundingBox(framesForKey.map(d => d.boundingBox));


      const filename = await loadOverpassV2(
        overpassQuery,
        bbox,
        layerName
      );

      if (!definitionsPerKey[key]) definitionsPerKey[key] = [];

      definitionsPerKey[key].push({
        ...layerDefinition,
        filename,
      });
    }
  }

  const definitionsPerEdge = {};
  edges.forEach(edge => {
    definitionsPerEdge[edge.edgeId] = [edge.metadata.from, edge.metadata.to].flatMap(v => definitionsPerKey[v.id]);
  });

  return definitionsPerEdge;
}

export async function loadOverpassRenderDataForEdge(
  tempPath: string,
  edgeId: string,
  frames: Array<Frame>,
): Promise<RenderData> {
  const renderData: RenderData = [];

  const osmMetadata = JSON.parse(await readFile(resolve(tempPath, 'osm_metadata_per_edge.json'), { encoding: 'utf-8' }));
  const metadataForEdge = osmMetadata[edgeId];

  for (const layerDefinition of metadataForEdge) {
    const { overpassQuery, layerName, validGeometries, filename, ...attributes } = layerDefinition;
    const data = JSON.parse(await readFile(filename, { encoding: 'utf-8' }));

    data.features = data.features
      .filter(d => (validGeometries as Array<string>).includes(d.geometry.type));
    data.features.forEach(d => {
      if (d.geometry.type === 'Polygon' || d.geometry.type === 'MultiPolygon') d.geometry = rewind(d.geometry, { reverse: true });
    });

    data.features.forEach(feature => {
      renderData.push({
        ...attributes,
        data: feature,
      });
    });
  }

  // get ocean or land background for zoomed-in areas
  const relevantFrames = frames.filter(d => d.zoom >= maxNaturalEarthZoom);
  const byKey = flatGroup(relevantFrames, d => d.key);

  for (const [key, framesForKey] of byKey) {
    const bbox = unionBoundingBox(framesForKey.map(d => d.boundingBox));
    const bboxGeometry = bbox.asPolygon();
    //const oceanIntersection = intersect((await oceanPromise).features[0] as any, bboxGeometry);

    const bboxFeature = { type: 'Feature', properties: {}, geometry: rewind(bboxGeometry, { reverse: true })};
    // always put some ocean down, the Sphere seems to have problems with clipping in some cases
    renderData.push({
      data: bboxFeature,
      ...style.ocean,
    })

    //if (oceanIntersection === null) {
      //console.log('adding landmass patch for osm', key, framesForKey[0].index, framesForKey[framesForKey.length - 1].index)
      renderData.push({
        data: bboxFeature,
        ...style.osmLandmass,
        minZoom: maxNaturalEarthZoom,
      });
    /*} else {
      console.log('not adding landmass patch for osm', key, framesForKey[0].index, framesForKey[framesForKey.length - 1].index)
    }*/
  }

  return renderData;
}