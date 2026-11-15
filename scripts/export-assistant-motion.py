"""Export a chroma-backed animation take as transparent desktop character assets."""

import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import zipfile

import cv2
import numpy as np
from PIL import Image, ImageDraw


def probe_video(source):
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,avg_frame_rate,duration:format=duration",
            "-of", "json", str(source),
        ],
        check=True, capture_output=True, text=True,
    )
    data = json.loads(result.stdout)
    stream = data["streams"][0]
    numerator, denominator = map(int, stream["avg_frame_rate"].split("/"))
    return stream, numerator / denominator


def remove_magenta_background(image):
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    height, width = rgb.shape[:2]
    border = np.concatenate((rgb[:4].reshape(-1, 3), rgb[-4:].reshape(-1, 3)))
    background = np.median(border, axis=0)
    background_chroma = min(background[0], background[2]) - background[1]
    if background_chroma < 100:
        raise ValueError("The take needs a consistent magenta background for this exporter")

    # Color direction also recognizes a darker screen-colored ground shadow.
    normalized = rgb / np.maximum(np.linalg.norm(rgb, axis=2, keepdims=True), 1)
    background_direction = background / max(np.linalg.norm(background), 1)
    color_distance = np.linalg.norm(normalized - background_direction, axis=2)
    foreground = (color_distance > 0.16).astype(np.uint8)
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(foreground, 8)
    if count < 2:
        raise ValueError("No character silhouette found")
    character_label = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    left, top, component_width, component_height, area = stats[character_label]
    if left <= 0 or top <= 0 or left + component_width >= width or top + component_height >= height:
        raise ValueError("The character reaches the source boundary; a full-body take is required")
    minimum_area = max(32, int(area * 0.002))
    keep_labels = stats[:, cv2.CC_STAT_AREA] >= minimum_area
    keep_labels &= stats[:, cv2.CC_STAT_LEFT] > 0
    keep_labels &= stats[:, cv2.CC_STAT_TOP] > 0
    keep_labels &= stats[:, cv2.CC_STAT_LEFT] + stats[:, cv2.CC_STAT_WIDTH] < width
    keep_labels &= stats[:, cv2.CC_STAT_TOP] + stats[:, cv2.CC_STAT_HEIGHT] < height
    keep_labels[0] = False
    foreground = keep_labels[labels].astype(np.uint8)

    kernel = np.ones((5, 5), np.uint8)
    interior = cv2.erode(foreground, kernel).astype(bool)
    exterior = ~cv2.dilate(foreground, kernel).astype(bool)
    boundary = ~(interior | exterior)

    # Estimate antialiased edge coverage from the nearest opaque character pixel.
    _, nearest_labels = cv2.distanceTransformWithLabels(
        (~interior).astype(np.uint8), cv2.DIST_L2, 5,
        labelType=cv2.DIST_LABEL_PIXEL,
    )
    interior_colors = rgb[interior]
    if not len(interior_colors):
        raise ValueError("Character silhouette is too small")
    nearest_colors = interior_colors[np.maximum(nearest_labels - 1, 0)]
    direction = nearest_colors - background
    difference = rgb - background
    denominator = np.maximum(np.sum(direction * direction, axis=2), 1)
    coverage = np.clip(np.sum(difference * direction, axis=2) / denominator, 0, 1)
    alpha = np.zeros((height, width), dtype=np.float32)
    alpha[interior] = 1
    alpha[boundary] = coverage[boundary]
    alpha[color_distance < 0.08] = 0
    alpha[alpha < 0.02] = 0
    alpha[alpha > 0.98] = 1

    # Unmix the screen color from partially covered edge pixels.
    restored = (rgb - (1 - alpha[:, :, None]) * background) / np.maximum(alpha[:, :, None], 0.01)
    restored = np.clip(restored, 0, 255).astype(np.uint8)
    restored[alpha == 0] = 0
    rgba = np.dstack((restored, np.rint(alpha * 255).astype(np.uint8)))
    return Image.fromarray(rgba)


def frame_durations(frame_count, fps):
    boundaries = [round(index * 1000 / fps) for index in range(frame_count + 1)]
    return [end - start for start, end in zip(boundaries, boundaries[1:])]


