// ─── Simulation Engine ─────────────────────────────────────────────────────
// Core tick logic: signal state machine, vehicle movement, AI optimizer,
// accident triggers, emergency dispatch, and inter-signal communication.

import {
  JUNCTIONS, ROADS, HOSPITALS, Junction, Road
} from './data/chennaiData';
import {
  SignalState, VehicleState, AccidentEvent, SignalMessage,
  triggerAccident, dispatchAmbulance, dispatchFireEngine,
  spawnVehicle, requestPathClearance, signalCommunicate,
  getAIOptimization, getNearestHospital
} from './SimulationAPIBus';

// ── Graph adjacency (for pathfinding) ────────────────────────────────────

interface GraphEdge { toId: string; roadId: string; cost: number; }
const GRAPH = new Map<string, GraphEdge[]>();

function buildGraph() {
  for (const j of JUNCTIONS) GRAPH.set(j.id, []);
  for (const r of ROADS) {
    const from = GRAPH.get(r.from);
    const to   = GRAPH.get(r.to);
    if (from) from.push({ toId: r.to, roadId: r.id, cost: r.distanceM });
    if (to)   to.push({ toId: r.from, roadId: r.id, cost: r.distanceM });
  }
}
buildGraph();

/** A* shortest path — returns ordered list of junction IDs */
function findPath(fromId: string, toId: string): string[] {
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

  // Reconstruct
  const path: string[] = [];
  let cur = toId;
  while (prev.has(cur)) { path.unshift(cur); cur = prev.get(cur)!; }
  if (path.length > 0) path.unshift(fromId);
  return path;
}

/** Given two junction ids, find the road segment between them */
function getRoadBetween(fromId: string, toId: string): Road | undefined {
  return ROADS.find(r =>
    (r.from === fromId && r.to === toId) ||
    (r.from === toId   && r.to === fromId)
  );
}

// ── Engine state ──────────────────────────────────────────────────────────

export interface EngineState {
  isTraditional: boolean;
  signals:       Map<string, SignalState>;
  vehicles:      Map<string, VehicleState>;
  accidents:     Map<string, AccidentEvent>;
  messageLog:    SignalMessage[];
  densityMap:    Map<string, number>;   // roadId → 0–1
  pendingDispatch: { accidentId: string; dispatchAtSimTime: number }[]; // traditional mode delay queue
  elapsed:       number;
  simTime:       number;                // simulated time (elapsed * 3)
  aiLog:         string;
  accidentCount: number;
  resolvedCount: number;
  totalWait:     number;
  clearedCount:  number;
  ambCleared:    number;
  fireCleared:   number;
}

/** Phase starve timers per signal — separate maps for AI vs Traditional to avoid bleed */
const aiPhaseStarveNS  = new Map<string, number>();
const aiPhaseStarveEW  = new Map<string, number>();
const tradPhaseStarveNS = new Map<string, number>();
const tradPhaseStarveEW = new Map<string, number>();

let vehicleIdCtr = 0;
const VEHICLE_COLORS = ['#38bdf8','#818cf8','#34d399','#fb923c','#f472b6','#facc15','#a78bfa','#67e8f9'];

// ── Initialise ────────────────────────────────────────────────────────────

