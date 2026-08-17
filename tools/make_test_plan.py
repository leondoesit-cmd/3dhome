#!/usr/bin/env python3
"""Synthesize a blueprint image with known geometry to test blueprint_cv.py.
Same topology as generator.js 'large': 6 rooms, passages, doors, windows."""
import cv2
import numpy as np

T = 12          # wall thickness px (1px = 1cm here)
OX, OZ = 50, 50 # plan offset on canvas

img = np.full((1000, 1100, 3), 255, np.uint8)

def wall(x0, z0, x1, z1):
    """thick wall segment along centerline"""
    cv2.line(img, (OX + x0, OZ + z0), (OX + x1, OZ + z1), (30, 30, 30), T)

def erase(x0, z0, x1, z1):
    """cut an opening (white) across a wall"""
    cv2.rectangle(img, (OX + x0, OZ + z0), (OX + x1, OZ + z1), (255, 255, 255), -1)

def glaze(x0, z0, x1, z1):
    """thin window line on wall centerline"""
    cv2.line(img, (OX + x0, OZ + z0), (OX + x1, OZ + z1), (60, 60, 60), 2)

# room borders (rooms: kitchen 0,400-400,900 | living 400,400-1000,900 |
# corridor 400,250-600,400 | bathroom 400,0-600,250 | bed2 0,0-400,400 |
# master 600,0-1000,400)
for x0, z0, x1, z1 in [(0, 400, 400, 900), (400, 400, 1000, 900),
                       (400, 250, 600, 400), (400, 0, 600, 250),
                       (0, 0, 400, 400), (600, 0, 1000, 400)]:
    wall(x0, z0, x1, z0); wall(x1, z0, x1, z1)
    wall(x1, z1, x0, z1); wall(x0, z1, x0, z0)

# interior openings
erase(430, 400 - T, 550, 400 + T)   # corridor->living passage 120
erase(400 - T, 550, 400 + T, 700)   # kitchen->living passage 150
erase(600 - T, 290, 600 + T, 370)   # corridor->master door 80
erase(400 - T, 280, 400 + T, 360)   # corridor->bed2 door 80
erase(470, 250 - T, 540, 250 + T)   # corridor->bath door 70

# door swing arcs (thin quarter circles, like real plans)
for cx, cz, r in [(600, 290, 80), (400, 280, 80), (470, 250, 70)]:
    cv2.ellipse(img, (OX + cx, OZ + cz), (r, r), 0, 0, 90, (90, 90, 90), 2)

# entrance (empty gap, bottom wall of living) + arc
erase(700, 900 - T, 790, 900 + T)
cv2.ellipse(img, (OX + 700, OZ + 900), (90, 90), 0, 270, 360, (90, 90, 90), 2)

# windows: erase then thin glazing line on centerline
erase(830, 900 - T, 980, 900 + T); glaze(830, 900, 980, 900)     # living 150
erase(-T, 600, T, 700);            glaze(0, 600, 0, 700)          # kitchen 100
erase(1000 - T, 150, 1000 + T, 270); glaze(1000, 150, 1000, 270)  # master 120
erase(100, -T, 220, T);            glaze(100, 0, 220, 0)          # bed2 120
erase(450, -T, 510, T);            glaze(450, 0, 510, 0)          # bath 60

# text labels + dimension lines (noise the parser must ignore)
for txt, x, z in [("SALON", 650, 650), ("MITBACH", 120, 650),
                  ("MAMAD", 750, 200), ("SHINA", 120, 200),
                  ("AMBATIA", 430, 130), ("3.20x4.15", 650, 700)]:
    cv2.putText(img, txt, (OX + x, OZ + z), cv2.FONT_HERSHEY_SIMPLEX,
                0.8, (50, 50, 50), 2, cv2.LINE_AA)
cv2.line(img, (OX, OZ + 940), (OX + 1000, OZ + 940), (100, 100, 100), 1)
for x in (0, 1000):
    cv2.line(img, (OX + x, OZ + 930), (OX + x, OZ + 950), (100, 100, 100), 1)
cv2.putText(img, "10.00", (OX + 470, OZ + 965), cv2.FONT_HERSHEY_SIMPLEX,
            0.6, (100, 100, 100), 1, cv2.LINE_AA)

cv2.imwrite("test_plan.png", img)
print("wrote test_plan.png")
