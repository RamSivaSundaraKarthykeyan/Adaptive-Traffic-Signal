"use client";

import React from 'react';
import { cn } from '@/lib/utils';

const PHASE_COLORS = ['bg-green-500', 'bg-yellow-500', 'bg-blue-500', 'bg-orange-500'];
const PHASE_LABELS = ['North-South GO', 'East-West GO', 'Pedestrian', 'All STOP'];
const PHASE_DURATIONS = [45, 40, 20, 5];

export default function SignalController({ activePhase }: { activePhase: number }) {
  const clampedPhase = Math.min(Math.max(activePhase, 0), 3);

  return (
    <div className="bg-[#0d0d10] border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col gap-5">
      <div>
        <h3 className="text-lg font-bold">RL Signal Controller</h3>
        <p className="text-sm text-gray-500">PPO Agent – Phase Recommendation</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {PHASE_LABELS.map((label, i) => (
          <div
            key={i}
            className={cn(
              "rounded-xl p-4 border transition-all duration-300",
              i === clampedPhase
                ? "border-blue-500/50 bg-blue-500/10 shadow-lg shadow-blue-500/10"
                : "border-gray-800 bg-gray-900/40 opacity-50"
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={cn("w-3 h-3 rounded-full", PHASE_COLORS[i], i === clampedPhase && "animate-pulse")} />
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Phase {i}</span>
            </div>
            <p className="text-sm font-semibold text-gray-200">{label}</p>
            <p className="text-xs text-gray-500 mt-1">{PHASE_DURATIONS[i]}s duration</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
        <div className="text-sm text-gray-400">Active Phase</div>
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full animate-pulse", PHASE_COLORS[clampedPhase])} />
          <span className="font-bold text-white">{PHASE_LABELS[clampedPhase]}</span>
        </div>
      </div>
    </div>
  );
}
