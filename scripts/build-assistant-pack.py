"""Index reviewed assistant assets and optionally create their delivery archive."""

import argparse
import json
from pathlib import Path
import runpy
import zipfile


ROOT = Path(__file__).resolve().parent.parent
PRODUCTION = ROOT / "art" / "production"
BASE_MOTIONS = [
    "idle", "walk-right", "walk-left", "thinking", "working", "working-v2",
    "happy", "groom", "grabbed", "sleep", "dance", "success", "error", "music-playing", "self-play",
    "laptop-working",
]
INTERACTIONS = [
    "greeting", "listening", "acknowledge", "speaking", "approval-wait",
    "clarify", "cancel", "resume",
    "work-interrupt", "work-stretch", "work-finish",
]
IDLE_VARIANTS = ["idle-quiet", "idle-glance", "idle-soft"]
GAZE_DIRECTIONS = {
    "gaze-e": 0, "gaze-se": 45, "gaze-s": 90, "gaze-sw": 135,
    "gaze-w": 180, "gaze-nw": 225, "gaze-n": 270, "gaze-ne": 315,
}
REFERENCES = [
    "stand-front-clean.png", "stand-neutral-v2-clean.png", "stand-left-clean.png",
    "stand-right-profile-clean.png", "stand-back-clean.png",
    "turnaround-review.jpg",
    "stand-neutral-v2-magenta.png", "stand-left-magenta.png",
    "stand-right-profile-magenta.png", "memo-held-clean.png",
    "memo-held-magenta.png", "gaze-review.jpg",
    "laptop-v4-idle-start-magenta.png", "laptop-v4-working-reference.png",
    "laptop-proportion-review-light.jpg",
    "laptop-v4-source-transform.json", "laptop-v4-color-transform.json",
    "laptop-v4-palette-review.json", "laptop-entry-review.jpg",
]


def read_clip(motion_id):
    path = PRODUCTION / "motions" / motion_id / "clip.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def is_reviewed(metadata):
    status = metadata.get("reviewStatus", "")
    return status.startswith("alpha-") and status.endswith("reviewed")


def build_index():
    motion_map = {motion: motion for motion in BASE_MOTIONS + INTERACTIONS}
    motion_map["idle"] = "idle-quiet"
    motion_map["music-playing"] = "music-listening"
    refined_thinking = read_clip("thinking-refined")
    if refined_thinking and is_reviewed(refined_thinking):
        motion_map["thinking"] = "thinking-refined"
    selected = list(dict.fromkeys(list(motion_map.values()) + IDLE_VARIANTS + list(GAZE_DIRECTIONS)))
    clips = {}
    missing = []
    unreviewed = []
    for motion_id in selected:
        metadata = read_clip(motion_id)
        if metadata is None:
            missing.append(motion_id)
            continue
        if not is_reviewed(metadata):
            unreviewed.append(motion_id)
        clips[motion_id] = {
            "manifest": f"motions/{motion_id}/clip.json",
            "framesArchive": f"motions/{motion_id}/frames-512.zip",
            "frameCount": metadata["frameCount"],
            "fps": metadata["fps"],
            "durationMs": metadata["durationMs"],
            "reviewStatus": metadata.get("reviewStatus"),
        }
    index = {
        "format": "dap-assistant-animation-pack",
        "formatVersion": 1,
        "character": "DAP Assistant",
        "status": "ready" if not missing and not unreviewed else "in-progress",
        "integrationStatus": "host-runtime-implemented",
        "referenceElement": "05d384a2-ec9d-4951-8738-85731dbbe46e",
        "baseMotionCount": len(BASE_MOTIONS),
        "interactionCount": len(INTERACTIONS),
        "motionMap": motion_map,
        "aliases": {
            "headtilt": motion_map["thinking"],
            "review": motion_map["thinking"],
            "working_v2": "laptop-working",
            "running": "working",
            "waving": "greeting",
            "waiting": "idle-quiet",
        },
        "locomotion": {"left": "walk-left", "right": "walk-right"},
        "musicPlayback": {
            "motion": "music-listening", "hostVisualAction": "dance",
            "variants": {"quiet": "music-listening", "energetic": "dance"},
            "startSignal": "petEngine.onAudio(true)",
            "stopSignal": "petEngine.onAudio(false)", "stopPhase": "exit",
            "afterStop": "restore-host-state",
        },
        "idleVariants": IDLE_VARIANTS,
        "idleActivities": ["self-play"],
        "computerWork": {
            "motion": "laptop-working", "interruptMotion": "work-interrupt",
            "stretchMotion": "work-stretch", "finishMotion": "work-finish",
            "finishPose": "standing-neutral",
        },
        "gaze": {
            "coordinates": "screen-x-right-y-down",
            "angleOrigin": "right",
            "angleDirection": "clockwise",
            "neutral": "idle-quiet",
            "directions": [
                {"motion": motion, "angleDegrees": angle}
                for motion, angle in GAZE_DIRECTIONS.items()
            ],
            "playback": "entry-on-target-change-loop-while-target-stable-exit-on-release",
        },
        "atlasCell": {"width": 256, "height": 256},
        "atlasAnchor": {"x": 128, "y": 224},
        "referenceHeight": 200,
        "pngFrame": {"width": 512, "height": 512},
        "pngAnchor": {"x": 256, "y": 448},
        "playbackDirections": ["forward", "reverse", "alternate", "alternate-reverse"],
        "clipCount": len(clips),
        "totalSourceFrames": sum(clip["frameCount"] for clip in clips.values()),
        "clips": clips,
        "missingClips": missing,
        "unreviewedClips": unreviewed,
    }
    (PRODUCTION / "asset-pack.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return index


def normalize_frame_archive(motion_id):
    folder = PRODUCTION / "motions" / motion_id
    manifest = folder / "clip.json"
    metadata = json.loads(manifest.read_text(encoding="utf-8"))
    path = folder / "frames-512.zip"
    expected_names = [
        f"{motion_id}/{motion_id}_{index:05d}.png"
        for index in range(metadata["frameCount"])
    ]
    temporary = path.with_suffix(".zip.tmp")
    with zipfile.ZipFile(path) as source:
        names = source.namelist()
        if len(names) != len(expected_names):
            raise ValueError(f"Frame archive count mismatch for {motion_id}")
        if names != expected_names:
            with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED) as destination:
                for original_name, native_name in zip(names, expected_names):
                    destination.writestr(native_name, source.read(original_name))
    if names != expected_names:
        temporary.replace(path)
    metadata["frameArchive"] = {
        "file": "frames-512.zip", "directory": motion_id,
        "prefix": motion_id + "_", "digits": 5,
    }
    manifest.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


