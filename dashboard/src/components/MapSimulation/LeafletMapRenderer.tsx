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

const cautionIcon = typeof window !== 'undefined' ? L.divIcon({
  html: `<div style="display:flex; align-items:center; justify-content:center; width:28px; height:28px; filter: drop-shadow(0 0 6px rgba(239,68,68,0.6));">
           <svg viewBox="0 0 24 24" width="28" height="28" stroke="#ef4444" stroke-width="2.5" fill="#ef4444" fill-opacity="0.2" stroke-linecap="round" stroke-linejoin="round">
             <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
             <line x1="12" y1="9" x2="12" y2="13" stroke="#ef4444" stroke-width="3"></line>
             <line x1="12" y1="17" x2="12.01" y2="17" stroke="#ef4444" stroke-width="3"></line>
           </svg>
         </div>`,
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
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
  const svgNames = [
    'car-private-car-svgrepo-com.svg',
    'car-private-car-svgrepo-com (1).svg',
    'car-private-car-svgrepo-com (2).svg'
  ];
  let svgIdx = 0;
  if (v.id) {
    let charSum = 0;
    for (let i = 0; i < v.id.length; i++) {
      charSum += v.id.charCodeAt(i);
    }
    svgIdx = charSum % svgNames.length;
  }
  const svgName = svgNames[svgIdx];

  const road = ROADS.find(r => r.id === v.roadId);
  let isMovingLeft = false;
  if (road) {
    if (road.path && road.path.length >= 2) {
      const numSegments = road.path.length - 1;
      const scaledProgress = v.progress * numSegments;
      const segIdx = Math.min(Math.floor(scaledProgress), numSegments - 1);
      const p1 = road.path[segIdx];
      const p2 = road.path[segIdx + 1];
      isMovingLeft = p2[1] > p1[1];
    } else {
      const fromJ = JUNCTIONS.find(j => j.id === v.fromJunctionId);
      const toJ = JUNCTIONS.find(j => j.id === v.toJunctionId);
      if (fromJ && toJ) {
        isMovingLeft = toJ.lon < fromJ.lon;
      }
    }
  }

  const transformStyle = isMovingLeft ? 'transform: scaleX(-1);' : '';

  return L.divIcon({
    html: `<div style="width:24px; height:24px; display:flex; align-items:center; justify-content:center; ${transformStyle}">
             <img src="/${svgName}" style="width:24px; height:24px;" alt="car" />
           </div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

function signalColor(phase: string): string {
  if (phase === 'green') return '#22c55e';
  if (phase === 'yellow') return '#eab308';
  return '#ef4444';
}

function densityColor(d: number): string {
  if (d > 0.65) return '#ef4444';
  if (d > 0.30) return '#eab308';
  return '#94a3b8';
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

  if (!mounted) return <div className="w-full h-[560px] bg-[#f8fafc] animate-pulse"></div>;

  return (
    <div className="relative w-full h-[560px] bg-[#f8fafc]">
      {/* Title overlay */}
      <div className="absolute top-3 left-3 z-[1000] bg-white/80 border border-gray-200/80 rounded-lg px-3 py-1.5 backdrop-blur-md shadow-sm">
        <h3 className="text-gray-800 font-bold text-sm tracking-wide">
          {isTraditional ? 'Traditional Fixed Timing' : 'AI Adaptive Optimizer'}
        </h3>
      </div>

      <MapContainer
        center={MAP_CENTER}
        zoom={ZOOM}
        style={{ height: '100%', width: '100%', backgroundColor: '#f8fafc' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
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
              opacity={density > 0.05 ? density * 0.5 + 0.5 : 0.4}
            >
              <Tooltip sticky className="bg-white/90 text-gray-800 border-gray-200 font-medium">{road.name}</Tooltip>
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

          if (hasAccident) {
            return (
              <Marker
                key={j.id}
                position={[j.lat, j.lon]}
                icon={cautionIcon!}
                eventHandlers={{
                  click: () => onSignalClick(j.id)
                }}
              >

              </Marker>
            );
          }

          return (
            <CircleMarker
              key={j.id}
              center={[j.lat, j.lon]}
              radius={isSelected ? 10 : 7}
              pathOptions={{
                fillColor: color,
                fillOpacity: 1,
                color: '#cbd5e1',
                weight: 2,
              }}
              eventHandlers={{
                click: () => onSignalClick(j.id)
              }}
            >
              <Tooltip direction="top" offset={[0, -10]} className="bg-white/90 text-gray-800 border-gray-200 font-bold shadow-sm">
                {j.name}
                <br />
                <span className="text-xs text-gray-500 font-normal">Q: {(sig?.queueNS ?? 0) + (sig?.queueEW ?? 0)} · {Math.ceil(sig?.timeRemainingS ?? 0)}s</span>
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