export function initEngine(isTraditional: boolean = false): EngineState {
  const signals = new Map<string, SignalState>();
  for (const j of JUNCTIONS) {
    if (isTraditional) {
      // Stagger traditional signals across the full cycle so they don't all
      // flip simultaneously — gives a natural, out-of-phase look.
      // Full cycle = TRAD_GREEN(60) + YELLOW(3) + TRAD_RED(60) = 123s
      const offset = Math.random() * (TRAD_GREEN + YELLOW_DURATION + TRAD_RED);
      let phase: 'green' | 'yellow' | 'red';
      let timeRemaining: number;
      if (offset < TRAD_GREEN) {
        phase = 'green'; timeRemaining = TRAD_GREEN - offset;
      } else if (offset < TRAD_GREEN + YELLOW_DURATION) {
        phase = 'yellow'; timeRemaining = TRAD_GREEN + YELLOW_DURATION - offset;
      } else {
        phase = 'red'; timeRemaining = TRAD_GREEN + YELLOW_DURATION + TRAD_RED - offset;
      }
      signals.set(j.id, {
        signalId: j.id,
        phase,
        timeRemainingS: timeRemaining,
        greenDurationS: TRAD_GREEN,
        queueNS: 0,
        queueEW: 0,
        nextPredictedPhase: 'red',
        nextPredictedDurationS: TRAD_RED,
        hasEmergencyVehicle: false,
      });
      tradPhaseStarveNS.set(j.id, 0);
      tradPhaseStarveEW.set(j.id, 0);
    } else {
      signals.set(j.id, {
        signalId: j.id,
        phase: Math.random() > 0.5 ? 'green' : 'red',
        timeRemainingS: 10 + Math.random() * 20,
        greenDurationS: 30,
        queueNS: 0,
        queueEW: 0,
        nextPredictedPhase: 'green',
        nextPredictedDurationS: 30,
        hasEmergencyVehicle: false,
      });
      aiPhaseStarveNS.set(j.id, 0);
      aiPhaseStarveEW.set(j.id, 0);
    }
  }

  return {
    isTraditional,
    signals,
    vehicles:        new Map(),
    accidents:       new Map(),
    messageLog:      [],
    densityMap:      new Map(),
    pendingDispatch: [],
    elapsed:         0,
    simTime:         0,
    aiLog:           isTraditional ? 'Traditional Fixed-Timer Active' : 'AI RL-PPO Optimizer Ready',
    accidentCount:   0,
    resolvedCount:   0,
    totalWait:       0,
    clearedCount:    0,
    ambCleared:      0,
    fireCleared:     0,
  };
}

// ── Main tick ─────────────────────────────────────────────────────────────

const YELLOW_DURATION = 3;

export type SimulationEvent =
  | { type: 'spawn'; vehicle: Parameters<typeof spawnVehicle>[1] }
  | { type: 'accident'; junctionId: string }
  | { type: 'spawn_ambulance'; junctionId: string };

export function tick(state: EngineState, dtReal: number, events: SimulationEvent[] = []): EngineState {
  const dt = dtReal * 3; // 3× sim speed

  state.elapsed += dtReal;
  state.simTime += dt;

  // 1. Signal optimizer
  tickSignals(state, dt);

  // 2. Process external events (Spawns & Accidents)
  for (const event of events) {
    if (event.type === 'spawn') {
      spawnVehicle(state.vehicles, event.vehicle);
    } else if (event.type === 'accident') {
      handleAccidentTrigger(state, event.junctionId);
    } else if (event.type === 'spawn_ambulance') {
      handleManualAmbulance(state, event.junctionId);
    }
  }

  // 3. Process pending dispatch (traditional mode only — delayed manual dispatch)
  if (state.isTraditional) {
    const ready = state.pendingDispatch.filter(p => state.simTime >= p.dispatchAtSimTime);
    state.pendingDispatch = state.pendingDispatch.filter(p => state.simTime < p.dispatchAtSimTime);
    for (const pd of ready) {
      const acc = state.accidents.get(pd.accidentId);
      if (acc && !acc.resolved) {
        doDispatch(state, acc);
      }
    }
  }

  // 4. Move vehicles
  tickVehicles(state, dt);

  // 5. Update density
  updateDensity(state);

  return state;
}

// ── Signal state machine ──────────────────────────────────────────────────

const AI_MAX_GREEN = 90;  // AI can go up to 90s based on queue
const AI_MIN_GREEN = 8;   // AI minimum green
const AI_MAX_STALL = 55;  // Force switch after 55s to prevent starvation
const TRAD_GREEN   = 60;  // Traditional: 60s green (realistic Chennai signal)
const TRAD_RED     = 60;  // Traditional: 60s red (realistic Chennai signal)

