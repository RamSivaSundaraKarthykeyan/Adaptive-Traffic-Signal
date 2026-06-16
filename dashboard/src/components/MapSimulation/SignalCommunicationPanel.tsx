'use client';
import React, { useRef, useEffect } from 'react';
import { MessageSquare, Radio, AlertTriangle, Zap, CheckCircle } from 'lucide-react';
import { SignalMessage } from './SimulationAPIBus';
import { JUNCTIONS } from './data/chennaiData';
import { cn } from '@/lib/utils';

interface Props {
  messages: SignalMessage[];
}

const MSG_STYLES: Record<SignalMessage['type'], { color: string; icon: React.ReactNode; label: string }> = {
  CLEAR_PATH:    { color: 'text-red-400',    icon: <AlertTriangle size={11} />, label: 'PATH CLEAR' },
  ACCIDENT_ALERT:{ color: 'text-orange-400', icon: <AlertTriangle size={11} />, label: 'ACCIDENT'   },
  VEHICLE_PASS:  { color: 'text-blue-400',   icon: <Radio size={11} />,         label: 'PASS'       },
  PHASE_SYNC:    { color: 'text-indigo-400', icon: <Zap size={11} />,           label: 'SYNC'       },
  EMERGENCY_DONE:{ color: 'text-green-400',  icon: <CheckCircle size={11} />,   label: 'RESOLVED'   },
};

function jName(id: string): string {
  const j = JUNCTIONS.find(j => j.id === id);
  if (j) return j.name.split(' ')[0];           // short name
  return id.length > 8 ? id.slice(0, 8) : id;  // vehicle id abbreviated
}

export default function SignalCommunicationPanel({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const recent = messages.slice(-30).reverse();

  return (
    <div className="rounded-2xl border border-gray-800 bg-[#0c0f1d] overflow-hidden flex flex-col h-64">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2 flex-shrink-0">
        <MessageSquare size={14} className="text-indigo-400" />
        <span className="text-sm font-bold text-gray-300">Signal Communication Bus</span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-green-400 font-bold">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          LIVE
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col-reverse gap-1 scrollbar-hide">
        {recent.map((msg, i) => {
          const style = MSG_STYLES[msg.type];
          const time = new Date(msg.timestamp).toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
          });

          return (
            <div
              key={msg.id}
              className={cn(
                'flex items-start gap-2 px-2 py-1.5 rounded-lg text-[10px] font-mono transition-all',
                i === 0
                  ? 'bg-gray-800/60 border border-gray-700/40'
                  : 'bg-transparent'
              )}
            >
              <span className={cn('flex-shrink-0 mt-0.5', style.color)}>
                {style.icon}
              </span>
              <span className="text-gray-600 w-16 flex-shrink-0">{time}</span>
              <span className={cn('font-bold flex-shrink-0 w-16', style.color)}>
                [{style.label}]
              </span>
              <span className="text-gray-400">
                <span className="text-blue-400">{jName(msg.fromId)}</span>
                <span className="text-gray-600"> → </span>
                <span className="text-purple-400">{jName(msg.toId)}</span>
                {!!msg.payload.vehicleType && (
                  <span className="text-gray-500 ml-1">
                    ({String(msg.payload.vehicleType).toUpperCase()}{msg.payload.priority ? ` · ${String(msg.payload.priority)}` : ''})
                  </span>
                )}
                {!!msg.payload.phase && (
                  <span className="text-gray-500 ml-1">phase={String(msg.payload.phase)}</span>
                )}
                {!!msg.payload.severity && (
                  <span className="text-orange-500 ml-1">severity={String(msg.payload.severity)}</span>
                )}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