def apply_color_calibration(image, matrix, offset):
    rgba = np.array(image, dtype=np.uint8)
    rgb = rgba[:, :, :3].astype(np.float32)
    calibrated = np.clip(np.rint(rgb @ matrix.T + offset), 0, 255).astype(np.uint8)
    rgba[:, :, :3] = calibrated
    rgba[rgba[:, :, 3] == 0, :3] = 0
    return Image.fromarray(rgba)


def export_motion(
    source, destination, motion_id, start_frame=0, end_frame=None,
    reference_frame=None, layout_reference=None, source_transform=None,
    color_transform=None,
):
    destination.mkdir(parents=True, exist_ok=True)
    stream, fps = probe_video(source)
    manifest_frames = []
    preview_frames = []
    sampled_images = []
    atlas = Image.new("RGBA", (2048, 2048))
    atlas_index = 0
    cell_size = 256
    cells_per_page = 64
    color_matrix = color_offset = None
    if color_transform is not None:
        calibration = json.loads(color_transform.read_text(encoding="utf-8"))
        color_matrix = np.asarray(calibration["matrix"], dtype=np.float32)
        color_offset = np.asarray(calibration["offset"], dtype=np.float32)
        if (
            color_matrix.shape != (3, 3)
            or color_offset.shape != (3,)
            or not np.all(np.isfinite(color_matrix))
            or not np.all(np.isfinite(color_offset))
        ):
            raise ValueError("Color transform needs a finite 3x3 matrix and three offsets")

    with tempfile.TemporaryDirectory(prefix="frames-", dir=destination) as temporary:
        temporary_path = Path(temporary)
        subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(source), "-fps_mode", "passthrough",
             str(temporary_path / "%05d.png")],
            check=True,
        )
        decoded_frames = sorted(temporary_path.glob("*.png"))
        if start_frame < 0 or end_frame is not None and end_frame <= start_frame:
            raise ValueError("Frame range must be positive and end after its start")
        if end_frame is not None and end_frame > len(decoded_frames):
            raise ValueError("Frame range extends past the decoded source")
        frames = decoded_frames[start_frame:end_frame]
        if not frames:
            raise ValueError("The source contains no decoded frames")
        alignment_frame = None
        if source_transform is not None:
            transform = json.loads(source_transform.read_text(encoding="utf-8"))
            if (transform["sourceWidth"], transform["sourceHeight"]) != (
                stream["width"], stream["height"],
            ):
                raise ValueError("Source transform dimensions differ from the video")
            source_anchor = tuple(float(value) for value in transform["sourceAnchor"])
            scale = float(transform["sourceScaleTo512"])
            if (
                len(source_anchor) != 2
                or not all(np.isfinite(source_anchor))
                or not np.isfinite(scale)
                or scale <= 0
            ):
                raise ValueError("Source transform needs a finite anchor and positive scale")
            alignment_frame = transform.get("sourceAlignmentFrame")
        elif layout_reference is None:
            alignment_frame = start_frame if reference_frame is None else reference_frame
            if alignment_frame < 0 or alignment_frame >= len(decoded_frames):
                raise ValueError("Reference frame extends past decoded source")
            with Image.open(decoded_frames[alignment_frame]) as reference:
                reference_bounds = remove_magenta_background(reference).getbbox()
        else:
            with Image.open(layout_reference) as reference:
                if reference.mode != "RGBA" or reference.getchannel("A").getextrema()[0] != 0:
                    raise ValueError("Layout reference must be a transparent RGBA image")
                bounds = reference.getbbox()
                if bounds is None:
                    raise ValueError("Layout reference has no visible character")
                if reference.width * stream["height"] != reference.height * stream["width"]:
                    raise ValueError("Layout reference and source need the same canvas aspect ratio")
                reference_bounds = (
                    bounds[0] * stream["width"] / reference.width,
                    bounds[1] * stream["height"] / reference.height,
                    bounds[2] * stream["width"] / reference.width,
                    bounds[3] * stream["height"] / reference.height,
                )
        if source_transform is None:
            left, top, right, bottom = reference_bounds
            source_anchor = ((left + right) / 2, bottom)
            scale = 400 / (bottom - top)
        durations = frame_durations(len(frames), fps)
        sample_indices = set(np.linspace(0, len(frames) - 1, 12, dtype=int).tolist())
        with zipfile.ZipFile(destination / "frames-512.zip", "w", zipfile.ZIP_DEFLATED) as archive:
            for index, frame_path in enumerate(frames):
                with Image.open(frame_path) as original:
                    transparent = remove_magenta_background(original)
                resized = transparent.resize(
                    (round(transparent.width * scale), round(transparent.height * scale)),
                    Image.Resampling.LANCZOS,
                )
                master = Image.new("RGBA", (512, 512))
                offset = (
                    round(256 - source_anchor[0] * scale),
                    round(448 - source_anchor[1] * scale),
                )
                master.paste(resized, offset)
                if color_matrix is not None:
                    master = apply_color_calibration(master, color_matrix, color_offset)
                master_path = temporary_path / "rgba.png"
                master.save(master_path)
                archive.write(master_path, f"{motion_id}/{motion_id}_{index:05d}.png")
                runtime = master.resize((cell_size, cell_size), Image.Resampling.LANCZOS)
                page_slot = index % cells_per_page
                x = (page_slot % 8) * cell_size
                y = (page_slot // 8) * cell_size
                atlas.paste(runtime, (x, y))
                manifest_frames.append({
                    "page": atlas_index, "x": x, "y": y,
                    "width": cell_size, "height": cell_size,
                    "durationMs": durations[index], "bounds": runtime.getbbox(),
                })
                preview_frames.append(runtime)
                if index in sample_indices:
                    sampled_images.append((index, runtime.copy()))
                if page_slot == cells_per_page - 1 or index == len(frames) - 1:
                    atlas.save(destination / f"atlas-{atlas_index:03d}.png")
                    atlas_index += 1
                    atlas = Image.new("RGBA", (2048, 2048))

    preview_frames[0].save(
        destination / "preview.webp", save_all=True, append_images=preview_frames[1:],
        duration=durations, loop=0, lossless=True, method=1,
    )
    contact = Image.new("RGB", (4 * 256, 3 * 280), "#f1f1ee")
    draw = ImageDraw.Draw(contact)
    for position, (index, frame) in enumerate(sampled_images):
        x = (position % 4) * 256
        y = (position // 4) * 280
        contact.paste(frame, (x, y), frame)
        draw.text((x + 8, y + 260), f"frame {index}", fill="#1b1b1e")
    contact.save(destination / "contact-sheet.jpg", quality=92)
    manifest = {
        "format": "dap-assistant-frame-sequence", "formatVersion": 1,
        "motion": motion_id, "sourceFile": source.name,
        "sourceWidth": stream["width"], "sourceHeight": stream["height"],
        "sourceStartFrame": start_frame,
        "sourceEndFrameExclusive": start_frame + len(manifest_frames),
        "sourceAlignmentFrame": alignment_frame,
        "frameArchive": {
            "file": "frames-512.zip", "directory": motion_id,
            "prefix": motion_id + "_", "digits": 5,
        },
        "fps": fps, "frameCount": len(manifest_frames),
        "durationMs": sum(durations), "cell": {"width": 256, "height": 256},
        "anchor": {"x": 128, "y": 224},
        "sourceAnchor": source_anchor, "sourceScaleTo512": scale,
        "pages": [f"atlas-{index:03d}.png" for index in range(atlas_index)],
        "frames": manifest_frames,
        "reviewStatus": "awaiting-visual-review",
    }
    if layout_reference is not None:
        manifest["sourceAlignmentImage"] = layout_reference.name
    if source_transform is not None:
        manifest["sourceAlignmentFile"] = source_transform.name
    if color_transform is not None:
        manifest["colorCalibrationFile"] = color_transform.name
    (destination / "clip.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return {"motion": motion_id, "frames": len(manifest_frames), "fps": fps, "pages": atlas_index}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--motion", required=True)
    parser.add_argument("--start-frame", type=int, default=0)
    parser.add_argument("--end-frame", type=int)
    alignment = parser.add_mutually_exclusive_group()
    alignment.add_argument("--reference-frame", type=int)
    alignment.add_argument("--layout-reference", type=Path)
    alignment.add_argument("--source-transform", type=Path)
    parser.add_argument("--color-transform", type=Path)
    arguments = parser.parse_args()
    print(json.dumps(export_motion(
        arguments.source, arguments.destination, arguments.motion,
        arguments.start_frame, arguments.end_frame, arguments.reference_frame,
        arguments.layout_reference, arguments.source_transform,
        arguments.color_transform,
    )))


if __name__ == "__main__":
    main()
