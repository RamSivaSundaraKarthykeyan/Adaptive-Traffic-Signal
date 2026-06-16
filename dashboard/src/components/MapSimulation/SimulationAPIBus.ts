// ─── Simulation API Bus ────────────────────────────────────────────────────
// All "APIs" are simulated in-browser with fully typed request/response shapes.
// To connect to a real FastAPI backend, replace each function body with:
//   const res = await fetch(`http://localhost:8000/api/<endpoint>`, { method, body })
//   return res.json()
//
// See SIMULATION_API_GUIDE.md for full endpoint specs.

import {
  JUNCTIONS, ROADS, HOSPITALS, Junction, Road, Hospital
} from './data/chennaiData';

// ── Shared state ──────────────────────────────────────────────────────────

export type SignalPhase = 'green' | 'yellow' | 'red';

export interface SignalState {
  signalId: string;
  phase: SignalPhase;
  timeRemainingS: number;
  greenDurationS: number;
  queueNS: number;
  queueEW: number;
  nextPredictedPhase: SignalPhase;
  nextPredictedDurationS: number;
  hasEmergencyVehicle: boolean;
  emergencyDirection?: 'NS' | 'EW';
}

export interface VehicleState {
  id: string;
  type: 'car' | 'ambulance' | 'fire_engine';
  lat: number;
  lon: number;
  fromJunctionId: string;
  toJunctionId: string;
  roadId: string;
  progress: number; // 0–1 along current road segment
  speed: number;    // meters/sec
  color: string;
  state: 'moving' | 'stopped' | 'arrived';
  accidentId?: string;
  targetHospitalId?: string;
  pathJunctionIds?: string[];
  currentPathIndex?: number;
  waitSecs: number;
  sirenActive: boolean;
}

export interface AccidentEvent {
  id: string;
  junctionId: string;
  timestamp: number;
  severity: 'minor' | 'moderate' | 'critical';
  resolved: boolean;
  ambulanceId?: string;
  fireEngineId?: string;
  targetHospitalId?: string;
}

export interface SignalMessage {
  id: string;
  fromId: string;    // junction id or vehicle id
  toId: string;      // junction id
  type: 'CLEAR_PATH' | 'ACCIDENT_ALERT' | 'VEHICLE_PASS' | 'PHASE_SYNC' | 'EMERGENCY_DONE';
  payload: Record<string, unknown>;
  timestamp: number;
}

// ── Map API ────────────────────────────────────────────────────────────────

/**
 * GET /api/map/layout
 * Returns all junctions, roads, and hospital locations.
 */
export async function getMapLayout(): Promise<{
  junctions: Junction[];
  roads: Road[];
  hospitals: Hospital[];
}> {
  // Simulated — in production: fetch('http://localhost:8000/api/map/layout')
  return { junctions: JUNCTIONS, roads: ROADS, hospitals: HOSPITALS };
}

/**
 * GET /api/map/nearest-hospital?lat=&lon=
 * Returns the nearest hospital to a given position.
 */
export async function getNearestHospital(lat: number, lon: number): Promise<Hospital> {
  let best = HOSPITALS[0];
  let bestDist = Infinity;
  for (const h of HOSPITALS) {
    const d = Math.hypot(h.lat - lat, h.lon - lon);
    if (d < bestDist) { bestDist = d; best = h; }
  }
  return best;
}

/**
 * GET /api/signals/:id/state
 * Returns the current phase and timing of a specific traffic signal.
 */
export async function getSignalState(signalId: string, signalMap: Map<string, SignalState>): Promise<SignalState | null> {
  return signalMap.get(signalId) ?? null;
}

/**
 * POST /api/signals/:id/state
 * AI model writes a new phase + duration to a signal.
 * Body: { phase, greenDurationS }
 */
export async function updateSignalState(
  signalId: string,
  signalMap: Map<string, SignalState>,
  update: Partial<SignalState>
): Promise<void> {
  const current = signalMap.get(signalId);
  if (current) signalMap.set(signalId, { ...current, ...update });
}

// ── Vehicle API ────────────────────────────────────────────────────────────

