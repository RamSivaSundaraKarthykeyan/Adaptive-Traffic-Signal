// ─── Simulation Engine ─────────────────────────────────────────────────────
// Core tick logic: signal state machine, vehicle movement, AI optimizer,
// accident triggers, emergency dispatch, and inter-signal communication.
//
// KEY DESIGN PRINCIPLE: All accident dispatch and vehicle spawning is
// SYNCHRONOUS — no async/await in hot paths — to eliminate microtask
// race conditions that caused stuck accidents and duplicate ambulances.

import {
  JUNCTIONS, ROADS, HOSPITALS, Road,
} from './data/chennaiData';
import {
  SignalState, VehicleState, AccidentEvent, SignalMessage,
  signalCommunicate, getAIOptimization,
} from './SimulationAPIBus';

// ── Graph adjacency (for pathfinding) ────────────────────────────────────

interface GraphEdge { toId: string; roadId: string; cost: number; }
const GRAPH = new Map<string, GraphEdge[]>();

function buildGraph() {
  for (const j of JUNCTIONS) GRAPH.set(j.id, []);
  for (const r of ROADS) {
    const from = GRAPH.get(r.from);
    const to   = GRAPH.get(r.to);
    if (from) from.push({ toId: r.to,   roadId: r.id, cost: r.distanceM });
    if (to)   to.push  ({ toId: r.from, roadId: r.id, cost: r.distanceM });
  }
}
buildGraph();

/** Dijkstra shortest path — returns ordered list of junction IDs.
 *  Returns [] if fromId === toId or no path exists. */
function findPath(fromId: string, toId: string): string[] {
  if (fromId === toId) return [];

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const open = new Set<string>(JUNCTIONS.map(j => j.id));

  for (const j of JUNCTIONS) dist.set(j.id, Infinity);
  dist.set(fromId, 0);

  while (open.size > 0) {
    let u = '';
    let minDist = Infinity;
    for (const id of open) {
      const d = dist.get(id) ?? Infinity;
      if (d < minDist) { minDist = d; u = id; }
    }
    if (!u || u === toId) break;
    open.delete(u);

    for (const edge of GRAPH.get(u) ?? []) {
      const alt = (dist.get(u) ?? Infinity) + edge.cost;
      if (alt < (dist.get(edge.toId) ?? Infinity)) {
        dist.set(edge.toId, alt);
        prev.set(edge.toId, u);
      }
    }
  }

  const path: string[] = [];
  let cur = toId;
  while (prev.has(cur)) { path.unshift(cur); cur = prev.get(cur)!; }
  if (path.length > 0) path.unshift(fromId);
  return path;
}

/** Road between two junctions (bidirectional) */
function getRoadBetween(fromId: string, toId: string): Road | undefined {
  return ROADS.find(r =>
    (r.from === fromId && r.to === toId) ||
    (r.from === toId   && r.to === fromId)
  );
}

/** Synchronous nearest-hospital lookup — avoids all async race conditions */
function findNearestHospital(lat: number, lon: number) {
  let best = HOSPITALS[0];
  let bestDist = Infinity;
  for (const h of HOSPITALS) {
    const d = Math.hypot(h.lat - lat, h.lon - lon);
    if (d < bestDist) { bestDist = d; best = h; }
  }
  return best;
}

/**
 * Resolve a hospital dispatch start point.
 * If the hospital's nearest junction IS the accident junction (self-path),
 * we pick the first graph-neighbor as the start instead.
 */
function resolveDispatchStart(
  hospitalNearestJuncId: string,
  accidentJuncId: string,
): string {
  if (hospitalNearestJuncId !== accidentJuncId) return hospitalNearestJuncId;

  // Self-path guard: pick any adjacent junction as starting point
  const neighbors = GRAPH.get(accidentJuncId) ?? [];
  if (neighbors.length > 0) return neighbors[0].toId;

  return hospitalNearestJuncId; // truly isolated — caller will handle path.length < 2
}

// ── Vehicle spawn (synchronous) ───────────────────────────────────────────

interface VehicleSpawnParams {
  id: string;
  type: VehicleState['type'];
  fromJunctionId: string;
  toJunctionId:   string;
  roadId:         string;
  startLat:       number;
  startLon:       number;
  color:          string;
  pathJunctionIds?:   string[];
  accidentId?:        string;
  targetHospitalId?:  string;
  speed?:             number; // override base speed
}

