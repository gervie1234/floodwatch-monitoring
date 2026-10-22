"""Real HTTP checks against an isolated API process and data directory."""
import json, os, secrets, subprocess, time, urllib.request, urllib.error, uuid
from datetime import datetime, timezone
from pathlib import Path
root=Path(__file__).resolve().parents[1]
data=root/'tmp'/('api-test-'+uuid.uuid4().hex)
data.mkdir(parents=True)
env=os.environ.copy();env['DEVICE_API_KEY']=secrets.token_hex(24);env['FLOODWATCH_URL']='http://127.0.0.1:5096'
dll=root/'backend/bin/Debug/net10.0/FloodWatch.Api.dll'
def call(path, method='GET', body=None, key=None):
 headers={'Content-Type':'application/json'}
 if key: headers['X-Device-Key']=key
 req=urllib.request.Request('http://127.0.0.1:5096'+path,data=None if body is None else json.dumps(body).encode(),headers=headers,method=method)
 try:
  with urllib.request.urlopen(req,timeout=4) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read() or '{}')
def start():
 p=subprocess.Popen(['dotnet',str(dll),'--contentRoot',str(data)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 for _ in range(60):
  if p.poll() is not None:raise RuntimeError('API failed to start')
  try:
   if call('/api/health')[0]==200:return p
  except OSError:pass
  time.sleep(.2)
 p.terminate();raise RuntimeError('API startup timeout')
p=start()
try:
 assert call('/api/readings')[1]==[]
 assert len(call('/api/readings?demo=true')[1])==145
 assert call('/api/readings')[1]==[], 'Demo must not persist'
 sample={'deviceId':'FW-001','bootId':'test-boot','sequence':1,'observedAtUtc':datetime.now(timezone.utc).isoformat(),'distanceCm':90,'latitude':None,'longitude':None}
 assert call('/api/readings','POST',sample)[0]==401
 assert call('/api/readings','POST',sample,'wrong')[0]==401
 code,reading=call('/api/readings','POST',sample,env['DEVICE_API_KEY']);assert code==201 and reading['levelCm']==60
 assert call('/api/readings','POST',sample,env['DEVICE_API_KEY'])[1]['duplicate']
 assert len(call('/api/readings')[1])==1
 for changes in [{'distanceCm':10},{'latitude':91,'longitude':120},{'deviceId':'other'},{'sequence':-1},{'observedAtUtc':'2020-01-01T00:00:00Z'}]:
  assert call('/api/readings','POST',dict(sample,**changes),env['DEVICE_API_KEY'])[0]==400,changes
 settings=call('/api/settings')[1]
 assert call('/api/settings','PUT',dict(settings,warningCm=10))[0]==400
 updated=dict(settings,name='Persistence test station')
 assert call('/api/settings','PUT',updated)[0]==200
 p.terminate();p.wait(timeout=10);p=start()
 assert call('/api/settings')[1]['name']=='Persistence test station'
 assert len(call('/api/readings')[1])==1
 print('PASS: demo isolation, authentication, derived level, deduplication, invalid payloads, settings validation and restart persistence.')
finally:
 p.terminate();p.wait(timeout=10)
