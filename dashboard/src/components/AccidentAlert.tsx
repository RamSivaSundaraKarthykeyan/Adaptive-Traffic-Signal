"use client";

import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle2, Siren } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AccidentAlert({ probability }: { probability: number }) {
  const isHigh = probability > 0.7;
  
  return (
    <div className={cn(
     
    )}>
      

      
    </div>
  );
}
