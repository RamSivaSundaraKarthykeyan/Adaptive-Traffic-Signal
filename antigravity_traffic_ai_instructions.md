# Smart Traffic AI System — Antigravity IDE Instructions
### RTX 2050 Laptop | Full Agent Execution Plan

---

## WHAT IS ANTIGRAVITY

Google Antigravity is a free, agent-first IDE released in November 2025. It is a full fork of VS Code powered primarily by Gemini 3 Pro, with support for Claude Sonnet 4.6 and GPT-OSS. It does not just suggest code — its autonomous agents plan, write code, run terminal commands, browse the web, download files, and verify results on their own. This makes it ideal for a project like this where you need an agent that can fetch datasets, set up environments, and train models automatically.

**Key capability relevant to your project:**
The agent operates across your editor, terminal, and browser simultaneously. You give it a task in plain language; it handles execution autonomously and reports back with artifacts (plans, diffs, screenshots, logs).

---

## STEP 1 — INSTALL ANTIGRAVITY

### 1.1 Download
Go to: **https://antigravity.google**
The page auto-detects your OS. Download the Windows installer (`.exe`).

### 1.2 Install
Run the downloaded `.exe` file. Installation is automatic and takes 2–3 minutes.

### 1.3 First Launch Setup
1. Open Antigravity after install
2. Sign in with your **personal Gmail account** (required for free Gemini 3 Pro access)
3. When asked to select a model, choose: **Gemini 3 Pro** (default — best for autonomous tasks)
4. When asked about Terminal Command Auto Execution policy, select: **"Auto Execute"**
   - This allows the agent to run pip install, python scripts, etc. without asking you every time
   - This is required for unattended ML training

> **Note:** Antigravity is currently free in public preview with generous rate limits on Gemini 3 Pro.

---

## STEP 2 — HARDWARE CONFIRMATION (DO THIS BEFORE ANYTHING ELSE)

Open the **Agent Manager** (keyboard shortcut: `Ctrl+Shift+A`) and give the agent this exact task:

```
Task: Confirm my hardware setup before starting an ML project.

Run the following checks and report the results:
1. Run: nvidia-smi
   - Report GPU name, VRAM, driver version, CUDA version
2. Run: python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
   - If torch is not installed, run: pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
   - Then re-run the check
3. Run: python -c "import torch; print(torch.cuda.get_device_properties(0).total_memory / 1e9, 'GB VRAM')"
4. Check available disk space: run: df -h
5. Check RAM: run: python -c "import psutil; print(psutil.virtual_memory())"

Report every result. If CUDA is not available, stop and tell me what is wrong before proceeding.
Do not assume anything. Run every command and show me the actual output.
```

**Wait for the agent to complete this before moving to Step 3.**

---

## STEP 3 — CREATE THE PROJECT FOLDER

Give the agent this task in Agent Manager:

```
Task: Set up the project folder structure for a smart traffic AI system.

Run these commands exactly:
mkdir -p D:/traffic_ai/{data/raw,data/labeled,data/processed,models/yolo,models/lstm,models/rl,models/accident,signal_graph,mqtt,dashboard,sumo_sim,logs}

Then create a file at D:/traffic_ai/README.md with this content:
# Smart Traffic AI — Chennai ITMS Extension
## Folder Structure
- data/raw: raw camera footage and sensor logs
- data/labeled: annotated datasets
- data/processed: preprocessed numpy/pkl files
- models/yolo: YOLOv8 object detection weights
- models/lstm: traffic flow predictor
- models/rl: reinforcement learning agent
- models/accident: accident detection CNN
- signal_graph: OSM-based graph scripts
- mqtt: inter-signal communication broker
- dashboard: FastAPI + React ops dashboard
- sumo_sim: SUMO simulation files
- logs: all training and runtime logs

Then confirm the folder structure was created by running: tree D:/traffic_ai /F /A
```

---

