#!/usr/bin/env python3
"""Run as server administrator; never print the token or page bodies."""
import json, urllib.request
from pathlib import Path
values={}
for line in Path('/opt/notionnext/runtime.env').read_text().splitlines():
    if line and not line.startswith('#') and '=' in line:
        key,value=line.split('=',1); values[key]=value
body={'all':True,'invalidateData':True,'batchSize':25}
for batch in range(1000):
    req=urllib.request.Request('http://127.0.0.1:3080/api/revalidate',
        data=json.dumps(body).encode(),method='POST',
        headers={'Authorization':'Bearer '+values['REVALIDATION_TOKEN'],'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=120) as response: result=json.load(response)
    if not result.get('ok'): raise SystemExit('Refresh failed')
    print('Batch',batch+1,':',result.get('message'),'complete=',result.get('complete'),flush=True)
    if result.get('complete'): break
    body={'paths':result['remainingPaths'],'batchSize':25}
else: raise SystemExit('Too many refresh batches')
