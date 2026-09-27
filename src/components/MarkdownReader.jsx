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
  marked: 'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
  markedHL: 'https://cdn.jsdelivr.net/npm/marked-highlight/lib/index.umd.js',
  hljs: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js',
  hljsCss: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/atom-one-dark.min.css',
  katex: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
  katexCss: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
  katexExt: 'https://cdn.jsdelivr.net/npm/marked-katex-extension@5.1.7/lib/index.umd.js',
  html2pdf: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
};

const API_URL = import.meta.env.VITE_API_URL || '';

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------- */

/* Extract block-level HTML (div, svg, canvas, math, iframe) from markdown,
   respecting nesting depth, so marked leaves them untouched. Only outermost
   blocks are extracted; nested tags are preserved inside the raw block. */
function extractBlockHtml(markdown) {
  const tagRe = /<(\/?)(div|svg|canvas|math|iframe)(?:\s[^>]*)?>/gi;
  const blocks = [];
  let output = '';
  let cursor = 0;
  let opening = null;
  let depth = 0;
  let m;

  while ((m = tagRe.exec(markdown)) !== null) {
    const isClosing = m[1] === '/';
    const tag = m[2].toLowerCase();

    if (isClosing) {
      if (opening && opening.tag === tag) {
        depth--;
        if (depth === 0) {
          const endPos = m.index + m[0].length;
          const block = markdown.slice(opening.start, endPos);
          output += markdown.slice(cursor, opening.start);
          output += `<!--MARKDOWN_RAW_HTML_BLOCK_${blocks.length}-->`;
          blocks.push(block);
          cursor = endPos;
          opening = null;
        }
      }
    } else if (!m[0].endsWith('/>')) {
      if (opening) {
        if (tag === opening.tag) depth++;
      } else {
        opening = { start: m.index, tag };
        depth = 1;
      }
    }
  }
  output += markdown.slice(cursor);
  return { output, blocks };
}

