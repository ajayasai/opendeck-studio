"""Read project-native PNGs and record independent gradient pixel controls.

Requires Pillow. Run after verify-gradients-with-powerpoint.ps1. This does not
edit images or fixtures; its JSON output remains in ignored test-results.
"""
from pathlib import Path
from hashlib import sha256
from math import cos, sin, sqrt, hypot, pi
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "test-results/gradient-powerpoint"
images = {}


def sample(prefix, slide, x, y):
    path = EVIDENCE / f"{prefix}-slide-{slide}.png"
    if path not in images:
        images[path] = Image.open(path).convert("RGB")
    # Native 960x540pt slide was exported at 1280x720 pixels.
    pixel = (round(x * 4 / 3), round(y * 4 / 3))
    return {"pixel": pixel, "rgb": images[path].getpixel(pixel)}


def ramp_position(rgb):
    # The three distinct red/green/blue stops disable special endpoint gamma.
    red, _, blue = rgb
    return (1 - red / 255) / 2 if red > blue else (1 + blue / 255) / 2


def focal_position(px, py, fx, fy, width=270, height=105):
    cx, cy = width / 2, height / 2
    radius = hypot(width, height) / 2
    dx, dy = px - fx, py - fy
    a = dx * dx + dy * dy
    if a < 1e-12:
        return 0
    b = 2 * ((fx - cx) * dx + (fy - cy) * dy)
    c = (fx - cx) ** 2 + (fy - cy) ** 2 - radius ** 2
    intersection_scale = (-b + sqrt(b * b - 4 * a * c)) / (2 * a)
    return 1 / intersection_scale


results = {
    "method": "Read-only native PNG pixel sampling. Three distinct stops allow color-to-gradient-position inversion; errors include raster coordinate rounding.",
    "sourceSha256": {
        name: sha256((ROOT / "tests/fixtures" / name).read_bytes()).hexdigest()
        for name in ["powerpoint-gradients.pptx", "powerpoint-gradient-probe.pptx"]
    },
    "interpolation": [],
    "circleFocus": [],
    "rotation": [],
    "scaledLinearDirection": [],
    "defaults": [],
}
for index, name in enumerate([
    "Two endpoint black white", "Two endpoint red blue", "Two stops last99percent",
    "Three symmetric stops", "Four linear stops", "Two stops alpha",
]):
    points = []
    for position in [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]:
        value = sample("original", 2, 40 + 880 * position, 100 + index * 72 + 21)
        points.append({"position": position, **value})
    results["interpolation"].append({"name": name, "samples": points})

coordinates = [(0.5, 0.5), (0.5, 0.1), (0.1, 0.5), (0.25, 0.25), (0.75, 0.75)]
for name, x, y, scaled in [("scaled false30",40,105,False),("scaled true30",510,105,True),("scaled absent30",40,245,False)]:
    points=[]
    for v in [0.2,0.5,0.8]:
        width,height=410,100
        # Locate the intentionally repeated40% hard edge in the native bitmap.
        path = EVIDENCE / "probe-slide-1.png"
        if path not in images:
            images[path] = Image.open(path).convert("RGB")
        image = images[path]
        first_blue=next(px for px in range(round(x*4/3),round((x+width)*4/3)) if image.getpixel((px,round((y+height*v)*4/3)))[2]>100 and image.getpixel((px,round((y+height*v)*4/3)))[0]<100)
        measured=(first_blue*3/4-x)/width
        slope=sin(pi/6)/cos(pi/6)*(1 if scaled else height/width)
        expected=0.4+slope*(0.4-v)
        points.append({"v":v,"nativeBoundaryU":measured,"predictedBoundaryU":expected,"error":measured-expected})
    assert max(abs(point["error"]) for point in points)<0.004
    results["scaledLinearDirection"].append({"name":name,"samples":points})

for index, name, fx, fy in [
    (1, "circle center", 135, 52.5),
    (4, "circle left focus", 0, 52.5),
    (7, "circle offset area", 40.5 + 81 * 40.5 / (270 - 81), 26.25 + 26.25 * 26.25 / (105 - 26.25)),
]:
    points = []
    for u, v in coordinates:
        value = sample("probe", 10, 40 + index % 3 * 305 + 270 * u, 105 + index // 3 * 140 + 105 * v)
        native = ramp_position(value["rgb"])
        expected = focal_position(270 * u, 105 * v, fx, fy)
        points.append({"uv": [u, v], **value, "nativePosition": native, "pointFocalPosition": expected, "error": native - expected})
    assert max(abs(point["error"]) for point in points) < 0.006, name
    results["circleFocus"].append({"name": name, "focusPoint": [fx, fy], "samples": points})

for index in range(6):
    column, row = index % 3, index // 3
    angle = [0, 30, 90][column] * pi / 180
    width, height = 200, 105
    bounds_width = abs(width * cos(angle)) + abs(height * sin(angle))
    bounds_height = abs(width * sin(angle)) + abs(height * cos(angle))
    points = []
    for u, v in [(0.25, 0.5), (0.75, 0.5), (0.5, 0.25), (0.5, 0.75)]:
        dx, dy = width * (u - 0.5), height * (v - 0.5)
        world_dx = cos(angle) * dx - sin(angle) * dy
        world_dy = sin(angle) * dx + cos(angle) * dy
        value = sample("original", 5, 75 + column * 305 + width / 2 + world_dx, 145 + row * 230 + height / 2 + world_dy)
        expected = (u + v) / 2 if row == 0 else 0.5 + world_dx / (2 * bounds_width) + world_dy / (2 * bounds_height)
        native = ramp_position(value["rgb"])
        points.append({"uv": [u, v], **value, "nativePosition": native, "predictedPosition": expected, "error": native - expected})
    assert max(abs(point["error"]) for point in points) < 0.006
    results["rotation"].append({"rotationDegrees": round(angle * 180 / pi), "rotateWithShape": row == 0, "samples": points})

for name, slide, x, y, width, height in [
    ("absent stop list", 2, 40, 100, 880, 43),
    ("rect absent focus", 4, 40, 110, 410, 100),
    ("rect empty focus", 4, 510, 110, 410, 100),
    ("circle absent focus", 11, 40, 385, 270, 105),
    ("circle empty focus", 11, 345, 385, 270, 105),
]:
    results["defaults"].append({"name": name, "samples": [{"uv": [u, v], **sample("probe", slide, x + width * u, y + height * v)} for u, v in coordinates]})

results["renderSha256"] = {path.name: sha256(path.read_bytes()).hexdigest() for path in images}
(EVIDENCE / "pixel-measurements.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
for image in images.values():
    image.close()
print("Recorded native interpolation, circle-focus, rotation and default controls; point-focus and rotation assertions passed.")
