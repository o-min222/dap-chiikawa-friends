"""Build the offline preview catalogue from completed motion exports."""

import json
from pathlib import Path


PRODUCTION = Path(__file__).resolve().parent.parent / "art" / "production"
LABELS = {
    "idle-quiet": "대기 · 차분한 호흡",
    "idle-glance": "대기 · 시선 변화",
    "idle-soft": "대기 · 편안한 자세",
    "walk-right": "오른쪽 걷기",
    "walk-left": "왼쪽 걷기",
    "thinking-refined": "생각하기",
    "working": "메모 정리",
    "working-v2": "메모 검토",
    "laptop-working": "노트북 작업",
    "work-interrupt": "작업 중 부름 반응",
    "work-stretch": "목과 어깨 펴기",
    "work-finish": "노트북 정리와 복귀",
    "happy": "반가움",
    "groom": "몸단장",
    "grabbed": "드래그",
    "sleep": "잠들기와 깨기",
    "dance": "음악을 즐기는 춤",
    "music-playing": "음악 재생",
    "music-listening": "조용한 음악 감상",
    "self-play": "혼자 균형 놀이",
    "success": "완료 전달",
    "error": "문제 알림",
    "greeting": "인사",
    "listening": "경청",
    "acknowledge": "수락",
    "speaking": "설명하기",
    "approval-wait": "확인 기다리기",
    "clarify": "되묻기",
    "cancel": "중지 수락",
    "resume": "작업 재개",
    "thinking": "생각 · 긴 파일럿",
    "idle": "대기 · 첫 파일럿",
    "gaze-e": "시선 · 오른쪽",
    "gaze-se": "시선 · 오른쪽 아래",
    "gaze-s": "시선 · 아래",
    "gaze-sw": "시선 · 왼쪽 아래",
    "gaze-w": "시선 · 왼쪽",
    "gaze-nw": "시선 · 왼쪽 위",
    "gaze-n": "시선 · 위",
    "gaze-ne": "시선 · 오른쪽 위",
}


def build_catalogue(motion_ids=None):
    catalogue = []
    for motion_id, label in LABELS.items():
        if motion_ids is not None and motion_id not in motion_ids:
            continue
        folder = PRODUCTION / "motions" / motion_id
        manifest = folder / "clip.json"
        if not manifest.exists():
            continue
        source = json.loads(manifest.read_text(encoding="utf-8"))
        metadata = {
            key: source[key]
            for key in ["pages", "frameCount", "fps", "durationMs"]
        }
        metadata["phases"] = source.get("phases", {})
        metadata["playRange"] = source.get("playRange")
        metadata["playback"] = source.get("playback", "once")
        metadata["frames"] = [
            {key: frame[key] for key in ["page", "x", "y", "durationMs"]}
            for frame in source["frames"]
        ]
        catalogue.append({
            "id": motion_id,
            "label": label,
            "path": folder.relative_to(PRODUCTION).as_posix(),
            "meta": metadata,
        })
    return catalogue


def write_catalogue(catalogue):
    payload = json.dumps(catalogue, ensure_ascii=False, separators=(",", ":"))
    (PRODUCTION / "preview-data.js").write_text(
        "window.DAP_PREVIEW_MOTIONS = " + payload + ";\n", encoding="utf-8"
    )


def main():
    motion_ids = None
    index_path = PRODUCTION / "asset-pack.json"
    if index_path.exists():
        index = json.loads(index_path.read_text(encoding="utf-8"))
        motion_ids = {
            motion for motion, clip in index["clips"].items()
            if clip.get("reviewStatus", "").startswith("alpha-")
            and clip.get("reviewStatus", "").endswith("reviewed")
        }
    catalogue = build_catalogue(motion_ids)
    write_catalogue(catalogue)
    print(json.dumps({
        "clips": len(catalogue),
        "frames": sum(item["meta"]["frameCount"] for item in catalogue),
    }))


if __name__ == "__main__":
    main()
