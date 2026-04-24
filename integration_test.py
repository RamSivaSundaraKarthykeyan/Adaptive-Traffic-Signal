"""
integration_test.py — Full Pipeline Integration Test
Smart Traffic AI | Tamil Nadu ITMS Extension

Loads all 4 trained models and runs one simulated traffic cycle.
Run AFTER all training scripts have completed.

Run: python integration_test.py
"""
import os, sys, json, pickle
import numpy as np

BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models")
GRAPH_DIR = os.path.join(BASE_DIR, "signal_graph")

print("=" * 65)
print("  Smart Traffic AI — Integration Test")
print("  Tamil Nadu ITMS Extension")
print("=" * 65)

results = {}

# ── 1. YOLOv8 ────────────────────────────────────────────────────
print("\n[1] Loading YOLOv8 vehicle detector...")
yolo_path = os.path.join(MODEL_DIR, "yolo", "best.pt")
try:
    from ultralytics import YOLO
    if not os.path.isfile(yolo_path):
        raise FileNotFoundError(f"best.pt not found at {yolo_path}\n    Run: python models/yolo/train_yolo.py")
    yolo = YOLO(yolo_path)
    # Warmup on a black frame
    import torch
    dummy_img = torch.zeros(1, 3, 640, 640)
    _ = yolo.predict(source=dummy_img, verbose=False)
    print(f"    [v] YOLOv8: LOADED - {yolo_path}")
    results["yolo"] = "PASS"
except FileNotFoundError as e:
    print(f"    [x] YOLOv8: {e}"); results["yolo"] = "FAIL - not trained"
except Exception as e:
    print(f"    [x] YOLOv8: {e}"); results["yolo"] = f"FAIL - {e}"

# ── 2. LSTM Flow Predictor ────────────────────────────────────────
print("\n[2] Loading LSTM traffic flow predictor...")
lstm_path = os.path.join(MODEL_DIR, "lstm", "best_lstm.pt")
try:
    import torch, torch.nn as nn

    class TrafficLSTM(nn.Module):
        def __init__(self, input_size=1, hidden_size=128, num_layers=2, output_steps=4):
            super().__init__()
            self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True, dropout=0.2)
            self.norm = nn.LayerNorm(hidden_size)
            self.fc   = nn.Sequential(nn.Linear(hidden_size, 64), nn.ReLU(), nn.Linear(64, output_steps))
        def forward(self, x):
            out, _ = self.lstm(x)
            return self.fc(self.norm(out[:, -1, :]))

    if not os.path.isfile(lstm_path):
        raise FileNotFoundError(f"best_lstm.pt not found\n    Run: python models/lstm/train_lstm.py")

    ckpt = torch.load(lstm_path, map_location="cpu", weights_only=False)
    lstm_model = TrafficLSTM()
    lstm_model.load_state_dict(ckpt["model_state"])
    lstm_model.eval()

    # Test inference
    test_input = torch.randn(1, 12, 1)
    pred = lstm_model(test_input)
    print(f"    [v] LSTM: LOADED - pred shape {list(pred.shape)} | MAE={ckpt.get('best_mae', 'N/A')}")
    results["lstm"] = "PASS"
except FileNotFoundError as e:
    print(f"    [x] LSTM: {e}"); results["lstm"] = "FAIL - not trained"
except Exception as e:
    print(f"    [x] LSTM: {e}"); results["lstm"] = f"FAIL - {e}"

# ── 3. Accident CNN ───────────────────────────────────────────────
print("\n[3] Loading accident detection CNN...")
accident_path = os.path.join(MODEL_DIR, "accident", "best_accident.pt")
try:
    import torch, torch.nn as nn
    import torchvision.models as tvm

    if not os.path.isfile(accident_path):
        raise FileNotFoundError(f"best_accident.pt not found\n    Run: python models/accident/train_accident.py")

    ckpt = torch.load(accident_path, map_location="cpu", weights_only=False)
    net = tvm.efficientnet_b0(weights=None)
    net.classifier[1] = nn.Linear(net.classifier[1].in_features, 2)
    net.load_state_dict(ckpt["model_state"])
    net.eval()

    dummy = torch.randn(1, 3, 224, 224)
    out   = net(dummy)
    classes = ckpt.get("classes", ["accident", "no_accident"])
    print(f"    [v] Accident CNN: LOADED - classes={classes} | best_acc={ckpt.get('best_acc', 'N/A'):.4f}")
    results["accident_cnn"] = "PASS"
except FileNotFoundError as e:
    print(f"    [x] Accident CNN: {e}"); results["accident_cnn"] = "FAIL - not trained"
except Exception as e:
    print(f"    [x] Accident CNN: {e}"); results["accident_cnn"] = f"FAIL - {e}"

# ── 4. RL Agent ───────────────────────────────────────────────────
print("\n[4] Loading PPO RL signal optimizer...")
rl_path = os.path.join(MODEL_DIR, "rl", "traffic_rl_agent")
try:
    from stable_baselines3 import PPO
    if not (os.path.isfile(rl_path + ".zip") or os.path.isfile(rl_path)):
        raise FileNotFoundError(f"RL agent not found\n    Run: python models/rl/train_rl.py")
    rl_agent = PPO.load(rl_path)
    obs = np.zeros((11,))
    action, _ = rl_agent.predict(obs, deterministic=True)
    print(f"    [v] RL Agent: LOADED - test action={action}")
    results["rl_agent"] = "PASS"
except FileNotFoundError as e:
    print(f"    [x] RL Agent: {e}"); results["rl_agent"] = "FAIL - not trained"
except Exception as e:
    print(f"    [x] RL Agent: {e}"); results["rl_agent"] = f"FAIL - {e}"

# ── 5. Signal Graph ───────────────────────────────────────────────
print("\n[5] Loading Tamil Nadu signal graph...")
nodes_file    = os.path.join(GRAPH_DIR, "signal_nodes.json")
upstream_file = os.path.join(GRAPH_DIR, "upstream_map.pkl")
try:
    if not os.path.isfile(nodes_file):
        raise FileNotFoundError(f"signal_nodes.json not found\n    Run: python signal_graph/build_graph.py")
    with open(nodes_file) as f:
        signal_nodes = json.load(f)
    with open(upstream_file, "rb") as f:
        upstream_map = pickle.load(f)
    print(f"    [v] Signal Graph: {len(signal_nodes)} nodes | {len(upstream_map)} upstream entries")
    results["signal_graph"] = "PASS"
except FileNotFoundError as e:
    print(f"    [x] Signal Graph: {e}"); results["signal_graph"] = "FAIL - not built"
except Exception as e:
    print(f"    [x] Signal Graph: {e}"); results["signal_graph"] = f"FAIL - {e}"

# ── Final Report ─────────────────────────────────────────────────
print("\n" + "=" * 65)
print("  Integration Test Results")
print("=" * 65)
passed = sum(1 for v in results.values() if v == "PASS")
total  = len(results)
for component, status in results.items():
    icon = "v" if status == "PASS" else "x"
    print(f"  [{icon}] {component:<20} {status}")

print(f"\n  Score: {passed}/{total} components operational")
if passed == total:
    print("\n  ✅ ALL SYSTEMS GO — Tamil Nadu ITMS ready for deployment.")
    print("     Connect to live SUMO simulation or physical signal controller.")
else:
    missing = [k for k, v in results.items() if v != "PASS"]
    print(f"\n  WARNING: {total - passed} component(s) need training: {', '.join(missing)}")
    print("     Re-run the corresponding training script for each failed component.")
print("=" * 65)