function spawnVehicleSync(
  vehicles: Map<string, VehicleState>,
  p: VehicleSpawnParams,
): VehicleState {
  const speed = p.speed ?? (
    p.type === 'ambulance' ? 40 : 20 + Math.random() * 10
  );
  const v: VehicleState = {
    id: p.id,
    type: p.type,
    lat:  p.startLat,
    lon:  p.startLon,
    fromJunctionId:   p.fromJunctionId,
    toJunctionId:     p.toJunctionId,
    roadId:           p.roadId,
    progress:         0,
    speed,
    color:            p.color,
    state:            'moving',
    accidentId:       p.accidentId,
    targetHospitalId: p.targetHospitalId,
    pathJunctionIds:  p.pathJunctionIds ?? [],
    currentPathIndex: 0,
    waitSecs:         0,
    sirenActive:      p.type === 'ambulance',
  };
  vehicles.set(v.id, v);
  return v;
}

// ── Engine state ──────────────────────────────────────────────────────────

export interface EngineState {
  isTraditional:          boolean;
  signals:                Map<string, SignalState>;
  vehicles:               Map<string, VehicleState>;
  accidents:              Map<string, AccidentEvent>;
  messageLog:             SignalMessage[];
  densityMap:             Map<string, number>;   // roadId → 0–1
  pendingDispatch:        { accidentId: string; dispatchAtSimTime: number }[];
  elapsed:                number;
  simTime:                number;
  aiLog:                  string;
  accidentCount:          number;
  resolvedCount:          number;
  totalWait:              number;
  clearedCount:           number;
  ambCleared:             number;
  vehicleSpeedMultiplier: number;  // 1.0 = default; changes only vehicle speed, NOT signal timing
}

// Phase-starve timers — kept separate per engine type to avoid bleed
const aiPhaseStarveNS   = new Map<string, number>();
const aiPhaseStarveEW   = new Map<string, number>();
const tradPhaseStarveNS = new Map<string, number>();
const tradPhaseStarveEW = new Map<string, number>();

let vehicleIdCtr = 0;
const VEHICLE_COLORS = ['#38bdf8','#818cf8','#34d399','#fb923c','#f472b6','#facc15','#a78bfa','#67e8f9'];

// ── Initialise ────────────────────────────────────────────────────────────

const YELLOW_DURATION = 3;
const TRAD_GREEN      = 60;  // 60s green — realistic Chennai signal
const TRAD_RED        = 60;  // 60s red

export function initEngine(isTraditional: boolean = false): EngineState {
  const signals = new Map<string, SignalState>();

  for (const j of JUNCTIONS) {
    if (isTraditional) {
      // Stagger phases across the full 123-second cycle so they're out of phase
      const cycle  = TRAD_GREEN + YELLOW_DURATION + TRAD_RED;
      const offset = Math.random() * cycle;
      let phase: 'green' | 'yellow' | 'red';
      let timeRemaining: number;
      if (offset < TRAD_GREEN) {
        phase = 'green';  timeRemaining = TRAD_GREEN - offset;
      } else if (offset < TRAD_GREEN + YELLOW_DURATION) {
        phase = 'yellow'; timeRemaining = TRAD_GREEN + YELLOW_DURATION - offset;
      } else {
        phase = 'red';    timeRemaining = cycle - offset;
      }
      signals.set(j.id, {
        signalId: j.id, phase, timeRemainingS: timeRemaining,
        greenDurationS: TRAD_GREEN, queueNS: 0, queueEW: 0,
        nextPredictedPhase: 'red', nextPredictedDurationS: TRAD_RED,
        hasEmergencyVehicle: false,
      });
      tradPhaseStarveNS.set(j.id, 0);
      tradPhaseStarveEW.set(j.id, 0);
    } else {
      signals.set(j.id, {
        signalId: j.id,
        phase: Math.random() > 0.5 ? 'green' : 'red',
        timeRemainingS: 10 + Math.random() * 20,
        greenDurationS: 30, queueNS: 0, queueEW: 0,
        nextPredictedPhase: 'green', nextPredictedDurationS: 30,
        hasEmergencyVehicle: false,
      });
      aiPhaseStarveNS.set(j.id, 0);
      aiPhaseStarveEW.set(j.id, 0);
    }
  }

  return {
    isTraditional,
    signals,
    vehicles:               new Map(),
    accidents:              new Map(),
    messageLog:             [],
    densityMap:             new Map(),
    pendingDispatch:        [],
    elapsed:                0,
    simTime:                0,
    aiLog:                  isTraditional ? 'Traditional Fixed-Timer Active' : 'AI RL-PPO Optimizer Ready',
    accidentCount:          0,
    resolvedCount:          0,
    totalWait:              0,
    clearedCount:           0,
    ambCleared:             0,
    vehicleSpeedMultiplier: 1.0,
  };
}

