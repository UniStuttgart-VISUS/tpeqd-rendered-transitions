import { readFile } from 'fs/promises';

import type { Polygon } from 'geojson';
import { flatGroup } from 'd3';

import type { OverpassLayerDefinition, RenderData, PartialRenderLayer, CanvasRendererAttributes } from '../common/datatypes';
import { maxNaturalEarthZoom } from '../common/constants';
import * as style from './styles';


// boundaries from where 10m, 50m, 110m Natural Earth features will be used
const lodZoomLevelSwitches = [maxNaturalEarthZoom, 5, 2, -Infinity];

// minimal zoom level at which borders are visible
const minZoomBorders = 2;


export const overpassLayerDefinitions: Array<OverpassLayerDefinition> = [
  {
    layerName: 'major ferries',
    minZoom: maxNaturalEarthZoom,

    ...style.ferry,

    overpassQuery: `(
      way[route=ferry][motor_vehicle=yes];
      relation[route=ferry][motor_vehicle=yes];
    );`,
    validGeometries: ['LineString', 'MultiLineString'],
  },
  {
    layerName: 'minor ferries',
    minZoom: 12,

    ...style.ferry,

    overpassQuery: `(
      way[route=ferry][!motor_vehicle];
      way[route=ferry][motor_vehicle!=yes];
      relation[route=ferry][!motor_vehicle];
      relation[route=ferry][motor_vehicle!=yes];
    );`,
    validGeometries: ['LineString', 'MultiLineString'],
  },

  {
    layerName: 'railway',
    minZoom: maxNaturalEarthZoom,

    ...style.railroads,

    overpassQuery: `(
      way[railway=rail][!tunnel];
      relation[railway=rail][!tunnel];
    );`,
    validGeometries: ['LineString', 'MultiLineString'],
  },

  {
    layerName: 'motorways',
    minZoom: maxNaturalEarthZoom,

    ...style.motorwayRoad,

    overpassQuery: '( nwr[highway~"motorway|motorway_link"]; );',
    validGeometries: ['LineString', 'MultiLineString'],
  },
  {
    layerName: 'major roads',
    minZoom: 11,

    ...style.majorRoad,

    overpassQuery: '( nwr[highway~"trunk|primary|trunk_link|primary_link"]; );',
    validGeometries: ['LineString', 'MultiLineString'],
  },
  {
    layerName: 'minor roads',
    minZoom: 12,

    ...style.mainRoad,

    overpassQuery: '( nwr[highway~"secondary|tertiary|secondary_link|tertiary_link"]; );',
    validGeometries: ['LineString', 'MultiLineString'],
  },
  {
    layerName: 'residential roads',
    minZoom: 13,

    ...style.residentialRoad,

    overpassQuery: '( nwr[highway~"unclassified|residential|living_street|service"]; );',
    validGeometries: ['LineString', 'MultiLineString'],
  },
  {
    layerName: 'tracks',
    minZoom: 14,

    ...style.trackRoad,

    overpassQuery: '( nwr[highway=track]; nwr[highway=pedestrian]; );',
    validGeometries: ['LineString', 'MultiLineString'],
  },
  {
    layerName: 'paths',
    minZoom: 15,

    ...style.pathRoad,

    overpassQuery: `(
      way[highway=path];
      way[highway=bridleway];
      way[highway=steps];
      way[highway=footway];
      relation[highway=path];
      relation[highway=bridleway];
      relation[highway=steps];
      relation[highway=footway];
    );`,
    validGeometries: ['LineString', 'MultiLineString'],
  },

  {
    layerName: 'forest',
    minZoom: maxNaturalEarthZoom,

    ...style.forests,

    overpassQuery: '( nwr[natural=wood]; nwr[landuse=forest]; );',
    validGeometries: ['Polygon', 'MultiPolygon'],
  },

  {
    layerName: 'oceans and seas',
    minZoom: maxNaturalEarthZoom,

    ...style.lakes,

    // use cached OSM shapefile with water bodies instead of Overpass here
    overpassQuery: `oceans from file`,
    validGeometries: ['Polygon', 'MultiPolygon'],
  },
  {
    layerName: 'large water bodies',
    minZoom: maxNaturalEarthZoom,

    ...style.lakes,

    overpassQuery: `(
      way[natural=water][!water];
      way[natural=bay];
      way[natural=water][water~"lake|river|oxbow|cenote|basin"];
      relation[natural=water][!water];
      relation[natural=bay];
      relation[natural=water][water~"lake|river|oxbow|cenote|basin"];
    );`,
    validGeometries: ['Polygon', 'MultiPolygon'],
  },
  {
    layerName: 'small water bodies',
    minZoom: 12,

    ...style.lakes,

    overpassQuery: `(
      way[natural=water][water~"stream|stream_pool|rapids|canal|lock|pond|reflecting_pool|reservoir|waste_water|moat|harbour"];
      relation[natural=water][water~"stream|stream_pool|rapids|canal|lock|pond|reflecting_pool|reservoir|waste_water|moat|harbour"];
    );`,
    validGeometries: ['Polygon', 'MultiPolygon'],
  },

  {
    layerName: 'rivers',
    minZoom: maxNaturalEarthZoom,

    ...style.rivers,

    overpassQuery: `(
      way[waterway=river];
      relation[waterway=river];
    );`,
    validGeometries: ['LineString', 'MultiLineString'],
  },
  {
    layerName: 'streams',
    minZoom: 10,

    ...style.rivers,

    overpassQuery: `(
      way[waterway=stream][!tunnel];
      way[waterway=canal][!tunnel];
      way[waterway=tidal_channel];
      relation[waterway=stream][!tunnel];
      relation[waterway=canal][!tunnel];
      relation[waterway=tidal_channel];
    );`,
    validGeometries: ['LineString', 'MultiLineString'],
  },
  {
    layerName: 'other waterways',
    minZoom: 12,

    ...style.rivers,

    overpassQuery: `(
      way[waterway=drain][!tunnel];
      way[waterway=ditch][!tunnel];
      relation[waterway=drain][!tunnel];
      relation[waterway=ditch][!tunnel];
    );`,
    validGeometries: ['LineString', 'MultiLineString'],
  },


  {
    layerName: 'urban areas',
    minZoom: maxNaturalEarthZoom,

    ...style.urbanAreas,

    overpassQuery: `(
      way[landuse~"commercial|construction|education|fairground|industrial|residential|retail|institutional"];
      relation[landuse~"commercial|construction|education|fairground|industrial|residential|retail|institutional"];
    );`,
    validGeometries: ['Polygon', 'MultiPolygon'],
  },

  {
    layerName: 'agriculture',
    minZoom: maxNaturalEarthZoom,

    ...style.agricultural,

    overpassQuery: `(
      way[landuse~"allotments|farmland|farmyard|paddy|animal_keeping|flowerbed|orchard|plant_nursery|vineyard"];
      relation[landuse~"allotments|farmland|farmyard|paddy|animal_keeping|flowerbed|orchard|plant_nursery|vineyard"];
    );`,
    validGeometries: ['Polygon', 'MultiPolygon'],
  },

  {
    layerName: 'park',
    minZoom: maxNaturalEarthZoom,

    ...style.park,

    overpassQuery: `(
      way[landuse~"recreation_ground|village_green|cemetery"];
      way[leisure~"garden|park"];
      way[leisure=garden];
      relation[landuse~"recreation_ground|village_green|cemetery"];
      relation[leisure~"garden|park"];
      relation[leisure=garden];
    );`,
    validGeometries: ['Polygon', 'MultiPolygon'],
  },

  {
    layerName: 'protected areas',
    minZoom: maxNaturalEarthZoom,

    ...style.specialUrbanAreas,

    overpassQuery: `(
      way[landuse=military];
      way[aerodrome];
      relation[landuse=military];
      relation[aerodrome];
    );`,
    validGeometries: ['Polygon', 'MultiPolygon'],
  },

  {
    layerName: 'buildings',
    minZoom: 14,

    ...style.buildings,

    overpassQuery: `(
      way[building](if:is_closed());
      relation[building](if:is_closed());
    );`,
    validGeometries: ['Polygon', 'MultiPolygon'],
  },

  {
    layerName: 'admin 0 boundaries',
    minZoom: maxNaturalEarthZoom,

    ...style.admin0Border,

    overpassQuery: `(
      way[boundary=administrative][admin_level=2];
      relation[boundary=administrative][admin_level=2];
    );`,
    validGeometries: ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'],
  },

  {
    layerName: 'admin 0 contested boundaries',
    minZoom: maxNaturalEarthZoom,

    ...style.admin0ContestedBorder,

    overpassQuery: `(
      way[boundary=disputed];
      relation[boundary=disputed];
    );`,
    validGeometries: ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'],
  },

  {
    layerName: 'admin 1 boundaries',
    minZoom: maxNaturalEarthZoom,

    ...style.admin1Border,

    overpassQuery: `(
      way[boundary=administrative][admin_level=4];
      relation[boundary=administrative][admin_level=4];
    );`,
    validGeometries: ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'],
  },

  {
    layerName: 'admin 2 boundaries',
    minZoom: 12,

    ...style.admin2Border,

    overpassQuery: `(
      way[boundary=administrative][admin_level=5];
      relation[boundary=administrative][admin_level=5];
    );`,
    validGeometries: ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'],
  },

  {
    layerName: 'admin 3 boundaries',
    minZoom: 15,

    ...style.admin2Border,

    overpassQuery: `(
      way[boundary=administrative][admin_level=6];
      relation[boundary=administrative][admin_level=6];
    );`,
    validGeometries: ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'],
  },

  {
    layerName: 'protected areas',
    minZoom: maxNaturalEarthZoom,

    ...style.nationalParks,

    overpassQuery: `(
      way[boundary=protected_area](if:is_closed());
      relation[boundary=protected_area](if:is_closed());
    );`,
    validGeometries: ['Polygon', 'MultiPolygon'],
  },

  {
    layerName: 'glaciers',
    minZoom: maxNaturalEarthZoom,

    ...style.glaciatedAreas,

    overpassQuery: `(
      way[natural=glacier];
      relation[natural=glacier];
    );`,
    validGeometries: ['Polygon', 'MultiPolygon'],
  },

  {
    layerName: 'reefs',
    minZoom: maxNaturalEarthZoom,

    ...style.reefs,

    overpassQuery: `(
      way[natural=reef];
      relation[natural=reef];
    );`,
    validGeometries: ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'],
  },

  /// we probably do not need this anymore, with the new OSM water shapefile
  /*
  {
    layerName: 'landmass',
    minZoom: maxNaturalEarthZoom,

    ...style.osmLandmass,

    overpassQuery: `(
      way[boundary=land_area];
      way[place=island];
      way[place=islet];
      way[natural=peninsula];
      way[natural=isthmus];
      way[natural=cape];
      way[natural=coast_line](if:is_closed());
      relation[boundary=land_area];
      relation[place=island];
      relation[place=islet];
      relation[natural=peninsula];
      relation[natural=isthmus];
      relation[natural=cape];
      relation[natural=coast_line](if:is_closed());
    );`,
    validGeometries: ['Polygon', 'MultiPolygon'],
  },
  */
];

