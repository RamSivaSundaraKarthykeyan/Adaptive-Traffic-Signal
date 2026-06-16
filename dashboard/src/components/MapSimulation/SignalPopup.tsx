'use client';
import React, { useRef, useEffect, useState } from 'react';
import { X, Camera, Radio, Clock, Layers, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import { JUNCTIONS, HOSPITALS, TRAFFIC_VIDEOS } from './data/chennaiData';
import { SignalState } from './SimulationAPIBus';
import { cn } from '@/lib/utils';

interface SignalPopupProps {
  junctionId: string;
  signalState: SignalState | null;
  onClose: () => void;
}

// Deterministically pick a video index for each junction so it looks like
// a dedicated camera per intersection.
function videoIndexForJunction(junctionId: string): number {
  const idx = JUNCTIONS.findIndex(j => j.id === junctionId);
  return ((idx < 0 ? 0 : idx) * 3) % TRAFFIC_VIDEOS.length;
}

export default function SignalPopup({ junctionId, signalState, onClose }: SignalPopupProps) {
  const junction     = JUNCTIONS.find(j => j.id === junctionId);
  const hospital     = HOSPITALS.find(h => h.nearestJunctionId === junctionId);
  const baseIdx      = videoIndexForJunction(junctionId);
  const [vidIdx, setVidIdx] = useState(baseIdx);
  const videoRef     = useRef<HTMLVideoElement>(null);

  // Auto-cycle to next video every 12 s
  useEffect(() => {
    const t = setInterval(() => {
      setVidIdx(v => (v + 1) % TRAFFIC_VIDEOS.length);
    }, 12_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    videoRef.current?.load();
    videoRef.current?.play().catch(() => {});
  }, [vidIdx]);

  if (!junction) return null;

  const sig    = signalState;
  const phase  = sig?.phase ?? 'red';
  const phaseColor =
    phase === 'green'  ? 'text-green-400'  :
    phase === 'yellow' ? 'text-yellow-400' : 'text-red-400';
  const phaseBg =
    phase === 'green'  ? 'bg-green-500/10 border-green-500/20'  :
    phase === 'yellow' ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-red-500/10 border-red-500/20';

  const prevVid = () => setVidIdx(v => (v - 1 + TRAFFIC_VIDEOS.length) % TRAFFIC_VIDEOS.length);
  const nextVid = () => setVidIdx(v => (v + 1) % TRAFFIC_VIDEOS.length);

  return (
    <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/60 backdrop-blur-sm">
      <div className="w-[520px] max-h-[90vh] overflow-y-auto bg-[#0c0f1d] border border-gray-700/60 rounded-2xl shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800">
          <div className={cn('p-2 rounded-xl border', phaseBg)}>
            <Radio size={16} className={phaseColor} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white text-base truncate">{junction.name}</h3>
            <p className="text-xs text-gray-500">Signal ID: {junction.id} · Chennai ITMS</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Live video feed */}
        <div className="relative bg-black">
          <video
            ref={videoRef}
            key={vidIdx}
            src={`/traffic-videos/${TRAFFIC_VIDEOS[vidIdx]}`}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-48 object-cover"
          />
          {/* Overlay badge */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm border border-red-500/40 text-red-400 text-[10px] font-bold px-2 py-1 rounded-lg">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE · CAM {vidIdx + 1}/{TRAFFIC_VIDEOS.length}
          </div>
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/70 backdrop-blur-sm text-gray-400 text-[10px] px-2 py-1 rounded-lg border border-gray-700/50">
            <Camera size={10} /> {junction.name.toUpperCase()}
          </div>
          {/* Video navigation */}
          <button
            onClick={prevVid}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 border border-gray-700 flex items-center justify-center text-gray-300 hover:bg-black/80 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={nextVid}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 border border-gray-700 flex items-center justify-center text-gray-300 hover:bg-black/80 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Signal state */}
        <div className="p-5 flex flex-col gap-4">

          {/* Phase + Timer */}
          <div className="grid grid-cols-3 gap-3">
            <div className={cn('rounded-xl p-3 border flex flex-col gap-1', phaseBg)}>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Phase</div>
              <div className={cn('text-xl font-black uppercase', phaseColor)}>{phase}</div>
            </div>
            <div className="rounded-xl p-3 border border-gray-800 bg-gray-900/40 flex flex-col gap-1">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold flex items-center gap-1">
                <Clock size={9} /> Remaining
              </div>
              <div className="text-xl font-black text-white">
                {Math.ceil(sig?.timeRemainingS ?? 0)}s
              </div>
            </div>
            <div className="rounded-xl p-3 border border-indigo-500/20 bg-indigo-500/5 flex flex-col gap-1">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold flex items-center gap-1">
                <Zap size={9} /> Next Phase
              </div>
              <div className="text-xl font-black text-indigo-400 uppercase">
                {sig?.nextPredictedPhase ?? 'red'}
              </div>
            </div>
          </div>

          {/* Queue lengths */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Queue Length</div>
            <div className="flex gap-6">
              <div>
                <div className="text-[10px] text-gray-600 mb-1">North / South</div>
                <div className="text-2xl font-black text-white">{sig?.queueNS ?? 0}</div>
                <div className="text-xs text-gray-600">vehicles</div>
              </div>
              <div className="w-px bg-gray-800" />
              <div>
                <div className="text-[10px] text-gray-600 mb-1">East / West</div>
                <div className="text-2xl font-black text-white">{sig?.queueEW ?? 0}</div>
                <div className="text-xs text-gray-600">vehicles</div>
              </div>
              <div className="w-px bg-gray-800" />
              <div>
                <div className="text-[10px] text-gray-600 mb-1">Green Duration</div>
                <div className="text-2xl font-black text-indigo-400">{Math.round(sig?.greenDurationS ?? 25)}s</div>
                <div className="text-xs text-gray-600">AI optimized</div>
              </div>
            </div>
          </div>

          {/* Emergency alert */}
          {sig?.hasEmergencyVehicle && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/8 p-4 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <div>
                <div className="text-sm font-bold text-red-400">Emergency Vehicle Active</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Path cleared for {sig.emergencyDirection === 'NS' ? 'North/South' : 'East/West'} direction
                </div>
              </div>
            </div>
          )}

          {/* Nearest hospital */}
          {hospital && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
              <div className="text-[10px] uppercase tracking-wider text-rose-400/70 font-bold mb-2">Nearest Hospital</div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-900/40 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold text-sm">
                  ✚
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-200">{hospital.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{hospital.phone}</div>
                </div>
              </div>
            </div>
          )}

          {/* Video strip thumbnails hint */}
          <div className="flex items-center gap-1 flex-wrap">
            {TRAFFIC_VIDEOS.slice(0, 12).map((_, i) => (
              <button
                key={i}
                onClick={() => setVidIdx(i)}
                className={cn(
                  'w-4 h-4 rounded-sm transition-colors',
                  i === vidIdx ? 'bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'
                )}
              />
            ))}
            {TRAFFIC_VIDEOS.length > 12 && (
              <span className="text-[10px] text-gray-600 ml-1">+{TRAFFIC_VIDEOS.length - 12} more</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