// ── Event types ───────────────────────────────────────────────────────────

export type SimulationEvent =
  | { type: 'spawn';                  vehicle: VehicleSpawnParams }
  | { type: 'accident';               junctionId: string }
  | { type: 'spawn_ambulance';        junctionId: string }
  | { type: 'force_resolve_accident'; junctionId: string };

// ── Main tick ─────────────────────────────────────────────────────────────

export function tick(
  state:   EngineState,
  dtReal:  number,
  events:  SimulationEvent[] = [],
): EngineState {
  const dt = dtReal * 3; // 3× simulation speed (only affects signals & movement, NOT vehicle speed multiplier)

  state.elapsed += dtReal;
  state.simTime += dt;

  // Safety check: if an active accident has an ambulanceId, but the ambulance does not exist in state.vehicles,
  // clear the ambulanceId so it can be redispatched.
  for (const acc of state.accidents.values()) {
    if (!acc.resolved) {
      if (acc.ambulanceId && !state.vehicles.has(acc.ambulanceId)) {
        acc.ambulanceId = undefined;
      }
      if (!acc.ambulanceId) {
        if (state.isTraditional) {
          const isPending = state.pendingDispatch.some(p => p.accidentId === acc.id);
          if (!isPending) {
            state.pendingDispatch.push({
              accidentId: acc.id,
              dispatchAtSimTime: state.simTime + 5, // retry in 5 sim seconds
            });
          }
        } else {
          doDispatch(state, acc);
        }
      }
    }
  }

  // 1. Signal state machine
  tickSignals(state, dt);

  // 2. External events (all synchronous — no async race conditions)
  for (const event of events) {
    if      (event.type === 'spawn')                  spawnVehicleSync(state.vehicles, event.vehicle);
    else if (event.type === 'accident')               handleAccidentTrigger(state, event.junctionId);
    else if (event.type === 'spawn_ambulance')        handleManualAmbulance(state, event.junctionId);
    else if (event.type === 'force_resolve_accident') forceResolveAccident(state, event.junctionId);
  }

  // 3. Traditional pending dispatch (delayed manual detection)
  if (state.isTraditional) {
    const ready = state.pendingDispatch.filter(p => state.simTime >= p.dispatchAtSimTime);
    state.pendingDispatch = state.pendingDispatch.filter(p => state.simTime < p.dispatchAtSimTime);
    for (const pd of ready) {
      const acc = state.accidents.get(pd.accidentId);
      if (acc && !acc.resolved) doDispatch(state, acc);
    }
  }

  // 4. Move vehicles
  tickVehicles(state, dt);

  // 5. Road density
  updateDensity(state);

  return state;
}

// ── Signal state machine ──────────────────────────────────────────────────

const AI_MAX_STALL = 55;

