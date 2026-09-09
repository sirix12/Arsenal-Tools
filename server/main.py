import asyncio
import json
import os
import uuid
from datetime import datetime, timezone

import httpx
from azure.core.exceptions import AzureError, ResourceNotFoundError
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from playwright.async_api import async_playwright

try:  # Supports both `uvicorn main:app` in the image and `import server.main` in tests.
    from blob_storage import (
        DOCUMENT_CAP_BYTES,
        StorageConfigurationError,
        blob_name,
        blob_properties,
        delete_document_blob,
        document_usage_bytes,
        download_document,
        download_document_with_size,
        encode_metadata,
        ensure_container,
        get_container_client,
        list_documents_fast,
        read_all_documents,
        serialize_document,
        upload_document,
    )
except ModuleNotFoundError as exc:
    if exc.name != "blob_storage":
        raise
    from server.blob_storage import (
        DOCUMENT_CAP_BYTES,
        StorageConfigurationError,
        blob_name,
        blob_properties,
        delete_document_blob,
        document_usage_bytes,
        download_document,
        download_document_with_size,
        encode_metadata,
        ensure_container,
        get_container_client,
        list_documents_fast,
        read_all_documents,
        serialize_document,
        upload_document,
    )


app = FastAPI()

# Allow requests from the Vite dev server and deployed frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, set this to the frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# This lock provides serial capacity checks within one server process. Distributed
# deployments need an external lease/lock if concurrent writes must be coordinated.
storage_write_lock = asyncio.Lock()

QUIZ_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "code": {"type": "string"},
                    "language": {"type": "string"},
                    "options": {
                        "type": "array",
                        "minItems": 2,
                        "maxItems": 4,
                        "items": {"type": "string"},
                    },
                    "correctAnswer": {"type": "string"},
                    "explanation": {"type": "string"},
                },
                "required": [
                    "question",
                    "code",
                    "language",
                    "options",
                    "correctAnswer",
                    "explanation",
                ],
                "additionalProperties": False,
            },
        }
    },
    "required": ["questions"],
    "additionalProperties": False,
}

QUIZ_SYSTEM_PROMPT = """Convert the user's pasted quiz into the requested JSON structure.
Preserve every question, option, correct answer, explanation, and code snippet that is present.
Infer a missing explanation only when necessary, and use an empty string for code and language when there is no code.
Each correctAnswer must exactly match one option. Do not add markdown or commentary."""


def error_response(message: str, status_code: int) -> JSONResponse:
    return JSONResponse(content={"error": message}, status_code=status_code)


def storage_error_response(exc: Exception) -> JSONResponse:
    if isinstance(exc, ResourceNotFoundError):
        return error_response("Document not found", 404)
    if isinstance(exc, StorageConfigurationError):
        return error_response("Azure storage is not configured", 503)
    # Do not return SDK exception text: it can include account or request details.
    if isinstance(exc, (AzureError, OSError, ValueError, json.JSONDecodeError)):
        return error_response("Azure storage request failed", 502)
    return error_response("Azure storage request failed", 502)


def quiz_error_response(exc: Exception) -> JSONResponse:
    if isinstance(exc, httpx.TimeoutException):
        return error_response("Quiz conversion timed out. Please try again.", 504)
    if isinstance(exc, httpx.HTTPStatusError):
        return error_response("Quiz conversion service rejected the request", 502)
    if isinstance(exc, (ValueError, KeyError, TypeError, json.JSONDecodeError)):
        return error_response("Quiz conversion returned an invalid response", 502)
    return error_response("Quiz conversion failed", 502)


async def container_client():
    container = await asyncio.to_thread(get_container_client)
    await asyncio.to_thread(ensure_container, container)
    return container


def document_listing(document: dict) -> dict:
    content = document.get("content", "")
    if not isinstance(content, str):
        content = str(content)
    return {
        "id": document["id"],
        "title": document["title"],
        "preview": content[:150] or "",
        "word_count": len(content.split()),
        "created_at": document.get("created_at", ""),
        "updated_at": document.get("updated_at", ""),
    }


# ---------- Health ----------
@app.get("/health")
async def health_check():
    return {"status": "healthy"}


