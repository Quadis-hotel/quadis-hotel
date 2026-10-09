"""
RETIRED 31 Jul 2026 — DO NOT RUN. Near-duplicate of scripts/fix_images.py; both
are retired for the same reasons, and the reasons are destructive ones.

  1. Encodes the slug `hotel-amar-in`, which was our typo and was renamed to
     `hotel-amar-inn` on 31 Jul along with its image directory. Running this
     recreates the orphaned old directory.
  2. Writes `.png`/`.jpeg` into a tree that is now entirely `.webp`.
  3. Removes files before verifying the destination — the shape of incident 4.

`src/data/images.ts` resolves photos through a build-time glob keyed on the
directory name. Any script that renames or deletes under `public/images/` can
change what the site renders without producing a single error. Do it by hand.
"""
import sys

sys.exit(
    "REFUSING TO RUN — scripts/fix_images_v2.py is retired.\n"
    "It targets the pre-rename slug 'hotel-amar-in' and deletes files.\n"
    "Read the docstring at the top of this file, or AGENTS.md."
)

import os
import shutil
import hashlib

def md5(fname):
    hash_md5 = hashlib.md5()
    try:
        with open(fname, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    except:
        return None

src_dir = "Facade Image 1537 × 1023 px"
facade_dir = "public/images/facade"
hotels_dir = "public/images/hotels"

mapping = {
    "Hotel Amar Inn (3).png": ("hotel-amar-in", "hero.png"),
    "Hotel Amby Inn.jpeg": ("hotel-amby-inn-lajpat-nagar-ii", "hero.jpeg"),
    "Hotel Cladis sector 19 noida (2).png": ("hotel-cladis-sector-19-noida", "hero.png"),
    "Hotel Downtown East of Kailash.png": ("hotel-downtown-east-of-kailash", "hero.png"),
    "Hotel downtown sector 15 noida (2).png": ("hotel-downtown-sector-15-noida", "hero.png"),
    "Hotel Downtown Sector 51 Noida (3).png": ("hotel-downtown-sector-51-noida", "hero.png"),
    "Hotel Quadis Central Sector 27 Noida (2).png": ("hotel-quadis-central-sector-27-noida", "hero.png"),
    "Hotel quadis sector 51 noida (3).png": ("hotel-quadis-sector-51-noida", "hero.png")
}

branded_hashes = set()

for root, _, files in os.walk(src_dir):
    for fname in files:
        if fname in mapping:
            hotel_slug, dest_name = mapping[fname]
            src_path = os.path.join(root, fname)
            
            branded_hashes.add(md5(src_path))
            
            hotel_path = os.path.join(hotels_dir, hotel_slug)
            os.makedirs(hotel_path, exist_ok=True)
            
            # Remove existing hero.* to prevent duplicates
            for f in os.listdir(hotel_path):
                if f.startswith("hero."):
                    os.remove(os.path.join(hotel_path, f))
                    print(f"Removed old hero image: {f} from {hotel_slug}")
                    
            dest_path = os.path.join(hotel_path, dest_name)
            shutil.copy2(src_path, dest_path)
            print(f"Copied {fname} to {dest_path}")

# Clean up facade folder
for f in os.listdir(facade_dir):
    f_path = os.path.join(facade_dir, f)
    if os.path.isfile(f_path):
        if md5(f_path) in branded_hashes:
            os.remove(f_path)
            print(f"Removed branded image from facade pool: {f}")

print("Done fixing images.")