/**
 * GET /api/vehicles
 * Returns all active vehicle positions.
 */
export async function getVehiclePositions(vehicles: Map<string, VehicleState>): Promise<VehicleState[]> {
  return Array.from(vehicles.values());
}

/**
 * POST /api/vehicles/spawn
 * Spawns a new vehicle at a junction headed toward a destination junction.
 * Body: { type, fromJunctionId, toJunctionId, path }
 */
export async function spawnVehicle(
  vehicles: Map<string, VehicleState>,
  params: {
    id: string;
    type: VehicleState['type'];
    fromJunctionId: string;
    toJunctionId: string;
    roadId: string;
    startLat: number;
    startLon: number;
    color: string;
    pathJunctionIds?: string[];
    accidentId?: string;
    targetHospitalId?: string;
  }
): Promise<VehicleState> {
  const v: VehicleState = {
    id: params.id,
    type: params.type,
    lat: params.startLat,
    lon: params.startLon,
    fromJunctionId: params.fromJunctionId,
    toJunctionId: params.toJunctionId,
    roadId: params.roadId,
    progress: 0,
    speed: params.type === 'fire_engine' ? 200 :
           params.type === 'ambulance'   ? 170 : 90 + Math.random() * 40,
    color: params.color,
    state: 'moving',
    accidentId: params.accidentId,
    targetHospitalId: params.targetHospitalId,
    pathJunctionIds: params.pathJunctionIds ?? [],
    currentPathIndex: 0,
    waitSecs: 0,
    sirenActive: params.type === 'ambulance' || params.type === 'fire_engine',
  };
  vehicles.set(v.id, v);
  return v;
}

// ── Accident API ───────────────────────────────────────────────────────────

/**
 * POST /api/accidents/trigger
 * Triggers an accident at a junction. Returns the accident event.
 * Body: { junctionId, severity }
 */
export async function triggerAccident(
  accidents: Map<string, AccidentEvent>,
  junctionId: string
): Promise<AccidentEvent> {
  const severities: AccidentEvent['severity'][] = ['minor', 'moderate', 'critical'];
  const event: AccidentEvent = {
    id: `ACC-${Date.now()}`,
    junctionId,
    timestamp: Date.now(),
    severity: severities[Math.floor(Math.random() * severities.length)],
    resolved: false,
  };
  accidents.set(event.id, event);
  return event;
}

/**
 * POST /api/emergency/dispatch-ambulance
 * Dispatches ambulance from nearest available position toward accident junction,
 * routing via the given path to the hospital.
 * Body: { accidentId, hospitalId, path }
 */
export async function dispatchAmbulance(
  accidents: Map<string, AccidentEvent>,
  accidentId: string,
  hospitalId: string
): Promise<{ success: boolean; vehicleId: string }> {
  const acc = accidents.get(accidentId);
  if (!acc) return { success: false, vehicleId: '' };
  const vehicleId = `AMB-${Date.now()}`;
  acc.ambulanceId = vehicleId;
  acc.targetHospitalId = hospitalId;
  return { success: true, vehicleId };
}

/**
 * POST /api/emergency/dispatch-fire-engine
 * Dispatches a fire engine (higher priority than ambulance).
 * Body: { accidentId }
 */
export async function dispatchFireEngine(
  accidents: Map<string, AccidentEvent>,
  accidentId: string
): Promise<{ success: boolean; vehicleId: string }> {
  const acc = accidents.get(accidentId);
  if (!acc) return { success: false, vehicleId: '' };
  const vehicleId = `FIRE-${Date.now()}`;
  acc.fireEngineId = vehicleId;
  return { success: true, vehicleId };
}

// ── Path Clearance API ─────────────────────────────────────────────────────

/**
 * POST /api/signals/request-path-clearance
 * Emergency vehicle requests all signals along its path to go GREEN.
 * Body: { vehicleId, vehicleType, pathJunctionIds }
 */
