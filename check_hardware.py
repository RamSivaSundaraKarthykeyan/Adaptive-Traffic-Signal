"""
check_hardware.py — Hardware Verification Script
Smart Traffic AI | Tamil Nadu ITMS
Run: python check_hardware.py
"""

import sys
import subprocess

def run(cmd):
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
        return result.stdout.strip() or result.stderr.strip()
    except Exception as e:
        return f"ERROR: {e}"

print("=" * 60)
print("  Smart Traffic AI — Hardware Check")
print("  Tamil Nadu ITMS Extension")
print("=" * 60)

# Python
print(f"\n[1] Python: {sys.version}")

# Disk
try:
    import shutil
    total, used, free = shutil.disk_usage("c:\\")
    print(f"\n[2] Disk C:\\: Total={total/1e9:.1f}GB | Used={used/1e9:.1f}GB | Free={free/1e9:.1f}GB")
except Exception as e:
    print(f"\n[2] Disk check failed: {e}")

# RAM
try:
    import psutil
    mem = psutil.virtual_memory()
    print(f"\n[3] RAM: Total={mem.total/1e9:.1f}GB | Available={mem.available/1e9:.1f}GB | Used={mem.percent:.1f}%")
except ImportError:
    print("\n[3] RAM: psutil not installed — run: pip install psutil")

# PyTorch + CUDA
try:
    import torch
    cuda_ok = torch.cuda.is_available()
    print(f"\n[4] PyTorch: {torch.__version__} | CUDA Available: {cuda_ok}")
    if cuda_ok:
        print(f"    GPU: {torch.cuda.get_device_name(0)}")
        vram = torch.cuda.get_device_properties(0).total_memory / 1e9
        print(f"    VRAM: {vram:.2f} GB")
        print(f"    CUDA Version: {torch.version.cuda}")
    else:
        print("    WARNING: CUDA not available. GPU training will not work!")
        print("    Fix: Install CUDA 11.8 + reinstall PyTorch with:")
        print("    pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118")
except ImportError:
    print("\n[4] PyTorch: NOT INSTALLED")
    print("    Run: pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118")

# Key packages
packages = {
    "ultralytics": "ultralytics",
    "stable_baselines3": "stable_baselines3",
    "osmnx": "osmnx",
    "xgboost": "xgboost",
    "fastapi": "fastapi",
    "paho.mqtt": "paho-mqtt",
    "sklearn": "scikit-learn",
}

print("\n[5] Package Versions:")
all_ok = True
for mod, pkg in packages.items():
    try:
        m = __import__(mod)
        ver = getattr(m, "__version__", "installed")
        print(f"    {pkg}: {ver} ✓")
    except ImportError:
        print(f"    {pkg}: NOT INSTALLED ✗")
        all_ok = False

print("\n" + "=" * 60)
if all_ok:
    print("  STATUS: All checks passed. Ready to train.")
else:
    print("  STATUS: Some packages missing. Run: pip install -r requirements.txt")
print("=" * 60)
