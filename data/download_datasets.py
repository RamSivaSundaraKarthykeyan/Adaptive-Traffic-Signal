"""
download_datasets.py — Automated Dataset Acquisition
Smart Traffic AI | Tamil Nadu ITMS Extension

Downloads:
  1. Indian traffic vehicles dataset (Roboflow)
  2. PeMS04 traffic flow data (GitHub/Zenodo)
  3. Accident detection dataset (Roboflow fallback)
  4. Tamil Nadu OSM signal graph (via osmnx API)

Run: python data/download_datasets.py
"""
import os, sys, json, subprocess, urllib.request, zipfile, time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR  = os.path.join(BASE_DIR, "data", "raw")

print("=" * 65)
print("  Dataset Downloader — Smart Traffic AI | Tamil Nadu ITMS")
print("=" * 65)

# ── Helper ────────────────────────────────────────────────────────
def download_file(url, dest_path, label=""):
    print(f"  [↓] {label or url}")
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    try:
        urllib.request.urlretrieve(url, dest_path,
            reporthook=lambda b, bs, ts: print(
                f"      {min(b*bs, ts if ts>0 else b*bs)/1e6:.1f} MB", end="\r") if b % 50 == 0 else None)
        size = os.path.getsize(dest_path) / 1e6
        print(f"  [✓] Saved: {dest_path} ({size:.1f} MB)")
        return True
    except Exception as e:
        print(f"  [✗] Download failed: {e}")
        return False

def run_cmd(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.returncode == 0, result.stdout + result.stderr

# ══════════════════════════════════════════════════════════════════
# DATASET 1 — Indian Traffic Vehicles (Roboflow)
# ══════════════════════════════════════════════════════════════════
print("\n[DATASET 1] Indian Traffic Vehicles — Roboflow")
vehicles_dir = os.path.join(RAW_DIR, "india_vehicles")
os.makedirs(vehicles_dir, exist_ok=True)

ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "")
if not ROBOFLOW_API_KEY:
    print("  [!] ROBOFLOW_API_KEY not set.")
    print("      1. Go to: https://roboflow.com → create free account")
    print("      2. Get API key from dashboard")
    print("      3. Run:  $env:ROBOFLOW_API_KEY = 'your_key_here'")
    print("      4. Re-run this script")
    print("  [→] Skipping Roboflow download. Will use placeholder structure.")
    os.makedirs(os.path.join(vehicles_dir, "images", "train"), exist_ok=True)
    os.makedirs(os.path.join(vehicles_dir, "images", "val"),   exist_ok=True)
    os.makedirs(os.path.join(vehicles_dir, "labels", "train"), exist_ok=True)
    os.makedirs(os.path.join(vehicles_dir, "labels", "val"),   exist_ok=True)
    with open(os.path.join(vehicles_dir, "README.txt"), "w") as f:
        f.write("Set ROBOFLOW_API_KEY and re-run data/download_datasets.py\n")
else:
    try:
        from roboflow import Roboflow
        rf = Roboflow(api_key=ROBOFLOW_API_KEY)
        # Try multiple popular Indian traffic datasets
        datasets_to_try = [
            ("indian-traffic-detection", 1),
            ("vehicle-detection-india", 1),
            ("traffic-detection-india", 1),
        ]
        downloaded = False
        for proj_name, version in datasets_to_try:
            try:
                project = rf.workspace().project(proj_name)
                version_obj = project.version(version)
                version_obj.download("yolov8", location=vehicles_dir)
                n = len(os.listdir(os.path.join(vehicles_dir, "images", "train")))
                print(f"  [✓] Downloaded {proj_name} v{version}: {n} train images")
                downloaded = True
                break
            except Exception as e:
                print(f"  [!] {proj_name}: {e}")
                continue
        if not downloaded:
            print("  [!] Could not auto-download. Provide the exact Roboflow project name.")
    except ImportError:
        print("  [✗] roboflow not installed. Run: pip install roboflow")

# ══════════════════════════════════════════════════════════════════
# DATASET 2 — PeMS04 Traffic Flow Data
# ══════════════════════════════════════════════════════════════════
print("\n[DATASET 2] PeMS04 Traffic Flow Data")
pems_dir  = os.path.join(RAW_DIR, "pems")
pems_file = os.path.join(pems_dir, "pems04.npz")
os.makedirs(pems_dir, exist_ok=True)

