import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { marked } from 'marked';

/* ------------------------------------------------------------------
   Unicode & LaTeX Math Normalizer
------------------------------------------------------------------- */
const LATEX_SYMBOLS = {
  '\\alpha': 'α',
  '\\beta': 'β',
  '\\gamma': 'γ',
  '\\delta': 'δ',
  '\\epsilon': 'ε',
  '\\varepsilon': 'ε',
  '\\zeta': 'ζ',
  '\\eta': 'η',
  '\\theta': 'θ',
  '\\iota': 'ι',
  '\\kappa': 'κ',
  '\\lambda': 'λ',
  '\\mu': 'μ',
  '\\nu': 'ν',
  '\\xi': 'ξ',
  '\\pi': 'π',
  '\\rho': 'ρ',
  '\\sigma': 'σ',
  '\\tau': 'τ',
  '\\phi': 'φ',
  '\\varphi': 'φ',
  '\\chi': 'χ',
  '\\psi': 'psi',
  '\\omega': 'ω',
  '\\Gamma': 'Γ',
  '\\Delta': 'Δ',
  '\\Theta': 'Θ',
  '\\Lambda': 'Λ',
  '\\Xi': 'Ξ',
  '\\Pi': 'Π',
  '\\Sigma': 'Σ',
  '\\Phi': 'Φ',
  '\\Psi': 'Ψ',
  '\\Omega': 'Ω',
  '\\infty': '∞',
  '\\pm': '±',
  '\\mp': '∓',
  '\\times': '×',
  '\\div': '÷',
  '\\cdot': '·',
  '\\ast': '*',
  '\\star': '★',
  '\\leq': '≤',
  '\\le': '≤',
  '\\geq': '≥',
  '\\ge': '≥',
  '\\neq': '≠',
  '\\ne': '≠',
  '\\approx': '≈',
  '\\equiv': '≡',
  '\\sim': '~',
  '\\propto': '∝',
  '\\partial': '∂',
  '\\nabla': '∇',
  '\\forall': '∀',
  '\\exists': '∃',
  '\\in': '∈',
  '\\notin': '∉',
  '\\subset': '⊂',
  '\\subseteq': '⊆',
  '\\cup': '∪',
  '\\cap': '∩',
  '\\emptyset': '∅',
  '\\rightarrow': '→',
  '\\to': '→',
  '\\leftarrow': '←',
  '\\leftrightarrow': '↔',
  '\\Rightarrow': '⇒',
  '\\Leftarrow': '⇐',
  '\\Leftrightarrow': '⇔',
  '\\iff': '⇔',
  '\\sum': '∑',
  '\\prod': '∏',
  '\\int': '∫',
  '\\oint': '∮',
  '\\therefore': '∴',
  '\\because': '∵',
  '\\degree': '°',
  '\\circ': '°',
};

const SUPERSCRIPTS = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'n': 'ⁿ', 'i': 'ⁱ',
};

const SUBSCRIPTS = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'o': 'ₒ', 'x': 'ₓ', 'i': 'ᵢ',
  'j': 'ⱼ', 'k': 'ₖ', 'n': 'ₙ', 'm': 'ₘ',
};

/**
 * Converts a LaTeX math string into clean, human-readable mathematical notation.
 */
