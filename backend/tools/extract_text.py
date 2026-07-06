"""PDF Text Extraction Tool — with error handling + password"""

from pathlib import Path
import fitz


def extract_text(input_path: Path, password: str = None) -> str:
    """Extract all text from a PDF. Returns plain text string."""
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

    parts = []
    try:
        for page in doc:
            text = page.get_text()
            if text.strip():
                parts.append(text)
    finally:
        doc.close()

    result = "\n\n".join(parts)
    if not result.strip():
        raise ValueError("No text could be extracted — this PDF may contain only scanned images")

    return result