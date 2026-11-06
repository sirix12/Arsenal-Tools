import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { marked } from 'marked';
import { Document, Paragraph, TextRun, PageBreak, Packer, HeadingLevel } from 'docx';
import JSZip from 'jszip';
import { compileMarkdownToVectorPdf, convertHtmlToMarkdown } from '../utils/markdownPdfEngine';
import {
  FileText,
  Files,
  Scissors,
  Trash2,
  ArrowUpDown,
  RotateCw,
  RotateCcw,
  Minimize2,
  Stamp,
  Info,
  Image as ImageIcon,
  FileCode,
  FileOutput,
  Download,
  Upload,
  Check,
  AlertCircle,
  Sparkles,
  ZoomIn,
  Plus,
  Copy,
  ArrowLeft,
  Search,
  RefreshCw,
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  FileArchive,
  Printer,
} from 'lucide-react';
import './PdfTools.css';

/* ------------------------------------------------------------------
   Configure pdf.js worker
------------------------------------------------------------------- */
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

/* ------------------------------------------------------------------
   Tool Catalog
------------------------------------------------------------------- */
const CATEGORIES = [
  { key: 'all', label: 'All Tools', badge: '13 Tools' },
  { key: 'modify', label: 'Modify & Organize', badge: '8 Tools' },
  { key: 'to-pdf', label: 'Convert to PDF', badge: '3 Tools' },
  { key: 'from-pdf', label: 'Extract & Export', badge: '2 Tools' },
];

const TOOLS = [
  {
    id: 'merge',
    title: 'Merge PDF',
    tagline: 'Combine & Sequence',
    desc: 'Combine multiple PDFs in any order with custom page ranges per file.',
    icon: Files,
    accent: '#6366f1',
    gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    category: 'modify',
    accepts: '.pdf,application/pdf',
    multiple: true,
    features: ['Drag & drop reorder', 'Custom page ranges', 'Thumbnail previews'],
  },
  {
    id: 'split',
    title: 'Split & Extract',
    tagline: 'Precision Slicing',
    desc: 'Extract selected pages into a single PDF, split every page, or slice by custom range groups.',
    icon: Scissors,
    accent: '#ec4899',
    gradient: 'linear-gradient(135deg, #ec4899, #f43f5e)',
    category: 'modify',
    accepts: '.pdf,application/pdf',
    multiple: false,
    features: ['Single PDF or ZIP', 'Custom range groups', 'Odd / Even quick select'],
  },
  {
    id: 'organize',
    title: 'Organize Studio',
    tagline: 'Visual Page Editor',
    desc: 'Reorder, rotate individual pages, duplicate, insert blank pages, or delete unwanted pages.',
    icon: Layers,
    accent: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #8b5cf6, #a855f7)',
    category: 'modify',
    accepts: '.pdf,application/pdf',
    multiple: false,
    features: ['Per-page rotation', 'Duplicate & blank pages', 'Drag or button reorder'],
  },
  {
    id: 'compress',
    title: 'Compress PDF',
    tagline: 'Size Optimizer',
    desc: 'Shrink PDF file size using lossless structural optimization or configurable DPI re-encoding.',
    icon: Minimize2,
    accent: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
    category: 'modify',
    accepts: '.pdf,application/pdf',
    multiple: false,
    features: ['4 quality presets', 'Grayscale conversion', 'Before/After size report'],
  },
  {
    id: 'remove',
    title: 'Remove Pages',
    tagline: 'Quick Cleanup',
    desc: 'Visually pick or enter page ranges to strip out unwanted pages from your PDF document.',
    icon: Trash2,
    accent: '#ef4444',
    gradient: 'linear-gradient(135deg, #ef4444, #f97316)',
    category: 'modify',
    accepts: '.pdf,application/pdf',
    multiple: false,
    features: ['Visual page picker', 'Range expression input', 'Live page count summary'],
  },
  {
    id: 'rotate',
    title: 'Rotate PDF',
    tagline: 'Orientation Fixer',
    desc: 'Rotate all or specific pages 90° clockwise, counter-clockwise, or 180° permanently.',
    icon: RotateCw,
    accent: '#06b6d4',
    gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
    category: 'modify',
    accepts: '.pdf,application/pdf',
    multiple: false,
    features: ['Batch or per-page rotate', 'Filter Portrait/Landscape', 'Instant visual preview'],
  },
  {
    id: 'stamp',
    title: 'Watermark & Numbers',
    tagline: 'Branding & Pagination',
    desc: 'Stamp customizable vector page numbers, headers, footers, or diagonal text watermarks.',
    icon: Stamp,
    accent: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b, #eab308)',
    category: 'modify',
    accepts: '.pdf,application/pdf',
    multiple: false,
    features: ['Flexible page numbering', 'Diagonal/centered watermark', 'Crisp vector typography'],
  },
  {
    id: 'metadata',
    title: 'Metadata & Info',
    tagline: 'Document Inspector',
    desc: 'Inspect internal PDF specifications and edit Title, Author, Subject, Keywords, and Creator.',
    icon: Info,
    accent: '#3b82f6',
    gradient: 'linear-gradient(135deg, #3b82f6, #6366f1)',
    category: 'modify',
    accepts: '.pdf,application/pdf',
    multiple: false,
    features: ['Edit standard metadata', 'Inspect page dimensions', 'One-click metadata wipe'],
  },
  {
    id: 'img-pdf',
    title: 'Images → PDF',
    tagline: 'Photo & Scan Builder',
    desc: 'Combine JPG, PNG, WebP, or SVG images into a polished PDF with layout, margin, and size controls.',
    icon: ImageIcon,
    accent: '#ec4899',
    gradient: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
    category: 'to-pdf',
    accepts: 'image/*',
    multiple: true,
    features: ['A4, Letter, or Auto-fit', 'Per-image rotation', 'Margin & alignment options'],
  },
  {
    id: 'md-pdf',
    title: 'Markdown → PDF',
    tagline: 'Native Vector Typesetter',
    desc: 'Compile Markdown directly into a crisp, selectable vector PDF with real-time page previews, tables, code blocks, and math.',
    icon: FileCode,
    accent: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
    category: 'to-pdf',
    accepts: '.md,.markdown,.txt',
    multiple: false,
    features: ['100% vector selectable PDF', 'Live real PDF page preview', 'Tables, code, alerts & math'],
  },
  {
    id: 'word-pdf',
    title: 'Word → PDF',
    tagline: 'Vector DOCX Publisher',
    desc: 'Convert Microsoft Word (.docx) files into a clean vector PDF with live editable preview and layout controls.',
    icon: FileText,
    accent: '#2563eb',
    gradient: 'linear-gradient(135deg, #2563eb, #3b82f6)',
    category: 'to-pdf',
    accepts: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    multiple: false,
    features: ['Native vector PDF engine', 'Editable before export', 'Running headers & page numbers'],
  },
  {
    id: 'pdf-images',
    title: 'PDF → Images',
    tagline: 'High-DPI Rasterizer',
    desc: 'Render PDF pages into high-resolution PNG, JPG, or WebP images. Download individually or as a ZIP.',
    icon: FileArchive,
    accent: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981, #06b6d4)',
    category: 'from-pdf',
    accepts: '.pdf,application/pdf',
    multiple: false,
    features: ['PNG, JPG, or WebP', 'Up to 3x (216 DPI) scale', 'Single page or batch ZIP'],
  },
  {
    id: 'pdf-word',
    title: 'PDF → Word & Text',
    tagline: 'Smart Text Extractor',
    desc: 'Extract structured text with spatial word spacing and heading detection to .docx, .md, or .txt.',
    icon: FileOutput,
    accent: '#06b6d4',
    gradient: 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
    category: 'from-pdf',
    accepts: '.pdf,application/pdf',
    multiple: false,
    features: ['Spatial line reconstruction', 'Export .docx, .md, or .txt', 'Interactive page reader'],
  },
];

const MD_TEMPLATES = {
  spec: {
    label: 'Technical Spec',
    title: 'Arsenal Vector PDF Architecture',
    content: `# Arsenal Native Vector PDF Engine

Welcome to the rebuilt **Markdown → PDF** studio. Unlike fragile DOM screenshot tools (\`html2canvas\`), this engine parses your Markdown AST and draws **100% native vector PDF primitives** directly via \`pdf-lib\`.

> [!TIP]
> Everything you see in the **True PDF Pages** preview on the right is rendered from the actual generated PDF bytes in real time!

## Core Advantages

1. **Crisp Selectable Vector Text**: Copy, search, and zoom to 800% without pixelation.
2. **Deterministic Multi-Page Layout**: Headings never orphan at the bottom of a page, tables repeat headers across page breaks, and code blocks split cleanly.
3. **Inline Math & Unicode Support**: Supports inline formulas like $E = mc^2$, $\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}$, arrows (→, ⇒), and task lists.

### Vector Code Block Example

\`\`\`javascript
import { compileMarkdownToVectorPdf } from './markdownPdfEngine';

async function buildReport(markdown) {
  const { blob, pageCount } = await compileMarkdownToVectorPdf(markdown, {
    pageSize: 'a4',
    typography: 'modern',
    accentColor: 'indigo',
  });
  return { blob, pageCount };
}
\`\`\`

### Engine Comparison Matrix

| Metric | Old Screenshot Method | Native Vector Typesetter |
| :--- | :--- | :--- |
| **Output Format** | Rasterized JPEG Bitmaps | **True Vector PDF Fonts & Paths** |
| **Text Search & Copy** | None (Flat Image) | **100% Selectable & Searchable** |
| **Typical File Size** | 2.5 MB – 8.0 MB | **15 KB – 45 KB** |
| **Page Break Handling** | Cuts lines & tables in half | **AST-Aware Layout & Header Repeat** |

### Release Checklist

- [x] Native AST parser for headings, paragraphs, and inline styles
- [x] Multi-page table renderer with automatic column balancing
- [x] GitHub-style callout alerts (\`[!NOTE]\`, \`[!TIP]\`, \`[!WARNING]\`)
- [ ] Optional custom cover page
`,
  },
  academic: {
    label: 'Academic & Math Notes',
    title: 'Signal Processing & Fourier Analysis',
    content: `# Fourier Analysis & Linear Systems

## 1. Continuous-Time Fourier Transform

For an integrable signal $x(t)$, the **Fourier Transform** $X(\\omega)$ and its inverse are defined as:

$$X(\\omega) = \\int_{-\\infty}^{\\infty} x(t) e^{-j\\omega t} dt$$

$$x(t) = \\frac{1}{2\\pi} \\int_{-\\infty}^{\\infty} X(\\omega) e^{j\\omega t} d\\omega$$

> [!IMPORTANT]
> Parseval's Theorem states that total signal energy is preserved in both time and frequency domains: $\\int |x(t)|^2 dt = \\frac{1}{2\\pi} \\int |X(\\omega)|^2 d\\omega$.

## 2. Common Transform Pairs

| Time Domain $x(t)$ | Frequency Domain $X(\\omega)$ | Convergence Condition |
| :--- | :--- | :--- |
| $\\delta(t)$ | $1$ | All $\\omega \\in \\mathbb{R}$ |
| $e^{-at} u(t)$ | $\\frac{1}{a + j\\omega}$ | $\\text{Re}(a) > 0$ |
| $\\text{rect}(t / T)$ | $T \\cdot \\text{sinc}(\\omega T / 2\\pi)$ | Bounded support |

## 3. Discrete-Time Implementation

\`\`\`python
import numpy as np

def compute_spectrum(signal, fs):
    n = len(signal)
    freqs = np.fft.rfftfreq(n, d=1.0 / fs)
    mag = np.abs(np.fft.rfft(signal)) / n
    return freqs, mag
\`\`\`
`,
  },
  report: {
    label: 'Executive Summary',
    title: 'Q4 Systems Engineering Report',
    content: `# Q4 Systems Engineering Report

**Prepared by:** Core Infrastructure Team • **Status:** Final Review

---

## Executive Summary

During Q4, the platform migration achieved a **99.98% uptime SLA** while reducing p95 latency by **42%**. All client-side document workflows now execute locally in WebAssembly and native browser workers.

> [!NOTE]
> Zero customer files are transmitted over the network; all PDF compilation and manipulation occur strictly in memory.

## Key Milestones Delivered

- **Native Vector PDF Typesetter**: Replaced legacy DOM rasterization with direct \`pdf-lib\` AST typesetting.
- **High-DPI Image Pipeline**: Added batch WebP, PNG, and JPEG page rendering up to 216 DPI.
- **Spatial Text Reconstruction**: Upgraded PDF-to-Word conversion with coordinate-based word gap and heading detection.

## Quarterly Performance Metrics

| Service Module | Q3 Baseline | Q4 Result | Delta |
| :--- | :--- | :--- | :--- |
| **PDF Compilation Speed** | 3,400 ms | 38 ms | **-98.9%** |
| **Output PDF Size (10p)** | 4,200 KB | 28 KB | **-99.3%** |
| **Memory Footprint** | 310 MB | 42 MB | **-86.4%** |
`,
  },
};

const DEFAULT_MD = MD_TEMPLATES.spec.content;

