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
    )}>
      
    </div>
  );
}

export default function MetricCards() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      
    </div>
  );
}
