import zipfile
import os
import shutil

base_dir = "c:/programs/nm_traffic_flow_optimization"
data_raw = os.path.join(base_dir, "data", "raw")

zips_to_extract = {
    "indian vehicles.yolov8.zip": os.path.join(data_raw, "india_vehicles", "indian_vehicles"),
    "vehicles.yolov8.zip": os.path.join(data_raw, "india_vehicles", "vehicles"),
    "ASTGNN-main.zip": os.path.join(data_raw, "pems"),
    "cctv-accident.v4i.yolov8.zip": os.path.join(data_raw, "accidents", "cctv-accident"),
    "cctv-non-accident.v2i.yolov8.zip": os.path.join(data_raw, "accidents", "cctv-non-accident")
}

for zip_name, target_dir in zips_to_extract.items():
    zip_path = os.path.join(base_dir, zip_name)
    if os.path.exists(zip_path):
        os.makedirs(target_dir, exist_ok=True)
        print(f"Extracting {zip_name} to {target_dir}...")
        try:
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(target_dir)
            print(f"Success for {zip_name}")
        except Exception as e:
            print(f"Error extracting {zip_name}: {e}")
    else:
        print(f"Not found: {zip_path}")