export function formatLatexMath(latex) {
  if (!latex) return '';
  let s = latex.trim();

  // Common environments
  s = s.replace(/\\left\s*([([{|])/g, '$1').replace(/\\right\s*([)\]}|])/g, '$1');
  s = s.replace(/\\text\{([^{}]*)\}/g, '$1');
  s = s.replace(/\\mathrm\{([^{}]*)\}/g, '$1');
  s = s.replace(/\\mathbf\{([^{}]*)\}/g, '$1');
  s = s.replace(/\\mathit\{([^{}]*)\}/g, '$1');
  s = s.replace(/\\mathcal\{([^{}]*)\}/g, '$1');
  s = s.replace(/\\mathbb\{([^{}]*)\}/g, '$1');
  s = s.replace(/\\boxed\{([^{}]*)\}/g, '[$1]');
  s = s.replace(/\\fbox\{([^{}]*)\}/g, '[$1]');

  // Fractions: \frac{a}{b} -> (a)/(b) or a/b
  for (let pass = 0; pass < 3; pass++) {
    s = s.replace(/\\(?:d|t)?frac\{([^{}]+)\}\{([^{}]+)\}/g, (_, num, den) => {
      const n = num.trim();
      const d = den.trim();
      const nWrap = n.length > 2 && /[+\-\s]/.test(n) ? `(${n})` : n;
      const dWrap = d.length > 2 && /[+\-\s]/.test(d) ? `(${d})` : d;
      return `${nWrap}/${dWrap}`;
    });
  }

  // Roots: \sqrt[n]{x} and \sqrt{x}
  s = s.replace(/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/g, '$1√($2)');
  s = s.replace(/\\sqrt\{([^{}]+)\}/g, (_, inner) =>
    inner.length === 1 ? `√${inner}` : `√(${inner})`
  );

  // Replace known LaTeX symbol commands (longest first)
  const keys = Object.keys(LATEX_SYMBOLS).sort((a, b) => b.length - a.length);
  for (const cmd of keys) {
    const escaped = cmd.replace(/\\/g, '\\\\');
    s = s.replace(new RegExp(escaped + '(?![a-zA-Z])', 'g'), LATEX_SYMBOLS[cmd]);
  }

  // Superscripts: ^{...} or ^x
  s = s.replace(/\^\{([^{}]+)\}/g, (_, exp) => {
    const mapped = exp.split('').map(c => SUPERSCRIPTS[c] || null);
    return mapped.every(Boolean) ? mapped.join('') : `^(${exp})`;
  });
  s = s.replace(/\^([0-9+\-ni])/g, (_, c) => SUPERSCRIPTS[c] || `^${c}`);

  // Subscripts: _{...} or _x
  s = s.replace(/_\{([^{}]+)\}/g, (_, sub) => {
    const mapped = sub.split('').map(c => SUBSCRIPTS[c] || null);
    return mapped.every(Boolean) ? mapped.join('') : `_${sub}`;
  });
  s = s.replace(/_([0-9+\-aeoxijknm])/g, (_, c) => SUBSCRIPTS[c] || `_${c}`);

  // Clean up spacing commands and leftover braces
  s = s.replace(/\\(?:,|;|:|!|quad|qquad)\b/g, ' ');
  s = s.replace(/[{}]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Normalizes invisible characters and decodes basic HTML entities.
 */
function normalizeText(str) {
  if (!str) return '';
  return str
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Checks if a string can be directly encoded by a pdf-lib WinAnsi StandardFont.
 */
function canEncodeWinAnsi(font, text) {
  try {
    font.encodeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Renders a non-WinAnsi Unicode token (such as math symbols, Greek letters, arrows, or emojis)
 * onto a high-DPI 4x transparent PNG canvas and embeds it into the PDFDocument (with caching).
 */
async function getOrCreateUnicodeGlyphImage(pdfDoc, cache, text, {
  fontFamilyCss,
  fontSize,
  bold,
  italic,
  colorCss,
}) {
  const cacheKey = `${text}|${fontFamilyCss}|${fontSize}|${bold ? 'B' : ''}${italic ? 'I' : ''}|${colorCss}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const scale = 4; // 4x Retina DPI for razor-sharp inline glyphs
  const fontSpec = `${italic ? 'italic ' : ''}${bold ? '700 ' : '400 '}${fontSize * scale}px ${fontFamilyCss}`;

  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d');
  mCtx.font = fontSpec;
  const metrics = mCtx.measureText(text);

  const rawWidth = Math.max(4, Math.ceil(metrics.width + 4 * scale));
  const rawHeight = Math.max(4, Math.ceil(fontSize * scale * 1.45));

  const canvas = document.createElement('canvas');
  canvas.width = rawWidth;
  canvas.height = rawHeight;
  const ctx = canvas.getContext('2d');
  ctx.font = fontSpec;
  ctx.fillStyle = colorCss;
  ctx.textBaseline = 'alphabetic';
  const baselineY = Math.round(fontSize * scale * 1.05);
  ctx.fillText(text, 1 * scale, baselineY);

  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  const pngBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const pngImage = await pdfDoc.embedPng(pngBytes);

  const glyphInfo = {
    image: pngImage,
    widthPt: metrics.width / scale,
    drawWidthPt: rawWidth / scale,
    drawHeightPt: rawHeight / scale,
    baselineOffsetPt: (rawHeight - baselineY) / scale,
  };

  cache.set(cacheKey, glyphInfo);
  return glyphInfo;
}

/* ------------------------------------------------------------------
   Inline Token Flattener (Supports bold, italic, code, links, strikethrough, inline math)
------------------------------------------------------------------- */
function splitInlineMathSegments(rawText) {
  if (!rawText) return [{ text: '', isMath: false }];
  // Match $...$ or \(...\)
  const regex = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\))/g;
  const segments = [];
  let lastIndex = 0;
  let m;

  while ((m = regex.exec(rawText)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ text: rawText.slice(lastIndex, m.index), isMath: false });
    }
    const token = m[0];
    const inner = token.startsWith('$$')
      ? token.slice(2, -2)
      : token.startsWith('\\(')
      ? token.slice(2, -2)
      : token.slice(1, -1);
    segments.push({ text: formatLatexMath(inner), isMath: true });
    lastIndex = m.index + token.length;
  }

  if (lastIndex < rawText.length) {
    segments.push({ text: rawText.slice(lastIndex), isMath: false });
  }
  return segments;
}

function flattenInlineTokens(tokens, inherited = {}) {
  const spans = [];
  if (!tokens || !tokens.length) return spans;

  for (const tok of tokens) {
    if (tok.type === 'strong') {
      spans.push(...flattenInlineTokens(tok.tokens || [{ type: 'text', text: tok.text }], { ...inherited, bold: true }));
    } else if (tok.type === 'em') {
      spans.push(...flattenInlineTokens(tok.tokens || [{ type: 'text', text: tok.text }], { ...inherited, italic: true }));
    } else if (tok.type === 'del') {
      spans.push(...flattenInlineTokens(tok.tokens || [{ type: 'text', text: tok.text }], { ...inherited, strike: true }));
    } else if (tok.type === 'codespan') {
      spans.push({
        text: normalizeText(tok.text),
        code: true,
        bold: inherited.bold || false,
        italic: false,
        link: inherited.link || null,
        strike: inherited.strike || false,
      });
    } else if (tok.type === 'link') {
      spans.push(
        ...flattenInlineTokens(tok.tokens || [{ type: 'text', text: tok.text }], {
          ...inherited,
          link: tok.href || true,
        })
      );
    } else if (tok.type === 'br') {
      spans.push({ text: '\n', br: true });
    } else if (tok.tokens && tok.tokens.length > 0 && tok.type !== 'text') {
      spans.push(...flattenInlineTokens(tok.tokens, inherited));
    } else {
      const raw = normalizeText(tok.text || tok.raw || '');
      const mathParts = splitInlineMathSegments(raw);
      for (const part of mathParts) {
        if (!part.text) continue;
        spans.push({
          text: part.text,
          bold: inherited.bold || false,
          italic: inherited.italic || part.isMath || false,
          code: inherited.code || false,
          link: inherited.link || null,
          strike: inherited.strike || false,
          isMath: part.isMath || false,
        });
      }
    }
  }
  return spans;
}

/* ------------------------------------------------------------------
   Theme Palettes
------------------------------------------------------------------- */
const THEME_PALETTES = {
  indigo: {
    primary: rgb(0.31, 0.27, 0.9),
    primaryCss: '#4f46e5',
    primaryLight: rgb(0.95, 0.95, 1.0),
    border: rgb(0.84, 0.87, 0.92),
    codeBg: rgb(0.95, 0.96, 0.98),
    codeHeaderBg: rgb(0.9, 0.92, 0.96),
    textMain: rgb(0.06, 0.09, 0.16),
    textMainCss: '#0f172a',
    textMuted: rgb(0.39, 0.45, 0.55),
    textMutedCss: '#64748b',
    codeText: rgb(0.49, 0.23, 0.93),
    codeTextCss: '#7c3aed',
  },
  emerald: {
    primary: rgb(0.02, 0.59, 0.41),
    primaryCss: '#059669',
    primaryLight: rgb(0.93, 0.99, 0.96),
    border: rgb(0.84, 0.89, 0.86),
    codeBg: rgb(0.95, 0.97, 0.96),
    codeHeaderBg: rgb(0.89, 0.94, 0.91),
    textMain: rgb(0.06, 0.09, 0.16),
    textMainCss: '#0f172a',
    textMuted: rgb(0.39, 0.45, 0.55),
    textMutedCss: '#64748b',
    codeText: rgb(0.02, 0.47, 0.34),
    codeTextCss: '#047857',
  },
  slate: {
    primary: rgb(0.12, 0.16, 0.23),
    primaryCss: '#1e293b',
    primaryLight: rgb(0.96, 0.97, 0.98),
    border: rgb(0.82, 0.85, 0.89),
    codeBg: rgb(0.96, 0.97, 0.98),
    codeHeaderBg: rgb(0.91, 0.93, 0.95),
    textMain: rgb(0.06, 0.09, 0.16),
    textMainCss: '#0f172a',
    textMuted: rgb(0.39, 0.45, 0.55),
    textMutedCss: '#64748b',
    codeText: rgb(0.15, 0.2, 0.29),
    codeTextCss: '#1e293b',
  },
  crimson: {
    primary: rgb(0.86, 0.15, 0.27),
    primaryCss: '#e11d48',
    primaryLight: rgb(1.0, 0.95, 0.96),
    border: rgb(0.9, 0.84, 0.86),
    codeBg: rgb(0.97, 0.95, 0.96),
    codeHeaderBg: rgb(0.94, 0.9, 0.91),
    textMain: rgb(0.06, 0.09, 0.16),
    textMainCss: '#0f172a',
    textMuted: rgb(0.39, 0.45, 0.55),
    textMutedCss: '#64748b',
    codeText: rgb(0.75, 0.1, 0.24),
    codeTextCss: '#be123c',
  },
};

/* ------------------------------------------------------------------
   Main Native Vector Markdown-to-PDF Compiler
------------------------------------------------------------------- */
export async function compileMarkdownToVectorPdf(markdownText, options = {}) {
  const {
    title = 'Document',
    pageSize = 'a4', // 'a4' | 'letter'
    orientation = 'portrait', // 'portrait' | 'landscape'
    typography = 'modern', // 'modern' | 'academic' | 'mono'
    fontSize = 11, // base body size in pt (10 | 11 | 12)
    marginPt = 48, // 36 (Narrow) | 48 (Standard) | 64 (Wide)
    accentColor = 'indigo', // 'indigo' | 'emerald' | 'slate' | 'crimson'
    showHeader = true,
    showPageNumbers = true,
  } = options;

  const palette = THEME_PALETTES[accentColor] || THEME_PALETTES.indigo;
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(title);
  pdfDoc.setCreator('Arsenal PDF Studio — Native Vector Typesetter');
  pdfDoc.setProducer('Arsenal PDF Studio');

  // Embed font suite
  let fontRegular, fontBold, fontItalic, fontBoldItalic, fontFamilyCss;
  if (typography === 'academic') {
    fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    fontItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
    fontBoldItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);
    fontFamilyCss = "'Georgia', 'Times New Roman', serif";
  } else if (typography === 'mono') {
    fontRegular = await pdfDoc.embedFont(StandardFonts.Courier);
    fontBold = await pdfDoc.embedFont(StandardFonts.CourierBold);
    fontItalic = await pdfDoc.embedFont(StandardFonts.CourierOblique);
    fontBoldItalic = await pdfDoc.embedFont(StandardFonts.CourierBoldOblique);
    fontFamilyCss = "'JetBrains Mono', 'Courier New', monospace";
  } else {
    fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    fontBoldItalic = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);
    fontFamilyCss = "'Inter', system-ui, -apple-system, sans-serif";
  }

  const fontCode = await pdfDoc.embedFont(StandardFonts.Courier);
  const fontCodeBold = await pdfDoc.embedFont(StandardFonts.CourierBold);
  const glyphCache = new Map();

  // Page dimensions
  const baseW = pageSize === 'letter' ? 612 : 595.28;
  const baseH = pageSize === 'letter' ? 792 : 841.89;
  const pageW = orientation === 'landscape' ? baseH : baseW;
  const pageH = orientation === 'landscape' ? baseW : baseH;

  const topMargin = showHeader ? Math.max(marginPt, 52) : marginPt;
  const bottomMargin = showPageNumbers ? Math.max(marginPt, 48) : marginPt;
  const leftMargin = marginPt;
  const rightMargin = marginPt;
  const contentWidth = pageW - leftMargin - rightMargin;

  let currentPage = null;
  let cursorY = 0;

  const addNewPage = () => {
    currentPage = pdfDoc.addPage([pageW, pageH]);
    cursorY = pageH - topMargin;
    return currentPage;
  };

  const ensureSpace = (neededHeight) => {
    if (!currentPage || cursorY - neededHeight < bottomMargin) {
      addNewPage();
      return true;
    }
    return false;
  };

  addNewPage();

  const pickFont = (span) => {
    if (span.code) return span.bold ? fontCodeBold : fontCode;
    if (span.bold && span.italic) return fontBoldItalic;
    if (span.bold) return fontBold;
    if (span.italic) return fontItalic;
    return fontRegular;
  };

  /**
   * Measures a single word/segment and prepares either a direct vector text draw
   * or a cached high-DPI inline glyph image if the token contains non-WinAnsi characters.
   */
  const measureWordItem = async (text, span, fSize, colorOverride = null, colorCssOverride = null) => {
    const font = pickFont(span);
    const activeSize = span.code ? fSize * 0.9 : fSize;
    const color = colorOverride || (span.code ? palette.codeText : span.link ? palette.primary : palette.textMain);
    const colorCss = colorCssOverride || (span.code ? palette.codeTextCss : span.link ? palette.primaryCss : palette.textMainCss);

    if (canEncodeWinAnsi(font, text)) {
      const width = font.widthOfTextAtSize(text, activeSize);
      return {
        isVector: true,
        text,
        font,
        fontSize: activeSize,
        width: span.code ? width + 6 : width,
        rawTextWidth: width,
        color,
        span,
      };
    }

    // Fallback to high-DPI inline Unicode glyph canvas for non-WinAnsi symbols
    const glyph = await getOrCreateUnicodeGlyphImage(pdfDoc, glyphCache, text, {
      fontFamilyCss: span.code ? "'Courier New', monospace" : fontFamilyCss,
      fontSize: activeSize,
      bold: span.bold,
      italic: span.italic,
      colorCss,
    });

    return {
      isVector: false,
      text,
      glyph,
      fontSize: activeSize,
      width: span.code ? glyph.widthPt + 6 : glyph.widthPt,
      rawTextWidth: glyph.widthPt,
      color,
      span,
    };
  };

  /**
   * Word-wraps an array of inline spans into wrapped lines of positioned items.
   */
  const layoutInlineSpans = async (spans, maxWidth, fSize, colorOverride = null, colorCssOverride = null) => {
    const lines = [];
    let currentLine = [];
    let currentWidth = 0;

    for (const span of spans) {
      if (span.br) {
        lines.push({ items: currentLine, width: currentWidth });
        currentLine = [];
        currentWidth = 0;
        continue;
      }

      // Split into words while keeping whitespace tokens attached or measurable
      const parts = span.text.split(/(\s+)/);
      for (const part of parts) {
        if (!part) continue;
        const isWhitespace = /^\s+$/.test(part);
        if (isWhitespace) {
          if (currentLine.length === 0) continue; // skip leading space at line start
          const spaceFont = pickFont(span);
          const sw = spaceFont.widthOfTextAtSize(' ', fSize);
          currentLine.push({ isSpace: true, width: sw, span });
          currentWidth += sw;
          continue;
        }

        const item = await measureWordItem(part, span, fSize, colorOverride, colorCssOverride);

        // If a single long word exceeds maxWidth, still place it on its own line
        if (currentLine.length > 0 && currentWidth + item.width > maxWidth) {
          lines.push({ items: currentLine, width: currentWidth });
          currentLine = [item];
          currentWidth = item.width;
        } else {
          currentLine.push(item);
          currentWidth += item.width;
        }
      }
    }

    if (currentLine.length > 0) {
      lines.push({ items: currentLine, width: currentWidth });
    }
    return lines;
  };

  /**
   * Draws a single wrapped line onto `currentPage` at `(startX, baselineY)`.
   */
  const drawWrappedLine = (line, startX, baselineY, fSize, align = 'left', availWidth = contentWidth) => {
    let x = startX;
    if (align === 'center') {
      x = startX + Math.max(0, (availWidth - line.width) / 2);
    } else if (align === 'right') {
      x = startX + Math.max(0, availWidth - line.width);
    }

    for (const item of line.items) {
      if (item.isSpace) {
        x += item.width;
        continue;
      }

      let drawX = x;
      // Draw pill background for inline code
      if (item.span?.code) {
        currentPage.drawRectangle({
          x: drawX,
          y: baselineY - fSize * 0.24,
          width: item.width,
          height: fSize * 1.15,
          color: palette.codeBg,
          borderColor: palette.border,
          borderWidth: 0.5,
        });
        drawX += 3;
      }

      if (item.isVector) {
        currentPage.drawText(item.text, {
          x: drawX,
          y: baselineY,
          size: item.fontSize,
          font: item.font,
          color: item.color,
        });
      } else if (item.glyph) {
        currentPage.drawImage(item.glyph.image, {
          x: drawX,
          y: baselineY - item.glyph.baselineOffsetPt,
          width: item.glyph.drawWidthPt,
          height: item.glyph.drawHeightPt,
        });
      }

      // Draw underline for links
      if (item.span?.link) {
        currentPage.drawLine({
          start: { x: drawX, y: baselineY - 1.5 },
          end: { x: drawX + item.rawTextWidth, y: baselineY - 1.5 },
          thickness: 0.7,
          color: palette.primary,
        });
      }

      // Draw strikethrough line
      if (item.span?.strike) {
        currentPage.drawLine({
          start: { x: drawX, y: baselineY + item.fontSize * 0.3 },
          end: { x: drawX + item.rawTextWidth, y: baselineY + item.fontSize * 0.3 },
          thickness: 0.8,
          color: item.color,
        });
      }

      x += item.width;
    }
  };

  /* ----------------------------------------------------------------
     Pre-process display math blocks $$...$$ or \[...\] into code/math blocks
  ---------------------------------------------------------------- */
  const preprocessedMd = (markdownText || '')
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n\`\`\`math\n${math.trim()}\n\`\`\`\n`)
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => `\n\`\`\`math\n${math.trim()}\n\`\`\`\n`);

  const tokens = marked.lexer(preprocessedMd);

  /* ----------------------------------------------------------------
     AST Token Walk & Vector Typesetting
  ---------------------------------------------------------------- */
  const renderBlockTokens = async (blockTokens, indentX = 0, widthLimit = contentWidth) => {
    for (const token of blockTokens) {
      if (token.type === 'space') {
        cursorY -= fontSize * 0.35;
        continue;
      }

      /* 1. HEADINGS */
      if (token.type === 'heading') {
        const scales = { 1: 1.95, 2: 1.5, 3: 1.25, 4: 1.1, 5: 1.0, 6: 0.92 };
        const hSize = Math.round(fontSize * (scales[token.depth] || 1.1));
        const lineHeight = hSize * 1.32;
        const topGap = token.depth === 1 ? fontSize * 1.2 : fontSize * 0.95;
        const bottomGap = token.depth <= 2 ? fontSize * 0.65 : fontSize * 0.4;

        const spans = flattenInlineTokens(token.tokens || [{ type: 'text', text: token.text }], {
          bold: true,
        });
        const lines = await layoutInlineSpans(
          spans,
          widthLimit,
          hSize,
          token.depth === 6 ? palette.textMuted : palette.textMain,
          token.depth === 6 ? palette.textMutedCss : palette.textMainCss
        );

        const totalHeadingHeight = lines.length * lineHeight + topGap + bottomGap + 28; // +28pt orphan guard
        ensureSpace(totalHeadingHeight);

        if (cursorY < pageH - topMargin - 5) {
          cursorY -= topGap;
        }

        for (const line of lines) {
          cursorY -= hSize;
          drawWrappedLine(line, leftMargin + indentX, cursorY, hSize);
          cursorY -= lineHeight - hSize;
        }

        if (token.depth === 1) {
          cursorY -= 5;
          currentPage.drawLine({
            start: { x: leftMargin + indentX, y: cursorY },
            end: { x: leftMargin + indentX + widthLimit, y: cursorY },
            thickness: 1.5,
            color: palette.primary,
          });
          cursorY -= 4;
        } else if (token.depth === 2) {
          cursorY -= 4;
          currentPage.drawLine({
            start: { x: leftMargin + indentX, y: cursorY },
            end: { x: leftMargin + indentX + widthLimit, y: cursorY },
            thickness: 0.75,
            color: palette.border,
          });
          cursorY -= 3;
        }

        cursorY -= bottomGap;
        continue;
      }

      /* 2. PARAGRAPHS */
      if (token.type === 'paragraph' || token.type === 'text') {
        const spans = flattenInlineTokens(token.tokens || [{ type: 'text', text: token.text }]);
        const lines = await layoutInlineSpans(spans, widthLimit, fontSize);
        const lineHeight = fontSize * 1.52;

        for (const line of lines) {
          ensureSpace(lineHeight);
          cursorY -= fontSize;
          drawWrappedLine(line, leftMargin + indentX, cursorY, fontSize);
          cursorY -= lineHeight - fontSize;
        }
        cursorY -= fontSize * 0.55;
        continue;
      }

      /* 3. FENCED CODE BLOCKS & DISPLAY MATH BLOCKS */
      if (token.type === 'code') {
        const isMathBlock = (token.lang || '').toLowerCase() === 'math';
        if (isMathBlock) {
          const formattedMath = formatLatexMath(token.text);
          const mathSize = fontSize * 1.18;
          const spans = [{ text: formattedMath, italic: true, bold: false }];
          const lines = await layoutInlineSpans(spans, widthLimit - 32, mathSize, palette.primary, palette.primaryCss);
          const lineH = mathSize * 1.5;
          const boxH = lines.length * lineH + 18;

          ensureSpace(boxH + 10);
          cursorY -= 4;

          currentPage.drawRectangle({
            x: leftMargin + indentX,
            y: cursorY - boxH,
            width: widthLimit,
            height: boxH,
            color: palette.primaryLight,
            borderColor: palette.border,
            borderWidth: 0.75,
          });

          let mathY = cursorY - 9;
          for (const line of lines) {
            mathY -= mathSize;
            drawWrappedLine(line, leftMargin + indentX + 16, mathY, mathSize, 'center', widthLimit - 32);
            mathY -= lineH - mathSize;
          }

          cursorY -= boxH + fontSize * 0.65;
          continue;
        }

        const codeSize = Math.max(8.5, fontSize * 0.86);
        const codeLineH = codeSize * 1.45;
        const padX = 12;
        const padY = 10;
        const maxCodeW = widthLimit - padX * 2;
        const rawLines = normalizeText(token.text || '').split('\n');

        // Wrap long code lines so nothing overflows horizontally
        const wrappedCodeLines = [];
        for (const rLine of rawLines) {
          if (!rLine) {
            wrappedCodeLines.push('');
            continue;
          }
          let rem = rLine;
          while (rem.length > 0) {
            let fitLen = rem.length;
            while (fitLen > 1 && fontCode.widthOfTextAtSize(rem.slice(0, fitLen).replace(/[^\x20-\x7E]/g, '?'), codeSize) > maxCodeW) {
              fitLen--;
            }
            wrappedCodeLines.push(rem.slice(0, fitLen));
            rem = rem.slice(fitLen);
          }
        }

        const langLabel = (token.lang || '').trim().toUpperCase();
        const headerH = langLabel ? 18 : 0;

        // Paginate code block in chunks if it spans across multiple pages
        let lineIdx = 0;
        let isFirstChunk = true;

        while (lineIdx < wrappedCodeLines.length) {
          const minNeeded = (isFirstChunk ? headerH : 0) + padY * 2 + codeLineH * Math.min(3, wrappedCodeLines.length - lineIdx);
          ensureSpace(minNeeded);

          const availH = cursorY - bottomMargin - (isFirstChunk ? headerH : 0) - padY * 2;
          const maxLinesInChunk = Math.max(1, Math.floor(availH / codeLineH));
          const chunkLines = wrappedCodeLines.slice(lineIdx, lineIdx + maxLinesInChunk);
          const chunkHeaderH = isFirstChunk ? headerH : 0;
          const boxH = chunkHeaderH + chunkLines.length * codeLineH + padY * 2;

          // Outer code container
          currentPage.drawRectangle({
            x: leftMargin + indentX,
            y: cursorY - boxH,
            width: widthLimit,
            height: boxH,
            color: palette.codeBg,
            borderColor: palette.border,
            borderWidth: 0.8,
          });

          // Left accent bar
          currentPage.drawRectangle({
            x: leftMargin + indentX,
            y: cursorY - boxH,
            width: 3,
            height: boxH,
            color: palette.primary,
          });

          // Optional language header strip
          if (chunkHeaderH > 0) {
            currentPage.drawRectangle({
              x: leftMargin + indentX + 3,
              y: cursorY - chunkHeaderH,
              width: widthLimit - 3,
              height: chunkHeaderH,
              color: palette.codeHeaderBg,
            });
            currentPage.drawText(langLabel, {
              x: leftMargin + indentX + padX,
              y: cursorY - chunkHeaderH + 5,
              size: 7.5,
              font: fontBold,
              color: palette.textMuted,
            });
          }

          let codeY = cursorY - chunkHeaderH - padY;
          for (const cLine of chunkLines) {
            codeY -= codeSize;
            if (cLine) {
              const item = await measureWordItem(cLine, { code: true }, codeSize, palette.textMain, palette.textMainCss);
              if (item.isVector) {
                currentPage.drawText(cLine, {
                  x: leftMargin + indentX + padX,
                  y: codeY,
                  size: codeSize,
                  font: fontCode,
                  color: palette.textMain,
                });
              } else if (item.glyph) {
                currentPage.drawImage(item.glyph.image, {
                  x: leftMargin + indentX + padX,
                  y: codeY - item.glyph.baselineOffsetPt,
                  width: item.glyph.drawWidthPt,
                  height: item.glyph.drawHeightPt,
                });
              }
            }
            codeY -= codeLineH - codeSize;
          }

          cursorY -= boxH + fontSize * 0.65;
          lineIdx += chunkLines.length;
          isFirstChunk = false;
        }
        continue;
      }

      /* 4. BLOCKQUOTES & GITHUB CALLOUT ALERTS */
      if (token.type === 'blockquote') {
        const rawText = normalizeText(token.text || '');
        const alertMatch = rawText.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?([\s\S]*)$/i);
        const alertType = alertMatch ? alertMatch[1].toUpperCase() : null;
        const bodyText = alertMatch ? alertMatch[2] : rawText;

        const alertColors = {
          NOTE: { bar: rgb(0.23, 0.51, 0.96), bg: rgb(0.94, 0.97, 1.0), label: 'NOTE' },
          TIP: { bar: rgb(0.06, 0.73, 0.51), bg: rgb(0.93, 0.99, 0.96), label: 'TIP' },
          IMPORTANT: { bar: rgb(0.55, 0.36, 0.96), bg: rgb(0.96, 0.95, 1.0), label: 'IMPORTANT' },
          WARNING: { bar: rgb(0.96, 0.62, 0.04), bg: rgb(1.0, 0.98, 0.92), label: 'WARNING' },
          CAUTION: { bar: rgb(0.94, 0.27, 0.27), bg: rgb(1.0, 0.95, 0.95), label: 'CAUTION' },
        };
        const style = (alertType && alertColors[alertType]) || {
          bar: palette.primary,
          bg: palette.primaryLight,
          label: null,
        };

        const innerPadX = 14;
        const innerPadY = 10;
        const innerW = widthLimit - innerPadX * 2;
        const quoteTokens = marked.lexer(bodyText);
        const quoteSpans = [];
        for (const qt of quoteTokens) {
          if (qt.tokens) {
            quoteSpans.push(...flattenInlineTokens(qt.tokens, { italic: !alertType }));
            quoteSpans.push({ br: true });
          } else if (qt.text) {
            quoteSpans.push({ text: normalizeText(qt.text), italic: !alertType });
            quoteSpans.push({ br: true });
          }
        }
        if (quoteSpans.length && quoteSpans[quoteSpans.length - 1].br) {
          quoteSpans.pop();
        }

        const lines = await layoutInlineSpans(quoteSpans, innerW, fontSize);
        const lineH = fontSize * 1.48;
        const titleH = style.label ? fontSize * 1.5 : 0;
        const boxH = titleH + lines.length * lineH + innerPadY * 2;

        ensureSpace(boxH + 8);

        currentPage.drawRectangle({
          x: leftMargin + indentX,
          y: cursorY - boxH,
          width: widthLimit,
          height: boxH,
          color: style.bg,
        });

        currentPage.drawRectangle({
          x: leftMargin + indentX,
          y: cursorY - boxH,
          width: 3.5,
          height: boxH,
          color: style.bar,
        });

        let qY = cursorY - innerPadY;
        if (style.label) {
          qY -= fontSize;
          currentPage.drawText(style.label, {
            x: leftMargin + indentX + innerPadX,
            y: qY,
            size: fontSize * 0.92,
            font: fontBold,
            color: style.bar,
          });
          qY -= titleH - fontSize;
        }

        for (const line of lines) {
          qY -= fontSize;
          drawWrappedLine(line, leftMargin + indentX + innerPadX, qY, fontSize);
          qY -= lineH - fontSize;
        }

        cursorY -= boxH + fontSize * 0.65;
        continue;
      }

      /* 5. LISTS (Ordered, Unordered & Task Checkboxes) */
      if (token.type === 'list') {
        const listIndent = 18;
        const startNum = Number(token.start) || 1;

        for (let i = 0; i < token.items.length; i++) {
          const item = token.items[i];
          const itemX = indentX + listIndent;
          const itemW = widthLimit - listIndent;

          // Separate inline content from nested sublists
          const inlineSubTokens = [];
          const nestedLists = [];
          for (const sub of item.tokens || []) {
            if (sub.type === 'list') {
              nestedLists.push(sub);
            } else if (sub.type === 'checkbox') {
              // handled via item.task & item.checked
            } else if (sub.tokens) {
              inlineSubTokens.push(...sub.tokens);
            } else {
              inlineSubTokens.push(sub);
            }
          }

          const spans = flattenInlineTokens(inlineSubTokens);
          const lines = await layoutInlineSpans(spans, itemW, fontSize);
          const lineH = fontSize * 1.48;

          for (let lIdx = 0; lIdx < lines.length; lIdx++) {
            ensureSpace(lineH);
            cursorY -= fontSize;

            // Draw bullet, number, or task checkbox on first line
            if (lIdx === 0) {
              if (item.task) {
                const boxSize = fontSize * 0.82;
                const boxX = leftMargin + indentX + 2;
                const boxY = cursorY - 0.5;
                currentPage.drawRectangle({
                  x: boxX,
                  y: boxY,
                  width: boxSize,
                  height: boxSize,
                  color: item.checked ? palette.primary : rgb(1, 1, 1),
                  borderColor: item.checked ? palette.primary : palette.textMuted,
                  borderWidth: 1,
                });
                if (item.checked) {
                  // Draw vector checkmark inside checkbox
                  currentPage.drawLine({
                    start: { x: boxX + boxSize * 0.22, y: boxY + boxSize * 0.48 },
                    end: { x: boxX + boxSize * 0.44, y: boxY + boxSize * 0.22 },
                    thickness: 1.3,
                    color: rgb(1, 1, 1),
                  });
                  currentPage.drawLine({
                    start: { x: boxX + boxSize * 0.44, y: boxY + boxSize * 0.22 },
                    end: { x: boxX + boxSize * 0.8, y: boxY + boxSize * 0.76 },
                    thickness: 1.3,
                    color: rgb(1, 1, 1),
                  });
                }
              } else if (token.ordered) {
                const numLabel = `${startNum + i}.`;
                currentPage.drawText(numLabel, {
                  x: leftMargin + indentX,
                  y: cursorY,
                  size: fontSize,
                  font: fontBold,
                  color: palette.primary,
                });
              } else {
                const depthLevel = Math.round(indentX / 18);
                const r = depthLevel === 0 ? 2.2 : 1.7;
                currentPage.drawCircle({
                  x: leftMargin + indentX + 6,
                  y: cursorY + fontSize * 0.32,
                  size: r,
                  color: depthLevel === 0 ? palette.primary : palette.textMuted,
                });
              }
            }

            drawWrappedLine(lines[lIdx], leftMargin + itemX, cursorY, fontSize);
            cursorY -= lineH - fontSize;
          }

          cursorY -= fontSize * 0.22;

          // Render any nested sub-lists recursively
          for (const nested of nestedLists) {
            await renderBlockTokens([nested], itemX, itemW);
          }
        }
        cursorY -= fontSize * 0.35;
        continue;
      }

      /* 6. TABLES */
      if (token.type === 'table') {
        const numCols = token.header.length;
        if (numCols === 0) continue;

        const tableFontSize = Math.max(8.5, fontSize * 0.9);
        const cellLineH = tableFontSize * 1.38;
        const cellPadX = 8;
        const cellPadY = 6;

        // Calculate natural column weights so wider columns get proportionally more space
        const colMaxTextLen = token.header.map(h => Math.max(4, (h.text || '').length));
        for (const row of token.rows) {
          row.forEach((cell, cIdx) => {
            if (cIdx < numCols) {
              colMaxTextLen[cIdx] = Math.max(colMaxTextLen[cIdx], Math.min(45, (cell.text || '').length));
            }
          });
        }
        const totalWeight = colMaxTextLen.reduce((a, b) => a + b, 0) || 1;
        const colWidths = colMaxTextLen.map(w => (w / totalWeight) * widthLimit);

        const drawTableRow = async (cells, isHeader, rowIndex) => {
          const cellLayouts = [];
          let maxCellLines = 1;

          for (let c = 0; c < numCols; c++) {
            const cell = cells[c] || { text: '', tokens: [] };
            const spans = flattenInlineTokens(
              cell.tokens || [{ type: 'text', text: cell.text }],
              { bold: isHeader }
            );
            const availCellW = Math.max(20, colWidths[c] - cellPadX * 2);
            const wrapped = await layoutInlineSpans(spans, availCellW, tableFontSize);
            cellLayouts.push(wrapped);
            if (wrapped.length > maxCellLines) maxCellLines = wrapped.length;
          }

          const rowH = maxCellLines * cellLineH + cellPadY * 2;
          const pageBroken = ensureSpace(rowH + 6);

          // If a data row broke onto a new page, repeat the table header row at top of new page!
          if (pageBroken && !isHeader) {
            await drawTableRow(token.header, true, -1);
          }

          const rowTopY = cursorY;
          const rowBottomY = cursorY - rowH;

          // Row background fill
          if (isHeader) {
            currentPage.drawRectangle({
              x: leftMargin + indentX,
              y: rowBottomY,
              width: widthLimit,
              height: rowH,
              color: palette.codeHeaderBg,
            });
          } else if (rowIndex % 2 === 1) {
            currentPage.drawRectangle({
              x: leftMargin + indentX,
              y: rowBottomY,
              width: widthLimit,
              height: rowH,
              color: palette.codeBg,
            });
          }

          // Draw cells & borders
          let colX = leftMargin + indentX;
          for (let c = 0; c < numCols; c++) {
            const cw = colWidths[c];
            currentPage.drawRectangle({
              x: colX,
              y: rowBottomY,
              width: cw,
              height: rowH,
              borderColor: palette.border,
              borderWidth: 0.65,
            });

            const lines = cellLayouts[c];
            const align = token.align?.[c] || 'left';
            let textY = rowTopY - cellPadY;
            for (const line of lines) {
              textY -= tableFontSize;
              drawWrappedLine(line, colX + cellPadX, textY, tableFontSize, align, cw - cellPadX * 2);
              textY -= cellLineH - tableFontSize;
            }

            colX += cw;
          }

          cursorY = rowBottomY;
        };

        cursorY -= 4;
        await drawTableRow(token.header, true, -1);
        for (let r = 0; r < token.rows.length; r++) {
          await drawTableRow(token.rows[r], false, r);
        }
        cursorY -= fontSize * 0.7;
        continue;
      }

      /* 7. HORIZONTAL RULE */
      if (token.type === 'hr') {
        ensureSpace(20);
        cursorY -= 8;
        currentPage.drawLine({
          start: { x: leftMargin + indentX, y: cursorY },
          end: { x: leftMargin + indentX + widthLimit, y: cursorY },
          thickness: 1,
          color: palette.border,
        });
        cursorY -= 12;
        continue;
      }
    }
  };

  await renderBlockTokens(tokens, 0, contentWidth);

  /* ----------------------------------------------------------------
     Stamp Running Headers & Page Numbers Across All Pages
  ---------------------------------------------------------------- */
  const allPages = pdfDoc.getPages();
  const totalPages = allPages.length;

  allPages.forEach((page, idx) => {
    const pNum = idx + 1;

    if (showHeader && title.trim()) {
      const cleanTitle = normalizeText(title.trim());
      if (canEncodeWinAnsi(fontRegular, cleanTitle)) {
        page.drawText(cleanTitle, {
          x: leftMargin,
          y: pageH - 28,
          size: 8.5,
          font: fontRegular,
          color: palette.textMuted,
        });
      }
      page.drawLine({
        start: { x: leftMargin, y: pageH - 34 },
        end: { x: pageW - rightMargin, y: pageH - 34 },
        thickness: 0.5,
        color: palette.border,
      });
    }

    if (showPageNumbers) {
      const footerLabel = `Page ${pNum} of ${totalPages}`;
      const fw = fontRegular.widthOfTextAtSize(footerLabel, 8.5);
      page.drawLine({
        start: { x: leftMargin, y: 34 },
        end: { x: pageW - rightMargin, y: 34 },
        thickness: 0.5,
        color: palette.border,
      });
      page.drawText(footerLabel, {
        x: (pageW - fw) / 2,
        y: 21,
        size: 8.5,
        font: fontRegular,
        color: palette.textMuted,
      });
    }
  });

  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  return {
    bytes: pdfBytes,
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    pageCount: totalPages,
  };
}

/**
 * Converts semantic HTML (such as Mammoth .docx output) into clean Markdown
 * so Word documents can also be compiled through the Native Vector PDF Typesetter.
 */
export function convertHtmlToMarkdown(htmlString) {
  if (!htmlString) return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue || '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    const childrenText = Array.from(node.childNodes).map(walk).join('');

    switch (tag) {
      case 'h1':
        return `\n\n# ${childrenText.trim()}\n\n`;
      case 'h2':
        return `\n\n## ${childrenText.trim()}\n\n`;
      case 'h3':
        return `\n\n### ${childrenText.trim()}\n\n`;
      case 'h4':
      case 'h5':
      case 'h6':
        return `\n\n#### ${childrenText.trim()}\n\n`;
      case 'p':
        return `\n\n${childrenText.trim()}\n\n`;
      case 'br':
        return '\n';
      case 'hr':
        return '\n\n---\n\n';
      case 'strong':
      case 'b':
        return childrenText.trim() ? `**${childrenText.trim()}**` : '';
      case 'em':
      case 'i':
        return childrenText.trim() ? `*${childrenText.trim()}*` : '';
      case 'del':
      case 's':
        return childrenText.trim() ? `~~${childrenText.trim()}~~` : '';
      case 'code':
        return node.parentElement?.tagName.toLowerCase() === 'pre'
          ? childrenText
          : `\`${childrenText.trim()}\``;
      case 'pre':
        return `\n\n\`\`\`\n${childrenText.trim()}\n\`\`\`\n\n`;
      case 'blockquote':
        return `\n\n${childrenText
          .trim()
          .split('\n')
          .map(l => `> ${l}`)
          .join('\n')}\n\n`;
      case 'a': {
        const href = node.getAttribute('href') || '';
        return href ? `[${childrenText.trim() || href}](${href})` : childrenText;
      }
      case 'ul': {
        const items = Array.from(node.children)
          .filter(c => c.tagName.toLowerCase() === 'li')
          .map(li => `- ${walk(li).trim().replace(/\n+/g, ' ')}`)
          .join('\n');
        return `\n\n${items}\n\n`;
      }
      case 'ol': {
        const items = Array.from(node.children)
          .filter(c => c.tagName.toLowerCase() === 'li')
          .map((li, i) => `${i + 1}. ${walk(li).trim().replace(/\n+/g, ' ')}`)
          .join('\n');
        return `\n\n${items}\n\n`;
      }
      case 'table': {
        const rows = Array.from(node.querySelectorAll('tr'));
        if (!rows.length) return '';
        const matrix = rows.map(tr =>
          Array.from(tr.querySelectorAll('th, td')).map(cell =>
            walk(cell).trim().replace(/\s+/g, ' ').replace(/\|/g, '\\|')
          )
        );
        const colCount = Math.max(...matrix.map(r => r.length), 1);
        const normRow = (r) =>
          Array.from({ length: colCount }, (_, i) => r[i] || ' ');
        const header = `| ${normRow(matrix[0]).join(' | ')} |`;
        const divider = `| ${Array.from({ length: colCount }, () => '---').join(' | ')} |`;
        const body = matrix
          .slice(1)
          .map(r => `| ${normRow(r).join(' | ')} |`)
          .join('\n');
        return `\n\n${header}\n${divider}${body ? '\n' + body : ''}\n\n`;
      }
      default:
        return childrenText;
    }
  };

  return walk(doc.body)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

