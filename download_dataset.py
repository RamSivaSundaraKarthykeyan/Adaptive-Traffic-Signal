import os
import shutil
import kagglehub

def main():
    print("Downloading dataset from Kaggle...")
    # Download latest version
    try:
        path = kagglehub.dataset_download("arunavfc11/indian-traffic-videos")
        print(f"Dataset downloaded to cache: {path}")
    except Exception as e:
        print(f"Error downloading dataset: {e}")
        return

    target_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "dataset")
    os.makedirs(target_dir, exist_ok=True)

    print(f"Copying files to {target_dir}...")
    copied_count = 0
    for root, dirs, files in os.walk(path):
        for file in files:
            source_file = os.path.join(root, file)
            target_file = os.path.join(target_dir, file)
            if not os.path.exists(target_file):
                shutil.copy2(source_file, target_file)
                copied_count += 1
                print(f"Copied: {file}")
            else:
                print(f"Already exists: {file}")
    
    print(f"Download and extraction complete! {copied_count} new files copied to data/dataset/")

if __name__ == "__main__":
    main()
