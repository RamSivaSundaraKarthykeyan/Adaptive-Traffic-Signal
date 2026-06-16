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
  signals:      Map<string, SignalState>;
  vehicles:     Map<string, VehicleState>;
  accidents:    Map<string, AccidentEvent>;
  messageLog:   SignalMessage[];
  densityMap:   Map<string, number>; // roadId → 0–1
  elapsed:      number;
  aiLog:        string;
  accidentCount:number;
  resolvedCount:number;
  totalWait:    number;
  clearedCount: number;
  ambCleared:   number;
  fireCleared:  number;
}

/** Phase starve timers per signal */
const phaseStarveNS = new Map<string, number>();
const phaseStarveEW = new Map<string, number>();

let vehicleIdCtr = 0;
const VEHICLE_COLORS = ['#38bdf8','#818cf8','#34d399','#fb923c','#f472b6','#facc15','#a78bfa','#67e8f9'];

// ── Initialise ────────────────────────────────────────────────────────────

export function initEngine(): EngineState {
  const signals = new Map<string, SignalState>();
  for (const j of JUNCTIONS) {
    signals.set(j.id, {
      signalId: j.id,
      phase: Math.random() > 0.5 ? 'green' : 'red',
      timeRemainingS: 20 + Math.random() * 20,
      greenDurationS: 25,
      queueNS: Math.floor(Math.random() * 3),
      queueEW: Math.floor(Math.random() * 3),
      nextPredictedPhase: 'green',
      nextPredictedDurationS: 25,
      hasEmergencyVehicle: false,
    });
    phaseStarveNS.set(j.id, 0);
    phaseStarveEW.set(j.id, 0);
  }

  return {
    signals,
    vehicles:     new Map(),
    accidents:    new Map(),
    messageLog:   [],
    densityMap:   new Map(),
    elapsed:      0,
    aiLog:        'AI optimizer initialising…',
    accidentCount:0,
    resolvedCount:0,
    totalWait:    0,
    clearedCount: 0,
    ambCleared:   0,
    fireCleared:  0,
  };
}

// ── Main tick ─────────────────────────────────────────────────────────────

const SPAWN_INTERVAL   = 3.5;  // sim-seconds between spawns
let   nextSpawnT       = 0;
const ACCIDENT_CHANCE  = 0.004; // per junction per second
const YELLOW_DURATION  = 3;     // seconds

export function tick(state: EngineState, dtReal: number): EngineState {
  const dt = dtReal * 3; // 3× sim speed

  state.elapsed += dt;

  // 1. AI signal optimizer
  tickSignals(state, dt);

  // 2. Spawn traffic
  nextSpawnT -= dt;
  if (nextSpawnT <= 0) {
    nextSpawnT = SPAWN_INTERVAL + (Math.random() - 0.5) * 1.5;
    spawnTraffic(state);
  }

  // 3. Move vehicles
  tickVehicles(state, dt);

  // 4. Update density
  updateDensity(state);

  // 5. Maybe trigger accident
  if (state.accidents.size - resolvedCount(state) < 3) {
    for (const j of JUNCTIONS) {
      if (Math.random() < ACCIDENT_CHANCE * dt) {
        handleAccidentTrigger(state, j.id);
        break;
      }
    }
  }

  return state;
}

function resolvedCount(state: EngineState): number {
  let c = 0;
  for (const a of state.accidents.values()) if (a.resolved) c++;
  return c;
}

// ── Signal state machine ──────────────────────────────────────────────────

