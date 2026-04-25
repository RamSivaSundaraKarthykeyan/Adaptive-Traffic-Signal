"use client";

import React, { useState, useRef } from 'react';
import { UploadCloud, FileImage, CheckCircle2, Loader2, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SampleFile {
  id: string;
  name: string;
  size: string;
  status: 'uploading' | 'done' | 'error';
  type: 'accident' | 'no_accident' | 'traffic';
}

export default function DataLab() {
  const [files, setFiles] = useState<SampleFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFile = (f: File) => {
    const id = Math.random().toString(36).slice(2);
    const entry: SampleFile = {
      id,
      name: f.name,
      size: `${(f.size / 1024).toFixed(1)} KB`,
      status: 'uploading',
      type: 'traffic',
    };
    setFiles(prev => [entry, ...prev]);
    setTimeout(() => {
      setFiles(prev => prev.map(x => x.id === id ? { ...x, status: 'done' } : x));
    }, 1200 + Math.random() * 800);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    Array.from(e.dataTransfer.files).forEach(addFile);
  };

  const removeFile = (id: string) => setFiles(prev => prev.filter(x => x.id !== id));

  const TYPE_COLORS = {
    accident: 'text-red-400 bg-red-500/10',
    no_accident: 'text-green-400 bg-green-500/10',
    traffic: 'text-blue-400 bg-blue-500/10',
  };

  return (
    <div className="bg-[#0d0d10] border border-gray-800  p-6 shadow-xl flex flex-col gap-5">
      

      {/* Drop Zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl py-8 flex flex-col items-center gap-3 cursor-pointer transition-all duration-200",
          isDragging
            ? "border-blue-500 bg-blue-500/10"
            : "border-gray-700 hover:border-gray-600 hover:bg-gray-900/40"
        )}
      >
        <div className={cn("p-4 rounded-full transition-colors", isDragging ? "bg-blue-500/20" : "bg-gray-800")}>
          <UploadCloud size={28} className={isDragging ? "text-blue-400" : "text-gray-400"} />
        </div>
        <div className="text-center">
          <p className="font-semibold text-gray-300">Drag & drop image samples</p>
          <p className="text-xs text-gray-500 mt-1">JPG, PNG — accident / no_accident / traffic frames</p>
        </div>
        <button className="mt-1 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-blue-500/20">
          <Plus size={16} /> Browse Files
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => Array.from(e.target.files ?? []).forEach(addFile)} />
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Uploaded Samples</p>
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-3 p-3 bg-gray-900/60 border border-gray-800 rounded-xl">
              <div className="p-2 bg-gray-800 rounded-lg">
                <FileImage size={16} className="text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-200 truncate">{f.name}</p>
                <p className="text-xs text-gray-500">{f.size}</p>
              </div>
              <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", TYPE_COLORS[f.type])}>
                {f.type}
              </span>
              {f.status === 'uploading' ? (
                <Loader2 size={16} className="text-blue-400 animate-spin flex-shrink-0" />
              ) : (
                <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
              )}
              <button onClick={() => removeFile(f.id)} className="p-1 rounded hover:bg-gray-800 text-gray-600 hover:text-gray-300 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Accident', count: 1844, color: 'text-red-400' },
          { label: 'No Accident', count: 922, color: 'text-green-400' },
          { label: 'Total', count: 2766, color: 'text-blue-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900/40 border border-gray-800 rounded-xl p-3 text-center">
            <div className={cn("text-xl font-black", s.color)}>{s.count.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
