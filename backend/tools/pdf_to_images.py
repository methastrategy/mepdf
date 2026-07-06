"""PDF → Images Tool — with error handling + password"""

from pathlib import Path
import fitz


def pdf_to_images(input_path: Path, output_dir: Path, dpi: int = 200, password: str = None) -> list[Path]:
    """Convert each PDF page to a PNG image. Returns list of image paths."""
    if dpi < 72 or dpi > 600:
        raise ValueError("DPI must be between 72 and 600")

    try:
        doc = fitz.open(str(input_path))
        if doc.is_encrypted:
            if password:
                doc.authenticate(password)
            if doc.is_encrypted:
                doc.close()
                raise ValueError("PDF is encrypted — provide a password")
    except fitz.FileDataError as e:
        raise ValueError(f"Corrupted or invalid PDF: {e}")

    if len(doc) == 0:
        doc.close()
        raise ValueError("PDF has no pages")

    outputs = []
    try:
        for i, page in enumerate(doc):
            pix = page.get_pixmap(dpi=dpi)
            img_path = output_dir / f"page_{i+1:04d}.png"
            pix.save(str(img_path))
            outputs.append(img_path)
    finally:
        doc.close()

    return outputs