function tickSignals(state: EngineState, dt: number) {
  for (const [jId, sig] of state.signals) {
    const j = JUNCTIONS.find(j => j.id === jId)!;
    
    sig.timeRemainingS = Math.max(0, sig.timeRemainingS - dt);

    // Starvation tracking
    if (sig.phase === 'green') {
      phaseStarveNS.set(jId, 0);
      phaseStarveEW.set(jId, (phaseStarveEW.get(jId) ?? 0) + dt);
    } else if (sig.phase === 'red') {
      phaseStarveEW.set(jId, 0);
      phaseStarveNS.set(jId, (phaseStarveNS.get(jId) ?? 0) + dt);
    }

    // Count vehicles at this junction
    let qNS = 0, qEW = 0, hasEmerNS = false, hasEmerEW = false;
    for (const v of state.vehicles.values()) {
      if (v.toJunctionId === jId && v.state === 'stopped') {
        const fromJ = JUNCTIONS.find(j => j.id === v.fromJunctionId);
        const toJ   = JUNCTIONS.find(j => j.id === jId);
        if (fromJ && toJ) {
          const dx = Math.abs(toJ.x - fromJ.x);
          const dy = Math.abs(toJ.y - fromJ.y);
          if (dy > dx) { qNS++; if (v.sirenActive) hasEmerNS = true; }
          else          { qEW++; if (v.sirenActive) hasEmerEW = true; }
        }
      }
    }
    sig.queueNS = qNS;
    sig.queueEW = qEW;

    // Transition: green → yellow → red → AI picks new green
    if (sig.timeRemainingS <= 0) {
      if (sig.phase === 'green') {
        sig.phase = 'yellow';
        sig.timeRemainingS = YELLOW_DURATION;
      } else if (sig.phase === 'yellow') {
        sig.phase = 'red';
        sig.timeRemainingS = 2; // brief all-red
      } else {
        // AI optimizer picks next phase
        const opt = getAIOptimization({
          junctionId: jId,
          queueNS: sig.queueNS,
          queueEW: sig.queueEW,
          hasEmergencyNS: hasEmerNS,
          hasEmergencyEW: hasEmerEW,
          timeStarvedNS: phaseStarveNS.get(jId) ?? 0,
          timeStarvedEW: phaseStarveEW.get(jId) ?? 0,
          capacity: j.capacity,
        });

        sig.phase = 'green';
        sig.greenDurationS = opt.greenDurationS;
        sig.timeRemainingS = opt.greenDurationS;
        sig.nextPredictedPhase = 'red';
        sig.nextPredictedDurationS = 30;
        sig.hasEmergencyVehicle = hasEmerNS || hasEmerEW;
        sig.emergencyDirection   = hasEmerNS ? 'NS' : hasEmerEW ? 'EW' : undefined;
        state.aiLog = opt.reasoning;

        // Sync nearby signals
        propagatePhaseSync(state, jId, opt.phase);
      }
    }
  }
}

function propagatePhaseSync(state: EngineState, fromJId: string, phase: 'NS' | 'EW') {
  // Signal tells its neighbors what phase it switched to so they can coordinate
  const neighbors = (GRAPH.get(fromJId) ?? []).map(e => e.toId);
  for (const nId of neighbors.slice(0, 2)) {
    signalCommunicate(
      state.messageLog,
      fromJId,
      nId,
      'PHASE_SYNC',
      { phase, sourceJunction: fromJId }
    );
  }
}

// ── Traffic spawning ──────────────────────────────────────────────────────

function spawnTraffic(state: EngineState) {
  const startJ = JUNCTIONS[Math.floor(Math.random() * JUNCTIONS.length)];
  let   endJ   = JUNCTIONS[Math.floor(Math.random() * JUNCTIONS.length)];
  if (endJ.id === startJ.id) endJ = JUNCTIONS[(JUNCTIONS.indexOf(startJ) + 1) % JUNCTIONS.length];

  const path = findPath(startJ.id, endJ.id);
  if (path.length < 2) return;

  const road = getRoadBetween(path[0], path[1]);
  if (!road) return;

  const isAmb = Math.random() < 0.04;
  const isFire = Math.random() < 0.02;
  const type: VehicleState['type'] = isFire ? 'fire_engine' : isAmb ? 'ambulance' : 'car';

  spawnVehicle(state.vehicles, {
    id: `V-${++vehicleIdCtr}`,
    type,
    fromJunctionId: path[0],
    toJunctionId:   path[1],
    roadId: road.id,
    startX: startJ.x,
    startY: startJ.y,
    color: type === 'fire_engine' ? '#f97316'
         : type === 'ambulance'   ? '#ffffff'
         : VEHICLE_COLORS[Math.floor(Math.random() * VEHICLE_COLORS.length)],
    pathJunctionIds: path,
    accidentId: undefined,
    targetHospitalId: undefined,
  });
}

// ── Vehicle movement ──────────────────────────────────────────────────────

