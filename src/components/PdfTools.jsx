import { useState, useRef, useCallback } from 'react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { marked } from 'marked';
import { Document, Paragraph, TextRun, PageBreak, Packer } from 'docx';
import JSZip from 'jszip';
import './PdfTools.css';

/* ------------------------------------------------------------------
   Configure pdf.js worker
------------------------------------------------------------------- */
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

/* ------------------------------------------------------------------
   Tool definitions
------------------------------------------------------------------- */
const TOOLS = [
  { id: 'compress', title: 'Compress PDF', desc: 'Reduce file size while maintaining quality.', icon: '🗜️', category: 'modify', accepts: '.pdf', multiple: false },
  { id: 'merge',    title: 'Merge PDF',    desc: 'Combine multiple PDFs in any order.',         icon: '➕', category: 'modify', accepts: '.pdf', multiple: true },
  { id: 'remove',   title: 'Remove Pages', desc: 'Delete unwanted pages from a PDF.',           icon: '🗑️', category: 'modify', accepts: '.pdf', multiple: false },
  { id: 'split',    title: 'Split / Extract', desc: 'Extract pages or split each into a file.', icon: '✂️', category: 'modify', accepts: '.pdf', multiple: false },
  { id: 'organize', title: 'Organize Pages', desc: 'Reorder pages via drag & drop.',            icon: '🔄', category: 'modify', accepts: '.pdf', multiple: false },

  { id: 'md-pdf',   title: 'Markdown → PDF', desc: 'Write Markdown and save as a styled PDF.', icon: '📝', category: 'to-pdf',   accepts: null,    multiple: false },
  { id: 'word-pdf', title: 'Word → PDF',      desc: 'Convert .docx files to PDF.',              icon: '📄', category: 'to-pdf',   accepts: '.docx', multiple: false },
  { id: 'img-pdf',  title: 'JPG → PDF',       desc: 'Convert images (JPG/PNG/WEBP) to PDF.',   icon: '🖼️', category: 'to-pdf',   accepts: 'image/*', multiple: true },

  { id: 'pdf-word',   title: 'PDF → Word',   desc: 'Extract text into an editable .docx.',     icon: '📝', category: 'from-pdf', accepts: '.pdf', multiple: false },
  { id: 'pdf-images', title: 'PDF → Images', desc: 'Export each page as a JPG image.',         icon: '🖼️', category: 'from-pdf', accepts: '.pdf', multiple: false },
];

const CATEGORIES = [
  { key: 'modify',   label: '🔧 Modify PDF' },
  { key: 'to-pdf',   label: '📥 Convert to PDF' },
  { key: 'from-pdf', label: '📤 Convert from PDF' },
];