## STEP 4 — INSTALL ALL DEPENDENCIES

Give the agent this task:

```
Task: Install all Python and system dependencies for a smart traffic AI project.
Run these commands one by one. If any fails, fix the error before continuing.
Report the result of each install.

1. pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
2. pip install ultralytics
3. pip install stable-baselines3[extra]
4. pip install osmnx networkx
5. pip install paho-mqtt
6. pip install xgboost scikit-learn
7. pip install fastapi uvicorn
8. pip install pandas numpy matplotlib seaborn
9. pip install psutil tqdm
10. pip install roboflow

After all installs, run this verification script and show me the output:
python -c "
import torch, ultralytics, stable_baselines3, osmnx, paho.mqtt, xgboost, fastapi
print('torch:', torch.__version__, '| CUDA:', torch.cuda.is_available())
print('ultralytics:', ultralytics.__version__)
print('stable_baselines3:', stable_baselines3.__version__)
print('osmnx:', osmnx.__version__)
print('xgboost:', xgboost.__version__)
print('All imports successful.')
"

If any import fails, fix it before reporting success.
```

---

## STEP 5 — DATASET ACQUISITION (AGENT AUTO-DOWNLOADS)

This is the key step where you ask Antigravity to fetch datasets on its own. Give the agent this task:

```
Task: Download all required open-source datasets for a smart traffic AI system.
Use the browser and terminal to download each dataset to D:/traffic_ai/data/raw/
Verify each download with file size and checksum where available.
Do not assume any dataset is already present. Download everything fresh.

Dataset 1 — YOLOv8 Indian Traffic Object Detection:
- Go to: https://universe.roboflow.com/
- Search for: "Indian traffic vehicles detection"
- Download the dataset in YOLOv8 format (640px)
- Save to: D:/traffic_ai/data/raw/india_vehicles/
- If Roboflow requires an API key, run:
  pip install roboflow
  Then go to https://roboflow.com, create a free account, get the API key,
  and use it to download:
  from roboflow import Roboflow
  rf = Roboflow(api_key="YOUR_KEY")
  project = rf.workspace().project("indian-traffic-detection")
  version = project.version(1)
  dataset = version.download("yolov8", location="D:/traffic_ai/data/raw/india_vehicles/")

Dataset 2 — PeMS Traffic Flow Data (LSTM training):
- Download PeMS04 dataset from:
  https://github.com/guoshnBJTU/ASTGNN/tree/main/data
  or
  https://zenodo.org/record/5146592
- Save to: D:/traffic_ai/data/raw/pems/

Dataset 3 — CADP Accident Detection:
- Go to: https://github.com/ankitshah009/CADP-CarAccidentDetectionPrediction
- Download the dataset or instructions
- Save annotations to: D:/traffic_ai/data/raw/accidents/

Dataset 4 — Chennai OSM Signal Graph (no download needed, pull via API):
Run this Python script and save to D:/traffic_ai/signal_graph/chennai_graph.graphml:

import osmnx as ox
G = ox.graph_from_place("Chennai, Tamil Nadu, India", network_type="drive")
ox.save_graphml(G, filepath="D:/traffic_ai/signal_graph/chennai_graph.graphml")
signal_nodes = [(n, d) for n, d in G.nodes(data=True) if d.get('highway') == 'traffic_signals']
print(f"Found {len(signal_nodes)} traffic signal nodes in Chennai OSM data")

After completing each download, confirm:
- File path
- File size
- Number of samples (images, records, etc.)

If any dataset is unavailable at the listed URL, search the web for an alternative mirror
and download from there. Report what you found.
```

---

## STEP 6 — TRAIN MODEL 1: YOLOv8 OBJECT DETECTION

Give the agent this task **after Step 5 confirms datasets are ready**:

```
Task: Create the dataset config and train YOLOv8s for Indian traffic object detection.
GPU available: RTX 2050 with 4GB VRAM. Use AMP (mixed precision) to fit in memory.

Step A — Create dataset config:
Write this file to D:/traffic_ai/data/labeled/chennai_traffic.yaml:

path: D:/traffic_ai/data/raw/india_vehicles
train: images/train
val: images/val

nc: 7
names:
  0: car
  1: truck
  2: two_wheeler
  3: auto_rickshaw
  4: bus
  5: ambulance
  6: pedestrian

Step B — Train the model:
Run this Python script at D:/traffic_ai/models/yolo/train_yolo.py:

from ultralytics import YOLO

model = YOLO("yolov8s.pt")

results = model.train(
    data="D:/traffic_ai/data/labeled/chennai_traffic.yaml",
    epochs=100,
    imgsz=640,
    batch=8,
    device="cuda:0",
    amp=True,
    workers=2,
    cache=False,
    project="D:/traffic_ai/models/yolo",
    name="run1",
    patience=15,
    save=True,
    exist_ok=True,
)

print("Training complete.")
print(f"Best mAP50: {results.results_dict['metrics/mAP50(B)']:.4f}")
print(f"Ambulance recall (class 5): check D:/traffic_ai/models/yolo/run1/results.csv")

Step C — After training, run validation and report:
- Overall mAP50
- Per-class mAP50 (especially class 5: ambulance)
- If ambulance recall < 0.90, report it so we can add more ambulance training data.

Save the best weights to: D:/traffic_ai/models/yolo/best.pt
Run: cp D:/traffic_ai/models/yolo/run1/weights/best.pt D:/traffic_ai/models/yolo/best.pt
```

---

## STEP 7 — TRAIN MODEL 2: LSTM TRAFFIC FLOW PREDICTOR

Give the agent this task:

```
Task: Train an LSTM model to predict traffic density 30-120 seconds ahead.
GPU: RTX 2050. Dataset: PeMS04 downloaded in Step 5.

Create and run this script at D:/traffic_ai/models/lstm/train_lstm.py:

import torch
import torch.nn as nn
import numpy as np
import pickle
import os

# Load PeMS04 data
data_path = "D:/traffic_ai/data/raw/pems/"

# Try to load the pickle file
for f in os.listdir(data_path):
    if f.endswith('.pkl') or f.endswith('.npz'):
        print(f"Found: {f}")

# If .npz format:
# data = np.load(data_path + 'pems04.npz')
# traffic = data['data']  # shape: (T, N, F) — time, nodes, features

# If .pkl format:
# with open(data_path + 'pems04.pkl', 'rb') as f:
#     data = pickle.load(f, encoding='latin1')

# The agent should detect which format it is and load accordingly.
# Then proceed with training:

class TrafficLSTM(nn.Module):
    def __init__(self, input_size=8, hidden_size=64, num_layers=2, output_steps=4):
        super().__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, 
                           batch_first=True, dropout=0.2)
        self.fc = nn.Linear(hidden_size, output_steps)
    
    def forward(self, x):
        out, _ = self.lstm(x)
        return self.fc(out[:, -1, :])

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Training on: {device}")

model = TrafficLSTM().to(device)
optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
criterion = nn.MSELoss()

# Train for 50 epochs, report loss every 10 epochs
# Save best model to D:/traffic_ai/models/lstm/best_lstm.pt
# Report final MAE on validation set

torch.save(model.state_dict(), "D:/traffic_ai/models/lstm/best_lstm.pt")
print("LSTM training complete. Model saved.")

Detect the actual file format of the PeMS data, adapt the loading code accordingly,
and complete the full training loop. Report final validation MAE.
```

---

## STEP 8 — BUILD THE SIGNAL GRAPH (OSM → NetworkX)

Give the agent this task:

```
Task: Build the Chennai traffic signal graph from OSM data for inter-signal communication.

Create and run D:/traffic_ai/signal_graph/build_graph.py:

import osmnx as ox
import networkx as nx
import json
import pickle

print("Loading Chennai graph from saved file...")
G = ox.load_graphml("D:/traffic_ai/signal_graph/chennai_graph.graphml")

# Extract signal nodes
signal_nodes = {
    n: {"lat": data["y"], "lon": data["x"]}
    for n, data in G.nodes(data=True)
    if data.get("highway") == "traffic_signals"
}

print(f"Total signal nodes: {len(signal_nodes)}")

# Build upstream neighbor map for each signal node
upstream_map = {}
reverse_G = G.reverse()

for node_id in signal_nodes:
    try:
        upstream = list(nx.single_source_shortest_path(
            reverse_G, node_id, cutoff=2
        ).keys())
        upstream = [n for n in upstream if n != node_id and n in signal_nodes]
        upstream_map[node_id] = upstream
    except Exception as e:
        upstream_map[node_id] = []

print(f"Upstream map built for {len(upstream_map)} nodes")

# Save outputs
with open("D:/traffic_ai/signal_graph/signal_nodes.json", "w") as f:
    json.dump({str(k): v for k, v in signal_nodes.items()}, f, indent=2)

with open("D:/traffic_ai/signal_graph/upstream_map.pkl", "wb") as f:
    pickle.dump(upstream_map, f)

# Report stats
avg_upstream = sum(len(v) for v in upstream_map.values()) / max(len(upstream_map), 1)
print(f"Average upstream neighbors per node: {avg_upstream:.1f}")
print("Signal graph build complete.")
print("Files saved: signal_nodes.json, upstream_map.pkl")
```

---

## STEP 9 — SET UP MQTT INTER-SIGNAL COMMUNICATION

Give the agent this task:

```
Task: Install and configure the MQTT broker and write the signal node communication script.

Step A — Install Mosquitto MQTT broker:
1. Download Mosquitto for Windows from: https://mosquitto.org/download/
2. Install it silently or run the installer
3. Start the Mosquitto broker as a background service:
   net start mosquitto
   OR run: mosquitto -v (in a separate terminal)
4. Verify it is running by running:
   pip install paho-mqtt
   python -c "
   import paho.mqtt.client as mqtt
   client = mqtt.Client()
   client.connect('localhost', 1883, 60)
   print('MQTT broker connection: SUCCESS')
   client.disconnect()
   "

Step B — Create the signal node communication script at D:/traffic_ai/mqtt/signal_comm.py:

import paho.mqtt.client as mqtt
import json
import time
import random
import pickle
import threading

# Load upstream map
with open("D:/traffic_ai/signal_graph/upstream_map.pkl", "rb") as f:
    upstream_map = pickle.load(f)

node_ids = list(upstream_map.keys())[:10]  # Use first 10 nodes for testing
print(f"Simulating communication between {len(node_ids)} signal nodes")

CONGESTION_THRESHOLD = 0.75

class SignalNode:
    def __init__(self, node_id):
        self.node_id = node_id
        self.density = random.uniform(0.3, 0.9)
        self.predicted_density = self.density + random.uniform(-0.1, 0.2)
        self.has_ambulance = False
        self.green_batch_size = 20
        
        self.client = mqtt.Client(str(node_id))
        self.client.on_message = self.on_message
        self.client.connect("localhost", 1883, 60)
        self.client.subscribe(f"signal/{node_id}/warning")
        self.client.loop_start()
    
    def on_message(self, client, userdata, msg):
        warning = json.loads(msg.payload.decode())
        if warning["type"] == "CONGESTION_WARNING":
            self.green_batch_size = warning["recommended_batch_size"]
            print(f"Node {self.node_id}: throttling to {self.green_batch_size} vehicles/cycle "
                  f"(downstream {warning['from_node']} is congested at {warning['predicted_density']:.2f})")
    
    def check_and_warn(self, all_clients):
        if self.predicted_density > CONGESTION_THRESHOLD:
            upstream_nodes = upstream_map.get(self.node_id, [])
            for upstream_id in upstream_nodes[:3]:
                warning = {
                    "type": "CONGESTION_WARNING",
                    "from_node": str(self.node_id),
                    "predicted_density": self.predicted_density,
                    "recommended_batch_size": 8,
                }
                self.client.publish(
                    f"signal/{upstream_id}/warning",
                    json.dumps(warning)
                )
            print(f"Node {self.node_id}: CONGESTION WARNING sent to {len(upstream_nodes[:3])} upstream nodes")

# Run simulation
nodes = [SignalNode(nid) for nid in node_ids]
time.sleep(1)

print("\n--- Running 3 communication cycles ---")
for cycle in range(3):
    print(f"\nCycle {cycle+1}:")
    for node in nodes:
        node.check_and_warn(nodes)
    time.sleep(2)

print("\nMQTT signal communication test complete.")
for node in nodes:
    node.client.loop_stop()
    node.client.disconnect()

Run this script and confirm it produces output showing congestion warnings being sent
and received between nodes. If Mosquitto is not available, use:
pip install hbmqtt
and use an in-process broker instead. Adapt the script accordingly.
```

