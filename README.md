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

