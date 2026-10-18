"""Package generated strips and source metadata; exclude all downloaded and composed caches."""
from pathlib import Path
import hashlib,json,zipfile
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
out=root/'dist';out.mkdir(exist_ok=True)
archive=out/f'dap-chiikawa-friends-v{version}.zip'
icon=root/'icon.png'
data=icon.read_bytes()
assert data[:8]==b'\x89PNG\r\n\x1a\n' and len(data)<=512*1024
assert int.from_bytes(data[16:20],'big')==256 and int.from_bytes(data[20:24],'big')==256
files=[root/'plugin.yaml',root/'README.md',root/'NOTICE.md',root/'PERSONAS.md',root/'MOTIONS.md',icon]
generated={root/m['file']:m for name in ['motions.json'] for m in json.loads((root/'assets'/name).read_text(encoding='utf-8'))}
for path,motion in generated.items():
    assert path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest()==motion['sha256']
for folder in ['assets','dap_chiikawa','palette']:
    files.extend(p for p in (root/folder).rglob('*') if p.is_file() and not (p.parent==root/'assets' and p.suffix.lower() in ['.png','.part']))
assert not any(p!=icon and p not in generated and p.suffix.lower() in ['.png','.gif','.webp','.jpg','.jpeg','.mp4','.part'] for p in files),'Only verified generated artwork may ship'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for file in sorted(files):z.write(file,Path('dap-chiikawa-friends')/file.relative_to(root))
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
(out/'SHA256SUMS.txt').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n')
print(f'Packaged {archive.name}: {archive.stat().st_size:,} bytes (generated strips and upstream metadata; no downloaded originals)')
