# ⚡ Arsenal Tools

Arsenal Tools is a premium, high-performance suite of browser-based productivity tools. Built with a focus on privacy, security, and aesthetics, all tools process your files directly in the browser—your files never leave your device.

---

## 🛠️ Included Tools

### 1. 📝 MD Reader Pro
A robust Markdown reader and editor with full preview capabilities.
- **LaTeX Math Support:** Built-in renders for complex mathematical formulas using KaTeX.
- **Syntax Highlighting:** Live highlighting of code blocks.
- **Rich Previewing:** Supports tables, task lists, and custom styling.
- **Exporting:** Save files back to `.md` or export directly to PDF.

### 2. 🧰 PDF Toolkit
A client-side utility suite for common PDF manipulation tasks.
- **Merge & Split:** Easily combine multiple PDFs or extract specific pages.
- **Compression:** Optimize and reduce PDF file sizes.
- **Conversions:** Convert Word documents (`.docx`) and images (`.png`, `.jpg`) to PDF in the browser.
- **Extraction:** Export PDF pages as standalone images or extract textual content.

### 3. 🧠 Quiz Generator
An interactive learning and testing platform.
- **JSON Input:** Import custom quizzes from AI-generated JSON question formats.
- **Quiz Chat Conversion:** Uses your Azure OpenAI deployment to convert pasted question-and-answer chats into the quiz JSON format.
- **Progress Tracking:** Tracks correct answers, scores, and saves completion history.
- **Rich Content:** Support for explanations, syntax-highlighted code questions, and clean transitions.

---

## 🔒 Privacy First

Because all logic runs in your browser, this tool is:
- **100% Private:** No files are uploaded to external servers.
- **Offline Capable:** Works without active internet connections once loaded.
- **Secure:** Zero telemetry or data tracking.

---

## 💻 Tech Stack

- **Framework:** [React 19](https://react.dev/) + [Vite 8](https://vite.dev/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/) + CSS Variables for dynamic Dark/Light themes
- **Routing:** [React Router 7](https://reactrouter.com/)
- **Libraries:**
  - `marked` (Markdown parsing)
  - `katex` (Math typesetting)
  - `pdf-lib` & `docx` & `mammoth` (Document operations)
  - `jszip` & `html2canvas` (Asset processing)
  - `lucide-react` (Modern icons)
- **Linting:** [Oxlint](https://oxc.rs/)

---

## 🚀 Getting Started

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) installed.

### Installation

1. Clone or download the repository:
   ```bash
   cd Arsenal-Tools
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

### Running Locally

To start the Vite development server with Hot Module Replacement (HMR):
```bash
npm run dev
```

To lint the codebase using Oxlint:
```bash
npm run lint
```

To compile the application for production:
```bash
npm run build
```

To locally preview the production build:
```bash
npm run preview
```

### Saved-document storage

The saved Markdown document API stores one JSON blob per document in Azure Blob
Storage. The default container is `saved-docs`, and the server keeps the Azure
credentials server-side; no storage secret is sent to the browser. The
application-level payload limit is exactly 500 MiB (`500 * 1024 * 1024` bytes).

Configure one of these Azure authentication modes for the server (the
connection string takes precedence when both are present):

```text
AZURE_STORAGE_CONNECTION_STRING=<server-only secret>
# or, for managed identity / DefaultAzureCredential:
AZURE_STORAGE_ACCOUNT_URL=https://<account>.blob.core.windows.net
AZURE_STORAGE_CONTAINER=saved-docs   # optional
```

For `AZURE_STORAGE_ACCOUNT_URL`, grant the deployed identity a suitable Blob
Data role, such as **Storage Blob Data Contributor**, on the storage account or
container. Do not commit secrets or put these variables in frontend `.env`
files. If neither authentication mode is configured, document endpoints return
HTTP 503.

Azure does not provide a native 500 MiB container quota, so the API enforces
this application-level cap.
Capacity checks are serialized within one server process; multiple server
instances can still race and should use an external coordination mechanism if
strict cross-instance enforcement is required.

### Quiz conversion

Quiz chat conversion is handled by the server so the Azure OpenAI key is never
exposed to the browser. Configure these server-only environment variables with
the resource endpoint and deployment name from Azure AI Foundry:

```text
AZURE_OPENAI_ENDPOINT=https://<resource-name>.openai.azure.com
AZURE_OPENAI_API_KEY=<server-only secret>
AZURE_OPENAI_DEPLOYMENT=<your-gpt-5-nano-deployment-name>
```

The endpoint calls Azure OpenAI's v1 chat-completions API with a strict JSON
schema and returns an array compatible with the existing quiz player. The
frontend's `VITE_API_URL` must point to the server that has these variables.
