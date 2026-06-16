# Chennai ITMS — Simulation API Integration Guide

This document outlines the API contracts designed for the Chennai Intelligent Traffic Management System (ITMS) Map Simulation.

Currently, all APIs are **simulated in-browser** using the `SimulationAPIBus.ts` module. This allows the frontend to run entirely independently while maintaining a strict boundary. 

When you are ready to integrate the real FastAPI backend, you simply replace the bodies of the functions in `SimulationAPIBus.ts` with `fetch()` calls to these matching endpoints.

---

## 1. Map & Layout API

Provides static geographical and topological data.

### `GET /api/map/layout`
Returns the structural layout of the simulation area.

**Response Schema:**
```typescript
{
  junctions: Array<{
    id: string;
    name: string;
    lat: number;
    lon: number;
    x: number;          // SVG projected X
    y: number;          // SVG projected Y
    capacity: number;
    speedLimit: number;
  }>;
  roads: Array<{
    id: string;
    from: string;       // Junction ID
    to: string;         // Junction ID
    name: string;
    distanceM: number;
    laneCount: number;
  }>;
  hospitals: Array<{
    id: string;
    name: string;
    lat: number;
    lon: number;
    phone: string;
    nearestJunctionId: string;
  }>;
}
```

---

## 2. Traffic Signal API

Controls and reads the state of individual traffic signals.

### `GET /api/signals/:id/state`
Reads the current phase, queue depth, and timing.

**Response Schema:**
```typescript
{
  signalId: string;
  phase: "green" | "yellow" | "red";
  timeRemainingS: number;
  greenDurationS: number;
  queueNS: number;
  queueEW: number;
  nextPredictedPhase: "green" | "yellow" | "red";
  nextPredictedDurationS: number;
  hasEmergencyVehicle: boolean;
  emergencyDirection?: "NS" | "EW";
}
```

### `POST /api/signals/:id/state`
Updates the signal state (typically called by the AI Optimizer).

**Request Body:**
```typescript
{
  phase: "green" | "yellow" | "red";
  greenDurationS?: number;
}
```

---

## 3. Emergency & Accident API

Handles the triggering and resolution of accidents and emergency dispatches.

### `POST /api/accidents/trigger`
Triggers an accident at a specific junction.

**Request Body:**
```typescript
{
  junctionId: string;
}
```

**Response Schema:**
```typescript
{
  id: string;                  // e.g., "ACC-1718293910"
  junctionId: string;
  timestamp: number;
  severity: "minor" | "moderate" | "critical";
  resolved: boolean;
}
```

### `POST /api/emergency/dispatch-ambulance`
Dispatches an ambulance to handle an accident.

**Request Body:**
```typescript
{
  accidentId: string;
  hospitalId: string;
}
```

### `POST /api/emergency/dispatch-fire-engine`
Dispatches a fire engine (high priority) to handle a critical accident.

**Request Body:**
```typescript
{
  accidentId: string;
}
```

### `POST /api/signals/request-path-clearance`
Called by an emergency vehicle to broadcast its intended path to signals ahead of it.

**Request Body:**
```typescript
{
  vehicleId: string;
  vehicleType: "ambulance" | "fire_engine";
  pathJunctionIds: string[];  // Array of junction IDs along the route
}
```

---

## 4. Signal-to-Signal Communication (V2X / I2I)

Signals communicate with one another using a message bus to coordinate wave-green phases and accident alerts.

### `POST /api/signals/communicate`
Broadcasts a message from one entity (signal or vehicle) to a signal.

**Request Body:**
```typescript
{
  fromId: string;
  toId: string;
  type: "CLEAR_PATH" | "ACCIDENT_ALERT" | "VEHICLE_PASS" | "PHASE_SYNC" | "EMERGENCY_DONE";
  payload: Record<string, any>;
}
```

---

## 5. AI Optimizer API

The "brain" of the traffic system. It consumes queue data and outputs phase durations.

### `POST /api/ai/optimize-signal`
Requests a new timing phase for a specific junction based on current live metrics.

**Request Body:**
```typescript
{
  junctionId: string;
  queueNS: number;
  queueEW: number;
  hasEmergencyNS: boolean;
  hasEmergencyEW: boolean;
  timeStarvedNS: number;  // Seconds the NS phase has been waiting at red
  timeStarvedEW: number;  // Seconds the EW phase has been waiting at red
  capacity: number;       // Max capacity of the junction
}
```

**Response Schema:**
```typescript
{
  phase: "NS" | "EW";
  greenDurationS: number;
  reasoning: string;      // Human-readable explanation of why the AI picked this phase
}
```

## How to migrate to a real backend

Open `dashboard/src/components/MapSimulation/SimulationAPIBus.ts`.

Find a function, for example:
```typescript
export async function getMapLayout() {
  return { junctions: JUNCTIONS, roads: ROADS, hospitals: HOSPITALS };
}
```

And replace it with:
```typescript
export async function getMapLayout() {
  const res = await fetch('http://localhost:8000/api/map/layout');
  if (!res.ok) throw new Error('API Error');
  return await res.json();
}
```
All frontend components will automatically adapt without needing any UI changes.