function tickSignals(state: EngineState, dt: number) {
  const starveNS = state.isTraditional ? tradPhaseStarveNS : aiPhaseStarveNS;
  const starveEW = state.isTraditional ? tradPhaseStarveEW : aiPhaseStarveEW;

  for (const [jId, sig] of state.signals) {
    const j = JUNCTIONS.find(j => j.id === jId)!;

    sig.timeRemainingS = Math.max(0, sig.timeRemainingS - dt);

    // Starvation tracking
    if (sig.phase === 'green') {
      starveNS.set(jId, 0);
      starveEW.set(jId, (starveEW.get(jId) ?? 0) + dt);
    } else if (sig.phase === 'red') {
      starveEW.set(jId, 0);
      starveNS.set(jId, (starveNS.get(jId) ?? 0) + dt);
    }

    // Count vehicles at this junction
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

    // ── AI ONLY: Immediate emergency override (don't wait for phase end) ──
    if (!state.isTraditional && sig.phase !== 'green') {
      if (hasEmerNS || hasEmerEW) {
        // Force green immediately for emergency
        sig.phase = 'green';
        sig.timeRemainingS = 25;
        sig.greenDurationS = 25;
        state.aiLog = `🚑 EMERGENCY OVERRIDE @ ${j.name} → INSTANT GREEN`;
        continue; // skip normal phase logic
      }
    }

    // ── AI ONLY: Anti-starvation hard override ──
    if (!state.isTraditional && sig.phase === 'green') {
      const stall = starveNS.get(jId) ?? 0;
      if (stall > AI_MAX_STALL && sig.timeRemainingS > 5) {
        // Force a quick yellow to switch
        sig.phase = 'yellow';
        sig.timeRemainingS = YELLOW_DURATION;
        continue;
      }
    }

    if (sig.timeRemainingS <= 0) {
      if (sig.phase === 'green') {
        sig.phase = 'yellow';
        sig.timeRemainingS = YELLOW_DURATION;
      } else if (sig.phase === 'yellow') {
        if (state.isTraditional) {
          // Traditional: full red phase, no AI shortcuts
          sig.phase = 'red';
          sig.timeRemainingS = TRAD_RED;
          sig.nextPredictedPhase = 'green';
          sig.nextPredictedDurationS = TRAD_GREEN;
        } else {
          sig.phase = 'red';
          sig.timeRemainingS = 2; // AI: brief all-red then optimizer decides
        }
      } else {
        if (state.isTraditional) {
          // Traditional: fixed 60s green, no adaptation, no AI
          sig.phase = 'green';
          sig.greenDurationS = TRAD_GREEN;
          sig.timeRemainingS = TRAD_GREEN;
          sig.nextPredictedPhase = 'red';
          sig.nextPredictedDurationS = TRAD_RED;
          sig.hasEmergencyVehicle = false;
          sig.emergencyDirection = undefined;
        } else {
          // ── AI optimizer: RL-PPO heuristic ──
          const opt = getAIOptimization({
            junctionId: jId,
            queueNS: sig.queueNS,
            queueEW: sig.queueEW,
            hasEmergencyNS: hasEmerNS,
            hasEmergencyEW: hasEmerEW,
            timeStarvedNS: starveNS.get(jId) ?? 0,
            timeStarvedEW: starveEW.get(jId) ?? 0,
            capacity: j.capacity,
          });

          sig.phase = 'green';
          sig.greenDurationS = opt.greenDurationS;
          sig.timeRemainingS = opt.greenDurationS;
          sig.nextPredictedPhase = 'red';
          sig.nextPredictedDurationS = 30;
          state.aiLog = opt.reasoning;

          // AI: Proactively sync neighboring signals for green-wave
          propagateGreenWave(state, jId, opt.phase);
        }
      }
    }
  }
}

/**
 * AI GREEN WAVE: When a signal turns green, hint adjacent signals to prepare
 * for the incoming wave of vehicles. This staggers timing so vehicles don't
 * hit red at the next junction.
 */
function propagateGreenWave(state: EngineState, fromJId: string, phase: 'NS' | 'EW') {
  const neighbors = (GRAPH.get(fromJId) ?? []).map(e => e.toId);
  for (const nId of neighbors) {
    const neighborSig = state.signals.get(nId);
    if (!neighborSig) continue;
    // If neighbor is red and about to serve a long wait, give it a head-start nudge
    if (neighborSig.phase === 'red' && neighborSig.timeRemainingS > 25) {
      neighborSig.timeRemainingS = Math.max(5, neighborSig.timeRemainingS - 8);
    }
    signalCommunicate(
      state.messageLog, fromJId, nId, 'PHASE_SYNC',
      { phase, wave: true }
    );
  }
}

// ── Traffic spawning ──────────────────────────────────────────────────────

