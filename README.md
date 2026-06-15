# Smart Traffic AI — Chennai ITMS Extension

## Overview
An end-to-end AI-powered traffic management system targeting Chennai's major urban arterial corridors.
Built for RTX 2050 (4GB VRAM) with full GPU acceleration.

## Target Region
**Chennai, India** — Primary focus areas:
- Anna Salai
- OMR (Old Mahabalipuram Road)
- ECR (East Coast Road)
- Poonamallee High Road
- Inner Ring Road

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
├── signal_graph/              # OSM-based Chennai signal graph
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

## Quick Start (Setting up on a new PC)
```bash
# 1. Clone the repository
git clone https://github.com/RamSivaSundaraKarthykeyan/Adaptive-Traffic-Signal.git
cd Adaptive-Traffic-Signal

# 2. Setup Python Environment
python -m venv venv
venv\Scripts\activate      # On Windows
# source venv/bin/activate # On Linux/Mac

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Setup the Dashboard UI (Next.js)
cd dashboard
npm install
npm run dev

# The dashboard will be available at http://localhost:3000

# 5. Run the AI Pipeline / Integration Test
# (In a new terminal, make sure to activate the venv again)
python integration_test.py
```

### AI Models Note
The pretrained AI models (`best_accident.pt`, `best_lstm.pt`, `best.pt`) are tracked via git so you don't need to retrain them on a new PC. However, if you wish to retrain them from scratch:
```bash
python models/yolo/train_yolo.py
python models/lstm/train_lstm.py
python models/accident/train_accident.py
python models/rl/train_rl.py
```

## Hardware Requirements
- GPU: NVIDIA RTX 2050 (4GB VRAM) — minimum
- RAM: 8GB+ recommended
- Disk: 20GB free for datasets + model weights
- CUDA: 11.8+

---
*Smart Traffic AI | Chennai ITMS Extension | Built with Antigravity IDE*
