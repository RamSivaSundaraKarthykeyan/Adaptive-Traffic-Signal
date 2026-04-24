"""
train_lstm.py — LSTM Traffic Flow Predictor
Smart Traffic AI | Tamil Nadu ITMS Extension

Predicts traffic density 30–120 seconds ahead (4 × 30s steps)
using PeMS04 sensor data as a proxy for Tamil Nadu highway flow.

Architecture: 2-layer LSTM → FC head
Input window : 12 time-steps of 8 features
Output       : 4 future density values

Run: python models/lstm/train_lstm.py
"""

import os
import sys
import glob
import time
import numpy as np

BASE_DIR  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR  = os.path.join(BASE_DIR, "data", "raw", "pems")
MODEL_DIR = os.path.join(BASE_DIR, "models", "lstm")
LOG_DIR   = os.path.join(BASE_DIR, "logs")
os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(LOG_DIR,   exist_ok=True)

print("=" * 60)
print("  LSTM Traffic Flow Predictor — Tamil Nadu ITMS")
print("=" * 60)

# ── Import ───────────────────────────────────────────────────────
try:
    import torch
    import torch.nn as nn
    from torch.utils.data import Dataset, DataLoader
except ImportError:
    print("[x] PyTorch not installed. Run: pip install torch")
    sys.exit(1)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"[v] Training device: {device}")

# ── Load PeMS Data ───────────────────────────────────────────────
print(f"\n[→] Looking for PeMS data in: {DATA_DIR}")

traffic_data = None

# Try .npz
npz_files = glob.glob(os.path.join(DATA_DIR, "*.npz"))
if npz_files:
    print(f"    Found .npz: {os.path.basename(npz_files[0])}")
    raw = np.load(npz_files[0])
    key = [k for k in raw.files if "data" in k.lower()][0] if raw.files else raw.files[0]
    traffic_data = raw[key]   # shape: (T, N, F)
    print(f"    Shape: {traffic_data.shape}")

# Try .pkl
if traffic_data is None:
    import pickle
    pkl_files = glob.glob(os.path.join(DATA_DIR, "*.pkl"))
    if pkl_files:
        print(f"    Found .pkl: {os.path.basename(pkl_files[0])}")
        with open(pkl_files[0], "rb") as f:
            raw = pickle.load(f, encoding="latin1")
        if isinstance(raw, dict):
            key = next(iter(raw))
            traffic_data = raw[key]
        elif isinstance(raw, np.ndarray):
            traffic_data = raw
        print(f"    Shape: {traffic_data.shape}")

# Synthetic fallback for development / CI
if traffic_data is None:
    print(f"\n[!] No PeMS dataset found in {DATA_DIR}")
    print("    Generating synthetic data for development/testing...")
    print("    To use real data: run python data/download_datasets.py")
    T, N, F = 17856, 307, 3   # PeMS04 dimensions
    traffic_data = np.random.rand(T, N, F).astype(np.float32)
    np.save(os.path.join(DATA_DIR, "synthetic_pems04.npy"), traffic_data)
    print(f"    Synthetic data shape: {traffic_data.shape}")

# ── Preprocessing ────────────────────────────────────────────────
print("\n[→] Preprocessing...")
if traffic_data.ndim == 3:
    # Use flow feature (index 0) averaged across all nodes
    flow = traffic_data[:, :, 0].mean(axis=1)  # (T,)
else:
    flow = traffic_data.flatten()

# Normalise 0–1
flow_min, flow_max = flow.min(), flow.max()
if flow_max - flow_min > 0:
    flow_norm = (flow - flow_min) / (flow_max - flow_min)
else:
    flow_norm = flow
print(f"    Flow range: [{flow_min:.2f}, {flow_max:.2f}] → normalised [0, 1]")

SEQ_LEN = 12    # 12 × 5-min intervals = 1 hour history
PRED_LEN = 4    # predict next 4 × 5-min = 20 minutes ahead

class TrafficDataset(Dataset):
    def __init__(self, data, seq_len, pred_len):
        self.data = torch.FloatTensor(data)
        self.seq_len  = seq_len
        self.pred_len = pred_len

    def __len__(self):
        return len(self.data) - self.seq_len - self.pred_len

    def __getitem__(self, idx):
        x = self.data[idx : idx + self.seq_len].unsqueeze(-1)       # (seq, 1)
        y = self.data[idx + self.seq_len : idx + self.seq_len + self.pred_len]  # (pred,)
        return x, y