---

## STEP 10 — TRAIN MODEL 3: REINFORCEMENT LEARNING AGENT

Give the agent this task **after the signal graph is built**:

```
Task: Set up SUMO traffic simulator and train the RL signal optimizer.
This is the longest training task — it will run for several hours.

Step A — Install SUMO:
1. Download SUMO from: https://sumo.dlr.de/docs/Downloads.php
2. Install to: C:/Program Files/SUMO/
3. Set environment variable: SUMO_HOME=C:/Program Files/SUMO
4. Verify: python -c "import libsumo; print('SUMO ready')"
   OR: sumo --version

Step B — Install SUMO gym wrapper:
pip install sumo-rl
pip install gymnasium

Step C — Create the SUMO network config at D:/traffic_ai/sumo_sim/chennai_4way.net.xml
using a standard 4-way intersection. The agent should use sumo-rl's built-in
single_intersection example as the base:
python -c "import sumo_rl; print(sumo_rl.__file__)"
Copy the example files from the sumo_rl package examples folder to D:/traffic_ai/sumo_sim/

Step D — Create and run D:/traffic_ai/models/rl/train_rl.py:

import gymnasium as gym
import sumo_rl
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CheckpointCallback
import torch

print(f"Training RL agent on: {'CUDA' if torch.cuda.is_available() else 'CPU'}")

env = sumo_rl.SumoEnvironment(
    net_file="D:/traffic_ai/sumo_sim/single-intersection.net.xml",
    route_file="D:/traffic_ai/sumo_sim/single-intersection.rou.xml",
    use_gui=False,
    num_seconds=3600,
    delta_time=5,
    yellow_time=3,
    min_green=5,
    max_green=60,
    reward_fn="diff-waiting-time",
)

checkpoint = CheckpointCallback(
    save_freq=10000,
    save_path="D:/traffic_ai/models/rl/checkpoints/",
    name_prefix="traffic_rl"
)

model = PPO(
    "MlpPolicy",
    env,
    verbose=1,
    device="cuda",
    learning_rate=3e-4,
    n_steps=2048,
    batch_size=64,
    tensorboard_log="D:/traffic_ai/logs/rl_tensorboard/"
)

model.learn(total_timesteps=500_000, callback=checkpoint)
model.save("D:/traffic_ai/models/rl/traffic_rl_agent")
print("RL agent training complete.")
env.close()

If sumo-rl raises errors about missing .net.xml or .rou.xml files, find the example
files in the sumo_rl package and copy them. Do not create dummy files — use real ones.
Report the final mean reward after training.
```

---

## STEP 11 — TRAIN MODEL 4: ACCIDENT DETECTION CNN

Give the agent this task:

