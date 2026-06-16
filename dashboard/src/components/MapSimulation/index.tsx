'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Brain, Siren, Flame, Car, AlertTriangle, CheckCircle2,
  Activity, Layers, Pause, Play, RotateCcw, Zap, Ambulance
} from 'lucide-react';
import { cn } from '@/lib/utils';
import MapRenderer from './LeafletMapRenderer';
import SignalPopup from './SignalPopup';
import { initEngine, tick, EngineState, generateSpawnEvent, SimulationEvent } from './SimulationEngine';
import { JUNCTIONS } from './data/chennaiData';

// ── Metric card ───────────────────────────────────────────────────────────
function MetricCard({
  icon, label, value, sub, accent = 'blue', highlight = false
}: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string;
  accent?: 'blue' | 'green' | 'red' | 'orange' | 'indigo' | 'emerald';
  highlight?: boolean;
}) {
  const colors: Record<string, string> = {
    blue:    'text-blue-400 bg-blue-500/10 border-blue-500/20',
    green:   'text-green-400 bg-green-500/10 border-green-500/20',
    red:     'text-red-400 bg-red-500/10 border-red-500/20',
    orange:  'text-orange-400 bg-orange-500/10 border-orange-500/20',
    indigo:  'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  };
  return (
    <div className={cn('rounded-xl border px-4 py-3 flex items-center gap-3 transition-all', colors[accent],
      highlight && 'ring-2 ring-current ring-opacity-40 scale-[1.02]'
    )}>
      <div className="flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider font-bold opacity-60">{label}</div>
        <div className="text-xl font-black leading-tight">{value}</div>
        {sub && <div className="text-[10px] opacity-50 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── Accident event log item ───────────────────────────────────────────────
function AccidentLogItem({ junctionId, severity, resolved, timestamp, ambulanceId }: {
  junctionId: string; severity: string; resolved: boolean; timestamp: number; ambulanceId?: string;
}) {
  const j = JUNCTIONS.find(x => x.id === junctionId);
  const time = new Date(timestamp).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800/60 last:border-0 hover:bg-gray-900/30 transition-colors">
      <div className={cn(
        'w-2 h-2 rounded-full flex-shrink-0',
        resolved ? 'bg-green-500' : 'bg-red-500 animate-pulse'
      )} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-gray-200 truncate">
          {j?.name ?? junctionId}
        </div>
        <div className="text-[10px] text-gray-500 capitalize flex items-center gap-1">
          <span className={cn(
            'px-1.5 py-0.5 rounded text-[9px] font-bold',
            severity === 'critical' ? 'bg-red-900/50 text-red-400' :
            severity === 'moderate' ? 'bg-orange-900/50 text-orange-400' :
            'bg-yellow-900/50 text-yellow-400'
          )}>{severity}</span>
          {ambulanceId && <span className="text-gray-600">AMB dispatched</span>}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className={cn(
          'text-[10px] font-bold px-2 py-0.5 rounded-lg',
          resolved ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
        )}>
          {resolved ? 'RESOLVED' : 'ACTIVE'}
        </div>
        <div className="text-[10px] text-gray-600 mt-0.5 font-mono">{time}</div>
      </div>
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────
export default function MapSimulation() {
  const aiEngineRef   = useRef<EngineState>(initEngine(false));
  const tradEngineRef = useRef<EngineState>(initEngine(true));
  const rafRef      = useRef<number>(0);
  const lastTsRef   = useRef<number>(0);
  const frameRef    = useRef<number>(0);

  const [aiDisplayState, setAiDisplayState] = useState<EngineState>(() => initEngine(false));
  const [tradDisplayState, setTradDisplayState] = useState<EngineState>(() => initEngine(true));
  const [frame, setFrame]               = useState(0);
  const [isRunning, setIsRunning]       = useState(true);
  const [selectedJunctionId, setSelectedJunctionId] = useState<string | null>(null);
  const [tab, setTab]                   = useState<'junctions' | 'accidents'>('junctions');
  // Flash state for metrics
  const [ambFlash, setAmbFlash]         = useState(false);
  const [fireFlash, setFireFlash]       = useState(false);
  const prevAmbRef  = useRef(0);
  const prevFireRef = useRef(0);

  // ── Coordinator state ───────────────────────────────────────────────
  const SPAWN_INTERVAL      = 1.8;
  const ACCIDENT_CHANCE     = 0.0008;
  const MAX_ACTIVE_ACCIDENTS = 2;
  const coordinatorRef = useRef({ nextSpawnT: 0 });

  // ── Manual trigger handlers ─────────────────────────────────────────
  const triggerManualAccident = useCallback(() => {
    const jId = JUNCTIONS[Math.floor(Math.random() * JUNCTIONS.length)].id;
    const ev: SimulationEvent = { type: 'accident', junctionId: jId };
    aiEngineRef.current = tick(aiEngineRef.current, 0, [ev]);
    tradEngineRef.current = tick(tradEngineRef.current, 0, [ev]);
  }, []);

  const triggerManualAmbulance = useCallback(() => {
    const jId = JUNCTIONS[Math.floor(Math.random() * JUNCTIONS.length)].id;
    const ev: SimulationEvent = { type: 'spawn_ambulance', junctionId: jId };
    aiEngineRef.current = tick(aiEngineRef.current, 0, [ev]);
    tradEngineRef.current = tick(tradEngineRef.current, 0, [ev]);
  }, []);

  // ── Animation loop ──────────────────────────────────────────────────
  const loop = useCallback((ts: number) => {
    if (!isRunning) return;
    const dtReal = Math.min((ts - lastTsRef.current) / 1000, 0.1);
    const dtSim = dtReal * 3;
    lastTsRef.current = ts;
    frameRef.current++;

    const events: SimulationEvent[] = [];

    // Spawn traffic
    coordinatorRef.current.nextSpawnT -= dtSim;
    if (coordinatorRef.current.nextSpawnT <= 0) {
      coordinatorRef.current.nextSpawnT = SPAWN_INTERVAL + (Math.random() - 0.5);
      const ev = generateSpawnEvent();
      if (ev) events.push(ev);
    }

    // Random accidents (shared between both engines for fair comparison)
    let activeAccidents = 0;
    for (const a of aiEngineRef.current.accidents.values()) { if (!a.resolved) activeAccidents++; }
    if (activeAccidents < MAX_ACTIVE_ACCIDENTS) {
      for (const j of JUNCTIONS) {
        if (Math.random() < ACCIDENT_CHANCE * dtSim) {
          events.push({ type: 'accident', junctionId: j.id });
          break;
        }
      }
    }

    aiEngineRef.current   = tick(aiEngineRef.current, dtReal, events);
    tradEngineRef.current = tick(tradEngineRef.current, dtReal, events);

    // Every 2 frames sync display state
    if (frameRef.current % 2 === 0) {
      setAiDisplayState({
        ...aiEngineRef.current,
        signals:    new Map(aiEngineRef.current.signals),
        vehicles:   new Map(aiEngineRef.current.vehicles),
        accidents:  new Map(aiEngineRef.current.accidents),
        messageLog: [...aiEngineRef.current.messageLog],
        densityMap: new Map(aiEngineRef.current.densityMap),
        pendingDispatch: [...aiEngineRef.current.pendingDispatch],
      });
      setTradDisplayState({
        ...tradEngineRef.current,
        signals:    new Map(tradEngineRef.current.signals),
        vehicles:   new Map(tradEngineRef.current.vehicles),
        accidents:  new Map(tradEngineRef.current.accidents),
        messageLog: [...tradEngineRef.current.messageLog],
        densityMap: new Map(tradEngineRef.current.densityMap),
        pendingDispatch: [...tradEngineRef.current.pendingDispatch],
      });
      setFrame(frameRef.current);
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [isRunning]);

  useEffect(() => {
    if (isRunning) {
      lastTsRef.current = performance.now();
      rafRef.current = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop, isRunning]);

  // Flash on amb/fire cleared increment
  useEffect(() => {
    if (aiDisplayState.ambCleared > prevAmbRef.current) {
      prevAmbRef.current = aiDisplayState.ambCleared;
      setAmbFlash(true);
      setTimeout(() => setAmbFlash(false), 800);
    }
    if (aiDisplayState.fireCleared > prevFireRef.current) {
      prevFireRef.current = aiDisplayState.fireCleared;
      setFireFlash(true);
      setTimeout(() => setFireFlash(false), 800);
    }
  }, [aiDisplayState.ambCleared, aiDisplayState.fireCleared]);

  // ── Helpers ─────────────────────────────────────────────────────────
  const fmtTime = (s: number) => `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
  const avgWaitAi   = aiDisplayState.clearedCount > 0
    ? (aiDisplayState.totalWait / aiDisplayState.clearedCount).toFixed(1) : '–';
  const avgWaitTrad = tradDisplayState.clearedCount > 0
    ? (tradDisplayState.totalWait / tradDisplayState.clearedCount).toFixed(1) : '–';

  const accidentList = Array.from(aiDisplayState.accidents.values())
    .sort((a, b) => b.timestamp - a.timestamp).slice(0, 14);
  const activeAccidents = accidentList.filter(a => !a.resolved).length;

  const restart = () => {
    cancelAnimationFrame(rafRef.current);
    aiEngineRef.current   = initEngine(false);
    tradEngineRef.current = initEngine(true);
    setAiDisplayState(initEngine(false));
    setTradDisplayState(initEngine(true));
    frameRef.current = 0;
    prevAmbRef.current = 0;
    prevFireRef.current = 0;
    setSelectedJunctionId(null);
    setIsRunning(true);
  };

  const selectedSignal = selectedJunctionId
    ? aiDisplayState.signals.get(selectedJunctionId) ?? null : null;

  return (
    <div className="flex flex-col gap-4">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex-1 min-w-0">
          <Brain size={14} className="text-indigo-400 animate-pulse flex-shrink-0" />
          <span className="text-indigo-300 font-mono text-xs tracking-wide truncate flex-1">
            {aiDisplayState.aiLog || 'RL-PPO signal optimizer active…'}
          </span>
          <span className="text-gray-600 text-xs font-mono flex-shrink-0">
            {fmtTime(aiDisplayState.elapsed)}
          </span>
        </div>

        {/* Manual trigger buttons */}
        <button
          onClick={triggerManualAccident}
          className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm font-bold transition-all flex-shrink-0"
          title="Trigger a random accident on both maps"
        >
          <AlertTriangle size={14} /> Accident
        </button>

        <button
          onClick={triggerManualAmbulance}
          className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white border border-white/20 rounded-xl text-sm font-bold transition-all flex-shrink-0"
          title="Dispatch a manual ambulance from nearest hospital"
        >
          <Siren size={14} /> Ambulance
        </button>

        <button
          onClick={() => setIsRunning(v => !v)}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all flex-shrink-0',
            isRunning
              ? 'bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
              : 'bg-green-500/10 hover:bg-green-500/20 text-green-400 border-green-500/30'
          )}
        >
          {isRunning ? <Pause size={15} /> : <Play size={15} />}
          {isRunning ? 'Pause' : 'Resume'}
        </button>

        <button
          onClick={restart}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-800/60 hover:bg-gray-800 text-gray-400 border border-gray-700/50 rounded-xl text-sm font-bold transition-all flex-shrink-0"
        >
          <RotateCcw size={15} /> Reset
        </button>
      </div>

      {/* ── Metric row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          icon={<Car size={15} />}
          label="Vehicles"
          value={aiDisplayState.vehicles.size}
          sub={`Trad: ${tradDisplayState.vehicles.size}`}
          accent="blue"
        />
        <MetricCard
          icon={<Activity size={15} />}
          label="Avg Wait (AI)"
          value={`${avgWaitAi}s`}
          sub={`Trad: ${avgWaitTrad}s`}
          accent="green"
        />
        <MetricCard
          icon={<AlertTriangle size={15} />}
          label="Accidents"
          value={aiDisplayState.accidentCount}
          sub={`${activeAccidents} active`}
          accent="red"
        />
        <MetricCard
          icon={<Siren size={15} />}
          label="AMB Cleared"
          value={aiDisplayState.ambCleared}
          sub="returned to hospital"
          accent="orange"
          highlight={ambFlash}
        />
        <MetricCard
          icon={<Flame size={15} />}
          label="Fire Cleared"
          value={aiDisplayState.fireCleared}
          sub="on scene"
          accent="orange"
          highlight={fireFlash}
        />
        <MetricCard
          icon={<Layers size={15} />}
          label="Cleared (AI)"
          value={aiDisplayState.clearedCount}
          sub={`Trad: ${tradDisplayState.clearedCount}`}
          accent="indigo"
        />
      </div>

      {/* ── AI advantage banner ── */}
      {aiDisplayState.clearedCount > 5 && tradDisplayState.clearedCount > 5 && (() => {
        const aiAvg   = aiDisplayState.totalWait   / aiDisplayState.clearedCount;
        const tradAvg = tradDisplayState.totalWait / tradDisplayState.clearedCount;
        const diff    = tradAvg - aiAvg;
        if (diff > 0.5) {
          return (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              <Zap size={13} className="animate-pulse" />
              AI is saving <span className="font-black mx-1">{diff.toFixed(1)}s</span> per vehicle over Traditional · {((diff/tradAvg)*100).toFixed(0)}% improvement
            </div>
          );
        }
        return null;
      })()}

      {/* ── Main content ── */}
      <div className="flex flex-col xl:flex-row gap-4">

        {/* Map panels */}
        <div className="flex-1 flex flex-col md:flex-row gap-4 items-start">
          <div className="flex-1 rounded-2xl border border-gray-800 bg-[#0c0f1d] overflow-hidden relative self-start">
            <MapRenderer
              engineState={aiDisplayState}
              frame={frame}
              onSignalClick={setSelectedJunctionId}
              selectedSignalId={selectedJunctionId}
              isTraditional={false}
            />
            {selectedJunctionId && (
              <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-[9999] flex items-center justify-center">
                <div className="pointer-events-auto">
                  <SignalPopup
                    junctionId={selectedJunctionId}
                    signalState={selectedSignal}
                    onClose={() => setSelectedJunctionId(null)}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 rounded-2xl border border-gray-800 bg-[#0c0f1d] overflow-hidden relative self-start">
            <MapRenderer
              engineState={tradDisplayState}
              frame={frame}
              onSignalClick={() => {}}
              selectedSignalId={null}
              isTraditional={true}
            />
            {/* Traditional pending dispatch indicator */}
            {tradDisplayState.pendingDispatch.length > 0 && (
              <div className="absolute bottom-3 left-3 z-[500] bg-orange-900/80 border border-orange-500/40 rounded-lg px-3 py-1.5 text-xs text-orange-300 backdrop-blur-md">
                ⏳ {tradDisplayState.pendingDispatch.length} dispatch(es) pending (manual detection delay)
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="w-full xl:w-80 flex flex-col gap-4">

          {/* Tab switcher */}
          <div className="flex gap-1 bg-gray-900/50 border border-gray-800 rounded-xl p-1">
            {(['junctions', 'accidents'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'flex-1 py-2 rounded-lg text-xs font-bold transition-all capitalize',
                  tab === t
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/20'
                    : 'text-gray-500 hover:text-gray-300'
                )}
              >
                {t === 'junctions' ? 'Junction Grid' : `Accidents (${activeAccidents})`}
              </button>
            ))}
          </div>

          {tab === 'junctions' ? (
            <div className="rounded-2xl border border-gray-800 bg-[#0c0f1d] overflow-hidden flex-1">
              <div className="px-4 py-3 border-b border-gray-800 text-xs font-bold text-gray-400 uppercase tracking-wider">
                Signal Status · AI vs Traditional
              </div>
              <div className="overflow-y-auto divide-y divide-gray-800/60" style={{ maxHeight: '60vh', overflowAnchor: 'none' }}>
                {JUNCTIONS.map(j => {
                  const aiSig   = aiDisplayState.signals.get(j.id);
                  const tradSig = tradDisplayState.signals.get(j.id);
                  const aiPhase   = aiSig?.phase ?? 'red';
                  const tradPhase = tradSig?.phase ?? 'red';
                  const phaseColor = (p: string) =>
                    p === 'green' ? 'bg-green-500' : p === 'yellow' ? 'bg-yellow-500' : 'bg-red-500';
                  return (
                    <button
                      key={j.id}
                      onClick={() => setSelectedJunctionId(j.id)}
                      className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-gray-900/40 transition-colors text-left"
                    >
                      <div className="flex flex-col gap-1 pt-0.5 flex-shrink-0">
                        <div className={cn('w-2 h-2 rounded-full', phaseColor(aiPhase), aiPhase !== 'red' ? 'animate-pulse' : '')} />
                        <div className={cn('w-2 h-2 rounded-full', phaseColor(tradPhase))} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-200 truncate">{j.name}</div>
                        <div className="text-[10px] text-gray-600 flex gap-2 mt-0.5">
                          <span className="text-indigo-400">AI: {Math.ceil(aiSig?.timeRemainingS ?? 0)}s</span>
                          <span className="text-gray-500">Trad: {Math.ceil(tradSig?.timeRemainingS ?? 0)}s</span>
                        </div>
                        {aiSig?.hasEmergencyVehicle && (
                          <div className="text-[10px] text-red-400 font-bold animate-pulse">🚑 EMERGENCY OVERRIDE</div>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-gray-600 flex-shrink-0 uppercase">{aiPhase}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-800 bg-[#0c0f1d] overflow-hidden flex-1">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                <AlertTriangle size={13} className="text-red-400" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Accident Log</span>
                {activeAccidents > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-bold animate-pulse">
                    {activeAccidents} ACTIVE
                  </span>
                )}
              </div>
              <div className="overflow-y-auto divide-y divide-gray-800/60" style={{ maxHeight: '60vh', overflowAnchor: 'none' }}>
                {accidentList.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-gray-600">
                    <CheckCircle2 size={24} />
                    <span className="text-xs">No accidents yet</span>
                  </div>
                ) : (
                  accidentList.map(acc => (
                    <AccidentLogItem key={acc.id} {...acc} />
                  ))
                )}
              </div>
            </div>
          )}

          {/* AI advantage summary card */}
          <div className="rounded-2xl border border-gray-800 bg-[#0c0f1d] p-4 space-y-3">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <Zap size={12} className="text-yellow-400" /> AI Performance Edge
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-indigo-500/10 rounded-lg p-2 border border-indigo-500/20">
                <div className="text-indigo-400 font-bold text-sm">{aiDisplayState.ambCleared}</div>
                <div className="text-gray-500 text-[10px]">AMB cleared (AI)</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-2 border border-gray-700/50">
                <div className="text-gray-300 font-bold text-sm">{tradDisplayState.ambCleared}</div>
                <div className="text-gray-500 text-[10px]">AMB cleared (Trad)</div>
              </div>
              <div className="bg-indigo-500/10 rounded-lg p-2 border border-indigo-500/20">
                <div className="text-indigo-400 font-bold text-sm">{avgWaitAi}s</div>
                <div className="text-gray-500 text-[10px]">Avg wait (AI)</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-2 border border-gray-700/50">
                <div className="text-gray-300 font-bold text-sm">{avgWaitTrad}s</div>
                <div className="text-gray-500 text-[10px]">Avg wait (Trad)</div>
              </div>
            </div>
            <div className="text-[10px] text-gray-600 leading-relaxed">
              AI uses RL-PPO dynamic timing + instant emergency override + green-wave coordination.
              Traditional uses fixed 30s cycles with {`~`}15-25s manual dispatch delay for accidents.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
