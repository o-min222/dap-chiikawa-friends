"""Build the host-ready atlas plugin from the reviewed production pack."""
import argparse
import json
import shutil
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def build(destination: Path) -> None:
    production = ROOT / 'art' / 'production'
    manifest = json.loads((production / 'asset-pack.json').read_text(encoding='utf-8'))
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT / 'assistant', destination, dirs_exist_ok=True)
    assets = destination / 'assets'
    assets.mkdir(exist_ok=True)
    clips = {}
    frame_count = 0
    for name, reference in manifest['clips'].items():
        source = production / reference['manifest']
        clip = json.loads(source.read_text(encoding='utf-8'))
        target = assets / 'motions' / name
        target.mkdir(parents=True, exist_ok=True)
        for page in clip['pages']:
            shutil.copy2(source.parent / page, target / page)
        fields = ('pages', 'frames', 'playback', 'playRange', 'phases', 'entryPose', 'loopPose', 'exitPose')
        runtime = {key: clip[key] for key in fields if key in clip}
        for pose in ('entryPose', 'exitPose'):
            if runtime.get(pose) == 'neutral':
                runtime[pose] = 'standing-neutral'
        if name == 'laptop-working':
            runtime['loopPose'] = 'seated-laptop-working'
        elif name in ('working', 'working-v2'):
            runtime['loopPose'] = 'memo-held'
        (target / 'clip.json').write_text(json.dumps(runtime, ensure_ascii=False), encoding='utf-8')
        clips[name] = {'manifest': f'motions/{name}/clip.json'}
        frame_count += len(clip['frames'])
    fields = ('format', 'formatVersion', 'status', 'atlasCell', 'atlasAnchor', 'motionMap', 'aliases',
              'idleVariants', 'musicPlayback', 'computerWork', 'gaze')
    runtime_pack = {key: manifest[key] for key in fields}
    runtime_pack.update(clips=clips, referenceHeight=manifest['referenceHeight'])
    (assets / 'asset-pack.json').write_text(json.dumps(runtime_pack, ensure_ascii=False), encoding='utf-8')
    idle = json.loads((production / manifest['clips']['idle-quiet']['manifest']).read_text(encoding='utf-8'))
    frame = idle['frames'][0]
    page = production / 'motions' / 'idle-quiet' / idle['pages'][frame['page']]
    with Image.open(page) as image:
        image.crop((frame['x'], frame['y'], frame['x'] + 256, frame['y'] + 256)).save(assets / 'poster.png')
    archive = destination.with_suffix('.zip')
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_STORED) as bundle:
        for path in sorted(destination.rglob('*')):
            if path.is_file():
                bundle.write(path, path.relative_to(destination).as_posix())
    print(json.dumps({'plugin': str(destination), 'archive': str(archive), 'clips': len(clips),
                      'frames': frame_count, 'bytes': archive.stat().st_size}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / 'outputs' / 'dap-assistant-plugin')
    build(parser.parse_args().output.resolve())
