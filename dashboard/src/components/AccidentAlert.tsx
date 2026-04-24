"use client";

import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle2, Siren } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AccidentAlert({ probability }: { probability: number }) {
  const isHigh = probability > 0.7;
  
  return (
    <div className={cn(
      "border rounded-2xl p-6 transition-all duration-500 flex flex-col gap-4 shadow-xl",
      isHigh 
        ? "bg-red-500/10 border-red-500/50 shadow-red-500/10" 
        : "bg-green-500/5 border-green-500/20 shadow-green-500/5"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-3 rounded-xl",
            isHigh ? "bg-red-500 text-white animate-pulse" : "bg-green-500 text-white"
          )}>
            {isHigh ? <Siren size={24} /> : <CheckCircle2 size={24} />}
          </div>
          <div>
            <h3 className="text-lg font-bold">Safety Status</h3>
            <p className="text-sm text-gray-500">EfficientNet-B0 Analysis</p>
          </div>
        </div>
        <div className="text-right">
          <div className={cn(
            "text-2xl font-black",
            isHigh ? "text-red-400" : "text-green-400"
          )}>
            {(probability * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Risk Level</div>
        </div>
      </div>

      <div className="bg-black/40 rounded-xl p-4 border border-gray-800">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-gray-400">Threat Assessment</span>
          <span className={isHigh ? "text-red-400 font-bold" : "text-green-400 font-bold"}>
            {isHigh ? "ACCIDENT DETECTED" : "CLEAR"}
          </span>
        </div>
        <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full transition-all duration-1000 ease-out rounded-full",
              isHigh ? "bg-red-500" : "bg-green-500"
            )}
            style={{ width: `${probability * 100}%` }}
          />
        </div>
      </div>

      {isHigh && (
        <button className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-600/20">
          <ShieldAlert size={18} />
          DISPATCH EMERGENCY SERVICES
        </button>
      )}
    </div>
  );
}
