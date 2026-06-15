"""
build_graph.py — Tamil Nadu Traffic Signal Graph Builder
Smart Traffic AI | Tamil Nadu ITMS Extension

Pulls OSM road network data for major Tamil Nadu cities,
extracts traffic signal nodes, and builds an upstream neighbor map
for inter-signal MQTT communication.

Run: python signal_graph/build_graph.py
Output:
  signal_graph/tamilnadu_graph.graphml
  signal_graph/signal_nodes.json
  signal_graph/upstream_map.pkl
  signal_graph/city_stats.json
"""

import os
import sys
import json
import pickle
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIGNAL_GRAPH_DIR = os.path.join(BASE_DIR, "signal_graph")
os.makedirs(SIGNAL_GRAPH_DIR, exist_ok=True)

print("=" * 65)
print("  Tamil Nadu Traffic Signal Graph Builder")
print("  Smart Traffic AI | ITMS Extension")
print("=" * 65)

try:
    import osmnx as ox
    import networkx as nx
except ImportError:
    print("ERROR: osmnx / networkx not installed.")
    print("Run: pip install osmnx networkx")
    sys.exit(1)

# Tamil Nadu major cities to pull signal data from
CITIES = [
    "Chennai, Tamil Nadu, India",
    "Coimbatore, Tamil Nadu, India",
    "Madurai, Tamil Nadu, India",
    "Tiruchirappalli, Tamil Nadu, India",
    "Salem, Tamil Nadu, India",
    "Tirunelveli, Tamil Nadu, India",
]

all_signal_nodes = {}
all_upstream_map = {}
city_stats = {}
combined_G = None

for city in CITIES:
    city_short = city.split(",")[0]
    city_file = os.path.join(SIGNAL_GRAPH_DIR, f"{city_short.lower().replace(' ', '_')}_graph.graphml")
    t0 = time.time()
    try:
        if os.path.isfile(city_file):
            print(f"\n[->] Loading local OSM graph for {city_short}...")
            G = ox.load_graphml(city_file)
            elapsed = time.time() - t0
            print(f"    Graph loaded from file in {elapsed:.1f}s — {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
        else:
            print(f"\n[->] Skipping {city_short} (no local graphml file found at {city_file})")
            continue

        # Extract signal nodes for this city
        city_signals = {
            n: {"lat": data["y"], "lon": data["x"], "city": city_short}
            for n, data in G.nodes(data=True)
            if data.get("highway") == "traffic_signals"
        }
        print(f"    Signal nodes found: {len(city_signals)}")

        # Build upstream map
        reverse_G = G.reverse()
        city_upstream = {}
        for node_id in city_signals:
            try:
                upstream = list(nx.single_source_shortest_path(
                    reverse_G, node_id, cutoff=2
                ).keys())
                upstream = [n for n in upstream if n != node_id and n in city_signals]
                city_upstream[node_id] = upstream
            except Exception:
                city_upstream[node_id] = []

        all_signal_nodes.update(city_signals)
        all_upstream_map.update(city_upstream)

        avg_up = sum(len(v) for v in city_upstream.values()) / max(len(city_upstream), 1)
        city_stats[city_short] = {
            "signal_nodes": len(city_signals),
            "avg_upstream_neighbors": round(avg_up, 2),
            "graph_nodes": G.number_of_nodes(),
            "graph_edges": G.number_of_edges(),
        }

        # Save per-city graphml if not already saved
        if not os.path.isfile(city_file):
            ox.save_graphml(G, filepath=city_file)
            print(f"    Saved: {os.path.basename(city_file)}")

    except Exception as e:
        print(f"    WARNING: Could not fetch/load {city_short}: {e}")
        city_stats[city_short] = {"error": str(e)}
        continue

# Save combined outputs
print("\n[->] Saving combined outputs...")

nodes_file = os.path.join(SIGNAL_GRAPH_DIR, "signal_nodes.json")
with open(nodes_file, "w") as f:
    json.dump({str(k): v for k, v in all_signal_nodes.items()}, f, indent=2)
print(f"    signal_nodes.json — {len(all_signal_nodes)} total signal nodes")

upstream_file = os.path.join(SIGNAL_GRAPH_DIR, "upstream_map.pkl")
with open(upstream_file, "wb") as f:
    pickle.dump(all_upstream_map, f)
print(f"    upstream_map.pkl — {len(all_upstream_map)} entries")

stats_file = os.path.join(SIGNAL_GRAPH_DIR, "city_stats.json")
with open(stats_file, "w") as f:
    json.dump(city_stats, f, indent=2)
print(f"    city_stats.json")

# Summary
print("\n" + "=" * 65)
print("  Tamil Nadu Signal Graph — Summary")
print("=" * 65)
for city, stats in city_stats.items():
    if "error" in stats:
        print(f"  {city:<22} FAILED: {stats['error'][:40]}")
    else:
        print(f"  {city:<22} {stats['signal_nodes']:>5} signals | "
              f"avg {stats['avg_upstream_neighbors']:.1f} upstream neighbors")
print(f"\n  TOTAL signal nodes: {len(all_signal_nodes)}")
print("=" * 65)
print("Signal graph build complete.")
