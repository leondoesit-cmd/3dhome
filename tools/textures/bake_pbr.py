"""Bake Codex source textures into tiling PBR sets for assets/materials/.

    blender -b --factory-startup -P tools/textures/bake_pbr.py -- [--no-thumb] [--skip-existing] [--part i/n] [id ...]

--skip-existing leaves ids whose full file set is already there; --part 2/3
bakes every third id starting at the second, so n Blender processes can split
one batch without overlapping.

Reads tools/textures/src/<id>.png and the catalogue (js/material_library.js,
parsed for the fields below), then writes
    assets/materials/<id>/color_{2k,1k}.webp   sRGB albedo, seamless
    assets/materials/<id>/normal_{2k,1k}.webp  tangent normal, OpenGL (+Y up)
    assets/materials/<id>/orm_1k.webp          R=AO, G=roughness, B=metalness (1k only)
    assets/materials/<id>/thumb.webp           256 px EEVEE material ball

Everything that touches pixels wraps around the edges (np.roll / FFT), so the
outputs tile exactly. Ids default to every source PNG present.
"""
import json
import math
import os
import re
import sys

import functools

import bpy
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "tools", "textures", "src")
OUT = os.path.join(ROOT, "assets", "materials")
TIERS = (("2k", 2048), ("1k", 1024))
THUMB = 256
QUALITY = 82
# normal-map strength per kind: how many height units one pixel of slope is
NORMAL_STRENGTH = {"opaque": 6.0, "fabric": 8.0, "clearcoat": 2.5, "polished": 0.25, "metal": 3.0, "glass": 4.0}


# ---------------------------------------------------------------- catalogue
def load_catalogue():
    """Parse the M()/G()/F()/D()/U() rows of js/material_library.js."""
    src = open(os.path.join(ROOT, "js", "material_library.js"), encoding="utf-8").read()
    rows = {}
    pat = re.compile(r'^\s*([GFDU])\("([^"]+)",\s*"((?:[^"\\]|\\.)*)",\s*(\d+),\s*\[([\d.]+),\s*([\d.]+)\](?:,\s*([\d.]+))?(?:,\s*"(\w+)")?\)', re.M)
    for m in pat.finditer(src):
        kind_fn, key, subject, size, r0, r1, metal, kind = m.groups()
        mid = {"G": key, "U": key, "F": "floor_" + key, "D": "detail_" + key}[kind_fn]
        rows[mid] = {
            "id": mid, "subject": subject, "sizeCm": int(size), "rough": (float(r0), float(r1)),
            "metal": float(metal or 0), "kind": kind or "opaque", "tint": kind_fn == "D",
        }
    return rows


# ---------------------------------------------------------------- image io
def load_rgb(path):
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = "Non-Color"  # raw stored values, no transform
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[:, :, :3].copy()


def save_webp(arr, path):
    """arr: (h, w, 3) float 0..1, rows bottom-up (Blender order)."""
    h, w, _ = arr.shape
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(arr, 0.0, 1.0)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = path
    img.file_format = "WEBP"
    img.save(filepath=path, quality=QUALITY)
    bpy.data.images.remove(img)


# ---------------------------------------------------------------- seamless
def center_square(a):
    h, w, _ = a.shape
    s = min(h, w)
    y0, x0 = (h - s) // 2, (w - s) // 2
    return a[y0:y0 + s, x0:x0 + s]


def min_cut_path(cost):
    """Lowest-cost top-to-bottom path through cost (rows, cols): col per row."""
    rows, cols = cost.shape
    acc = cost.copy()
    back = np.zeros((rows, cols), dtype=np.int64)
    idx = np.arange(cols)
    for r in range(1, rows):
        prev = acc[r - 1]
        left = np.concatenate(([np.inf], prev[:-1]))
        right = np.concatenate((prev[1:], [np.inf]))
        stack = np.stack((left, prev, right))
        choice = np.argmin(stack, axis=0)
        acc[r] += stack[choice, idx]
        back[r] = idx + choice - 1
    path = np.empty(rows, dtype=np.int64)
    path[-1] = int(np.argmin(acc[-1]))
    for r in range(rows - 1, 0, -1):
        path[r - 1] = back[r, path[r]]
    return path