export function generateSpawnEvent(): SimulationEvent | null {
  const startJ = JUNCTIONS[Math.floor(Math.random() * JUNCTIONS.length)];
  let   endJ   = JUNCTIONS[Math.floor(Math.random() * JUNCTIONS.length)];
  if (endJ.id === startJ.id) endJ = JUNCTIONS[(JUNCTIONS.indexOf(startJ) + 1) % JUNCTIONS.length];

  const path = findPath(startJ.id, endJ.id);
  if (path.length < 2) return null;

  const road = getRoadBetween(path[0], path[1]);
  if (!road) return null;

  // Only cars in normal spawn – ambulances are only for accidents
  const type: VehicleState['type'] = 'car';

  return {
    type: 'spawn',
    vehicle: {
      id: `V-${++vehicleIdCtr}`,
      type,
      fromJunctionId: path[0],
      toJunctionId:   path[1],
      roadId: road.id,
      startLat: startJ.lat,
      startLon: startJ.lon,
      color: VEHICLE_COLORS[Math.floor(Math.random() * VEHICLE_COLORS.length)],
      pathJunctionIds: path,
      accidentId: undefined,
      targetHospitalId: undefined,
    }
  };
}

// ── Vehicle movement ──────────────────────────────────────────────────────

function tickVehicles(state: EngineState, dt: number) {
  const toRemove: string[] = [];

  for (const [vid, v] of state.vehicles) {
    const pathIds = v.pathJunctionIds ?? [];
    const pathIdx = v.currentPathIndex ?? 0;

    if (v.state === 'arrived') { toRemove.push(vid); continue; }

    const fromJ = JUNCTIONS.find(j => j.id === v.fromJunctionId);
    const toJ   = JUNCTIONS.find(j => j.id === v.toJunctionId);
    const road  = ROADS.find(r => r.id === v.roadId);

    if (!toJ || !fromJ || !road) { toRemove.push(vid); continue; }

    const sig = state.signals.get(v.toJunctionId);
    const isEmergency = v.sirenActive;
    const signalGreen = !sig || sig.phase === 'green';

    // Speed: emergency vehicles move faster; traditional ambulance is slower (no priority)
    let baseSpeed = v.speed;
    if (isEmergency && !state.isTraditional) baseSpeed *= 1.5; // AI: fast with green wave
    if (isEmergency && state.isTraditional)  baseSpeed *= 1.1; // Traditional: slightly faster but no clear path

    const progressStep = (baseSpeed * dt) / Math.max(10, road.distanceM);
    const STOP_THRESHOLD = 0.90;

    if (v.progress >= STOP_THRESHOLD && !signalGreen && !isEmergency) {
      v.state = 'stopped';
      v.progress = STOP_THRESHOLD;
      v.waitSecs += dt;
    } else {
      v.state = 'moving';
      v.progress = Math.min(v.progress + progressStep, 1.0);

      // Update lat/lon along road path
      if (road.path && road.path.length >= 2) {
        const numSegments = road.path.length - 1;
        const scaledProgress = v.progress * numSegments;
        const segIdx = Math.min(Math.floor(scaledProgress), numSegments - 1);
        const segProg = scaledProgress - segIdx;
        const p1 = road.path[segIdx];
        const p2 = road.path[segIdx + 1];
        v.lat = p1[0] + (p2[0] - p1[0]) * segProg;
        v.lon = p1[1] + (p2[1] - p1[1]) * segProg;
      } else {
        v.lat = fromJ.lat + (toJ.lat - fromJ.lat) * v.progress;
        v.lon = fromJ.lon + (toJ.lon - fromJ.lon) * v.progress;
      }

      // Arrived at junction
      if (v.progress >= 1) {
        const nextIdx = pathIdx + 1;
        if (nextIdx < pathIds.length - 1) {
          const nextFrom = pathIds[nextIdx];
          const nextTo   = pathIds[nextIdx + 1];
          const nextRoad = getRoadBetween(nextFrom, nextTo);
          if (nextRoad) {
            v.fromJunctionId   = nextFrom;
            v.toJunctionId     = nextTo;
            v.roadId           = nextRoad.id;
            v.currentPathIndex = nextIdx;
            v.progress         = 0;
            const nextFromJ = JUNCTIONS.find(j => j.id === nextFrom);
            if (nextFromJ) { v.lat = nextFromJ.lat; v.lon = nextFromJ.lon; }
          } else {
            v.state = 'arrived';
          }
        } else {
          // ── Reached final destination ──
          onVehicleArrived(state, vid, v);
        }
      }
    }
  }

  for (const id of toRemove) state.vehicles.delete(id);
}