const naturalEarthLayerDefinitions: Array<RenderDataLayerDefinition> = [
  // landmass
  {
    naturalEarthFileName: 'land',
    levelsOfDetail: [10, 50, 110],

    properties: {
      ...style.landmass,
    },
  },


  // glaciated areas
  {
    naturalEarthFileName: 'glaciated_areas',
    levelsOfDetail: [10, 50, 110],

    properties: {
      ...style.glaciatedAreas,
    },
  },

  // antarctic ice shelves
  {
    naturalEarthFileName: 'antarctic_ice_shelves_polys',
    levelsOfDetail: [10, 50],

    properties: {
      ...style.antarcticIceShelves,
    },
  },

  // should be over urban areas, but under roads
  // rivers
  {
    naturalEarthFileName: 'rivers_lake_centerlines',
    levelsOfDetail: [10, 50, 110],

    properties: {
      ...style.rivers,
    },
  },

  // should be over urban areas, but under roads
  // lakes
  {
    naturalEarthFileName: 'lakes',
    levelsOfDetail: [10, 50, 110],

    properties: {
      ...style.lakes,
    },
  },

  // reefs
  {
    naturalEarthFileName: 'reefs',
    levelsOfDetail: [10],

    properties: {
      ...style.reefs,
    },
  },

  ///// -------------- overlay features --------------

  // urban areas
  {
    naturalEarthFileName: 'urban_areas',
    levelsOfDetail: [10, 50],

    properties: {
      ...style.urbanAreas,
    },
  },

  // national parks
  {
    naturalEarthFileName: 'parks_and_protected_lands_area',
    levelsOfDetail: [10],

    properties: {
      ...style.nationalParks,
    },

    minZoomKey: 'scalerank',
  },

  // railroads
  {
    naturalEarthFileName: 'railroads',
    levelsOfDetail: [10],

    properties: {
      ...style.railroads,
    },

    minZoomKey: 'scalerank',
  },

  // roads
  {
    naturalEarthFileName: 'roads',
    levelsOfDetail: [10],

    properties: {
      zIndex: style.mainRoad.zIndex,  // XXX
    },

    additionalKey: 'featurecla',
    additionalPropertyFn: (s) => {
      if (s === 'Ferry') {
        return {
          ...style.ferry,
        };
      }

      return {
        ...style.mainRoad,
      };
    },
  },

  // borders
  {
    naturalEarthFileName: 'admin_0_boundary_lines_land',
    levelsOfDetail: [10, 50, 110],
    totalMinZoom: minZoomBorders,

    properties: {
      ...style.admin0Border,
    },
  },
  {
    naturalEarthFileName: 'admin_1_states_provinces_lines',
    levelsOfDetail: [10, 50, 110],
    totalMinZoom: minZoomBorders,

    properties: {
      ...style.admin1Border,
    },
  },
  {
    naturalEarthFileName: 'admin_0_boundary_lines_disputed_areas',
    levelsOfDetail: [10, 50],
    totalMinZoom: minZoomBorders,

    properties: {
      ...style.admin0ContestedBorder,
    },
  },

  // populated places
  {
    naturalEarthFileName: 'populated_places',
    levelsOfDetail: [10, 50, 110],
  
    properties: {
      ...style.populatedPlaces,
    },
  },
];