def create_archive(index):
    if index["status"] != "ready":
        raise SystemExit("Complete missing clip exports and their visual reviews before packaging")
    for motion_id in index["clips"]:
        normalize_frame_archive(motion_id)
    preview = runpy.run_path(str(ROOT / "scripts" / "build-assistant-preview.py"))
    preview["write_catalogue"](preview["build_catalogue"](set(index["clips"])))
    files = [
        PRODUCTION / name for name in [
            "README.md", "preview.html", "preview-data.js", "asset-pack.json",
            "higgsfield-jobs.json", "motion-briefs.json", "motion-takes.json",
        ]
    ]
    files += [PRODUCTION / "keyframes" / name for name in REFERENCES]
    files += [
        ROOT / "art" / "dap-assistant-motion-plan.md",
        ROOT / "art" / "reference" / "dap-assistant-concept-v1.png",
        ROOT / "scripts" / "export-assistant-motion.py",
        ROOT / "scripts" / "build-assistant-preview.py",
        ROOT / "scripts" / "build-assistant-pack.py",
        ROOT / "scripts" / "build-assistant-plugin.py",
        ROOT / "assistant" / "plugin.yaml",
        ROOT / "assistant" / "dap_assistant" / "plugin.mjs",
    ]
    for motion_id in index["clips"]:
        folder = PRODUCTION / "motions" / motion_id
        files += [
            path for path in folder.iterdir()
            if path.is_file() and path.suffix in {".png", ".json", ".zip", ".webp", ".jpg"}
        ]
    destination = ROOT / "art" / "dap-assistant-assets-v1.zip"
    temporary = destination.with_suffix(".zip.tmp")
    with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_STORED) as archive:
        for path in sorted(files):
            archive.write(path, path.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(temporary) as archive:
        failure = archive.testzip()
        if failure:
            raise ValueError(f"Archive CRC validation failed for {failure}")
    temporary.replace(destination)
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", action="store_true")
    arguments = parser.parse_args()
    index = build_index()
    result = {
        "status": index["status"], "clips": index["clipCount"],
        "frames": index["totalSourceFrames"], "missing": index["missingClips"],
        "unreviewed": index["unreviewedClips"],
    }
    if arguments.archive:
        result["archive"] = str(create_archive(index))
    print(json.dumps(result))


if __name__ == "__main__":
    main()
