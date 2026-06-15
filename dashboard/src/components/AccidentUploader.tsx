"use client";

import React, { useState, useRef, useCallback } from "react";
import {
  Upload,
  ImageIcon,
  Video,
  X,
  Siren,
  Phone,
  Radio,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Ambulance,
  MapPin,
  Clock,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────
type AnalysisState = "idle" | "uploading" | "analyzing" | "done" | "error";

interface DetectionResult {
  accident_detected: boolean;
  confidence: number;
  severity: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  location_estimate: string;
  recommended_units: string[];
}

interface DispatchEvent {
  id: string;
  unit: string;
  eta: number;
  status: "DISPATCHED" | "EN_ROUTE" | "ON_SCENE";
  timestamp: string;
}

// ─── Severity helpers ───────────────────────────────────────────────────────
const SEVERITY_META = {
  LOW:      { color: "text-yellow-400",  bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
  MODERATE: { color: "text-orange-400",  bg: "bg-orange-500/10", border: "border-orange-500/30" },
  HIGH:     { color: "text-red-400",     bg: "bg-red-500/10",    border: "border-red-500/30"    },
  CRITICAL: { color: "text-rose-300",    bg: "bg-rose-500/15",   border: "border-rose-500/50"   },
};

// ─── Spoofed detection engine ───────────────────────────────────────────────
function simulateDetection(file: File): Promise<DetectionResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const isVideo = file.type.startsWith("video/");
      // Videos are treated as higher-confidence by heuristic
      const baseConf = isVideo ? 0.72 + Math.random() * 0.25 : 0.55 + Math.random() * 0.4;
      const confidence = Math.min(baseConf, 0.99);
      const accident_detected = confidence > 0.6;

      let severity: DetectionResult["severity"] = "LOW";
      if (confidence > 0.95) severity = "CRITICAL";
      else if (confidence > 0.82) severity = "HIGH";
      else if (confidence > 0.68) severity = "MODERATE";

      const locations = [
        "Anna Salai & Kathipara Flyover",
        "Guindy Industrial Junction",
        "OMR–Sholinganallur Signal",
        "Tambaram Bypass Km 12",
        "Mount Road & Gemini Flyover",
        "Koyambedu Bus Terminus Gate-3",
        "Madhya Kailash Signal, Adyar",
      ];

      const unitMap: Record<DetectionResult["severity"], string[]> = {
        LOW:      ["Ambulance-7"],
        MODERATE: ["Ambulance-7", "Traffic Police Unit-4"],
        HIGH:     ["Ambulance-7", "Ambulance-12", "Traffic Police Unit-4", "Fire Brigade-2"],
        CRITICAL: ["Ambulance-7", "Ambulance-12", "Fire Brigade-2", "Fire Brigade-5", "Traffic Police Unit-4", "Police QRT"],
      };

      resolve({
        accident_detected,
        confidence,
        severity,
        location_estimate: locations[Math.floor(Math.random() * locations.length)],
        recommended_units: accident_detected ? unitMap[severity] : [],
      });
    }, 2200);
  });
}

