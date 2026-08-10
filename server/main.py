from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from playwright.async_api import async_playwright
import httpx
import json
import os
import uuid
from datetime import datetime, timezone

app = FastAPI()

# Allow requests from the Vite dev server and deployed frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, set this to the frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Config ----------
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GIST_ID = os.environ.get("GIST_ID", "")
GIST_FILE = "docs.json"
GIST_API = f"https://api.github.com/gists/{GIST_ID}"


# ---------- Gist helpers ----------
def _gist_headers():
    return {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def _read_gist_docs() -> list[dict]:
    """Read and parse docs.json from the gist."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(GIST_API, headers=_gist_headers())
        resp.raise_for_status()
        gist_data = resp.json()
        raw = gist_data.get("files", {}).get(GIST_FILE, {}).get("content", "[]")
        return json.loads(raw)


async def _write_gist_docs(docs: list[dict]):
    """Write the docs array back to docs.json in the gist."""
    payload = {
        "files": {
            GIST_FILE: {
                "content": json.dumps(docs, ensure_ascii=False, indent=2)
            }
        }
    }
    async with httpx.AsyncClient() as client:
        resp = await client.patch(GIST_API, headers=_gist_headers(), json=payload)
        resp.raise_for_status()


# ---------- Health ----------
@app.get("/health")
async def health_check():
    return {"status": "healthy"}


# ---------- PDF generation ----------
@app.post("/api/pdf/generate")
async def generate_pdf(request: Request):
    """
    Accepts HTML content as JSON and returns a PDF file.
    """
    data = await request.json()
    html_content = data.get("html", "")
        
    if not html_content:
        return Response(content="No HTML content provided", status_code=400)
        
    # Wrap in basic HTML structure if it doesn't have one
    if "<html>" not in html_content.lower():
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{
                    font-family: sans-serif;
                    margin: 2cm;
                }}
            </style>
        </head>
        <body>
            {html_content}
        </body>
        </html>
        """

    pdf_bytes = None
    
    # Generate PDF using Playwright
    async with async_playwright() as p:
        # headless=True is the default. args can be tuned to reduce memory if needed.
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"])
        page = await browser.new_page()
        await page.set_content(html_content, wait_until="networkidle")
        
        # Print to PDF
        pdf_bytes = await page.pdf(format="A4", print_background=True)
        
        await browser.close()
        
    if pdf_bytes:
        return Response(
            content=pdf_bytes, 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=generated.pdf"}
        )
    else:
        return Response(content="Failed to generate PDF", status_code=500)


# ---------- Document CRUD (Gist-backed) ----------
@app.get("/api/docs")
async def list_docs():
    """Return all saved documents (without full content for listing)."""
    if not GITHUB_TOKEN or not GIST_ID:
        return Response(
            content=json.dumps({"error": "Gist storage not configured"}),
            status_code=503,
            media_type="application/json",
        )
    try:
        docs = await _read_gist_docs()
        # Return lightweight list (content truncated for preview)
        listing = []
        for d in docs:
            listing.append({
                "id": d["id"],
                "title": d["title"],
                "preview": (d.get("content", "")[:150] or ""),
                "word_count": len(d.get("content", "").split()),
                "created_at": d.get("created_at", ""),
                "updated_at": d.get("updated_at", ""),
            })
        return listing
    except Exception as e:
        return Response(
            content=json.dumps({"error": str(e)}),
            status_code=500,
            media_type="application/json",
        )


@app.get("/api/docs/{doc_id}")
async def get_doc(doc_id: str):
    """Return a single document with full content."""
    try:
        docs = await _read_gist_docs()
        for d in docs:
            if d["id"] == doc_id:
                return d
        return Response(
            content=json.dumps({"error": "Document not found"}),
            status_code=404,
            media_type="application/json",
        )
    except Exception as e:
        return Response(
            content=json.dumps({"error": str(e)}),
            status_code=500,
            media_type="application/json",
        )


@app.post("/api/docs")
async def create_doc(request: Request):
    """Create a new document."""
    data = await request.json()
    title = data.get("title", "Untitled")
    content = data.get("content", "")

    now = datetime.now(timezone.utc).isoformat()
    new_doc = {
        "id": str(uuid.uuid4()),
        "title": title,
        "content": content,
        "created_at": now,
        "updated_at": now,
    }

    try:
        docs = await _read_gist_docs()
        docs.insert(0, new_doc)  # newest first
        await _write_gist_docs(docs)
        return new_doc
    except Exception as e:
        return Response(
            content=json.dumps({"error": str(e)}),
            status_code=500,
            media_type="application/json",
        )


@app.put("/api/docs/{doc_id}")
async def update_doc(doc_id: str, request: Request):
    """Update an existing document."""
    data = await request.json()

    try:
        docs = await _read_gist_docs()
        for d in docs:
            if d["id"] == doc_id:
                if "title" in data:
                    d["title"] = data["title"]
                if "content" in data:
                    d["content"] = data["content"]
                d["updated_at"] = datetime.now(timezone.utc).isoformat()
                await _write_gist_docs(docs)
                return d
        return Response(
            content=json.dumps({"error": "Document not found"}),
            status_code=404,
            media_type="application/json",
        )
    except Exception as e:
        return Response(
            content=json.dumps({"error": str(e)}),
            status_code=500,
            media_type="application/json",
        )


@app.delete("/api/docs/{doc_id}")
async def delete_doc(doc_id: str):
    """Delete a document by ID."""
    try:
        docs = await _read_gist_docs()
        original_len = len(docs)
        docs = [d for d in docs if d["id"] != doc_id]
        if len(docs) == original_len:
            return Response(
                content=json.dumps({"error": "Document not found"}),
                status_code=404,
                media_type="application/json",
            )
        await _write_gist_docs(docs)
        return {"status": "deleted", "id": doc_id}
    except Exception as e:
        return Response(
            content=json.dumps({"error": str(e)}),
            status_code=500,
            media_type="application/json",
        )

