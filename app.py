
import os
import cv2
import json
import torch
import numpy as np
import base64
from fastapi import FastAPI, WebSocket, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from stable_baselines3 import PPO
import torchvision.transforms as T
from PIL import Image
import torchvision.models as tvm
import torch.nn as nn

app = FastAPI(title="Chennai ITMS Backend")

# Enable CORS for Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- LOAD MODELS ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models")
DATASET_DIR = os.path.join(BASE_DIR, "data", "dataset")

# Check if dataset exists and warn if missing
if not os.path.exists(DATASET_DIR) or not any(f.endswith(('.mp4', '.avi')) for f in os.listdir(DATASET_DIR) if os.path.isfile(os.path.join(DATASET_DIR, f))):
    print("\n" + "="*60)
    print("WARNING: Traffic video dataset not found in data/dataset/")
    print("Please run 'python download_dataset.py' to download it.")
    print("="*60 + "\n")

print("[v] Loading models for UI...")

# 1. YOLO
yolo = YOLO(os.path.join(MODEL_DIR, "yolo", "best.pt"))

# 2. Accident CNN
accident_ckpt = torch.load(os.path.join(MODEL_DIR, "accident", "best_accident.pt"), map_location="cpu", weights_only=False)
cnn = tvm.efficientnet_b0(weights=None)
cnn.classifier[1] = nn.Linear(cnn.classifier[1].in_features, 2)
cnn.load_state_dict(accident_ckpt["model_state"])
cnn.eval()

# 3. RL Agent
rl_agent = PPO.load(os.path.join(MODEL_DIR, "rl", "traffic_rl_agent"))

# --- UTILS ---
def process_frame(frame_b64: str):
    # Decode base64 to CV2 frame
    encoded_data = frame_b64.split(',')[1]
    nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    # 1. YOLO Detection
    results = yolo.predict(frame, verbose=False)[0]
    detections = []
    for box in results.boxes:
        detections.append({
            "class": results.names[int(box.cls[0])],
            "conf": float(box.conf[0]),
            "bbox": [float(x) for x in box.xyxy[0]]
        })
        
    # 2. Accident Check (on central crop)
    img_pil = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    tf = T.Compose([T.Resize((224,224)), T.ToTensor(), T.Normalize([.485,.456,.406],[.229,.224,.225])])
    img_t = tf(img_pil).unsqueeze(0)
    with torch.no_grad():
        out = cnn(img_t)
        accident_prob = torch.softmax(out, dim=1)[0][1].item()
        
    # 3. RL Mock Action
    obs = np.zeros((11,)) # Mock observation
    action, _ = rl_agent.predict(obs)
    
    return {
        "detections": detections,
        "accident_probability": accident_prob,
        "rl_suggested_phase": int(action)
    }

@app.websocket("/ws/simulate")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            # In a real app, 'data' would be a frame. 
            # For the demo, we'll return simulated logic based on the model loads.
            result = {"status": "processing", "telemetry": {"vehicles": 12, "flow": 0.85}}
            await websocket.send_json(result)
    except Exception as e:
        print(f"WS Error: {e}")

@app.post("/upload-sample")
async def upload_sample(file: UploadFile = File(...)):
    save_path = os.path.join(BASE_DIR, "data", "samples", file.filename)
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    with open(save_path, "wb") as buffer:
        buffer.write(await file.read())
    return {"status": "success", "filename": file.filename}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