# ---------- Quiz conversion (Azure OpenAI) ----------
@app.post("/api/quiz/convert")
async def convert_quiz(request: Request):
    data = await request.json()
    source = data.get("source")
    if not isinstance(source, str) or not source.strip():
        return error_response("Quiz text is required", 400)
    if len(source) > 100_000:
        return error_response("Quiz text must not exceed 100,000 characters", 413)

    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT", "").rstrip("/")
    api_key = os.environ.get("AZURE_OPENAI_API_KEY", "")
    deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "")
    if not (endpoint and api_key and deployment):
        return error_response("Quiz conversion is not configured", 503)

    url = f"{endpoint}/openai/v1/chat/completions"
    payload = {
        "model": deployment,
        "messages": [
            {"role": "system", "content": QUIZ_SYSTEM_PROMPT},
            {"role": "user", "content": source},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "quiz_questions",
                "strict": True,
                "schema": QUIZ_SCHEMA,
            },
        },
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                url,
                headers={"api-key": api_key, "Content-Type": "application/json"},
                json=payload,
            )
            response.raise_for_status()
        result = json.loads(response.json()["choices"][0]["message"]["content"])
        questions = result["questions"]
        if not isinstance(questions, list) or not questions:
            raise ValueError("No questions returned")
        for question in questions:
            if question["correctAnswer"] not in question["options"]:
                raise ValueError("Correct answer is not an option")
        return questions
    except Exception as exc:
        return quiz_error_response(exc)


# ---------- PDF generation ----------
@app.post("/api/pdf/generate")
async def generate_pdf(request: Request):
    """Accept HTML content as JSON and return a PDF file."""
    data = await request.json()
    html_content = data.get("html", "")

    if not html_content:
        return Response(content="No HTML content provided", status_code=400)

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

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        )
        page = await browser.new_page()
        await page.set_content(html_content, wait_until="networkidle")
        pdf_bytes = await page.pdf(format="A4", print_background=True)
        await browser.close()

    if pdf_bytes:
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=generated.pdf"},
        )
    return Response(content="Failed to generate PDF", status_code=500)


# ---------- Document CRUD (Azure Blob-backed) ----------
@app.get("/api/docs")
async def list_docs():
    """Return all saved documents without full content for listing."""
    try:
        container = await container_client()
        docs = await asyncio.to_thread(list_documents_fast, container)
        # Blob listing order is not part of Azure's API, so retain newest-first UI behavior.
        docs.sort(
            key=lambda d: (d.get("updated_at", ""), d.get("created_at", "")),
            reverse=True,
        )
        return docs
    except Exception as exc:
        return storage_error_response(exc)


@app.get("/api/docs/{doc_id}")
async def get_doc(doc_id: str):
    """Return a single document with full content."""
    try:
        container = await container_client()
        name = blob_name(doc_id)
        if name is None:
            return error_response("Document not found", 404)
        return await asyncio.to_thread(download_document, container, name)
    except Exception as exc:
        return storage_error_response(exc)


@app.post("/api/docs")
async def create_doc(request: Request):
    """Create a new document, subject to the application-level payload cap."""
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
    payload = serialize_document(new_doc)
    name = blob_name(new_doc["id"])
    meta = encode_metadata(new_doc)

    try:
        if name is None:  # UUIDs generated above are always valid; keep the guard explicit.
            return error_response("Invalid document ID", 500)
        async with storage_write_lock:
            container = await container_client()
            usage = await asyncio.to_thread(document_usage_bytes, container)
            if usage + len(payload) > DOCUMENT_CAP_BYTES:
                return error_response("Document storage capacity exceeded", 413)
            await asyncio.to_thread(
                upload_document,
                container,
                name,
                payload,
                overwrite=False,
                metadata=meta,
            )
        return new_doc
    except Exception as exc:
        return storage_error_response(exc)


@app.put("/api/docs/{doc_id}")
async def update_doc(doc_id: str, request: Request):
    """Update an existing document and account for its replaced blob size."""
    data = await request.json()
    name = blob_name(doc_id)
    if name is None:
        return error_response("Document not found", 404)

    try:
        async with storage_write_lock:
            container = await container_client()
            current, current_size = await asyncio.to_thread(
                download_document_with_size, container, name
            )
            if "title" in data:
                current["title"] = data["title"]
            if "content" in data:
                current["content"] = data["content"]
            current["updated_at"] = datetime.now(timezone.utc).isoformat()
            payload = serialize_document(current)
            usage = await asyncio.to_thread(document_usage_bytes, container)
            if usage - current_size + len(payload) > DOCUMENT_CAP_BYTES:
                return error_response("Document storage capacity exceeded", 413)
            meta = encode_metadata(current)
            await asyncio.to_thread(
                upload_document,
                container,
                name,
                payload,
                overwrite=True,
                metadata=meta,
            )
        return current
    except Exception as exc:
        return storage_error_response(exc)


@app.delete("/api/docs/{doc_id}")
async def delete_doc(doc_id: str):
    """Delete a document by ID."""
    name = blob_name(doc_id)
    if name is None:
        return error_response("Document not found", 404)
    try:
        container = await container_client()
        await asyncio.to_thread(blob_properties, container, name)
        await asyncio.to_thread(delete_document_blob, container, name)
        return {"status": "deleted", "id": doc_id}
    except Exception as exc:
        return storage_error_response(exc)