function tickSignals(state: EngineState, dt: number) {
  const starveNS = state.isTraditional ? tradPhaseStarveNS : aiPhaseStarveNS;
  const starveEW = state.isTraditional ? tradPhaseStarveEW : aiPhaseStarveEW;

  for (const [jId, sig] of state.signals) {
    const j = JUNCTIONS.find(j => j.id === jId)!;

    sig.timeRemainingS = Math.max(0, sig.timeRemainingS - dt);

    // Starvation tracking
    if      (sig.phase === 'green') { starveNS.set(jId, 0); starveEW.set(jId, (starveEW.get(jId) ?? 0) + dt); }
    else if (sig.phase === 'red')   { starveEW.set(jId, 0); starveNS.set(jId, (starveNS.get(jId) ?? 0) + dt); }

    // Count queued vehicles
    let qNS = 0, qEW = 0, hasEmerNS = false, hasEmerEW = false;
    for (const v of state.vehicles.values()) {
      if (v.toJunctionId === jId && (v.state === 'stopped' || v.progress > 0.7)) {
        const fromJ = JUNCTIONS.find(j => j.id === v.fromJunctionId);
        const toJ   = JUNCTIONS.find(j => j.id === jId);
        if (fromJ && toJ) {
          const dx = Math.abs(toJ.lon - fromJ.lon);
          const dy = Math.abs(toJ.lat - fromJ.lat);
          if (dy > dx) { qNS++; if (v.sirenActive) hasEmerNS = true; }
          else          { qEW++; if (v.sirenActive) hasEmerEW = true; }
        }
      }
    }
    sig.queueNS = qNS;
    sig.queueEW = qEW;
    sig.hasEmergencyVehicle = hasEmerNS || hasEmerEW;
    sig.emergencyDirection  = hasEmerNS ? 'NS' : hasEmerEW ? 'EW' : undefined;

    // ── AI ONLY: Immediate emergency override ──
    if (!state.isTraditional && sig.phase !== 'green' && (hasEmerNS || hasEmerEW)) {
      sig.phase = 'green'; sig.timeRemainingS = 25; sig.greenDurationS = 25;
      state.aiLog = `🚑 EMERGENCY OVERRIDE @ ${j.name} → INSTANT GREEN`;
      continue;
    }

    // ── AI ONLY: Anti-starvation hard override ──
    if (!state.isTraditional && sig.phase === 'green') {
      const stall = starveNS.get(jId) ?? 0;
      if (stall > AI_MAX_STALL && sig.timeRemainingS > 5) {
        sig.phase = 'yellow'; sig.timeRemainingS = YELLOW_DURATION;
        continue;
      }
    }

    if (sig.timeRemainingS <= 0) {
      if (sig.phase === 'green') {
        sig.phase = 'yellow'; sig.timeRemainingS = YELLOW_DURATION;

      } else if (sig.phase === 'yellow') {
        if (state.isTraditional) {
          // Traditional: full 60-second red phase
          sig.phase = 'red'; sig.timeRemainingS = TRAD_RED;
          sig.nextPredictedPhase = 'green'; sig.nextPredictedDurationS = TRAD_GREEN;
        } else {
          sig.phase = 'red'; sig.timeRemainingS = 2; // AI: brief all-red, then optimizer
        }

      } else { // red → green
        if (state.isTraditional) {
          sig.phase = 'green'; sig.greenDurationS = TRAD_GREEN; sig.timeRemainingS = TRAD_GREEN;
          sig.nextPredictedPhase = 'red'; sig.nextPredictedDurationS = TRAD_RED;
          sig.hasEmergencyVehicle = false; sig.emergencyDirection = undefined;
        } else {
          // ── AI RL-PPO heuristic ──
          const opt = getAIOptimization({
            junctionId: jId,
            queueNS: sig.queueNS, queueEW: sig.queueEW,
            hasEmergencyNS: hasEmerNS, hasEmergencyEW: hasEmerEW,
            timeStarvedNS: starveNS.get(jId) ?? 0,
            timeStarvedEW: starveEW.get(jId) ?? 0,
            capacity: j.capacity,
          });
          sig.phase = 'green'; sig.greenDurationS = opt.greenDurationS;
          sig.timeRemainingS = opt.greenDurationS;
          sig.nextPredictedPhase = 'red'; sig.nextPredictedDurationS = 30;
          state.aiLog = opt.reasoning;
          propagateGreenWave(state, jId, opt.phase);
        }
      }
    }
  }
}

function propagateGreenWave(state: EngineState, fromJId: string, phase: 'NS' | 'EW') {
  for (const nId of (GRAPH.get(fromJId) ?? []).map(e => e.toId)) {
    const ns = state.signals.get(nId);
    if (!ns) continue;
    if (ns.phase === 'red' && ns.timeRemainingS > 25)
      ns.timeRemainingS = Math.max(5, ns.timeRemainingS - 8);
    signalCommunicate(state.messageLog, fromJId, nId, 'PHASE_SYNC', { phase, wave: true });
  }
}

// ── Traffic spawning ──────────────────────────────────────────────────────

