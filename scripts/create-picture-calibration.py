"""Create original, coordinate-encoded raster inputs for picture geometry tests.

This draws new project graphics from scratch; it does not edit external images.
Requires Pillow. Outputs contain no EXIF, profile, username, or external assets.
"""
from pathlib import Path
from hashlib import sha256
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
out = root / "tests/fixtures"
out.mkdir(parents=True, exist_ok=True)
width, height = 800, 400
font = ImageFont.load_default(size=24)
large = ImageFont.load_default(size=38)
for transparent in [False, True]:
    image = Image.new("RGBA", (width, height))
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            blue = (60 if x < 400 else 130) if y < 200 else (190 if x < 400 else 240)
            alpha = 0 if transparent and x < 100 and y < 100 else 128 if transparent and x >= 600 else 255
            pixels[x, y] = (round(255*x/(width-1)), round(255*y/(height-1)), blue, alpha)
    draw = ImageDraw.Draw(image)
    for x in range(0, width, 100):
        draw.line((x, 0, x, height-1), fill=(255,255,255,255), width=2)
    for y in range(0, height, 100):
        draw.line((0, y, width-1, y), fill=(255,255,255,255), width=2)
    for row in range(4):
        for column in range(8):
            x,y=column*100+7,row*100+7
            draw.rectangle((x-2,y-2,x+58,y+26),fill=(255,255,255,230))
            draw.text((x,y),f"{column},{row}",font=font,fill=(0,0,0,255))
    # Off-center arrow, corner names and a ring make flips visibly unambiguous.
    draw.polygon([(250,170),(480,170),(480,145),(550,200),(480,255),(480,230),(250,230)],fill=(255,255,255,255),outline=(0,0,0,255),width=3)
    draw.text((280,180),"RIGHT",font=large,fill=(0,0,0,255))
    for text,x,y in [("TL",35,45),("TR",710,45),("BL",35,345),("BR",710,345)]:
        draw.text((x,y),text,font=large,fill=(255,255,255,255),stroke_width=1,stroke_fill=(0,0,0,255))
    draw.ellipse((130,260,190,320),outline=(255,255,255,255),width=5)
    path=out/("picture-geometry-alpha.png" if transparent else "picture-geometry-calibration.png")
    image.save(path,format="PNG",dpi=(96,96))
    print(path.name,sha256(path.read_bytes()).hexdigest())
    if not transparent:
        for orientation in range(1,9):
            exif=Image.Exif()
            exif[274]=orientation
            path=out/f"picture-geometry-exif-{orientation}.jpg"
            image.convert("RGB").save(path,format="JPEG",quality=95,subsampling=0,exif=exif,dpi=(96,96))
            print(path.name,sha256(path.read_bytes()).hexdigest())