def seam_x(a, band_frac=0.14, feather=6):
    """Make `a` tile horizontally. B = a rolled by half a width tiles across
    the border; near the border we switch from a to B along two minimum-error
    vertical cuts, so structure (plank joints, grout) is cut rather than
    ghosted. Returns the patched image."""
    h, w, _ = a.shape
    half = w // 2
    b = np.roll(a, half, axis=1)
    band = max(8, int(w * band_frac))
    err = ((a - b) ** 2).sum(axis=2)
    mask = np.zeros((h, w), dtype=np.float32)  # 1 → use b
    # strip around the wrap: columns w-band..w-1 then 0..band-1
    cols = np.concatenate((np.arange(w - band, w), np.arange(0, band)))
    strip = err[:, cols]
    left_cut = min_cut_path(strip[:, :band])          # a → b, right side of image
    right_cut = min_cut_path(strip[:, band:]) + band   # b → a, left side of image
    j = np.arange(2 * band)[None, :]
    lc = left_cut[:, None].astype(np.float32)
    rc = right_cut[:, None].astype(np.float32)
    mask[:, cols] = ((j >= lc) & (j <= rc)).astype(np.float32)
    # two-band blend: fine detail switches sharply at the cut (no ghosting),
    # tone and broad structure (marble veins, clouds) fade over a wide band so
    # a cut through mismatched areas does not read as a straight line
    sharp = blur_periodic(mask, feather * 0.35)[:, :, None]
    wide = blur_periodic(mask, max(feather * 4.0, band * 0.35))[:, :, None]
    sigma = max(4.0, w / 160.0)
    lo_a = np.dstack([blur_periodic(a[:, :, c], sigma) for c in range(3)])
    lo_b = np.dstack([blur_periodic(b[:, :, c], sigma) for c in range(3)])
    low = lo_a * (1 - wide) + lo_b * wide
    high = (a - lo_a) * (1 - sharp) + (b - lo_b) * sharp
    return low + high


def make_seamless(a):
    a = seam_x(a)
    a = np.transpose(seam_x(np.transpose(a, (1, 0, 2))), (1, 0, 2))
    return a


# ---------------------------------------------------------------- resample
@functools.lru_cache(maxsize=None)
def lanczos_matrix(n_in, n_out, a=3):
    """(n_out, n_in) periodic Lanczos-a resampling weights."""
    scale = n_in / n_out
    support = a * max(1.0, scale)
    W = np.zeros((n_out, n_in), dtype=np.float64)
    for o in range(n_out):
        center = (o + 0.5) * scale - 0.5
        lo, hi = int(math.floor(center - support)), int(math.ceil(center + support))
        taps = np.arange(lo, hi + 1)
        x = (taps - center) / max(1.0, scale)
        k = np.sinc(x) * np.sinc(x / a)
        k[np.abs(x) >= a] = 0
        k /= k.sum()
        np.add.at(W[o], taps % n_in, k)
    return W.astype(np.float32)


def resize_periodic(img, n):
    h, w, c = img.shape
    Wy, Wx = lanczos_matrix(h, n), lanczos_matrix(w, n)
    out = np.empty((n, n, c), dtype=np.float32)
    for ch in range(c):
        out[:, :, ch] = Wy @ img[:, :, ch] @ Wx.T
    return np.clip(out, 0, 1)


# ---------------------------------------------------------------- derived maps
def blur_periodic(x, sigma):
    """Gaussian blur with wrap-around via FFT."""
    h, w = x.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (math.pi ** 2) * (sigma ** 2) * (fx ** 2 + fy ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(x) * g)).astype(np.float32)


def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def derived_maps(color, entry):
    n = color.shape[0]
    lum = (srgb_to_linear(color) * np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)).sum(axis=2)
    px_per_cm = n / float(entry["sizeCm"])
    # height: band-pass of luminance — fine detail kept, lighting gradients and
    # colour fields (a dark plank next to a light one) mostly removed
    fine = blur_periodic(lum, 0.6 * n / 1024)
    broad = blur_periodic(lum, max(2.0, 1.5 * px_per_cm))
    height = fine - broad
    lo, hi = np.percentile(height, (1, 99))
    height = np.clip((height - lo) / max(1e-6, hi - lo), 0, 1)

    s = NORMAL_STRENGTH.get(entry["kind"], 3.0) * (n / 1024.0)
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5 * s
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5 * s  # rows bottom-up → +Y up
    nz = np.ones_like(height)
    length = np.sqrt(dx * dx + dy * dy + nz * nz)
    normal = np.stack((-dx / length, -dy / length, nz / length), axis=2) * 0.5 + 0.5

    # AO from cavities: how far a pixel sits below its neighbourhood
    cavity = np.clip(blur_periodic(height, 3.0 * n / 1024) - height, 0, 1)
    ao = np.clip(1.0 - 2.2 * cavity, 0.55, 1.0)
    if entry["kind"] == "polished":  # a vein is colour, not a cavity
        ao = np.ones_like(ao)
    # roughness inside the catalogue range: grooves and darker patches rougher
    r0, r1 = entry["rough"]
    lum_n = lum / max(1e-6, float(np.percentile(lum, 99)))
    t = np.clip(0.55 * (1 - np.clip(lum_n, 0, 1)) + 0.45 * (1 - height), 0, 1)
    rough = r0 + (r1 - r0) * t
    metal = np.full_like(height, entry["metal"])
    orm = np.stack((ao, rough, metal), axis=2)
    return normal.astype(np.float32), orm.astype(np.float32)


