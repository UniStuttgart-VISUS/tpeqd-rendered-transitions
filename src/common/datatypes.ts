export type Coordinate = [number, number];
export type Pair<T> = [T, T];

export interface Vertex {
  id: string;
  label: string;
  coords: Coordinate;
  zoom: number;
}

export interface Graph {
  vertices: {
    [key: string]: Vertex;
  };
  edges: Array<Pair<keyof Graph['vertices']>>;
}


export interface CanvasRendererAttributes {
  strokeStyle: string;
  lineWidth: number;
  fillStyle: string;
  lineDash: Array<number>;
};

export interface RenderVisibility {
  // layering and visibility
  zIndex: number;
  minZoom?: number;
  maxZoom?: number;
};

export interface RenderedData {
  data: any;
}

export type RenderLayer = RenderedData & RenderVisibility & CanvasRendererAttributes;
export type PartialRenderLayer = RenderedData & RenderVisibility & Partial<CanvasRendererAttributes>;

export type RenderData = Array<PartialRenderLayer>;

export type StylingAttributes = Partial<CanvasRendererAttributes> & Pick<RenderVisibility, 'zIndex'>;

// the rest are (hopefully) not needed
export type GeoJsonGeometryType = 'Point'
  | 'LineString'
  | 'MultiLineString'
  | 'Polygon'
  | 'MultiPolygon';

export type OverpassLayerDefinition = RenderVisibility
  & Partial<CanvasRendererAttributes>
  & {
    minZoom: number;
    layerName: string;
    overpassQuery: string;
    validGeometries: Array<GeoJsonGeometryType>;
  }