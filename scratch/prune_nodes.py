import json

file_path = r'c:\programs\nm_traffic_flow_optimization\signal_graph\signal_nodes.json'

with open(file_path, 'r') as f:
    data = json.load(f)

# Filter only Chennai nodes
chennai_data = {k: v for k, v in data.items() if v.get('city') == 'Chennai'}

with open(file_path, 'w') as f:
    json.dump(chennai_data, f, indent=2)

print(f"Pruned signal_nodes.json to {len(chennai_data)} Chennai nodes.")