function extractTitle(md) {
  const match = md.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  const now = new Date();
  return `Untitled Document — ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/* Title detected only when the document *starts* with a valid H1 heading
   (leading blank lines ignored). Returns null otherwise, so updates never
   overwrite a good stored title with a fallback. */
function extractTitleAtStart(md) {
  for (const line of (md || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^#\s+(.+)$/);
    return match ? match[1].trim() : null;
  }
  return null;
}

function stripMd(text) {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~[\]()]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function folderLabel(folder) {
  if (!folder) return 'Unfiled';
  return `${folder.code ? folder.code + ': ' : ''}${folder.name}`;
}

/* ------------------------------------------------------------------
   Component
   ------------------------------------------------------------------- */
export default function MarkdownReader() {
  const [view, setView] = useState('input'); // 'input' | 'reader' | 'library'
  const [mdText, setMdText] = useState('');
  const [renderedHtml, setRenderedHtml] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [readTime, setReadTime] = useState(0);
  const [ready, setReady] = useState(false);
  const [fullWidth, setFullWidth] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Library state (Neon Postgres + S3 object storage backend)
  const [folders, setFolders] = useState([]);
  const [savedDocs, setSavedDocs] = useState([]);
  const [currentDocId, setCurrentDocId] = useState(null);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState('all'); // 'all' | folderId | 'unfiled'
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Save dialog state — pick an existing folder or create a new one on save
  const [saveDialog, setSaveDialog] = useState(null); // { folderId: string|'\0new', newFolderName: string, saving: bool }
  // Folder management dialog: create | rename | delete
  const [folderDialog, setFolderDialog] = useState(null); // { mode, folder?, name }

  // Toast state
  const [toast, setToast] = useState(null); // { message, type: 'success'|'error' }
  const toastTimer = useRef(null);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { docId, docTitle }

  const readerRef = useRef(null);
  const progressRef = useRef(null);
  const fileInputRef = useRef(null);

  /* Show toast */
  const showToast = useCallback((message, type = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

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

      let rawBlocks = [];
      window.marked.use({
        hooks: {
          preprocess(markdown) {
            if (!markdown) return markdown;
            const extracted = extractBlockHtml(markdown);
            rawBlocks = extracted.blocks;
            return extracted.output;
          },
          postprocess(html) {
            if (!html || rawBlocks.length === 0) return html;
            let result = html;
            rawBlocks.forEach((content, id) => {
              const token = `<!--MARKDOWN_RAW_HTML_BLOCK_${id}-->`;
              result = result.replace(new RegExp(`<p>\\s*${token}\\s*<\\/p>`, 'g'), content);
              result = result.replace(new RegExp(token, 'g'), content);
            });
            return result;
          },
        },
      });

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
    const clean = text.replace(/[#*`_[\]()$]/g, '');
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
    reader.onload = (ev) => {
      setMdText(ev.target.result);
      setCurrentDocId(null); // new file, not from library
      setCurrentFolderId(null);
    };
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
    const originalScrollX = window.scrollX;
    const originalScrollY = window.scrollY;

    try {
      // Scroll to top-left to avoid html2canvas offset bugs
      window.scrollTo(0, 0);

      const originalElement = readerRef.current;
      const clonedElement = originalElement.cloneNode(true);

      // Create loading overlay
      overlay = document.createElement('div');
      overlay.className = 'pdf-export-overlay';

      const loader = document.createElement('div');
      loader.className = 'pdf-export-loader';
      loader.innerHTML = '<span class="spinner"></span><p>Generating PDF... Please wait.</p>';
      overlay.appendChild(loader);

      // Hidden but layout-active container styled for A4 printable width (180mm = ~680px)
      const printContainer = document.createElement('div');
      printContainer.className = 'pdf-print-container';
      printContainer.setAttribute('data-theme', 'light');

      clonedElement.classList.add('markdown-body', 'md-pdf-print');
      Object.assign(clonedElement.style, {
        background: '#ffffff',
        color: '#0f172a',
        padding: '0', // No internal padding, allowing jsPDF margin to define clean spacing
        margin: '0',
        width: '680px',
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
      // Restore original scroll positions
      window.scrollTo(originalScrollX, originalScrollY);
      setGeneratingPdf(false);
    }
  };

  /* ----------------------------------------------------------------
     Library operations (Neon Postgres metadata + S3 content storage)
  ---------------------------------------------------------------- */
  const fetchLibrary = useCallback(async (background = false) => {
    if (!background) setLoadingDocs(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const [foldersRes, docsRes] = await Promise.all([
        fetch(`${API_URL}/api/folders`, { signal: controller.signal }),
        fetch(`${API_URL}/api/docs`, { signal: controller.signal }),
      ]);
      clearTimeout(timeoutId);
      if (!foldersRes.ok || !docsRes.ok) throw new Error('Failed to load library');
      setFolders(await foldersRes.json());
      setSavedDocs(await docsRes.json());
    } catch (err) {
      console.error('Error fetching library:', err);
      if (!background) showToast('Failed to load documents', 'error');
    } finally {
      if (!background) setLoadingDocs(false);
    }
  }, [showToast]);

  const openLibrary = useCallback(() => {
    setView('library');
    setSearchQuery('');
    fetchLibrary(savedDocs.length > 0 || folders.length > 0);
  }, [fetchLibrary, savedDocs.length, folders.length]);

  /* Resolve the save-dialog folder choice into API fields */
  const resolveFolderChoice = (dialog) => {
    if (dialog.folderId === '__new__') {
      const name = (dialog.newFolderName || '').trim();
      if (!name) return { error: 'Please enter a name for the new folder.' };
      return { new_folder_name: name };
    }
    return { folder_id: dialog.folderId === 'unfiled' ? null : dialog.folderId };
  };

  const saveDocToCloud = useCallback(async (asNew) => {
    if (!mdText.trim() || !saveDialog || saveDialog.saving) return;
    const choice = resolveFolderChoice(saveDialog);
    if (choice.error) {
      showToast(choice.error, 'error');
      return;
    }
    setSaveDialog(d => ({ ...d, saving: true }));

    const isUpdate = !asNew && currentDocId;
    // On update, retitle only when the document starts with a valid H1;
    // otherwise the stored title is left untouched. New documents fall back
    // to the first H1 anywhere, then to a dated "Untitled" title.
    const leadingTitle = extractTitleAtStart(mdText);
    const title = isUpdate ? leadingTitle : (leadingTitle || extractTitle(mdText));
    try {
      let res;
      if (isUpdate) {
        res = await fetch(`${API_URL}/api/docs/${currentDocId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: mdText,
            ...choice,
            ...(leadingTitle ? { title: leadingTitle } : {}),
          }),
        });
      } else {
        const docId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
        res = await fetch(`${API_URL}/api/docs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: docId, title, content: mdText, ...choice }),
        });
      }
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Failed to save document');
      }
      const saved = await res.json();
      setCurrentDocId(saved.id);
      setCurrentFolderId(saved.folder_id || null);
      setSaveDialog(null);
      showToast(asNew || !currentDocId ? 'Document saved!' : 'Document updated!');
      fetchLibrary(true); // refresh counts / new folders in background
    } catch (err) {
      console.error('Error saving doc:', err);
      showToast(err.message || 'Failed to save document', 'error');
      setSaveDialog(d => (d ? { ...d, saving: false } : d));
    }
  }, [mdText, saveDialog, currentDocId, showToast, fetchLibrary]);

  const openSaveDialog = useCallback(() => {
    if (!mdText.trim()) return;
    const open = () => setSaveDialog({
      folderId: currentFolderId || 'unfiled',
      newFolderName: '',
      saving: false,
    });
    if (folders.length === 0) {
      // Folders not loaded yet (library never opened) — fetch first so the
      // dialog lists existing folders instead of only "Create new folder".
      fetchLibrary(true).finally(open);
    } else {
      open();
    }
  }, [mdText, currentFolderId, folders.length, fetchLibrary]);

  /* Preload folders/docs in the background so the save dialog and library
     are instant even if the library view was never opened. */
  useEffect(() => {
    fetchLibrary(true);
  }, [fetchLibrary]);

  const loadDocFromCloud = useCallback(async (docId) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${API_URL}/api/docs/${docId}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error('Failed to load document');
      const doc = await res.json();
      setMdText(doc.content);
      setCurrentDocId(doc.id);
      setCurrentFolderId(doc.folder_id || null);

      if (ready && doc.content.trim()) {
        const html = window.marked.parse(doc.content);
        setRenderedHtml(html);
        calcStats(doc.content);
        setView('reader');
        window.scrollTo(0, 0);
      } else {
        setView('input');
      }
      showToast(`Loaded "${doc.title}"`);
    } catch (err) {
      console.error('Error loading doc:', err);
      showToast('Failed to load document', 'error');
    }
  }, [showToast, ready]);

  const deleteDocFromCloud = useCallback(async (docId) => {
    setDeleteConfirm(null);
    // Optimistic removal
    setSavedDocs(prev => prev.filter(d => d.id !== docId));
    if (currentDocId === docId) {
      setCurrentDocId(null);
      setCurrentFolderId(null);
    }
    try {
      const res = await fetch(`${API_URL}/api/docs/${docId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      showToast('Document deleted');
      fetchLibrary(true);
    } catch (err) {
      console.error('Error deleting doc:', err);
      showToast('Failed to delete document', 'error');
      fetchLibrary(true); // restore consistent state
    }
  }, [currentDocId, showToast, fetchLibrary]);

  /* ---------- Folder CRUD ---------- */
  const submitFolderDialog = useCallback(async () => {
    if (!folderDialog) return;
    const { mode, folder, name } = folderDialog;
    const trimmed = (name || '').trim();
    if (mode !== 'delete' && !trimmed) {
      showToast('Folder name is required', 'error');
      return;
    }
    try {
      let res;
      if (mode === 'create') {
        res = await fetch(`${API_URL}/api/folders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed }),
        });
      } else if (mode === 'rename') {
        res = await fetch(`${API_URL}/api/folders/${folder.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed }),
        });
      } else {
        res = await fetch(`${API_URL}/api/folders/${folder.id}`, { method: 'DELETE' });
      }
      if (!res.ok) throw new Error('Folder operation failed');
      const result = mode === 'delete' ? null : await res.json();
      setFolderDialog(null);
      showToast(mode === 'delete' ? 'Folder deleted (documents kept as Unfiled)' : `Folder ${mode === 'create' ? 'created' : 'renamed'}!`);
      await fetchLibrary(true);
      // If we just created a folder from the library, select it; if created
      // mid-save the save dialog stays open and the caller refreshes its list.
      if (mode === 'create' && result && !saveDialog) setSelectedFolder(result.id);
    } catch (err) {
      console.error('Folder operation failed:', err);
      showToast('Folder operation failed', 'error');
    }
  }, [folderDialog, showToast, fetchLibrary, saveDialog]);

  const folderMap = new Map(folders.map(f => [f.id, f]));
  const unfiledCount = savedDocs.filter(d => !d.folder_id).length;

  const filteredDocs = savedDocs.filter(d => {
    if (selectedFolder === 'unfiled' && d.folder_id) return false;
    if (selectedFolder !== 'all' && selectedFolder !== 'unfiled' && d.folder_id !== selectedFolder) return false;
    if (searchQuery && !d.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

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
              {currentDocId && <span className="editing-badge">Editing saved doc</span>}
            </div>
            <div className="md-input-actions">
              <button className="btn btn-ghost" onClick={openLibrary} title="My Documents">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                My Docs
              </button>
              <button
                className="btn btn-ghost cloud-save-btn"
                onClick={openSaveDialog}
                disabled={!mdText.trim()}
                title="Save to library"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" />
                  <polyline points="12 13 12 17" />
                  <polyline points="10 15 12 17 14 15" />
                </svg>
                {currentDocId ? 'Update' : 'Save'}
              </button>
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
          </div>

          <p className="md-input-hint">Paste Markdown (supports LaTeX math!) or upload a file, then click Read.</p>

          <textarea
            className="md-textarea glass"
            value={mdText}
            onChange={(e) => setMdText(e.target.value)}
            placeholder={"# Hello World\n\nStart writing or paste your Markdown here…\n\nMath: $E = mc^2$"}
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
              <button
                className="btn btn-ghost cloud-save-btn"
                onClick={openSaveDialog}
                title="Save to library"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" />
                  <polyline points="12 13 12 17" />
                  <polyline points="10 15 12 17 14 15" />
                </svg>
                {currentDocId ? 'Update' : 'Save'}
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

          {/* Global SVG defs for diagrams */}
          <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#333" />
              </marker>
            </defs>
          </svg>

          {/* Rendered content */}
          <article className="md-content markdown-body" ref={readerRef} />
        </div>
      )}

      {/* ---- LIBRARY VIEW ---- */}
      {view === 'library' && (
        <div className="md-library-view">
          <div className="library-header glass">
            <div className="library-title-row">
              <button className="btn btn-ghost" onClick={() => setView('input')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                Back to Editor
              </button>
              <h2 className="library-heading">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                My Documents
                <span className="doc-count">{savedDocs.length}</span>
              </h2>
              <button className="btn btn-ghost" onClick={() => setFolderDialog({ mode: 'create', name: '' })}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" /></svg>
                New Folder
              </button>
            </div>
            <div className="library-search-wrap">
              <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="library-search"
                type="text"
                placeholder="Search documents…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="library-layout">
            {/* Folder sidebar */}
            <aside className="folder-sidebar glass">
              <button
                className={`folder-item ${selectedFolder === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedFolder('all')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                <span className="folder-item-name">All Documents</span>
                <span className="folder-count">{savedDocs.length}</span>
              </button>
              {folders.map(folder => (
                <div key={folder.id} className={`folder-item-row ${selectedFolder === folder.id ? 'active' : ''}`}>
                  <button className="folder-item" onClick={() => setSelectedFolder(folder.id)} title={folderLabel(folder)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                    <span className="folder-item-name">
                      {folder.code && <span className="folder-code">{folder.code}</span>}
                      <span className="folder-name-text">{folder.name}</span>
                      {folder.period && <span className="folder-period">{folder.period}</span>}
                    </span>
                    <span className="folder-count">{folder.doc_count}</span>
                  </button>
                  <span className="folder-item-tools">
                    <button className="icon-btn" title="Rename folder" onClick={() => setFolderDialog({ mode: 'rename', folder, name: folder.name })}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></svg>
                    </button>
                    <button className="icon-btn danger" title="Delete folder" onClick={() => setFolderDialog({ mode: 'delete', folder })}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </span>
                </div>
              ))}
              {unfiledCount > 0 && (
                <button
                  className={`folder-item ${selectedFolder === 'unfiled' ? 'active' : ''}`}
                  onClick={() => setSelectedFolder('unfiled')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                  <span className="folder-item-name">Unfiled</span>
                  <span className="folder-count">{unfiledCount}</span>
                </button>
              )}
            </aside>

            {/* Document grid */}
            <div className="library-main">
              {loadingDocs ? (
                <div className="library-grid">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="doc-card glass skeleton-card">
                      <div className="skeleton-line skeleton-title" />
                      <div className="skeleton-line skeleton-preview" />
                      <div className="skeleton-line skeleton-meta" />
                    </div>
                  ))}
                </div>
              ) : filteredDocs.length === 0 ? (
                <div className="library-empty">
                  <div className="empty-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <h3>{searchQuery ? 'No matching documents' : 'No documents in this folder yet'}</h3>
                  <p>{searchQuery ? 'Try a different search term' : 'Write some Markdown and save it into this folder!'}</p>
                  {!searchQuery && (
                    <button className="btn btn-primary" onClick={() => setView('input')}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      Create Document
                    </button>
                  )}
                </div>
              ) : (
                <div className="library-grid">
                  {filteredDocs.map(doc => {
                    const folder = doc.folder_id ? folderMap.get(doc.folder_id) : null;
                    return (
                      <div key={doc.id} className="doc-card glass">
                        <div className="doc-card-body" onClick={() => loadDocFromCloud(doc.id)}>
                          <span className="doc-folder-badge">{folder ? folderLabel(folder) : 'Unfiled'}</span>
                          <h3 className="doc-card-title">{doc.title}</h3>
                          <p className="doc-card-preview">{stripMd(doc.preview || '')}</p>
                          <div className="doc-card-meta">
                            <span className="doc-card-words">{doc.word_count} words</span>
                            <span className="doc-card-sep">·</span>
                            <span className="doc-card-date">{timeAgo(doc.updated_at)}</span>
                          </div>
                        </div>
                        <div className="doc-card-actions">
                          <button className="btn btn-ghost doc-open-btn" onClick={() => loadDocFromCloud(doc.id)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                            Open
                          </button>
                          <button className="btn btn-ghost doc-delete-btn" onClick={() => setDeleteConfirm({ docId: doc.id, docTitle: doc.title })}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- SAVE DIALOG (choose existing folder or create new) ---- */}
      {saveDialog && (
        <div className="confirm-overlay" onClick={() => !saveDialog.saving && setSaveDialog(null)}>
          <div className="save-dialog glass" onClick={e => e.stopPropagation()}>
            <h3>{currentDocId ? 'Save document' : 'Save new document'}</h3>
            <p className="save-dialog-sub">Choose a folder for this document.</p>
            <label className="save-dialog-label">Folder</label>
            <select
              className="save-dialog-select"
              value={saveDialog.folderId}
              disabled={saveDialog.saving}
              onChange={(e) => setSaveDialog(d => ({ ...d, folderId: e.target.value, newFolderName: '' }))}
            >
              <option value="unfiled">Unfiled</option>
              {folders.map(f => (
                <option key={f.id} value={f.id}>{folderLabel(f)}</option>
              ))}
              <option value="__new__">＋ Create new folder…</option>
            </select>
            {saveDialog.folderId === '__new__' && (
              <>
                <label className="save-dialog-label">New folder name</label>
                <input
                  className="save-dialog-input"
                  type="text"
                  placeholder="e.g. EC3301: Analog Electronics"
                  value={saveDialog.newFolderName}
                  disabled={saveDialog.saving}
                  onChange={(e) => setSaveDialog(d => ({ ...d, newFolderName: e.target.value }))}
                />
              </>
            )}
            <div className="confirm-actions save-dialog-actions">
              <button className="btn btn-ghost" disabled={saveDialog.saving} onClick={() => setSaveDialog(null)}>Cancel</button>
              {currentDocId && (
                <button className="btn btn-ghost" disabled={saveDialog.saving} onClick={() => saveDocToCloud(false)}>
                  {saveDialog.saving ? <><span className="spinner" /> Saving…</> : 'Update Existing'}
                </button>
              )}
              <button className="btn btn-primary" disabled={saveDialog.saving} onClick={() => saveDocToCloud(true)}>
                {saveDialog.saving ? <><span className="spinner" /> Saving…</> : (currentDocId ? 'Save as New' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- FOLDER DIALOG (create / rename / delete) ---- */}
      {folderDialog && (
        <div className="confirm-overlay" onClick={() => setFolderDialog(null)}>
          <div className="save-dialog glass" onClick={e => e.stopPropagation()}>
            <h3>
              {folderDialog.mode === 'create' && 'New folder'}
              {folderDialog.mode === 'rename' && 'Rename folder'}
              {folderDialog.mode === 'delete' && 'Delete folder?'}
            </h3>
            {folderDialog.mode === 'delete' ? (
              <p className="save-dialog-sub">
                Delete <strong>"{folderDialog.folder ? folderLabel(folderDialog.folder) : ''}"</strong>?
                {folderDialog.folder?.doc_count > 0 && (
                  <> Its {folderDialog.folder.doc_count} document{folderDialog.folder.doc_count === 1 ? '' : 's'} will be kept as <strong>Unfiled</strong>.</>
                )}
              </p>
            ) : (
              <>
                <label className="save-dialog-label">Folder name</label>
                <input
                  className="save-dialog-input"
                  type="text"
                  placeholder="e.g. EC3301: Analog Electronics"
                  value={folderDialog.name}
                  onChange={(e) => setFolderDialog(d => ({ ...d, name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitFolderDialog(); }}
                />
              </>
            )}
            <div className="confirm-actions save-dialog-actions">
              <button className="btn btn-ghost" onClick={() => setFolderDialog(null)}>Cancel</button>
              {folderDialog.mode === 'delete' ? (
                <button className="btn btn-danger" onClick={submitFolderDialog}>Delete</button>
              ) : (
                <button className="btn btn-primary" onClick={submitFolderDialog}>
                  {folderDialog.mode === 'create' ? 'Create' : 'Rename'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- DELETE CONFIRMATION MODAL ---- */}
      {deleteConfirm && (
        <div className="confirm-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="confirm-dialog glass" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h3>Delete Document?</h3>
            <p>Are you sure you want to delete <strong>"{deleteConfirm.docTitle}"</strong>? This action cannot be undone.</p>
            <div className="confirm-actions">
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => deleteDocFromCloud(deleteConfirm.docId)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- TOAST NOTIFICATION ---- */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'success' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
            )}
          </span>
          <span className="toast-message">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
