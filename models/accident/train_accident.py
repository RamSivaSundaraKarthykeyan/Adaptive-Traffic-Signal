"""
train_accident.py — EfficientNet-B0 Accident Detection CNN
Smart Traffic AI | Tamil Nadu ITMS Extension
Binary classifier: accident vs. no_accident | Target: val_acc > 0.85
Run: python models/accident/train_accident.py
"""
import os, sys, time
BASE_DIR  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR  = os.path.join(BASE_DIR, "data", "raw", "accidents")
MODEL_DIR = os.path.join(BASE_DIR, "models", "accident")
LOG_DIR   = os.path.join(BASE_DIR, "logs")
os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(LOG_DIR,   exist_ok=True)


import torch
import torch.nn as nn
import torchvision.transforms as T
import torchvision.models as models
from torchvision.datasets import ImageFolder
from torch.utils.data import DataLoader, Dataset, random_split
from PIL import Image

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ── Custom Dataset Class ─────────────────────────────────────────
class CCTVDataset(Dataset):
    def __init__(self, samples, transform=None):
        self.samples = samples
        self.transform = transform
    def __len__(self): return len(self.samples)
    def __getitem__(self, idx):
        path, label = self.samples[idx]
        img = Image.open(path).convert('RGB')
        if self.transform: img = self.transform(img)
        return img, label

if __name__ == '__main__':
    print("=" * 60)
    print("  EfficientNet-B0 — Accident Detection CNN")
    print("  Tamil Nadu ITMS | Smart Traffic AI")
    print("=" * 60)
    print(f"[v] Device: {device}")

    # ── Dataset Mapping (CCTV Real Data) ─────────────────────────────
    # We combine images from the specific folders shown in your directory
    accident_paths = [
        os.path.join(DATA_DIR, "cctv-accident", "train", "images"),
        os.path.join(DATA_DIR, "cctv-accident", "valid", "images")
    ]
    no_accident_paths = [
        os.path.join(DATA_DIR, "cctv-non-accident", "train", "images")
    ]

    all_samples = []
    # Class 0: no_accident, Class 1: accident
    for p in no_accident_paths:
        if os.path.isdir(p):
            for f in os.listdir(p):
                if f.lower().endswith(('.jpg', '.jpeg', '.png')):
                    all_samples.append((os.path.join(p, f), 0))
    
    for p in accident_paths:
        if os.path.isdir(p):
            for f in os.listdir(p):
                if f.lower().endswith(('.jpg', '.jpeg', '.png')):
                    all_samples.append((os.path.join(p, f), 1))

    if len(all_samples) < 10:
        print("\n[!] Real dataset not found in expected subfolders. Check paths.")
        sys.exit(1)

    # ── Dataset Splitting ──────────────────────────────────────────

    # ── Advanced Augmentation ────────────────────────────────────────
    train_tf = T.Compose([
        T.Resize((224,224)),
        T.RandomHorizontalFlip(),
        T.RandomRotation(15), # New: Handles different camera angles
        T.ColorJitter(brightness=0.2, contrast=0.2), # New: Handles lighting
        T.ToTensor(),
        T.Normalize([.485,.456,.406],[.229,.224,.225])
    ])
    val_tf = T.Compose([
        T.Resize((224,224)),
        T.ToTensor(),
        T.Normalize([.485,.456,.406],[.229,.224,.225])
    ])

    full_ds = CCTVDataset(all_samples)
    train_size = int(0.8 * len(full_ds))
    val_size = len(full_ds) - train_size
    train_subset, val_subset = random_split(full_ds, [train_size, val_size])
    
    train_subset.dataset.transform = train_tf
    val_subset.dataset.transform = val_tf

    train_dl = DataLoader(train_subset, batch_size=16, shuffle=True, num_workers=0)
    val_dl   = DataLoader(val_subset,   batch_size=16, shuffle=False, num_workers=0)
    print(f"[v] Real Data Loaded: {len(all_samples)} images ({train_size} train, {val_size} val)")

    # ── Model (Fine-tuning enabled) ──────────────────────────────────
    net = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1)
    
    # Add Dropout to prevent overfitting
    in_feats = net.classifier[1].in_features
    net.classifier = nn.Sequential(
        nn.Dropout(p=0.3),
        nn.Linear(in_feats, 2)
    )
    net = net.to(device)

    opt       = torch.optim.Adam(net.parameters(), lr=1e-4, weight_decay=1e-5)
    sched     = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=30)
    criterion = nn.CrossEntropyLoss()
    # Updated to avoid deprecation warning
    scaler    = torch.amp.GradScaler('cuda', enabled=(device.type=="cuda"))

    # ── Training loop ─────────────────────────────────────────────────
    EPOCHS, best_acc = 30, 0.0
    best_path = os.path.join(MODEL_DIR, "best_accident.pt")
    log_lines = []
    print(f"\n[→] Training {EPOCHS} epochs...")

    for ep in range(1, EPOCHS+1):
        net.train(); t0 = time.time()
        tr_loss = tr_correct = 0
        for imgs, lbl in train_dl:
            imgs, lbl = imgs.to(device), lbl.to(device)
            opt.zero_grad()
            with torch.amp.autocast('cuda', enabled=(device.type=="cuda")):
                out  = net(imgs); loss = criterion(out, lbl)
            scaler.scale(loss).backward(); scaler.step(opt); scaler.update()
            tr_loss += loss.item()*len(imgs); tr_correct += (out.argmax(1)==lbl).sum().item()
        tr_acc = tr_correct / len(train_subset)

        net.eval(); val_correct = 0
        with torch.no_grad():
            for imgs, lbl in val_dl:
                imgs, lbl = imgs.to(device), lbl.to(device)
                val_correct += (net(imgs).argmax(1)==lbl).sum().item()
        val_acc = val_correct / len(val_subset)
        sched.step()

        if val_acc > best_acc:
            best_acc = val_acc
            torch.save({
                "epoch": ep,
                "model_state": net.state_dict(),
                "classes": ["no_accident", "accident"],
                "best_acc": best_acc
            }, best_path)
            marker = " ← best"
        else:
            marker = ""

        if ep % 5 == 0 or ep == 1:
            msg = f"Ep {ep:2d}/{EPOCHS} | train_acc={tr_acc:.4f} | val_acc={val_acc:.4f}{marker} | {time.time()-t0:.1f}s"
            print(f"  {msg}"); log_lines.append(msg)

    with open(os.path.join(LOG_DIR,"accident_training.log"),"w", encoding="utf-8") as f:
        f.write("\n".join(log_lines))
    print(f"\n[✓] Done. Best val_acc={best_acc:.4f} | Saved: {best_path}")
    status = "READY" if best_acc >= 0.85 else f"BELOW TARGET ({best_acc:.4f} < 0.85)"
    print(f"    Deployment status: {status}")
    print("\nNext: python models/rl/train_rl.py")

#test