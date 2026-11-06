#!/usr/bin/env python3
"""Convert CC0 Poly Haven HDRIs into the game's sky assets.

For each sky this writes:
  <id>_env.hdr  1024x512 RGBE (RLE) used for image-based lighting
  <id>_bg.jpg   background image, encoded v = (xE/(1+xE))^(1/2.2); the sky shader decodes it
and a manifest.json with the sun direction/colour extracted from the HDRI.

Usage: python3 tools/process_sky.py <download_dir> <out_dir>
Sources (all CC0, polyhaven.com):
  overcast  aristea_wreck_puresky_2k.hdr  (raw.githubusercontent.com/gkjohnson/3d-demo-data/master/hdri/)
  golden    syferfontein_18d_clear_2k.hdr (raw.githubusercontent.com/google/filament/main/third_party/environments/)
  dawn      kiara_1_dawn_1k.hdr           (raw.githubusercontent.com/pmndrs/drei-assets/master/hdri/)
  sunset    quarry_01_1k.hdr              (raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/equirectangular/)
  noon      noon_grass_2k.hdr             (raw.githubusercontent.com/google/filament/main/third_party/environments/)
"""
import sys, json, math, os
import numpy as np
from PIL import Image

SKIES = {
    'overcast': 'aristea_wreck_puresky_2k.hdr',
    'golden': 'syferfontein_18d_clear_2k.hdr',
    'dawn': 'kiara_1_dawn_1k.hdr',
    'sunset': 'quarry_01_1k.hdr',
    'noon': 'noon_grass_2k.hdr',
}

def read_hdr(path):
    data = open(path, 'rb').read()
    pos = 0
    while True:
        end = data.index(b'\n', pos); line = data[pos:end]; pos = end + 1
        if line.startswith(b'-Y') or line.startswith(b'+Y'):
            parts = line.split(); H = int(parts[1]); W = int(parts[3]); break
    img = np.zeros((H, W, 4), dtype=np.uint8)
    for y in range(H):
        if data[pos] == 2 and data[pos + 1] == 2:
            pos += 4
            for c in range(4):
                x = 0; row = img[y, :, c]
                while x < W:
                    n = data[pos]; pos += 1
                    if n > 128:
                        n -= 128; row[x:x + n] = data[pos]; pos += 1
                    else:
                        row[x:x + n] = np.frombuffer(data[pos:pos + n], dtype=np.uint8); pos += n
                    x += n
        else:
            img[y] = np.frombuffer(data[pos:pos + W * 4], dtype=np.uint8).reshape(W, 4); pos += W * 4
    rgbe = img.astype(np.float64)
    e = rgbe[..., 3]
    scale = np.where(e > 0, np.ldexp(1.0, (e - 136).astype(np.int32)), 0.0)
    return rgbe[..., :3] * scale[..., None]

def to_rgbe(hdr):
    m = hdr.max(axis=2)
    mant, ex = np.frexp(m)
    valid = m > 1e-32
    sc = np.where(valid, mant * 256.0 / np.maximum(m, 1e-32), 0.0)
    out = np.zeros(hdr.shape[:2] + (4,), dtype=np.uint8)
    out[..., :3] = np.clip(hdr * sc[..., None], 0, 255).astype(np.uint8)
    out[..., 3] = np.where(valid, ex + 128, 0).astype(np.uint8)
    return out

def write_hdr(path, hdr):
    H, W, _ = hdr.shape
    rgbe = to_rgbe(hdr)
    buf = bytearray()
    buf += b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n'
    buf += ('-Y %d +X %d\n' % (H, W)).encode()
    for y in range(H):
        buf += bytes([2, 2, (W >> 8) & 255, W & 255])
        for c in range(4):
            row = rgbe[y, :, c]
            x = 0
            while x < W:
                # run?
                run = 1
                while x + run < W and run < 127 and row[x + run] == row[x]:
                    run += 1
                if run >= 4:
                    buf += bytes([128 + run, int(row[x])]); x += run; continue
                # literal
                start = x; x += 1
                while x < W and x - start < 128:
                    if x + 3 < W and row[x] == row[x + 1] == row[x + 2] == row[x + 3]:
                        break
                    x += 1
                buf += bytes([x - start]) + bytes(row[start:x].astype(np.uint8))
    open(path, 'wb').write(bytes(buf))

