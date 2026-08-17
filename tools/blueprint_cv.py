#!/usr/bin/env python3
"""
blueprint_cv.py — classic-CV floor-plan parser for 3dhome.

Converts a blueprint/floor-plan image into the layout JSON consumed by
buildLayout() in js/generator.js:

    { "w": cm, "d": cm,
      "rooms":   [{ "name", "x0","z0","x1","z1", "floor" }],
      "doors":   [{ "from","to","width","s" } | { "from":"Outside","to",...,"wall" }],
      "windows": [{ "room","width","height","sill" }] }

Pipeline (no ML): deskew -> ink mask (Otsu) -> wall mask (thick strokes only,
text/dimension lines dropped) -> seal door gaps by dilation -> flood free space
into room components -> rectangles snapped onto a shared coordinate grid so
adjacent rooms weld into common walls -> door/window detection by scanning the
wall mask for gaps along shared/exterior edges (a gap with thin "glazing" lines
across it is a window, an empty gap is a door).

Room NAMES are the one thing classic CV can't read reliably, so naming is a
heuristic (area/shape/adjacency) — or pass --ollama to have a local VLM read
just the labels (geometry stays 100% CV). This is the hybrid mode: the LLM is
only asked "what is room #N called", which small local models do far better
than full geometric extraction.

Usage:
    python3 tools/blueprint_cv.py plan.png -o layout.json
    python3 tools/blueprint_cv.py plan.png --width-cm 1150 --debug overlay.png
    python3 tools/blueprint_cv.py plan.png --ollama            # VLM room names
    python3 tools/blueprint_cv.py --serve                      # HTTP service for
                                                               # the app's Import
                                                               # Blueprint modal

Known limits (same as the VLM path): rooms are axis-aligned rectangles —
L-shaped rooms become their bounding box; curved walls are not supported;
corridors narrower than --door-close-cm*2 may be swallowed (lower it if so).
buildLayout centers windows and takes one per room, so only the widest
detected window per room is emitted.
"""

import argparse
import base64
import json
import math
import sys
import urllib.request

import cv2
import numpy as np

# ----------------------------------------------------------------- constants

DOOR_MIN_CM = 55       # gap narrower than this = noise / not a door
DOOR_MAX_CM = 175      # wider = wall genuinely missing (open plan), not a door
PASSAGE_MIN_CM = 135   # doors wider than this become open passages
EDGE_MIN_OVERLAP_CM = 40   # rooms must share at least this much edge to be adjacent
GLAZING_MIN_FRAC = 0.25    # >= this much thin ink across a gap => window

WET_ROOMS = {"Bathroom", "Kitchen", "WC", "Laundry", "Balcony"}

# VLM label -> the names generator.js furnishing rules recognize
CANON = {"hallway": "Corridor", "hall": "Corridor", "entry": "Corridor",
         "salon": "Living Room", "lounge": "Living Room",
         "living": "Living Room", "wc": "Bathroom", "toilet": "Bathroom",
         "shower": "Bathroom", "shower room": "Bathroom"}


NOTES = []          # warnings of the current parse, embedded in layout meta


class ParseError(Exception):
    """Input image can't be parsed into a plan (bad image, no walls, ...)."""


def warn(msg):
    NOTES.append(msg)
    print(f"[blueprint_cv] {msg}", file=sys.stderr)


# ------------------------------------------------------------------- deskew