split = int(0.8 * len(flow_norm))
train_ds = TrafficDataset(flow_norm[:split], SEQ_LEN, PRED_LEN)
val_ds   = TrafficDataset(flow_norm[split:], SEQ_LEN, PRED_LEN)
train_dl = DataLoader(train_ds, batch_size=64, shuffle=True,  num_workers=0, pin_memory=(device.type=="cuda"))
val_dl   = DataLoader(val_ds,   batch_size=64, shuffle=False, num_workers=0, pin_memory=(device.type=="cuda"))
print(f"    Train samples: {len(train_ds)} | Val samples: {len(val_ds)}")

# ── Model ────────────────────────────────────────────────────────
class TrafficLSTM(nn.Module):
    def __init__(self, input_size=1, hidden_size=128, num_layers=2, output_steps=4, dropout=0.2):
        super().__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers,
                            batch_first=True, dropout=dropout)
        self.norm = nn.LayerNorm(hidden_size)
        self.fc   = nn.Sequential(
            nn.Linear(hidden_size, 64),
            nn.ReLU(),
            nn.Linear(64, output_steps)
        )

    def forward(self, x):
        out, _ = self.lstm(x)
        out = self.norm(out[:, -1, :])
        return self.fc(out)

model     = TrafficLSTM(input_size=1, hidden_size=128, num_layers=2, output_steps=PRED_LEN).to(device)
optimizer = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-5)
scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5, factor=0.5)
criterion = nn.MSELoss()

total_params = sum(p.numel() for p in model.parameters())
print(f"\n[v] Model: TrafficLSTM | Parameters: {total_params:,}")

# ── Training Loop ────────────────────────────────────────────────
print("\n[→] Training (50 epochs)...")
EPOCHS = 50
best_mae  = float("inf")
best_path = os.path.join(MODEL_DIR, "best_lstm.pt")
log_path  = os.path.join(LOG_DIR,   "lstm_training.log")

log_lines = []

for epoch in range(1, EPOCHS + 1):
    # Train
    model.train()
    train_loss = 0.0
    for x, y in train_dl:
        x, y = x.to(device), y.to(device)
        optimizer.zero_grad()
        pred = model(x)
        loss = criterion(pred, y)
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        train_loss += loss.item() * len(x)
    train_loss /= len(train_ds)

    # Validate
    model.eval()
    val_mae = 0.0
    with torch.no_grad():
        for x, y in val_dl:
            x, y = x.to(device), y.to(device)
            pred = model(x)
            # Denormalise for MAE in original units
            pred_orig = pred * (flow_max - flow_min) + flow_min
            y_orig    = y    * (flow_max - flow_min) + flow_min
            val_mae  += torch.abs(pred_orig - y_orig).mean().item() * len(x)
    val_mae /= len(val_ds)

    scheduler.step(val_mae)

    if val_mae < best_mae:
        best_mae = val_mae
        torch.save({
            "epoch": epoch,
            "model_state": model.state_dict(),
            "optimizer_state": optimizer.state_dict(),
            "best_mae": best_mae,
            "flow_min": flow_min,
            "flow_max": flow_max,
            "seq_len": SEQ_LEN,
            "pred_len": PRED_LEN,
        }, best_path)
        marker = " ← best"
    else:
        marker = ""

    if epoch % 5 == 0 or epoch == 1:
        lr = optimizer.param_groups[0]["lr"]
        msg = f"Epoch {epoch:3d}/{EPOCHS} | Train Loss: {train_loss:.6f} | Val MAE: {val_mae:.4f}{marker} | LR: {lr:.2e}"
        print(f"  {msg}")
        log_lines.append(msg)

with open(log_path, "w", encoding="utf-8") as f:
    f.write("\n".join(log_lines))

print(f"\n[v] Training complete.")
print(f"    Best Val MAE: {best_mae:.4f} vehicles/interval")
print(f"    Model saved : {best_path}")
print(f"    Log saved   : {log_path}")

if best_mae > 5.0:
    print(f"\n[!] Val MAE ({best_mae:.4f}) above target (5.0).")
    print("    Consider: more data, larger hidden_size, or more epochs.")

print("\n" + "=" * 60)
print("  LSTM training finished.")
print("  Next: python models/accident/train_accident.py")
print("=" * 60)