# ---------------------------------------------------------------- thumbnail
def render_thumb(entry, folder):
    scene = bpy.context.scene
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = scene.render.resolution_y = THUMB
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = 85
    scene.view_settings.view_transform = "AgX"

    world = bpy.data.worlds.new("thumb") if not scene.world else scene.world
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.57, 0.6, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.35

    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1)
    ball = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    mat = bpy.data.materials.new("ball")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]

    def tex(name, non_color):
        node = nt.nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(os.path.join(folder, name), check_existing=False)
        if non_color:
            node.image.colorspace_settings.name = "Non-Color"
        return node

    mapping = nt.nodes.new("ShaderNodeMapping")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"])
    reps = max(1.0, min(4.0, 300.0 / entry["sizeCm"]))  # ball ≈ 1.5 m round
    mapping.inputs["Scale"].default_value = (reps * 2, reps, 1)
    col = tex("color_1k.webp", False)
    nrm = tex("normal_1k.webp", True)
    orm = tex("orm_1k.webp", True)
    for node in (col, nrm, orm):
        nt.links.new(mapping.outputs["Vector"], node.inputs["Vector"])
    nt.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(orm.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(nrm.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if entry["kind"] in ("clearcoat", "polished"):
        bsdf.inputs["Coat Weight"].default_value = 0.6
        bsdf.inputs["Coat Roughness"].default_value = 0.05
    ball.data.materials.append(mat)

    bpy.ops.object.light_add(type="AREA", location=(2.5, -2.5, 3.5))
    key = bpy.context.active_object
    key.data.energy = 220
    key.data.size = 3
    key.rotation_euler = (math.radians(45), 0, math.radians(45))
    bpy.ops.object.light_add(type="AREA", location=(-3, -1, 1))
    fill = bpy.context.active_object
    fill.data.energy = 60
    fill.data.size = 4
    fill.rotation_euler = (math.radians(80), 0, math.radians(-70))

    bpy.ops.object.camera_add(location=(0, -4.2, 1.4))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(72), 0, 0)
    cam.data.lens = 70
    scene.camera = cam
    scene.render.filepath = os.path.join(folder, "thumb.webp")
    bpy.ops.render.render(write_still=True)


def neutralize(a, mean=0.86, contrast=1.0):
    """Tintable detail multiplies the part's colour (primitives.js applyDetail),
    so it must be grey and close to white: keep the luminance pattern, drop the
    hue, and lift it so the average sits at `mean` with the darkest grooves at
    roughly 60% — otherwise every tinted sofa comes out a shade darker."""
    lum = (a * np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)).sum(axis=2)
    lo, hi = np.percentile(lum, (1, 99))
    t = np.clip((lum - lo) / max(1e-6, hi - lo), 0, 1)
    g = np.clip(mean + (t - 0.5) * 0.4 * contrast, 0, 1)
    return np.repeat(g[:, :, None], 3, axis=2).astype(np.float32)


# ---------------------------------------------------------------- main
def bake(entry, thumb=True):
    src = os.path.join(SRC, entry["id"] + ".png")
    folder = os.path.join(OUT, entry["id"])
    os.makedirs(folder, exist_ok=True)
    base = make_seamless(center_square(load_rgb(src)))
    if entry["tint"]:
        base = neutralize(base)
    for tier, size in TIERS:
        color = resize_periodic(base, size)
        normal, orm = derived_maps(color, entry)
        save_webp(color, os.path.join(folder, "color_%s.webp" % tier))
        save_webp(normal, os.path.join(folder, "normal_%s.webp" % tier))
        if tier == "1k":  # roughness/AO read fine at 1k; 2k would cost ~22 MB of VRAM per material for nothing
            save_webp(orm, os.path.join(folder, "orm_%s.webp" % tier))
    if thumb:
        render_thumb(entry, folder)


def complete(mid):
    folder = os.path.join(OUT, mid)
    names = ["color_2k.webp", "color_1k.webp", "normal_2k.webp", "normal_1k.webp", "orm_1k.webp", "thumb.webp"]
    return all(os.path.exists(os.path.join(folder, n)) for n in names)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    thumb = "--no-thumb" not in argv
    skip = "--skip-existing" in argv
    part = None
    if "--part" in argv:
        k, n = argv[argv.index("--part") + 1].split("/")
        part = (int(k) - 1, int(n))
    ids = [a for i, a in enumerate(argv) if not a.startswith("--") and (i == 0 or argv[i - 1] != "--part")]
    cat = load_catalogue()
    if not ids:
        ids = sorted(f[:-4] for f in os.listdir(SRC) if f.endswith(".png"))
    if part:
        ids = ids[part[0]::part[1]]
    report = {"ok": [], "missing": [], "unknown": [], "failed": {}, "skipped": []}
    for mid in ids:
        if skip and complete(mid):
            report["skipped"].append(mid)
            continue
        if mid not in cat:
            report["unknown"].append(mid)
            continue
        if not os.path.exists(os.path.join(SRC, mid + ".png")):
            report["missing"].append(mid)
            continue
        try:
            bake(cat[mid], thumb)
            report["ok"].append(mid)
            print("BAKE ok", mid, flush=True)
        except Exception as e:  # keep going; one bad source must not stop the batch
            report["failed"][mid] = repr(e)
            print("BAKE FAIL", mid, repr(e), flush=True)
    print("BAKE REPORT " + json.dumps(report), flush=True)


main()
