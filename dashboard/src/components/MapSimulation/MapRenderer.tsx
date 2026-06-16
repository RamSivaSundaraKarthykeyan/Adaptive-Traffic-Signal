'use client';
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { JUNCTIONS, ROADS, HOSPITALS, MAP_W, MAP_H } from './data/chennaiData';
import { SignalState, VehicleState, AccidentEvent } from './SimulationAPIBus';
import { EngineState } from './SimulationEngine';

interface MapRendererProps {
  engineState: EngineState;
  frame: number;
  onSignalClick: (junctionId: string) => void;
  selectedSignalId: string | null;
}

// ── Density → road color ──────────────────────────────────────────────────
function densityColor(d: number): string {
  if (d > 0.65) return 'rgba(239,68,68,0.55)';     // red   – high
  if (d > 0.30) return 'rgba(234,179,8,0.45)';     // yellow – medium
  return 'rgba(148,163,184,0.10)';                  // no color – normal
}

function densityStroke(d: number): string {
  if (d > 0.65) return '#ef4444';
  if (d > 0.30) return '#eab308';
  return '#334155';
}

// ── Signal node color ─────────────────────────────────────────────────────
function signalColor(phase: SignalState['phase']): string {
  if (phase === 'green')  return '#22c55e';
  if (phase === 'yellow') return '#eab308';
  return '#ef4444';
}