function tickVehicles(state: EngineState, dt: number) {
  const toRemove: string[] = [];

  for (const [vid, v] of state.vehicles) {
    const pathIds = v.pathJunctionIds ?? [];
    const pathIdx = v.currentPathIndex ?? 0;

    if (v.state === 'arrived') { toRemove.push(vid); continue; }

    const toJ = JUNCTIONS.find(j => j.id === v.toJunctionId);
    if (!toJ) { toRemove.push(vid); continue; }

    // Distance to target junction
    const dx = toJ.x - v.x;
    const dy = toJ.y - v.y;
    const dist = Math.hypot(dx, dy);

    // Check signal at destination junction
    const sig = state.signals.get(v.toJunctionId);
    const isEmergency = v.sirenActive;
    const signalGreen = !sig || sig.phase === 'green';

    const STOP_THRESHOLD = 18;

    if (dist <= STOP_THRESHOLD && !signalGreen && !isEmergency) {
      // Stop at red
      v.state = 'stopped';
      v.waitSecs += dt;
    } else {
      v.state = 'moving';
      const moveSpeed = isEmergency ? v.speed * 1.3 : v.speed;
      const step = Math.min(dist, moveSpeed * dt);
      if (dist > 1) {
        v.x += (dx / dist) * step;
        v.y += (dy / dist) * step;
      }
      v.progress = 1 - (dist / 100);

      // Arrived at junction
      if (dist < 5) {
        const nextIdx = pathIdx + 1;
        if (nextIdx < pathIds.length - 1) {
          // Move to next segment
          const nextFrom = pathIds[nextIdx];
          const nextTo   = pathIds[nextIdx + 1];
          const road     = getRoadBetween(nextFrom, nextTo);
          if (road) {
            v.fromJunctionId  = nextFrom;
            v.toJunctionId    = nextTo;
            v.roadId          = road.id;
            v.currentPathIndex = nextIdx;
            v.progress         = 0;
          } else {
            v.state = 'arrived';
          }
        } else {
          // Final destination
          if (v.type === 'ambulance' && v.accidentId) {
            const acc = state.accidents.get(v.accidentId!);
            if (acc && !acc.resolved) {
              acc.resolved = true;
              state.resolvedCount++;
              state.ambCleared++;
              signalCommunicate(state.messageLog, vid, v.toJunctionId, 'EMERGENCY_DONE', {
                vehicleType: 'ambulance', hospitalId: v.targetHospitalId
              });
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
      }
    }
  }

  for (const id of toRemove) state.vehicles.delete(id);
}

// ── Density calculation ───────────────────────────────────────────────────

function updateDensity(state: EngineState) {
  const counts = new Map<string, number>();
  for (const v of state.vehicles.values()) {
    counts.set(v.roadId, (counts.get(v.roadId) ?? 0) + 1);
  }
  const maxCap = 12;
  for (const r of ROADS) {
    const c = counts.get(r.id) ?? 0;
    state.densityMap.set(r.id, Math.min(1, c / maxCap));
  }
}

// ── Accident handling ─────────────────────────────────────────────────────

async function handleAccidentTrigger(state: EngineState, junctionId: string) {
  const acc = await triggerAccident(state.accidents, junctionId);
  state.accidentCount++;

  // Broadcast accident alert to neighbors
  const neighbors = (GRAPH.get(junctionId) ?? []).map(e => e.toId);
  for (const nId of neighbors) {
    signalCommunicate(state.messageLog, junctionId, nId, 'ACCIDENT_ALERT', {
      accidentId: acc.id, severity: acc.severity
    });
  }

  // Find nearest hospital
  const junc = JUNCTIONS.find(j => j.id === junctionId)!;
  const hospital = await getNearestHospital(junc.x, junc.y);

  // Dispatch ambulance
  const { vehicleId: ambId } = await dispatchAmbulance(state.accidents, acc.id, hospital.id);
  acc.ambulanceId = ambId;

  // Find path from accident to hospital
  const hospJunc = JUNCTIONS.find(j => j.id === hospital.nearestJunctionId) ?? JUNCTIONS[0];
  const path     = findPath(junctionId, hospJunc.id);

  if (path.length >= 2) {
    await requestPathClearance(state.signals, state.messageLog, ambId, 'ambulance', path);
    const road = getRoadBetween(path[0], path[1]);
    if (road) {
      await spawnVehicle(state.vehicles, {
        id: ambId,
        type: 'ambulance',
        fromJunctionId: path[0],
        toJunctionId:   path[1],
        roadId: road.id,
        startX: junc.x,
        startY: junc.y,
        color: '#ffffff',
        pathJunctionIds: path,
        accidentId: acc.id,
        targetHospitalId: hospital.id,
      });
    }
  }

  // If critical — also dispatch fire engine
  if (acc.severity === 'critical') {
    const { vehicleId: fireId } = await dispatchFireEngine(state.accidents, acc.id);
    if (path.length >= 2) {
      await requestPathClearance(state.signals, state.messageLog, fireId, 'fire_engine', path);
      const road = getRoadBetween(path[0], path[1]);
      if (road) {
        await spawnVehicle(state.vehicles, {
          id: fireId,
          type: 'fire_engine',
          fromJunctionId: path[0],
          toJunctionId:   path[1],
          roadId: road.id,
          startX: junc.x + 5,
          startY: junc.y + 5,
          color: '#f97316',
          pathJunctionIds: path,
          accidentId: acc.id,
          targetHospitalId: hospital.id,
        });
      }
    }
  }

  state.aiLog = `🚨 ACCIDENT at ${JUNCTIONS.find(j => j.id === junctionId)?.name} — Dispatching to ${hospital.name}`;
}
