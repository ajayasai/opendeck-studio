"""Independently compare native picture pixels with source/target/flip transforms.

Requires Pillow. Reads original project assets and native PNGs without editing
them. EXIF is deliberately not transposed: native PPTX uses the stored xfrm.
"""
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as E
from io import BytesIO
from math import sin, cos, pi, floor, ceil
from hashlib import sha256
import json
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/picture-geometry-powerpoint'
def child(n,name): return next((x for x in n if x.tag.rsplit('}',1)[-1]==name),None) if n is not None else None
def descendants(n,name): return [x for x in n.iter() if x.tag.rsplit('}',1)[-1]==name]
def ratio(v): return float(v[:-1])/100 if v.endswith('%') else float(v)/100000
def rect(n): return {side:ratio(n.get(side,'0')) if n is not None else 0 for side in ['l','t','r','b']}
def interpolate(im,x,y):
    x=max(0,min(im.width-1,x));y=max(0,min(im.height-1,y));x0,y0=floor(x),floor(y);x1,y1=min(im.width-1,x0+1),min(im.height-1,y0+1);tx,ty=x-x0,y-y0
    return [sum(im.getpixel(p)[c]*weight for p,weight in [((x0,y0),(1-tx)*(1-ty)),((x1,y0),tx*(1-ty)),((x0,y1),(1-tx)*ty),((x1,y1),tx*ty)]) for c in range(4)]
results=[]
for prefix,filename in [('original','powerpoint-picture-geometry.pptx'),('probe','powerpoint-picture-geometry-probe.pptx')]:
    file=ROOT/'tests/fixtures'/filename
    with ZipFile(file) as z:
        for slide in range(1,10):
            doc=E.fromstring(z.read(f'ppt/slides/slide{slide}.xml'))
            rels={r.get('Id'):r.get('Target') for r in E.fromstring(z.read(f'ppt/slides/_rels/slide{slide}.xml.rels'))}
            native=Image.open(OUT/f'{prefix}-slide-{slide}.png').convert('RGB')
            for pic in descendants(doc,'pic'):
                name=descendants(pic,'cNvPr')[0].get('name')
                sp=child(pic,'spPr');xfrm=child(sp,'xfrm');geom=child(sp,'prstGeom');bf=child(pic,'blipFill');stretch=child(bf,'stretch')
                if geom.get('prst')!='rect' or stretch is None:continue
                blip=child(bf,'blip');rel=next(v for k,v in blip.attrib.items() if k.endswith('}embed'))
                path='ppt/'+rels[rel].removeprefix('../');source=Image.open(BytesIO(z.read(path))).convert('RGBA')
                crop=rect(child(bf,'srcRect'));fill=rect(child(stretch,'fillRect'))
                offset=child(xfrm,'off');extent=child(xfrm,'ext');x,y=float(offset.get('x'))/12700,float(offset.get('y'))/12700;w,h=float(extent.get('cx'))/12700,float(extent.get('cy'))/12700
                angle=float(xfrm.get('rot','0'))/60000*pi/180;c,s=cos(angle),sin(angle);fh=xfrm.get('flipH') in ['1','true'];fv=xfrm.get('flipV') in ['1','true']
                alpha=child(blip,'alphaModFix');alpha=ratio(alpha.get('amt','100000')) if alpha is not None else 1
                points=[]
                for u in [.08,.21,.36,.63,.79,.92]:
                    for v in [.18,.38,.68,.88]:
                        # The input sample is in the unflipped local frame; apply
                        # flips first and rotation second around the frame center.
                        dx=w*((1-u if fh else u)-.5);dy=h*((1-v if fv else v)-.5)
                        px,py=round((x+w/2+c*dx-s*dy)*4/3),round((y+h/2+s*dx+c*dy)*4/3)
                        if not(0<=px<native.width and 0<=py<native.height):continue
                        # Undo the transform at the actual sampled pixel center.
                        dx=(px+.5)*.75-(x+w/2);dy=(py+.5)*.75-(y+h/2)
                        uu=(c*dx+s*dy)/w+.5;vv=(-s*dx+c*dy)/h+.5
                        if fh:uu=1-uu
                        if fv:vv=1-vv
                        fw,fhgt=1-fill['l']-fill['r'],1-fill['t']-fill['b']
                        su=crop['l']+(uu-fill['l'])/fw*(1-crop['l']-crop['r']);sv=crop['t']+(vv-fill['t'])/fhgt*(1-crop['t']-crop['b'])
                        background=(213,218,224)
                        if not(fill['l']<=uu<=1-fill['r'] and fill['t']<=vv<=1-fill['b'] and 0<=su<=1 and 0<=sv<=1):
                            expected=list(background)
                        else:
                            sx,sy=su*source.width-.5,sv*source.height-.5
                            ix,iy=round(sx),round(sy)
                            footprint=max(source.width*(1-crop['l']-crop['r'])/(w*fw*4/3),source.height*(1-crop['t']-crop['b'])/(h*fhgt*4/3))
                            radius=max(3,ceil(footprint*3))
                            if not(radius<=ix<source.width-radius and radius<=iy<source.height-radius):continue
                            region=[source.getpixel((ix+a,iy+b)) for a in range(-radius,radius+1) for b in range(-radius,radius+1)]
                            # Blue/alpha are constant within each smooth encoded
                            # quadrant. Reject text/grid edges within the native
                            # downsampling footprint, including filter ringing.
                            if max(max(p[k] for p in region)-min(p[k] for p in region) for k in [2,3])>8:continue
                            rgba=interpolate(source,sx,sy);a=rgba[3]/255*alpha
                            expected=[round(rgba[k]*a+background[k]*(1-a)) for k in range(3)]
                        actual=list(native.getpixel((px,py)));error=max(abs(a-b) for a,b in zip(actual,expected))
                        points.append({'local':[u,v],'pixel':[px,py],'source':[su,sv],'native':actual,'expected':expected,'maxChannelError':error})
                record={'input':filename,'slide':slide,'name':name,'samples':points,'maxChannelError':max((p['maxChannelError'] for p in points),default=0)}
                # rotWithShape=false is outside the currently proposed supported
                # image contract; record it independently without asserting it.
                record['scope']='unsupported fixed fill rotation' if bf.get('rotWithShape') in ['0','false'] else 'crop-target-local-flip-then-rotation'
                if record['scope']=='crop-target-local-flip-then-rotation':assert record['maxChannelError']<=5,record
                results.append(record)
                source.close()
            native.close()
output={'method':'Independent source bitmap bilinear samples, crop-to-target mapping, local flips, then frame-center rotation. Smooth interior pixels only; alpha composites over original gray bounds markers. JPEG EXIF is ignored as in native package rendering.','sources':{n:sha256((ROOT/'tests/fixtures'/n).read_bytes()).hexdigest() for n in ['powerpoint-picture-geometry.pptx','powerpoint-picture-geometry-probe.pptx']},'results':results}
(OUT/'pixel-measurements.json').write_text(json.dumps(output,indent=2)+'\n')
supported=[r for r in results if r['scope']=='crop-target-local-flip-then-rotation']
print(json.dumps({'totalPictures':len(results),'totalSamples':sum(len(r['samples']) for r in results),'supportedPictures':len(supported),'supportedSamples':sum(len(r['samples']) for r in supported),'maxSupportedError':max(r['maxChannelError'] for r in supported)}))
