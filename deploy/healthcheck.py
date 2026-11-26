#!/usr/bin/env python3
import json, sys, time, urllib.request, urllib.error
from pathlib import Path
base=sys.argv[1]
paths=['/']
config=Path('/opt/notionnext/health-paths.json')
if config.exists(): paths=list(dict.fromkeys(paths+json.loads(config.read_text())))
for path in paths:
    if not path.startswith('/') or path.startswith('//'): raise SystemExit('Invalid health path')
    for attempt in range(12):
        try:
            with urllib.request.urlopen(base+path,timeout=30) as r:
                body=r.read()
                if r.status!=200 or len(body)<100: raise ValueError('Invalid response')
                if path=='/' and (b'Qianchang' not in body or b'__NEXT_DATA__' not in body):
                    raise ValueError('Blog content absent')
            print('Healthy:',path,flush=True)
            break
        except Exception as exc:
            if attempt==11: raise SystemExit('Health check failed: '+path+' '+type(exc).__name__)
            time.sleep(2)