export function generateSpawnEvent(): SimulationEvent | null {
  const startJ = JUNCTIONS[Math.floor(Math.random() * JUNCTIONS.length)];
  let   endJ   = JUNCTIONS[Math.floor(Math.random() * JUNCTIONS.length)];
  if (endJ.id === startJ.id)
    endJ = JUNCTIONS[(JUNCTIONS.indexOf(startJ) + 1) % JUNCTIONS.length];

  const path = findPath(startJ.id, endJ.id);
  if (path.length < 2) return null;

  const road = getRoadBetween(path[0], path[1]);
  if (!road) return null;

  return {
    type: 'spawn',
    vehicle: {
      id: `V-${++vehicleIdCtr}`,
      type: 'car',
      fromJunctionId:  path[0],
      toJunctionId:    path[1],
      roadId:          road.id,
      startLat:        startJ.lat,
      startLon:        startJ.lon,
      color: VEHICLE_COLORS[Math.floor(Math.random() * VEHICLE_COLORS.length)],
      pathJunctionIds: path,
    },
  };
}

// ── Vehicle movement ──────────────────────────────────────────────────────

function tickVehicles(state: EngineState, dt: number) {
  const toRemove: string[] = [];

  for (const [vid, v] of state.vehicles) {
    if (v.state === 'arrived') { toRemove.push(vid); continue; }

    const pathIds = v.pathJunctionIds ?? [];
    const pathIdx = v.currentPathIndex ?? 0;
    const fromJ   = JUNCTIONS.find(j => j.id === v.fromJunctionId);
    const toJ     = JUNCTIONS.find(j => j.id === v.toJunctionId);
    const road    = ROADS.find(r => r.id === v.roadId);

    if (!toJ || !fromJ || !road) { toRemove.push(vid); continue; }

    const sig         = state.signals.get(v.toJunctionId);
    const isEmergency = v.sirenActive;
    const signalGreen = !sig || sig.phase === 'green';

    // Apply vehicle speed multiplier (does NOT affect signal timing)
    let baseSpeed = v.speed * state.vehicleSpeedMultiplier;
    if (isEmergency && !state.isTraditional) baseSpeed *= 1.5; // AI: fast with green wave
    if (isEmergency &&  state.isTraditional) baseSpeed *= 1.1; // Traditional: slight priority

    const progressStep = (baseSpeed * dt) / Math.max(10, road.distanceM);
    const STOP_THRESHOLD = 0.90;

    if (v.progress >= STOP_THRESHOLD && !signalGreen && !isEmergency) {
      v.state = 'stopped';
      v.progress = STOP_THRESHOLD;
      v.waitSecs += dt;
    } else {
      v.state    = 'moving';
      v.progress = Math.min(v.progress + progressStep, 1.0);

      // Interpolate position along the road's waypoint path
      if (road.path && road.path.length >= 2) {
        const numSeg    = road.path.length - 1;
        const scaledPrg = v.progress * numSeg;
        const segIdx    = Math.min(Math.floor(scaledPrg), numSeg - 1);
        const segPrg    = scaledPrg - segIdx;
        const p1 = road.path[segIdx], p2 = road.path[segIdx + 1];
        v.lat = p1[0] + (p2[0] - p1[0]) * segPrg;
        v.lon = p1[1] + (p2[1] - p1[1]) * segPrg;
      } else {
        v.lat = fromJ.lat + (toJ.lat - fromJ.lat) * v.progress;
        v.lon = fromJ.lon + (toJ.lon - fromJ.lon) * v.progress;
      }

      if (v.progress >= 1) {
        const nextIdx = pathIdx + 1;
        if (nextIdx < pathIds.length - 1) {
          // Advance to next road segment
          const nextFrom = pathIds[nextIdx];
          const nextTo   = pathIds[nextIdx + 1];
          const nextRoad = getRoadBetween(nextFrom, nextTo);
          if (nextRoad) {
            v.fromJunctionId   = nextFrom;
            v.toJunctionId     = nextTo;
            v.roadId           = nextRoad.id;
            v.currentPathIndex = nextIdx;
            v.progress         = 0;
            const nfJ = JUNCTIONS.find(j => j.id === nextFrom);
            if (nfJ) { v.lat = nfJ.lat; v.lon = nfJ.lon; }
          } else {
            v.state = 'arrived';
          }
        } else {
          // Reached final destination in path
          onVehicleArrived(state, vid, v);
        }
      }
    }
  }

  for (const id of toRemove) state.vehicles.delete(id);
}

