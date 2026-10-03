import sys, json
from playwright.sync_api import sync_playwright
url, out = sys.argv[1], sys.argv[2]
scripts = sys.argv[3:]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl'])
    pg = b.new_page(viewport={'width':1280,'height':800})
    errs=[]
    pg.on('console', lambda m: errs.append(m.type+': '+m.text[:220]) if m.type in ('error','warning') and 'GPU stall' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)[:300]))
    pg.goto(url, wait_until='load'); pg.wait_for_timeout(3500)
    for s in scripts:
        r = pg.evaluate(s); print('eval ->', json.dumps(r, ensure_ascii=False)[:700]); pg.wait_for_timeout(2500)
    pg.screenshot(path=out, clip={'x':178,'y':50,'width':866,'height':655})
    print('errors:', errs[:8] if errs else 'none')
    b.close()
