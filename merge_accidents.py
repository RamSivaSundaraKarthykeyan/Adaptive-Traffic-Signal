import os
import zipfile

source_dir = r'c:\programs\nm_traffic_flow_optimization\data\raw\accidents'
target_dir = r'c:\programs\nm_traffic_flow_optimization\data\processed\accidents'

os.makedirs(target_dir, exist_ok=True)

zips = [f for f in os.listdir(source_dir) if f.endswith('.zip')]

for z in zips:
    zip_path = os.path.join(source_dir, z)
    print(f'Extracting {z} to {target_dir}')
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(target_dir)

print('All extracted!')