```
Task: Train the accident detection binary classifier using CADP or a Kaggle dataset.

Step A — Download accident dataset:
1. Go to: https://www.kaggle.com/datasets/ckay16/accident-detection-from-cctv-footage
2. Download the dataset (requires Kaggle account and API key)
   Run: pip install kaggle
   Create ~/.kaggle/kaggle.json with your credentials
   Run: kaggle datasets download ckay16/accident-detection-from-cctv-footage
   Unzip to: D:/traffic_ai/data/raw/accidents/

   If Kaggle is unavailable, search for an alternative accident detection dataset
   on Roboflow Universe (https://universe.roboflow.com, search "accident detection")
   and download it in the same way as the vehicle dataset in Step 5.

Step B — Create and run D:/traffic_ai/models/accident/train_accident.py:

import torch
import torch.nn as nn
import torchvision.transforms as T
import torchvision.models as models
from torchvision.datasets import ImageFolder
from torch.utils.data import DataLoader

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Training accident CNN on: {device}")

transform = T.Compose([
    T.Resize((224, 224)),
    T.ToTensor(),
    T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

train_data = ImageFolder("D:/traffic_ai/data/raw/accidents/train", transform=transform)
val_data   = ImageFolder("D:/traffic_ai/data/raw/accidents/val",   transform=transform)
train_loader = DataLoader(train_data, batch_size=16, shuffle=True, num_workers=2)
val_loader   = DataLoader(val_data,   batch_size=16, shuffle=False, num_workers=2)

print(f"Classes: {train_data.classes}")
print(f"Train samples: {len(train_data)}, Val samples: {len(val_data)}")

# Use EfficientNet-B0 — fits in 4GB VRAM
model = models.efficientnet_b0(pretrained=True)
model.classifier[1] = nn.Linear(model.classifier[1].in_features, 2)
model = model.to(device)

optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)
criterion = nn.CrossEntropyLoss()
scaler = torch.cuda.amp.GradScaler()

best_val_acc = 0
for epoch in range(30):
    model.train()
    for imgs, labels in train_loader:
        imgs, labels = imgs.to(device), labels.to(device)
        with torch.cuda.amp.autocast():
            loss = criterion(model(imgs), labels)
        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()
        optimizer.zero_grad()
    
    # Validate
    model.eval()
    correct = 0
    with torch.no_grad():
        for imgs, labels in val_loader:
            imgs, labels = imgs.to(device), labels.to(device)
            preds = model(imgs).argmax(1)
            correct += (preds == labels).sum().item()
    val_acc = correct / len(val_data)
    
    if val_acc > best_val_acc:
        best_val_acc = val_acc
        torch.save(model.state_dict(), "D:/traffic_ai/models/accident/best_accident.pt")
    
    if epoch % 5 == 0:
        print(f"Epoch {epoch}: val_acc={val_acc:.4f} (best={best_val_acc:.4f})")

print(f"Accident detection training complete. Best val accuracy: {best_val_acc:.4f}")
print("Target: accuracy > 0.85 before deployment")
```

---

## STEP 12 — FINAL INTEGRATION TEST

Give the agent this task after all models are trained:

