"""mePDF Backend — PDF Toolbox API

All PDF operations using PyMuPDF (fitz).
Stateless: files go to /tmp/mepdf-uploads/, cleaned via BackgroundTasks.
"""

import os
import shutil
import uuid
import zipfile
import asyncio
import logging
from pathlib import Path
from typing import Optional

from fastapi import (
    FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
)
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import aiofiles
import fitz

from .tools.merge import merge_pdfs
from .tools.split import split_pdf
from .tools.compress import compress_pdf
from .tools.rotate import rotate_pdf
from .tools.extract_text import extract_text
from .tools.pdf_to_images import pdf_to_images
from .tools.images_to_pdf import images_to_pdf

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mepdf")

app = FastAPI(title="mePDF", version="1.1.0")

UPLOAD_DIR = Path("/tmp/mepdf-uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_FILE_SIZE = 200 * 1024 * 1024  # 200 MB

# ─── Frontend ───────────────────────────────────────────────────────────────

frontend_path = Path(__file__).resolve().parent.parent / "static"
app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")


@app.get("/", response_class=HTMLResponse)
async def root():
    idx = frontend_path / "index.html"
    if not idx.exists():
        return HTMLResponse("<h1>mePDF</h1><p>Frontend not built yet.</p>")
    async with aiofiles.open(str(idx), "r") as f:
        content = await f.read()
    return HTMLResponse(content)


@app.get("/health")
async def health():
    return {"status": "ok", "app": "mePDF", "version": "1.1.0"}


# ─── Helpers ─────────────────────────────────────────────────────────────────

ALLOWED_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp"}
PDF_MAGIC = b"%PDF"


def get_session_dir() -> Path:
    session_id = uuid.uuid4().hex[:12]
    session_dir = UPLOAD_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    return session_dir


def validate_pdf(content: bytes, filename: str):
    """Validate that the uploaded file is a PDF."""
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(400, f"Invalid file type: '{filename}' — expected .pdf")
    if not content.startswith(PDF_MAGIC):
        raise HTTPException(400, f"File '{filename}' is not a valid PDF (missing %PDF header)")


def validate_image(content: bytes, filename: str):
    """Validate image file extension."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTS:
        raise HTTPException(400, f"Unsupported image format: '{filename}' — use {', '.join(ALLOWED_IMAGE_EXTS)}")


def sanitize_filename(filename: str) -> str:
    """Remove path traversal and special chars from filename."""
    name = Path(filename).name  # strips any path
    # Replace problematic characters
    safe = "".join(c if c.isalnum() or c in "._- " else "_" for c in name)
    return safe or "file"


async def save_upload(file: UploadFile, dest_dir: Path, expect_pdf: bool = True) -> Path:
    """Save a single upload to dest_dir, return path."""
    safe_name = sanitize_filename(file.filename or "file")
    dest = dest_dir / safe_name
    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, f"File too large: {file.filename} (max 200MB)")

    if expect_pdf:
        validate_pdf(content, safe_name)
    else:
        validate_image(content, safe_name)

    dest.write_bytes(content)
    return dest


async def save_many(files: list[UploadFile], dest_dir: Path, expect_pdf: bool = True) -> list[Path]:
    """Save multiple uploads concurrently."""
    tasks = [save_upload(f, dest_dir, expect_pdf) for f in files]
    return await asyncio.gather(*tasks)


def zip_output(paths: list[Path], zip_path: Path) -> Path:
    """Zip a list of files into zip_path."""
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in paths:
            zf.write(p, p.name)
    return zip_path


def cleanup_dir(session_dir: Path):
    """Remove session directory."""
    try:
        shutil.rmtree(session_dir, ignore_errors=True)
    except Exception:
        pass


# ─── API Routes ──────────────────────────────────────────────────────────────


@app.post("/api/merge")
async def api_merge(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    password: str = Form(""),
):
    session_dir = get_session_dir()
    try:
        saved = await save_many(files, session_dir, expect_pdf=True)
        output = session_dir / "merged.pdf"
        merge_pdfs(saved, output, password=password or None)
    except ValueError as e:
        cleanup_dir(session_dir)
        return JSONResponse({"error": str(e)}, status_code=400)

    background_tasks.add_task(cleanup_dir, session_dir)
    return FileResponse(output, filename="merged.pdf", media_type="application/pdf")


@app.post("/api/split")
async def api_split(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    ranges: str = Form("all"),
    merge_output: bool = Form(False),
    password: str = Form(""),
):
    session_dir = get_session_dir()
    try:
        saved = await save_upload(file, session_dir, expect_pdf=True)
        outputs = split_pdf(saved, session_dir, ranges, merge_output, password=password or None)
    except ValueError as e:
        cleanup_dir(session_dir)
        return JSONResponse({"error": str(e)}, status_code=400)

    background_tasks.add_task(cleanup_dir, session_dir)

    if len(outputs) == 1:
        return FileResponse(outputs[0], filename=outputs[0].name, media_type="application/pdf")

    zip_path = session_dir / "split_pages.zip"
    zip_output(outputs, zip_path)
    return FileResponse(zip_path, filename="split_pages.zip", media_type="application/zip")


@app.post("/api/compress")
async def api_compress(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    quality: str = Form("ebook"),
    password: str = Form(""),
):
    session_dir = get_session_dir()
    try:
        saved = await save_upload(file, session_dir, expect_pdf=True)
        result = compress_pdf(saved, session_dir / f"compressed_{file.filename}", quality, password=password or None)
    except ValueError as e:
        cleanup_dir(session_dir)
        return JSONResponse({"error": str(e)}, status_code=400)

    background_tasks.add_task(cleanup_dir, session_dir)

    # Return compression metadata via headers
    headers = {
        "X-Compress-Ratio": str(result["ratio"]),
        "X-Compress-Method": result["method"],
        "X-Original-Size": str(result["original_size"]),
        "X-Compressed-Size": str(result["compressed_size"]),
    }
    return FileResponse(
        result["path"],
        filename=result["path"].name,
        media_type="application/pdf",
        headers=headers,
    )


@app.post("/api/rotate")
async def api_rotate(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    angle: int = Form(90),
    pages: str = Form("all"),
    password: str = Form(""),
):
    session_dir = get_session_dir()
    try:
        saved = await save_upload(file, session_dir, expect_pdf=True)
        output = session_dir / f"rotated_{file.filename}"
        rotate_pdf(saved, output, angle, pages, password=password or None)
    except ValueError as e:
        cleanup_dir(session_dir)
        return JSONResponse({"error": str(e)}, status_code=400)

    background_tasks.add_task(cleanup_dir, session_dir)
    return FileResponse(output, filename=output.name, media_type="application/pdf")


@app.post("/api/extract-text")
async def api_extract_text(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    password: str = Form(""),
):
    session_dir = get_session_dir()
    try:
        saved = await save_upload(file, session_dir, expect_pdf=True)
        text = extract_text(saved, password=password or None)
    except ValueError as e:
        cleanup_dir(session_dir)
        return JSONResponse({"error": str(e)}, status_code=400)

    txt_path = session_dir / f"{Path(file.filename).stem}.txt"
    txt_path.write_text(text, encoding="utf-8")
    background_tasks.add_task(cleanup_dir, session_dir)
    return FileResponse(txt_path, filename=txt_path.name, media_type="text/plain; charset=utf-8")


@app.post("/api/pdf-to-images")
async def api_pdf_to_images(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    dpi: int = Form(200),
    password: str = Form(""),
):
    session_dir = get_session_dir()
    try:
        saved = await save_upload(file, session_dir, expect_pdf=True)
        images = pdf_to_images(saved, session_dir, dpi, password=password or None)
    except ValueError as e:
        cleanup_dir(session_dir)
        return JSONResponse({"error": str(e)}, status_code=400)

    zip_path = session_dir / "pdf_pages.zip"
    zip_output(images, zip_path)
    background_tasks.add_task(cleanup_dir, session_dir)
    return FileResponse(zip_path, filename="pdf_pages.zip", media_type="application/zip")


@app.post("/api/images-to-pdf")
async def api_images_to_pdf(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
):
    session_dir = get_session_dir()
    try:
        saved = await save_many(files, session_dir, expect_pdf=False)
        output = session_dir / "images_combined.pdf"
        images_to_pdf(saved, output)
    except ValueError as e:
        cleanup_dir(session_dir)
        return JSONResponse({"error": str(e)}, status_code=400)

    background_tasks.add_task(cleanup_dir, session_dir)
    return FileResponse(output, filename="images_combined.pdf", media_type="application/pdf")


# ─── Page Count API (for preview) ──────────────────────


@app.post("/api/page-count")
async def api_page_count(file: UploadFile = File(...)):
    """Return page count for a PDF (lightweight, no file saved)."""
    content = await file.read()
    validate_pdf(content, file.filename or "file.pdf")

    import io
    import tempfile
    tmp = Path(tempfile.mkstemp(suffix=".pdf")[1])
    try:
        tmp.write_bytes(content)
        doc = fitz.open(str(tmp))
        if doc.is_encrypted:
            doc.close()
            return {"pages": -1, "filename": file.filename, "encrypted": True}
        count = len(doc)
        doc.close()
        return {"pages": count, "filename": file.filename}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    finally:
        tmp.unlink(missing_ok=True)


# ─── HTMX Tool Fragments ──────────────────────────────────────────────────

TOOL_DESCRIPTIONS = {
    "merge": {
        "title": "Merge PDFs",
        "desc": "Upload multiple PDF files. They will be combined in the order you select them.",
        "input_type": "multiple",
    },
    "split": {
        "title": "Split PDF",
        "desc": "Extract specific page ranges from a PDF. Format: <code>1-3,5,7-9</code> (use <code>all</code> for every page as separate files).",
        "input_type": "single",
    },
    "compress": {
        "title": "Compress PDF",
        "desc": "Reduce PDF file size. Choose quality level: Screen (smallest) → Ebook (balanced) → Printer (high) → Prepress (near-lossless).",
        "input_type": "single",
    },
    "rotate": {
        "title": "Rotate PDF",
        "desc": "Rotate all pages or specific pages by 90°, 180°, or 270°.",
        "input_type": "single",
    },
    "extract-text": {
        "title": "Extract Text",
        "desc": "Extract all text content from a PDF as a plain text file.",
        "input_type": "single",
    },
    "pdf-to-images": {
        "title": "PDF → Images",
        "desc": "Convert each PDF page to a PNG image, bundled in a ZIP file.",
        "input_type": "single",
    },
    "images-to-pdf": {
        "title": "Images → PDF",
        "desc": "Combine multiple images (PNG, JPG, WEBP) into a single PDF.",
        "input_type": "images",
    },
}


@app.get("/tool/{tool_name}", response_class=HTMLResponse)
async def tool_fragment(tool_name: str):
    info = TOOL_DESCRIPTIONS.get(tool_name)
    if not info:
        return HTMLResponse("<p class='error'>Unknown tool</p>")
    return await _render_tool_fragment(tool_name, info)


async def _render_tool_fragment(tool_name: str, info: dict) -> str:
    """Render HTMX fragment for a specific tool form.

    Note: JS event handlers live in /static/js/tool-form.js (event delegation),
    NOT inline. Only structural HTML is returned here.
    """
    extra = ""
    if tool_name == "split":
        extra = """
<div class="form-row">
  <label>
    Page ranges:
    <input type="text" name="ranges" value="all" placeholder="1-3,5,7-9 or 'all'" />
  </label>
  <label class="checkbox-label">
    <input type="checkbox" name="merge_output" value="true" />
    Merge into one file
  </label>
</div>"""
    elif tool_name == "compress":
        extra = """
<div class="form-row">
  <label>Quality:</label>
  <select name="quality">
    <option value="screen">Screen (smallest)</option>
    <option value="ebook" selected>Ebook (balanced)</option>
    <option value="printer">Printer (high quality)</option>
    <option value="prepress">Prepress (near-lossless)</option>
  </select>
</div>"""
    elif tool_name == "rotate":
        extra = """
<div class="form-row">
  <label>Angle:</label>
  <select name="angle">
    <option value="90">90° Clockwise</option>
    <option value="180">180°</option>
    <option value="270">90° Counter-clockwise</option>
  </select>
  <label>
    Pages:
    <input type="text" name="pages" value="all" placeholder="all or 1,3,5-7" />
  </label>
</div>"""
    elif tool_name == "pdf-to-images":
        extra = """
<div class="form-row">
  <label>
    DPI:
    <input type="number" name="dpi" value="200" min="72" max="600" />
  </label>
</div>"""

    input_attrs = 'name="files"'
    accept = ""
    if info["input_type"] == "multiple":
        input_attrs += ' multiple'
        accept = '.pdf'
    elif info["input_type"] == "images":
        input_attrs += ' multiple'
        accept = '.png,.jpg,.jpeg,.webp'
    else:
        accept = '.pdf'

    if accept:
        input_attrs += f' accept="{accept}"'

    list_display = ""
    if info["input_type"] in ("multiple", "images"):
        list_display = '<div class="file-list" id="file-list"></div>'

    return f"""
<div class="tool-panel" id="tool-panel" data-tool="{tool_name}">
  <h2>{info['title']}</h2>
  <p class="tool-desc">{info['desc']}</p>

  <form hx-post="/api/{tool_name}"
        hx-target="#result-area"
        hx-indicator="#spinner"
        hx-encoding="multipart/form-data"
        class="tool-form"
        id="tool-form">

    <div class="drop-zone" id="drop-zone" data-tool="{tool_name}">
      <div class="drop-content">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
        </svg>
        <p><strong>Drop files here</strong> or click to browse</p>
        <input type="file" {input_attrs} id="file-input" />
      </div>
      {list_display}
    </div>

    {extra}

    <details class="advanced-options">
      <summary>Advanced</summary>
      <div class="form-row">
        <label>
          Password:
          <input type="password" name="password" value="" placeholder="For encrypted PDFs" />
        </label>
      </div>
    </details>

    <button type="submit" class="btn-primary" id="submit-btn">
      <span class="btn-text">Process</span>
      <span class="spinner" id="spinner"></span>
    </button>
  </form>

  <div id="result-area"></div>
  <div id="page-info" class="page-info"></div>
</div>"""