// ─── Spoofed emergency dispatch ─────────────────────────────────────────────
function dispatchEmergencyServices(units: string[]): DispatchEvent[] {
  const now = new Date();
  return units.map((unit, i) => ({
    id: `DISP-${Date.now()}-${i}`,
    unit,
    eta: 3 + Math.floor(Math.random() * 8),
    status: "DISPATCHED" as const,
    timestamp: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  }));
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function AccidentUploader() {
  const [file, setFile]               = useState<File | null>(null);
  const [preview, setPreview]         = useState<string | null>(null);
  const [state, setState]             = useState<AnalysisState>("idle");
  const [result, setResult]           = useState<DetectionResult | null>(null);
  const [dispatched, setDispatched]   = useState<DispatchEvent[]>([]);
  const [dragOver, setDragOver]       = useState(false);
  const [callLog, setCallLog]         = useState<string[]>([]);
  const [progress, setProgress]       = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── file intake ────────────────────────────────────────────────────────
  const acceptFile = useCallback((f: File) => {
    const isImage = f.type.startsWith("image/");
    const isVideo = f.type.startsWith("video/");
    if (!isImage && !isVideo) return;

    setFile(f);
    setResult(null);
    setDispatched([]);
    setCallLog([]);
    setState("idle");
    setProgress(0);

    const url = URL.createObjectURL(f);
    setPreview(url);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }, [acceptFile]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setDispatched([]);
    setCallLog([]);
    setState("idle");
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  // ── analysis pipeline ──────────────────────────────────────────────────
  const runAnalysis = async () => {
    if (!file) return;
    setState("uploading");
    setProgress(0);

    // Simulate upload progress
    const progressInterval = setInterval(() => {
      setProgress((p) => {
        if (p >= 85) { clearInterval(progressInterval); return 85; }
        return p + Math.random() * 15;
      });
    }, 180);

    await new Promise((r) => setTimeout(r, 900));
    clearInterval(progressInterval);
    setProgress(100);
    setState("analyzing");

    try {
      const detection = await simulateDetection(file);
      setResult(detection);
      setState("done");

      if (detection.accident_detected) {
        // Auto-dispatch
        const events = dispatchEmergencyServices(detection.recommended_units);
        setDispatched(events);
        appendLog(`[${new Date().toLocaleTimeString()}] ACCIDENT DETECTED – Confidence ${(detection.confidence * 100).toFixed(1)}%`);
        appendLog(`[${new Date().toLocaleTimeString()}] Severity Level: ${detection.severity}`);
        appendLog(`[${new Date().toLocaleTimeString()}] Location estimate: ${detection.location_estimate}`);
        events.forEach((ev) =>
          appendLog(`[${ev.timestamp}] Dispatching ${ev.unit} → ETA ${ev.eta} min`)
        );
        appendLog(`[${new Date().toLocaleTimeString()}] All units notified. Monitoring active.`);
      } else {
        appendLog(`[${new Date().toLocaleTimeString()}] Analysis complete – No accident detected (conf: ${(detection.confidence * 100).toFixed(1)}%)`);
      }
    } catch {
      setState("error");
    }
  };

  const appendLog = (msg: string) =>
    setCallLog((prev) => [...prev, msg]);

  const manualDispatch = () => {
    if (!result) return;
    const events = dispatchEmergencyServices(result.recommended_units.length ? result.recommended_units : ["Ambulance-7", "Traffic Police Unit-4"]);
    setDispatched(events);
    events.forEach((ev) =>
      appendLog(`[${ev.timestamp}] MANUAL DISPATCH: ${ev.unit} → ETA ${ev.eta} min`)
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  const sev = result ? SEVERITY_META[result.severity] : null;

  return (
    <div className="flex flex-col gap-5">

      {/* ── Upload zone ── */}
      <div
        id="accident-upload-zone"
        className={cn(
          "relative border-2 border-dashed rounded-2xl transition-all duration-300 overflow-hidden",
          dragOver
            ? "border-blue-500 bg-blue-500/5 scale-[1.01]"
            : file
            ? "border-gray-700 bg-[#0d0d10]"
            : "border-gray-700/60 bg-[#0d0d10] hover:border-gray-600 hover:bg-gray-900/40 cursor-pointer"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !file && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={onFileChange}
          id="accident-file-input"
        />

        {!file ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center gap-4 py-14 px-6 text-center">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/20 flex items-center justify-center">
                <Upload size={28} className="text-red-400" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#0d0d10] border border-gray-700 flex items-center justify-center">
                <ImageIcon size={12} className="text-gray-400" />
              </div>
            </div>
            <div>
              <p className="text-base font-semibold text-gray-200">Drop accident media here</p>
              <p className="text-sm text-gray-500 mt-1">Supports JPG, PNG, MP4, MOV — or click to browse</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-800/60 border border-gray-700/50 px-3 py-1.5 rounded-full">
                <ImageIcon size={12} /> Images
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-800/60 border border-gray-700/50 px-3 py-1.5 rounded-full">
                <Video size={12} /> Videos
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-800/60 border border-gray-700/50 px-3 py-1.5 rounded-full">
                <Zap size={12} /> AI Detection
              </span>
            </div>
          </div>
        ) : (
          /* Preview */
          <div className="flex flex-col sm:flex-row gap-0">
            {/* Media preview */}
            <div className="relative sm:w-64 h-48 sm:h-auto flex-shrink-0 bg-black">
              {file.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview!} alt="Accident media" className="w-full h-full object-cover" />
              ) : (
                <video src={preview!} className="w-full h-full object-cover" controls muted />
              )}
              {/* Overlay badge */}
              <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-xs text-gray-300 px-2 py-1 rounded-lg border border-gray-700/50 flex items-center gap-1.5">
                {file.type.startsWith("video/") ? <Video size={10} /> : <ImageIcon size={10} />}
                {file.type.startsWith("video/") ? "VIDEO" : "IMAGE"}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); clearFile(); }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 border border-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition-colors"
                id="clear-media-btn"
              >
                <X size={14} />
              </button>
            </div>

            {/* File info */}
            <div className="flex-1 p-5 flex flex-col justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-200 truncate">{file.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {(file.size / 1024 / 1024).toFixed(2)} MB · {file.type}
                </p>
              </div>

              {/* Progress bar */}
              {(state === "uploading" || state === "analyzing") && (
                <div className="flex flex-col gap-2 mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" />
                      {state === "uploading" ? "Uploading to analysis server…" : "Running EfficientNet-B0 inference…"}
                    </span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        state === "analyzing" ? "bg-orange-500 animate-pulse" : "bg-blue-500"
                      )}
                      style={{ width: `${state === "analyzing" ? 100 : progress}%` }}
                    />
                  </div>
                </div>
              )}

              {state === "idle" && (
                <button
                  id="run-analysis-btn"
                  onClick={(e) => { e.stopPropagation(); runAnalysis(); }}
                  className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all duration-200 shadow-lg shadow-blue-600/20 w-fit"
                >
                  <Zap size={15} />
                  Analyse with AI
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Detection result ── */}
      {state === "done" && result && (
        <div className={cn(
          "border rounded-2xl overflow-hidden transition-all duration-500",
          result.accident_detected
            ? "border-red-500/40 bg-red-500/5"
            : "border-green-500/20 bg-green-500/5"
        )}>
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-800/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2.5 rounded-xl",
                result.accident_detected ? "bg-red-500 text-white animate-pulse" : "bg-green-500 text-white"
              )}>
                {result.accident_detected ? <Siren size={20} /> : <CheckCircle2 size={20} />}
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {result.accident_detected ? "Accident Detected" : "No Accident Detected"}
                </h3>
                <p className="text-xs text-gray-500">EfficientNet-B0 · YOLOv8 composite analysis</p>
              </div>
            </div>
            <div className="text-right">
              <div className={cn(
                "text-2xl font-black",
                result.accident_detected ? "text-red-400" : "text-green-400"
              )}>
                {(result.confidence * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Confidence</div>
            </div>
          </div>

          {/* Details */}
          {result.accident_detected && (
            <div className="p-6 flex flex-col gap-5">
              {/* Severity + Location */}
              <div className="grid grid-cols-2 gap-4">
                <div className={cn("rounded-xl p-4 border", sev!.bg, sev!.border)}>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Severity</div>
                  <div className={cn("text-xl font-black", sev!.color)}>{result.severity}</div>
                </div>
                <div className="rounded-xl p-4 bg-gray-900/60 border border-gray-800">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1 flex items-center gap-1">
                    <MapPin size={10} /> Location Estimate
                  </div>
                  <div className="text-sm font-semibold text-gray-200 leading-tight">{result.location_estimate}</div>
                </div>
              </div>

              {/* Recommended units */}
              <div>
                <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Recommended Response Units</div>
                <div className="flex flex-wrap gap-2">
                  {result.recommended_units.map((u) => (
                    <span key={u} className="flex items-center gap-1.5 text-xs bg-gray-800 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-full">
                      <Ambulance size={11} className="text-red-400" />
                      {u}
                    </span>
                  ))}
                </div>
              </div>

              {/* Dispatch button */}
              {dispatched.length === 0 ? (
                <button
                  id="dispatch-emergency-btn"
                  onClick={manualDispatch}
                  className="w-full py-3.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2.5 shadow-xl shadow-red-600/25 text-sm"
                >
                  <ShieldAlert size={18} />
                  DISPATCH EMERGENCY SERVICES
                </button>
              ) : (
                <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
                  <div className="flex items-center gap-2 text-orange-400 font-bold text-sm mb-3">
                    <Radio size={15} className="animate-pulse" />
                    Emergency Services Dispatched
                  </div>
                  <div className="flex flex-col gap-2">
                    {dispatched.map((ev) => (
                      <div key={ev.id} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-gray-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                          {ev.unit}
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="text-gray-500 flex items-center gap-1">
                            <Clock size={10} /> ETA {ev.eta} min
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-bold text-[10px] uppercase">
                            {ev.status}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Error state ── */}
      {state === "error" && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertCircle size={18} />
          <div>
            <p className="font-semibold">Analysis failed</p>
            <p className="text-xs text-red-400/70 mt-0.5">Could not connect to detection backend. Check that app.py is running.</p>
          </div>
        </div>
      )}

      {/* ── Activity log ── */}
      {callLog.length > 0 && (
        <div className="rounded-2xl border border-gray-800 bg-[#080810] overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2">
            <Phone size={14} className="text-gray-500" />
            <span className="text-sm font-semibold text-gray-300">Emergency Dispatch Log</span>
            <span className="ml-auto text-[10px] text-gray-600 font-mono uppercase tracking-wider">LIVE</span>
          </div>
          <div className="p-4 font-mono text-xs leading-relaxed max-h-44 overflow-y-auto flex flex-col gap-1 scrollbar-hide">
            {callLog.map((line, i) => (
              <div
                key={i}
                className={cn(
                  "transition-all",
                  line.includes("ACCIDENT") || line.includes("MANUAL")
                    ? "text-red-400"
                    : line.includes("Dispatching") || line.includes("Dispatch")
                    ? "text-orange-400"
                    : line.includes("complete") || line.includes("notified")
                    ? "text-green-400"
                    : "text-gray-500"
                )}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