def downsample(hdr, W, H):
    h0, w0, _ = hdr.shape
    if w0 == W:
        return hdr
    fy, fx = h0 // H, w0 // W
    return hdr.reshape(H, fy, W, fx, 3).mean(axis=(1, 3))

def main():
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    manifest = {}
    for sid, fn in SKIES.items():
        hdr = read_hdr(os.path.join(src, fn))
        H, W, _ = hdr.shape
        lum = hdr @ np.array([0.2126, 0.7152, 0.0722])
        # sun: brightest pixel, refined by centroid of pixels above 60% of max
        iy, ix = np.unravel_index(np.argmax(lum), lum.shape)
        thr = lum.max() * 0.6
        ys, xs = np.where(lum >= thr)
        # handle wrap around in x by centring on ix
        dx = ((xs - ix + W / 2) % W) - W / 2
        cx = ix + dx.mean(); cy = ys.mean()
        u = (cx + 0.5) / W; v = 1.0 - (cy + 0.5) / H
        el = (v - 0.5) * math.pi; ph = (u - 0.5) * 2 * math.pi
        sun = [math.cos(el) * math.cos(ph), math.sin(el), math.cos(el) * math.sin(ph)]
        # sun colour from a ring around the disc (the disc itself is often clipped/white)
        yy, xx = np.mgrid[0:H, 0:W]
        ddx = ((xx - cx + W / 2) % W) - W / 2
        dist = np.sqrt(ddx ** 2 + (yy - cy) ** 2)
        ring = (dist > W * 0.004) & (dist < W * 0.02)
        col = hdr[ring].mean(axis=0)
        col = col / max(col.max(), 1e-6)
        upper = hdr[: H // 2]
        sky_mean = upper.reshape(-1, 3).mean(axis=0)
        sky_lum = float(np.dot(sky_mean, [0.2126, 0.7152, 0.0722]))
        # median luminance of the upper hemisphere, robust against the sun
        med = float(np.median(lum[: H // 2]))
        # environment map: 1024x512, sun clamped so the directional light carries it
        env = downsample(hdr, 1024, 512)
        elum = env @ np.array([0.2126, 0.7152, 0.0722])
        cap = med * 12.0
        k = np.where(elum > cap, cap / np.maximum(elum, 1e-9), 1.0)
        env_c = env * k[..., None]
        write_hdr(os.path.join(out, sid + '_env.hdr'), env_c.astype(np.float64))
        # background: native res up to 2048, invertible tone curve
        bw = min(W, 2048); bh = bw // 2
        bg = downsample(hdr, bw, bh)
        E = 0.5 / max(med, 1e-6)
        x = bg * E
        enc = (x / (1.0 + x)) ** (1 / 2.2)
        Image.fromarray(np.clip(enc * 255 + 0.5, 0, 255).astype(np.uint8)).save(
            os.path.join(out, sid + '_bg.jpg'), quality=93, subsampling=0)
        manifest[sid] = {
            'source': fn,
            'sunDir': [round(c, 5) for c in sun],
            'sunElevationDeg': round(math.degrees(el), 2),
            'sunAzimuthDeg': round(math.degrees(ph), 2),
            'sunColor': [round(float(c), 4) for c in col],
            'bgExposure': E,
            'skyMedian': med,
            'skyMean': sky_lum,
            'envCap': cap,
            'bgSize': [bw, bh],
        }
        print(sid, manifest[sid])
    json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), indent=2)

if __name__ == '__main__':
    main()
