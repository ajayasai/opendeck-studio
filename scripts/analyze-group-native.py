"""Independent DrawingML frame-relayout calculation versus native PowerPoint pixels.

Uses only Python stdlib, Pillow and NumPy; no application transform helpers.
Pure red rectangular controls isolate orientation from fonts and antialiasing.
"""
from pathlib import Path
import json
import math
import zipfile
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
EVIDENCE = ROOT / "test-results/group-powerpoint"
NS = {"p": "http://schemas.openxmlformats.org/presentationml/2006/main", "a": "http://schemas.openxmlformats.org/drawingml/2006/main"}


def translation(x, y):
    return np.array([[1, 0, x], [0, 1, y], [0, 0, 1]], dtype=float)


def local(node, name):
    return next((n for n in node if n.tag.split("}")[-1] == name), None)


def geometry(node):
    kind = node.tag.split("}")[-1]
    props = local(node, "grpSpPr" if kind == "grpSp" else "spPr")
    xf = local(props, "xfrm") if props is not None else local(node, "xfrm")
    if xf is None:
        return None
    off, ext = local(xf, "off"), local(xf, "ext")
    return xf, [float(off.get("x", 0))/12700, float(off.get("y", 0))/12700, float(ext.get("cx", 0))/12700, float(ext.get("cy", 0))/12700]


def controls(node, parent=np.eye(3), frame=(0, 0, 1, 1)):
    result = []
    for child in node:
        kind = child.tag.split("}")[-1]
        if kind not in ["grpSp", "sp", "pic", "cxnSp", "graphicFrame"]:
            continue
        g = geometry(child)
        if g is None:
            continue
        xf, (x, y, w, h) = g
        ox, oy, sx, sy = frame
        degrees = float(xf.get("rot", 0))/60000
        swap = 45 <= degrees % 180 < 135
        center_x, center_y = (x+w/2-ox)*sx, (y+h/2-oy)*sy
        w, h = w*(sy if swap else sx), h*(sx if swap else sy)
        x, y = center_x-w/2, center_y-h/2
        angle = degrees*math.pi/180
        fx = -1 if xf.get("flipH") in ["1", "true"] else 1
        fy = -1 if xf.get("flipV") in ["1", "true"] else 1
        orthogonal = np.array([[math.cos(angle)*fx, -math.sin(angle)*fy, 0], [math.sin(angle)*fx, math.cos(angle)*fy, 0], [0, 0, 1]])
        matrix = parent @ translation(x+w/2, y+h/2) @ orthogonal @ translation(-w/2, -h/2)
        name = child.find(".//p:cNvPr", NS).get("name")
        if kind == "grpSp":
            origin, extent = local(xf, "chOff"), local(xf, "chExt")
            cw, ch = float(extent.get("cx", 0))/12700, float(extent.get("cy", 0))/12700
            result += controls(child, matrix, (float(origin.get("x", 0))/12700, float(origin.get("y", 0))/12700, w/cw if cw else 1, h/ch if ch else 1))
        elif "rotated rectangle" in name:
            center = matrix @ np.array([w/2, h/2, 1])
            direction = matrix[:2, 0]
            result.append({"name": name, "center": center[:2]*4/3, "width": w*4/3, "height": h*4/3, "angle": math.degrees(math.atan2(direction[1], direction[0])) % 180})
    return result


results = []
for prefix, source in [("original", "powerpoint-groups.pptx"), ("probe", "powerpoint-groups-probe.pptx"), ("exported", "powerpoint-groups.pptx"), ("probe-exported", "powerpoint-groups-probe.pptx")]:
    with zipfile.ZipFile(ROOT / "tests/fixtures" / source) as archive:
        for slide in range(1, 8):
            doc = ET.fromstring(archive.read(f"ppt/slides/slide{slide}.xml"))
            expected = controls(doc.find("p:cSld/p:spTree", NS))
            rgb = np.array(Image.open(EVIDENCE / f"{prefix}-slide-{slide}.png").convert("RGB"))
            py, px = np.where(np.all(rgb == [217, 76, 68], axis=2))
            pixels = np.column_stack((px, py))
            assignments = np.argmin(np.stack([np.linalg.norm(pixels-e["center"], axis=1) for e in expected]), axis=0)
            for index, e in enumerate(expected):
                p = pixels[assignments == index]
                eig, vectors = np.linalg.eigh(np.cov(p.T))
                edge = vectors[:, np.argmax(eig) if e["width"] >= e["height"] else np.argmin(eig)]
                measured_angle = math.degrees(math.atan2(edge[1], edge[0])) % 180
                angle_error = abs((measured_angle-e["angle"]+90) % 180-90)
                u = np.array([math.cos(math.radians(e["angle"])), math.sin(math.radians(e["angle"]))])
                v = np.array([-u[1], u[0]])
                width_error, height_error = abs(np.ptp(p@u)-e["width"]), abs(np.ptp(p@v)-e["height"])
                center_error = float(np.linalg.norm(p.mean(axis=0)-e["center"]))
                entry = {"prefix": prefix, "slide": slide, "name": e["name"], "expectedAngle": e["angle"], "measuredAngle": measured_angle, "angleError": angle_error, "centerErrorPx": center_error, "widthSpanErrorPx": width_error, "heightSpanErrorPx": height_error}
                entry["passed"] = bool(angle_error < .25 and center_error < 1.2 and width_error < 2.3 and height_error < 2.3)
                results.append(entry)

# Shifted coordinate origins must change no native pixels in these controls.
origin_checks = []
for slide, box in [(1, (0, 140, 420, 600)), (5, (0, 100, 1000, 700))]:
    a = np.array(Image.open(EVIDENCE / f"original-slide-{slide}.png").crop(box).convert("RGB"))
    b = np.array(Image.open(EVIDENCE / f"probe-slide-{slide}.png").crop(box).convert("RGB"))
    delta = int(np.abs(a.astype(int)-b.astype(int)).max())
    origin_checks.append({"slide": slide, "maxChannelDifference": delta, "passed": delta == 0})

report = {"passed": all(r["passed"] for r in results+origin_checks), "method": "Independent XML per-axis frame relayout before local rotation; no affine shear, application code, fonts, or browser screenshots used", "controls": len(results), "results": results, "shiftedOrigins": origin_checks}
(EVIDENCE / "native-pixel-check.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
print(json.dumps(report, indent=2))
if not report["passed"]:
    raise SystemExit("Native group pixel acceptance failed; inspect detailed evidence.")
