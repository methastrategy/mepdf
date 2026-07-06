"""Images → PDF Tool — with error handling, natural sort"""

import re
from pathlib import Path
import fitz


def _natural_sort_key(path: Path):
    """Sort filenames naturally: page_2.png before page_10.png."""
    name = path.stem
    parts = re.split(r'(\d+)', name)
    return [int(p) if p.isdigit() else p.lower() for p in parts]


def images_to_pdf(input_paths: list[Path], output_path: Path) -> Path:
    """Combine images (PNG, JPG, etc.) into a single PDF."""
    if not input_paths:
        raise ValueError("No input images provided")

    valid_exts = {".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp"}
    image_paths = [p for p in input_paths if p.suffix.lower() in valid_exts]

    if not image_paths:
        raise ValueError(f"No supported image files found. Supported: {', '.join(valid_exts)}")

    image_paths.sort(key=_natural_sort_key)
    doc = fitz.open()

    try:
        for path in image_paths:
            try:
                img = fitz.open(str(path))
                rect = img[0].rect
                page = doc.new_page(width=rect.width, height=rect.height)
                page.insert_image(rect, filename=str(path))
                img.close()
            except fitz.FileDataError:
                raise ValueError(f"Cannot read image: {path.name}")
        doc.save(str(output_path), garbage=4, deflate=True)
    finally:
        doc.close()

    return output_path