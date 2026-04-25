"use client";

import React from 'react';
import { cn } from '@/lib/utils';

const PHASE_COLORS = ['bg-green-500', 'bg-yellow-500', 'bg-blue-500', 'bg-orange-500'];
const PHASE_LABELS = ['North-South GO', 'East-West GO', 'Pedestrian', 'All STOP'];
const PHASE_DURATIONS = [45, 40, 20, 5];

export default function SignalController({ activePhase }: { activePhase: number }) {
  const clampedPhase = Math.min(Math.max(activePhase, 0), 3);

  return (
    <div>
      
    </div>
  );
}
