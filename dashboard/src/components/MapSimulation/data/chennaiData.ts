// ─── Chennai Map Data ──────────────────────────────────────────────────────
// Anna Nagar / Thirumangalam corridor
// All screen coords are pre-projected from lat/lon into an 860x560 SVG viewport
// Bounding box: lat 13.055–13.100, lon 80.192–13.232

export const MAP_W = 860;
export const MAP_H = 560;

// ── Lat/lon → SVG pixel projection ────────────────────────────────────────
const LAT_MIN = 13.054;
const LAT_MAX = 13.101;
const LON_MIN = 80.190;
const LON_MAX = 80.232;

export function project(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * MAP_W;
  const y = MAP_H - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * MAP_H;
  return { x: Math.round(x), y: Math.round(y) };
}

// ── Junction definitions ───────────────────────────────────────────────────
export interface Junction {
  id: string;
  name: string;
  lat: number;
  lon: number;
  x: number; // SVG x
  y: number; // SVG y
  capacity: number; // max vehicles per arm
  speedLimit: number; // km/h on approach roads
}

const rawJunctions = [
  { id: 'J01', name: 'Thirumangalam Junction',      lat: 13.0855, lon: 80.1977, capacity: 20, speedLimit: 50 },
  { id: 'J02', name: 'Anna Nagar Roundtana',         lat: 13.0867, lon: 80.2044, capacity: 18, speedLimit: 40 },
  { id: 'J03', name: 'Anna Nagar 2nd Ave',           lat: 13.0791, lon: 80.2058, capacity: 15, speedLimit: 40 },
  { id: 'J04', name: '12th Main Road Junction',      lat: 13.0830, lon: 80.2120, capacity: 14, speedLimit: 40 },
  { id: 'J05', name: 'Blue Star Junction',           lat: 13.0871, lon: 80.2147, capacity: 16, speedLimit: 50 },
  { id: 'J06', name: 'Shanthi Colony Signal',        lat: 13.0910, lon: 80.2080, capacity: 12, speedLimit: 40 },
  { id: 'J07', name: 'CMBT Koyambedu',               lat: 13.0694, lon: 80.1977, capacity: 25, speedLimit: 60 },
  { id: 'J08', name: 'Anna Arch – Poonamallee Rd',  lat: 13.0815, lon: 80.1965, capacity: 18, speedLimit: 50 },
  { id: 'J09', name: 'Anna Nagar East Signal',       lat: 13.0796, lon: 80.2175, capacity: 13, speedLimit: 40 },
  { id: 'J10', name: 'Saligramam Junction',          lat: 13.0597, lon: 80.1956, capacity: 16, speedLimit: 50 },
];

export const JUNCTIONS: Junction[] = rawJunctions.map(j => ({
  ...j,
  ...project(j.lat, j.lon),
}));

// ── Road / edge definitions ────────────────────────────────────────────────
export interface Road {
  id: string;
  from: string; // junction id
  to: string;   // junction id
  name: string;
  distanceM: number; // meters
  laneCount: number;
}