/** Called when a vehicle reaches the end of its path */
function onVehicleArrived(state: EngineState, vid: string, v: VehicleState) {
  if (v.type === 'ambulance' && v.accidentId) {
    const acc = state.accidents.get(v.accidentId!);

    if (acc && !acc.resolved && v.targetHospitalId === undefined) {
      // ── Phase 1: Ambulance reached accident site ──
      // Mark accident resolved and send ambulance BACK to hospital
      acc.resolved = true;
      state.resolvedCount++;
      signalCommunicate(state.messageLog, vid, v.toJunctionId, 'EMERGENCY_DONE', {
        vehicleType: 'ambulance', phase: 'at_scene'
      });

      // Find nearest hospital to current position for return trip
      getNearestHospital(v.lat, v.lon).then(hospital => {
        const hospJunc = JUNCTIONS.find(j => j.id === hospital.nearestJunctionId) ?? JUNCTIONS[0];
        const returnPath = findPath(v.toJunctionId, hospJunc.id);
        if (returnPath.length >= 2) {
          const returnRoad = getRoadBetween(returnPath[0], returnPath[1]);
          if (returnRoad) {
            // Re-use same vehicle for return trip
            v.fromJunctionId   = returnPath[0];
            v.toJunctionId     = returnPath[1];
            v.roadId           = returnRoad.id;
            v.currentPathIndex = 0;
            v.progress         = 0;
            v.pathJunctionIds  = returnPath;
            v.targetHospitalId = hospital.id; // mark so we know it's the return leg
            v.state            = 'moving';
            return; // don't mark arrived yet
          }
        }
        // Can't find return path, just clear
        state.ambCleared++;
        state.totalWait  += v.waitSecs;
        state.clearedCount++;
        v.state = 'arrived';
      });
      return; // wait for promise
    } else if (acc && v.targetHospitalId !== undefined) {
      // ── Phase 2: Ambulance returned to hospital ──
      state.ambCleared++;
      signalCommunicate(state.messageLog, vid, v.toJunctionId, 'EMERGENCY_DONE', {
        vehicleType: 'ambulance', phase: 'returned_to_hospital'
      });
      state.totalWait  += v.waitSecs;
      state.clearedCount++;
      v.state = 'arrived';
      return;
    }
  }

  if (v.type === 'fire_engine' && v.accidentId) {
    state.fireCleared++;
    signalCommunicate(state.messageLog, vid, v.toJunctionId, 'EMERGENCY_DONE', {
      vehicleType: 'fire_engine'
    });
  }

  state.totalWait  += v.waitSecs;
  state.clearedCount++;
  v.state = 'arrived';
}

// ── Density calculation ───────────────────────────────────────────────────

function updateDensity(state: EngineState) {
  const counts = new Map<string, number>();
  for (const v of state.vehicles.values()) {
    counts.set(v.roadId, (counts.get(v.roadId) ?? 0) + 1);
  }
  const maxCap = 10;
  for (const r of ROADS) {
    const c = counts.get(r.id) ?? 0;
    state.densityMap.set(r.id, Math.min(1, c / maxCap));
  }
}

// ── Accident handling ─────────────────────────────────────────────────────

async function handleAccidentTrigger(state: EngineState, junctionId: string) {
  const acc = await triggerAccident(state.accidents, junctionId);
  state.accidentCount++;

  const jName = JUNCTIONS.find(j => j.id === junctionId)?.name ?? junctionId;

  // Broadcast accident alert to all neighbors
  const neighbors = (GRAPH.get(junctionId) ?? []).map(e => e.toId);
  for (const nId of neighbors) {
    signalCommunicate(state.messageLog, junctionId, nId, 'ACCIDENT_ALERT', {
      accidentId: acc.id, severity: acc.severity
    });
  }

  if (state.isTraditional) {
    // ── Traditional: Delayed dispatch (15-25 sim-seconds of "manual detection") ──
    const delay = 15 + Math.random() * 10;
    state.pendingDispatch.push({
      accidentId: acc.id,
      dispatchAtSimTime: state.simTime + delay,
    });
    // No path clearance, no AI optimization — just waiting
  } else {
    // ── AI: Immediate dispatch + path clearance + signal override ──
    doDispatch(state, acc);

    // AI proactively clears all signals along detected accident paths
    const junc = JUNCTIONS.find(j => j.id === junctionId)!;
    const hospital = await getNearestHospital(junc.lat, junc.lon);
    const hospJunc = JUNCTIONS.find(j => j.id === hospital.nearestJunctionId) ?? JUNCTIONS[0];
    const clearPath = findPath(hospJunc.id, junctionId); // hospital → accident (ambulance route)
    if (clearPath.length >= 2) {
      await requestPathClearance(state.signals, state.messageLog, `PRECLEAR-${acc.id}`, 'ambulance', clearPath);
    }

    state.aiLog = `🚨 AI DETECTED @ ${jName} — Instant dispatch + path cleared`;
  }
}

