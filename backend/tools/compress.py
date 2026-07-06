"""PDF Compress Tool — with error handling + ratio reporting + password"""

import logging
import shutil
import subprocess
from pathlib import Path
import fitz

logger = logging.getLogger("mepdf.compress")


def _gs_available() -> bool:
    return shutil.which("gs") is not None


def _open_pdf(path: Path, password: str = None):
    """Open PDF, handling encryption. Returns fitz.Document."""
    doc = fitz.open(str(path))
    if doc.is_encrypted:
        if password:
            doc.authenticate(password)
        if doc.is_encrypted:
            doc.close()
            raise ValueError(f"PDF is encrypted — provide a password")
    return doc


def compress_pdf(input_path: Path, output_path: Path, quality: str = "ebook", password: str = None) -> dict:
    """Compress PDF. Returns {path, original_size, compressed_size, ratio, method}.

    quality: screen|ebook|printer|prepress
    Falls back to PyMuPDF if Ghostscript unavailable.
    """
    quality_map = {
        "screen": "/screen",
        "ebook": "/ebook",
        "printer": "/printer",
        "prepress": "/prepress",
    }
    gs_setting = quality_map.get(quality, "/ebook")
    original_size = input_path.stat().st_size
    method = "pymupdf"

    if _gs_available():
        try:
            subprocess.run(
                [
                    "gs",
                    "-sDEVICE=pdfwrite",
                    f"-dPDFSETTINGS={gs_setting}",
                    "-dNOPAUSE",
                    "-dBATCH",
                    "-dCompatibilityLevel=1.7",
                    "-dEmbedAllFonts=true",
                    "-dSubsetFonts=true",
                    "-dDetectDuplicateImages=true",
                    "-dFastWebView=true",
                    f"-sOutputFile={output_path}",
                    str(input_path),
                ],
                check=True,
                capture_output=True,
                timeout=120,
            )
            method = "ghostscript"
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            logger.warning("Ghostscript failed, falling back to PyMuPDF: %s", e)
            output_path.unlink(missing_ok=True)

    if method == "pymupdf":
        doc = _open_pdf(input_path, password)
        try:
            doc.save(
                str(output_path),
                garbage=4,
                deflate=True,
                clean=True,
                linear=True,
            )
        finally:
            doc.close()

    compressed_size = output_path.stat().st_size
    ratio = (1 - compressed_size / original_size) * 100 if original_size > 0 else 0

    return {
        "path": output_path,
        "original_size": original_size,
        "compressed_size": compressed_size,
        "ratio": round(ratio, 1),
        "method": method,
    }