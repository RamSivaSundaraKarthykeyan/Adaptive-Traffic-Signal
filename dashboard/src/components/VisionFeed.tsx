"use client";

import React, { useState, useRef, useCallback } from 'react';
import { Upload, Image as ImageIcon, Video, CheckCircle2, Loader2, X, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Detection {
  class: string;
  conf: number;
  bbox: [number, number, number, number];
}

interface AnalysisResult {
  detections: Detection[];
  accident_probability: number;
  rl_suggested_phase: number;
  vehicle_count: number;
}

const CLASS_COLORS: Record<string, string> = {
  car: '#3b82f6',
  truck: '#f59e0b',
  bus: '#10b981',
  motorcycle: '#8b5cf6',
  person: '#ef4444',
  ambulance: '#ec4899',
};

function getColor(cls: string) {
  return CLASS_COLORS[cls.toLowerCase()] ?? '#6b7280';
}

export default function VisionFeed() {
  const [isDragging, setIsDragging] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const drawDetections = useCallback((img: HTMLImageElement, detections: Detection[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    detections.forEach(det => {
      const [x1, y1, x2, y2] = det.bbox;
      const color = getColor(det.class);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, canvas.width / 300);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      const label = `${det.class} ${(det.conf * 100).toFixed(0)}%`;
      const fontSize = Math.max(12, canvas.width / 60);
      ctx.font = `bold ${fontSize}px Inter, sans-serif`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(x1, y1 - fontSize - 6, tw + 12, fontSize + 8);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x1 + 6, y1 - 4);
    });
  }, []);

  const simulate = useCallback(async (url: string) => {
    setAnalyzing(true);
    setError(null);
    await new Promise(r => setTimeout(r, 1400));

    // Simulated realistic response from YOLO + CNN + RL pipeline
    const mockResult: AnalysisResult = {
      detections: [
        { class: 'car',   conf: 0.94, bbox: [40,  80,  220, 190] },
        { class: 'truck', conf: 0.88, bbox: [250, 100, 470, 230] },
        { class: 'car',   conf: 0.91, bbox: [500, 120, 680, 220] },
        { class: 'motorcycle', conf: 0.76, bbox: [150, 200, 230, 280] },
      ],
      accident_probability: Math.random() * 0.4,
      rl_suggested_phase: Math.floor(Math.random() * 4),
      vehicle_count: 4,
    };

    const img = new window.Image();
    img.src = url;
    img.onload = () => {
      drawDetections(img, mockResult.detections);
      setAnalyzing(false);
      setResult(mockResult);
    };
  }, [drawDetections]);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please upload an image file.'); return; }
    setResult(null);
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    simulate(url);
  }, [simulate]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const reset = () => { setImageUrl(null); setResult(null); setError(null); };

  return (
    <div className="bg-[#0d0d10] border border-gray-800 p-6 shadow-xl flex flex-col ml-[200px] gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">Live Vision Feed</h3>
          <p className="text-sm text-gray-500">YOLOv8 + EfficientNet-B0 + PPO RL</p>
        </div>
        {imageUrl && (
          <button onClick={reset} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors">
            <X size={18} />
          </button>
        )}
      </div>

      {!imageUrl ? (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-all duration-200",
            isDragging ? "border-blue-500 bg-blue-500/5" : "border-gray-700 hover:border-gray-500 hover:bg-gray-900/40"
          )}
        >
          <div className="p-5 bg-gray-800 rounded-2xl">
            <Upload size={32} className="text-gray-400" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-300">Drop a traffic image here</p>
            <p className="text-sm text-gray-500 mt-1">or click to browse — JPG, PNG, WEBP</p>
          </div>
          <div className="flex gap-3 mt-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg border border-gray-700 text-xs text-gray-400">
              <ImageIcon size={14} /> Photo
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg border border-gray-700 text-xs text-gray-400">
              <Video size={14} /> Frame
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
        </div>
      ) : (
        <div className="relative rounded-xl overflow-hidden bg-black border border-gray-800">
          {analyzing ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 gap-3">
              <Loader2 size={36} className="text-blue-400 animate-spin" />
              <p className="text-blue-400 font-semibold tracking-wide">Running Models...</p>
            </div>
          ) : null}
          <canvas ref={canvasRef} className="w-full h-auto max-h-[360px] object-contain" />
        </div>
      )}

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      {result && !analyzing && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Vehicles Detected</div>
            <div className="text-3xl font-black text-white">{result.vehicle_count}</div>
            <div className="flex gap-1 mt-2 flex-wrap">
              {result.detections.map((d, i) => (
                <span key={i} className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: getColor(d.class) + '33', color: getColor(d.class) }}>
                  {d.class}
                </span>
              ))}
            </div>
          </div>
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Accident Risk</div>
            <div className={cn("text-3xl font-black", result.accident_probability > 0.7 ? "text-red-400" : "text-green-400")}>
              {(result.accident_probability * 100).toFixed(1)}%
            </div>
            <div className="w-full bg-gray-800 h-1.5 rounded-full mt-3 overflow-hidden">
              <div className={cn("h-full rounded-full", result.accident_probability > 0.7 ? "bg-red-500" : "bg-green-500")}
                style={{ width: `${result.accident_probability * 100}%` }} />
            </div>
          </div>
          <div className="col-span-2 bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 flex items-center justify-between">
            <div className="text-sm text-gray-400">RL Agent Recommendation</div>
            <div className="flex items-center gap-2 font-bold text-blue-400">
              <Play size={16} />
              Phase {result.rl_suggested_phase} Activated
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
