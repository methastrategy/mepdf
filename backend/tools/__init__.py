"""PDF Merge Tool"""

from pathlib import Path
import fitz


def merge_pdfs(input_paths: list[Path], output_path: Path) -> Path:
    """Merge multiple PDFs into one. Returns output path."""
    doc_out = fitz.open()
    for path in input_paths:
        doc_in = fitz.open(str(path))
        doc_out.insert_pdf(doc_in)
        doc_in.close()
    doc_out.save(str(output_path), garbage=4, deflate=True)
    doc_out.close()
    return output_path