export async function requestPathClearance(
  signalMap: Map<string, SignalState>,
  messageLog: SignalMessage[],
  vehicleId: string,
  vehicleType: 'ambulance' | 'fire_engine',
  pathJunctionIds: string[]
): Promise<void> {
  for (const junctionId of pathJunctionIds) {
    const sig = signalMap.get(junctionId);
    if (sig) {
      signalMap.set(junctionId, {
        ...sig,
        phase: 'green',
        timeRemainingS: vehicleType === 'fire_engine' ? 30 : 20,
        hasEmergencyVehicle: true,
      });
    }
    messageLog.push({
      id: `MSG-${Date.now()}-${junctionId}`,
      fromId: vehicleId,
      toId: junctionId,
      type: 'CLEAR_PATH',
      payload: { vehicleType, priority: vehicleType === 'fire_engine' ? 'CRITICAL' : 'HIGH' },
      timestamp: Date.now(),
    });
  }
}

// ── Signal-to-Signal Communication API ────────────────────────────────────

/**
 * POST /api/signals/communicate
 * One signal sends a message to another (ACCIDENT_ALERT, PHASE_SYNC, etc.)
 * Body: { fromId, toId, type, payload }
 */
export async function signalCommunicate(
  messageLog: SignalMessage[],
  fromId: string,
  toId: string,
  type: SignalMessage['type'],
  payload: Record<string, unknown>
): Promise<void> {
  messageLog.push({
    id: `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fromId,
    toId,
    type,
    payload,
    timestamp: Date.now(),
  });
  // Trim log to last 60 messages
  if (messageLog.length > 60) messageLog.splice(0, messageLog.length - 60);
}

// ── AI Optimization API ────────────────────────────────────────────────────

/**
 * POST /api/ai/optimize-signal
 * Returns the AI-recommended phase and duration for a junction.
 * Body: { junctionId, queueNS, queueEW, hasEmergencyNS, hasEmergencyEW,
 *          timeStarvedEW, timeStarvedNS }
 * 
 * AI uses multi-factor score:
 *   score(phase) = queueWeight*queueLen + emergencyBonus - stallPenalty*starveTime
 */
export function getAIOptimization(params: {
  junctionId: string;
  queueNS: number;
  queueEW: number;
  hasEmergencyNS: boolean;
  hasEmergencyEW: boolean;
  timeStarvedNS: number;   // secs the NS phase has been waiting
  timeStarvedEW: number;
  capacity: number;
}): { phase: 'NS' | 'EW'; greenDurationS: number; reasoning: string } {
  const QUEUE_W = 3.5;
  const EMERGENCY_BONUS = 200;
  const STALL_PENALTY = 1.2;
  const SATURATION_PENALTY = 2.0;

  const satNS = params.queueNS / Math.max(1, params.capacity);
  const satEW = params.queueEW / Math.max(1, params.capacity);

  const scoreNS =
    QUEUE_W * params.queueNS +
    (params.hasEmergencyNS ? EMERGENCY_BONUS : 0) -
    STALL_PENALTY * params.timeStarvedEW -
    SATURATION_PENALTY * satNS;

  const scoreEW =
    QUEUE_W * params.queueEW +
    (params.hasEmergencyEW ? EMERGENCY_BONUS : 0) -
    STALL_PENALTY * params.timeStarvedNS -
    SATURATION_PENALTY * satEW;

  const phase: 'NS' | 'EW' = scoreNS >= scoreEW ? 'NS' : 'EW';
  const queueLen = phase === 'NS' ? params.queueNS : params.queueEW;
  const greenDurationS = Math.round(Math.min(90, Math.max(10, queueLen * 4.5)));

  let reasoning = '';
  if (params.hasEmergencyNS && phase === 'NS') reasoning = `🚨 EMERGENCY OVERRIDE → NS GREEN`;
  else if (params.hasEmergencyEW && phase === 'EW') reasoning = `🚨 EMERGENCY OVERRIDE → EW GREEN`;
  else reasoning = `RL-PPO: ${phase} wins (score ${Math.round(phase === 'NS' ? scoreNS : scoreEW).toFixed(0)}) → ${greenDurationS}s green`;

  return { phase, greenDurationS, reasoning };
}
