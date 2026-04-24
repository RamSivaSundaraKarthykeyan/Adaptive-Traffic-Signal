"use client";

import React from 'react';
import { Car, AlertTriangle, Activity, Cpu, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  color: string;
}

function StatCard({ label, value, sub, icon, trend, color }: StatCardProps) {
  return (
    <div className={cn(
      "bg-[#0d0d10] border border-gray-800 rounded-2xl p-5 flex flex-col gap-4 shadow-xl hover:border-gray-700 transition-colors"
    )}>
      <div className="flex items-start justify-between">
        <div className={cn("p-2.5 rounded-xl", color)}>{icon}</div>
        {trend && (
          <div className={cn("flex items-center gap-1 text-xs font-bold", trend === 'up' ? "text-green-400" : trend === 'down' ? "text-red-400" : "text-gray-400")}>
            {trend === 'up' ? <TrendingUp size={14} /> : trend === 'down' ? <TrendingDown size={14} /> : null}
            {trend === 'up' ? '+12%' : trend === 'down' ? '-8%' : '0%'}
          </div>
        )}
      </div>
      <div>
        <div className="text-3xl font-black text-white tracking-tight">{value}</div>
        <div className="text-sm text-gray-400 mt-0.5">{label}</div>
        <div className="text-xs text-gray-600 mt-1">{sub}</div>
      </div>
    </div>
  );
}

export default function MetricCards() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        label="Active Vehicles"
        value="1,248"
        sub="Across 6 intersections"
        icon={<Car size={20} className="text-blue-400" />}
        color="bg-blue-500/10"
        trend="up"
      />
      <StatCard
        label="Accidents Today"
        value="3"
        sub="2 resolved, 1 active"
        icon={<AlertTriangle size={20} className="text-red-400" />}
        color="bg-red-500/10"
        trend="down"
      />
      <StatCard
        label="Avg Signal Wait"
        value="42s"
        sub="RL optimized"
        icon={<Activity size={20} className="text-green-400" />}
        color="bg-green-500/10"
        trend="up"
      />
      <StatCard
        label="Model Inference"
        value="18ms"
        sub="GPU-accelerated"
        icon={<Cpu size={20} className="text-indigo-400" />}
        color="bg-indigo-500/10"
        trend="neutral"
      />
    </div>
  );
}
