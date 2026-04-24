from ultralytics import YOLO
import os

if __name__ == '__main__':
    model = YOLO("yolov8s.pt")

    print("Starting YOLOv8 training on Indian Traffic dataset...")
    results = model.train(
        data="c:/programs/nm_traffic_flow_optimization/data/labeled/chennai_traffic.yaml",
        epochs=100,
        imgsz=640,
        batch=8,
        device="cuda:0",
        amp=True,
        workers=2,
        cache=False,
        project="c:/programs/nm_traffic_flow_optimization/models/yolo",
        name="run1",
        patience=15,
        save=True,
        exist_ok=True,
    )

    print("Training complete.")
    if hasattr(results, 'results_dict'):
        print(f"Best mAP50: {results.results_dict.get('metrics/mAP50(B)', 0):.4f}")
    print("Ambulance recall (class 5): check c:/programs/nm_traffic_flow_optimization/models/yolo/run1/results.csv")

    # Save the best weights
    best_weights_src = "c:/programs/nm_traffic_flow_optimization/models/yolo/run1/weights/best.pt"
    best_weights_dst = "c:/programs/nm_traffic_flow_optimization/models/yolo/best.pt"
    if os.path.exists(best_weights_src):
        import shutil
        shutil.copy(best_weights_src, best_weights_dst)
        print("Copied best weights to:", best_weights_dst)