/**
 * Called once when a vehicle reaches the end of its current path.
 *
 * Ambulance lifecycle (fully synchronous — no .then() / async):
 *   Phase 1 (heading TO accident):  targetHospitalId === undefined
 *     → mark accident resolved, compute return path synchronously, reset vehicle
 *   Phase 2 (returning to hospital): targetHospitalId !== undefined
 *     → mark ambCleared, remove vehicle
 */
function onVehicleArrived(state: EngineState, vid: string, v: VehicleState) {
  if (v.type === 'ambulance' && v.accidentId) {
    const acc = state.accidents.get(v.accidentId);

    // ── Phase 1: Ambulance arrived at accident site ──
    if (acc && !acc.resolved && v.targetHospitalId === undefined) {
      acc.resolved = true;
      state.resolvedCount++;
      signalCommunicate(state.messageLog, vid, v.toJunctionId, 'EMERGENCY_DONE',
        { vehicleType: 'ambulance', phase: 'at_scene' });

      // Compute return trip SYNCHRONOUSLY — eliminates microtask race
      const returnHospital = findNearestHospital(v.lat, v.lon);
      const hospJunc = JUNCTIONS.find(j => j.id === returnHospital.nearestJunctionId) ?? JUNCTIONS[0];
      const returnStartId = resolveDispatchStart(hospJunc.id, v.toJunctionId);
      // For return trip we go accident → hospital, so no self-path issue normally
      const returnPath = findPath(v.toJunctionId, hospJunc.id);

      if (returnPath.length >= 2) {
        const returnRoad = getRoadBetween(returnPath[0], returnPath[1]);
        if (returnRoad) {
          v.fromJunctionId   = returnPath[0];
          v.toJunctionId     = returnPath[1];
          v.roadId           = returnRoad.id;
          v.currentPathIndex = 0;
          v.progress         = 0;
          v.pathJunctionIds  = returnPath;
          v.targetHospitalId = returnHospital.id; // marks return leg
          v.state            = 'moving';
          return; // vehicle continues — will hit Phase 2 on arrival at hospital
        }
      }

      // No valid return path — just clear the ambulance
      state.ambCleared++;
      state.totalWait  += v.waitSecs;
      state.clearedCount++;
      v.state = 'arrived';
      return;
    }

    // ── Phase 2: Ambulance returned to hospital ──
    if (v.targetHospitalId !== undefined) {
      state.ambCleared++;
      signalCommunicate(state.messageLog, vid, v.toJunctionId, 'EMERGENCY_DONE',
        { vehicleType: 'ambulance', phase: 'returned_to_hospital' });
      state.totalWait  += v.waitSecs;
      state.clearedCount++;
      v.state = 'arrived';
      return;
    }
  }

  // Normal vehicle (car) or manual ambulance (no accidentId) arrived
  state.totalWait  += v.waitSecs;
  state.clearedCount++;
  v.state = 'arrived';
}

// ── Density ───────────────────────────────────────────────────────────────

function updateDensity(state: EngineState) {
  const counts = new Map<string, number>();
  for (const v of state.vehicles.values())
    counts.set(v.roadId, (counts.get(v.roadId) ?? 0) + 1);
  const maxCap = 10;
  for (const r of ROADS)
    state.densityMap.set(r.id, Math.min(1, (counts.get(r.id) ?? 0) / maxCap));
}

// ── Accident handling (fully synchronous) ─────────────────────────────────

