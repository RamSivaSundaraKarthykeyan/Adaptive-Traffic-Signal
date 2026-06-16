'use client';
// TrafficSimulation — now powered by the full Chennai Map Simulation
// The old dual-canvas abstract intersection remains accessible via the
// "Classic View" toggle for comparison purposes.

import React, { useState } from 'react';
import { Map, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';

// Dynamic import prevents SSR issues with canvas/requestAnimationFrame
const MapSimulation = dynamic(
  () => import('./MapSimulation'),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center h-96 text-gray-500 text-sm">
      Loading Chennai ITMS Map…
    </div>
  )}
);

export default function TrafficSimulation() {
  return <MapSimulation />;
}
