"""Independent grouped automatic-fit/legacy-EXIF pixel acceptance.
Uses original encoded raster pixels, direct EXIF coordinate permutations and
per-axis group frame relayout. No application transform or image helpers.
Requires Pillow and NumPy. Evidence stays ignored.
"""
from pathlib import Path
from io import BytesIO
from math import sin, cos, pi, floor, ceil
import base64
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-results/group-powerpoint"
deck = json.loads((OUT / "editor-authored.opendeck").read_text())


def translation(x, y):
    return np.array([[1, 0, x], [0, 1, y], [0, 0, 1]], dtype=float)


def pictures(nodes, matrix=np.eye(3), frame=(0, 0, 1, 1)):
    out = []
    for e in nodes:
        ox, oy, sx, sy = frame
        swap = 45 <= e["rotation"] % 180 < 135
        cx, cy = (e["x"]+e["width"]/2-ox)*sx, (e["y"]+e["height"]/2-oy)*sy
        w, h = e["width"]*(sy if swap else sx), e["height"]*(sx if swap else sy)
        x, y = cx-w/2, cy-h/2
        a = e["rotation"]*pi/180
        fx, fy = (-1 if e.get("flipH") else 1), (-1 if e.get("flipV") else 1)
        rotation = np.array([[cos(a)*fx, -sin(a)*fy, 0], [sin(a)*fx, cos(a)*fy, 0], [0, 0, 1]])
        transform = matrix @ translation(x+w/2, y+h/2) @ rotation @ translation(-w/2, -h/2)
        if e["type"] == "group":
            f = e["childFrame"]
            out += pictures(e["children"], transform, (f["x"], f["y"], w/f["width"] if f["width"] else 1, h/f["height"] if f["height"] else 1))
        elif e["type"] == "image":
            out.append((e, w, h, transform))
    return out


def rectangle(r):
    return {k: (r or {}).get(k, 0) for k in ["left", "top", "right", "bottom"]}


def encoded(u, v, o):
    return {1: (u, v), 2: (1-u, v), 3: (1-u, 1-v), 4: (u, 1-v), 5: (v, u), 6: (v, 1-u), 7: (1-v, 1-u), 8: (1-v, u)}.get(o, (u, v))


def sample(im, x, y):
    x = max(0, min(im.width-1, x)); y = max(0, min(im.height-1, y))
    x0, y0 = floor(x), floor(y); tx, ty = x-x0, y-y0
    return [sum(im.getpixel(p)[k]*weight for p, weight in [((x0, y0), (1-tx)*(1-ty)), ((min(im.width-1, x0+1), y0), tx*(1-ty)), ((x0, min(im.height-1, y0+1)), (1-tx)*ty), ((min(im.width-1, x0+1), min(im.height-1, y0+1)), tx*ty)]) for k in range(4)]


results = []
for index, slide in enumerate(deck["slides"], 1):
    native = Image.open(OUT / f"editor-authored-slide-{index}.png").convert("RGB")
    background = tuple(int(slide["background"].lstrip("#")[i:i+2], 16) for i in [0, 2, 4])
    for e, w, h, matrix in pictures(slide["elements"]):
        original = Image.open(BytesIO(base64.b64decode(e["src"].split(",")[1])))
        orientation = original.getexif().get(274, 1) if e.get("orientation") != "encoded" else 1
        source = original.convert("RGBA"); original.close()
        naturalW, naturalH = (source.height, source.width) if orientation >= 5 else source.size
        crop, fill = rectangle(e.get("crop")), rectangle(e.get("fillRect"))
        if "crop" in e or "fillRect" in e or e["fit"] == "stretch":
            destX, destY = w*fill["left"], h*fill["top"]
            destW, destH = w*(1-fill["left"]-fill["right"]), h*(1-fill["top"]-fill["bottom"])
            imageW, imageH = destW/(1-crop["left"]-crop["right"]), destH/(1-crop["top"]-crop["bottom"])
            imageX, imageY = destX-crop["left"]*imageW, destY-crop["top"]*imageH
        else:
            scale = (min if e["fit"] == "contain" else max)(w/naturalW, h/naturalH)
            imageW, imageH = naturalW*scale, naturalH*scale
            imageX, imageY = (w-imageW)/2, (h-imageH)/2
            destX = destY = 0; destW, destH = w, h
        inverse = np.linalg.inv(matrix)
        points = []
        excluded_edges = []
        for u in [.08, .21, .36, .63, .79, .92]:
            for v in [.18, .38, .68, .88]:
                pos = matrix @ np.array([w*u, h*v, 1]); px, py = round(pos[0]), round(pos[1])
                if not (0 <= px < native.width and 0 <= py < native.height):
                    continue
                lx, ly, _ = inverse @ np.array([px+.5, py+.5, 1])
                du, dv = (lx-imageX)/imageW, (ly-imageY)/imageH
                # Binary inside/outside math does not model partial pixel coverage.
                # Record, rather than test, points within 1.5px of a clipping edge.
                edge_distance = min(abs(lx-destX), abs(lx-destX-destW), abs(ly-destY), abs(ly-destY-destH), abs(du*imageW), abs((1-du)*imageW), abs(dv*imageH), abs((1-dv)*imageH))
                if edge_distance < 1.5:
                    excluded_edges.append({"local": [u, v], "pixel": [px, py], "edgeDistancePx": float(edge_distance)})
                    continue
                if not (destX <= lx <= destX+destW and destY <= ly <= destY+destH and 0 <= du <= 1 and 0 <= dv <= 1):
                    expected = list(background)
                else:
                    su, sv = encoded(du, dv, orientation)
                    ix, iy = round(su*source.width-.5), round(sv*source.height-.5)
                    radius = max(3, ceil(max(naturalW/imageW, naturalH/imageH)*3))
                    if not (radius <= ix < source.width-radius and radius <= iy < source.height-radius):
                        continue
                    region = [source.getpixel((ix+a, iy+b)) for a in range(-radius, radius+1) for b in range(-radius, radius+1)]
                    if max(max(p[k] for p in region)-min(p[k] for p in region) for k in [2, 3]) > 8:
                        continue
                    rgba = sample(source, su*source.width-.5, sv*source.height-.5); alpha = rgba[3]/255*e["opacity"]
                    expected = [round(rgba[k]*alpha+background[k]*(1-alpha)) for k in range(3)]
                actual = list(native.getpixel((px, py))); error = max(abs(a-b) for a, b in zip(actual, expected))
                points.append({"local": [u, v], "pixel": [px, py], "expected": expected, "native": actual, "maxChannelError": error})
        error = max(p["maxChannelError"] for p in points)
        results.append({"slide": index, "name": e["name"], "orientation": orientation, "fit": e["fit"], "effectiveSize": [w, h], "samples": points, "excludedEdgeSamples": excluded_edges, "maxChannelError": error, "passed": error <= 5})
        source.close()
    native.close()
report = {"passed": all(r["passed"] for r in results), "pictures": len(results), "samples": sum(len(r["samples"]) for r in results), "excludedEdgeSamples": sum(len(r["excludedEdgeSamples"]) for r in results), "maxChannelError": max(r["maxChannelError"] for r in results), "results": results}
(OUT / "editor-pixel-measurements.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
print(json.dumps({k: v for k, v in report.items() if k != "results"}))
if not report["passed"]:
    raise SystemExit("Grouped fit/EXIF native pixels disagree; inspect measurement report.")