/* ------------------------------------------------------------------
   Main component
------------------------------------------------------------------- */
export default function PdfTools() {
  const [activeTool, setActiveTool] = useState(null);
  const [files, setFiles] = useState([]);
  const [thumbnails, setThumbnails] = useState([]);
  const [selectedPages, setSelectedPages] = useState(new Set());
  const [status, setStatus] = useState({ msg: '', type: 'info' });
  const [loading, setLoading] = useState(false);
  const [mdText, setMdText] = useState('# Hello PDF\n\nStart typing Markdown here...');
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef(null);

  /* ----------------------------------------------------------------
     Helpers
  ---------------------------------------------------------------- */
  const setMsg = (msg, type = 'info') => setStatus({ msg, type });

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const resetWorkspace = () => {
    setFiles([]);
    setThumbnails([]);
    setSelectedPages(new Set());
    setStatus({ msg: '', type: 'info' });
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openTool = (tool) => {
    resetWorkspace();
    setActiveTool(tool);
    setMdText('# Hello PDF\n\nStart typing Markdown here...');
  };

  const goBack = () => {
    resetWorkspace();
    setActiveTool(null);
  };

  /* ----------------------------------------------------------------
     File handling
  ---------------------------------------------------------------- */
  const handleFiles = useCallback(async (fileList) => {
    if (!fileList.length || !activeTool) return;
    const newFiles = activeTool.multiple
      ? [...files, ...Array.from(fileList)]
      : [fileList[0]];
    setFiles(newFiles);
    setMsg('Processing…', 'info');

    if (['remove', 'split', 'organize'].includes(activeTool.id)) {
      await renderThumbnails(newFiles[0]);
    } else {
      setMsg('', 'info');
    }
  }, [activeTool, files]);

  const renderThumbnails = async (file) => {
    try {
      setMsg('Rendering pages…', 'info');
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const thumbs = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 0.45 });
        const canvas = document.createElement('canvas');
        canvas.height = vp.height;
        canvas.width = vp.width;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        thumbs.push({ pageNum: i, dataUrl: canvas.toDataURL() });
      }
      setThumbnails(thumbs);
      setMsg('');
    } catch (e) {
      setMsg('Error rendering PDF: ' + e.message, 'error');
    }
  };

  /* ----------------------------------------------------------------
     Execute tools
  ---------------------------------------------------------------- */
  const execute = async () => {
    if (activeTool.id !== 'md-pdf' && files.length === 0) {
      setMsg('Please upload a file first.', 'error'); return;
    }
    setLoading(true);
    setMsg('Processing…', 'info');
    try {
      switch (activeTool.id) {
        case 'compress':    await compress(); break;
        case 'merge':       await merge(); break;
        case 'remove':      await removePages(); break;
        case 'split':       await split(); break;
        case 'organize':    await organize(); break;
        case 'md-pdf':      await generatePdfFromServer(`<div style="padding:2cm;font-family:sans-serif">${marked.parse(mdText)}</div>`, 'markdown_doc'); break;
        case 'word-pdf':    await wordToPdf(); break;
        case 'img-pdf':     await imgToPdf(); break;
        case 'pdf-word':    await pdfToWord(); break;
        case 'pdf-images':  await pdfToImages(); break;
        default: break;
      }
      setMsg('Done! ✓', 'success');
    } catch (err) {
      setMsg('Error: ' + err.message, 'error');
    }
    setLoading(false);
  };

  const compress = async () => {
    const buf = await files[0].arrayBuffer();
    const src = await pdfjsLib.getDocument({ data: buf }).promise;
    const out = await PDFDocument.create();
    for (let i = 1; i <= src.numPages; i++) {
      setMsg(`Compressing page ${i} of ${src.numPages}…`, 'info');
      const page = await src.getPage(i);
      const vp = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      // Convert canvas to JPEG bytes (embedJpg requires raw bytes, not a data URL)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      const base64 = dataUrl.split(',')[1];
      const jpgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const jpg = await out.embedJpg(jpgBytes);
      const p = out.addPage([vp.width, vp.height]);
      p.drawImage(jpg, { x: 0, y: 0, width: vp.width, height: vp.height });
    }
    const bytes = await out.save();
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `compressed_${files[0].name}`);
  };

  const merge = async () => {
    const merged = await PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      setMsg(`Merging ${i + 1} of ${files.length}…`, 'info');
      const doc = await PDFDocument.load(await files[i].arrayBuffer());
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    }
    downloadBlob(new Blob([await merged.save()], { type: 'application/pdf' }), 'merged.pdf');
  };

  const removePages = async () => {
    if (selectedPages.size === 0) throw new Error('No pages selected.');
    const doc = await PDFDocument.load(await files[0].arrayBuffer());
    Array.from(selectedPages).sort((a, b) => b - a).forEach(p => doc.removePage(p - 1));
    downloadBlob(new Blob([await doc.save()], { type: 'application/pdf' }), `removed_${files[0].name}`);
  };

  const split = async () => {
    if (selectedPages.size === 0) throw new Error('No pages selected.');
    const src = await PDFDocument.load(await files[0].arrayBuffer());
    const sel = Array.from(selectedPages).sort((a, b) => a - b);
    const zip = new JSZip();
    for (const pn of sel) {
      const d = await PDFDocument.create();
      const [cp] = await d.copyPages(src, [pn - 1]);
      d.addPage(cp);
      zip.file(`page_${pn}.pdf`, await d.save());
    }
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `split_${files[0].name}.zip`);
  };

  const organize = async () => {
    const src = await PDFDocument.load(await files[0].arrayBuffer());
    const out = await PDFDocument.create();
    const order = thumbnails.map(t => t.pageNum - 1);
    const copied = await out.copyPages(src, order);
    copied.forEach(p => out.addPage(p));
    downloadBlob(new Blob([await out.save()], { type: 'application/pdf' }), `organized_${files[0].name}`);
  };

  const generatePdfFromServer = async (html, filename) => {
    try {
      setMsg('Generating PDF on server...', 'info');
      const apiUrl = import.meta.env.VITE_API_URL || 'https://arsenal-pdf-server.azurewebsites.net';
      const response = await fetch(`${apiUrl}/api/pdf/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html })
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const blob = await response.blob();
      downloadBlob(blob, filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
    } catch (err) {
      console.error(err);
      throw new Error('Failed to generate PDF on server: ' + err.message);
    }
  };

  const wordToPdf = async () => {
    const buf = await files[0].arrayBuffer();
    const res = await mammoth.convertToHtml({ arrayBuffer: buf });
    await generatePdfFromServer(`<div style="padding:2cm">${res.value}</div>`, files[0].name.replace('.docx', ''));
  };

  /** Helper: convert any image file to PNG bytes via canvas (handles WebP, etc.) */
  const imageFileToPngBytes = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          canvas.getContext('2d').drawImage(img, 0, 0);
          canvas.toBlob(blob => {
            if (!blob) { reject(new Error('Failed to convert image')); return; }
            blob.arrayBuffer().then(resolve).catch(reject);
          }, 'image/png');
        };
        img.onerror = () => reject(new Error(`Failed to load image: ${file.name}`));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
      reader.readAsDataURL(file);
    });
  };

  const imgToPdf = async () => {
    const doc = await PDFDocument.create();
    for (const file of files) {
      const buf = await file.arrayBuffer();
      let img;
      if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
        img = await doc.embedJpg(buf);
      } else if (file.type === 'image/png') {
        img = await doc.embedPng(buf);
      } else {
        // WebP and other formats: re-encode to PNG via canvas
        const pngBuf = await imageFileToPngBytes(file);
        img = await doc.embedPng(pngBuf);
      }
      const p = doc.addPage([img.width, img.height]);
      p.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
    downloadBlob(new Blob([await doc.save()], { type: 'application/pdf' }), 'images.pdf');
  };

  const pdfToWord = async () => {
    const pdf = await pdfjsLib.getDocument({ data: await files[0].arrayBuffer() }).promise;
    const paragraphs = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      setMsg(`Extracting page ${i}…`, 'info');
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      let text = '';
      let lastY = -1;
      tc.items.forEach(item => {
        if (lastY !== item.transform[5] && lastY !== -1) text += '\n';
        text += item.str;
        lastY = item.transform[5];
      });
      text.split('\n').filter(l => l.trim()).forEach(line => {
        paragraphs.push(new Paragraph({ children: [new TextRun(line)] }));
      });
      if (i < pdf.numPages) paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
    }
    const d = new Document({ sections: [{ children: paragraphs }] });
    downloadBlob(await Packer.toBlob(d), files[0].name.replace('.pdf', '') + '.docx');
  };

  const pdfToImages = async () => {
    const pdf = await pdfjsLib.getDocument({ data: await files[0].arrayBuffer() }).promise;
    const zip = new JSZip();
    for (let i = 1; i <= pdf.numPages; i++) {
      setMsg(`Rendering page ${i}…`, 'info');
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      zip.file(`page_${i}.jpg`, canvas.toDataURL('image/jpeg', 0.9).split(',')[1], { base64: true });
    }
    downloadBlob(await zip.generateAsync({ type: 'blob' }), files[0].name.replace('.pdf', '') + '_images.zip');
  };

  /* ----------------------------------------------------------------
     Page toggle for remove/split
  ---------------------------------------------------------------- */
  const togglePage = (pageNum) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      next.has(pageNum) ? next.delete(pageNum) : next.add(pageNum);
      return next;
    });
  };

  /* ----------------------------------------------------------------
     Drag reorder for organize
  ---------------------------------------------------------------- */
  const dragRef = useRef(null);
  const onDragStart = (pn) => { dragRef.current = pn; };
  const onDrop = (pn) => {
    if (dragRef.current === null || dragRef.current === pn) return;
    setThumbnails(prev => {
      const arr = [...prev];
      const fi = arr.findIndex(t => t.pageNum === dragRef.current);
      const ti = arr.findIndex(t => t.pageNum === pn);
      const [moved] = arr.splice(fi, 1);
      arr.splice(ti, 0, moved);
      return arr;
    });
    dragRef.current = null;
  };

  /* ----------------------------------------------------------------
     Render
  ---------------------------------------------------------------- */
  /* Landing */
  if (!activeTool) {
    return (
      <div className="pdf-landing">
        {CATEGORIES.map(cat => (
          <section key={cat.key} className="pdf-category">
            <h2 className="pdf-cat-title">{cat.label}</h2>
            <div className="pdf-grid">
              {TOOLS.filter(t => t.category === cat.key).map(tool => (
                <div key={tool.id} className="pdf-card glass" onClick={() => openTool(tool)}>
                  <span className="pdf-card-icon">{tool.icon}</span>
                  <div>
                    <h3 className="pdf-card-name">{tool.title}</h3>
                    <p className="pdf-card-desc">{tool.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  /* Tool workspace */
  return (
    <div className="pdf-workspace">
      {/* Toolbar */}
      <div className="pdf-toolbar glass">
        <button className="btn btn-ghost" onClick={goBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          All Tools
        </button>
        <h2 className="pdf-ws-title">{activeTool.title}</h2>
      </div>

      {/* Markdown editor for md-pdf */}
      {activeTool.id === 'md-pdf' ? (
        <div className="pdf-md-editor">
          <div className="pdf-md-panes">
            <textarea
              className="pdf-md-input glass"
              value={mdText}
              onChange={e => setMdText(e.target.value)}
              placeholder="Type Markdown here…"
              spellCheck={false}
            />
            <div
              className="pdf-md-preview glass markdown-preview"
              dangerouslySetInnerHTML={{ __html: marked.parse(mdText) }}
            />
          </div>
          <button className="btn btn-primary pdf-action-btn" onClick={execute} disabled={loading}>
            {loading ? <span className="spinner" /> : null} Save as PDF
          </button>
        </div>
      ) : (
        <>
          {/* Dropzone */}
          {files.length === 0 || activeTool.multiple ? (
            <div
              className={`pdf-dropzone glass ${dragOver ? 'dragover' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="pdf-dz-icon">📄</div>
              <h3>Drag & Drop files here</h3>
              <p>or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                accept={activeTool.accepts}
                multiple={activeTool.multiple}
                onChange={e => handleFiles(e.target.files)}
              />
            </div>
          ) : null}

          {/* File list (for merge / img-pdf) */}
          {['merge', 'img-pdf'].includes(activeTool.id) && files.length > 0 && (
            <ul className="pdf-file-list glass">
              {files.map((f, i) => (
                <li key={i} className="pdf-file-item">
                  <span>☰ {f.name}</span>
                  <button className="btn btn-ghost" onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}>✕</button>
                </li>
              ))}
            </ul>
          )}

          {/* Simple file display */}
          {!['merge', 'img-pdf', 'remove', 'split', 'organize'].includes(activeTool.id) && files.length > 0 && (
            <div className="pdf-file-list glass">
              <div className="pdf-file-item"><span>📄 {files[0].name}</span></div>
            </div>
          )}

          {/* Thumbnails for remove/split/organize */}
          {thumbnails.length > 0 && (
            <div className="pdf-thumbnails">
              {thumbnails.map((t) => (
                <div
                  key={t.pageNum}
                  className={`pdf-thumb ${selectedPages.has(t.pageNum) ? 'selected' : ''}`}
                  onClick={() => ['remove', 'split'].includes(activeTool.id) && togglePage(t.pageNum)}
                  draggable={activeTool.id === 'organize'}
                  onDragStart={() => onDragStart(t.pageNum)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => onDrop(t.pageNum)}
                >
                  <img src={t.dataUrl} alt={`Page ${t.pageNum}`} />
                  <span className="pdf-thumb-num">p.{t.pageNum}</span>
                </div>
              ))}
            </div>
          )}

          {/* Controls */}
          {activeTool.id === 'compress' && files.length > 0 && (
            <div className="pdf-control-row glass">
              <label>Compression Level</label>
              <select id="compress-level" className="pdf-select">
                <option value="high">High Quality (less compression)</option>
                <option value="medium" defaultValue>Medium Quality</option>
                <option value="low">Low Quality (more compression)</option>
              </select>
            </div>
          )}
          {activeTool.id === 'split' && files.length > 0 && (
            <div className="pdf-control-row glass">
              <label>Mode</label>
              <select id="split-mode" className="pdf-select">
                <option value="extract">Extract selected pages into one PDF</option>
                <option value="split">Split selected pages into separate files</option>
              </select>
            </div>
          )}

          {/* Status */}
          {status.msg && (
            <div className={`pdf-status pdf-status-${status.type}`}>{status.msg}</div>
          )}

          {/* Action button */}
          {(files.length > 0 || thumbnails.length > 0) && (
            <button className="btn btn-primary pdf-action-btn" onClick={execute} disabled={loading}>
              {loading ? <><span className="spinner" /> Processing…</> : activeTool.title}
            </button>
          )}
        </>
      )}
    </div>
  );
}
