import type { StylingAttributes } from "../common/datatypes";

const waterColor = 'powderblue';

// background ocean
export const ocean: StylingAttributes = {
  zIndex: 0,

  strokeStyle: 'none',
  fillStyle: waterColor,
  lineWidth: 0,
};

export const horizon: StylingAttributes = {
  zIndex: 100,

  strokeStyle: 'black',
  fillStyle: 'none',
  lineWidth: 2,
};

export const landmass: StylingAttributes = {
  zIndex: 1,

  strokeStyle: '#555',
  fillStyle: 'lightgreen',
  lineWidth: 1,
};

export const osmLandmass: StylingAttributes = {
  zIndex: 1,

  strokeStyle: '#555',
  fillStyle: '#f4f3de',
  lineWidth: 1,
};

export const glaciatedAreas: StylingAttributes = {
  zIndex: 2,

  strokeStyle: '#0b728a',
  fillStyle: '#cfe8ef',
  lineWidth: 1,
};

export const antarcticIceShelves: StylingAttributes = {
  zIndex: 3,

  strokeStyle: '#518693',
  fillStyle: '#dfecef',
  lineWidth: 1,
};

export const reefs: StylingAttributes = {
  zIndex: 6,

  strokeStyle: '#334070',
  fillStyle: 'none',
  lineWidth: 1,
};

export const forests: StylingAttributes = {
  zIndex: 17,

  strokeStyle: 'none',
  fillStyle: '#87c17a',
};

export const rivers: StylingAttributes = {
  zIndex: 18,

  strokeStyle: 'none',
  fillStyle: 'none',
};

export const lakes: StylingAttributes = {
  zIndex: 19,

  strokeStyle: 'none',
  fillStyle: waterColor,
};

//// --- overlay features ---

export const urbanAreas: StylingAttributes = {
  zIndex: 11,

  strokeStyle: 'none',
  fillStyle: '#d1caba',
};
export const agricultural: StylingAttributes = {
  zIndex: 10,

  strokeStyle: 'none',
  fillStyle: '#c7d175',
};
export const park: StylingAttributes = {
  zIndex: 11,

  strokeStyle: 'none',
  fillStyle: '#d3f4a1',
};

// e.g., military, airports, ...
export const specialUrbanAreas: StylingAttributes = {
  zIndex: 12,

  strokeStyle: 'b24b13',
  lineWidth: 1,
  fillStyle: 'rgba(224, 93, 22, 0.3)',
};

export const buildings: StylingAttributes = {
  zIndex: 28,

  strokeStyle: 'none',
  fillStyle: '#7c7c7c',
};

export const nationalParks: StylingAttributes = {
  zIndex: 19,

  strokeStyle: '#062a03',
  fillStyle: 'rgba(151, 252, 136, 0.15)',
};

// main roads: all roads from NaturalEarth, non-highways in OSM data
export const mainRoad: StylingAttributes = {
  zIndex: 23,

  strokeStyle: '#d92',
  fillStyle: 'none',
  lineWidth: 1,
  lineDash: [],
};

export const motorwayRoad: StylingAttributes = {
  zIndex: 25,

  strokeStyle: '#b23013',
  fillStyle: 'none',
  lineWidth: 3,
  lineDash: [],
};

export const majorRoad: StylingAttributes = {
  zIndex: 24,

  strokeStyle: '#d86e27',
  fillStyle: 'none',
  lineWidth: 2,
  lineDash: [],
};

export const residentialRoad: StylingAttributes = {
  zIndex: 22,

  strokeStyle: '#b7a847',
  fillStyle: 'none',
  lineWidth: 1,
  lineDash: [],
};

export const trackRoad: StylingAttributes = {
  zIndex: 21,

  strokeStyle: '#44441f',
  fillStyle: 'none',
  lineWidth: 1,
  lineDash: [],
};

export const pathRoad: StylingAttributes = {
  zIndex: 20,

  strokeStyle: '#666',
  fillStyle: 'none',
  lineWidth: 1,
  lineDash: [1,1],
};

export const ferry: StylingAttributes = {
  zIndex: 22,

  strokeStyle: '#34397c',
  fillStyle: 'none',
  lineWidth: 1,
  lineDash: [5, 2],
};

export const railroads: StylingAttributes = {
  zIndex: 22,

  strokeStyle: '#445',
  fillStyle: 'none',
  lineWidth: 1,
};

export const admin0Border: StylingAttributes = {
  zIndex: 30,

  strokeStyle: 'rgba(148, 37, 188, 0.3)',
  fillStyle: 'none',
  lineWidth: 3,
};

export const admin0ContestedBorder: StylingAttributes = {
  zIndex: 30,

  strokeStyle: 'rgba(188, 37, 148, 0.3)',
  fillStyle: 'none',
  lineWidth: 2,
  lineDash: [3, 1],
};

export const admin1Border: StylingAttributes = {
  zIndex: 30,

  strokeStyle: 'rgba(148, 37, 188, 0.3)',
  fillStyle: 'none',
  lineWidth: 2,
  lineDash: [2, 2],
};

export const admin2Border: StylingAttributes = {
  zIndex: 30,

  strokeStyle: 'rgba(148, 37, 188, 0.3)',
  fillStyle: 'none',
  lineWidth: 2,
  lineDash: [3, 2, 1, 2, 1, 2],
};

export const admin3Border: StylingAttributes = {
  zIndex: 30,

  strokeStyle: 'rgba(148, 37, 188, 0.3)',
  fillStyle: 'none',
  lineWidth: 1,
  lineDash: [3,2,1,2],
};

export const populatedPlaces: StylingAttributes = {
  zIndex: 40,

  strokeStyle: 'black',
  fillStyle: '#aa6e1b',
};

