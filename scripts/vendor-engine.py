"""Save the upstream CircuitJS browser build and its notices locally."""
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.parse import urljoin
import concurrent.futures
import re
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1] / 'public' / 'engine'
BASE = 'https://pfalstad.github.io/circuitjs1/'

def fetch(path):
    target = ROOT / path
    if target.exists():
        return path, target.read_bytes()
    url = urljoin(BASE, path)
    with urlopen(Request(url, headers={'User-Agent': 'CircuitNotebook/0.1'}), timeout=40) as r:
        data = r.read()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return path, data

paths = ['circuitjs.html', 'lz-string.min.js', 'circuitjs1/circuitjs1.nocache.js',
         'circuitjs1/gwt/clean/clean.css', 'circuitjs1/style.css',
         'circuitjs1/setuplist.txt', 'font/fontello.css']
manifest = {}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    for path, data in pool.map(fetch, paths):
        manifest[path] = hashlib.sha256(data).hexdigest()
script = (ROOT / 'circuitjs1/circuitjs1.nocache.js').read_text()
hashes = sorted(set(re.findall(r"'([A-F0-9]{32})'", script)))
extra = ['circuitjs1/' + name + '.cache.js' for name in hashes]
for css in ['circuitjs1/gwt/clean/clean.css', 'circuitjs1/style.css', 'font/fontello.css']:
    body = (ROOT / css).read_text()
    for src in re.findall(r'url\([\"\']?([^\)\"\']+)', body):
        if not src.startswith(('data:', 'http')):
            extra.append(str(Path(css).parent / src.split('?')[0].split('#')[0]))
setup = (ROOT / 'circuitjs1/setuplist.txt').read_text()
for line in setup.splitlines():
    name = line.lstrip('>').split(' ')[0]
    if name.endswith('.txt'):
        extra.append('circuitjs1/circuits/' + name)
extra += ['circuitjs1/circuits/blank.txt', 'circuitjs1/iframe.html', 'circuitjs1/locale_zh.txt']
errors = []
def safe_fetch(path):
    try:
        return fetch(path)
    except Exception as err:
        errors.append((path, str(err)))
        return path, None
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    for path, data in pool.map(safe_fetch, sorted(set(extra))):
        if data:
            manifest[path] = hashlib.sha256(data).hexdigest()
# Remove upstream service worker and absolute manifest reference in this embedding.
html = (ROOT / 'circuitjs.html').read_text()
html = re.sub(r'<link rel="manifest"[^>]+>', '', html)
html = re.sub(r'<script>\s*if \(\'serviceWorker\'.*?</script>', '', html, flags=re.S)
html = html.replace('<title></title>', '<title>CircuitJS · 观电</title>')
html = html.replace('</head>', '''<style>
html,body{margin:0!important;background:#000;color:#ddd;font-family:system-ui,sans-serif}
.gwt-DialogBox{color:#222}.gwt-MenuBar{font-family:system-ui,sans-serif}
</style></head>''')
(ROOT / 'circuitjs.html').write_text(html)
license_url = 'https://raw.githubusercontent.com/pfalstad/circuitjs1/master/COPYING.txt'
(ROOT / 'COPYING.txt').write_bytes(urlopen(license_url, timeout=30).read())
(ROOT / 'NOTICE.txt').write_text('CircuitJS1 by Paul Falstad, Iain Sharp and contributors.\n'
    'GNU GPL version 2 or later. See COPYING.txt.\n'
    'Upstream source: https://github.com/pfalstad/circuitjs1\n'
    'Browser distribution: https://pfalstad.github.io/circuitjs1/\n'
    'Downloaded 2026-09-19. The embedding HTML omits the upstream service worker.\n')
(ROOT / 'asset-manifest.json').write_text(json.dumps(manifest, indent=2))
print('Saved', len(manifest), 'engine assets; bytes:', sum(p.stat().st_size for p in ROOT.rglob('*') if p.is_file()))
if errors:
    print('Optional assets unavailable:', errors[:15])
