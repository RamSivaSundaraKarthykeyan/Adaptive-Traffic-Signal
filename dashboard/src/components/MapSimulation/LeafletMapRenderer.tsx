'use client';
import React, { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { EngineState } from './SimulationEngine';
import { JUNCTIONS, ROADS, HOSPITALS, Road } from './data/chennaiData';
import { SignalState, VehicleState } from './SimulationAPIBus';

// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Tooltip = dynamic(() => import('react-leaflet').then(m => m.Tooltip), { ssr: false });

// We need the CSS for Leaflet
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

interface LeafletMapRendererProps {
  engineState: EngineState;
  frame: number;
  onSignalClick: (junctionId: string) => void;
  selectedSignalId: string | null;
  isTraditional?: boolean;
}

// Map center for Anna Nagar
const MAP_CENTER: [number, number] = [13.078, 80.207];
const ZOOM = 14;

// Custom Icons
const hospitalIcon = typeof window !== 'undefined' ? L.divIcon({
  html: `<div style="background-color:#7f1d1d; border:2px solid #ef4444; width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fca5a5; font-weight:bold; font-size:12px; box-shadow: 0 0 10px rgba(239,68,68,0.5);">✚</div>`,
  className: '',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
}) : null;

// Vehicle Icons Generator
const getVehicleIcon = (v: VehicleState, frame: number) => {
  if (typeof window === 'undefined') return null;
  const sirenFlash = Math.floor(frame / 6) % 2 === 0;
  
  if (v.type === 'ambulance') {
    return L.divIcon({
      html: `<div style="width:16px; height:10px; background-color:#ffffff; position:relative; box-shadow: ${sirenFlash ? '0 0 10px rgba(239,68,68,0.8)' : 'none'};">
               <div style="width:6px; height:6px; background-color:${sirenFlash ? '#ef4444' : '#3b82f6'}; position:absolute; top:2px; left:5px;"></div>
             </div>`,
      className: '',
      iconSize: [16, 10],
      iconAnchor: [8, 5],
    });
  } else if (v.type === 'fire_engine') {
    return L.divIcon({
      html: `<div style="width:18px; height:10px; background-color:#f97316; position:relative; box-shadow: ${sirenFlash ? '0 0 15px rgba(249,115,22,0.8)' : 'none'};">
               <div style="width:6px; height:6px; background-color:${sirenFlash ? '#fbbf24' : '#dc2626'}; position:absolute; top:2px; left:6px;"></div>
             </div>`,
      className: '',
      iconSize: [18, 10],
      iconAnchor: [9, 5],
    });
  }
  
  // Normal car
  return L.divIcon({
    html: `<div style="width:8px; height:8px; background-color:${v.color}; border-radius:50%; box-shadow: 0 0 4px ${v.color};"></div>`,
    className: '',
    iconSize: [8, 8],
    iconAnchor: [4, 4],
  });
};

function signalColor(phase: string): string {
  if (phase === 'green')  return '#22c55e';
  if (phase === 'yellow') return '#eab308';
  return '#ef4444';
}

function densityColor(d: number): string {
  if (d > 0.65) return '#ef4444';
  if (d > 0.30) return '#eab308';
  return '#334155';
}

export default function LeafletMapRenderer({ engineState, frame, onSignalClick, selectedSignalId, isTraditional }: LeafletMapRendererProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Fix Leaflet's default icon paths
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  }, []);

  if (!mounted) return <div className="w-full h-[560px] bg-[#0c0f1d] animate-pulse"></div>;

  return (
    <div className="relative w-full h-[560px] bg-[#0c0f1d]">
      {/* Title overlay */}
      <div className="absolute top-3 left-3 z-[1000] bg-black/70 border border-gray-700/50 rounded-lg px-3 py-1.5 backdrop-blur-md">
        <h3 className="text-white font-bold text-sm tracking-wide">
          {isTraditional ? 'Traditional Fixed Timing' : 'AI Adaptive Optimizer'}
        </h3>
      </div>

      <MapContainer 
        center={MAP_CENTER} 
        zoom={ZOOM} 
        style={{ height: '100%', width: '100%', backgroundColor: '#0c0f1d' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* Roads */}
        {ROADS.map(road => {
          const fromJ = JUNCTIONS.find(j => j.id === road.from);
          const toJ = JUNCTIONS.find(j => j.id === road.to);
          if (!fromJ || !toJ) return null;
          
          const density = engineState.densityMap.get(road.id) ?? 0;
          const color = densityColor(density);

          // Use path waypoints if available, else just a straight line
          const positions: [number, number][] = road.path && road.path.length >= 2
            ? road.path
            : [[fromJ.lat, fromJ.lon], [toJ.lat, toJ.lon]];

          return (
            <Polyline
              key={road.id}
              positions={positions}
              color={color}
              weight={road.laneCount * 2 + 1}
              opacity={density > 0.05 ? density * 0.5 + 0.3 : 0.2}
            >
              <Tooltip sticky className="bg-black/80 text-white border-gray-700">{road.name}</Tooltip>
            </Polyline>
          );
        })}

        {/* Hospitals */}
        {HOSPITALS.map(h => (
          <Marker 
            key={h.id} 
            position={[h.lat, h.lon]} 
            icon={hospitalIcon!}
          >
            <Tooltip direction="top" offset={[0, -10]} className="bg-rose-900/90 text-rose-100 border-rose-500 font-bold">
              {h.name}
            </Tooltip>
          </Marker>
        ))}

        {/* Signals / Junctions */}
        {JUNCTIONS.map(j => {
          const sig = engineState.signals.get(j.id);
          const phase = sig?.phase ?? 'red';
          const color = signalColor(phase);
          const isSelected = selectedSignalId === j.id;

          const hasAccident = Array.from(engineState.accidents.values()).some(a => a.junctionId === j.id && !a.resolved);
          
          return (
            <CircleMarker
              key={j.id}
              center={[j.lat, j.lon]}
              radius={isSelected ? 10 : 7}
              pathOptions={{
                fillColor: hasAccident ? '#ef4444' : color,
                fillOpacity: 1,
                color: hasAccident ? '#ffffff' : '#0f172a',
                weight: 2,
              }}
              eventHandlers={{
                click: () => onSignalClick(j.id)
              }}
            >
              <Tooltip direction="top" offset={[0, -10]} permanent={hasAccident} className="bg-black/80 text-white border-gray-700 font-bold">
                {hasAccident ? `⚠️ ACCIDENT: ${j.name}` : j.name}
                <br/>
                <span className="text-xs text-gray-400 font-normal">Q: {(sig?.queueNS??0) + (sig?.queueEW??0)} · {Math.ceil(sig?.timeRemainingS??0)}s</span>
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* Vehicles */}
        {Array.from(engineState.vehicles.values()).map(v => {
          if (v.state === 'arrived') return null;
          const icon = getVehicleIcon(v, frame);
          if (!icon) return null;

          return (
            <Marker
              key={v.id}
              position={[v.lat, v.lon]}
              icon={icon}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}
