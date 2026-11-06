"""Independent fit and legacy EXIF pixel checks for the editor-authored probe.

Requires Pillow. No OpenDeck geometry/EXIF helper is imported. Original encoded
JPEG pixels are sampled using the eight EXIF coordinate permutations directly.
"""
from pathlib import Path
from io import BytesIO
from math import sin,cos,pi,floor,ceil
import base64,json
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/picture-geometry-powerpoint'
deck=json.loads((OUT/'editor-authored.opendeck').read_text())
def rectangle(r):return {k:(r or {}).get(k,0) for k in ['left','top','right','bottom']}
def encoded(u,v,o):return {1:(u,v),2:(1-u,v),3:(1-u,1-v),4:(u,1-v),5:(v,u),6:(v,1-u),7:(1-v,1-u),8:(1-v,u)}.get(o,(u,v))
def sample(im,x,y):
 x=max(0,min(im.width-1,x));y=max(0,min(im.height-1,y));x0,y0=floor(x),floor(y);tx,ty=x-x0,y-y0
 return [sum(im.getpixel(p)[k]*weight for p,weight in [((x0,y0),(1-tx)*(1-ty)),((min(im.width-1,x0+1),y0),tx*(1-ty)),((x0,min(im.height-1,y0+1)),(1-tx)*ty),((min(im.width-1,x0+1),min(im.height-1,y0+1)),tx*ty)]) for k in range(4)]
results=[]
for index,slide in enumerate(deck['slides'],1):
 native=Image.open(OUT/f'editor-authored-slide-{index}.png').convert('RGB')
 for e in slide['elements']:
  if e['type']!='image':continue
  original=Image.open(BytesIO(base64.b64decode(e['src'].split(',')[1])));orientation=original.getexif().get(274,1) if e.get('orientation')!='encoded' else 1;source=original.convert('RGBA');original.close()
  naturalW,naturalH=(source.height,source.width) if orientation>=5 else source.size
  w,h=e['width'],e['height'];angle=e['rotation']*pi/180;c,s=cos(angle),sin(angle);crop=rectangle(e.get('crop'));fill=rectangle(e.get('fillRect'))
  explicit='crop'in e or 'fillRect'in e
  if explicit or e['fit']=='stretch':
   destX=w*fill['left'];destY=h*fill['top'];destW=w*(1-fill['left']-fill['right']);destH=h*(1-fill['top']-fill['bottom'])
   imageW=destW/(1-crop['left']-crop['right']);imageH=destH/(1-crop['top']-crop['bottom']);imageX=destX-crop['left']*imageW;imageY=destY-crop['top']*imageH
  else:
   scale=(min if e['fit']=='contain' else max)(w/naturalW,h/naturalH);imageW=naturalW*scale;imageH=naturalH*scale;imageX=(w-imageW)/2;imageY=(h-imageH)/2;destX=destY=0;destW=w;destH=h
  points=[]
  for u in [.08,.21,.36,.63,.79,.92]:
   for v in [.18,.38,.68,.88]:
    dx=w*((1-u if e.get('flipH') else u)-.5);dy=h*((1-v if e.get('flipV') else v)-.5)
    px,py=round(e['x']+w/2+c*dx-s*dy),round(e['y']+h/2+s*dx+c*dy)
    dx=px+.5-e['x']-w/2;dy=py+.5-e['y']-h/2;lx=c*dx+s*dy+w/2;ly=-s*dx+c*dy+h/2
    if e.get('flipH'):lx=w-lx
    if e.get('flipV'):ly=h-ly
    du,dv=(lx-imageX)/imageW,(ly-imageY)/imageH;background=(213,218,224)
    if not(destX<=lx<=destX+destW and destY<=ly<=destY+destH and 0<=du<=1 and 0<=dv<=1):expected=list(background)
    else:
     su,sv=encoded(du,dv,orientation);sx,sy=su*source.width-.5,sv*source.height-.5;ix,iy=round(sx),round(sy);radius=max(3,ceil(max(naturalW/imageW,naturalH/imageH)*3))
     if not(radius<=ix<source.width-radius and radius<=iy<source.height-radius):continue
     region=[source.getpixel((ix+a,iy+b)) for a in range(-radius,radius+1) for b in range(-radius,radius+1)]
     if max(max(p[k] for p in region)-min(p[k] for p in region) for k in [2,3])>8:continue
     rgba=sample(source,sx,sy);alpha=rgba[3]/255*e['opacity'];expected=[round(rgba[k]*alpha+background[k]*(1-alpha)) for k in range(3)]
    actual=list(native.getpixel((px,py)));error=max(abs(a-b) for a,b in zip(actual,expected));points.append({'local':[u,v],'pixel':[px,py],'expected':expected,'native':actual,'maxChannelError':error})
  record={'name':e['name'],'orientation':orientation,'fit':e['fit'],'samples':points,'maxChannelError':max(p['maxChannelError'] for p in points)}
  assert record['maxChannelError']<=5,record
  results.append(record);source.close()
 native.close()
report={'passed':True,'method':'Independent native PNG vs authored-model fit math and direct EXIF coordinate permutation; smooth interior pixels and transparent regions only. No application geometry helper used.','results':results}
(OUT/'editor-pixel-measurements.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'passed':True,'pictures':len(results),'samples':sum(len(r['samples']) for r in results),'maxChannelError':max(r['maxChannelError'] for r in results)}))
