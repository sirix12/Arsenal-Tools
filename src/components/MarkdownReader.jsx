import { useState, useRef, useEffect, useCallback } from 'react';
import './MarkdownReader.css';

/* ------------------------------------------------------------------
   Dynamic script loader helper
------------------------------------------------------------------- */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
function loadLink(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}

const CDN = {
  marked:    'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
  markedHL:  'https://cdn.jsdelivr.net/npm/marked-highlight/lib/index.umd.js',
  hljs:      'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js',
  hljsCss:   'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/atom-one-dark.min.css',
  katex:     'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
  katexCss:  'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
  katexExt:  'https://cdn.jsdelivr.net/npm/marked-katex-extension@5.1.7/lib/index.umd.js',
  html2pdf:  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
};

/* ------------------------------------------------------------------
   Component
   ------------------------------------------------------------------- */
export default function MarkdownReader() {
  const [view, setView] = useState('input'); // 'input' | 'reader'
  const [mdText, setMdText] = useState('');
  const [renderedHtml, setRenderedHtml] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [readTime, setReadTime] = useState(0);
  const [ready, setReady] = useState(false);
  const [fullWidth, setFullWidth] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const readerRef = useRef(null);
  const progressRef = useRef(null);
  const fileInputRef = useRef(null);

  /* Load CDN scripts once */
  useEffect(() => {
    loadLink(CDN.hljsCss);
    loadLink(CDN.katexCss);

    (async () => {
      await loadScript(CDN.hljs);
      await loadScript(CDN.marked);
      await loadScript(CDN.markedHL);
      await loadScript(CDN.katex);
      await loadScript(CDN.katexExt);
      await loadScript(CDN.html2pdf);

      const { markedHighlight } = window.markedHighlight;
      window.marked.use(
        markedHighlight({
          emptyLangClass: 'hljs',
          langPrefix: 'hljs language-',
          highlight(code, lang) {
            const language = window.hljs.getLanguage(lang) ? lang : 'plaintext';
            return window.hljs.highlight(code, { language }).value;
          },
        })
      );
      window.marked.use(
        window.markedKatex({ throwOnError: false, output: 'html', nonStandard: true })
      );
      setReady(true);
    })();
  }, []);

  /* Progress bar on scroll */
  useEffect(() => {
    if (view !== 'reader') return;
    const update = () => {
      const scrolled = document.documentElement.scrollTop;
      const total = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (progressRef.current)
        progressRef.current.style.width = total === 0 ? '0%' : (scrolled / total) * 100 + '%';
    };
    window.addEventListener('scroll', update);
    return () => window.removeEventListener('scroll', update);
  }, [view]);

  const calcStats = (text) => {
    const clean = text.replace(/[#*`_\[\]()$]/g, '');
    const count = clean.trim().split(/\s+/).filter(w => w.length > 0).length;
    setWordCount(count);
    setReadTime(Math.max(1, Math.ceil(count / 200)));
  };

  const render = useCallback(() => {
    if (!mdText.trim() || !ready) return;
    const html = window.marked.parse(mdText);
    setRenderedHtml(html);
    calcStats(mdText);
    setView('reader');
    window.scrollTo(0, 0);
  }, [mdText, ready]);

  /* Inject rendered HTML after reader view mounts */
  useEffect(() => {
    if (view === 'reader' && readerRef.current) {
      readerRef.current.innerHTML = renderedHtml;
    }
  }, [view, renderedHtml]);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setMdText(ev.target.result);
    reader.readAsText(file);
  };

  const handleSave = async () => {
    try {
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
          suggestedName: 'document.md',
        });
        const w = await handle.createWritable();
        await w.write(mdText);
        await w.close();
      } else {
        const blob = new Blob([mdText], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: 'document.md' });
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (err.name !== 'AbortError') alert('Failed to save file.');
    }
  };

  const handleExportPdf = async () => {
    if (!readerRef.current || generatingPdf) return;
    setGeneratingPdf(true);

    let overlay = null;
    try {
      const originalElement = readerRef.current;
      const clonedElement = originalElement.cloneNode(true);

      // Create loading overlay
      overlay = document.createElement('div');
      overlay.className = 'pdf-export-overlay';

      const loader = document.createElement('div');
      loader.className = 'pdf-export-loader';
      loader.innerHTML = '<span class="spinner"></span><p>Generating PDF... Please wait.</p>';
      overlay.appendChild(loader);

      // Hidden but layout-active container
      const printContainer = document.createElement('div');
      printContainer.className = 'pdf-print-container';
      printContainer.setAttribute('data-theme', 'light');

      clonedElement.classList.add('markdown-body', 'md-pdf-print');
      Object.assign(clonedElement.style, {
        background: '#ffffff',
        color: '#0f172a',
        padding: '30px',
        width: '780px',
        margin: '0 auto',
        boxSizing: 'border-box'
      });

      printContainer.appendChild(clonedElement);
      overlay.appendChild(printContainer);
      document.body.appendChild(overlay);

      // Wait 250ms for browser styling and layout pass
      await new Promise((resolve) => setTimeout(resolve, 250));

      const opt = {
        margin: [15, 15, 15, 15],
        filename: 'document.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          logging: false,
          scrollY: 0,
          scrollX: 0
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      await window.html2pdf().set(opt).from(clonedElement).save();
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Failed to generate PDF document.');
    } finally {
      if (overlay && document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
      setGeneratingPdf(false);
    }
  };

  /* ----------------------------------------------------------------
     Render
  ---------------------------------------------------------------- */
  return (
    <div className="md-reader-page">
      {/* Progress bar */}
      <div className="md-progress-container">
        <div className="md-progress-bar" ref={progressRef} />
      </div>

      {/* ---- INPUT VIEW ---- */}
      {view === 'input' && (
        <div className="md-input-view">
          <div className="md-input-header glass">
            <div className="md-input-title">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span>MD Reader Pro</span>
            </div>
            <label className="btn btn-ghost upload-label">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload .md
              <input type="file" accept=".md,.txt,.markdown" ref={fileInputRef} onChange={handleFile} style={{ display: 'none' }} />
            </label>
          </div>

          <p className="md-input-hint">Paste Markdown (supports LaTeX math!) or upload a file, then click Read.</p>

          <textarea
            className="md-textarea glass"
            value={mdText}
            onChange={(e) => setMdText(e.target.value)}
            placeholder="# Hello World&#10;&#10;Start writing or paste your Markdown here…&#10;&#10;Math: $E = mc^2$"
            spellCheck={false}
          />

          <button
            className="btn btn-primary md-read-btn"
            onClick={render}
            disabled={!ready || !mdText.trim()}
          >
            {!ready ? (
              <>
                <span className="spinner" /> Loading libraries…
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
                Read Document
              </>
            )}
          </button>
        </div>
      )}

      {/* ---- READER VIEW ---- */}
      {view === 'reader' && (
        <div className={`md-reader-view ${fullWidth ? 'full-width' : ''}`}>
          {/* Reader toolbar */}
          <div className="reader-toolbar glass">
            <button className="btn btn-ghost" onClick={() => { setView('input'); if (progressRef.current) progressRef.current.style.width = '0%'; }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>

            <div className="reader-stats">
              <span>{wordCount} words</span>
              <span>·</span>
              <span>{readTime} min read</span>
            </div>

            <div className="reader-actions">
              <button className="btn btn-ghost" onClick={() => setFullWidth(fw => !fw)} title="Toggle full width">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              </button>
              <button className="btn btn-ghost" onClick={handleSave} title="Save as .md">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                Save
              </button>
              <button 
                className="btn btn-ghost" 
                onClick={handleExportPdf} 
                disabled={generatingPdf}
                title="Export as PDF"
              >
                {generatingPdf ? (
                  <>
                    <span className="spinner" style={{ marginRight: '6px' }} /> Generating...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    PDF
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Rendered content */}
          <article className="md-content markdown-body" ref={readerRef} />
        </div>
      )}
    </div>
  );
}
