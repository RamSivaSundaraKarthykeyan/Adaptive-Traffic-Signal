'use client';
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Brain, Zap, Clock, TrendingUp, Car } from 'lucide-react';

// ── Canvas & geometry constants ───────────────────────────────────────────────
const CW = 460, CH = 460;
const CX = CW / 2, CY = CH / 2;
const ROAD_HALF = 44;
const STOP_DIST = ROAD_HALF + 12;   // stop-line distance from centre
const LANE_OFF  = 13;               // lateral offset for the travel lane

// ── Car constants ─────────────────────────────────────────────────────────────
const CAR_R      = 7;
const CAR_SPEED  = 90;              // px / simulated-second
const CAR_GAP    = CAR_R * 2 + 5;  // spacing between queued cars
const SIM_MULT   = 3;              // simulation runs 3× real time
const SPAWN_INT  = 4.5;            // simulated seconds between spawns

type Dir   = 'N' | 'S' | 'E' | 'W';
type Phase = 'NS' | 'EW';

interface Vehicle {
  id: number; dir: Dir;
  x: number;  y: number;
  state: 'queue' | 'moving' | 'gone';
  waitSecs: number;
  color: string;
}

interface Engine {
  phase:      Phase;
  phaseLeft:  number;   // simulated seconds
  phaseDur:   number;
  vehs:       Vehicle[];
  cleared:    number;
  totalWait:  number;
  idCtr:      number;
  spawnT:     Record<Dir, number>;
  elapsed:    number;
  aiLog:      string;   // last AI decision description
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const DIRS: Dir[] = ['N','S','E','W'];
const COLORS = ['#38bdf8','#818cf8','#34d399','#fb923c','#f472b6','#facc15'];

function dirPhase(d: Dir): Phase { return (d==='N'||d==='S') ? 'NS' : 'EW'; }

function initPos(dir: Dir) {
  switch(dir) {
    case 'N': return { x: CX + LANE_OFF, y: -20 };
    case 'S': return { x: CX - LANE_OFF, y: CH + 20 };
    case 'E': return { x: CW + 20,       y: CY - LANE_OFF };
    case 'W': return { x: -20,           y: CY + LANE_OFF };
  }
}

function stopLine(dir: Dir) {
  switch(dir) {
    case 'N': return { x: CX + LANE_OFF, y: CY - STOP_DIST };
    case 'S': return { x: CX - LANE_OFF, y: CY + STOP_DIST };
    case 'E': return { x: CX + STOP_DIST, y: CY - LANE_OFF };
    case 'W': return { x: CX - STOP_DIST, y: CY + LANE_OFF };
  }
}

function queuePos(dir: Dir, idx: number) {
  const sl = stopLine(dir);
  const s  = CAR_GAP;
  switch(dir) {
    case 'N': return { x: sl.x, y: sl.y - idx * s };
    case 'S': return { x: sl.x, y: sl.y + idx * s };
    case 'E': return { x: sl.x + idx * s, y: sl.y };
    case 'W': return { x: sl.x - idx * s, y: sl.y };
  }
}

function isGone(dir: Dir, x: number, y: number) {
  if (dir==='N') return y > CH + 20;
  if (dir==='S') return y < -20;
  if (dir==='E') return x < -20;
  if (dir==='W') return x > CW + 20;
  return false;
}

function moveVeh(v: Vehicle, dt: number) {
  if (v.dir==='N') v.y += CAR_SPEED * dt;
  if (v.dir==='S') v.y -= CAR_SPEED * dt;
  if (v.dir==='E') v.x -= CAR_SPEED * dt;
  if (v.dir==='W') v.x += CAR_SPEED * dt;
}

// ── Engine step ───────────────────────────────────────────────────────────────
function stepEngine(eng: Engine, dtReal: number, isAI: boolean): Engine {
  const dt = dtReal * SIM_MULT;
  const e: Engine = {
    ...eng,
    vehs:    eng.vehs.map(v => ({ ...v })),
    spawnT:  { ...eng.spawnT },
  };

  e.elapsed   += dt;
  e.phaseLeft  = Math.max(0, e.phaseLeft - dt);

  // ── Phase switch ────────────────────────────────────────────────────────────
  if (e.phaseLeft <= 0) {
    const nsQ = e.vehs.filter(v => (v.dir==='N'||v.dir==='S') && v.state==='queue').length;
    const ewQ = e.vehs.filter(v => (v.dir==='E'||v.dir==='W') && v.state==='queue').length;

    if (isAI) {
      const newPhase: Phase = nsQ >= ewQ ? 'NS' : 'EW';
      const bigQ  = Math.max(nsQ, ewQ);
      const dur   = Math.max(12, Math.min(60, bigQ * 6));
      e.phase     = newPhase;
      e.phaseDur  = dur;
      e.phaseLeft = dur;
      e.aiLog     = `AI → ${newPhase} green ${dur}s  (NS:${nsQ} EW:${ewQ})`;
    } else {
      e.phase     = e.phase === 'NS' ? 'EW' : 'NS';
      e.phaseDur  = 30;
      e.phaseLeft = 30;
    }
  }

  // ── Spawn ───────────────────────────────────────────────────────────────────
  DIRS.forEach(dir => {
    e.spawnT[dir] -= dt;
    if (e.spawnT[dir] <= 0) {
      e.spawnT[dir] = SPAWN_INT + (Math.random() - 0.5) * 2;
      const p = initPos(dir);
      e.vehs.push({
        id: e.idCtr++, dir,
        x: p.x, y: p.y,
        state: 'queue',
        waitSecs: 0,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    }
  });

  // ── Build per-direction queues ──────────────────────────────────────────────
  const queued: Record<Dir, Vehicle[]> = { N:[], S:[], E:[], W:[] };
  e.vehs.forEach(v => { if (v.state==='queue') queued[v.dir].push(v); });

  // ── Position queued cars ────────────────────────────────────────────────────
  DIRS.forEach(dir => {
    queued[dir].forEach((v, i) => {
      const qp = queuePos(dir, i);
      v.x = qp.x; v.y = qp.y;
      v.waitSecs += dt;
    });
  });

  // ── Release front car if green ──────────────────────────────────────────────
  DIRS.forEach(dir => {
    if (dirPhase(dir) === e.phase && queued[dir].length > 0) {
      const front = queued[dir][0];
      front.state = 'moving';
      const sl = stopLine(dir);
      front.x = sl.x; front.y = sl.y;
    }
  });

  // ── Move 'moving' cars ──────────────────────────────────────────────────────
  e.vehs.forEach(v => {
    if (v.state !== 'moving') return;
    moveVeh(v, dt);
    if (isGone(v.dir, v.x, v.y)) {
      v.state = 'gone';
      e.cleared++;
      e.totalWait += v.waitSecs;
    }
  });

  // ── Prune gone cars ─────────────────────────────────────────────────────────
  e.vehs = e.vehs.filter(v => v.state !== 'gone');

  return e;
}

// ── Canvas drawing ────────────────────────────────────────────────────────────
function drawScene(ctx: CanvasRenderingContext2D, e: Engine, label: string, isAI: boolean) {
  const { width: W, height: H } = ctx.canvas;
  ctx.clearRect(0, 0, W, H);

  // background
  ctx.fillStyle = '#0b0f1e';
  ctx.fillRect(0, 0, W, H);

  // road surface (cross shape)
  ctx.fillStyle = '#1a1f35';
  ctx.fillRect(0, CY - ROAD_HALF, W, ROAD_HALF * 2);
  ctx.fillRect(CX - ROAD_HALF, 0, ROAD_HALF * 2, H);

  // intersection box
  ctx.fillStyle = '#1e2440';
  ctx.fillRect(CX - ROAD_HALF, CY - ROAD_HALF, ROAD_HALF * 2, ROAD_HALF * 2);

  // lane centre dash
  ctx.setLineDash([12, 10]);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(CX, 0); ctx.lineTo(CX, CY - ROAD_HALF);
  ctx.moveTo(CX, CY + ROAD_HALF); ctx.lineTo(CX, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, CY); ctx.lineTo(CX - ROAD_HALF, CY);
  ctx.moveTo(CX + ROAD_HALF, CY); ctx.lineTo(W, CY); ctx.stroke();
  ctx.setLineDash([]);

  // stop lines
  const green = e.phase;
  function stopLineColor(ph: Phase) {
    return green === ph ? '#22c55e' : '#ef4444';
  }
  // N stop line
  ctx.strokeStyle = stopLineColor('NS'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(CX, CY - STOP_DIST); ctx.lineTo(CX + ROAD_HALF, CY - STOP_DIST); ctx.stroke();
  // S stop line
  ctx.beginPath(); ctx.moveTo(CX - ROAD_HALF, CY + STOP_DIST); ctx.lineTo(CX, CY + STOP_DIST); ctx.stroke();
  // E stop line
  ctx.strokeStyle = stopLineColor('EW');
  ctx.beginPath(); ctx.moveTo(CX + STOP_DIST, CY - ROAD_HALF); ctx.lineTo(CX + STOP_DIST, CY); ctx.stroke();
  // W stop line
  ctx.beginPath(); ctx.moveTo(CX - STOP_DIST, CY); ctx.lineTo(CX - STOP_DIST, CY + ROAD_HALF); ctx.stroke();

  // traffic lights (small circle)
  function drawLight(x: number, y: number, ph: Phase) {
    const on = green === ph;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = on ? '#22c55e' : '#ef4444';
    ctx.shadowColor = on ? '#22c55e' : '#ef4444';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  drawLight(CX + ROAD_HALF - 8, CY - ROAD_HALF + 8, 'NS');
  drawLight(CX - ROAD_HALF + 8, CY + ROAD_HALF - 8, 'NS');
  drawLight(CX + ROAD_HALF - 8, CY + ROAD_HALF - 8, 'EW');
  drawLight(CX - ROAD_HALF + 8, CY - ROAD_HALF + 8, 'EW');

  // vehicles
  e.vehs.forEach(v => {
    ctx.beginPath(); ctx.arc(v.x, v.y, CAR_R, 0, Math.PI * 2);
    ctx.fillStyle = v.color;
    if (v.state === 'moving') {
      ctx.shadowColor = v.color; ctx.shadowBlur = 12;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  // queue count badges
  const queued: Record<Dir, number> = { N: 0, S: 0, E: 0, W: 0 };
  e.vehs.forEach(v => { if (v.state==='queue') queued[v.dir]++; });
  function badge(x: number, y: number, count: number, dir: Dir) {
    const hasQ = count > 0;
    ctx.fillStyle = hasQ ? 'rgba(251,146,60,0.9)' : 'rgba(34,197,94,0.7)';
    ctx.beginPath(); ctx.roundRect(x - 18, y - 12, 36, 24, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Inter,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${count} 🚗`, x, y + 4);
  }
  badge(CX + LANE_OFF, 18, queued.N, 'N');
  badge(CX - LANE_OFF, CH - 18, queued.S, 'S');
  badge(CW - 22, CY - LANE_OFF, queued.E, 'E');
  badge(22, CY + LANE_OFF, queued.W, 'W');

  // label + phase info
  ctx.fillStyle = isAI ? '#818cf8' : '#94a3b8';
  ctx.font = 'bold 13px Inter,sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(label, 10, 18);
  ctx.fillStyle = '#64748b'; ctx.font = '11px Inter,sans-serif';
  ctx.fillText(`Phase: ${e.phase} | ${Math.ceil(e.phaseLeft)}s left`, 10, 34);
}

// ── React component ───────────────────────────────────────────────────────────
function createEngine(phase: Phase, phaseDur: number): Engine {
  return {
    phase, phaseLeft: phaseDur, phaseDur,
    vehs: [], cleared: 0, totalWait: 0, idCtr: 0,
    spawnT: { N: 1, S: 2, E: 0.5, W: 1.5 },
    elapsed: 0, aiLog: 'Waiting for first phase...',
  };
}

export default function TrafficSimulation() {
  const aiCanvas   = useRef<HTMLCanvasElement>(null);
  const tradCanvas = useRef<HTMLCanvasElement>(null);
  const aiEng      = useRef<Engine>(createEngine('NS', 20));
  const tradEng    = useRef<Engine>(createEngine('NS', 30));
  const lastT      = useRef<number>(0);
  const raf        = useRef<number>(0);

  const [stats, setStats] = useState({
    aiCleared: 0, tradCleared: 0,
    aiAvgWait: 0, tradAvgWait: 0,
    aiQueue: 0,   tradQueue: 0,
    aiLog: '', aiPhase: 'NS', aiPhaseLeft: 20,
    tradPhase: 'NS', tradPhaseLeft: 30,
    elapsed: 0,
  });

  const [running, setRunning] = useState(true);

  const tick = useCallback((ts: number) => {
    if (!running) return;
    const dtReal = Math.min((ts - lastT.current) / 1000, 0.1);
    lastT.current = ts;

    aiEng.current   = stepEngine(aiEng.current,   dtReal, true);
    tradEng.current = stepEngine(tradEng.current, dtReal, false);

    const aiCtx   = aiCanvas.current?.getContext('2d');
    const tradCtx = tradCanvas.current?.getContext('2d');
    if (aiCtx)   drawScene(aiCtx,   aiEng.current,   'AI Adaptive (RL-PPO)', true);
    if (tradCtx) drawScene(tradCtx, tradEng.current, 'Traditional Fixed',    false);

    const ae = aiEng.current, te = tradEng.current;
    setStats({
      aiCleared:    ae.cleared,
      tradCleared:  te.cleared,
      aiAvgWait:    ae.cleared ? ae.totalWait / ae.cleared : 0,
      tradAvgWait:  te.cleared ? te.totalWait / te.cleared : 0,
      aiQueue:      ae.vehs.filter(v => v.state==='queue').length,
      tradQueue:    te.vehs.filter(v => v.state==='queue').length,
      aiLog:        ae.aiLog,
      aiPhase:      ae.phase,
      aiPhaseLeft:  Math.ceil(ae.phaseLeft),
      tradPhase:    te.phase,
      tradPhaseLeft:Math.ceil(te.phaseLeft),
      elapsed:      ae.elapsed,
    });

    raf.current = requestAnimationFrame(tick);
  }, [running]);

  useEffect(() => {
    lastT.current = performance.now();
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [tick]);

  // ── derived numbers ─────────────────────────────────────────────────────────
  const clearDiff     = stats.aiCleared - stats.tradCleared;
  const waitReduction = stats.tradAvgWait > 0
    ? ((stats.tradAvgWait - stats.aiAvgWait) / stats.tradAvgWait * 100)
    : 0;
  const throughputBoost = stats.tradCleared > 0
    ? ((stats.aiCleared - stats.tradCleared) / stats.tradCleared * 100)
    : 0;

  const fmtTime = (s: number) => `${Math.floor(s / 60)}m ${(s % 60).toFixed(0)}s`;

  return (
    <div className="flex flex-col gap-6">
      {/* AI log strip */}
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-sm">
        <Brain size={16} className="text-indigo-400 flex-shrink-0 animate-pulse" />
        <span className="text-indigo-300 font-mono text-xs">{stats.aiLog || 'RL-PPO initialising…'}</span>
        <span className="ml-auto text-xs text-gray-600 font-mono">Sim time: {fmtTime(stats.elapsed)}</span>
      </div>

      {/* Dual canvas row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* AI Panel */}
        <div className="rounded-2xl border border-indigo-500/25 bg-[#0d0f1e] overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-indigo-500/20">
            <Brain size={16} className="text-indigo-400" />
            <span className="text-sm font-bold text-indigo-300">AI Adaptive Signal (RL-PPO)</span>
            <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-lg ${
              stats.aiPhase==='NS'
                ? 'bg-green-500/15 text-green-400'
                : 'bg-blue-500/15 text-blue-400'
            }`}>
              {stats.aiPhase} GREEN · {stats.aiPhaseLeft}s
            </span>
          </div>
          <canvas ref={aiCanvas} width={CW} height={CH} className="w-full block" />
        </div>

        {/* Traditional Panel */}
        <div className="rounded-2xl border border-gray-700/50 bg-[#0d0f1e] overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-700/50">
            <Clock size={16} className="text-gray-400" />
            <span className="text-sm font-bold text-gray-400">Traditional Fixed Timing (30s/30s)</span>
            <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-lg ${
              stats.tradPhase==='NS'
                ? 'bg-green-500/15 text-green-400'
                : 'bg-blue-500/15 text-blue-400'
            }`}>
              {stats.tradPhase} GREEN · {stats.tradPhaseLeft}s
            </span>
          </div>
          <canvas ref={tradCanvas} width={CW} height={CH} className="w-full block" />
        </div>
      </div>

      {/* Metrics comparison */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Vehicles Cleared"
          ai={stats.aiCleared}
          trad={stats.tradCleared}
          unit=""
          better={clearDiff > 0}
          icon={<Car size={15} />}
        />
        <MetricCard
          title="Avg Wait Time"
          ai={parseFloat(stats.aiAvgWait.toFixed(1))}
          trad={parseFloat(stats.tradAvgWait.toFixed(1))}
          unit="s"
          better={stats.aiAvgWait < stats.tradAvgWait}
          lowerIsBetter
          icon={<Clock size={15} />}
        />
        <MetricCard
          title="Queue Length"
          ai={stats.aiQueue}
          trad={stats.tradQueue}
          unit=" cars"
          better={stats.aiQueue < stats.tradQueue}
          lowerIsBetter
          icon={<Zap size={15} />}
        />
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
            <TrendingUp size={15} /> AI ADVANTAGE
          </div>
          <div className="text-2xl font-black text-emerald-400">
            +{throughputBoost > 0 ? throughputBoost.toFixed(1) : 0}%
          </div>
          <div className="text-xs text-gray-500">Throughput boost</div>
          <div className="mt-1 text-xs text-emerald-300/70">
            {waitReduction > 0 ? `${waitReduction.toFixed(1)}% less wait` : 'Calculating…'}
          </div>
        </div>
      </div>

      {/* Phase timeline bar */}
      <div className="rounded-2xl border border-gray-800 bg-[#0d0f1e] p-5 flex flex-col gap-4">
        <div className="text-sm font-bold text-gray-300">Signal Phase Comparison</div>
        <div className="flex flex-col gap-3">
          {/* AI bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-indigo-400 w-28">AI Adaptive</span>
            <div className="flex-1 h-5 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-1000"
                style={{ width: `${Math.min(100, (1 - stats.aiPhaseLeft / Math.max(1, stats.aiPhaseLeft + 5)) * 100 + 10)}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 w-16 text-right font-mono">{stats.aiPhaseLeft}s left</span>
          </div>
          {/* Traditional bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 w-28">Traditional</span>
            <div className="flex-1 h-5 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gray-600 to-gray-500 transition-all duration-1000"
                style={{ width: `${((30 - stats.tradPhaseLeft) / 30) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 w-16 text-right font-mono">{stats.tradPhaseLeft}s left</span>
          </div>
        </div>
        <p className="text-xs text-gray-600 mt-1">
          AI dynamically extends green for high-density approaches (12–60s). Traditional cycles fixed 30s per phase regardless of demand.
        </p>
      </div>
    </div>
  );
}

// ── Metric card sub-component ─────────────────────────────────────────────────
function MetricCard({ title, ai, trad, unit, better, lowerIsBetter, icon }: {
  title: string; ai: number; trad: number; unit: string;
  better: boolean; lowerIsBetter?: boolean; icon: React.ReactNode;
}) {
  const diff = lowerIsBetter ? trad - ai : ai - trad;
  return (
    <div className="rounded-2xl border border-gray-800 bg-[#0d0f1e] p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-gray-500 text-xs font-semibold">
        {icon} {title}
      </div>
      <div className="flex gap-3 items-end">
        <div>
          <div className="text-[10px] text-indigo-400 mb-0.5">AI</div>
          <div className="text-xl font-black text-white">{ai}{unit}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 mb-0.5">TRAD</div>
          <div className="text-xl font-black text-gray-500">{trad}{unit}</div>
        </div>
      </div>
      <div className={`text-xs font-semibold ${better ? 'text-emerald-400' : 'text-red-400'}`}>
        {better ? '▲' : '▼'} {Math.abs(diff).toFixed(lowerIsBetter ? 1 : 0)}{unit} {better ? 'better' : 'worse'}
      </div>
    </div>
  );
}
