"""mePDF Backend Package

Re-export the FastAPI app from main for uvicorn discovery.
Use `uvicorn backend:app` or `uvicorn backend.main:app`.
"""

from .main import app