async function naturalEarth(label: string): Promise<GeoJSON.FeatureCollection> {
  const fileContent = await readFile(`data/${label}.json`, { encoding: 'utf8' });
  const data = JSON.parse(fileContent) as GeoJSON.FeatureCollection;
  return data;
}


type RenderDataTemplate = Omit<PartialRenderLayer, 'data'>;
interface RenderDataLayerDefinition {
  properties: RenderDataTemplate;
  naturalEarthFileName: string;
  levelsOfDetail: [10] | [10, 50] | [10, 50, 110];
  totalMinZoom?: number;
  minZoomKey?: string;
  additionalKey?: string;
  additionalPropertyFn?: (key: string | null) => Partial<CanvasRendererAttributes>;
};


export async function loadRenderData(): Promise<RenderData> {
  const renderData: RenderData = [
    // ocean
    {
      data: { type: 'Sphere' },

      ...style.ocean,
    },

    // horizon
    {
      data: { type: 'Sphere' },

      ...style.horizon,
    },
  ];

  const promises = naturalEarthLayerDefinitions.map(async def => {
    const data = await Promise.all(def.levelsOfDetail.map(async (d: number) => naturalEarth(`ne_${d}m_${def.naturalEarthFileName}`)));
    data.forEach((datum, i) => {
      const minZoomLayer = lodZoomLevelSwitches[i+1];
      const maxZoom = lodZoomLevelSwitches[i];

      const byZoom = flatGroup(datum.features,
        d => d.properties?.[def.minZoomKey ?? 'min_zoom'],
        d => def.additionalKey ? d.properties?.[def.additionalKey] : null,
      );
      byZoom.forEach(([minZoom_, additionalKey, data], j, arr) => {
        const minZoom = Math.max(    // largest minZoom wins
          minZoom_,                  // given by data
          minZoomLayer,              // given by level of detail
          def.totalMinZoom ?? -Infinity,    // optional, given by layer definition
        );

        if (minZoom >= maxZoom) return;

        // fix wrongly-winded polygon in glaciated areas data
        if (i === 0 && def.naturalEarthFileName === 'glaciated_areas') {
          const elem = data.find(d => d.properties?.recnum === 2014);
          if (elem) {
            (elem.geometry as Polygon).coordinates?.[0].reverse();
          }
        }

        const additionalProperties = def.additionalPropertyFn?.(additionalKey) ?? {};

        renderData.push({
          ...def.properties,
          minZoom, maxZoom,

          data: { type: 'FeatureCollection', features: data },

          ...additionalProperties,
        });
      });
    });
  });


  await Promise.all(promises);
  return renderData;
}