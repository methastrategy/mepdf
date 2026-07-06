"""PDF Split Tool — with error handling + bounds checking + password"""

from pathlib import Path
import fitz


def _parse_ranges(ranges_str: str, total_pages: int) -> list[tuple[int, int]]:
    """Parse page range string like '1-3,5,7-9' into list of (start, end) 0-indexed."""
    if total_pages == 0:
        raise ValueError("PDF has no pages")

    if ranges_str.strip().lower() == "all":
        return [(i, i) for i in range(total_pages)]

    ranges = []
    for part in ranges_str.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            if "-" in part:
                a, b = part.split("-", 1)
                start = int(a.strip()) - 1
                end = int(b.strip()) - 1
            else:
                start = int(part) - 1
                end = start

            # Clamp to valid range
            start = max(0, min(start, total_pages - 1))
            end = max(start, min(end, total_pages - 1))
            ranges.append((start, end))
        except ValueError:
            raise ValueError(f"Invalid page range: '{part}' — use format like '1-3,5,7-9'")

    if not ranges:
        raise ValueError("No valid page ranges specified")

    return ranges


def _open_pdf(path: Path, password: str = None):
    """Open PDF, handling encryption. Returns fitz.Document."""
    doc = fitz.open(str(path))
    if doc.is_encrypted:
        if password:
            doc.authenticate(password)
        if doc.is_encrypted:
            doc.close()
            raise ValueError(f"PDF is encrypted: {path.name} — provide a password")
    return doc


def split_pdf(
    input_path: Path,
    output_dir: Path,
    ranges_str: str = "all",
    merge_output: bool = False,
    password: str = None,
) -> list[Path]:
    """Split PDF into page ranges. Returns list of output file paths."""
    try:
        doc = _open_pdf(input_path, password)
    except fitz.FileDataError as e:
        raise ValueError(f"Corrupted or invalid PDF: {e}")

    total = len(doc)
    if total == 0:
        doc.close()
        raise ValueError("PDF has no pages")

    ranges = _parse_ranges(ranges_str, total)
    outputs = []

    try:
        if merge_output:
            out_doc = fitz.open()
            for start, end in ranges:
                out_doc.insert_pdf(doc, from_page=start, to_page=end)
            out_path = output_dir / "split_combined.pdf"
            out_doc.save(str(out_path), garbage=4, deflate=True)
            out_doc.close()
            outputs.append(out_path)
        else:
            for i, (start, end) in enumerate(ranges):
                out_doc = fitz.open()
                out_doc.insert_pdf(doc, from_page=start, to_page=end)
                label = f"p{start+1}" if start == end else f"p{start+1}-{end+1}"
                out_path = output_dir / f"split_{i+1}_{label}.pdf"
                out_doc.save(str(out_path), garbage=4, deflate=True)
                out_doc.close()
                outputs.append(out_path)
    finally:
        doc.close()

    return outputs