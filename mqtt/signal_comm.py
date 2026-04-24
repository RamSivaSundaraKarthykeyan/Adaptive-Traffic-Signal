"""
signal_comm.py — MQTT Inter-Signal Communication Simulator
Smart Traffic AI | Tamil Nadu ITMS Extension

Simulates congestion warning broadcasts between Tamil Nadu
traffic signal nodes using the upstream neighbor map built
by signal_graph/build_graph.py.

Prerequisites:
  pip install paho-mqtt
  Start Mosquitto: net start mosquitto  OR  mosquitto -v

Run: python mqtt/signal_comm.py
"""
import os, sys, json, time, random, pickle, threading

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GRAPH_DIR = os.path.join(BASE_DIR, "signal_graph")

print("=" * 60)
print("  MQTT Signal Communication — Tamil Nadu ITMS")
print("=" * 60)

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("[✗] paho-mqtt not installed.\n    Run: pip install paho-mqtt"); sys.exit(1)

# ── Load upstream map ─────────────────────────────────────────────
upstream_file = os.path.join(GRAPH_DIR, "upstream_map.pkl")
nodes_file    = os.path.join(GRAPH_DIR, "signal_nodes.json")

if not os.path.isfile(upstream_file):
    print(f"\n[!] upstream_map.pkl not found.")
    print("    Run: python signal_graph/build_graph.py first.")
    print("\n    Using synthetic 10-node test graph...")
    upstream_map  = {i: [j for j in range(10) if j != i][:3] for i in range(10)}
    signal_nodes  = {str(i): {"lat": 13.0 + i*0.01, "lon": 80.0 + i*0.01, "city": "Chennai"} for i in range(10)}
else:
    with open(upstream_file, "rb") as f:
        upstream_map = pickle.load(f)
    with open(nodes_file) as f:
        signal_nodes = json.load(f)
    print(f"[✓] Loaded upstream map: {len(upstream_map)} nodes")
    print(f"[✓] Loaded signal nodes: {len(signal_nodes)} nodes")

# Use first 10 nodes for the test
node_ids = list(upstream_map.keys())[:10]
print(f"\n[→] Simulating {len(node_ids)} signal nodes...")

CONGESTION_THRESHOLD = 0.75
BROKER_HOST = "localhost"
BROKER_PORT = 1883
received_warnings = []

class SignalNode:
    def __init__(self, node_id):
        self.node_id = node_id
        self.density = round(random.uniform(0.3, 0.95), 2)
        self.predicted_density = round(self.density + random.uniform(-0.05, 0.2), 2)
        self.green_batch = 20
        self.warnings_received = 0

        self.client = mqtt.Client(client_id=f"node_{node_id}", protocol=mqtt.MQTTv311)
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message

        try:
            self.client.connect(BROKER_HOST, BROKER_PORT, 60)
            self.client.loop_start()
            self._connected = True
        except Exception as e:
            print(f"  [!] Node {node_id}: MQTT connect failed — {e}")
            self._connected = False

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            client.subscribe(f"tn/signal/{self.node_id}/warning")

    def _on_message(self, client, userdata, msg):
        try:
            w = json.loads(msg.payload.decode())
            self.warnings_received += 1
            received_warnings.append(w)
            if w["type"] == "CONGESTION_WARNING":
                self.green_batch = w["recommended_batch"]
                city = signal_nodes.get(str(w["from_node"]), {}).get("city", "?")
                print(f"  [←] Node {self.node_id} RECV warning from {w['from_node']} "
                      f"(city={city}, density={w['predicted_density']:.2f}) "
                      f"→ throttle to {self.green_batch} veh/cycle")
        except Exception as e:
            print(f"  [!] Message parse error: {e}")

    def broadcast_if_congested(self):
        if not self._connected:
            return
        if self.predicted_density > CONGESTION_THRESHOLD:
            neighbors = upstream_map.get(self.node_id, [])[:3]
            for neighbor in neighbors:
                payload = json.dumps({
                    "type": "CONGESTION_WARNING",
                    "from_node": str(self.node_id),
                    "predicted_density": self.predicted_density,
                    "recommended_batch": 8,
                    "timestamp": time.time(),
                })
                self.client.publish(f"tn/signal/{neighbor}/warning", payload, qos=1)
            city = signal_nodes.get(str(self.node_id), {}).get("city", "?")
            print(f"  [→] Node {self.node_id} (city={city}, density={self.predicted_density:.2f}) "
                  f"SENT warning to {len(neighbors)} upstream nodes")

    def disconnect(self):
        if self._connected:
            self.client.loop_stop()
            self.client.disconnect()

# ── Test MQTT broker connectivity ─────────────────────────────────
print("\n[→] Testing MQTT broker connection...")
test_client = mqtt.Client(client_id="test_probe", protocol=mqtt.MQTTv311)
broker_ok = False
try:
    test_client.connect(BROKER_HOST, BROKER_PORT, 10)
    test_client.disconnect()
    broker_ok = True
    print(f"[✓] Mosquitto broker reachable at {BROKER_HOST}:{BROKER_PORT}")
except Exception as e:
    print(f"[✗] Broker not reachable: {e}")
    print("    Start Mosquitto: net start mosquitto  OR  mosquitto -v")
    print("    Continuing with offline simulation...\n")

# ── Instantiate nodes ─────────────────────────────────────────────
nodes = [SignalNode(nid) for nid in node_ids]
time.sleep(1.0)   # Wait for subscriptions to register

# ── Run 3 communication cycles ────────────────────────────────────
print("\n[→] Running 3 communication cycles...\n")
for cycle in range(1, 4):
    print(f"--- Cycle {cycle} ---")
    for node in nodes:
        node.broadcast_if_congested()
    time.sleep(2)

time.sleep(1)

# ── Summary ───────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("  MQTT Simulation Summary")
print("=" * 60)
congested = [n for n in nodes if n.predicted_density > CONGESTION_THRESHOLD]
print(f"  Nodes simulated       : {len(nodes)}")
print(f"  Congested nodes       : {len(congested)}")
print(f"  Total warnings sent   : {sum(1 for n in nodes if n.predicted_density > CONGESTION_THRESHOLD)}")
print(f"  Total warnings recv'd : {len(received_warnings)}")
print(f"  Broker status         : {'ONLINE' if broker_ok else 'OFFLINE (simulated)'}")

for node in nodes:
    node.disconnect()

print("\n[✓] MQTT signal communication test complete.")