export default function MapRenderer({ engineState, frame, onSignalClick, selectedSignalId }: MapRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // ── Background ──────────────────────────────────────────────────────
    ctx.fillStyle = '#0b0f1e';
    ctx.fillRect(0, 0, W, H);

    // Subtle grid lines (city block feel)
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < W; gx += 40) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (let gy = 0; gy < H; gy += 40) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    // ── Roads ───────────────────────────────────────────────────────────
    for (const road of ROADS) {
      const fromJ = JUNCTIONS.find(j => j.id === road.from);
      const toJ   = JUNCTIONS.find(j => j.id === road.to);
      if (!fromJ || !toJ) continue;

      const density = engineState.densityMap.get(road.id) ?? 0;

      // Road base (dark lane)
      ctx.beginPath();
      ctx.moveTo(fromJ.x, fromJ.y);
      ctx.lineTo(toJ.x, toJ.y);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = road.laneCount * 8;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Road surface
      ctx.beginPath();
      ctx.moveTo(fromJ.x, fromJ.y);
      ctx.lineTo(toJ.x, toJ.y);
      ctx.strokeStyle = '#263351';
      ctx.lineWidth = road.laneCount * 6;
      ctx.stroke();

      // Density overlay
      if (density > 0.05) {
        ctx.beginPath();
        ctx.moveTo(fromJ.x, fromJ.y);
        ctx.lineTo(toJ.x, toJ.y);
        ctx.strokeStyle = densityStroke(density);
        ctx.lineWidth = road.laneCount * 5;
        ctx.globalAlpha = density * 0.7 + 0.1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Lane divider dash
      ctx.beginPath();
      ctx.moveTo(fromJ.x, fromJ.y);
      ctx.lineTo(toJ.x, toJ.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 10]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Road name label (midpoint)
      const mx = (fromJ.x + toJ.x) / 2;
      const my = (fromJ.y + toJ.y) / 2;
      const angle = Math.atan2(toJ.y - fromJ.y, toJ.x - fromJ.x);
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(angle);
      ctx.fillStyle = 'rgba(148,163,184,0.35)';
      ctx.font = '9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(road.name, 0, -road.laneCount * 3 - 2);
      ctx.restore();
    }

    // ── Hospitals ────────────────────────────────────────────────────────
    for (const h of HOSPITALS) {
      // Glow
      ctx.beginPath();
      ctx.arc(h.x, h.y, 16, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 16);
      grad.addColorStop(0, 'rgba(239,68,68,0.3)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fill();

      // Circle
      ctx.beginPath();
      ctx.arc(h.x, h.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#7f1d1d';
      ctx.fill();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Red cross
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(h.x - 5, h.y); ctx.lineTo(h.x + 5, h.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(h.x, h.y - 5); ctx.lineTo(h.x, h.y + 5); ctx.stroke();

      // Label
      ctx.fillStyle = '#fca5a5';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(h.name, h.x, h.y + 13);
    }

    // ── Accident markers ──────────────────────────────────────────────────
    for (const acc of engineState.accidents.values()) {
      if (acc.resolved) continue;
      const j = JUNCTIONS.find(x => x.id === acc.junctionId);
      if (!j) continue;

      const pulse = Math.sin(frame * 0.15) * 0.5 + 0.5;
      ctx.beginPath();
      ctx.arc(j.x, j.y, 22 + pulse * 6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(239,68,68,${0.4 + pulse * 0.4})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = 'rgba(239,68,68,0.9)';
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚠', j.x, j.y - 28);
    }

    // ── Vehicles ──────────────────────────────────────────────────────────
    for (const v of engineState.vehicles.values()) {
      if (v.state === 'arrived') continue;

      const sirenFlash = Math.floor(frame / 6) % 2 === 0;

      if (v.type === 'ambulance') {
        // Siren glow
        if (sirenFlash) {
          ctx.beginPath();
          ctx.arc(v.x, v.y, 14, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(239,68,68,0.25)';
          ctx.fill();
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(v.x - 8, v.y - 5, 16, 10);
        ctx.fillStyle = sirenFlash ? '#ef4444' : '#3b82f6';
        ctx.fillRect(v.x - 3, v.y - 3, 6, 6);

        // AMB text
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 6px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('AMB', v.x, v.y + 7);

      } else if (v.type === 'fire_engine') {
        if (sirenFlash) {
          ctx.beginPath();
          ctx.arc(v.x, v.y, 16, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(249,115,22,0.3)';
          ctx.fill();
        }
        ctx.fillStyle = '#f97316';
        ctx.fillRect(v.x - 9, v.y - 5, 18, 10);
        ctx.fillStyle = sirenFlash ? '#fbbf24' : '#dc2626';
        ctx.fillRect(v.x - 3, v.y - 3, 6, 6);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 6px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('FIRE', v.x, v.y + 7);

      } else {
        // Normal car
        ctx.beginPath();
        ctx.arc(v.x, v.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = v.color;
        if (v.state === 'moving') {
          ctx.shadowColor = v.color;
          ctx.shadowBlur = 10;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // ── Traffic signal nodes (junctions) ─────────────────────────────────
    for (const j of JUNCTIONS) {
      const sig = engineState.signals.get(j.id);
      const phase = sig?.phase ?? 'red';
      const color = signalColor(phase);
      const isSelected = selectedSignalId === j.id;

      // Outer glow ring
      const pulse = Math.sin(frame * 0.1) * 0.4 + 0.6;
      ctx.beginPath();
      ctx.arc(j.x, j.y, isSelected ? 22 : 17, 0, Math.PI * 2);
      ctx.fillStyle = `${color}${Math.floor(pulse * 30).toString(16).padStart(2, '0')}`;
      ctx.fill();

      // Signal background
      ctx.beginPath();
      ctx.arc(j.x, j.y, isSelected ? 13 : 10, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();

      // Signal color dot
      ctx.beginPath();
      ctx.arc(j.x, j.y, isSelected ? 10 : 7, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Emergency ring
      if (sig?.hasEmergencyVehicle) {
        ctx.beginPath();
        ctx.arc(j.x, j.y, 18, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(239,68,68,${pulse})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Name label
      ctx.fillStyle = isSelected ? '#f1f5f9' : 'rgba(148,163,184,0.7)';
      ctx.font = isSelected ? 'bold 10px Inter, sans-serif' : '9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // Label background for readability
      const lw = ctx.measureText(j.name).width;
      ctx.fillStyle = 'rgba(11,15,30,0.75)';
      ctx.fillRect(j.x - lw / 2 - 3, j.y + 14, lw + 6, 14);
      ctx.fillStyle = isSelected ? '#f1f5f9' : 'rgba(148,163,184,0.7)';
      ctx.fillText(j.name, j.x, j.y + 15);

      // Queue count badge
      if (sig && (sig.queueNS + sig.queueEW) > 0) {
        const count = sig.queueNS + sig.queueEW;
        ctx.fillStyle = count > 6 ? '#ef4444' : '#f59e0b';
        ctx.beginPath();
        ctx.arc(j.x + 10, j.y - 10, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 7px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(count), j.x + 10, j.y - 10);
      }
    }

    // ── Legend ────────────────────────────────────────────────────────────
    const lx = 12, ly = H - 110;
    ctx.fillStyle = 'rgba(11,15,30,0.8)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(lx, ly, 160, 100, 8);
    else ctx.rect(lx, ly, 160, 100);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = 'rgba(148,163,184,0.8)';
    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('LEGEND', lx + 10, ly + 10);

    const entries = [
      { color: '#22c55e', label: 'Signal: Green' },
      { color: '#eab308', label: 'Signal: Yellow' },
      { color: '#ef4444', label: 'Signal: Red / High density road' },
      { color: '#fca5a5', label: 'Hospital' },
      { color: '#ffffff', label: 'Ambulance' },
      { color: '#f97316', label: 'Fire Engine' },
    ];
    entries.forEach((e, i) => {
      const ey = ly + 24 + i * 13;
      ctx.beginPath();
      ctx.arc(lx + 17, ey + 4, 4, 0, Math.PI * 2);
      ctx.fillStyle = e.color;
      ctx.fill();
      ctx.fillStyle = 'rgba(148,163,184,0.7)';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText(e.label, lx + 26, ey);
    });

  }, [engineState, frame, selectedSignalId]);

  useEffect(() => { draw(); }, [draw]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = MAP_W / rect.width;
    const scaleY = MAP_H / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top)  * scaleY;

    // Find nearest junction within 20px
    let best: string | null = null;
    let bestDist = 20;
    for (const j of JUNCTIONS) {
      const d = Math.hypot(j.x - cx, j.y - cy);
      if (d < bestDist) { bestDist = d; best = j.id; }
    }
    if (best) onSignalClick(best);
  }, [onSignalClick]);

  return (
    <canvas
      ref={canvasRef}
      width={MAP_W}
      height={MAP_H}
      className="w-full h-auto block cursor-pointer"
      onClick={handleClick}
      style={{ maxHeight: '560px' }}
    />
  );
}
