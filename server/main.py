from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from playwright.async_api import async_playwright

app = FastAPI()

# Allow requests from the Vite dev server and deployed frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, set this to the frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

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
