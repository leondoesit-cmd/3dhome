import glob
import os
from PIL import Image

src_dir = '/Users/leonkhey/.gemini/antigravity/brain/6306ffe3-d355-43ac-a79c-c8e6e4b73528/'
dest_dir = '/Users/leonkhey/Documents/3dhome/assets/textures/'

mapping = {
    'fx_blood_alpha_': 'fx_blood_1.png',
    'fx_blood_alpha2_': 'fx_blood_2.png',
    'fx_blood_alpha3_': 'fx_blood_3.png',
    'fx_tear_alpha_': 'fx_tear_1.png'
}

for f in glob.glob(src_dir + '*.jpg'):
    basename = os.path.basename(f)
    for k, v in mapping.items():
        if basename.startswith(k):
            print(f"Processing {basename} -> {v}")
            img = Image.open(f).convert('L') # grayscale
            # threshold and contrast to make sure black is 0
            img = img.point(lambda p: max(0, p - 30) * (255 / 225))
            
            # create solid white image
            white = Image.new('RGB', img.size, (255, 255, 255))
            
            # merge with alpha
            white.putalpha(img)
            
            # save
            white.save(os.path.join(dest_dir, v))
            break
