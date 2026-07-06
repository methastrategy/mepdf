"""mePDF — Vercel Serverless Entry Point

Wraps the FastAPI app for Vercel's ASGI-compatible Python runtime.
"""
import sys
import os

# Add backend directory to path so imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.main import app

# Vercel ASGI handler
handler = app