```
Task: Run an integration test that connects all four trained models in a single pipeline.

Create and run D:/traffic_ai/integration_test.py:

import torch
import json
import pickle
from ultralytics import YOLO
import torchvision.models as models
import torchvision.transforms as T
import torch.nn as nn
import numpy as np

print("=== Smart Traffic AI — Integration Test ===\n")

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Load YOLOv8
print("Loading YOLOv8...")
yolo = YOLO("D:/traffic_ai/models/yolo/best.pt")
print("YOLOv8: OK")

# Load Accident CNN
print("Loading accident CNN...")
accident_model = models.efficientnet_b0()
accident_model.classifier[1] = nn.Linear(accident_model.classifier[1].in_features, 2)
accident_model.load_state_dict(torch.load("D:/traffic_ai/models/accident/best_accident.pt"))
accident_model.eval().to(device)
print("Accident CNN: OK")

# Load RL Agent
print("Loading RL agent...")
from stable_baselines3 import PPO
rl_agent = PPO.load("D:/traffic_ai/models/rl/traffic_rl_agent")
print("RL agent: OK")

# Load Signal Graph
print("Loading signal graph...")
with open("D:/traffic_ai/signal_graph/signal_nodes.json") as f:
    signal_nodes = json.load(f)
with open("D:/traffic_ai/signal_graph/upstream_map.pkl", "rb") as f:
    upstream_map = pickle.load(f)
print(f"Signal graph: OK ({len(signal_nodes)} nodes)")

# Simulate a cycle
print("\n--- Simulating one traffic cycle ---")
fake_state = np.zeros((1, 4))  # dummy obs for RL
action, _ = rl_agent.predict(fake_state)
print(f"RL agent decision (action): {action}")

print("\n=== All models loaded and operational ===")
print("Integration test: PASSED")
print("\nNext step: Connect to live SUMO simulation or physical signal controller.")

Report which models passed and which failed. If any model file is missing,
identify which training step needs to be re-run.
```

---

## FULL EXECUTION ORDER (COPY THIS AS YOUR MASTER CHECKLIST)

| Step | Task | Est. Time | Agent Mode |
|------|------|-----------|------------|
| 1 | Install Antigravity | 5 min | Manual |
| 2 | Hardware check | 5 min | Agent |
| 3 | Folder structure | 2 min | Agent |
| 4 | Install dependencies | 15 min | Agent |
| 5 | Download datasets | 30–60 min | Agent (browser + terminal) |
| 6 | Train YOLOv8 | 4–8 hrs | Agent (unattended) |
| 7 | Train LSTM | 2–4 hrs | Agent (unattended) |
| 8 | Build signal graph | 10 min | Agent |
| 9 | Set up MQTT | 15 min | Agent |
| 10 | Train RL agent | 6–12 hrs | Agent (unattended) |
| 11 | Train accident CNN | 2–4 hrs | Agent (unattended) |
| 12 | Integration test | 10 min | Agent |

**Total estimated time: 2–3 days (most of it is unattended GPU training)**

---

## IMPORTANT: HOW TO ASK ANTIGRAVITY ABOUT DATASETS

Paste this exact message into Antigravity's Agent Manager if you can't find a dataset:

```
I need to train a YOLOv8 model for Indian traffic (cars, trucks, auto-rickshaws,
buses, ambulances, two-wheelers, pedestrians). I could not find the dataset manually.

Please:
1. Use your browser to search for open-source Indian traffic detection datasets
2. Check these sources: Roboflow Universe, Kaggle, Papers With Code, GitHub
3. Download the most suitable dataset automatically using the API or wget/curl
4. Save it to D:/traffic_ai/data/raw/india_vehicles/
5. Convert it to YOLOv8 format if needed
6. Report what you found, where you got it, and how many images it contains

Do not ask me for confirmation on each step. Complete the entire task and
report back when done.
```

---

## WHAT TO DO IF A STEP FAILS

| Failure | What to tell Antigravity |
|---------|--------------------------|
| CUDA not available | "Fix the CUDA installation. Install CUDA 11.8 from nvidia.com and reinstall PyTorch." |
| Dataset download fails | "Search for an alternative dataset for [name] on Kaggle and Roboflow. Download the best one." |
| YOLOv8 OOM (out of memory) | "Reduce batch size to 4 and imgsz to 416. Retrain." |
| RL training crashes | "Use sumo-rl's built-in single-intersection example. Find the example files and use them." |
| MQTT connection refused | "Install Mosquitto, start it as a Windows service, then rerun the test." |

---

*Generated for: Smart Traffic AI System (Chennai ITMS Extension)*
*Target Hardware: RTX 2050 (4GB VRAM) Laptop*
*IDE: Google Antigravity (antigravity.google)*
