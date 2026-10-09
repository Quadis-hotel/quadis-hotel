"""
RETIRED 31 Jul 2026 — DO NOT RUN. Superseded by scripts/fix_images_v2.py, which
is also retired. Kept as the record of how the image tree was first assembled.

Three reasons running this now does damage:

  1. It encodes the slug `hotel-amar-in`. That was OUR TYPO and was renamed to
     `hotel-amar-inn` on 31 Jul, together with the image directory. Running this
     recreates `public/images/hotels/hotel-amar-in/` — an orphan directory that
     `src/data/images.ts`'s build-time glob will happily pick up while the site
     resolves photos under the corrected name.
  2. It writes `.png`/`.jpeg` heroes into a tree that is now entirely `.webp`.
  3. It calls os.remove/shutil on files BEFORE checking the destination is
     right. Incident 4 in AGENTS.md is an image script that deleted originals.

If you need to reorganise images, do it by hand against
`public/images/hotels/<slug>/` and check `src/data/images.ts` first — the glob
is keyed on directory name, so a directory rename silently changes what renders.
"""
import sys

sys.exit(
    "REFUSING TO RUN — scripts/fix_images.py is retired.\n"
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

# Map new images and collect hashes
for src_name, (hotel_slug, dest_name) in mapping.items():
    src_path = os.path.join(src_dir, src_name)
    if not os.path.exists(src_path):
        print(f"Missing: {src_path}")
        continue
    
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
    print(f"Copied {src_name} to {dest_path}")

# Clean up facade folder
for f in os.listdir(facade_dir):
    f_path = os.path.join(facade_dir, f)
    if os.path.isfile(f_path):
        if md5(f_path) in branded_hashes:
            os.remove(f_path)
            print(f"Removed branded image from facade pool: {f}")

print("Done fixing images.")