if os.path.isfile(pems_file):
    print(f"  [✓] Already exists: {pems_file}")
else:
    # Zenodo record for PEMS-BAY / PeMS04
    zenodo_url = "https://zenodo.org/record/5146592/files/PEMS04.npz"
    ok = download_file(zenodo_url, pems_file, "PeMS04.npz from Zenodo")
    if not ok:
        # GitHub fallback
        gh_url = "https://raw.githubusercontent.com/guoshnBJTU/ASTGNN/main/data/PEMS04/PEMS04.npz"
        ok = download_file(gh_url, pems_file, "PeMS04.npz from GitHub")
    if not ok:
        print("  [!] PeMS04 unavailable online.")
        print("      The LSTM trainer will use synthetic data as fallback.")
        print("      Manually download from: https://zenodo.org/record/5146592")

# ══════════════════════════════════════════════════════════════════
# DATASET 3 — Accident Detection (Roboflow public)
# ══════════════════════════════════════════════════════════════════
print("\n[DATASET 3] Accident Detection Dataset")
accident_dir = os.path.join(RAW_DIR, "accidents")
os.makedirs(accident_dir, exist_ok=True)

if ROBOFLOW_API_KEY:
    try:
        from roboflow import Roboflow
        rf = Roboflow(api_key=ROBOFLOW_API_KEY)
        accidents_to_try = [
            ("accident-detection-8dvh5", 1),
            ("road-accident-detection", 1),
            ("accident-detection-system", 1),
        ]
        downloaded = False
        for proj_name, ver in accidents_to_try:
            try:
                project = rf.workspace().project(proj_name)
                version_obj = project.version(ver)
                version_obj.download("folder", location=accident_dir)
                print(f"  [✓] Downloaded accident dataset: {proj_name}")
                downloaded = True
                break
            except Exception as e:
                print(f"  [!] {proj_name}: {e}")
        if not downloaded:
            print("  [!] Could not find accident dataset. Trainer will use synthetic data.")
    except ImportError:
        print("  [✗] roboflow not installed.")
else:
    print("  [!] Set ROBOFLOW_API_KEY to download accident dataset.")
    print("      Trainer will auto-generate synthetic placeholder images.")

# ══════════════════════════════════════════════════════════════════
# DATASET 4 — Tamil Nadu OSM Signal Graph
# ══════════════════════════════════════════════════════════════════
print("\n[DATASET 4] Tamil Nadu Signal Graph (OSM via osmnx)")
graph_dir = os.path.join(BASE_DIR, "signal_graph")
nodes_file = os.path.join(graph_dir, "signal_nodes.json")

if os.path.isfile(nodes_file):
    with open(nodes_file) as f:
        n = len(json.load(f))
    print(f"  [✓] Signal graph already built: {n} nodes")
    print("      To rebuild: python signal_graph/build_graph.py")
else:
    print("  [→] Building Tamil Nadu signal graph...")
    print("      This may take 5–15 minutes depending on OSM server speed.")
    ok, out = run_cmd(f"python \"{os.path.join(graph_dir, 'build_graph.py')}\"")
    if ok:
        print("  [✓] Signal graph built successfully.")
    else:
        print(f"  [✗] Graph build failed:\n{out[:500]}")
        print("      Run manually: python signal_graph/build_graph.py")

# ── Summary ───────────────────────────────────────────────────────
print("\n" + "=" * 65)
print("  Dataset Acquisition Summary")
print("=" * 65)
checks = [
    ("India Vehicles",  os.path.join(vehicles_dir, "images", "train")),
    ("PeMS04",          pems_dir),
    ("Accidents",       accident_dir),
    ("Signal Graph",    graph_dir),
]
for name, path in checks:
    exists = os.path.isdir(path)
    files  = len(os.listdir(path)) if exists else 0
    status = f"✓ {files} items" if (exists and files > 0) else "⚠ empty/missing"
    print(f"  {name:<20} {status}")

print("\n  Next: Run training scripts in order:")
print("    python models/yolo/train_yolo.py")
print("    python models/lstm/train_lstm.py")
print("    python models/accident/train_accident.py")
print("    python models/rl/train_rl.py")
print("=" * 65)
