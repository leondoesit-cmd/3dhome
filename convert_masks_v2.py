import glob
import os
from PIL import Image

src_dir = '/Users/leonkhey/.gemini/antigravity/brain/6306ffe3-d355-43ac-a79c-c8e6e4b73528/'
dest_dir = '/Users/leonkhey/Documents/3dhome/assets/textures/'

mapping = {
    'fx_blood_alpha_': ('fx_blood_1.png', (74, 0, 4)),
    'fx_blood_alpha2_': ('fx_blood_2.png', (74, 0, 4)),
    'fx_blood_alpha3_': ('fx_blood_3.png', (74, 0, 4)),
    'fx_tear_alpha_': ('fx_tear_1.png', (5, 5, 5))
}

for f in glob.glob(src_dir + '*.jpg'):
    basename = os.path.basename(f)
    for k, (v, color) in mapping.items():
        if basename.startswith(k):
            print(f"Processing {basename} -> {v} with color {color}")
            img = Image.open(f).convert('L')
            
            # The background in the JPEGs is around 31, and we want to remove compression artifacts.
            # We'll threshold at 40.
            img = img.point(lambda p: 0 if p < 40 else min(255, int((p - 40) * (255.0 / (255 - 40)))))
            
            # Create a solid color image for RGB
            colored = Image.new('RGB', img.size, color)
            
            # Merge with alpha
            colored.putalpha(img)
            
            # Save as PNG
            colored.save(os.path.join(dest_dir, v))
            break
