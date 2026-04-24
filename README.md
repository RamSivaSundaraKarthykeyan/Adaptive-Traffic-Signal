# Smart Traffic AI — Tamil Nadu ITMS Extension

## Overview
An end-to-end AI-powered traffic management system targeting Tamil Nadu's major urban corridors.
Built for RTX 2050 (4GB VRAM) with full GPU acceleration.

## Target Region
**Tamil Nadu, India** — Major cities covered:
- Chennai (capital — primary focus)
- Coimbatore
- Madurai
- Tiruchirappalli (Trichy)
- Salem
- Tirunelveli

## Folder Structure
```
nm_traffic_flow_optimization/
├── data/
│   ├── raw/india_vehicles/    # Roboflow YOLOv8 Indian traffic dataset
│   ├── raw/pems/              # PeMS04 traffic flow sensor data
│   ├── raw/accidents/         # Accident detection images
│   ├── labeled/               # YAML configs for training
│   └── processed/             # Preprocessed .npy / .pkl files
├── models/
│   ├── yolo/                  # YOLOv8s fine-tuned on Indian traffic
│   ├── lstm/                  # LSTM traffic flow predictor
│   ├── rl/                    # PPO RL signal optimizer (SUMO)
│   └── accident/              # EfficientNet-B0 accident detector
├── signal_graph/              # OSM-based Tamil Nadu signal graph
├── mqtt/                      # Inter-signal MQTT communication
├── dashboard/                 # FastAPI + React monitoring dashboard
├── sumo_sim/                  # SUMO simulation files
└── logs/                      # Training + runtime logs
```

## Models
| Model | Architecture | Task | Target Metric |
|-------|-------------|------|---------------|
| Vehicle Detector | YOLOv8s | Detect 7 vehicle classes | mAP50 > 0.70 |
| Flow Predictor | LSTM (2-layer) | Predict density 30–120s ahead | MAE < 5 |
| Signal Optimizer | PPO (RL) | Minimize vehicle wait time | Positive reward trend |
| Accident Detector | EfficientNet-B0 | Binary accident/no-accident | Accuracy > 0.85 |

## Vehicle Classes
0: car | 1: truck | 2: two_wheeler | 3: auto_rickshaw | 4: bus | 5: ambulance | 6: pedestrian

## Quick Start
```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Build Tamil Nadu signal graph
python signal_graph/build_graph.py

# 3. Train models (run in order)
python models/yolo/train_yolo.py
python models/lstm/train_lstm.py
python models/accident/train_accident.py
python models/rl/train_rl.py

# 4. Integration test
python integration_test.py
```

## Hardware Requirements
- GPU: NVIDIA RTX 2050 (4GB VRAM) — minimum
- RAM: 8GB+ recommended
- Disk: 20GB free for datasets + model weights
- CUDA: 11.8+

---
*Smart Traffic AI | Tamil Nadu ITMS Extension | Built with Antigravity IDE*
