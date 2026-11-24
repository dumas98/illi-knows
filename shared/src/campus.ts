export const CAMPUS_BOUNDS = { west: -88.242, east: -88.215, south: 40.095, north: 40.1175 } as const;

const MID_LAT = (CAMPUS_BOUNDS.north + CAMPUS_BOUNDS.south) / 2;
const LON_SCALE = Math.cos((MID_LAT * Math.PI) / 180);

export const MAP_WIDTH = 1000;
const UNITS_PER_DEGREE = MAP_WIDTH / ((CAMPUS_BOUNDS.east - CAMPUS_BOUNDS.west) * LON_SCALE);
export const MAP_HEIGHT = Math.round((CAMPUS_BOUNDS.north - CAMPUS_BOUNDS.south) * UNITS_PER_DEGREE);

export type LonLat = [number, number];
export type Point = [number, number];

export function project([lon, lat]: LonLat): Point {
  return [(lon - CAMPUS_BOUNDS.west) * LON_SCALE * UNITS_PER_DEGREE, (CAMPUS_BOUNDS.north - lat) * UNITS_PER_DEGREE];
}

export const METERS_PER_UNIT = 111_320 / UNITS_PER_DEGREE;

export interface CampusBasemap {
  width: number;
  height: number;
  attribution: string;
  layers: {
    green: string;
    fields: string;
    water: string;
    waterways: string;
    majorRoads: string;
    minorRoads: string;
    paths: string;
    buildings: string;
  };
}
