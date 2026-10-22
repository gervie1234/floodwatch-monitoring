"""Anonymous public-deployment verification. No credentials or browser cookies."""
import hashlib,json,re,urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
root=Path(__file__).resolve().parents[1]
base='https://floodwatch-monitoring.vercel.app'
def get(path):
 with urllib.request.urlopen(base+path,timeout=40) as response:
  assert response.status==200
  assert response.geturl().startswith(base),response.geturl()
  return response.read(),response.headers
markup,headers=get('/')
assert b'FloodWatch' in markup
script=re.search(rb'src="(/assets/[^\"]+\.js)"',markup).group(1).decode()
js,_=get(script)
assert hashlib.sha256(js).digest()==hashlib.sha256((root/'frontend/dist'/script.lstrip('/')).read_bytes()).digest()
pdf,pdfheaders=get('/downloads/FloodWatch-Device-Tutorial.pdf')
assert pdf.startswith(b'%PDF-')
assert hashlib.sha256(pdf).digest()==hashlib.sha256((root/'output/pdf/FloodWatch_Device_Build_Tutorial.pdf').read_bytes()).digest()
paths=['/assets/parts/'+name+'.png' for name in ['esp32','sensor','gps','buzzer','powerbank','solar','enclosure','jumpers']]
with ThreadPoolExecutor(max_workers=4) as pool:
 for content,head in pool.map(get,paths):assert content.startswith(b'\x89PNG')
with urllib.request.urlopen(urllib.request.Request('https://api.github.com/repos/gervie1234/floodwatch-monitoring',headers={'User-Agent':'FloodWatch-validation'}),timeout=30) as r:
 repo=json.load(r);assert repo['private'] is False and repo['default_branch']=='main'
print('PASS: anonymous public site, exact built JS, matching tutorial PDF, all eight images, public GitHub repository and main branch.')
