"""PDF Merge Tool — with error handling + password support"""

from pathlib import Path
import fitz


def merge_pdfs(input_paths: list[Path], output_path: Path, password: str = None) -> Path:
    """Merge multiple PDFs into one. Returns output path."""
    if not input_paths:
        raise ValueError("No input files provided")

    doc_out = fitz.open()
    try:
        for path in input_paths:
            if not path.suffix.lower() in (".pdf",):
                raise ValueError(f"Not a PDF file: {path.name}")
            doc_in = fitz.open(str(path))
            if doc_in.is_encrypted:
                if password:
                    doc_in.authenticate(password)
                if doc_in.is_encrypted:
                    raise ValueError(f"PDF is encrypted: {path.name} — provide a password")
            doc_out.insert_pdf(doc_in)
            doc_in.close()
        doc_out.save(str(output_path), garbage=4, deflate=True)
    except fitz.FileDataError as e:
        raise ValueError(f"Corrupted or invalid PDF: {e}")
    finally:
        doc_out.close()

    return output_path