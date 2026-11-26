#!/usr/bin/env python3
import subprocess, shutil
from pathlib import Path
base=Path('/opt/notionnext')
history=[x.split()[-1] for x in (base/'state/history').read_text().splitlines()]
keep=list(dict.fromkeys(reversed(history)))[:5]
# Images held by running and stopped containers are retained by Docker as well.
for line in subprocess.check_output(['docker','images','notionnext','--format','{{.Tag}}'],text=True).splitlines():
    if len(line)==40 and all(c in '0123456789abcdef' for c in line) and line not in keep:
        result=subprocess.run(['docker','image','rm','notionnext:'+line],check=False)
        if result.returncode==0:
            shutil.rmtree(base/'releases'/line,ignore_errors=True)