/** Actually dispatch ambulance (and fire engine if critical) */
async function doDispatch(state: EngineState, acc: AccidentEvent) {
  // ── Guard: never dispatch twice for the same accident ──
  if (acc.ambulanceId) return;

  const junctionId = acc.junctionId;
  const junc = JUNCTIONS.find(j => j.id === junctionId)!;
  const hospital = await getNearestHospital(junc.lat, junc.lon);
  const hospJunc = JUNCTIONS.find(j => j.id === hospital.nearestJunctionId) ?? JUNCTIONS[0];

  // Path: hospital → accident
  const path = findPath(hospJunc.id, junctionId);
  if (path.length < 2) return;

  // Resolve the actual start junction from path[0] (may differ from hospJunc if graph routing diverges)
  const startJunc = JUNCTIONS.find(j => j.id === path[0]) ?? hospJunc;

  const { vehicleId: ambId } = await dispatchAmbulance(state.accidents, acc.id, hospital.id);
  acc.ambulanceId = ambId;

  const road = getRoadBetween(path[0], path[1]);
  if (road) {
    await spawnVehicle(state.vehicles, {
      id: ambId,
      type: 'ambulance',
      fromJunctionId: path[0],
      toJunctionId:   path[1],
      roadId: road.id,
      startLat: startJunc.lat,
      startLon: startJunc.lon,
      color: '#ffffff',
      pathJunctionIds: path,
      accidentId: acc.id,
      targetHospitalId: undefined, // undefined = still heading TO accident
    });
  }

  // Critical accidents also get a fire engine
  if (acc.severity === 'critical') {
    const { vehicleId: fireId } = await dispatchFireEngine(state.accidents, acc.id);
    const fireRoad = getRoadBetween(path[0], path[1]);
    if (fireRoad) {
      await spawnVehicle(state.vehicles, {
        id: fireId,
        type: 'fire_engine',
        fromJunctionId: path[0],
        toJunctionId:   path[1],
        roadId: fireRoad.id,
        startLat: hospJunc.lat,
        startLon: hospJunc.lon,
        color: '#f97316',
        pathJunctionIds: path,
        accidentId: acc.id,
        targetHospitalId: hospital.id,
      });
    }
  }
}

/** Manual ambulance spawn from nearest hospital to a given junction */
async function handleManualAmbulance(state: EngineState, junctionId: string) {
  const junc = JUNCTIONS.find(j => j.id === junctionId) ?? JUNCTIONS[0];
  const hospital = await getNearestHospital(junc.lat, junc.lon);
  const hospJunc = JUNCTIONS.find(j => j.id === hospital.nearestJunctionId) ?? JUNCTIONS[0];
  const path = findPath(hospJunc.id, junctionId);
  if (path.length < 2) return;

  const road = getRoadBetween(path[0], path[1]);
  if (!road) return;

  const ambId = `MANUAL-AMB-${++vehicleIdCtr}`;

  if (!state.isTraditional) {
    await requestPathClearance(state.signals, state.messageLog, ambId, 'ambulance', path);
    state.aiLog = `🚑 Manual Ambulance dispatched from ${hospital.name} → ${junc.name}`;
  }

  await spawnVehicle(state.vehicles, {
    id: ambId,
    type: 'ambulance',
    fromJunctionId: path[0],
    toJunctionId:   path[1],
    roadId: road.id,
    startLat: hospJunc.lat,
    startLon: hospJunc.lon,
    color: '#ffffff',
    pathJunctionIds: path,
    accidentId: undefined,
    targetHospitalId: hospital.id,
  });
}