export const ROADS: Road[] = [
  { id: 'R01', from: 'J01', to: 'J02', name: 'Inner Ring Road E',        distanceM: 680, laneCount: 3 },
  { id: 'R02', from: 'J02', to: 'J04', name: 'Anna Nagar 2nd Ave',       distanceM: 750, laneCount: 2 },
  { id: 'R03', from: 'J02', to: 'J05', name: 'Anna Nagar Main Rd',       distanceM: 920, laneCount: 2 },
  { id: 'R04', from: 'J02', to: 'J06', name: 'Shanthi Colony Rd',        distanceM: 500, laneCount: 2 },
  { id: 'R05', from: 'J03', to: 'J02', name: '2nd Ave South Seg',        distanceM: 840, laneCount: 2 },
  { id: 'R06', from: 'J03', to: 'J04', name: 'KK Nagar Link',            distanceM: 620, laneCount: 2 },
  { id: 'R07', from: 'J04', to: 'J05', name: '12th Main',                distanceM: 480, laneCount: 2 },
  { id: 'R08', from: 'J04', to: 'J09', name: 'Anna Nagar East Rd',       distanceM: 560, laneCount: 2 },
  { id: 'R09', from: 'J05', to: 'J06', name: 'Blue Star to Shanthi',     distanceM: 420, laneCount: 2 },
  { id: 'R10', from: 'J01', to: 'J08', name: 'IRR West Seg',             distanceM: 580, laneCount: 3 },
  { id: 'R11', from: 'J08', to: 'J07', name: 'Poonamallee Hwy S',        distanceM: 1300, laneCount: 3 },
  { id: 'R12', from: 'J07', to: 'J10', name: 'Saligramam Link',          distanceM: 1100, laneCount: 2 },
  { id: 'R13', from: 'J01', to: 'J03', name: 'IRR to 2nd Ave',           distanceM: 700, laneCount: 2 },
  { id: 'R14', from: 'J06', to: 'J05', name: 'Shanthi–Blue Star Back',   distanceM: 420, laneCount: 2 },
  { id: 'R15', from: 'J09', to: 'J05', name: 'AN East Return',           distanceM: 560, laneCount: 2 },
  { id: 'R16', from: 'J10', to: 'J07', name: 'Saligramam Return',        distanceM: 1100, laneCount: 2 },
  { id: 'R17', from: 'J08', to: 'J01', name: 'PRR North',                distanceM: 580, laneCount: 3 },
  { id: 'R18', from: 'J03', to: 'J07', name: '2nd Ave to CMBT',          distanceM: 1050, laneCount: 2 },
];

// ── Hospital definitions ───────────────────────────────────────────────────
export interface Hospital {
  id: string;
  name: string;
  lat: number;
  lon: number;
  x: number;
  y: number;
  phone: string;
  nearestJunctionId: string;
}

const rawHospitals = [
  { id: 'H01', name: 'Sundaram Medical Foundation',  lat: 13.0824, lon: 80.2071, phone: '+91-44-4000-3000', nearestJunctionId: 'J04' },
  { id: 'H02', name: 'Be Well Hospital – Anna Nagar', lat: 13.0910, lon: 80.2147, phone: '+91-44-4200-0000', nearestJunctionId: 'J06' },
  { id: 'H03', name: 'CMBT Government Hospital',      lat: 13.0684, lon: 80.1960, phone: '+91-44-2479-0000', nearestJunctionId: 'J07' },
];

export const HOSPITALS: Hospital[] = rawHospitals.map(h => ({
  ...h,
  ...project(h.lat, h.lon),
}));

// ── Traffic video files ────────────────────────────────────────────────────
// These live in data/dataset/ — we serve them via Next.js public folder symlink.
// The browser will display these as looping <video> elements in the signal popup.
export const TRAFFIC_VIDEOS = [
  '12937197_3840_2160_30fps.mp4',
  '12937233_3840_2160_30fps.mp4',
  '13002271_3840_2160_30fps.mp4',
  '13009518_1920_1080_30fps.mp4',
  '13009546_3840_2160_30fps.mp4',
  '13016073_3840_2160_30fps.mp4',
  '13028079_3840_2160_30fps.mp4',
  '13052823_3840_2160_30fps.mp4',
  '13052943_3840_2160_30fps.mp4',
  '13053075_3840_2160_30fps.mp4',
  '13067660_3840_2160_30fps.mp4',
  '13067691_3840_2160_30fps.mp4',
  '13067896_3840_2160_30fps.mp4',
  '13105330_3840_2160_30fps.mp4',
  '13105470_3840_2160_30fps.mp4',
  '13143934_3840_2160_30fps.mp4',
  '13172888_3840_2160_30fps.mp4',
  '13178733_3840_2160_30fps.mp4',
  '13193036_3840_2160_30fps.mp4',
  '13268898_3840_2160_30fps.mp4',
  '13269027_3840_2160_30fps.mp4',
  '13269670_3840_2160_30fps.mp4',
  '13269676_3840_2160_30fps.mp4',
  '13270133_3840_2160_30fps.mp4',
  '13450758_1080_1920_30fps.mp4',
  '13486920_1920_1080_25fps.mp4',
  '5124507-hd_1920_1080_30fps.mp4',
];
