"use client";

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Radio, Cpu, Wifi, WifiOff, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import VisionFeed from '@/components/VisionFeed';
import AccidentUploader from '@/components/AccidentUploader';
import TrafficSimulation from '@/components/TrafficSimulation';

type Tab = 'simulation' | 'vehicle_detection' | 'accident_detection';

const NAV_ITEMS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'simulation', label: 'AI Simulation', icon: <Layers size={19} /> },
  { id: 'vehicle_detection', label: 'Vehicle Detection', icon: <Radio size={19} /> },
  { id: 'accident_detection', label: 'Accident Detection Model', icon: <AlertTriangle size={19} /> },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('simulation');
  const [accidentProb, setAccidentProb] = useState(0.12);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  // Simulate live telemetry (for alerting system or notification badge if needed)
  useEffect(() => {
    const interval = setInterval(() => {
      setAccidentProb(prev => Math.max(0, Math.min(1, prev + (Math.random() - 0.5) * 0.08)));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Check backend status
  useEffect(() => {
    fetch('http://localhost:8000/docs')
      .then(() => setBackendOnline(true))
      .catch(() => setBackendOnline(false));
  }, []);

  return (
    <div className="flex h-screen bg-[#0a0a0c] text-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-800/80 flex flex-col bg-[#0c0c0f]">


        {/* Nav */}
        <nav className="flex-1 p-4 flex flex-col gap-1">
          <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold px-3 mb-2 mt-1">Navigation</p>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-left",
                activeTab === item.id
                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/20"
                  : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
              )}
            >
              <span className={activeTab === item.id ? "text-blue-400" : "text-gray-600"}>{item.icon}</span>
              {item.label}
              {item.id === 'accident_detection' && accidentProb > 0.5 && (
                <span className="ml-auto w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div className="p-4 border-t border-gray-800/80 flex flex-col gap-3">
          {/* Backend Status */}
          <div className={cn(
            "flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium border",
            backendOnline === true ? "bg-green-500/10 border-green-500/20 text-green-400"
              : backendOnline === false ? "bg-red-500/10 border-red-500/20 text-red-400"
                : "bg-gray-800/60 border-gray-700/50 text-gray-500"
          )}>
            {backendOnline === true ? <Wifi size={14} /> : backendOnline === false ? <WifiOff size={14} /> : <Cpu size={14} className="animate-pulse" />}
            <div className="flex-1">
              <div>FastAPI Backend</div>
              <div className="opacity-60">{backendOnline === true ? 'localhost:8000' : backendOnline === false ? 'Offline – start app.py' : 'Checking...'}</div>
            </div>
          </div>

        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          {activeTab === 'simulation' && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white">AI Traffic Simulation</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Real-time side-by-side: RL-PPO adaptive signal vs. traditional fixed timing — Chennai arterial corridors
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  Live simulation
                </div>
              </div>
              <TrafficSimulation />
            </div>
          )}

          {activeTab === 'vehicle_detection' && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-2xl font-black text-white">Vehicle Detection</h2>
                <p className="text-sm text-gray-500 mt-0.5">YOLOv8 real-time vehicle classification and counting</p>
              </div>
              <VisionFeed />
            </div>
          )}

          {activeTab === 'accident_detection' && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-2xl font-black text-white">Accident Detection Model</h2>
                <p className="text-sm text-gray-500 mt-0.5">Real-time CNN accident detection results & emergency dispatch</p>
              </div>
              <AccidentUploader />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