/* ------------------------------------------------------------------
   Utility Functions
------------------------------------------------------------------- */
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : val >= 10 ? 1 : 2)} ${units[i]}`;
}

/**
 * Parses a human page range string like "1-3, 5, 8-10" into a sorted array of 1-based page numbers.
 */
function parsePageRange(rangeStr, maxPages) {
  if (!rangeStr || !rangeStr.trim()) {
    return Array.from({ length: maxPages }, (_, i) => i + 1);
  }
  const pages = new Set();
  const parts = rangeStr.split(',');
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map(s => s.trim());
      let start = parseInt(startStr, 10);
      let end = endStr === '' || endStr.toLowerCase() === 'end' ? maxPages : parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end)) continue;
      if (start > end) [start, end] = [end, start];
      for (let p = Math.max(1, start); p <= Math.min(maxPages, end); p++) {
        pages.add(p);
      }
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num) && num >= 1 && num <= maxPages) {
        pages.add(num);
      }
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

/**
 * Parses a multi-group range string like "1-3, 4-6, 7" into an array of groups:
 * [{ label: '1-3', pages: [1,2,3] }, ...]
 */
function parseRangeGroups(rangeStr, maxPages) {
  if (!rangeStr || !rangeStr.trim()) return [];
  const groups = [];
  const parts = rangeStr.split(',');
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    const pages = parsePageRange(part, maxPages);
    if (pages.length > 0) {
      const label = pages.length === 1 ? `p${pages[0]}` : `p${pages[0]}-${pages[pages.length - 1]}`;
      groups.push({ label, pages });
    }
  }
  return groups;
}

function hexToRgb01(hex) {
  const clean = (hex || '#6366f1').replace('#', '');
  const num = parseInt(clean, 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return rgb(isNaN(r) ? 0.39 : r, isNaN(g) ? 0.4 : g, isNaN(b) ? 0.94 : b);
}

/* ------------------------------------------------------------------
   Main Component
------------------------------------------------------------------- */
export default function PdfTools() {
  /* Navigation & catalog filters */
  const [activeToolId, setActiveToolId] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const activeTool = useMemo(
    () => TOOLS.find(t => t.id === activeToolId) || null,
    [activeToolId]
  );

  /* Shared workspace states */
  const [files, setFiles] = useState([]); // Array of { id, file, name, size, pageCount, range, thumbUrl, rotation, width, height }
  const [thumbnails, setThumbnails] = useState([]); // Array of { id, pageNum, dataUrl, rotation, isBlank, width, height }
  const [selectedPages, setSelectedPages] = useState(new Set()); // Set of pageNum or item index
  const [rangeInput, setRangeInput] = useState('');
  const [status, setStatus] = useState({ msg: '', type: 'info' });
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [resultInfo, setResultInfo] = useState(null); // { filename, blob, originalSize, newSize, summary, extraFiles }
  const [zoomModal, setZoomModal] = useState(null); // { pageNum, dataUrl, rotation }

  /* Tool-specific settings */
  // Compress settings
  const [compressPreset, setCompressPreset] = useState('medium'); // 'optimize' | 'high' | 'medium' | 'low'
  const [compressGrayscale, setCompressGrayscale] = useState(false);

  // Split settings
  const [splitMode, setSplitMode] = useState('extract'); // 'extract' | 'individual' | 'ranges'
  const [splitRangeGroups, setSplitRangeGroups] = useState('1-2, 3-end');

  // Rotate settings
  const [rotateFilter, setRotateFilter] = useState('all'); // 'all' | 'portrait' | 'landscape' | 'odd' | 'even'

  // Stamp (Watermark & Page Numbers) settings
  const [enablePageNums, setEnablePageNums] = useState(true);
  const [pageNumPos, setPageNumPos] = useState('bottom-center');
  const [pageNumFormat, setPageNumFormat] = useState('page-of-total'); // 'number' | 'page-num' | 'page-of-total' | 'dashed'
  const [pageNumStart, setPageNumStart] = useState(1);
  const [pageNumFontSize, setPageNumFontSize] = useState(10);
  const [enableWatermark, setEnableWatermark] = useState(false);
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [watermarkPos, setWatermarkPos] = useState('diagonal'); // 'diagonal' | 'center' | 'top' | 'bottom'
  const [watermarkOpacity, setWatermarkOpacity] = useState(22);
  const [watermarkSize, setWatermarkSize] = useState(48);
  const [watermarkColor, setWatermarkColor] = useState('#6366f1');

  // Metadata settings
  const [pdfMeta, setPdfMeta] = useState({
    title: '',
    author: '',
    subject: '',
    keywords: '',
    creator: '',
    producer: '',
    pageCount: 0,
    pageSizeStr: '',
    creationDate: '',
  });

  // Images -> PDF settings
  const [imgPageSize, setImgPageSize] = useState('a4'); // 'a4' | 'letter' | 'fit'
  const [imgOrientation, setImgOrientation] = useState('auto'); // 'auto' | 'portrait' | 'landscape'
  const [imgMargin, setImgMargin] = useState(24); // 0 | 24 | 48

  // Markdown & Word -> Vector PDF settings
  const [mdText, setMdText] = useState(DEFAULT_MD);
  const [docHtml, setDocHtml] = useState('');
  const [docTitle, setDocTitle] = useState(MD_TEMPLATES.spec.title);
  const [docPageSize, setDocPageSize] = useState('a4'); // 'a4' | 'letter'
  const [docOrientation, setDocOrientation] = useState('portrait'); // 'portrait' | 'landscape'
  const [docTheme, setDocTheme] = useState('modern'); // 'modern' | 'academic' | 'mono'
  const [docFontSize, setDocFontSize] = useState(11); // 10 | 11 | 12 pt
  const [docMargin, setDocMargin] = useState(48); // 36 | 48 | 64 pt
  const [docAccent, setDocAccent] = useState('indigo'); // 'indigo' | 'emerald' | 'slate' | 'crimson'
  const [docShowHeader, setDocShowHeader] = useState(true);
  const [docShowPageNums, setDocShowPageNums] = useState(true);
  const [mdPreviewMode, setMdPreviewMode] = useState('pdf'); // 'pdf' (True Vector PDF Pages) | 'web' (HTML View)
  const [mdPreviewPages, setMdPreviewPages] = useState([]); // Array of { pageNum, dataUrl }
  const [mdCompiledPdf, setMdCompiledPdf] = useState(null); // { blob, pageCount, size }
  const [mdCompiling, setMdCompiling] = useState(false);

  // PDF -> Images settings
  const [exportImgFormat, setExportImgFormat] = useState('png'); // 'png' | 'jpeg' | 'webp'
  const [exportImgScale, setExportImgScale] = useState(2); // 1 | 2 | 3
  const [renderedImages, setRenderedImages] = useState([]); // Array of { pageNum, dataUrl, blob, filename, width, height }

  // PDF -> Word & Text settings
  const [extractedPages, setExtractedPages] = useState([]); // Array of { pageNum, lines: [{ text, isHeading }], rawText }
  const [activeReadPage, setActiveReadPage] = useState(0);

  const fileInputRef = useRef(null);
  const dragIndexRef = useRef(null);

  /* ------------------------------------------------------------------
     Helpers
  ------------------------------------------------------------------- */
  const setMsg = useCallback((msg, type = 'info') => {
    setStatus({ msg, type });
  }, []);

  const downloadBlob = useCallback((blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const resetWorkspace = useCallback(() => {
    setFiles([]);
    setThumbnails([]);
    setSelectedPages(new Set());
    setRangeInput('');
    setStatus({ msg: '', type: 'info' });
    setProgress(0);
    setLoading(false);
    setResultInfo(null);
    setRenderedImages([]);
    setExtractedPages([]);
    setActiveReadPage(0);
    setDocHtml('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const openTool = useCallback((toolId) => {
    resetWorkspace();
    setActiveToolId(toolId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [resetWorkspace]);

  const goBack = useCallback(() => {
    resetWorkspace();
    setActiveToolId(null);
  }, [resetWorkspace]);

  /* Close zoom modal on Escape */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && zoomModal) setZoomModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomModal]);

  /* ------------------------------------------------------------------
     Render PDF Thumbnails & Inspect PDF
  ------------------------------------------------------------------- */
  const loadPdfThumbnails = async (file, autoSelectAll = false) => {
    setLoading(true);
    setProgress(5);
    setMsg('Loading and rendering PDF pages…', 'info');
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
      const thumbs = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        setProgress(Math.round((i / pdf.numPages) * 95));
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 0.5 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        thumbs.push({
          id: `page-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          pageNum: i,
          dataUrl: canvas.toDataURL('image/jpeg', 0.85),
          rotation: 0,
          isBlank: false,
          width: Math.round(vp.width * 2),
          height: Math.round(vp.height * 2),
        });
      }
      setThumbnails(thumbs);
      if (autoSelectAll) {
        setSelectedPages(new Set(thumbs.map(t => t.pageNum)));
      } else {
        setSelectedPages(new Set());
      }
      setSplitRangeGroups(`1-${Math.min(2, pdf.numPages)}${pdf.numPages > 2 ? `, 3-${pdf.numPages}` : ''}`);
      setMsg(`Loaded ${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''} (${formatBytes(file.size)})`, 'info');
    } catch (err) {
      setMsg('Failed to read PDF: ' + err.message, 'error');
    }
    setProgress(0);
    setLoading(false);
  };

  /* Zoom single page at higher DPI */
  const handleZoomPage = async (thumb) => {
    if (thumb.isBlank || !files[0]?.file) {
      setZoomModal({
        pageNum: thumb.pageNum,
        dataUrl: thumb.dataUrl,
        rotation: thumb.rotation || 0,
      });
      return;
    }
    try {
      const buf = await files[0].file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const page = await pdf.getPage(thumb.pageNum);
      const vp = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      setZoomModal({
        pageNum: thumb.pageNum,
        dataUrl: canvas.toDataURL('image/png'),
        rotation: thumb.rotation || 0,
      });
    } catch {
      setZoomModal({
        pageNum: thumb.pageNum,
        dataUrl: thumb.dataUrl,
        rotation: thumb.rotation || 0,
      });
    }
  };

  /* Inspect Metadata for metadata tool */
  const inspectPdfMetadata = async (file) => {
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const doc = await PDFDocument.load(buf, { updateMetadata: false });
      const pages = doc.getPages();
      const firstPage = pages[0];
      const sz = firstPage ? firstPage.getSize() : { width: 0, height: 0 };
      const cDate = doc.getCreationDate();
      setPdfMeta({
        title: doc.getTitle() || '',
        author: doc.getAuthor() || '',
        subject: doc.getSubject() || '',
        keywords: doc.getKeywords() || '',
        creator: doc.getCreator() || '',
        producer: doc.getProducer() || '',
        pageCount: pages.length,
        pageSizeStr: firstPage ? `${Math.round(sz.width)} × ${Math.round(sz.height)} pt (${(sz.width / 72).toFixed(1)}" × ${(sz.height / 72).toFixed(1)}")` : 'N/A',
        creationDate: cDate ? cDate.toLocaleDateString() : 'Not specified',
      });
      setMsg('Metadata loaded. Edit fields below and save your updated PDF.', 'info');
    } catch (e) {
      setMsg('Could not read PDF metadata: ' + e.message, 'error');
    }
    setLoading(false);
  };

  /* Extract text immediately when uploading to pdf-word */
  const extractTextFromPdf = async (file) => {
    setLoading(true);
    setProgress(10);
    setMsg('Analyzing PDF layout and extracting structured text…', 'info');
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const pagesData = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        setProgress(Math.round((i / pdf.numPages) * 95));
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();

        // Filter non-empty items and map coordinates
        const items = tc.items
          .filter(it => typeof it.str === 'string' && it.str.length > 0)
          .map(it => ({
            str: it.str,
            x: it.transform[4],
            y: it.transform[5],
            height: Math.abs(it.transform[3]) || it.height || 12,
            width: it.width || it.str.length * 5,
          }));

        // Sort top-to-bottom (descending Y with tolerance), then left-to-right (ascending X)
        items.sort((a, b) => {
          if (Math.abs(a.y - b.y) > 4) return b.y - a.y;
          return a.x - b.x;
        });

        // Group into lines
        const rawLines = [];
        for (const item of items) {
          const lastLine = rawLines[rawLines.length - 1];
          if (!lastLine || Math.abs(lastLine.y - item.y) > Math.max(4, item.height * 0.45)) {
            rawLines.push({ y: item.y, height: item.height, segments: [item] });
          } else {
            lastLine.segments.push(item);
            if (item.height > lastLine.height) lastLine.height = item.height;
          }
        }

        // Compute median font height to identify headings
        const heights = rawLines.map(l => l.height).sort((a, b) => a - b);
        const medianHeight = heights.length ? heights[Math.floor(heights.length / 2)] : 12;

        const structuredLines = rawLines.map(line => {
          line.segments.sort((a, b) => a.x - b.x);
          let text = '';
          let prevEnd = null;
          for (const seg of line.segments) {
            if (prevEnd !== null) {
              const gap = seg.x - prevEnd;
              if (gap > seg.height * 0.22 && !text.endsWith(' ') && !seg.str.startsWith(' ')) {
                text += ' ';
              }
            }
            text += seg.str;
            prevEnd = seg.x + seg.width;
          }
          return {
            text: text.trim(),
            isHeading: line.height >= medianHeight * 1.28 && text.trim().length < 120,
          };
        }).filter(l => l.text.length > 0);

        pagesData.push({
          pageNum: i,
          lines: structuredLines,
          rawText: structuredLines.map(l => (l.isHeading ? `## ${l.text}` : l.text)).join('\n'),
        });
      }

      setExtractedPages(pagesData);
      setActiveReadPage(0);
      const totalWords = pagesData.reduce(
        (acc, p) => acc + p.rawText.split(/\s+/).filter(Boolean).length,
        0
      );
      setMsg(`Extracted ${totalWords.toLocaleString()} words across ${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}.`, 'success');
    } catch (e) {
      setMsg('Error extracting text: ' + e.message, 'error');
    }
    setProgress(0);
    setLoading(false);
  };

  /* ------------------------------------------------------------------
     File Upload Handler
  ------------------------------------------------------------------- */
  const handleFiles = async (fileList) => {
    if (!fileList || !fileList.length || !activeTool) return;
    setResultInfo(null);
    const incoming = Array.from(fileList);

    /* Markdown file upload into md-pdf */
    if (activeTool.id === 'md-pdf') {
      const f = incoming[0];
      const text = await f.text();
      setMdText(text);
      setDocTitle(f.name.replace(/\.(md|markdown|txt)$/i, ''));
      setMsg(`Loaded "${f.name}" into editor.`, 'success');
      return;
    }

    /* Word (.docx) file upload into word-pdf */
    if (activeTool.id === 'word-pdf') {
      const f = incoming[0];
      setLoading(true);
      setMsg('Converting Word document to vector structure…', 'info');
      try {
        const buf = await f.arrayBuffer();
        const res = await mammoth.convertToHtml({ arrayBuffer: buf });
        const htmlVal = res.value || '<p><em>Document appears empty.</em></p>';
        const convertedMd = convertHtmlToMarkdown(htmlVal);
        setFiles([{ id: `file-${Date.now()}`, file: f, name: f.name, size: f.size }]);
        setDocTitle(f.name.replace(/\.docx$/i, ''));
        setDocHtml(htmlVal);
        setMdText(convertedMd || '# Document');
        setMsg('Word document converted! Review the live vector PDF pages below and click Download Vector PDF.', 'success');
      } catch (e) {
        setMsg('Error reading .docx file: ' + e.message, 'error');
      }
      setLoading(false);
      return;
    }

    /* Images -> PDF */
    if (activeTool.id === 'img-pdf') {
      setLoading(true);
      setMsg('Loading image previews…', 'info');
      const newItems = [];
      for (const f of incoming) {
        try {
          const item = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const img = new window.Image();
              img.onload = () => {
                resolve({
                  id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  file: f,
                  name: f.name,
                  size: f.size,
                  thumbUrl: reader.result,
                  width: img.width,
                  height: img.height,
                  rotation: 0,
                });
              };
              img.onerror = () => reject(new Error(`Invalid image: ${f.name}`));
              img.src = reader.result;
            };
            reader.onerror = () => reject(new Error(`Cannot read: ${f.name}`));
            reader.readAsDataURL(f);
          });
          newItems.push(item);
        } catch (err) {
          setMsg(err.message, 'error');
        }
      }
      setFiles(prev => [...prev, ...newItems]);
      setMsg('', 'info');
      setLoading(false);
      return;
    }

    /* Merge PDF (multiple PDFs with page count & first-page thumbnail) */
    if (activeTool.id === 'merge') {
      setLoading(true);
      setMsg('Inspecting uploaded PDF files…', 'info');
      const newEntries = [];
      for (const f of incoming) {
        try {
          const buf = await f.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
          const page = await pdf.getPage(1);
          const vp = page.getViewport({ scale: 0.35 });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
          newEntries.push({
            id: `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            file: f,
            name: f.name,
            size: f.size,
            pageCount: pdf.numPages,
            range: '', // empty means All pages
            thumbUrl: canvas.toDataURL('image/jpeg', 0.8),
          });
        } catch (err) {
          setMsg(`Could not load "${f.name}": ${err.message}`, 'error');
        }
      }
      setFiles(prev => [...prev, ...newEntries]);
      setMsg('', 'info');
      setLoading(false);
      return;
    }

    /* Single-PDF tools */
    const singleFile = incoming[0];
    const singleEntry = {
      id: `pdf-${Date.now()}`,
      file: singleFile,
      name: singleFile.name,
      size: singleFile.size,
    };
    setFiles([singleEntry]);

    if (['remove', 'split', 'organize', 'rotate', 'stamp', 'pdf-images', 'compress'].includes(activeTool.id)) {
      await loadPdfThumbnails(singleFile, activeTool.id === 'pdf-images');
    }
    if (activeTool.id === 'metadata') {
      await inspectPdfMetadata(singleFile);
    }
    if (activeTool.id === 'pdf-word') {
      await extractTextFromPdf(singleFile);
    }
  };

  /* ------------------------------------------------------------------
     Page Selection & Range Helpers
  ------------------------------------------------------------------- */
  const togglePageSelection = (pageNum) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      return next;
    });
  };

  const selectByPreset = (preset) => {
    const total = thumbnails.length;
    if (!total) return;
    if (preset === 'all') {
      setSelectedPages(new Set(thumbnails.map(t => t.pageNum)));
    } else if (preset === 'none') {
      setSelectedPages(new Set());
    } else if (preset === 'invert') {
      setSelectedPages(prev => {
        const next = new Set();
        thumbnails.forEach(t => {
          if (!prev.has(t.pageNum)) next.add(t.pageNum);
        });
        return next;
      });
    } else if (preset === 'odd') {
      setSelectedPages(new Set(thumbnails.filter(t => t.pageNum % 2 === 1).map(t => t.pageNum)));
    } else if (preset === 'even') {
      setSelectedPages(new Set(thumbnails.filter(t => t.pageNum % 2 === 0).map(t => t.pageNum)));
    }
  };

  const applyRangeToSelection = (val) => {
    setRangeInput(val);
    if (!thumbnails.length) return;
    if (!val.trim()) {
      setSelectedPages(new Set());
      return;
    }
    const parsed = parsePageRange(val, thumbnails.length);
    setSelectedPages(new Set(parsed));
  };

  /* ------------------------------------------------------------------
     Organize & Rotate Studio Actions
  ------------------------------------------------------------------- */
  const moveThumbnail = (idx, dir) => {
    setThumbnails(prev => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const rotateThumbnail = (idx, deltaDeg) => {
    setThumbnails(prev =>
      prev.map((t, i) => (i === idx ? { ...t, rotation: ((t.rotation || 0) + deltaDeg + 360) % 360 } : t))
    );
  };

  const rotateMatchingPages = (deltaDeg) => {
    setThumbnails(prev =>
      prev.map(t => {
        const isPortrait = (t.height || 100) >= (t.width || 100);
        const matches =
          rotateFilter === 'all' ||
          (rotateFilter === 'portrait' && isPortrait) ||
          (rotateFilter === 'landscape' && !isPortrait) ||
          (rotateFilter === 'odd' && t.pageNum % 2 === 1) ||
          (rotateFilter === 'even' && t.pageNum % 2 === 0) ||
          (rotateFilter === 'selected' && selectedPages.has(t.pageNum));
        if (!matches) return t;
        return { ...t, rotation: ((t.rotation || 0) + deltaDeg + 360) % 360 };
      })
    );
  };

  const duplicateThumbnail = (idx) => {
    setThumbnails(prev => {
      const copy = [...prev];
      const orig = copy[idx];
      copy.splice(idx + 1, 0, {
        ...orig,
        id: `dup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      });
      return copy;
    });
  };

  const insertBlankPage = (afterIdx) => {
    // Generate a clean white dataUrl for blank page preview
    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 254;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 180, 254);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(8, 8, 164, 238);

    const blankThumb = {
      id: `blank-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pageNum: null,
      dataUrl: canvas.toDataURL('image/png'),
      rotation: 0,
      isBlank: true,
      width: 595,
      height: 842,
    };

    setThumbnails(prev => {
      const copy = [...prev];
      copy.splice(afterIdx + 1, 0, blankThumb);
      return copy;
    });
  };

  const deleteThumbnailAt = (idx) => {
    setThumbnails(prev => {
      if (prev.length <= 1) {
        setMsg('A PDF must contain at least 1 page.', 'error');
        return prev;
      }
      return prev.filter((_, i) => i !== idx);
    });
  };

  /* ------------------------------------------------------------------
     Tool Execution Engines
  ------------------------------------------------------------------- */
  const execute = async () => {
    if (!activeTool) return;
    if (activeTool.id !== 'md-pdf' && files.length === 0) {
      setMsg('Please upload at least one file first.', 'error');
      return;
    }

    setLoading(true);
    setProgress(10);
    setResultInfo(null);
    setMsg('Processing document…', 'info');

    try {
      switch (activeTool.id) {
        case 'merge':
          await runMerge();
          break;
        case 'split':
          await runSplit();
          break;
        case 'organize':
          await runOrganize();
          break;
        case 'remove':
          await runRemovePages();
          break;
        case 'rotate':
          await runRotate();
          break;
        case 'compress':
          await runCompress();
          break;
        case 'stamp':
          await runStamp();
          break;
        case 'metadata':
          await runSaveMetadata();
          break;
        case 'img-pdf':
          await runImagesToPdf();
          break;
        case 'md-pdf':
          await runHtmlToPdf(docTitle || 'markdown_document');
          break;
        case 'word-pdf':
          await runHtmlToPdf(docTitle || 'word_document');
          break;
        case 'pdf-images':
          await runPdfToImages();
          break;
        case 'pdf-word':
          await runExportWord('docx');
          break;
        default:
          break;
      }
    } catch (err) {
      console.error(err);
      setMsg('Error: ' + (err.message || 'Operation failed'), 'error');
    }
    setProgress(0);
    setLoading(false);
  };

  /* 1. MERGE PDF */
  const runMerge = async () => {
    if (files.length < 1) throw new Error('Add at least one PDF file to merge.');
    const merged = await PDFDocument.create();
    let totalCopied = 0;

    for (let i = 0; i < files.length; i++) {
      const entry = files[i];
      setProgress(Math.round(((i + 0.5) / files.length) * 90));
      setMsg(`Merging "${entry.name}" (${i + 1} of ${files.length})…`, 'info');

      const doc = await PDFDocument.load(await entry.file.arrayBuffer());
      const maxP = doc.getPageCount();
      const targetPages = parsePageRange(entry.range, maxP);
      if (targetPages.length === 0) continue;

      const indices = targetPages.map(p => p - 1);
      const copied = await merged.copyPages(doc, indices);
      copied.forEach(p => merged.addPage(p));
      totalCopied += copied.length;
    }

    if (totalCopied === 0) throw new Error('No valid pages matched your range selection.');
    const bytes = await merged.save({ useObjectStreams: true });
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const filename = files.length === 1 ? `extracted_${files[0].name}` : 'merged_document.pdf';
    downloadBlob(blob, filename);

    const totalInputSize = files.reduce((acc, f) => acc + f.size, 0);
    setResultInfo({
      filename,
      blob,
      originalSize: totalInputSize,
      newSize: blob.size,
      summary: `Combined ${files.length} file${files.length > 1 ? 's' : ''} (${totalCopied} total pages).`,
    });
    setMsg(`Successfully merged ${totalCopied} pages into "${filename}"!`, 'success');
  };

  /* 2. SPLIT & EXTRACT */
  const runSplit = async () => {
    const srcBuf = await files[0].file.arrayBuffer();
    const srcDoc = await PDFDocument.load(srcBuf);
    const totalPages = srcDoc.getPageCount();
    const baseName = files[0].name.replace(/\.pdf$/i, '');

    if (splitMode === 'extract') {
      if (selectedPages.size === 0) throw new Error('Select at least one page to extract.');
      const sorted = Array.from(selectedPages).sort((a, b) => a - b);
      const outDoc = await PDFDocument.create();
      const copied = await outDoc.copyPages(srcDoc, sorted.map(p => p - 1));
      copied.forEach(p => outDoc.addPage(p));
      const bytes = await outDoc.save({ useObjectStreams: true });
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const filename = `${baseName}_extracted_${sorted.length}p.pdf`;
      downloadBlob(blob, filename);
      setResultInfo({
        filename,
        blob,
        originalSize: files[0].size,
        newSize: blob.size,
        summary: `Extracted ${sorted.length} of ${totalPages} pages into a single PDF.`,
      });
      setMsg(`Extracted ${sorted.length} page${sorted.length > 1 ? 's' : ''} into "${filename}".`, 'success');
    } else if (splitMode === 'individual') {
      if (selectedPages.size === 0) throw new Error('Select at least one page to split.');
      const sorted = Array.from(selectedPages).sort((a, b) => a - b);
      const zip = new JSZip();
      for (let i = 0; i < sorted.length; i++) {
        const pn = sorted[i];
        setProgress(Math.round(((i + 1) / sorted.length) * 90));
        const d = await PDFDocument.create();
        const [cp] = await d.copyPages(srcDoc, [pn - 1]);
        d.addPage(cp);
        zip.file(`${baseName}_page_${pn}.pdf`, await d.save({ useObjectStreams: true }));
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const filename = `${baseName}_split_${sorted.length}_pages.zip`;
      downloadBlob(zipBlob, filename);
      setResultInfo({
        filename,
        blob: zipBlob,
        originalSize: files[0].size,
        newSize: zipBlob.size,
        summary: `Split ${sorted.length} selected pages into individual PDF files inside a ZIP archive.`,
      });
      setMsg(`Downloaded ZIP with ${sorted.length} individual PDF files!`, 'success');
    } else if (splitMode === 'ranges') {
      const groups = parseRangeGroups(splitRangeGroups, totalPages);
      if (groups.length === 0) throw new Error('Enter at least one valid page range group (e.g. 1-3, 4-6).');
      const zip = new JSZip();
      for (let i = 0; i < groups.length; i++) {
        const grp = groups[i];
        setProgress(Math.round(((i + 1) / groups.length) * 90));
        const d = await PDFDocument.create();
        const copied = await d.copyPages(srcDoc, grp.pages.map(p => p - 1));
        copied.forEach(p => d.addPage(p));
        zip.file(`${baseName}_part_${i + 1}_${grp.label}.pdf`, await d.save({ useObjectStreams: true }));
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const filename = `${baseName}_${groups.length}_parts.zip`;
      downloadBlob(zipBlob, filename);
      setResultInfo({
        filename,
        blob: zipBlob,
        originalSize: files[0].size,
        newSize: zipBlob.size,
        summary: `Split PDF into ${groups.length} custom range documents.`,
      });
      setMsg(`Split into ${groups.length} PDF files inside "${filename}"!`, 'success');
    }
  };

  /* 3. ORGANIZE STUDIO */
  const runOrganize = async () => {
    if (thumbnails.length === 0) throw new Error('No pages to save.');
    const srcDoc = await PDFDocument.load(await files[0].file.arrayBuffer());
    const outDoc = await PDFDocument.create();

    for (let i = 0; i < thumbnails.length; i++) {
      const t = thumbnails[i];
      setProgress(Math.round(((i + 1) / thumbnails.length) * 90));
      if (t.isBlank) {
        const p = outDoc.addPage([t.width || 595.28, t.height || 841.89]);
        if (t.rotation) p.setRotation(degrees(t.rotation));
      } else {
        const [copiedPage] = await outDoc.copyPages(srcDoc, [t.pageNum - 1]);
        if (t.rotation) {
          const currentRot = copiedPage.getRotation().angle || 0;
          copiedPage.setRotation(degrees((currentRot + t.rotation) % 360));
        }
        outDoc.addPage(copiedPage);
      }
    }

    const bytes = await outDoc.save({ useObjectStreams: true });
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const filename = `organized_${files[0].name}`;
    downloadBlob(blob, filename);
    setResultInfo({
      filename,
      blob,
      originalSize: files[0].size,
      newSize: blob.size,
      summary: `Saved organized PDF with ${thumbnails.length} pages.`,
    });
    setMsg(`Saved organized PDF ("${filename}")!`, 'success');
  };

  /* 4. REMOVE PAGES */
  const runRemovePages = async () => {
    if (selectedPages.size === 0) throw new Error('Click on the pages you want to remove first.');
    if (selectedPages.size >= thumbnails.length) {
      throw new Error('Cannot remove every page in the PDF. Leave at least 1 page.');
    }
    const srcDoc = await PDFDocument.load(await files[0].file.arrayBuffer());
    const outDoc = await PDFDocument.create();
    const keptIndices = thumbnails
      .filter(t => !selectedPages.has(t.pageNum))
      .map(t => t.pageNum - 1);

    const copied = await outDoc.copyPages(srcDoc, keptIndices);
    copied.forEach(p => outDoc.addPage(p));

    const bytes = await outDoc.save({ useObjectStreams: true });
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const filename = `cleaned_${files[0].name}`;
    downloadBlob(blob, filename);
    setResultInfo({
      filename,
      blob,
      originalSize: files[0].size,
      newSize: blob.size,
      summary: `Removed ${selectedPages.size} page${selectedPages.size > 1 ? 's' : ''}; kept ${keptIndices.length} page${keptIndices.length > 1 ? 's' : ''}.`,
    });
    setMsg(`Removed ${selectedPages.size} page${selectedPages.size > 1 ? 's' : ''} and downloaded "${filename}"!`, 'success');
  };

  /* 5. ROTATE PDF */
  const runRotate = async () => {
    const srcDoc = await PDFDocument.load(await files[0].file.arrayBuffer());
    const pages = srcDoc.getPages();
    let rotatedCount = 0;

    thumbnails.forEach((t, idx) => {
      if (t.rotation && pages[idx]) {
        const cur = pages[idx].getRotation().angle || 0;
        pages[idx].setRotation(degrees((cur + t.rotation) % 360));
        rotatedCount++;
      }
    });

    const bytes = await srcDoc.save({ useObjectStreams: true });
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const filename = `rotated_${files[0].name}`;
    downloadBlob(blob, filename);
    setResultInfo({
      filename,
      blob,
      originalSize: files[0].size,
      newSize: blob.size,
      summary: `Applied rotation to ${rotatedCount} of ${pages.length} pages.`,
    });
    setMsg(`Saved rotated PDF ("${filename}")!`, 'success');
  };

  /* 6. COMPRESS PDF */
  const runCompress = async () => {
    const origFile = files[0].file;
    const origBuf = await origFile.arrayBuffer();

    // Always compute lossless object-stream optimization first
    const losslessDoc = await PDFDocument.load(origBuf);
    const losslessBytes = await losslessDoc.save({ useObjectStreams: true, addDefaultPage: false });

    if (compressPreset === 'optimize') {
      const bestBytes = losslessBytes.byteLength < origFile.size ? losslessBytes : new Uint8Array(origBuf);
      const blob = new Blob([bestBytes], { type: 'application/pdf' });
      const filename = `optimized_${origFile.name}`;
      downloadBlob(blob, filename);
      const savedPct = Math.max(0, ((1 - blob.size / origFile.size) * 100)).toFixed(1);
      setResultInfo({
        filename,
        blob,
        originalSize: origFile.size,
        newSize: blob.size,
        summary: `Lossless structural optimization complete (${savedPct}% reduction, 100% vector text preserved).`,
      });
      setMsg(`Lossless optimization complete! (${formatBytes(origFile.size)} → ${formatBytes(blob.size)})`, 'success');
      return;
    }

    // Configurable DPI & JPEG quality presets
    const presetConfig = {
      high: { scale: 1.5, quality: 0.82, label: 'High Quality (150 DPI)' },
      medium: { scale: 1.2, quality: 0.65, label: 'Balanced Compression (120 DPI)' },
      low: { scale: 0.92, quality: 0.48, label: 'Extreme Compression (90 DPI)' },
    };
    const cfg = presetConfig[compressPreset] || presetConfig.medium;

    const srcPdf = await pdfjsLib.getDocument({ data: origBuf.slice(0) }).promise;
    const outDoc = await PDFDocument.create();

    for (let i = 1; i <= srcPdf.numPages; i++) {
      setProgress(Math.round((i / srcPdf.numPages) * 92));
      setMsg(`Compressing page ${i} of ${srcPdf.numPages} (${cfg.label})…`, 'info');
      const page = await srcPdf.getPage(i);
      const origVp = page.getViewport({ scale: 1.0 });
      const renderVp = page.getViewport({ scale: cfg.scale });

      const canvas = document.createElement('canvas');
      canvas.width = renderVp.width;
      canvas.height = renderVp.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: renderVp }).promise;

      if (compressGrayscale) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let p = 0; p < d.length; p += 4) {
          const lum = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
          d[p] = d[p + 1] = d[p + 2] = lum;
        }
        ctx.putImageData(imgData, 0, 0);
      }

      const dataUrl = canvas.toDataURL('image/jpeg', cfg.quality);
      const base64 = dataUrl.split(',')[1];
      const jpgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const jpg = await outDoc.embedJpg(jpgBytes);

      const pdfPage = outDoc.addPage([origVp.width, origVp.height]);
      pdfPage.drawImage(jpg, {
        x: 0,
        y: 0,
        width: origVp.width,
        height: origVp.height,
      });
    }

    const rasterBytes = await outDoc.save({ useObjectStreams: true });
    // Pick whichever output is smaller (unless grayscale was specifically requested)
    let finalBytes = rasterBytes;
    let note = cfg.label;
    if (!compressGrayscale && losslessBytes.byteLength < rasterBytes.byteLength) {
      finalBytes = losslessBytes;
      note = 'Lossless Vector Stream (smaller than rasterized output)';
    }

    const blob = new Blob([finalBytes], { type: 'application/pdf' });
    const filename = `compressed_${origFile.name}`;
    downloadBlob(blob, filename);

    const savedDiff = origFile.size - blob.size;
    const savedPct = origFile.size > 0 ? ((savedDiff / origFile.size) * 100).toFixed(1) : '0';

    setResultInfo({
      filename,
      blob,
      originalSize: origFile.size,
      newSize: blob.size,
      summary: `${note} — ${savedDiff >= 0 ? `Saved ${formatBytes(savedDiff)} (${savedPct}%)` : 'Already maximally compressed'}.`,
    });
    setMsg(`Compression complete! ${formatBytes(origFile.size)} → ${formatBytes(blob.size)}`, 'success');
  };

  /* 7. WATERMARK & PAGE NUMBERS */
  const runStamp = async () => {
    if (!enablePageNums && !enableWatermark) {
      throw new Error('Enable Page Numbers and/or Text Watermark first.');
    }
    const doc = await PDFDocument.load(await files[0].file.arrayBuffer());
    const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const pages = doc.getPages();
    const total = pages.length;
    const wmColor = hexToRgb01(watermarkColor);

    pages.forEach((page, idx) => {
      const pageNumber = idx + 1;
      const { width, height } = page.getSize();

      // Draw Watermark
      if (enableWatermark && watermarkText.trim()) {
        const text = watermarkText.trim();
        const fSize = Number(watermarkSize) || 48;
        const textWidth = fontBold.widthOfTextAtSize(text, fSize);
        const opacity = Math.min(1, Math.max(0.05, Number(watermarkOpacity) / 100));

        if (watermarkPos === 'diagonal') {
          const angleRad = Math.PI / 4;
          const x = width / 2 - (textWidth / 2) * Math.cos(angleRad);
          const y = height / 2 - (textWidth / 2) * Math.sin(angleRad);
          page.drawText(text, {
            x,
            y,
            size: fSize,
            font: fontBold,
            color: wmColor,
            opacity,
            rotate: degrees(45),
          });
        } else {
          const x = Math.max(20, (width - textWidth) / 2);
          const y =
            watermarkPos === 'top'
              ? height - fSize - 36
              : watermarkPos === 'bottom'
              ? 42
              : height / 2 - fSize / 3;
          page.drawText(text, {
            x,
            y,
            size: fSize,
            font: fontBold,
            color: wmColor,
            opacity,
          });
        }
      }

      // Draw Page Numbers
      if (enablePageNums && pageNumber >= Number(pageNumStart || 1)) {
        const displayNum = pageNumber;
        let label = `${displayNum}`;
        if (pageNumFormat === 'page-num') label = `Page ${displayNum}`;
        else if (pageNumFormat === 'page-of-total') label = `Page ${displayNum} of ${total}`;
        else if (pageNumFormat === 'dashed') label = `— ${displayNum} —`;

        const fSize = Number(pageNumFontSize) || 10;
        const tw = fontRegular.widthOfTextAtSize(label, fSize);
        const margin = 26;

        let x = (width - tw) / 2;
        if (pageNumPos.includes('left')) x = margin;
        else if (pageNumPos.includes('right')) x = width - tw - margin;

        const y = pageNumPos.startsWith('top') ? height - margin - fSize : margin;

        page.drawText(label, {
          x,
          y,
          size: fSize,
          font: fontRegular,
          color: rgb(0.25, 0.28, 0.35),
          opacity: 0.9,
        });
      }
    });

    const bytes = await doc.save({ useObjectStreams: true });
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const filename = `stamped_${files[0].name}`;
    downloadBlob(blob, filename);
    setResultInfo({
      filename,
      blob,
      originalSize: files[0].size,
      newSize: blob.size,
      summary: `Applied ${[enablePageNums && 'page numbers', enableWatermark && 'watermark'].filter(Boolean).join(' & ')} across ${total} pages.`,
    });
    setMsg(`Stamped ${total} pages and downloaded "${filename}"!`, 'success');
  };

  /* 8. METADATA EDITOR */
  const runSaveMetadata = async () => {
    const doc = await PDFDocument.load(await files[0].file.arrayBuffer());
    doc.setTitle(pdfMeta.title || '');
    doc.setAuthor(pdfMeta.author || '');
    doc.setSubject(pdfMeta.subject || '');
    doc.setKeywords(
      pdfMeta.keywords
        ? pdfMeta.keywords.split(',').map(k => k.trim()).filter(Boolean)
        : []
    );
    doc.setCreator(pdfMeta.creator || 'Arsenal PDF Studio');
    doc.setProducer(pdfMeta.producer || 'Arsenal PDF Studio');
    doc.setModificationDate(new Date());

    const bytes = await doc.save({ useObjectStreams: true });
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const filename = `meta_${files[0].name}`;
    downloadBlob(blob, filename);
    setResultInfo({
      filename,
      blob,
      originalSize: files[0].size,
      newSize: blob.size,
      summary: 'Updated PDF document properties and XMP metadata.',
    });
    setMsg('Updated PDF metadata and downloaded file!', 'success');
  };

  /* 9. IMAGES -> PDF */
  const renderImageToBytes = (item) => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        const rot = ((item.rotation || 0) % 360 + 360) % 360;
        const swap = rot === 90 || rot === 270;
        const cw = swap ? img.height : img.width;
        const ch = swap ? img.width : img.height;

        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.translate(cw / 2, ch / 2);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(new Error(`Failed to encode image ${item.name}`));
              return;
            }
            blob.arrayBuffer().then(buf => resolve({ buf, width: cw, height: ch })).catch(reject);
          },
          'image/jpeg',
          0.92
        );
      };
      img.onerror = () => reject(new Error(`Failed to load ${item.name}`));
      img.src = item.thumbUrl;
    });
  };

  const runImagesToPdf = async () => {
    const doc = await PDFDocument.create();
    const margin = Number(imgMargin) || 0;

    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      setProgress(Math.round(((i + 1) / files.length) * 92));
      setMsg(`Embedding image ${i + 1} of ${files.length} ("${item.name}")…`, 'info');

      const { buf, width: iw, height: ih } = await renderImageToBytes(item);
      const embedded = await doc.embedJpg(buf);

      if (imgPageSize === 'fit') {
        const page = doc.addPage([iw + margin * 2, ih + margin * 2]);
        page.drawImage(embedded, { x: margin, y: margin, width: iw, height: ih });
      } else {
        // A4: 595.28 x 841.89, Letter: 612 x 792
        const baseW = imgPageSize === 'letter' ? 612 : 595.28;
        const baseH = imgPageSize === 'letter' ? 792 : 841.89;
        const isLandscape =
          imgOrientation === 'landscape' || (imgOrientation === 'auto' && iw > ih);
        const pw = isLandscape ? baseH : baseW;
        const ph = isLandscape ? baseW : baseH;

        const availW = Math.max(40, pw - margin * 2);
        const availH = Math.max(40, ph - margin * 2);
        const scale = Math.min(availW / iw, availH / ih);
        const drawW = iw * scale;
        const drawH = ih * scale;
        const x = (pw - drawW) / 2;
        const y = (ph - drawH) / 2;

        const page = doc.addPage([pw, ph]);
        page.drawImage(embedded, { x, y, width: drawW, height: drawH });
      }
    }

    const bytes = await doc.save({ useObjectStreams: true });
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const filename = files.length === 1 ? `${files[0].name.replace(/\.[^.]+$/, '')}.pdf` : 'images_album.pdf';
    downloadBlob(blob, filename);
    setResultInfo({
      filename,
      blob,
      originalSize: files.reduce((a, f) => a + f.size, 0),
      newSize: blob.size,
      summary: `Compiled ${files.length} image${files.length > 1 ? 's' : ''} into a ${imgPageSize.toUpperCase()} PDF.`,
    });
    setMsg(`Created "${filename}" from ${files.length} image${files.length > 1 ? 's' : ''}!`, 'success');
  };

  /* ------------------------------------------------------------------
     Live Native Vector PDF Preview Compiler (for md-pdf and word-pdf)
  ------------------------------------------------------------------- */
  useEffect(() => {
    if (!activeTool || !['md-pdf', 'word-pdf'].includes(activeTool.id)) return;
    if (activeTool.id === 'word-pdf' && files.length === 0) return;

    let cancelled = false;
    setMdCompiling(true);

    const timer = setTimeout(async () => {
      try {
        const result = await compileMarkdownToVectorPdf(mdText || '# Untitled', {
          title: docTitle || 'Document',
          pageSize: docPageSize,
          orientation: docOrientation,
          typography: docTheme,
          fontSize: docFontSize,
          marginPt: docMargin,
          accentColor: docAccent,
          showHeader: docShowHeader,
          showPageNumbers: docShowPageNums,
        });
        if (cancelled) return;

        setMdCompiledPdf({
          blob: result.blob,
          bytes: result.bytes,
          pageCount: result.pageCount,
          size: result.blob.size,
        });

        // Render actual PDF pages for the True Vector PDF Pages preview
        if (mdPreviewMode === 'pdf') {
          const pdf = await pdfjsLib.getDocument({ data: result.bytes.slice(0) }).promise;
          if (cancelled) return;
          const pages = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const vp = page.getViewport({ scale: 1.35 });
            const canvas = document.createElement('canvas');
            canvas.width = vp.width;
            canvas.height = vp.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
            if (cancelled) return;
            pages.push({
              pageNum: i,
              dataUrl: canvas.toDataURL('image/png'),
            });
          }
          if (!cancelled) setMdPreviewPages(pages);
        }
      } catch (err) {
        console.error('Vector PDF preview compile error:', err);
      } finally {
        if (!cancelled) setMdCompiling(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    activeTool,
    files.length,
    mdText,
    docTitle,
    docPageSize,
    docOrientation,
    docTheme,
    docFontSize,
    docMargin,
    docAccent,
    docShowHeader,
    docShowPageNums,
    mdPreviewMode,
  ]);

  /* 10 & 11. NATIVE VECTOR MARKDOWN & WORD -> PDF */
  const runHtmlToPdf = async (rawFilename) => {
    setMsg('Compiling native vector PDF…', 'info');
    setProgress(35);

    const result = await compileMarkdownToVectorPdf(mdText || '# Untitled', {
      title: docTitle || rawFilename || 'Document',
      pageSize: docPageSize,
      orientation: docOrientation,
      typography: docTheme,
      fontSize: docFontSize,
      marginPt: docMargin,
      accentColor: docAccent,
      showHeader: docShowHeader,
      showPageNumbers: docShowPageNums,
    });

    setProgress(90);
    const cleanName = (rawFilename || 'document').replace(/\.pdf$/i, '') + '.pdf';
    downloadBlob(result.blob, cleanName);

    setResultInfo({
      filename: cleanName,
      blob: result.blob,
      originalSize: files[0]?.size || new Blob([mdText]).size,
      newSize: result.blob.size,
      summary: `Compiled ${result.pageCount}-page 100% vector selectable ${docPageSize.toUpperCase()} PDF (${formatBytes(result.blob.size)}).`,
    });
    setMsg(`Downloaded ${result.pageCount}-page vector PDF ("${cleanName}")!`, 'success');
  };

  /* Native Vector Print-to-PDF for Markdown & Word */
  const handleVectorPrint = () => {
    const htmlContent =
      activeTool?.id === 'md-pdf' ? marked.parse(mdText || '') : docHtml;
    const fontFamily =
      docTheme === 'academic'
        ? "'Georgia', 'Times New Roman', serif"
        : docTheme === 'mono'
        ? "'JetBrains Mono', monospace"
        : "'Inter', system-ui, -apple-system, sans-serif";

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
  <title>${docTitle || 'Document'}</title>
  <style>
    @page { size: ${docPageSize}; margin: 18mm; }
    body {
      font-family: ${fontFamily};
      font-size: ${docFontSize}px;
      line-height: 1.7;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }
    h1, h2, h3, h4 { color: #0f172a; page-break-after: avoid; margin-top: 1.2em; margin-bottom: 0.45em; }
    h1 { font-size: 2em; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.25em; }
    h2 { font-size: 1.45em; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.2em; }
    p, li, blockquote, pre, table { page-break-inside: avoid; }
    code { background: #f1f5f9; padding: 0.15em 0.35em; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
    pre { background: #0f172a; color: #f8fafc; padding: 1em; border-radius: 8px; overflow-x: auto; }
    pre code { background: transparent; color: inherit; padding: 0; }
    blockquote { border-left: 4px solid #6366f1; margin: 1em 0; padding: 0.5em 1em; background: #f8fafc; color: #334155; }
    table { width: 100%; border-collapse: collapse; margin: 1em 0; }
    th, td { border: 1px solid #cbd5e1; padding: 0.5em 0.75em; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>${htmlContent}</body>
</html>`);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1500);
    }, 250);
  };

  /* 12. PDF -> IMAGES */
  const runPdfToImages = async () => {
    const targetPages =
      selectedPages.size > 0
        ? Array.from(selectedPages).sort((a, b) => a - b)
        : thumbnails.map(t => t.pageNum);

    if (targetPages.length === 0) throw new Error('Select at least one page to export.');

    const buf = await files[0].file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const baseName = files[0].name.replace(/\.pdf$/i, '');
    const mime =
      exportImgFormat === 'png'
        ? 'image/png'
        : exportImgFormat === 'webp'
        ? 'image/webp'
        : 'image/jpeg';
    const ext = exportImgFormat === 'jpeg' ? 'jpg' : exportImgFormat;

    const zip = new JSZip();
    const generated = [];

    for (let i = 0; i < targetPages.length; i++) {
      const pn = targetPages[i];
      setProgress(Math.round(((i + 1) / targetPages.length) * 92));
      setMsg(`Rendering page ${pn} at ${exportImgScale}x resolution…`, 'info');

      const page = await pdf.getPage(pn);
      const vp = page.getViewport({ scale: Number(exportImgScale) || 2 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;

      const dataUrl = canvas.toDataURL(mime, 0.92);
      const base64 = dataUrl.split(',')[1];
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const imgBlob = new Blob([bytes], { type: mime });
      const fname = `${baseName}_page_${pn}.${ext}`;

      zip.file(fname, bytes);
      generated.push({
        pageNum: pn,
        dataUrl,
        blob: imgBlob,
        filename: fname,
        width: Math.round(vp.width),
        height: Math.round(vp.height),
      });
    }

    setRenderedImages(generated);

    if (generated.length === 1) {
      downloadBlob(generated[0].blob, generated[0].filename);
      setResultInfo({
        filename: generated[0].filename,
        blob: generated[0].blob,
        originalSize: files[0].size,
        newSize: generated[0].blob.size,
        summary: `Exported page ${generated[0].pageNum} as ${ext.toUpperCase()} (${generated[0].width}×${generated[0].height}px).`,
      });
    } else {
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipName = `${baseName}_${generated.length}_images_${ext}.zip`;
      downloadBlob(zipBlob, zipName);
      setResultInfo({
        filename: zipName,
        blob: zipBlob,
        originalSize: files[0].size,
        newSize: zipBlob.size,
        summary: `Exported ${generated.length} pages as ${ext.toUpperCase()} images. You can also download individual pages below.`,
      });
    }
    setMsg(`Rendered ${generated.length} high-resolution ${ext.toUpperCase()} image${generated.length > 1 ? 's' : ''}!`, 'success');
  };

  /* 13. PDF -> WORD / MARKDOWN / TEXT */
  const runExportWord = async (format = 'docx') => {
    if (extractedPages.length === 0) throw new Error('No extracted text available.');
    const baseName = files[0].name.replace(/\.pdf$/i, '');

    if (format === 'txt') {
      const txt = extractedPages
        .map(p => `--- Page ${p.pageNum} ---\n${p.lines.map(l => l.text).join('\n')}`)
        .join('\n\n');
      const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, `${baseName}.txt`);
      setMsg(`Downloaded "${baseName}.txt"!`, 'success');
      return;
    }

    if (format === 'md') {
      const md = extractedPages
        .map(p => `<!-- Page ${p.pageNum} -->\n${p.rawText}`)
        .join('\n\n---\n\n');
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      downloadBlob(blob, `${baseName}.md`);
      setMsg(`Downloaded "${baseName}.md"!`, 'success');
      return;
    }

    // Build structured .docx
    const children = [];
    extractedPages.forEach((p, idx) => {
      if (p.lines.length === 0) {
        children.push(new Paragraph({ children: [new TextRun({ text: '[Blank or Scanned Image Page]', italics: true })] }));
      } else {
        p.lines.forEach(line => {
          if (line.isHeading) {
            children.push(
              new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [new TextRun({ text: line.text, bold: true })],
                spacing: { before: 240, after: 120 },
              })
            );
          } else {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: line.text })],
                spacing: { after: 120 },
              })
            );
          }
        });
      }
      if (idx < extractedPages.length - 1) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
    });

    const wordDoc = new Document({
      sections: [{ properties: {}, children }],
    });
    const blob = await Packer.toBlob(wordDoc);
    const filename = `${baseName}.docx`;
    downloadBlob(blob, filename);
    setResultInfo({
      filename,
      blob,
      originalSize: files[0].size,
      newSize: blob.size,
      summary: `Converted ${extractedPages.length} pages into an editable Microsoft Word (.docx) document.`,
    });
    setMsg(`Downloaded editable Word document ("${filename}")!`, 'success');
  };

  /* ------------------------------------------------------------------
     Markdown Quick Formatting Helper
  ------------------------------------------------------------------- */
  const insertMdSnippet = (snippet) => {
    setMdText(prev => `${prev}\n${snippet}\n`);
  };

  /* ------------------------------------------------------------------
     Filtered Tools for Landing View
  ------------------------------------------------------------------- */
  const filteredTools = useMemo(() => {
    return TOOLS.filter(tool => {
      const matchesCat = activeCategory === 'all' || tool.category === activeCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        tool.title.toLowerCase().includes(q) ||
        tool.desc.toLowerCase().includes(q) ||
        tool.tagline.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [activeCategory, searchQuery]);

  /* ==================================================================
     RENDER: LANDING VIEW
  =================================================================== */
  if (!activeTool) {
    return (
      <div className="pdf-studio-landing">
        {/* Hero Header */}
        <header className="pdf-hero">
          <div className="pdf-hero-badge">
            <Sparkles size={14} />
            <span>100% Client-Side PDF Engine • Zero Uploads</span>
          </div>
          <h1 className="pdf-hero-title">
            <span className="gradient-text">PDF Studio</span> & Toolkit
          </h1>
          <p className="pdf-hero-sub">
            Merge, split, organize, compress, stamp, and convert PDFs directly in your browser with full visual page previews and complete privacy.
          </p>

          {/* Filter & Search Bar */}
          <div className="pdf-filter-bar glass">
            <div className="pdf-cat-pills" role="tablist">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  type="button"
                  role="tab"
                  aria-selected={activeCategory === cat.key}
                  className={`pdf-cat-pill ${activeCategory === cat.key ? 'active' : ''}`}
                  onClick={() => setActiveCategory(cat.key)}
                >
                  <span>{cat.label}</span>
                  <span className="pdf-cat-count">{cat.badge}</span>
                </button>
              ))}
            </div>

            <div className="pdf-search-wrap">
              <Search size={16} className="pdf-search-icon" />
              <input
                type="text"
                className="pdf-search-input"
                placeholder="Search PDF tools (e.g. merge, rotate, watermark)…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="pdf-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Tool Cards Grid */}
        <section className="pdf-catalog-grid">
          {filteredTools.map(tool => {
            const IconComp = tool.icon;
            return (
              <div
                key={tool.id}
                className="pdf-tool-card glass"
                onClick={() => openTool(tool.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && openTool(tool.id)}
              >
                <div className="pdf-tool-card-top">
                  <div className="pdf-tool-icon-box" style={{ background: tool.gradient }}>
                    <IconComp size={24} />
                  </div>
                  <span className="pdf-tool-tagline" style={{ color: tool.accent }}>
                    {tool.tagline}
                  </span>
                </div>

                <div className="pdf-tool-card-body">
                  <h3 className="pdf-tool-title">{tool.title}</h3>
                  <p className="pdf-tool-desc">{tool.desc}</p>
                </div>

                <ul className="pdf-tool-features">
                  {tool.features.map(f => (
                    <li key={f}>
                      <Check size={13} className="pdf-feat-check" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="pdf-tool-card-footer">
                  <span className="pdf-open-link">
                    Open Studio <ChevronRight size={15} />
                  </span>
                </div>

                <div className="pdf-card-glow" style={{ background: tool.gradient }} />
              </div>
            );
          })}
        </section>
      </div>
    );
  }

  /* ==================================================================
     RENDER: ACTIVE TOOL WORKSPACE
  =================================================================== */
  const ActiveIcon = activeTool.icon;
  const showDropzone =
    activeTool.id !== 'md-pdf' && (files.length === 0 || activeTool.multiple);

  return (
    <div className="pdf-studio-workspace">
      {/* Top Studio Bar with Quick Tool Switcher */}
      <div className="pdf-ws-header glass">
        <div className="pdf-ws-header-left">
          <button type="button" className="btn btn-ghost pdf-back-btn" onClick={goBack}>
            <ArrowLeft size={16} />
            <span>All PDF Tools</span>
          </button>

          <div className="pdf-ws-active-badge">
            <div className="pdf-ws-icon-sm" style={{ background: activeTool.gradient }}>
              <ActiveIcon size={18} />
            </div>
            <div>
              <h2 className="pdf-ws-title">{activeTool.title}</h2>
              <p className="pdf-ws-subtitle">{activeTool.desc}</p>
            </div>
          </div>
        </div>

        {files.length > 0 && (
          <div className="pdf-ws-header-right">
            <button type="button" className="btn btn-ghost pdf-reset-btn" onClick={resetWorkspace}>
              <RefreshCw size={15} />
              <span>Start Over</span>
            </button>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {loading && (
        <div className="pdf-progress-wrap glass">
          <div className="pdf-progress-header">
            <span className="spinner" />
            <span>{status.msg || 'Processing…'}</span>
            {progress > 0 && <span className="pdf-progress-pct">{progress}%</span>}
          </div>
          <div className="pdf-progress-track">
            <div className="pdf-progress-fill" style={{ width: `${Math.max(8, progress)}%` }} />
          </div>
        </div>
      )}

      {/* Status Alert */}
      {!loading && status.msg && (
        <div className={`pdf-alert pdf-alert-${status.type}`}>
          {status.type === 'error' ? <AlertCircle size={18} /> : <Check size={18} />}
          <span>{status.msg}</span>
        </div>
      )}

      {/* Result Summary & Re-Download Banner */}
      {resultInfo && (
        <div className="pdf-result-banner glass">
          <div className="pdf-result-left">
            <div className="pdf-result-check">
              <Check size={20} />
            </div>
            <div>
              <h4>Ready: {resultInfo.filename}</h4>
              <p>{resultInfo.summary}</p>
              {resultInfo.originalSize > 0 && resultInfo.newSize > 0 && (
                <div className="pdf-size-chips">
                  <span className="pdf-chip">Input: {formatBytes(resultInfo.originalSize)}</span>
                  <span className="pdf-chip pdf-chip-accent">Output: {formatBytes(resultInfo.newSize)}</span>
                  {resultInfo.originalSize > resultInfo.newSize && (
                    <span className="pdf-chip pdf-chip-success">
                      -{((1 - resultInfo.newSize / resultInfo.originalSize) * 100).toFixed(1)}% Saved
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="pdf-result-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => downloadBlob(resultInfo.blob, resultInfo.filename)}
            >
              <Download size={16} />
              <span>Download Again</span>
            </button>
          </div>
        </div>
      )}

      {/* ============================================================
         TOOL 10: MARKDOWN -> PDF (NATIVE VECTOR TYPESETTER STUDIO)
      ============================================================ */}
      {activeTool.id === 'md-pdf' && (
        <div className="pdf-doc-studio">
          {/* Row 1: Templates, Upload & Quick Markdown Snippets */}
          <div className="pdf-doc-toolbar glass">
            <div className="pdf-doc-Formatting">
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} /> Upload .md
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown,.txt"
                style={{ display: 'none' }}
                onChange={e => handleFiles(e.target.files)}
              />
              <select
                className="pdf-select-sm"
                defaultValue="spec"
                onChange={e => {
                  const tpl = MD_TEMPLATES[e.target.value];
                  if (tpl) {
                    setMdText(tpl.content);
                    setDocTitle(tpl.title);
                  }
                }}
                aria-label="Load Markdown Template"
              >
                <option value="spec">Template: Technical Spec</option>
                <option value="academic">Template: Academic & Math</option>
                <option value="report">Template: Executive Report</option>
              </select>

              <span className="pdf-toolbar-divider" />

              <button type="button" className="btn btn-ghost btn-xs" onClick={() => insertMdSnippet('# Main Title')}>
                H1
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => insertMdSnippet('## Section Heading')}>
                H2
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => insertMdSnippet('**Bold** and *Italic*')}>
                B / I
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => insertMdSnippet('```python\ndef solve(x):\n    return x ** 2\n```')}>
                Code
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => insertMdSnippet('| Parameter | Value | Notes |\n| :--- | :--- | :--- |\n| Latency | 12 ms | Optimal |')}>
                Table
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => insertMdSnippet('> [!NOTE]\n> Key architectural insight or warning callout.')}>
                Alert
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => insertMdSnippet('$$\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$')}>
                Math
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => insertMdSnippet('- [x] Completed task\n- [ ] Pending task')}>
                Tasks
              </button>
            </div>
          </div>

          {/* Row 2: Page Setup, Typography, Accent Color & Header/Footer Toggles */}
          <div className="pdf-doc-toolbar glass">
            <div className="pdf-doc-options">
              <div className="pdf-field-inline">
                <label>Title / Header</label>
                <input
                  type="text"
                  className="pdf-input-sm"
                  value={docTitle}
                  onChange={e => setDocTitle(e.target.value)}
                  placeholder="Document Title"
                />
              </div>
              <div className="pdf-field-inline">
                <label>Paper</label>
                <select className="pdf-select-sm" value={docPageSize} onChange={e => setDocPageSize(e.target.value)}>
                  <option value="a4">A4 (210×297mm)</option>
                  <option value="letter">US Letter</option>
                </select>
              </div>
              <div className="pdf-field-inline">
                <label>Layout</label>
                <select className="pdf-select-sm" value={docOrientation} onChange={e => setDocOrientation(e.target.value)}>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
              <div className="pdf-field-inline">
                <label>Font</label>
                <select className="pdf-select-sm" value={docTheme} onChange={e => setDocTheme(e.target.value)}>
                  <option value="modern">Modern Sans (Helvetica)</option>
                  <option value="academic">Academic Serif (Times)</option>
                  <option value="mono">Technical Mono (Courier)</option>
                </select>
              </div>
              <div className="pdf-field-inline">
                <label>Size</label>
                <select className="pdf-select-sm" value={docFontSize} onChange={e => setDocFontSize(Number(e.target.value))}>
                  <option value={10}>10 pt (Compact)</option>
                  <option value={11}>11 pt (Standard)</option>
                  <option value={12}>12 pt (Comfortable)</option>
                </select>
              </div>
              <div className="pdf-field-inline">
                <label>Margins</label>
                <select className="pdf-select-sm" value={docMargin} onChange={e => setDocMargin(Number(e.target.value))}>
                  <option value={36}>Narrow (0.5&quot;)</option>
                  <option value={48}>Standard (0.67&quot;)</option>
                  <option value={64}>Wide (0.9&quot;)</option>
                </select>
              </div>
              <div className="pdf-field-inline">
                <label>Accent</label>
                <select className="pdf-select-sm" value={docAccent} onChange={e => setDocAccent(e.target.value)}>
                  <option value="indigo">Indigo Blue</option>
                  <option value="emerald">Emerald Teal</option>
                  <option value="slate">Classic Monochrome</option>
                  <option value="crimson">Crimson Rose</option>
                </select>
              </div>
              <label className="pdf-inline-check">
                <input
                  type="checkbox"
                  checked={docShowHeader}
                  onChange={e => setDocShowHeader(e.target.checked)}
                />
                <span>Header</span>
              </label>
              <label className="pdf-inline-check">
                <input
                  type="checkbox"
                  checked={docShowPageNums}
                  onChange={e => setDocShowPageNums(e.target.checked)}
                />
                <span>Page #</span>
              </label>
            </div>
          </div>

          {/* Split Panes: Markdown Editor (Left) + Live Vector PDF Pages Preview (Right) */}
          <div className="pdf-md-split">
            <div className="pdf-md-pane glass">
              <div className="pdf-pane-header">
                <span>Markdown Source Editor</span>
                <span className="pdf-pane-meta">
                  {mdText.trim().split(/\s+/).filter(Boolean).length} words • {mdText.length} chars
                </span>
              </div>
              <textarea
                className="pdf-md-textarea"
                value={mdText}
                onChange={e => setMdText(e.target.value)}
                placeholder="Write or paste Markdown here…"
                spellCheck={false}
              />
            </div>

            <div className="pdf-md-pane glass">
              <div className="pdf-pane-header">
                <div className="pdf-preview-tabs">
                  <button
                    type="button"
                    className={`pdf-preview-tab ${mdPreviewMode === 'pdf' ? 'active' : ''}`}
                    onClick={() => setMdPreviewMode('pdf')}
                  >
                    True PDF Pages ({mdCompiledPdf ? `${mdCompiledPdf.pageCount}p` : '…'})
                  </button>
                  <button
                    type="button"
                    className={`pdf-preview-tab ${mdPreviewMode === 'web' ? 'active' : ''}`}
                    onClick={() => setMdPreviewMode('web')}
                  >
                    Web HTML View
                  </button>
                </div>
                <span className="pdf-pane-meta">
                  {mdCompiling
                    ? 'Compiling vector PDF…'
                    : mdCompiledPdf
                    ? `100% Vector • ${formatBytes(mdCompiledPdf.size)}`
                    : 'Ready'}
                </span>
              </div>

              {mdPreviewMode === 'pdf' ? (
                <div className="pdf-vector-pages-scroll">
                  {mdPreviewPages.map(pg => (
                    <div
                      key={pg.pageNum}
                      className="pdf-vector-page-card"
                      onClick={() =>
                        setZoomModal({
                          pageNum: pg.pageNum,
                          dataUrl: pg.dataUrl,
                          rotation: 0,
                        })
                      }
                      title="Click to inspect page at full resolution"
                    >
                      <div className="pdf-vector-page-badge">
                        <span>Page {pg.pageNum} of {mdPreviewPages.length}</span>
                        <span className="pdf-vector-zoom-hint">
                          <ZoomIn size={12} /> Click to zoom
                        </span>
                      </div>
                      <img src={pg.dataUrl} alt={`PDF Page ${pg.pageNum}`} className="pdf-vector-page-img" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pdf-paper-scroll">
                  <div
                    className={`pdf-paper-sheet pdf-theme-${docTheme}`}
                    style={{ fontSize: `${docFontSize + 3}px` }}
                    dangerouslySetInnerHTML={{ __html: marked.parse(mdText || '') }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Export Footer Bar */}
          <div className="pdf-action-bar glass">
            <div className="pdf-action-summary">
              <span>
                Native Vector PDF Ready •{' '}
                <strong>
                  {mdCompiledPdf ? `${mdCompiledPdf.pageCount} Page${mdCompiledPdf.pageCount > 1 ? 's' : ''} (${formatBytes(mdCompiledPdf.size)})` : '100% Selectable Text'}
                </strong>
              </span>
            </div>
            <div className="pdf-panel-actions">
              <button type="button" className="btn btn-ghost" onClick={handleVectorPrint}>
                <Printer size={17} />
                <span>Browser Print Dialog</span>
              </button>
              <button type="button" className="btn btn-primary pdf-main-action" onClick={execute} disabled={loading}>
                <Download size={18} />
                <span>Download Vector PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
         SHARED DROPZONE FOR FILE-BASED TOOLS
      ============================================================ */}
      {showDropzone && (
        <div
          className={`pdf-dropzone-card glass ${dragOver ? 'dragover' : ''} ${files.length > 0 ? 'compact' : ''}`}
          onDragOver={e => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="pdf-dz-icon-circle" style={{ background: activeTool.gradient }}>
            <Upload size={files.length > 0 ? 20 : 28} />
          </div>
          <div className="pdf-dz-text">
            <h3>
              {files.length > 0
                ? 'Add More Files to Queue'
                : `Drop your ${activeTool.id === 'word-pdf' ? '.docx Word file' : activeTool.id === 'img-pdf' ? 'images (JPG, PNG, WebP, SVG)' : 'PDF file'} here`}
            </h3>
            <p>or click to browse from your device • 100% local browser processing</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            accept={activeTool.accepts}
            multiple={activeTool.multiple}
            onChange={e => handleFiles(e.target.files)}
          />
        </div>
      )}

      {/* Single File Info Bar (when a single PDF is loaded) */}
      {!activeTool.multiple && activeTool.id !== 'md-pdf' && files.length === 1 && (
        <div className="pdf-active-file-bar glass">
          <div className="pdf-active-file-info">
            <FileText size={20} className="pdf-file-icon" />
            <div>
              <span className="pdf-active-file-name">{files[0].name}</span>
              <span className="pdf-active-file-meta">
                {formatBytes(files[0].size)}
                {thumbnails.length > 0 ? ` • ${thumbnails.length} Pages` : ''}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={resetWorkspace}
          >
            <X size={14} /> Replace File
          </button>
        </div>
      )}

      {/* ============================================================
         TOOL 1: MERGE PDF QUEUE & PAGE RANGE SELECTOR
      ============================================================ */}
      {activeTool.id === 'merge' && files.length > 0 && (
        <div className="pdf-panel glass">
          <div className="pdf-panel-header">
            <div>
              <h3>Merge Queue ({files.length} PDF{files.length > 1 ? 's' : ''})</h3>
              <p>Drag items or use the arrows to reorder. Optionally specify page ranges per file (e.g. <code>1-3, 5</code>).</p>
            </div>
            <div className="pdf-panel-actions">
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setFiles(prev => [...prev].sort((a, b) => a.name.localeCompare(b.name)))}
              >
                <ArrowUpDown size={14} /> Sort A–Z
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setFiles(prev => [...prev].reverse())}
              >
                Reverse
              </button>
            </div>
          </div>

          <div className="pdf-merge-list">
            {files.map((item, idx) => (
              <div
                key={item.id}
                className="pdf-merge-item"
                draggable
                onDragStart={() => {
                  dragIndexRef.current = idx;
                }}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  const from = dragIndexRef.current;
                  if (from === null || from === idx) return;
                  setFiles(prev => {
                    const copy = [...prev];
                    const [moved] = copy.splice(from, 1);
                    copy.splice(idx, 0, moved);
                    return copy;
                  });
                  dragIndexRef.current = null;
                }}
              >
                <span className="pdf-merge-index">{idx + 1}</span>
                {item.thumbUrl && (
                  <img src={item.thumbUrl} alt={item.name} className="pdf-merge-thumb" />
                )}
                <div className="pdf-merge-details">
                  <div className="pdf-merge-name">{item.name}</div>
                  <div className="pdf-merge-meta">
                    <span>{item.pageCount} page{item.pageCount > 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span>{formatBytes(item.size)}</span>
                  </div>
                </div>

                <div className="pdf-merge-range">
                  <label>Pages:</label>
                  <input
                    type="text"
                    className="pdf-input-sm"
                    placeholder={`All (1-${item.pageCount})`}
                    value={item.range}
                    onChange={e => {
                      const val = e.target.value;
                      setFiles(prev => prev.map((f, i) => (i === idx ? { ...f, range: val } : f)));
                    }}
                  />
                </div>

                <div className="pdf-merge-controls">
                  <button
                    type="button"
                    className="pdf-icon-btn"
                    disabled={idx === 0}
                    onClick={() =>
                      setFiles(prev => {
                        const copy = [...prev];
                        [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
                        return copy;
                      })
                    }
                    title="Move Up"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    className="pdf-icon-btn"
                    disabled={idx === files.length - 1}
                    onClick={() =>
                      setFiles(prev => {
                        const copy = [...prev];
                        [copy[idx + 1], copy[idx]] = [copy[idx], copy[idx + 1]];
                        return copy;
                      })
                    }
                    title="Move Down"
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    type="button"
                    className="pdf-icon-btn pdf-icon-btn-danger"
                    onClick={() => setFiles(prev => prev.filter((_, i) => i !== idx))}
                    title="Remove File"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================
         TOOL 2: SPLIT & EXTRACT CONTROLS
      ============================================================ */}
      {activeTool.id === 'split' && thumbnails.length > 0 && (
        <div className="pdf-panel glass">
          <div className="pdf-panel-header">
            <h3>Split & Extraction Mode</h3>
          </div>
          <div className="pdf-mode-cards">
            <label className={`pdf-mode-card ${splitMode === 'extract' ? 'active' : ''}`}>
              <input
                type="radio"
                name="splitMode"
                value="extract"
                checked={splitMode === 'extract'}
                onChange={() => setSplitMode('extract')}
              />
              <div>
                <strong>Extract Selected into One PDF</strong>
                <p>Combines your highlighted pages ({selectedPages.size}) into a single new PDF document.</p>
              </div>
            </label>

            <label className={`pdf-mode-card ${splitMode === 'individual' ? 'active' : ''}`}>
              <input
                type="radio"
                name="splitMode"
                value="individual"
                checked={splitMode === 'individual'}
                onChange={() => setSplitMode('individual')}
              />
              <div>
                <strong>Split Selected into Separate PDFs (ZIP)</strong>
                <p>Saves each selected page ({selectedPages.size}) as its own standalone PDF file inside a ZIP.</p>
              </div>
            </label>

            <label className={`pdf-mode-card ${splitMode === 'ranges' ? 'active' : ''}`}>
              <input
                type="radio"
                name="splitMode"
                value="ranges"
                checked={splitMode === 'ranges'}
                onChange={() => setSplitMode('ranges')}
              />
              <div>
                <strong>Split by Custom Range Groups (ZIP)</strong>
                <p>Define comma-separated page ranges (e.g. <code>1-3, 4-6, 7-end</code>) to create multiple multi-page PDFs.</p>
              </div>
            </label>
          </div>

          {splitMode === 'ranges' && (
            <div className="pdf-range-group-box">
              <label>Page Range Groups (Total Pages: {thumbnails.length}):</label>
              <input
                type="text"
                className="pdf-input-md"
                value={splitRangeGroups}
                onChange={e => setSplitRangeGroups(e.target.value)}
                placeholder="e.g. 1-3, 4-7, 8-end"
              />
              <span className="pdf-hint">
                Creates {parseRangeGroups(splitRangeGroups, thumbnails.length).length} PDF files inside a ZIP archive.
              </span>
            </div>
          )}
        </div>
      )}

      {/* ============================================================
         TOOL 4: COMPRESS PDF CONTROLS
      ============================================================ */}
      {activeTool.id === 'compress' && files.length > 0 && (
        <div className="pdf-panel glass">
          <div className="pdf-panel-header">
            <h3>Compression Engine Settings</h3>
            <p>Select your balance between visual sharpness, text selectability, and file size reduction.</p>
          </div>

          <div className="pdf-mode-cards">
            <label className={`pdf-mode-card ${compressPreset === 'optimize' ? 'active' : ''}`}>
              <input
                type="radio"
                name="compressPreset"
                value="optimize"
                checked={compressPreset === 'optimize'}
                onChange={() => setCompressPreset('optimize')}
              />
              <div>
                <strong>Lossless Vector Optimization</strong>
                <p>Compresses PDF object streams & strips bloated metadata. Preserves 100% vector text sharpness.</p>
              </div>
            </label>

            <label className={`pdf-mode-card ${compressPreset === 'high' ? 'active' : ''}`}>
              <input
                type="radio"
                name="compressPreset"
                value="high"
                checked={compressPreset === 'high'}
                onChange={() => setCompressPreset('high')}
              />
              <div>
                <strong>High Quality (150 DPI • 82% JPEG)</strong>
                <p>Great for presentations and scanned reports with minimal visible compression artifacts.</p>
              </div>
            </label>

            <label className={`pdf-mode-card ${compressPreset === 'medium' ? 'active' : ''}`}>
              <input
                type="radio"
                name="compressPreset"
                value="medium"
                checked={compressPreset === 'medium'}
                onChange={() => setCompressPreset('medium')}
              />
              <div>
                <strong>Recommended Balanced (120 DPI • 65% JPEG)</strong>
                <p>Strong file size reduction for email attachments and web uploads while keeping text readable.</p>
              </div>
            </label>

            <label className={`pdf-mode-card ${compressPreset === 'low' ? 'active' : ''}`}>
              <input
                type="radio"
                name="compressPreset"
                value="low"
                checked={compressPreset === 'low'}
                onChange={() => setCompressPreset('low')}
              />
              <div>
                <strong>Extreme Compression (90 DPI • 48% JPEG)</strong>
                <p>Maximum shrinkage for heavy image-based PDFs when smallest file size is the top priority.</p>
              </div>
            </label>
          </div>

          {compressPreset !== 'optimize' && (
            <label className="pdf-checkbox-row">
              <input
                type="checkbox"
                checked={compressGrayscale}
                onChange={e => setCompressGrayscale(e.target.checked)}
              />
              <span>Convert pages to Grayscale (Black & White) for extra file size savings</span>
            </label>
          )}
        </div>
      )}

      {/* ============================================================
         TOOL 6: ROTATE PDF BATCH CONTROLS
      ============================================================ */}
      {activeTool.id === 'rotate' && thumbnails.length > 0 && (
        <div className="pdf-panel glass">
          <div className="pdf-panel-header">
            <div>
              <h3>Batch Rotation Controls</h3>
              <p>Rotate groups of pages at once or click the rotate buttons on individual page cards below.</p>
            </div>
            <div className="pdf-rotate-toolbar">
              <select
                className="pdf-select-sm"
                value={rotateFilter}
                onChange={e => setRotateFilter(e.target.value)}
              >
                <option value="all">Target: All Pages ({thumbnails.length})</option>
                <option value="portrait">Target: Portrait Pages Only</option>
                <option value="landscape">Target: Landscape Pages Only</option>
                <option value="odd">Target: Odd Pages</option>
                <option value="even">Target: Even Pages</option>
              </select>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => rotateMatchingPages(-90)}>
                <RotateCcw size={15} /> Rotate 90° Left
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => rotateMatchingPages(90)}>
                <RotateCw size={15} /> Rotate 90° Right
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => rotateMatchingPages(180)}>
                Flip 180°
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setThumbnails(prev => prev.map(t => ({ ...t, rotation: 0 })))}
              >
                Reset All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
         TOOL 7: WATERMARK & PAGE NUMBERS STUDIO
      ============================================================ */}
      {activeTool.id === 'stamp' && files.length > 0 && (
        <div className="pdf-stamp-grid">
          {/* Page Numbers Card */}
          <div className="pdf-panel glass">
            <label className="pdf-toggle-header">
              <input
                type="checkbox"
                checked={enablePageNums}
                onChange={e => setEnablePageNums(e.target.checked)}
              />
              <strong>Add Page Numbers</strong>
            </label>

            {enablePageNums && (
              <div className="pdf-form-grid">
                <div className="pdf-form-field">
                  <label>Position</label>
                  <select className="pdf-select-sm" value={pageNumPos} onChange={e => setPageNumPos(e.target.value)}>
                    <option value="bottom-center">Bottom Center</option>
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="top-center">Top Center</option>
                    <option value="top-right">Top Right</option>
                    <option value="top-left">Top Left</option>
                  </select>
                </div>

                <div className="pdf-form-field">
                  <label>Format Style</label>
                  <select className="pdf-select-sm" value={pageNumFormat} onChange={e => setPageNumFormat(e.target.value)}>
                    <option value="page-of-total">Page 1 of {thumbnails.length || 'N'}</option>
                    <option value="page-num">Page 1</option>
                    <option value="number">1</option>
                    <option value="dashed">— 1 —</option>
                  </select>
                </div>

                <div className="pdf-form-field">
                  <label>Start on Page #</label>
                  <input
                    type="number"
                    min={1}
                    max={thumbnails.length || 999}
                    className="pdf-input-sm"
                    value={pageNumStart}
                    onChange={e => setPageNumStart(Number(e.target.value))}
                  />
                </div>

                <div className="pdf-form-field">
                  <label>Font Size (pt)</label>
                  <input
                    type="number"
                    min={7}
                    max={28}
                    className="pdf-input-sm"
                    value={pageNumFontSize}
                    onChange={e => setPageNumFontSize(Number(e.target.value))}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Watermark Card */}
          <div className="pdf-panel glass">
            <label className="pdf-toggle-header">
              <input
                type="checkbox"
                checked={enableWatermark}
                onChange={e => setEnableWatermark(e.target.checked)}
              />
              <strong>Add Text Watermark</strong>
            </label>

            {enableWatermark && (
              <div className="pdf-form-grid">
                <div className="pdf-form-field pdf-col-span-2">
                  <label>Watermark Text</label>
                  <input
                    type="text"
                    className="pdf-input-sm"
                    value={watermarkText}
                    onChange={e => setWatermarkText(e.target.value)}
                    placeholder="e.g. CONFIDENTIAL, DRAFT, DO NOT COPY"
                  />
                </div>

                <div className="pdf-form-field">
                  <label>Placement</label>
                  <select className="pdf-select-sm" value={watermarkPos} onChange={e => setWatermarkPos(e.target.value)}>
                    <option value="diagonal">Diagonal (45° Center)</option>
                    <option value="center">Horizontal Center</option>
                    <option value="top">Top Header Stamp</option>
                    <option value="bottom">Bottom Footer Stamp</option>
                  </select>
                </div>

                <div className="pdf-form-field">
                  <label>Color</label>
                  <div className="pdf-color-row">
                    <input
                      type="color"
                      value={watermarkColor}
                      onChange={e => setWatermarkColor(e.target.value)}
                      className="pdf-color-picker"
                    />
                    <span>{watermarkColor.toUpperCase()}</span>
                  </div>
                </div>

                <div className="pdf-form-field">
                  <label>Font Size ({watermarkSize} pt)</label>
                  <input
                    type="range"
                    min={18}
                    max={96}
                    value={watermarkSize}
                    onChange={e => setWatermarkSize(Number(e.target.value))}
                  />
                </div>

                <div className="pdf-form-field">
                  <label>Opacity ({watermarkOpacity}%)</label>
                  <input
                    type="range"
                    min={5}
                    max={90}
                    value={watermarkOpacity}
                    onChange={e => setWatermarkOpacity(Number(e.target.value))}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
         TOOL 8: METADATA & PROPERTIES INSPECTOR
      ============================================================ */}
      {activeTool.id === 'metadata' && files.length > 0 && (
        <div className="pdf-panel glass">
          <div className="pdf-panel-header">
            <div>
              <h3>PDF Document Metadata & Properties</h3>
              <p>Inspect document specifications or modify embedded XMP/Info dictionary attributes.</p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() =>
                setPdfMeta(prev => ({
                  ...prev,
                  title: '',
                  author: '',
                  subject: '',
                  keywords: '',
                  creator: '',
                  producer: '',
                }))
              }
            >
              <Trash2 size={14} /> Clear All Fields
            </button>
          </div>

          <div className="pdf-meta-specs">
            <div className="pdf-spec-box">
              <span className="pdf-spec-label">Pages</span>
              <strong>{pdfMeta.pageCount}</strong>
            </div>
            <div className="pdf-spec-box">
              <span className="pdf-spec-label">File Size</span>
              <strong>{formatBytes(files[0].size)}</strong>
            </div>
            <div className="pdf-spec-box">
              <span className="pdf-spec-label">Page Dimensions</span>
              <strong>{pdfMeta.pageSizeStr || 'Standard'}</strong>
            </div>
            <div className="pdf-spec-box">
              <span className="pdf-spec-label">Created</span>
              <strong>{pdfMeta.creationDate}</strong>
            </div>
          </div>

          <div className="pdf-form-grid">
            <div className="pdf-form-field">
              <label>Document Title</label>
              <input
                type="text"
                className="pdf-input-sm"
                value={pdfMeta.title}
                onChange={e => setPdfMeta({ ...pdfMeta, title: e.target.value })}
                placeholder="Enter document title"
              />
            </div>
            <div className="pdf-form-field">
              <label>Author</label>
              <input
                type="text"
                className="pdf-input-sm"
                value={pdfMeta.author}
                onChange={e => setPdfMeta({ ...pdfMeta, author: e.target.value })}
                placeholder="Author name or organization"
              />
            </div>
            <div className="pdf-form-field">
              <label>Subject / Description</label>
              <input
                type="text"
                className="pdf-input-sm"
                value={pdfMeta.subject}
                onChange={e => setPdfMeta({ ...pdfMeta, subject: e.target.value })}
                placeholder="Document subject"
              />
            </div>
            <div className="pdf-form-field">
              <label>Keywords (comma-separated)</label>
              <input
                type="text"
                className="pdf-input-sm"
                value={pdfMeta.keywords}
                onChange={e => setPdfMeta({ ...pdfMeta, keywords: e.target.value })}
                placeholder="engineering, report, notes"
              />
            </div>
            <div className="pdf-form-field">
              <label>Creator Application</label>
              <input
                type="text"
                className="pdf-input-sm"
                value={pdfMeta.creator}
                onChange={e => setPdfMeta({ ...pdfMeta, creator: e.target.value })}
                placeholder="Arsenal PDF Studio"
              />
            </div>
            <div className="pdf-form-field">
              <label>PDF Producer</label>
              <input
                type="text"
                className="pdf-input-sm"
                value={pdfMeta.producer}
                onChange={e => setPdfMeta({ ...pdfMeta, producer: e.target.value })}
                placeholder="Arsenal PDF Studio"
              />
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
         TOOL 9: IMAGES -> PDF GALLERY & LAYOUT CONTROLS
      ============================================================ */}
      {activeTool.id === 'img-pdf' && files.length > 0 && (
        <div className="pdf-panel glass">
          <div className="pdf-panel-header">
            <div>
              <h3>Image Album ({files.length} Image{files.length > 1 ? 's' : ''})</h3>
              <p>Drag to reorder, rotate individual images, and configure page layout.</p>
            </div>
            <div className="pdf-doc-options">
              <div className="pdf-field-inline">
                <label>Page Size</label>
                <select className="pdf-select-sm" value={imgPageSize} onChange={e => setImgPageSize(e.target.value)}>
                  <option value="a4">A4 Standard</option>
                  <option value="letter">US Letter</option>
                  <option value="fit">Fit to Image Size</option>
                </select>
              </div>
              {imgPageSize !== 'fit' && (
                <div className="pdf-field-inline">
                  <label>Orientation</label>
                  <select className="pdf-select-sm" value={imgOrientation} onChange={e => setImgOrientation(e.target.value)}>
                    <option value="auto">Auto (Match Image)</option>
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>
              )}
              <div className="pdf-field-inline">
                <label>Margins</label>
                <select className="pdf-select-sm" value={imgMargin} onChange={e => setImgMargin(Number(e.target.value))}>
                  <option value={0}>No Margin (Full Bleed)</option>
                  <option value={24}>Small Margin</option>
                  <option value={48}>Large Margin</option>
                </select>
              </div>
            </div>
          </div>

          <div className="pdf-thumb-grid">
            {files.map((img, idx) => (
              <div
                key={img.id}
                className="pdf-thumb-card"
                draggable
                onDragStart={() => {
                  dragIndexRef.current = idx;
                }}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  const from = dragIndexRef.current;
                  if (from === null || from === idx) return;
                  setFiles(prev => {
                    const copy = [...prev];
                    const [moved] = copy.splice(from, 1);
                    copy.splice(idx, 0, moved);
                    return copy;
                  });
                  dragIndexRef.current = null;
                }}
              >
                <div className="pdf-thumb-top-badges">
                  <span className="pdf-page-pill">#{idx + 1}</span>
                  <span className="pdf-dim-pill">{img.width}×{img.height}</span>
                </div>

                <div className="pdf-thumb-img-wrap">
                  <img
                    src={img.thumbUrl}
                    alt={img.name}
                    style={{ transform: `rotate(${img.rotation || 0}deg)` }}
                  />
                </div>

                <div className="pdf-thumb-caption" title={img.name}>
                  {img.name}
                </div>

                <div className="pdf-thumb-actions">
                  <button
                    type="button"
                    className="pdf-icon-btn"
                    disabled={idx === 0}
                    onClick={() =>
                      setFiles(prev => {
                        const c = [...prev];
                        [c[idx - 1], c[idx]] = [c[idx], c[idx - 1]];
                        return c;
                      })
                    }
                    title="Move Left"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    className="pdf-icon-btn"
                    onClick={() =>
                      setFiles(prev =>
                        prev.map((it, i) => (i === idx ? { ...it, rotation: ((it.rotation || 0) + 90) % 360 } : it))
                      )
                    }
                    title="Rotate 90°"
                  >
                    <RotateCw size={14} />
                  </button>
                  <button
                    type="button"
                    className="pdf-icon-btn"
                    disabled={idx === files.length - 1}
                    onClick={() =>
                      setFiles(prev => {
                        const c = [...prev];
                        [c[idx + 1], c[idx]] = [c[idx], c[idx + 1]];
                        return c;
                      })
                    }
                    title="Move Right"
                  >
                    <ChevronRight size={14} />
                  </button>
                  <button
                    type="button"
                    className="pdf-icon-btn pdf-icon-btn-danger"
                    onClick={() => setFiles(prev => prev.filter((_, i) => i !== idx))}
                    title="Remove Image"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================
         TOOL 11: WORD (.DOCX) -> VECTOR PDF STUDIO
      ============================================================ */}
      {activeTool.id === 'word-pdf' && files.length > 0 && (
        <div className="pdf-doc-studio">
          <div className="pdf-doc-toolbar glass">
            <div className="pdf-doc-options">
              <div className="pdf-field-inline">
                <label>Title / Header</label>
                <input
                  type="text"
                  className="pdf-input-sm"
                  value={docTitle}
                  onChange={e => setDocTitle(e.target.value)}
                />
              </div>
              <div className="pdf-field-inline">
                <label>Paper</label>
                <select className="pdf-select-sm" value={docPageSize} onChange={e => setDocPageSize(e.target.value)}>
                  <option value="a4">A4</option>
                  <option value="letter">US Letter</option>
                </select>
              </div>
              <div className="pdf-field-inline">
                <label>Layout</label>
                <select className="pdf-select-sm" value={docOrientation} onChange={e => setDocOrientation(e.target.value)}>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
              <div className="pdf-field-inline">
                <label>Font</label>
                <select className="pdf-select-sm" value={docTheme} onChange={e => setDocTheme(e.target.value)}>
                  <option value="modern">Modern Sans</option>
                  <option value="academic">Academic Serif</option>
                  <option value="mono">Technical Mono</option>
                </select>
              </div>
              <div className="pdf-field-inline">
                <label>Size</label>
                <select className="pdf-select-sm" value={docFontSize} onChange={e => setDocFontSize(Number(e.target.value))}>
                  <option value={10}>10 pt</option>
                  <option value={11}>11 pt</option>
                  <option value={12}>12 pt</option>
                </select>
              </div>
              <label className="pdf-inline-check">
                <input
                  type="checkbox"
                  checked={docShowHeader}
                  onChange={e => setDocShowHeader(e.target.checked)}
                />
                <span>Header</span>
              </label>
              <label className="pdf-inline-check">
                <input
                  type="checkbox"
                  checked={docShowPageNums}
                  onChange={e => setDocShowPageNums(e.target.checked)}
                />
                <span>Page #</span>
              </label>
            </div>
          </div>

          <div className="pdf-md-split">
            <div className="pdf-md-pane glass">
              <div className="pdf-pane-header">
                <span>Editable Document Content</span>
                <span className="pdf-pane-meta">Edit text or headings before export</span>
              </div>
              <textarea
                className="pdf-md-textarea"
                value={mdText}
                onChange={e => setMdText(e.target.value)}
                spellCheck={false}
              />
            </div>

            <div className="pdf-md-pane glass">
              <div className="pdf-pane-header">
                <span>True Vector PDF Pages ({mdCompiledPdf ? `${mdCompiledPdf.pageCount}p` : '…'})</span>
                <span className="pdf-pane-meta">
                  {mdCompiling
                    ? 'Compiling vector PDF…'
                    : mdCompiledPdf
                    ? `100% Vector • ${formatBytes(mdCompiledPdf.size)}`
                    : 'Ready'}
                </span>
              </div>
              <div className="pdf-vector-pages-scroll">
                {mdPreviewPages.map(pg => (
                  <div
                    key={pg.pageNum}
                    className="pdf-vector-page-card"
                    onClick={() =>
                      setZoomModal({
                        pageNum: pg.pageNum,
                        dataUrl: pg.dataUrl,
                        rotation: 0,
                      })
                    }
                  >
                    <div className="pdf-vector-page-badge">
                      <span>Page {pg.pageNum} of {mdPreviewPages.length}</span>
                      <span className="pdf-vector-zoom-hint">
                        <ZoomIn size={12} /> Click to zoom
                      </span>
                    </div>
                    <img src={pg.dataUrl} alt={`PDF Page ${pg.pageNum}`} className="pdf-vector-page-img" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pdf-action-bar glass">
            <div className="pdf-action-summary">
              <span>
                Native Vector PDF Ready •{' '}
                <strong>
                  {mdCompiledPdf ? `${mdCompiledPdf.pageCount} Page${mdCompiledPdf.pageCount > 1 ? 's' : ''} (${formatBytes(mdCompiledPdf.size)})` : '100% Selectable Text'}
                </strong>
              </span>
            </div>
            <div className="pdf-panel-actions">
              <button type="button" className="btn btn-ghost" onClick={handleVectorPrint}>
                <Printer size={17} />
                <span>Browser Print Dialog</span>
              </button>
              <button type="button" className="btn btn-primary pdf-main-action" onClick={execute} disabled={loading}>
                <Download size={18} />
                <span>Download Vector PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
         TOOL 12: PDF -> IMAGES OPTIONS & GALLERY
      ============================================================ */}
      {activeTool.id === 'pdf-images' && thumbnails.length > 0 && (
        <div className="pdf-panel glass">
          <div className="pdf-panel-header">
            <div>
              <h3>Raster Export Configuration</h3>
              <p>Select target pages below ({selectedPages.size} of {thumbnails.length} selected) and choose output format & DPI.</p>
            </div>
            <div className="pdf-doc-options">
              <div className="pdf-field-inline">
                <label>Format</label>
                <select className="pdf-select-sm" value={exportImgFormat} onChange={e => setExportImgFormat(e.target.value)}>
                  <option value="png">PNG (Lossless Sharp)</option>
                  <option value="jpeg">JPG (Compact Photo)</option>
                  <option value="webp">WebP (Modern Web)</option>
                </select>
              </div>
              <div className="pdf-field-inline">
                <label>Resolution</label>
                <select className="pdf-select-sm" value={exportImgScale} onChange={e => setExportImgScale(Number(e.target.value))}>
                  <option value={1}>1x (72 DPI • Standard)</option>
                  <option value={2}>2x (144 DPI • High Definition)</option>
                  <option value={3}>3x (216 DPI • Ultra Print)</option>
                </select>
              </div>
            </div>
          </div>

          {renderedImages.length > 0 && (
            <div className="pdf-rendered-gallery">
              <h4>Rendered Output Images (Click any page to download individually)</h4>
              <div className="pdf-rendered-grid">
                {renderedImages.map(img => (
                  <div
                    key={img.pageNum}
                    className="pdf-rendered-item"
                    onClick={() => downloadBlob(img.blob, img.filename)}
                  >
                    <img src={img.dataUrl} alt={`Page ${img.pageNum}`} />
                    <div className="pdf-rendered-Bar">
                      <span>Page {img.pageNum} ({img.width}×{img.height})</span>
                      <Download size={14} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================
         TOOL 13: PDF -> WORD & TEXT READER
      ============================================================ */}
      {activeTool.id === 'pdf-word' && extractedPages.length > 0 && (
        <div className="pdf-panel glass">
          <div className="pdf-panel-header">
            <div>
              <h3>Extracted Text & Structure Preview</h3>
              <p>Headings and line spacing are reconstructed using spatial coordinate analysis.</p>
            </div>
            <div className="pdf-panel-actions">
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => {
                  const allText = extractedPages.map(p => p.rawText).join('\n\n');
                  navigator.clipboard.writeText(allText);
                  setMsg('Copied all extracted text to clipboard!', 'success');
                }}
              >
                <Copy size={14} /> Copy All Text
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => runExportWord('txt')}>
                <Download size={14} /> .TXT
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => runExportWord('md')}>
                <Download size={14} /> .MD
              </button>
              <button type="button" className="btn btn-primary btn-xs" onClick={() => runExportWord('docx')}>
                <Download size={14} /> Download .DOCX
              </button>
            </div>
          </div>

          <div className="pdf-reader-layout">
            <div className="pdf-reader-sidebar">
              {extractedPages.map((p, idx) => (
                <button
                  key={p.pageNum}
                  type="button"
                  className={`pdf-reader-tab ${activeReadPage === idx ? 'active' : ''}`}
                  onClick={() => setActiveReadPage(idx)}
                >
                  <span>Page {p.pageNum}</span>
                  <span className="pdf-reader-count">{p.lines.length} lines</span>
                </button>
              ))}
            </div>

            <div className="pdf-reader-content">
              {extractedPages[activeReadPage]?.lines.length > 0 ? (
                extractedPages[activeReadPage].lines.map((line, lIdx) =>
                  line.isHeading ? (
                    <h4 key={lIdx} className="pdf-extracted-heading">
                      {line.text}
                    </h4>
                  ) : (
                    <p key={lIdx} className="pdf-extracted-line">
                      {line.text}
                    </p>
                  )
                )
              ) : (
                <p className="pdf-extracted-empty">
                  No selectable vector text found on this page (it may be a scanned image).
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
         INTERACTIVE PAGE THUMBNAIL GRID
         (For remove, split, organize, rotate, compress, stamp, pdf-images)
      ============================================================ */}
      {thumbnails.length > 0 && (
        <div className="pdf-panel glass">
          <div className="pdf-panel-header">
            <div>
              <h3>
                {activeTool.id === 'organize'
                  ? `Interactive Page Studio (${thumbnails.length} Pages)`
                  : activeTool.id === 'remove'
                  ? `Click Pages to Remove (${selectedPages.size} marked for deletion, keeping ${thumbnails.length - selectedPages.size})`
                  : ['split', 'pdf-images'].includes(activeTool.id)
                  ? `Page Selection (${selectedPages.size} of ${thumbnails.length} selected)`
                  : `Document Pages Preview (${thumbnails.length} Pages)`}
              </h3>
            </div>

            {/* Selection Toolbar for Remove / Split / PDF-Images */}
            {['remove', 'split', 'pdf-images'].includes(activeTool.id) && (
              <div className="pdf-selection-bar">
                <input
                  type="text"
                  className="pdf-input-sm"
                  placeholder="Range e.g. 1-3, 5"
                  value={rangeInput}
                  onChange={e => applyRangeToSelection(e.target.value)}
                />
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => selectByPreset('all')}>
                  All
                </button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => selectByPreset('none')}>
                  None
                </button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => selectByPreset('invert')}>
                  Invert
                </button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => selectByPreset('odd')}>
                  Odd
                </button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => selectByPreset('even')}>
                  Even
                </button>
              </div>
            )}

            {/* Studio Toolbar for Organize */}
            {activeTool.id === 'organize' && (
              <div className="pdf-selection-bar">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => insertBlankPage(thumbnails.length - 1)}
                >
                  <Plus size={14} /> Add Blank Page
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setThumbnails(prev => [...prev].reverse())}
                >
                  <ArrowUpDown size={14} /> Reverse Order
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => files[0]?.file && loadPdfThumbnails(files[0].file)}
                >
                  <RefreshCw size={14} /> Reset Pages
                </button>
              </div>
            )}
          </div>

          <div className="pdf-thumb-grid">
            {thumbnails.map((t, idx) => {
              const isSelected = t.pageNum !== null && selectedPages.has(t.pageNum);
              const isDeleteMode = activeTool.id === 'remove';
              const isSelectable = ['remove', 'split', 'pdf-images'].includes(activeTool.id);
              const isOrganize = activeTool.id === 'organize';
              const isRotate = activeTool.id === 'rotate';

              return (
                <div
                  key={t.id}
                  className={`pdf-thumb-card ${isSelected ? (isDeleteMode ? 'marked-delete' : 'marked-select') : ''}`}
                  onClick={() => isSelectable && t.pageNum !== null && togglePageSelection(t.pageNum)}
                  draggable={isOrganize}
                  onDragStart={() => {
                    dragIndexRef.current = idx;
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => {
                    if (!isOrganize) return;
                    const from = dragIndexRef.current;
                    if (from === null || from === idx) return;
                    setThumbnails(prev => {
                      const copy = [...prev];
                      const [moved] = copy.splice(from, 1);
                      copy.splice(idx, 0, moved);
                      return copy;
                    });
                    dragIndexRef.current = null;
                  }}
                >
                  <div className="pdf-thumb-top-badges">
                    <span className="pdf-page-pill">
                      {isOrganize ? `#${idx + 1}` : `Page ${t.pageNum}`}
                    </span>
                    {t.rotation > 0 && <span className="pdf-rot-pill">{t.rotation}°</span>}
                    {isOrganize && !t.isBlank && idx + 1 !== t.pageNum && (
                      <span className="pdf-orig-pill">was p.{t.pageNum}</span>
                    )}
                    {t.isBlank && <span className="pdf-orig-pill">Blank</span>}
                    <button
                      type="button"
                      className="pdf-zoom-btn"
                      onClick={e => {
                        e.stopPropagation();
                        handleZoomPage(t);
                      }}
                      title="Inspect Page High-Res"
                    >
                      <ZoomIn size={13} />
                    </button>
                  </div>

                  <div className="pdf-thumb-img-wrap">
                    <img
                      src={t.dataUrl}
                      alt={`Page ${t.pageNum || idx + 1}`}
                      style={{ transform: `rotate(${t.rotation || 0}deg)` }}
                    />
                    {isSelected && (
                      <div className={`pdf-thumb-overlay ${isDeleteMode ? 'delete-overlay' : 'select-overlay'}`}>
                        {isDeleteMode ? <Trash2 size={24} /> : <Check size={24} />}
                      </div>
                    )}
                  </div>

                  {/* Per-page studio controls for Organize & Rotate */}
                  {(isOrganize || isRotate) && (
                    <div className="pdf-thumb-actions" onClick={e => e.stopPropagation()}>
                      {isOrganize && (
                        <button
                          type="button"
                          className="pdf-icon-btn"
                          disabled={idx === 0}
                          onClick={() => moveThumbnail(idx, -1)}
                          title="Move Left"
                        >
                          <ChevronLeft size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="pdf-icon-btn"
                        onClick={() => rotateThumbnail(idx, -90)}
                        title="Rotate 90° CCW"
                      >
                        <RotateCcw size={14} />
                      </button>
                      <button
                        type="button"
                        className="pdf-icon-btn"
                        onClick={() => rotateThumbnail(idx, 90)}
                        title="Rotate 90° CW"
                      >
                        <RotateCw size={14} />
                      </button>
                      {isOrganize && (
                        <>
                          <button
                            type="button"
                            className="pdf-icon-btn"
                            onClick={() => duplicateThumbnail(idx)}
                            title="Duplicate Page"
                          >
                            <Copy size={13} />
                          </button>
                          <button
                            type="button"
                            className="pdf-icon-btn"
                            disabled={idx === thumbnails.length - 1}
                            onClick={() => moveThumbnail(idx, 1)}
                            title="Move Right"
                          >
                            <ChevronRight size={14} />
                          </button>
                          <button
                            type="button"
                            className="pdf-icon-btn pdf-icon-btn-danger"
                            onClick={() => deleteThumbnailAt(idx)}
                            title="Delete Page"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================
         PRIMARY EXECUTE FOOTER BAR
      ============================================================ */}
      {!['md-pdf', 'word-pdf'].includes(activeTool.id) && files.length > 0 && (
        <div className="pdf-action-bar glass">
          <div className="pdf-action-summary">
            <span>
              Ready to run <strong>{activeTool.title}</strong>
              {files.length > 1 ? ` on ${files.length} files` : ` on "${files[0].name}"`}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-primary pdf-main-action"
            onClick={execute}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" />
                <span>Processing…</span>
              </>
            ) : (
              <>
                <Download size={18} />
                <span>
                  {activeTool.id === 'merge'
                    ? `Merge ${files.length} PDF${files.length > 1 ? 's' : ''}`
                    : activeTool.id === 'split'
                    ? splitMode === 'extract'
                      ? `Extract ${selectedPages.size} Page${selectedPages.size === 1 ? '' : 's'}`
                      : 'Split & Download ZIP'
                    : activeTool.id === 'remove'
                    ? `Remove ${selectedPages.size} Page${selectedPages.size === 1 ? '' : 's'} & Save`
                    : activeTool.id === 'organize'
                    ? `Save Organized PDF (${thumbnails.length} Pages)`
                    : activeTool.id === 'rotate'
                    ? 'Save Rotated PDF'
                    : activeTool.id === 'compress'
                    ? 'Compress & Download PDF'
                    : activeTool.id === 'stamp'
                    ? 'Apply Stamp & Download PDF'
                    : activeTool.id === 'metadata'
                    ? 'Save Updated Metadata'
                    : activeTool.id === 'img-pdf'
                    ? `Build PDF from ${files.length} Image${files.length > 1 ? 's' : ''}`
                    : activeTool.id === 'pdf-images'
                    ? `Export ${selectedPages.size || thumbnails.length} Page${(selectedPages.size || thumbnails.length) > 1 ? 's' : ''} as ${exportImgFormat.toUpperCase()}`
                    : activeTool.id === 'pdf-word'
                    ? 'Download Editable Word (.docx)'
                    : activeTool.title}
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* ============================================================
         HIGH-RES PAGE ZOOM MODAL
      ============================================================ */}
      {zoomModal && (
        <div className="pdf-zoom-backdrop" onClick={() => setZoomModal(null)}>
          <div className="pdf-zoom-dialog glass" onClick={e => e.stopPropagation()}>
            <div className="pdf-zoom-header">
              <strong>Page {zoomModal.pageNum || ''} High-Resolution Preview</strong>
              <button
                type="button"
                className="pdf-icon-btn"
                onClick={() => setZoomModal(null)}
                aria-label="Close preview"
              >
                <X size={18} />
              </button>
            </div>
            <div className="pdf-zoom-body">
              <img
                src={zoomModal.dataUrl}
                alt={`Page ${zoomModal.pageNum}`}
                style={{ transform: `rotate(${zoomModal.rotation || 0}deg)` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
