"use client";

import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Activity, AlertTriangle, Settings, Database, MapPin, Radio, Cpu, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import MetricCards from '@/components/MetricCards';
import VisionFeed from '@/components/VisionFeed';
import TrafficStats from '@/components/TrafficStats';
import AccidentAlert from '@/components/AccidentAlert';
import SignalController from '@/components/SignalController';
import DataLab from '@/components/DataLab';

type Tab = 'monitor' | 'analytics' | 'accidents' | 'datalab';

const NAV_ITEMS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'monitor',   label: 'Live Monitor',    icon: <LayoutDashboard size={19} /> },
  { id: 'analytics', label: 'Flow Analytics',  icon: <Activity size={19} /> },
  { id: 'accidents', label: 'Accident Logs',   icon: <AlertTriangle size={19} /> },
  { id: 'datalab',   label: 'Data Lab',        icon: <Database size={19} /> },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('monitor');
  const [accidentProb, setAccidentProb] = useState(0.12);
  const [rlPhase, setRlPhase] = useState(0);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [tick, setTick] = useState(0);

  // Simulate live telemetry
  useEffect(() => {
    const interval = setInterval(() => {
      setAccidentProb(prev => Math.max(0, Math.min(1, prev + (Math.random() - 0.5) * 0.08)));
      setRlPhase(Math.floor(Math.random() * 4));
      setTick(t => t + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Check backend status
  useEffect(() => {
    fetch('http://localhost:8000/docs')
      .then(() => setBackendOnline(true))
      .catch(() => setBackendOnline(false));
  }, []);

  const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="flex h-screen bg-[#0a0a0c] text-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-800/80 flex flex-col bg-[#0c0c0f]">
        {/* Logo */}
        <div className="p-6 border-b border-gray-800/80 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 flex-shrink-0">
            <Radio size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight text-white">TN-ITMS AI</h1>
            <p className="text-[10px] text-gray-500 tracking-wide">Smart Traffic Platform</p>
          </div>
        </div>

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
              {item.id === 'accidents' && accidentProb > 0.5 && (
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
          {/* GPU Status */}
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-900/60 border border-gray-800/80 text-xs text-gray-400">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span>CUDA Active</span>
            <span className="ml-auto text-gray-600 font-mono">best.pt</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 border-b border-gray-800/80 flex items-center justify-between px-6 bg-[#0c0c0f]/80 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <MapPin size={14} className="text-blue-400" />
              <span className="text-gray-500">Active Zones:</span>
              <span className="text-gray-200 font-semibold">Chennai, Coimbatore, Madurai</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs text-gray-600 font-mono bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg">
              LIVE {now}
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              5/5 Models Operational
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          {activeTab === 'monitor' && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white">Live Monitor</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Real-time AI inference across all detection modules</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Auto-refresh every 3s
                </div>
              </div>

              <MetricCards />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Vision Feed – wider */}
                <div className="lg:col-span-2">
                  <VisionFeed />
                </div>
                {/* Right column */}
                <div className="flex flex-col gap-5">
                  <AccidentAlert probability={accidentProb} />
                  <SignalController activePhase={rlPhase} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-2xl font-black text-white">Flow Analytics</h2>
                <p className="text-sm text-gray-500 mt-0.5">LSTM traffic prediction vs actual vehicle density</p>
              </div>
              <TrafficStats />
            </div>
          )}

          {activeTab === 'accidents' && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-2xl font-black text-white">Accident Logs</h2>
                <p className="text-sm text-gray-500 mt-0.5">Real-time CNN accident detection results</p>
              </div>
              <AccidentAlert probability={accidentProb} />
              <div className="bg-[#0d0d10] border border-gray-800 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-gray-800 flex items-center justify-between">
                  <span className="font-semibold">Recent Events</span>
                  <span className="text-xs text-gray-500">Last 24 hours</span>
                </div>
                <div className="divide-y divide-gray-800">
                  {[
                    { time: '14:32', loc: 'Anna Salai & Kathipara', risk: 0.91, status: 'ACTIVE' },
                    { time: '12:15', loc: 'Guindy Junction', risk: 0.82, status: 'RESOLVED' },
                    { time: '09:47', loc: 'OMR Toll Gate', risk: 0.76, status: 'RESOLVED' },
                    { time: '07:20', loc: 'Tambaram Bypass', risk: 0.68, status: 'RESOLVED' },
                  ].map((e, i) => (
                    <div key={i} className="px-5 py-4 flex items-center gap-4 hover:bg-gray-900/40 transition-colors">
                      <div className="text-xs text-gray-500 font-mono w-12">{e.time}</div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-200">{e.loc}</div>
                        <div className="text-xs text-gray-500 mt-0.5">Accident Prob: {(e.risk * 100).toFixed(0)}%</div>
                      </div>
                      <span className={cn(
                        "px-2 py-1 rounded-lg text-[10px] font-bold",
                        e.status === 'ACTIVE' ? "bg-red-500/15 text-red-400" : "bg-green-500/10 text-green-400"
                      )}>
                        {e.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'datalab' && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-2xl font-black text-white">Data Lab</h2>
                <p className="text-sm text-gray-500 mt-0.5">Upload and manage training samples for all models</p>
              </div>
              <DataLab />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
