'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Brain, Siren, Flame, Car, AlertTriangle, CheckCircle2,
  Activity, Layers, MapPin, Pause, Play, RotateCcw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import MapRenderer from './LeafletMapRenderer';
import SignalPopup from './SignalPopup';
import SignalCommunicationPanel from './SignalCommunicationPanel';
import { initEngine, tick, EngineState, generateSpawnEvent, SimulationEvent } from './SimulationEngine';
import { JUNCTIONS, HOSPITALS } from './data/chennaiData';

// ── Metric card ───────────────────────────────────────────────────────────
function MetricCard({
  icon, label, value, sub, accent = 'blue'
}: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string;
  accent?: 'blue' | 'green' | 'red' | 'orange' | 'indigo';
}) {
  const colors: Record<string, string> = {
    blue:   'text-blue-400 bg-blue-500/10 border-blue-500/20',
    green:  'text-green-400 bg-green-500/10 border-green-500/20',
    red:    'text-red-400 bg-red-500/10 border-red-500/20',
    orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    indigo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  };
  return (
    <div className={cn('rounded-xl border px-4 py-3 flex items-center gap-3', colors[accent])}>
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
function AccidentLogItem({ junctionId, severity, resolved, timestamp }: {
  junctionId: string; severity: string; resolved: boolean; timestamp: number;
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
        <div className="text-[10px] text-gray-500 capitalize">{severity}</div>
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
  const [tab, setTab]                   = useState<'map' | 'accidents'>('map');

  // ── Coordinator State ───────────────────────────────────────────────
  const SPAWN_INTERVAL = 1.5;
  const ACCIDENT_CHANCE = 0.001;
  const MAX_CONCURRENT_ACCIDENTS = 2;
  const coordinatorState = useRef({
    nextSpawnT: 0,
  });

  // ── Animation loop ──────────────────────────────────────────────────
  const loop = useCallback((ts: number) => {
    if (!isRunning) return;
    const dtReal = Math.min((ts - lastTsRef.current) / 1000, 0.1);
    const dtSim = dtReal * 3;
    lastTsRef.current = ts;
    frameRef.current++;

    const events: SimulationEvent[] = [];

    // Coordinator: Generate Spawn Event
    coordinatorState.current.nextSpawnT -= dtSim;
    if (coordinatorState.current.nextSpawnT <= 0) {
      coordinatorState.current.nextSpawnT = SPAWN_INTERVAL + (Math.random() - 0.5);
      const spawnEvent = generateSpawnEvent();
      if (spawnEvent) events.push(spawnEvent);
    }

    // Coordinator: Generate Accident Event
    let resolvedCount = 0;
    for (const a of aiEngineRef.current.accidents.values()) { if (a.resolved) resolvedCount++; }
    if ((aiEngineRef.current.accidents.size - resolvedCount) < MAX_CONCURRENT_ACCIDENTS) {
      for (const j of JUNCTIONS) {
        if (Math.random() < ACCIDENT_CHANCE * dtSim) {
          events.push({ type: 'accident', junctionId: j.id });
          break;
        }
      }
    }

    aiEngineRef.current = tick(aiEngineRef.current, dtReal, events);
    tradEngineRef.current = tick(tradEngineRef.current, dtReal, events);

    // Sync display every 2 frames to avoid state-flood
    if (frameRef.current % 2 === 0) {
      setAiDisplayState({
        ...aiEngineRef.current,
        signals:   new Map(aiEngineRef.current.signals),
        vehicles:  new Map(aiEngineRef.current.vehicles),
        accidents: new Map(aiEngineRef.current.accidents),
        messageLog: [...aiEngineRef.current.messageLog],
        densityMap: new Map(aiEngineRef.current.densityMap),
      });
      setTradDisplayState({
        ...tradEngineRef.current,
        signals:   new Map(tradEngineRef.current.signals),
        vehicles:  new Map(tradEngineRef.current.vehicles),
        accidents: new Map(tradEngineRef.current.accidents),
        messageLog: [...tradEngineRef.current.messageLog],
        densityMap: new Map(tradEngineRef.current.densityMap),
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

  // ── Helpers ─────────────────────────────────────────────────────────
  const fmtTime = (s: number) => `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
  const avgWaitAi = aiDisplayState.clearedCount > 0
    ? (aiDisplayState.totalWait / aiDisplayState.clearedCount).toFixed(1)
    : '–';

  const accidentList = Array.from(aiDisplayState.accidents.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 12);

  const activeAccidents = accidentList.filter(a => !a.resolved).length;

  const restart = () => {
    cancelAnimationFrame(rafRef.current);
    aiEngineRef.current = initEngine(false);
    tradEngineRef.current = initEngine(true);
    setAiDisplayState(initEngine(false));
    setTradDisplayState(initEngine(true));
    frameRef.current = 0;
    setSelectedJunctionId(null);
    setIsRunning(true);
  };

  const selectedSignal = selectedJunctionId
    ? aiDisplayState.signals.get(selectedJunctionId) ?? null
    : null;

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
          label="Vehicles (AI)"
          value={aiDisplayState.vehicles.size}
          sub={`Trad: ${tradDisplayState.vehicles.size}`}
          accent="blue"
        />
        <MetricCard
          icon={<Activity size={15} />}
          label="Wait Time (AI)"
          value={`${avgWaitAi}s`}
          sub={`Trad: ${tradDisplayState.clearedCount > 0 ? (tradDisplayState.totalWait / tradDisplayState.clearedCount).toFixed(1) : '–'}s`}
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
          label="Amb Cleared"
          value={aiDisplayState.ambCleared}
          sub="to hospital"
          accent="orange"
        />
        <MetricCard
          icon={<Flame size={15} />}
          label="Fire Cleared"
          value={aiDisplayState.fireCleared}
          sub="dispatched"
          accent="orange"
        />
        <MetricCard
          icon={<Layers size={15} />}
          label="Cleared (AI)"
          value={aiDisplayState.clearedCount}
          sub={`Trad: ${tradDisplayState.clearedCount}`}
          accent="indigo"
        />
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-col xl:flex-row gap-4">

        {/* Map panels */}
        <div className="flex-1 flex flex-col md:flex-row gap-4">
          <div className="flex-1 rounded-2xl border border-gray-800 bg-[#0c0f1d] overflow-hidden relative">
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
          <div className="flex-1 rounded-2xl border border-gray-800 bg-[#0c0f1d] overflow-hidden relative">
             <MapRenderer
               engineState={tradDisplayState}
               frame={frame}
               onSignalClick={setSelectedJunctionId}
               selectedSignalId={selectedJunctionId}
               isTraditional={true}
             />
          </div>
        </div>

        {/* Right panel */}
        <div className="w-full xl:w-80 flex flex-col gap-4">

          {/* Tab switcher */}
          <div className="flex gap-1 bg-gray-900/50 border border-gray-800 rounded-xl p-1">
            {(['map', 'accidents'] as const).map(t => (
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
                {t === 'map' ? 'Junction Grid' : `Accidents (${activeAccidents})`}
              </button>
            ))}
          </div>

          {tab === 'map' ? (
            /* Junction status grid */
            <div className="rounded-2xl border border-gray-800 bg-[#0c0f1d] overflow-hidden flex-1">
              <div className="px-4 py-3 border-b border-gray-800 text-xs font-bold text-gray-400 uppercase tracking-wider">
                Signal Status (AI)
              </div>
              <div className="overflow-y-auto max-h-64 divide-y divide-gray-800/60">
                {JUNCTIONS.map(j => {
                  const sig = aiDisplayState.signals.get(j.id);
                  const phase = sig?.phase ?? 'red';
                  const phaseColor =
                    phase === 'green'  ? 'bg-green-500' :
                    phase === 'yellow' ? 'bg-yellow-500' : 'bg-red-500';
                  return (
                    <button
                      key={j.id}
                      onClick={() => setSelectedJunctionId(j.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-900/40 transition-colors text-left"
                    >
                      <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', phaseColor,
                        phase !== 'red' ? 'animate-pulse' : ''
                      )} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-200 truncate">{j.name}</div>
                        <div className="text-[10px] text-gray-600">
                          Q: {(sig?.queueNS ?? 0) + (sig?.queueEW ?? 0)} · {Math.ceil(sig?.timeRemainingS ?? 0)}s left
                        </div>
                      </div>
                      {sig?.hasEmergencyVehicle && (
                        <Siren size={12} className="text-red-400 animate-pulse flex-shrink-0" />
                      )}
                      <div className="text-[10px] font-mono text-gray-600 flex-shrink-0 uppercase">{phase}</div>
                    </button>
                  );
                })}
              </div>

              {/* Hospital list */}
              <div className="border-t border-gray-800 px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider text-rose-400/60 font-bold mb-2">Hospitals</div>
                {HOSPITALS.map(h => (
                  <div key={h.id} className="flex items-center gap-2 py-1.5">
                    <span className="text-rose-400 text-sm font-bold">✚</span>
                    <div>
                      <div className="text-xs text-gray-300">{h.name}</div>
                      <div className="text-[10px] text-gray-600">{h.phone}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Accident log */
            <div className="rounded-2xl border border-gray-800 bg-[#0c0f1d] overflow-hidden flex-1">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                <AlertTriangle size={13} className="text-red-400" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Accident Events</span>
                {activeAccidents > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-bold animate-pulse">
                    {activeAccidents} ACTIVE
                  </span>
                )}
              </div>
              <div className="overflow-y-auto max-h-80 divide-y divide-gray-800/60">
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

          {/* Signal comm panel */}
          <SignalCommunicationPanel messages={aiDisplayState.messageLog} />
        </div>
      </div>
    </div>
  );
}