function handleAccidentTrigger(state: EngineState, junctionId: string) {
  // Prevent duplicate active accidents at the same junction
  for (const a of state.accidents.values()) {
    if (a.junctionId === junctionId && !a.resolved) {
      return;
    }
  }

  const severities: AccidentEvent['severity'][] = ['minor', 'moderate', 'critical'];
  const acc: AccidentEvent = {
    id:        `ACC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    junctionId,
    timestamp: Date.now(),
    severity:  severities[Math.floor(Math.random() * severities.length)],
    resolved:  false,
  };
  state.accidents.set(acc.id, acc);
  state.accidentCount++;

  const jName = JUNCTIONS.find(j => j.id === junctionId)?.name ?? junctionId;

  // Broadcast alert to neighbors
  for (const nId of (GRAPH.get(junctionId) ?? []).map(e => e.toId))
    signalCommunicate(state.messageLog, junctionId, nId, 'ACCIDENT_ALERT',
      { accidentId: acc.id, severity: acc.severity });

  if (state.isTraditional) {
    // Traditional: simulate manual detection delay (15–25 simulated seconds)
    const delay = 15 + Math.random() * 10;
    state.pendingDispatch.push({
      accidentId: acc.id,
      dispatchAtSimTime: state.simTime + delay,
    });
  } else {
    // AI: immediate dispatch + pre-clear path
    doDispatch(state, acc);
    state.aiLog = `🚨 AI DETECTED @ ${jName} — Instant dispatch + path cleared`;
  }
}

/**
 * Dispatch ONE ambulance from the nearest hospital to the accident.
 * Fully synchronous. Guards against duplicate dispatch and self-path.
 *
 * The only vehicle spawned is a single ambulance.
 * Fire engines are intentionally omitted to keep one-vehicle-per-accident.
 */
function doDispatch(state: EngineState, acc: AccidentEvent) {
  // ── Guard: never dispatch twice for the same accident ──
  if (acc.ambulanceId) return;

  const junctionId = acc.junctionId;
  const junc = JUNCTIONS.find(j => j.id === junctionId);
  if (!junc) return;

  // Find hospital with a valid path synchronously (checking closest first)
  let hospital = HOSPITALS[0];
  let path: string[] = [];
  let hospJunc = JUNCTIONS[0];

  const sortedHospitals = [...HOSPITALS].sort((a, b) => {
    const da = Math.hypot(a.lat - junc.lat, a.lon - junc.lon);
    const db = Math.hypot(b.lat - junc.lat, b.lon - junc.lon);
    return da - db;
  });

  for (const h of sortedHospitals) {
    const hj = JUNCTIONS.find(j => j.id === h.nearestJunctionId) ?? JUNCTIONS[0];
    const startJuncId = resolveDispatchStart(hj.id, junctionId);
    const p = findPath(startJuncId, junctionId);
    if (p.length >= 2) {
      hospital = h;
      path = p;
      hospJunc = hj;
      break;
    }
  }

  if (path.length < 2) return; // no route exists — skip silently

  const startJunc = JUNCTIONS.find(j => j.id === path[0]) ?? hospJunc;
  const road = getRoadBetween(path[0], path[1]);
  if (!road) return;

  // Set ambulanceId BEFORE spawning — prevents any double-dispatch
  const ambId = `AMB-${++vehicleIdCtr}`;
  acc.ambulanceId      = ambId;
  acc.targetHospitalId = hospital.id;

  spawnVehicleSync(state.vehicles, {
    id:              ambId,
    type:            'ambulance',
    fromJunctionId:  path[0],
    toJunctionId:    path[1],
    roadId:          road.id,
    startLat:        startJunc.lat,
    startLon:        startJunc.lon,
    color:           '#ffffff',
    pathJunctionIds: path,
    accidentId:      acc.id,
    targetHospitalId: undefined, // undefined = heading TO accident (not return leg)
  });

  // AI: pre-clear every signal along the path
  if (!state.isTraditional) {
    for (const jId of path) {
      const sig = state.signals.get(jId);
      if (sig && sig.phase !== 'green') {
        sig.phase = 'green';
        sig.timeRemainingS = 20;
        sig.hasEmergencyVehicle = true;
      }
    }
  }
}

/**
 * Force-resolve a stuck accident at a given junction.
 * Called when the user clicks on an accident marker.
 * Immediately clears the caution icon and spawns a cleanup ambulance.
 */
export function forceResolveAccident(state: EngineState, junctionId: string) {
  let found = false;
  for (const acc of state.accidents.values()) {
    if (acc.junctionId === junctionId && !acc.resolved) {
      acc.resolved = true;
      state.resolvedCount++;
      // Remove any pending traditional dispatch for this accident
      state.pendingDispatch = state.pendingDispatch.filter(p => p.accidentId !== acc.id);
      found = true;
      break;
    }
  }
  if (!found) return;

  // Spawn a visual cleanup ambulance (no accidentId — accident already resolved)
  const junc = JUNCTIONS.find(j => j.id === junctionId);
  if (!junc) return;

  // Find hospital with a valid path synchronously (checking closest first)
  let hospital = HOSPITALS[0];
  let path: string[] = [];
  let hospJunc = JUNCTIONS[0];

  const sortedHospitals = [...HOSPITALS].sort((a, b) => {
    const da = Math.hypot(a.lat - junc.lat, a.lon - junc.lon);
    const db = Math.hypot(b.lat - junc.lat, b.lon - junc.lon);
    return da - db;
  });

  for (const h of sortedHospitals) {
    const hj = JUNCTIONS.find(j => j.id === h.nearestJunctionId) ?? JUNCTIONS[0];
    const startJuncId = resolveDispatchStart(hj.id, junctionId);
    const p = findPath(startJuncId, junctionId);
    if (p.length >= 2) {
      hospital = h;
      path = p;
      hospJunc = hj;
      break;
    }
  }

  if (path.length < 2) return;

  const road = getRoadBetween(path[0], path[1]);
  if (!road) return;

  const startJunc = JUNCTIONS.find(j => j.id === path[0]) ?? hospJunc;
  const ambId = `FORCE-AMB-${++vehicleIdCtr}`;

  spawnVehicleSync(state.vehicles, {
    id:              ambId,
    type:            'ambulance',
    fromJunctionId:  path[0],
    toJunctionId:    path[1],
    roadId:          road.id,
    startLat:        startJunc.lat,
    startLon:        startJunc.lon,
    color:           '#ffffff',
    pathJunctionIds: path,
    accidentId:      undefined,         // no accident linkage (already resolved)
    targetHospitalId: hospital.id,      // marks it as a "just pass through" ambulance
  });

  if (!state.isTraditional) {
    for (const jId of path) {
      const sig = state.signals.get(jId);
      if (sig && sig.phase !== 'green') {
        sig.phase = 'green'; sig.timeRemainingS = 15; sig.hasEmergencyVehicle = true;
      }
    }
    state.aiLog = `🚑 FORCED RESOLVE → ${junc.name}`;
  }
}

/** Manual ambulance button — spawn from nearest hospital to a random junction */
function handleManualAmbulance(state: EngineState, junctionId: string) {
  const junc = JUNCTIONS.find(j => j.id === junctionId) ?? JUNCTIONS[0];
  
  // Find hospital with a valid path synchronously (checking closest first)
  let hospital = HOSPITALS[0];
  let path: string[] = [];
  let hospJunc = JUNCTIONS[0];

  const sortedHospitals = [...HOSPITALS].sort((a, b) => {
    const da = Math.hypot(a.lat - junc.lat, a.lon - junc.lon);
    const db = Math.hypot(b.lat - junc.lat, b.lon - junc.lon);
    return da - db;
  });

  for (const h of sortedHospitals) {
    const hj = JUNCTIONS.find(j => j.id === h.nearestJunctionId) ?? JUNCTIONS[0];
    const startJuncId = resolveDispatchStart(hj.id, junctionId);
    const p = findPath(startJuncId, junctionId);
    if (p.length >= 2) {
      hospital = h;
      path = p;
      hospJunc = hj;
      break;
    }
  }

  if (path.length < 2) return;

  const road = getRoadBetween(path[0], path[1]);
  if (!road) return;

  const startJunc = JUNCTIONS.find(j => j.id === path[0]) ?? hospJunc;
  const ambId = `MANUAL-AMB-${++vehicleIdCtr}`;

  if (!state.isTraditional) {
    for (const jId of path) {
      const sig = state.signals.get(jId);
      if (sig && sig.phase !== 'green') {
        sig.phase = 'green'; sig.timeRemainingS = 20; sig.hasEmergencyVehicle = true;
      }
    }
    state.aiLog = `🚑 Manual AMB from ${hospital.name} → ${junc.name}`;
  }

  spawnVehicleSync(state.vehicles, {
    id:              ambId,
    type:            'ambulance',
    fromJunctionId:  path[0],
    toJunctionId:    path[1],
    roadId:          road.id,
    startLat:        startJunc.lat,
    startLon:        startJunc.lon,
    color:           '#ffffff',
    pathJunctionIds: path,
    accidentId:      undefined,
    targetHospitalId: hospital.id,
  });
}
