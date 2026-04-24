"""
train_rl.py — PPO Reinforcement Learning Signal Optimizer
Smart Traffic AI | Tamil Nadu ITMS Extension

Trains a PPO agent inside SUMO single-intersection simulation
to minimise vehicle waiting time at traffic signals.
500K timesteps | Checkpoints every 10K steps

Prerequisites:
  1. SUMO installed: https://sumo.dlr.de/docs/Downloads.php
  2. pip install sumo-rl gymnasium stable-baselines3

Run: python models/rl/train_rl.py
"""
import os, sys

BASE_DIR  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODEL_DIR = os.path.join(BASE_DIR, "models", "rl")
LOG_DIR   = os.path.join(BASE_DIR, "logs", "rl_tensorboard")
CKPT_DIR  = os.path.join(MODEL_DIR, "checkpoints")
SUMO_DIR  = os.path.join(BASE_DIR, "sumo_sim")
os.makedirs(CKPT_DIR, exist_ok=True)
os.makedirs(LOG_DIR,  exist_ok=True)

print("=" * 60)
print("  PPO RL Agent — Tamil Nadu Signal Optimizer")
print("  Smart Traffic AI | ITMS Extension")
print("=" * 60)

# ── Check SUMO ────────────────────────────────────────────────────
import sumolib
sumo_home = os.environ.get("SUMO_HOME")
if not sumo_home:
    sumo_home = os.path.abspath(os.path.join(os.path.dirname(sumolib.__file__), "..", "sumo"))
if not os.path.isdir(sumo_home):
    sumo_home = "C:/Program Files/SUMO"
if not os.path.isdir(sumo_home):
    print(f"\n[!] SUMO not found at: {sumo_home}")
    print("    Download from: https://sumo.dlr.de/docs/Downloads.php")
    print("    Then set: $env:SUMO_HOME = 'C:/Program Files/SUMO'")
    print("    Or run:   pip install eclipse-sumo  (if available)")
    sys.exit(1)
os.environ["SUMO_HOME"] = sumo_home
print(f"[v] SUMO_HOME: {sumo_home}")

# ── Check sumo-rl example files ───────────────────────────────────
try:
    import sumo_rl
    pkg_dir = os.path.dirname(sumo_rl.__file__)
    example_net = os.path.join(pkg_dir, "nets", "single-intersection",
                               "single-intersection.net.xml")
    example_rou = os.path.join(pkg_dir, "nets", "single-intersection",
                               "single-intersection.rou.xml")

    if not os.path.isfile(example_net):
        # Fallback search
        import glob as _glob
        nets = _glob.glob(os.path.join(pkg_dir, "**", "*.net.xml"), recursive=True)
        rous = _glob.glob(os.path.join(pkg_dir, "**", "*.rou.xml"), recursive=True)
        if nets and rous:
            example_net, example_rou = nets[0], rous[0]
        else:
            print("[x] Could not find SUMO example net/route files in sumo-rl package.")
            print("    Check your sumo-rl installation.")
            sys.exit(1)

    import shutil
    net_dst = os.path.join(SUMO_DIR, "single-intersection.net.xml")
    rou_dst = os.path.join(SUMO_DIR, "single-intersection.rou.xml")
    if not os.path.isfile(net_dst):
        shutil.copy(example_net, net_dst)
    if not os.path.isfile(rou_dst):
        shutil.copy(example_rou, rou_dst)
    print(f"[v] SUMO sim files ready in: {SUMO_DIR}")

except ImportError:
    print("[x] sumo-rl not installed.")
    print("    Run: pip install sumo-rl gymnasium")
    sys.exit(1)

# ── Import RL stack ───────────────────────────────────────────────
try:
    import torch
    from stable_baselines3 import PPO
    from stable_baselines3.common.callbacks import CheckpointCallback
    import gymnasium as gym
except ImportError as e:
    print(f"[x] {e}\n    Run: pip install stable-baselines3[extra] gymnasium")
    sys.exit(1)

device_str = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[v] RL training device: {device_str}")

# ── Environment ───────────────────────────────────────────────────
print("\n[>] Creating SUMO environment...")
env = sumo_rl.SumoEnvironment(
    net_file=net_dst,
    route_file=rou_dst,
    single_agent=True,
    use_gui=False,
    num_seconds=3600,
    delta_time=5,
    yellow_time=3,
    min_green=5,
    max_green=60,
    reward_fn="diff-waiting-time",
)
print("[v] SUMO environment created.")

# ── PPO Agent ─────────────────────────────────────────────────────
checkpoint_cb = CheckpointCallback(
    save_freq=10_000,
    save_path=CKPT_DIR,
    name_prefix="traffic_rl",
)

model = PPO(
    "MlpPolicy", env,
    verbose=1,
    device=device_str,
    learning_rate=3e-4,
    n_steps=2048,
    batch_size=64,
    n_epochs=10,
    gamma=0.99,
    gae_lambda=0.95,
    clip_range=0.2,
    tensorboard_log=LOG_DIR,
)

total_params = sum(p.numel() for p in model.policy.parameters())
print(f"[v] PPO policy | Parameters: {total_params:,}")

# ── Train ─────────────────────────────────────────────────────────
print("\n[>] Starting RL training (500,000 timesteps)...")
print("    Checkpoints -> models/rl/checkpoints/")
print("    TensorBoard -> logs/rl_tensorboard/")
print("    Run:  tensorboard --logdir logs/rl_tensorboard\n")

model.learn(total_timesteps=500_000, callback=checkpoint_cb)

save_path = os.path.join(MODEL_DIR, "traffic_rl_agent")
model.save(save_path)
env.close()

print(f"\n[v] RL training complete.")
print(f"    Agent saved: {save_path}.zip")
print("\nNext: python integration_test.py")
