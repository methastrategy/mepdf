"""PDF Rotate Tool — with error handling + password"""

from pathlib import Path
import fitz


def _parse_pages(pages_str: str, total: int) -> list[int]:
    """Parse pages like '1,3,5-7' into 0-indexed page numbers."""
    if total == 0:
        raise ValueError("PDF has no pages")

    if pages_str.strip().lower() == "all":
        return list(range(total))

    pages = []
    for part in pages_str.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            if "-" in part:
                a, b = part.split("-", 1)
                for i in range(int(a.strip()) - 1, int(b.strip())):
                    pages.append(i)
            else:
                pages.append(int(part) - 1)
        except ValueError:
            raise ValueError(f"Invalid page spec: '{part}'")

    valid = [p for p in pages if 0 <= p < total]
    if not valid:
        raise ValueError(f"No valid pages in range 1-{total}")

    return valid


def rotate_pdf(
    input_path: Path,
    output_path: Path,
    angle: int = 90,
    pages: str = "all",
    password: str = None,
) -> Path:
    """Rotate PDF pages. Angle must be 90, 180, or 270."""
    valid_angles = {90, 180, 270}
    if angle not in valid_angles:
        raise ValueError(f"Invalid angle: {angle}. Use 90, 180, or 270.")

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

    total = len(doc)
    if total == 0:
        doc.close()
        raise ValueError("PDF has no pages")

    target_pages = _parse_pages(pages, total)

    try:
        for p in target_pages:
            current = doc[p].rotation or 0
            doc[p].set_rotation((current + angle) % 360)
        doc.save(str(output_path), garbage=4, deflate=True)
    finally:
        doc.close()

    return output_path