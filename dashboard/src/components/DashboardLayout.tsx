
"use client";

import React from 'react';
import { LayoutDashboard, Activity, AlertTriangle, Settings, Database, Map as MapIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}

const NavItem = ({ icon, label, active }: NavItemProps) => (
  <div className={cn(
    "flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-200 rounded-xl group",
    active ? "bg-blue-600/20 text-blue-400" : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
  )}>
    <span className={cn("transition-transform group-hover:scale-110", active && "scale-110")}>{icon}</span>
    <span className="font-medium">{label}</span>
  </div>
);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-[#0a0a0c] text-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-800 p-6 flex flex-col gap-8 bg-[#0d0d10]">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
            T
          </div>
          <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            TN-ITMS AI
          </h1>
        </div>

        <nav className="flex flex-col gap-2">
          <NavItem icon={<LayoutDashboard size={20} />} label="Live Monitor" active />
          <NavItem icon={<Activity size={20} />} label="Flow Analytics" />
          <NavItem icon={<AlertTriangle size={20} />} label="Accident Logs" />
          <NavItem icon={<MapIcon size={20} />} label="Signal Graph" />
          <NavItem icon={<Database size={20} />} label="Data Lab" />
        </nav>

        <div className="mt-auto pt-6 border-t border-gray-800 flex flex-col gap-4">
          <NavItem icon={<Settings size={20} />} label="System Config" />
          <div className="px-4 py-3 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-gray-700/50">
            <div className="text-xs text-gray-500 mb-1">GPU Status</div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-semibold text-green-400">CUDA Active</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Header */}
        <header className="h-16 border-b border-gray-800 flex items-center justify-between px-8 bg-[#0a0a0c]/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-800/50 px-3 py-1.5 rounded-full border border-gray-700/50">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              Location: <span className="text-gray-200 font-medium">Chennai - Anna Salai</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex -space-x-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-[#0a0a0c] bg-gray-700 flex items-center justify-center text-[10px] font-bold">
                  AI{i}
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 bg-[#0a0a0c] scrollbar-hide">
          {children}
        </div>
      </main>
    </div>
  );
}