def deskew(gray):
    """Rotate so the dominant wall direction is axis-aligned (small angles only)."""
    ink = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    h, w = ink.shape
    lines = cv2.HoughLinesP(ink, 1, np.pi / 360, threshold=120,
                            minLineLength=min(h, w) // 4, maxLineGap=8)
    if lines is None:
        return gray, 0.0
    residuals = []
    for x1, y1, x2, y2 in lines.reshape(-1, 4):
        a = math.degrees(math.atan2(y2 - y1, x2 - x1))
        r = (a + 45) % 90 - 45          # residual vs nearest 0/90 multiple
        if abs(r) < 10:
            residuals.append(r)
    if not residuals:
        return gray, 0.0
    angle = float(np.median(residuals))
    if abs(angle) < 0.3:
        return gray, 0.0
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    fixed = cv2.warpAffine(gray, M, (w, h), flags=cv2.INTER_LINEAR,
                           borderMode=cv2.BORDER_CONSTANT, borderValue=255)
    return fixed, angle


# ---------------------------------------------------------------- wall mask

def make_masks(image, wall_px_arg):
    """Return (ink, walls, wall_px). ink = all dark strokes; walls = thick ones.

    Real (photographed) plans often draw walls as COLORED hatched bands
    (blue/red concrete hatching) rather than solid black — those don't survive
    a grayscale threshold. So walls are extracted from dark ink UNIONED with a
    solidified strong-saturation mask; on clean B&W drawings the color mask is
    simply empty and this degrades to the plain pipeline."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    ink = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]

    solid = ink
    if image.ndim == 3:
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        colored = ((hsv[:, :, 1] >= 90) & (hsv[:, :, 2] < 235)).astype(np.uint8) * 255
        if (colored > 0).mean() > 0.01:  # plan actually uses colored walls
            k9 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
            colored = cv2.morphologyEx(colored, cv2.MORPH_CLOSE, k9)
            solid = cv2.bitwise_or(ink, colored)

    if wall_px_arg:
        wall_px = wall_px_arg
    else:
        # Stroke half-thickness distribution; walls dominate the thick tail.
        dist = cv2.distanceTransform(solid, cv2.DIST_L2, 5)
        vals = dist[dist > 0]
        wall_px = int(round(float(np.percentile(vals, 92)) * 2)) if len(vals) else 6
        wall_px = max(3, min(wall_px, 60))

    # Opening drops strokes thinner than the kernel: text, hatching, dim lines.
    ko = max(3, int(wall_px * 0.7)) | 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ko, ko))
    walls = cv2.morphologyEx(solid, cv2.MORPH_OPEN, kernel)

    # Drop leftover blobs that are too short to be wall segments (bold text).
    # Threshold is deliberately small: short wall stubs between two adjacent
    # openings (entrance next to a window) are isolated components too.
    n, labels, stats, _ = cv2.connectedComponentsWithStats(walls, 8)
    for i in range(1, n):
        if max(stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]) < 2.5 * wall_px:
            walls[labels == i] = 0
    return ink, walls, wall_px


# ------------------------------------------------------------- room finding

LOW_OCC = 0.35


def low_runs(prof):
    """Interior runs where occupancy < LOW_OCC: [(start, end)]."""
    runs, i, n = [], 0, len(prof)
    while i < n:
        if prof[i] >= LOW_OCC:
            i += 1
            continue
        j = i
        while j < n and prof[j] < LOW_OCC:
            j += 1
        if i > 0 and j < n:          # interior only
            runs.append((i, j))
        i = j
    return runs


def shrink_wrap(crop, band, min_dim):
    """Trim low-occupancy margins (e.g. the thin free channel piercing a
    sealed passage wall) so a leaf rect hugs the actual room. Returns
    (x0, z0, x1, z1) within crop."""
    x0, z0 = 0, 0
    z1, x1 = crop.shape
    trims = {"t": 0, "b": 0, "l": 0, "r": 0}
    while x1 - x0 > min_dim and z1 - z0 > min_dim:
        sub = crop[z0:z1, x0:x1] > 0
        edges = {
            "t": (float(sub[0].mean()), trims["t"]),
            "b": (float(sub[-1].mean()), trims["b"]),
            "l": (float(sub[:, 0].mean()), trims["l"]),
            "r": (float(sub[:, -1].mean()), trims["r"]),
        }
        side = min(edges, key=lambda s: edges[s][0])
        if edges[side][0] >= LOW_OCC or edges[side][1] >= band:
            break
        trims[side] += 1
        if side == "t":
            z0 += 1
        elif side == "b":
            z1 -= 1
        elif side == "l":
            x0 += 1
        else:
            x1 -= 1
    return x0, z0, x1, z1


def split_component(sub, min_dim, wall_band, depth=0):
    """Decompose a free-space component into room rectangles.

    Two split kinds: a narrow low-occupancy plateau is a sealed door/passage
    wall pierced by a leftover channel — discard the plateau and recurse both
    sides; otherwise an L/T shape gets a guillotine cut at the biggest step in
    the occupancy profile. Leaves are shrink-wrapped. Coords relative to sub."""
    ys, xs = np.nonzero(sub)
    if len(xs) == 0:
        return []
    x0, x1, z0, z1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop = sub[z0:z1, x0:x1]
    h, w = crop.shape
    fill = len(xs) / (h * w)

    def leaf():
        tx0, tz0, tx1, tz1 = shrink_wrap(crop, wall_band, min_dim)
        return [(x0 + tx0, z0 + tz0, x0 + tx1, z0 + tz1)]

    if fill >= 0.92 or min(h, w) < min_dim or depth >= 4:
        return leaf()

    colp = (crop > 0).mean(axis=0)
    rowp = (crop > 0).mean(axis=1)

    def recurse(axis, cut0, cut1):
        a, b = crop.copy(), crop.copy()
        if axis == "x":
            a[:, cut0:] = 0
            b[:, :cut1] = 0
        else:
            a[cut0:, :] = 0
            b[:cut1, :] = 0
        parts = (split_component(a, min_dim, wall_band, depth + 1)
                 + split_component(b, min_dim, wall_band, depth + 1))
        return [(px0 + x0, pz0 + z0, px1 + x0, pz1 + z0)
                for px0, pz0, px1, pz1 in parts]

    # 1) sealed-wall plateaus: narrow interior low runs with room on each side
    wall_cuts = []
    for prof, axis in ((colp, "x"), (rowp, "z")):
        for r0, r1 in low_runs(prof):
            if r1 - r0 <= wall_band and r0 >= 2 and len(prof) - r1 >= 2:
                wall_cuts.append((float(prof[r0:r1].mean()), axis, r0, r1))
    if wall_cuts:
        _, axis, r0, r1 = min(wall_cuts)
        return recurse(axis, r0, r1)

    # 2) L/T shapes: guillotine cut at the biggest occupancy step. Compared
    # over a window, not adjacent rows — photographed plans produce gradual
    # ramps that never jump 0.3 in one row. Tiny offcuts (door channels) are
    # dropped by the raw size filter downstream.
    wstep = max(3, min_dim)
    best = (0.0, None, 0)
    for prof, axis in ((colp, "x"), (rowp, "z")):
        if len(prof) <= 2 * wstep + 4:
            continue
        m = np.convolve(prof, np.ones(wstep) / wstep, "valid")
        d = np.abs(m[wstep:] - m[:-wstep])
        i = int(np.argmax(d))
        if d[i] > best[0]:
            best = (float(d[i]), axis, i + wstep)
    step, axis, idx = best
    if axis is None or step < 0.45 or idx < 2 or idx > len(
            colp if axis == "x" else rowp) - 2:
        return leaf()
    return recurse(axis, idx, idx)


def reinforce_glazing(walls, ink, wall_px, scale):
    """Recover structure the thick-stroke wall mask loses. Two thin-line
    classes are added back from Hough segments over the thin ink:

    * glazing — window lines inside wall gaps (short, ends anchored at the
      jambs). Without them rooms leak "outside" through window holes.
    * thin partitions — interior walls drawn as plain double lines, far
      thinner than the structural/hatched walls that set wall_px (common on
      real architect drawings). Long + highly continuous qualifies.

    Text fails the continuity test, arcs fail axis-alignment, dashed section
    lines fail continuity. Returns (barrier, walls_scan, bound): barrier seals
    rooms for flooding; walls_scan additionally carries the thin partitions so
    door-gap scanning sees them (glazing is left out of walls_scan so window
    gaps stay open for the window detector); bound = walls + partitions +
    glazing, i.e. every DRAWN boundary — used to reject pockets that are
    mostly fenced by dashed lines or hatching instead of real walls."""
    thin = cv2.subtract(ink, cv2.dilate(walls, np.ones((3, 3), np.uint8)))
    min_len = max(25, int(35 / scale))
    seg = cv2.HoughLinesP(thin, 1, np.pi / 180, threshold=30,
                          minLineLength=min_len, maxLineGap=4)
    barrier = walls.copy()
    walls_scan = walls.copy()
    bound = walls.copy()
    diag = np.zeros_like(walls)   # diagonal hatching (balconies, voids)
    if seg is None:
        return barrier, walls_scan, bound, diag
    # continuity is judged against thin ink OR wall: Hough segments often
    # overhang past the jamb onto the wall itself, which must not count as a gap
    fat = cv2.bitwise_or(cv2.dilate(thin, np.ones((3, 3), np.uint8)), walls)
    # distance to the nearest wall pixel, to test that segment ends sit at jambs
    wall_dist = cv2.distanceTransform(cv2.bitwise_not(walls), cv2.DIST_L2, 5)
    anchor = 3.0 * wall_px
    glaze_max = 320 / scale               # windows are <=~260cm
    for x1, y1, x2, y2 in seg.reshape(-1, 4):
        a = math.degrees(math.atan2(y2 - y1, x2 - x1))
        if abs((a + 45) % 90 - 45) > 5:
            # long diagonal strokes = hatching (no room feature is diagonal);
            # paint them fat so the hatched area becomes one solid region
            if abs((a + 45) % 90 - 45) > 20 and math.hypot(x2 - x1, y2 - y1) > 1.5 * min_len:
                cv2.line(diag, (x1, y1), (x2, y2), 255, max(9, int(30 / scale)))
            continue                      # walls/glazing must be axis-aligned
        length = max(abs(x2 - x1), abs(y2 - y1)) + 1
        ts = np.linspace(0, 1, length)
        px = np.clip(np.round(x1 + ts * (x2 - x1)).astype(int), 0, fat.shape[1] - 1)
        py = np.clip(np.round(y1 + ts * (y2 - y1)).astype(int), 0, fat.shape[0] - 1)
        cont = (fat[py, px] > 0).mean()
        if length <= glaze_max:
            # glazing: anchored at jambs, mostly continuous
            if wall_dist[y1, x1] > anchor or wall_dist[y2, x2] > anchor:
                continue
            if cont < 0.85:
                continue
            cv2.line(barrier, (x1, y1), (x2, y2), 255, max(3, wall_px))
            cv2.line(bound, (x1, y1), (x2, y2), 255, max(3, wall_px))
        else:
            # thin partition wall: long and nearly unbroken
            if cont < 0.92:
                continue
            cv2.line(barrier, (x1, y1), (x2, y2), 255, max(3, wall_px))
            cv2.line(walls_scan, (x1, y1), (x2, y2), 255, max(3, wall_px))
            cv2.line(bound, (x1, y1), (x2, y2), 255, max(3, wall_px))

    # hatched areas (balconies/voids): the main Hough pass misses short faint
    # hatch strokes, so run a relaxed pass and keep only diagonal segments.
    # Hebrew glyphs have diagonals too — the blob-size filter (>= ~2 m^2)
    # separates a hatched balcony from a text label.
    seg2 = cv2.HoughLinesP(thin, 1, np.pi / 180, threshold=15,
                           minLineLength=max(12, int(20 / scale)), maxLineGap=6)
    if seg2 is not None:
        for x1, y1, x2, y2 in seg2.reshape(-1, 4):
            a = math.degrees(math.atan2(y2 - y1, x2 - x1))
            if abs((a + 45) % 90 - 45) > 20:
                cv2.line(diag, (x1, y1), (x2, y2), 255, max(9, int(30 / scale)))
    hatch = np.zeros_like(walls)
    if diag.any():
        diag = cv2.morphologyEx(diag, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        nd, dl, ds, _ = cv2.connectedComponentsWithStats(diag, 8)
        for di in range(1, nd):
            if ds[di, cv2.CC_STAT_AREA] >= (140 / scale) ** 2:
                barrier[dl == di] = 255
                hatch[dl == di] = 255
    return barrier, walls_scan, bound, hatch


def find_rooms_px(walls, close_px, scale, wall_px):
    """Seal door gaps, flood free space, return interior room rects (px).
    RECT kernel, not ellipse: square dilation keeps boundaries rectilinear so
    occupancy profiles stay step-shaped for the splitter."""
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (2 * close_px + 1, 2 * close_px + 1))
    sealed = cv2.dilate(walls, k)
    free = cv2.bitwise_not(sealed)
    # a real room is >=140cm across; after sealing it shrank by 2*close+wall.
    # anything thinner is the residual channel piercing a sealed door/passage
    # gap — erase those up front so rooms come out as clean components.
    raw_min = max(6, int(140 / scale) - 2 * close_px - wall_px)
    ok = cv2.getStructuringElement(cv2.MORPH_RECT, (raw_min, raw_min))
    free = cv2.morphologyEx(free, cv2.MORPH_OPEN, ok)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(free, 4)
    h, w = walls.shape
    floor_px = (40 / scale) ** 2          # drop pockets smaller than ~40x40cm
    min_dim = max(4, int(30 / scale))     # min rect dimension for splitting
    wall_band = 2 * close_px + int(30 / scale)  # widest sealed-wall plateau
    rooms = []
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if x == 0 or y == 0 or x + bw >= w or y + bh >= h:
            continue                      # touches border => outside
        if area < floor_px:
            continue
        comp = (labels[y:y + bh, x:x + bw] == i).astype(np.uint8)
        for rx0, rz0, rx1, rz1 in split_component(comp, min_dim, wall_band):
            if min(rx1 - rx0, rz1 - rz0) < raw_min:
                continue
            rooms.append((x + rx0, y + rz0, x + rx1, y + rz1))
    return rooms


def resolve_overlaps(rects):
    """After growing interior bboxes to wall centerlines, halves of a split
    open-plan area (no wall between them) overlap — pull the shared boundary
    back to the midline so edges coincide and snap into one. A rect mostly
    contained in another is an artifact: drop it instead of midlining, which
    would truncate the big rect at the artifact's edge."""
    alive = [True] * len(rects)
    for _ in range(3):
        moved = False
        for i in range(len(rects)):
            for j in range(i + 1, len(rects)):
                if not (alive[i] and alive[j]):
                    continue
                a, b = rects[i], rects[j]
                ox = min(a["x1"], b["x1"]) - max(a["x0"], b["x0"])
                oz = min(a["z1"], b["z1"]) - max(a["z0"], b["z0"])
                if ox <= 0 or oz <= 0:
                    continue
                area_a = (a["x1"] - a["x0"]) * (a["z1"] - a["z0"])
                area_b = (b["x1"] - b["x0"]) * (b["z1"] - b["z0"])
                if ox * oz > 0.7 * min(area_a, area_b):
                    alive[i if area_a < area_b else j] = False
                    moved = True
                    continue
                if ox <= oz:
                    mid = (max(a["x0"], b["x0"]) + min(a["x1"], b["x1"])) / 2
                    if a["x0"] < b["x0"]:
                        a["x1"], b["x0"] = mid, mid
                    else:
                        b["x1"], a["x0"] = mid, mid
                else:
                    mid = (max(a["z0"], b["z0"]) + min(a["z1"], b["z1"])) / 2
                    if a["z0"] < b["z0"]:
                        a["z1"], b["z0"] = mid, mid
                    else:
                        b["z1"], a["z0"] = mid, mid
                moved = True
        if not moved:
            break
    return [r for k, r in enumerate(rects) if alive[k]]


def cluster_snap(values, tol):
    """1D cluster: map every value to its cluster's rounded mean."""
    if not values:
        return {}
    vals = sorted(set(values))
    out, group = {}, [vals[0]]
    for v in vals[1:]:
        if v - group[-1] <= tol:
            group.append(v)
        else:
            m = round(sum(group) / len(group))
            for g in group:
                out[g] = m
            group = [v]
    m = round(sum(group) / len(group))
    for g in group:
        out[g] = m
    return out


# ---------------------------------------------------------- interval helpers

def overlap(a0, a1, b0, b1):
    lo, hi = max(a0, b0), min(a1, b1)
    return (lo, hi) if hi - lo > 0 else None


def subtract_intervals(lo, hi, cuts):
    """Parts of [lo,hi] not covered by any (c0,c1) in cuts."""
    segs = [(lo, hi)]
    for c0, c1 in cuts:
        nxt = []
        for s0, s1 in segs:
            if c1 <= s0 or c0 >= s1:
                nxt.append((s0, s1))
                continue
            if c0 > s0:
                nxt.append((s0, c0))
            if c1 < s1:
                nxt.append((c1, s1))
        segs = nxt
    return segs


# ------------------------------------------------------------- gap scanning

class Frame:
    """cm <-> px transform. cm = (px - origin) * scale."""

    def __init__(self, ox, oz, scale):
        self.ox, self.oz, self.scale = ox, oz, scale

    def x_px(self, cm):
        return int(round(cm / self.scale + self.ox))

    def z_px(self, cm):
        return int(round(cm / self.scale + self.oz))


def band_profile(mask, vertical, c_px, lo_px, hi_px, band):
    """Boolean per-position 'is there ink in the band' along an edge."""
    h, w = mask.shape
    if vertical:
        x0, x1 = max(0, c_px - band), min(w, c_px + band + 1)
        seg = mask[max(0, lo_px):min(h, hi_px), x0:x1]
    else:
        z0, z1 = max(0, c_px - band), min(h, c_px + band + 1)
        seg = mask[z0:z1, max(0, lo_px):min(w, hi_px)].T
    if seg.size == 0:
        return np.zeros(0, dtype=bool)
    return seg.max(axis=1) > 0


def find_gaps(walls, ink, frame, vertical, c_cm, lo_cm, hi_cm, wall_px):
    """Gaps in the wall along an edge. Returns [(lo_cm, hi_cm, glazing_frac)]."""
    if vertical:
        c_px, lo_px, hi_px = frame.x_px(c_cm), frame.z_px(lo_cm), frame.z_px(hi_cm)
    else:
        c_px, lo_px, hi_px = frame.z_px(c_cm), frame.x_px(lo_cm), frame.x_px(hi_cm)
    band = max(2, wall_px)
    solid = band_profile(walls, vertical, c_px, lo_px, hi_px, band)
    if solid.size == 0:
        return []
    glazing = band_profile(ink, vertical, c_px, lo_px, hi_px, band)

    gaps, i, n = [], 0, len(solid)
    while i < n:
        if solid[i]:
            i += 1
            continue
        j = i
        while j < n and not solid[j]:
            j += 1
        g_lo = lo_cm + i * frame.scale
        g_hi = lo_cm + j * frame.scale
        frac = float(glazing[i:j].mean()) if j > i else 0.0
        gaps.append((g_lo, g_hi, frac))
        i = j
    return gaps


# ------------------------------------------------------------------- naming

def name_rooms(rooms, adjacency, entrance_idx, doors):
    """Heuristic names from geometry + door topology. Door counts beat shape:
    a small many-doored room is a corridor, a passage off the living room is
    an open kitchen. --ollama replaces these with the printed labels."""
    order = sorted(range(len(rooms)), key=lambda i: -rooms[i]["area"])
    names = {}
    n_doors = {i: 0 for i in range(len(rooms))}
    for d in doors:
        n_doors[d["i"]] += 1
        n_doors[d["j"]] += 1

    living = entrance_idx if entrance_idx is not None else order[0]
    names[living] = "Living Room"

    # hub room: many doors, smallish, usually windowless
    hubs = [i for i in order if i not in names and n_doors[i] >= 3
            and rooms[i]["area"] < 12.0]
    if hubs:
        names[max(hubs, key=lambda i: n_doors[i])] = "Corridor"

    # open kitchen: joined to the living room by a passage
    for d in doors:
        if not d.get("isPassage"):
            continue
        pair = {d["i"], d["j"]}
        if living in pair:
            other = (pair - {living}).pop()
            if other not in names:
                names[other] = "Kitchen"
                break

    # bathroom: smallest compact room left
    baths = [i for i in order if i not in names and rooms[i]["area"] < 7.0
             and rooms[i]["aspect"] < 2.4]
    if baths:
        names[baths[-1]] = "Bathroom"

    for i in order:
        if i in names:
            continue
        if rooms[i]["aspect"] >= 2.6 and rooms[i]["area"] < 12.0:
            names[i] = "Corridor" if "Corridor" not in names.values() else "Corridor 2"
            continue

    bed_no = 0
    for i in order:
        if i in names:
            continue
        bed_no += 1
        names[i] = "Master Bedroom" if bed_no == 1 else f"Bedroom {bed_no}"
    return names


def dedupe_names(names):
    seen, out = {}, {}
    for i, n in names.items():
        if n in seen:
            seen[n] += 1
            out[i] = f"{n} {seen[n]}"
        else:
            seen[n] = 1
            out[i] = n
    return out


# ----------------------------------------------------------------- ollama

def ollama_labels(image_bgr, rooms, frame, model, endpoint):
    """Ask a local VLM to read the label of each numbered room. Names only —
    geometry is not touched. Returns {index: name} or {} on any failure."""
    canvas = image_bgr.copy()
    for i, r in enumerate(rooms):
        cx = frame.x_px((r["x0"] + r["x1"]) / 2)
        cz = frame.z_px((r["z0"] + r["z1"]) / 2)
        for color, tk in (((255, 255, 255), 8), ((0, 0, 200), 3)):
            cv2.putText(canvas, str(i + 1), (cx - 15, cz + 12),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.4, color, tk, cv2.LINE_AA)
    scale = min(1.0, 1568 / max(canvas.shape[:2]))
    if scale < 1.0:
        canvas = cv2.resize(canvas, None, fx=scale, fy=scale)
    ok, jpg = cv2.imencode(".jpg", canvas, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        return {}
    b64 = base64.b64encode(jpg.tobytes()).decode()

    prompt = (
        "This floor plan has red numbers 1..%d marking rooms. For each number, "
        "read the room label printed near it and return ONLY a JSON object "
        'mapping the number to an English room name, e.g. {"1": "Kitchen"}. '
        "Translate Hebrew labels (ממ\"ד = Safe Room, מרפסת = Balcony, "
        "סלון = Living Room, מטבח = Kitchen, חדר שינה = Bedroom, "
        "אמבטיה / שירותים = Bathroom, פרוזדור = Corridor). "
        "If no label is readable, use your best guess from context."
    ) % len(rooms)

    body = json.dumps({
        "model": model,
        "stream": False,
        "format": "json",
        "messages": [{"role": "user", "content": prompt, "images": [b64]}],
    }).encode()
    req = urllib.request.Request(endpoint.rstrip("/") + "/api/chat", data=body,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read())
        raw = json.loads(data["message"]["content"])
    except Exception as e:  # offline, no model, bad JSON — all non-fatal
        warn(f"--ollama failed ({e}); keeping heuristic room names")
        return {}
    out = {}
    for k, v in raw.items():
        try:
            idx = int(str(k).strip()) - 1
        except ValueError:
            continue
        if 0 <= idx < len(rooms) and isinstance(v, str) and v.strip():
            name = v.strip().title()
            canon = CANON.get(name.lower())
            if not canon:  # "Hallway/Corridor" etc. — match by substring
                canon = next((c for k, c in CANON.items() if k in name.lower()), name)
            out[idx] = canon
    return out


# -------------------------------------------------------------------- debug

def debug_render(image_bgr, walls, rooms, doors, windows, frame, path):
    vis = image_bgr.copy()
    vis[walls > 0] = (0.4 * vis[walls > 0] + 0.6 * np.array([80, 80, 255])).astype(np.uint8)
    for r in rooms:
        p0 = (frame.x_px(r["x0"]), frame.z_px(r["z0"]))
        p1 = (frame.x_px(r["x1"]), frame.z_px(r["z1"]))
        cv2.rectangle(vis, p0, p1, (0, 180, 0), 2)
        cv2.putText(vis, r["name"], (p0[0] + 6, p0[1] + 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 120, 0), 2, cv2.LINE_AA)
    for d in doors:
        cv2.circle(vis, (frame.x_px(d["_cx"]), frame.z_px(d["_cz"])), 9, (0, 165, 255), 3)
    for wn in windows:
        cv2.circle(vis, (frame.x_px(wn["_cx"]), frame.z_px(wn["_cz"])), 9, (255, 120, 0), 3)
    cv2.imwrite(path, vis)


# ----------------------------------------------------------------- pipeline

def parse_image(image, args):
    """Full pipeline: BGR image -> layout dict. `args` is any object with the
    CLI attribute names (argparse namespace or equivalent). Raises ParseError
    on unusable input. Used by both the CLI and --serve modes."""
    del NOTES[:]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    gray, angle = deskew(gray)
    if angle:
        warn(f"deskewed by {angle:+.2f} deg")
        M = cv2.getRotationMatrix2D((image.shape[1] / 2, image.shape[0] / 2), angle, 1.0)
        image = cv2.warpAffine(image, M, (image.shape[1], image.shape[0]),
                               borderValue=(255, 255, 255))

    ink, walls, wall_px = make_masks(image, args.wall_px)
    ys, xs = np.nonzero(walls)
    if len(xs) == 0:
        raise ParseError("no walls detected — try --wall-px")
    bx0, bx1, bz0, bz1 = xs.min(), xs.max(), ys.min(), ys.max()

    scale = args.scale if args.scale else args.width_cm / (bx1 - bx0)
    frame = Frame(bx0, bz0, scale)
    wall_cm = wall_px * scale
    warn(f"scale {scale:.3f} cm/px, wall stroke {wall_px}px = {wall_cm:.0f}cm")
    if not 4 <= wall_cm <= 45:
        warn("implied wall thickness looks off — check --width-cm / --wall-px")

    # ---- rooms
    close_px = max(2, int(round(args.door_close_cm / scale)))
    # texture mask: stair treads and hatched (balcony/void) areas are dense
    # with thin lines, unlike room interiors — make them non-floodable so they
    # never become rooms or leak into one. Measured against thick walls only,
    # BEFORE tread lines can get adopted as thin partitions.
    thin_ink = ((cv2.subtract(ink, cv2.dilate(walls, np.ones((7, 7), np.uint8)))
                 > 0) * 255).astype(np.uint8)
    kt = max(9, int(30 / scale)) | 1
    dens = cv2.blur(thin_ink, (kt, kt))
    texture = ((dens >= 0.15 * 255) * 255).astype(np.uint8)
    texture = cv2.morphologyEx(texture, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    # only large connected texture regions count — text/dimension clusters
    # AND fixture-dense small bathrooms stay below this; stair cores are
    # several square meters of treads
    nt, tl, ts, _ = cv2.connectedComponentsWithStats(texture, 8)
    texture = np.zeros_like(texture)
    min_tex = (173 / scale) ** 2
    for ti in range(1, nt):
        if ts[ti, cv2.CC_STAT_AREA] >= min_tex:
            texture[tl == ti] = 255

    barrier, walls_scan, bound, hatch = reinforce_glazing(walls, ink, wall_px, scale)
    walls = walls_scan          # gap scanning must see thin partitions too
    barrier = cv2.bitwise_or(barrier, texture)
    fills = cv2.bitwise_or(hatch, texture)   # non-room area (hatch, stairs)
    # bridge sub-door-size nicks left by imperfect glazing/hatch recovery
    # (1D kernels: bridges along-wall gaps without thickening rooms shut)
    kb = 2 * wall_px + 1
    barrier = cv2.morphologyEx(barrier, cv2.MORPH_CLOSE,
                               cv2.getStructuringElement(cv2.MORPH_RECT, (kb, 1)))
    barrier = cv2.morphologyEx(barrier, cv2.MORPH_CLOSE,
                               cv2.getStructuringElement(cv2.MORPH_RECT, (1, kb)))
    boxes = find_rooms_px(barrier, close_px, scale, wall_px)
    if not boxes:
        raise ParseError("no rooms found — try lowering --door-close-cm or --min-room-m2")

    # interior bbox -> wall centerline rect, in cm
    grow = close_px * scale + wall_cm / 2
    rects = []
    for x0, z0, x1, z1 in boxes:
        rects.append({
            "x0": (x0 - bx0) * scale - grow, "z0": (z0 - bz0) * scale - grow,
            "x1": (x1 - bx0) * scale + grow, "z1": (z1 - bz0) * scale + grow,
        })
    # drop pockets outside the plan (e.g. between walls and dimension lines)
    plan_w, plan_d = (bx1 - bx0) * scale, (bz1 - bz0) * scale
    rects = [r for r in rects
             if -20 < (r["x0"] + r["x1"]) / 2 < plan_w + 20
             and -20 < (r["z0"] + r["z1"]) / 2 < plan_d + 20]
    rects = resolve_overlaps(rects)

    # snap edges to shared grid so adjacent rooms weld into one wall
    tol = max(16, wall_cm * 1.8)
    xsnap = cluster_snap([v for r in rects for v in (r["x0"], r["x1"])], tol)
    zsnap = cluster_snap([v for r in rects for v in (r["z0"], r["z1"])], tol)
    for r in rects:
        r["x0"], r["x1"] = xsnap[r["x0"]], xsnap[r["x1"]]
        r["z0"], r["z1"] = zsnap[r["z0"]], zsnap[r["z1"]]
        r["area"] = (r["x1"] - r["x0"]) * (r["z1"] - r["z0"]) / 1e4  # m^2
        w_, d_ = r["x1"] - r["x0"], r["z1"] - r["z0"]
        r["aspect"] = max(w_, d_) / max(1, min(w_, d_))
    rects = [r for r in rects if r["area"] >= args.min_room_m2 * 0.8]

    # reject rects that are substantially hatched/textured inside — leftover
    # slivers of a balcony or stair core whose fill mask had holes
    def hatch_frac(r):
        x0, x1 = frame.x_px(r["x0"]), frame.x_px(r["x1"])
        z0, z1 = frame.z_px(r["z0"]), frame.z_px(r["z1"])
        h_, w_ = fills.shape
        sub = fills[max(0, z0):min(h_, z1), max(0, x0):min(w_, x1)]
        return float((sub > 0).mean()) if sub.size else 0.0

    kept = []
    for r in rects:
        hf = hatch_frac(r)
        if hf > 0.30:
            warn(f"dropping hatched region at ({round(r['x0'])},{round(r['z0'])})cm "
                 f"({int(hf * 100)}% hatch/stair texture)")
            continue
        kept.append(r)
    rects = kept

    # reject pockets that aren't fenced by drawn walls: a real room's
    # perimeter is mostly wall/partition/glazing (gaps only at doors); a
    # pocket between dashed outlines or hatching is mostly unfenced
    def perimeter_coverage(r):
        band = 2 * wall_px
        covered = total = 0
        for vert, c, lo, hi in (
            (True, r["x0"], r["z0"], r["z1"]), (True, r["x1"], r["z0"], r["z1"]),
            (False, r["z0"], r["x0"], r["x1"]), (False, r["z1"], r["x0"], r["x1"]),
        ):
            if vert:
                p = band_profile(bound, True, frame.x_px(c),
                                 frame.z_px(lo), frame.z_px(hi), band)
            else:
                p = band_profile(bound, False, frame.z_px(c),
                                 frame.x_px(lo), frame.x_px(hi), band)
            covered += int(p.sum())
            total += len(p)
        return covered / max(1, total)

    # rooms that fail this are only dropped if they ALSO have no detected
    # door — a corridor is legitimately mostly door openings, but a pocket
    # between dashed outlines has neither walls nor doors
    low_cov = {i for i, r in enumerate(rects) if perimeter_coverage(r) < 0.45}
    if not rects:
        raise ParseError("all detected rooms were filtered out — check --width-cm")

    # ---- adjacency + interior door gaps
    adjacency = {i: set() for i in range(len(rects))}
    doors = []
    for i in range(len(rects)):
        for j in range(i + 1, len(rects)):
            a, b = rects[i], rects[j]
            edge = None  # (vertical, c_cm, lo, hi)
            if a["x1"] == b["x0"] or b["x1"] == a["x0"]:
                c = a["x1"] if a["x1"] == b["x0"] else b["x1"]
                ov = overlap(a["z0"], a["z1"], b["z0"], b["z1"])
                if ov and ov[1] - ov[0] >= EDGE_MIN_OVERLAP_CM:
                    edge = (True, c, ov[0], ov[1])
            if edge is None and (a["z1"] == b["z0"] or b["z1"] == a["z0"]):
                c = a["z1"] if a["z1"] == b["z0"] else b["z1"]
                ov = overlap(a["x0"], a["x1"], b["x0"], b["x1"])
                if ov and ov[1] - ov[0] >= EDGE_MIN_OVERLAP_CM:
                    edge = (False, c, ov[0], ov[1])
            if edge is None:
                continue
            adjacency[i].add(j)
            adjacency[j].add(i)

            vert, c, lo, hi = edge
            gaps = [g for g in find_gaps(walls, ink, frame, vert, c, lo, hi, wall_px)
                    if g[1] - g[0] >= DOOR_MIN_CM]
            if not gaps:
                continue
            g = max(gaps, key=lambda g: g[1] - g[0])
            width = round((g[1] - g[0]) / 5) * 5
            # a gap wider than any door = open plan boundary -> passage
            doors.append({
                "i": i, "j": j,
                "width": min(width, 150),
                "s": max(10, round(g[0] - lo)),
                "isPassage": width >= PASSAGE_MIN_CM,
                "_cx": c if vert else (g[0] + g[1]) / 2,
                "_cz": (g[0] + g[1]) / 2 if vert else c,
            })

    # ---- drop unfenced doorless pockets (dashed outlines, voids)
    doored_real = {d["i"] for d in doors} | {d["j"] for d in doors}
    drop = {i for i in low_cov if i not in doored_real}
    if drop:
        remap = {}
        new_rects = []
        for i, r in enumerate(rects):
            if i in drop:
                warn(f"dropping unfenced doorless region at "
                     f"({round(r['x0'])},{round(r['z0'])})cm")
                continue
            remap[i] = len(new_rects)
            new_rects.append(r)
        rects = new_rects
        if not rects:
            raise ParseError("all detected rooms were filtered out — check --width-cm")
        doors = [dict(d, i=remap[d["i"]], j=remap[d["j"]]) for d in doors]
        adjacency = {remap[i]: {remap[j] for j in adj if j not in drop}
                     for i, adj in adjacency.items() if i not in drop}

    # ---- exterior edges: entrance + windows
    windows_raw = []   # (room_idx, width, _cx, _cz)
    entrance = None    # (room_idx, side, s, width)
    for i, r in enumerate(rects):
        for side in ("left", "right", "top", "bottom"):
            vert = side in ("left", "right")
            c = r["x0"] if side == "left" else r["x1"] if side == "right" \
                else r["z0"] if side == "top" else r["z1"]
            lo, hi = (r["z0"], r["z1"]) if vert else (r["x0"], r["x1"])
            cuts = []
            for j, o in enumerate(rects):
                if j == i:
                    continue
                if vert and (o["x0"] == c or o["x1"] == c):
                    ov = overlap(lo, hi, o["z0"], o["z1"])
                    if ov:
                        cuts.append(ov)
                elif not vert and (o["z0"] == c or o["z1"] == c):
                    ov = overlap(lo, hi, o["x0"], o["x1"])
                    if ov:
                        cuts.append(ov)
            for s0, s1 in subtract_intervals(lo, hi, cuts):
                if s1 - s0 < EDGE_MIN_OVERLAP_CM:
                    continue
                for g0, g1, frac in find_gaps(walls, ink, frame, vert, c, s0, s1, wall_px):
                    gw = g1 - g0
                    if gw < 45 or gw > 260:
                        continue
                    cx = c if vert else (g0 + g1) / 2
                    cz = (g0 + g1) / 2 if vert else c
                    if frac >= GLAZING_MIN_FRAC:
                        windows_raw.append((i, round(gw / 5) * 5, cx, cz))
                    elif gw <= DOOR_MAX_CM and entrance is None:
                        entrance = (i, side, max(10, round(g0 - s0)),
                                    min(round(gw / 5) * 5, 110))

    # ---- connectivity fixup: every room needs at least one opening
    doored = set()
    for d in doors:
        doored.add(d["i"])
        doored.add(d["j"])
    if entrance:
        doored.add(entrance[0])
    for i in range(len(rects)):
        if i in doored or not adjacency[i]:
            continue
        j = max(adjacency[i], key=lambda j: rects[j]["area"])
        warn(f"room {i} had no detected door — inferring one to room {j}")
        doors.append({"i": i, "j": j, "width": 80, "s": 60, "isPassage": False,
                      "_cx": (rects[i]["x0"] + rects[i]["x1"]) / 2,
                      "_cz": (rects[i]["z0"] + rects[i]["z1"]) / 2})
        doored.add(i)

    # ---- names
    names = name_rooms(rects, adjacency, entrance[0] if entrance else None, doors)
    if args.ollama:
        vlm = ollama_labels(image, [dict(r, **{"name": ""}) for r in rects],
                            frame, args.ollama_model, args.ollama_endpoint)
        names.update(vlm)
    names = dedupe_names(names)

    # ---- normalize to origin and emit
    minx = min(r["x0"] for r in rects)
    minz = min(r["z0"] for r in rects)
    rooms_out, debug_rooms = [], []
    for i, r in enumerate(rects):
        name = names[i]
        floor = "tiles" if any(wr.lower() in name.lower() for wr in WET_ROOMS) else "wood"
        rooms_out.append({
            "name": name, "floor": floor,
            "x0": round(r["x0"] - minx), "z0": round(r["z0"] - minz),
            "x1": round(r["x1"] - minx), "z1": round(r["z1"] - minz),
        })
        debug_rooms.append(dict(r, name=name))

    doors_out = []
    if entrance:
        i, side, s, width = entrance
        wall_side = side if side in ("top", "bottom") else "bottom"
        if side not in ("top", "bottom"):
            warn(f"entrance is on the {side} wall; buildLayout only supports "
                 "top/bottom outside doors — using bottom")
        doors_out.append({"from": "Outside", "to": names[entrance[0]],
                          "width": width, "s": s, "wall": wall_side})
    else:
        big = max(range(len(rects)), key=lambda i: rects[i]["area"])
        warn("no entrance detected — adding a default one on the bottom wall")
        doors_out.append({"from": "Outside", "to": names[big],
                          "width": 90, "s": 60, "wall": "bottom"})
    for d in doors:
        entry = {"from": names[d["i"]], "to": names[d["j"]],
                 "width": d["width"], "s": d["s"]}
        if d["isPassage"]:
            entry["isPassage"] = True
        doors_out.append(entry)

    # widest window per room (buildLayout centers one window per room)
    best_win = {}
    for i, gw, cx, cz in windows_raw:
        if i not in best_win or gw > best_win[i][0]:
            best_win[i] = (gw, cx, cz)
    windows_out, debug_wins = [], []
    for i, (gw, cx, cz) in sorted(best_win.items()):
        name = names[i]
        small = "bath" in name.lower() or "wc" in name.lower()
        windows_out.append({
            "room": name,
            "width": min(gw, 60 if small else 240),
            "height": 60 if small else 120,
            "sill": 140 if small else 90,
        })
        debug_wins.append({"_cx": cx, "_cz": cz})

    if args.debug:
        debug_render(image, walls, debug_rooms, doors, debug_wins, frame, args.debug)
        warn(f"debug overlay -> {args.debug}")

    return {
        "w": round(max(r["x1"] for r in rooms_out)),
        "d": round(max(r["z1"] for r in rooms_out)),
        "rooms": rooms_out,
        "doors": doors_out,
        "windows": windows_out,
        "meta": {"source": "blueprint_cv", "scale_cm_per_px": round(scale, 4),
                 "wall_px": wall_px, "deskew_deg": round(angle, 2),
                 "warnings": NOTES[:]},
    }


# ------------------------------------------------------------------- server

def serve(port, base_args):
    """Local HTTP service so the 3dhome browser app can use this parser the
    same way it talks to Ollama. GET /health; POST /parse with raw image bytes
    (query: width_cm, ollama=<model> for hybrid labels, door_close_cm)."""
    from http.server import BaseHTTPRequestHandler, HTTPServer
    from urllib.parse import urlparse, parse_qs

    class Handler(BaseHTTPRequestHandler):
        def _send(self, code, payload):
            body = json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_GET(self):
            if urlparse(self.path).path == "/health":
                self._send(200, {"ok": True, "service": "blueprint_cv"})
            else:
                self._send(404, {"error": "unknown endpoint"})

        def do_POST(self):
            url = urlparse(self.path)
            if url.path != "/parse":
                self._send(404, {"error": "unknown endpoint"})
                return
            q = parse_qs(url.query)
            n = int(self.headers.get("Content-Length") or 0)
            data = self.rfile.read(n) if n else b""
            image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
            if image is None:
                self._send(422, {"error": "request body is not a decodable image"})
                return
            opt = argparse.Namespace(**vars(base_args))
            opt.debug = None
            try:
                if "width_cm" in q:
                    opt.width_cm = float(q["width_cm"][0])
                if "door_close_cm" in q:
                    opt.door_close_cm = float(q["door_close_cm"][0])
                model = q.get("ollama", [""])[0]
                opt.ollama = bool(model)
                if model:
                    opt.ollama_model = model
                layout = parse_image(image, opt)
            except (ParseError, ValueError) as e:
                self._send(422, {"error": str(e)})
                return
            except Exception as e:  # keep the server alive on surprises
                self._send(500, {"error": repr(e)})
                return
            self._send(200, layout)

        def log_message(self, fmt, *a):
            print(f"[blueprint_cv] {self.address_string()} {fmt % a}",
                  file=sys.stderr)

    print(f"[blueprint_cv] serving on http://localhost:{port} "
          "(POST /parse, GET /health) — Ctrl-C to stop", file=sys.stderr)
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()


# --------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description="Blueprint image -> 3dhome layout JSON")
    ap.add_argument("image", nargs="?", help="blueprint image (omit with --serve)")
    ap.add_argument("-o", "--out", default=None, help="output JSON (default stdout)")
    ap.add_argument("--width-cm", type=float, default=1000,
                    help="real outer width of the plan in cm (default 1000); "
                         "ignored if --scale is given")
    ap.add_argument("--scale", type=float, default=None, help="cm per pixel")
    ap.add_argument("--wall-px", type=int, default=None,
                    help="wall stroke thickness in px (default: auto)")
    ap.add_argument("--door-close-cm", type=float, default=55,
                    help="dilation radius used to seal door gaps (default 55; "
                         "lower it if narrow corridors disappear)")
    ap.add_argument("--min-room-m2", type=float, default=2.0)
    ap.add_argument("--debug", default=None, help="write detection overlay PNG")
    ap.add_argument("--ollama", action="store_true",
                    help="use local Ollama VLM to read room names (labels only)")
    ap.add_argument("--ollama-model", default="gemma4:12b-instruct-q8_0")
    ap.add_argument("--ollama-endpoint", default="http://localhost:11434")
    ap.add_argument("--serve", nargs="?", const=8077, type=int, default=None,
                    metavar="PORT",
                    help="run as a local HTTP service for the 3dhome app "
                         "(default port 8077) instead of parsing one file")
    args = ap.parse_args()

    if args.serve:
        serve(args.serve, args)
        return
    if not args.image:
        ap.error("an image is required unless --serve is given")

    image = cv2.imread(args.image, cv2.IMREAD_COLOR)
    if image is None:
        sys.exit(f"cannot read image: {args.image}")
    try:
        layout = parse_image(image, args)
    except ParseError as e:
        sys.exit(str(e))

    text = json.dumps(layout, indent=2, ensure_ascii=False)
    if args.out:
        with open(args.out, "w") as f:
            f.write(text + "\n")
        warn(f"layout -> {args.out}  ({len(layout['rooms'])} rooms, "
             f"{len(layout['doors'])} doors, {len(layout['windows'])} windows)")
    else:
        print(text)


if __name__ == "__main__":
    main()
