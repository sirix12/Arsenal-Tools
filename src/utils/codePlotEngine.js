/**
 * MATLAB & Matplotlib Vectorized Plot Interpreter (AST-Based)
 * Parses and executes MATLAB (.m) and Python (Matplotlib / NumPy) plotting scripts
 * with full vectorized arithmetic, anonymous functions (@(t) ...), 1-based MATLAB
 * indexing with `end`, convolution (`conv`), FFT, multi-series `plot()`, subplots,
 * logarithmic/polar axes, histograms, contours, and 3D surfaces.
 */

// ============================================================================
// 1. Language Detection
// ============================================================================

export function detectCodeLanguage(code) {
  if (!code || typeof code !== 'string') return 'matlab';
  const text = code.trim();

  const pythonIndicators = [
    /\bimport\s+matplotlib\b/i,
    /\bimport\s+numpy\b/i,
    /\bfrom\s+matplotlib\b/i,
    /\bplt\./,
    /\bnp\./,
    /\bdef\s+\w+\s*\(/,
    /\bfig\s*,\s*ax/,
    /\bplt\.subplots\b/,
    /\bfill_between\b/,
    /\bax\.\w+\(/,
  ];

  const matlabIndicators = [
    /\bhold\s+(on|off)\b/i,
    /\bgrid\s+(on|off|minor)\b/i,
    /\bclc\b/i,
    /\bclose\s+all\b/i,
    /\bdisp\s*\(/i,
    /\bfprintf\s*\(/i,
    /\bsgtitle\s*\(/i,
    /\bpolarplot\s*\(/i,
    /\byline\s*\(/i,
    /\bxline\s*\(/i,
    /@\s*\([a-zA-Z0-9_,\s]+\)/,
    /\.\^|\.\*|\.\//,
  ];

  let pyScore = 0;
  let matScore = 0;

  for (const pat of pythonIndicators) {
    if (pat.test(text)) pyScore += 3;
  }
  for (const pat of matlabIndicators) {
    if (pat.test(text)) matScore += 3;
  }

  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) pyScore += 1;
    if (trimmed.startsWith('%')) matScore += 1;
  }

  return pyScore > matScore ? 'python' : 'matlab';
}

// ============================================================================
// 2. Vectorized Math & Signal Processing Library
// ============================================================================

export class VectorizedMath {
  static isArray(v) {
    return Array.isArray(v);
  }

  static is2D(v) {
    return Array.isArray(v) && v.length > 0 && Array.isArray(v[0]);
  }

  static toNumber(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  static scalarOf(v) {
    if (Array.isArray(v)) {
      if (v.length === 0) return 0;
      return this.scalarOf(v[0]);
    }
    return this.toNumber(v);
  }

  static linspace(start, stop, num = 100) {
    const a = this.scalarOf(start);
    const b = this.scalarOf(stop);
    const n = Math.max(2, Math.min(100000, Math.floor(this.scalarOf(num ?? 100))));
    const step = (b - a) / (n - 1);
    const res = new Array(n);
    for (let i = 0; i < n; i++) {
      res[i] = a + i * step;
    }
    res[n - 1] = b;
    return res;
  }

  static logspace(start, stop, num = 50) {
    const lin = this.linspace(start, stop, num);
    return lin.map((v) => Math.pow(10, v));
  }

  static colonRange(start, stepOrEnd, endVal) {
    const a = this.scalarOf(start);
    let step = 1;
    let b = this.scalarOf(stepOrEnd);
    if (endVal !== undefined) {
      step = this.scalarOf(stepOrEnd);
      b = this.scalarOf(endVal);
    }
    if (step === 0 || !Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(step)) {
      return [a];
    }
    const rawN = (b - a) / step;
    if (rawN < -1e-12) return [];
    const n = Math.min(100000, Math.floor(rawN + 1e-9) + 1);
    const res = new Array(n);
    for (let i = 0; i < n; i++) {
      // Avoid floating point drift
      res[i] = Number((a + i * step).toPrecision(14));
    }
    return res;
  }

  static arange(start, stop, step = 1) {
    let a = this.scalarOf(start);
    let b = stop !== undefined ? this.scalarOf(stop) : a;
    if (stop === undefined) a = 0;
    const s = this.scalarOf(step || 1);
    if (s === 0) return [a];
    const res = [];
    const maxLen = 100000;
    if (s > 0) {
      for (let x = a; x < b - 1e-12 && res.length < maxLen; x += s) {
        res.push(Number(x.toPrecision(14)));
      }
    } else {
      for (let x = a; x > b + 1e-12 && res.length < maxLen; x += s) {
        res.push(Number(x.toPrecision(14)));
      }
    }
    return res;
  }

  static zeros(rows, cols) {
    if (Array.isArray(rows)) {
      [rows, cols] = rows;
    }
    const r = Math.max(1, Math.min(2000, Math.floor(this.scalarOf(rows || 1))));
    const c = cols !== undefined ? Math.max(1, Math.min(2000, Math.floor(this.scalarOf(cols)))) : 1;
    if (c === 1) return new Array(r).fill(0);
    if (r === 1) return new Array(c).fill(0);
    return Array.from({ length: r }, () => new Array(c).fill(0));
  }

  static ones(rows, cols) {
    if (Array.isArray(rows)) {
      [rows, cols] = rows;
    }
    const r = Math.max(1, Math.min(2000, Math.floor(this.scalarOf(rows || 1))));
    const c = cols !== undefined ? Math.max(1, Math.min(2000, Math.floor(this.scalarOf(cols)))) : 1;
    if (c === 1) return new Array(r).fill(1);
    if (r === 1) return new Array(c).fill(1);
    return Array.from({ length: r }, () => new Array(c).fill(1));
  }

  static rand(rows = 1, cols = 1) {
    if (Array.isArray(rows)) [rows, cols] = rows;
    const r = Math.max(1, Math.min(5000, Math.floor(this.scalarOf(rows))));
    const c = Math.max(1, Math.min(5000, Math.floor(this.scalarOf(cols))));
    if (c === 1) return Array.from({ length: r }, () => Math.random());
    if (r === 1) return Array.from({ length: c }, () => Math.random());
    return Array.from({ length: r }, () => Array.from({ length: c }, () => Math.random()));
  }

  static randn(rows = 1, cols = 1) {
    if (Array.isArray(rows)) [rows, cols] = rows;
    const r = Math.max(1, Math.min(5000, Math.floor(this.scalarOf(rows))));
    const c = Math.max(1, Math.min(5000, Math.floor(this.scalarOf(cols))));
    const gaussian = () => {
      let u = 0;
      let v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };
    if (c === 1) return Array.from({ length: r }, gaussian);
    if (r === 1) return Array.from({ length: c }, gaussian);
    return Array.from({ length: r }, () => Array.from({ length: c }, gaussian));
  }

  static meshgrid(x, y) {
    const xArr = Array.isArray(x) ? x : [this.toNumber(x)];
    const yArr = y !== undefined ? (Array.isArray(y) ? y : [this.toNumber(y)]) : xArr;
    const rows = yArr.length;
    const cols = xArr.length;
    const X = new Array(rows);
    const Y = new Array(rows);
    for (let i = 0; i < rows; i++) {
      const rowX = new Array(cols);
      const rowY = new Array(cols);
      for (let j = 0; j < cols; j++) {
        rowX[j] = xArr[j];
        rowY[j] = yArr[i];
      }
      X[i] = rowX;
      Y[i] = rowY;
    }
    return [X, Y];
  }

  static map(val, fn) {
    if (this.is2D(val)) {
      return val.map((row) => row.map((x) => fn(this.toNumber(x))));
    }
    if (this.isArray(val)) {
      return val.map((x) => fn(this.toNumber(x)));
    }
    return fn(this.toNumber(val));
  }

  static binaryOp(a, b, fn) {
    const aIsArr = this.isArray(a);
    const bIsArr = this.isArray(b);

    if (!aIsArr && !bIsArr) {
      return fn(this.toNumber(a), this.toNumber(b));
    }

    if (aIsArr && !bIsArr) {
      const nb = this.toNumber(b);
      if (this.is2D(a)) {
        return a.map((row) => row.map((x) => fn(this.toNumber(x), nb)));
      }
      const res = new Array(a.length);
      for (let i = 0; i < a.length; i++) {
        res[i] = fn(this.toNumber(a[i]), nb);
      }
      return res;
    }

    if (!aIsArr && bIsArr) {
      const na = this.toNumber(a);
      if (this.is2D(b)) {
        return b.map((row) => row.map((y) => fn(na, this.toNumber(y))));
      }
      const res = new Array(b.length);
      for (let i = 0; i < b.length; i++) {
        res[i] = fn(na, this.toNumber(b[i]));
      }
      return res;
    }

    if (this.is2D(a) && this.is2D(b)) {
      return a.map((row, i) =>
        row.map((x, j) => fn(this.toNumber(x), this.toNumber(b[i] ? b[i][j] : 0)))
      );
    }

    if (this.is2D(a) && !this.is2D(b)) {
      return a.map((row, i) =>
        row.map((x, j) => fn(this.toNumber(x), this.toNumber(b[j] !== undefined ? b[j] : b[i] ?? 0)))
      );
    }

    if (!this.is2D(a) && this.is2D(b)) {
      return b.map((row, i) =>
        row.map((y, j) => fn(this.toNumber(a[j] !== undefined ? a[j] : a[i] ?? 0), this.toNumber(y)))
      );
    }

    const len = Math.min(a.length, b.length);
    const res = new Array(len);
    for (let i = 0; i < len; i++) {
      res[i] = fn(this.toNumber(a[i]), this.toNumber(b[i]));
    }
    return res;
  }

  static add(a, b) {
    if (typeof a === 'string' || typeof b === 'string') return `${a}${b}`;
    return this.binaryOp(a, b, (x, y) => x + y);
  }
  static sub(a, b) { return this.binaryOp(a, b, (x, y) => x - y); }
  static mul(a, b) { return this.binaryOp(a, b, (x, y) => x * y); }
  static div(a, b) {
    return this.binaryOp(a, b, (x, y) => {
      if (y === 0) return x === 0 ? 0 : x > 0 ? Infinity : -Infinity;
      return x / y;
    });
  }
  static pow(a, b) { return this.binaryOp(a, b, (x, y) => Math.pow(x, y)); }
  static neg(a) { return this.map(a, (x) => -x); }
  static not(a) { return this.map(a, (x) => (x === 0 ? 1 : 0)); }

  static eq(a, b) { return this.binaryOp(a, b, (x, y) => (Math.abs(x - y) < 1e-12 ? 1 : 0)); }
  static neq(a, b) { return this.binaryOp(a, b, (x, y) => (Math.abs(x - y) >= 1e-12 ? 1 : 0)); }
  static lt(a, b) { return this.binaryOp(a, b, (x, y) => (x < y ? 1 : 0)); }
  static le(a, b) { return this.binaryOp(a, b, (x, y) => (x <= y + 1e-15 ? 1 : 0)); }
  static gt(a, b) { return this.binaryOp(a, b, (x, y) => (x > y ? 1 : 0)); }
  static ge(a, b) { return this.binaryOp(a, b, (x, y) => (x >= y - 1e-15 ? 1 : 0)); }
  static and(a, b) { return this.binaryOp(a, b, (x, y) => (x !== 0 && y !== 0 ? 1 : 0)); }
  static or(a, b) { return this.binaryOp(a, b, (x, y) => (x !== 0 || y !== 0 ? 1 : 0)); }

  // 1D Discrete Convolution (optimized with Float64Array)
  static conv(u, v, shape = 'full') {
    const a = Array.isArray(u) ? u : [this.toNumber(u)];
    const b = Array.isArray(v) ? v : [this.toNumber(v)];
    const m = a.length;
    const n = b.length;
    if (m === 0 || n === 0) return [];

    const fa = new Float64Array(m);
    const fb = new Float64Array(n);
    for (let i = 0; i < m; i++) fa[i] = Number.isFinite(a[i]) ? a[i] : 0;
    for (let j = 0; j < n; j++) fb[j] = Number.isFinite(b[j]) ? b[j] : 0;

    const fullLen = m + n - 1;
    const out = new Float64Array(fullLen);

    for (let i = 0; i < m; i++) {
      const ai = fa[i];
      if (ai === 0) continue;
      for (let j = 0; j < n; j++) {
        out[i + j] += ai * fb[j];
      }
    }

    const mode = String(shape || 'full').toLowerCase();
    if (mode === 'same') {
      const start = Math.floor((n - 1) / 2);
      return Array.from(out.subarray(start, start + m));
    }
    if (mode === 'valid') {
      const validLen = Math.max(0, m - n + 1);
      return Array.from(out.subarray(n - 1, n - 1 + validLen));
    }
    return Array.from(out);
  }

  static sum(v) {
    if (this.is2D(v)) return v.map((r) => r.reduce((acc, x) => acc + (Number.isFinite(x) ? x : 0), 0));
    if (this.isArray(v)) return v.reduce((acc, x) => acc + (Number.isFinite(x) ? x : 0), 0);
    return this.toNumber(v);
  }

  static mean(v) {
    if (this.is2D(v)) {
      const flat = v.flat().filter(Number.isFinite);
      return flat.length ? flat.reduce((a, b) => a + b, 0) / flat.length : 0;
    }
    if (this.isArray(v) && v.length > 0) return this.sum(v) / v.length;
    return this.toNumber(v);
  }

  static min(v, b) {
    if (b !== undefined) return this.binaryOp(v, b, Math.min);
    const arr = this.is2D(v) ? v.flat() : this.isArray(v) ? v : [v];
    let m = Infinity;
    for (let i = 0; i < arr.length; i++) {
      if (Number.isFinite(arr[i]) && arr[i] < m) m = arr[i];
    }
    return m === Infinity ? 0 : m;
  }

  static max(v, b) {
    if (b !== undefined) return this.binaryOp(v, b, Math.max);
    const arr = this.is2D(v) ? v.flat() : this.isArray(v) ? v : [v];
    let m = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      if (Number.isFinite(arr[i]) && arr[i] > m) m = arr[i];
    }
    return m === -Infinity ? 0 : m;
  }

  static std(v) {
    if (!this.isArray(v) || v.length < 2) return 0;
    const m = this.mean(v);
    const variance = v.reduce((acc, x) => acc + (x - m) ** 2, 0) / (v.length - 1);
    return Math.sqrt(variance);
  }

  static cumsum(v) {
    if (!this.isArray(v)) return [this.toNumber(v)];
    let acc = 0;
    return v.map((x) => (acc += this.toNumber(x)));
  }

  static trapz(xOrY, yOpt) {
    const y = yOpt !== undefined ? yOpt : xOrY;
    const x = yOpt !== undefined ? xOrY : null;
    if (!Array.isArray(y) || y.length < 2) return 0;
    let area = 0;
    for (let i = 0; i < y.length - 1; i++) {
      const dx = x && Array.isArray(x) ? x[i + 1] - x[i] : 1;
      area += 0.5 * (y[i] + y[i + 1]) * dx;
    }
    return area;
  }

  static diff(v) {
    if (!this.isArray(v) || v.length < 2) return [];
    const res = new Array(v.length - 1);
    for (let i = 0; i < v.length - 1; i++) {
      res[i] = v[i + 1] - v[i];
    }
    return res;
  }

  static gradient(v, dx = 1) {
    if (!this.isArray(v) || v.length === 0) return [];
    if (v.length === 1) return [0];
    const h = this.scalarOf(dx) || 1;
    const res = new Array(v.length);
    res[0] = (v[1] - v[0]) / h;
    for (let i = 1; i < v.length - 1; i++) {
      res[i] = (v[i + 1] - v[i - 1]) / (2 * h);
    }
    res[v.length - 1] = (v[v.length - 1] - v[v.length - 2]) / h;
    return res;
  }

  static fft(signal, nOpt) {
    if (!this.isArray(signal) || signal.length === 0) return [];
    const targetLen = nOpt ? Math.floor(this.scalarOf(nOpt)) : signal.length;
    let n = 1;
    while (n < targetLen) n <<= 1;
    const real = new Float64Array(n);
    const imag = new Float64Array(n);
    const copyLen = Math.min(signal.length, n);
    for (let i = 0; i < copyLen; i++) {
      real[i] = Number.isFinite(signal[i]) ? signal[i] : 0;
    }

    for (let i = 0, j = 0; i < n; i++) {
      if (j > i) {
        let temp = real[i]; real[i] = real[j]; real[j] = temp;
        temp = imag[i]; imag[i] = imag[j]; imag[j] = temp;
      }
      let mask = n >> 1;
      while (mask >= 1 && (j & mask)) {
        j ^= mask;
        mask >>= 1;
      }
      j ^= mask;
    }

    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const angle = (-2 * Math.PI) / len;
      const wStepR = Math.cos(angle);
      const wStepI = Math.sin(angle);

      for (let i = 0; i < n; i += len) {
        let wR = 1;
        let wI = 0;
        for (let j = 0; j < half; j++) {
          const uR = real[i + j];
          const uI = imag[i + j];
          const vR = real[i + j + half] * wR - imag[i + j + half] * wI;
          const vI = real[i + j + half] * wI + imag[i + j + half] * wR;

          real[i + j] = uR + vR;
          imag[i + j] = uI + vI;
          real[i + j + half] = uR - vR;
          imag[i + j + half] = uI - vI;

          const nextWR = wR * wStepR - wI * wStepI;
          const nextWI = wR * wStepI + wI * wStepR;
          wR = nextWR;
          wI = nextWI;
        }
      }
    }

    const magnitudes = new Array(targetLen);
    for (let i = 0; i < targetLen; i++) {
      magnitudes[i] = Math.hypot(real[i], imag[i]);
    }
    return magnitudes;
  }

  static fftshift(arr) {
    if (!this.isArray(arr)) return arr;
    const mid = Math.floor(arr.length / 2);
    return [...arr.slice(mid), ...arr.slice(0, mid)];
  }
}

// ============================================================================
// 3. Line Style & Color Parser
// ============================================================================

const PALETTE = [
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#14b8a6', // Teal
];

const NAMED_COLORS = {
  r: '#ef4444',
  red: '#ef4444',
  g: '#10b981',
  green: '#10b981',
  b: '#3b82f6',
  blue: '#3b82f6',
  c: '#06b6d4',
  cyan: '#06b6d4',
  m: '#ec4899',
  magenta: '#ec4899',
  y: '#eab308',
  yellow: '#eab308',
  k: '#334155',
  black: '#334155',
  w: '#f8fafc',
  white: '#f8fafc',
  orange: '#f97316',
  purple: '#8b5cf6',
  gray: '#64748b',
  grey: '#64748b',
};

export function resolveColorValue(cVal, fallbackColor) {
  if (!cVal) return fallbackColor;
  if (Array.isArray(cVal) && cVal.length >= 3) {
    // MATLAB RGB triplet [r, g, b] in [0, 1] or [0, 255]
    const scale = cVal.every((v) => v <= 1) ? 255 : 1;
    const r = Math.round(Math.max(0, Math.min(255, cVal[0] * scale)));
    const g = Math.round(Math.max(0, Math.min(255, cVal[1] * scale)));
    const b = Math.round(Math.max(0, Math.min(255, cVal[2] * scale)));
    return `rgb(${r}, ${g}, ${b})`;
  }
  if (typeof cVal === 'string') {
    const trimmed = cVal.trim().toLowerCase();
    if (NAMED_COLORS[trimmed]) return NAMED_COLORS[trimmed];
    return cVal.trim();
  }
  return fallbackColor;
}

export function isLineSpecString(str) {
  if (typeof str !== 'string') return false;
  const s = str.trim();
  if (!s || s.length > 6) return false;
  // Contains only valid MATLAB/Matplotlib LineSpec characters: r,g,b,c,m,y,k,w, -, :, ., o, +, *, x, s, d, ^, v, >, <, p, h
  return /^[rgbcmykw\-:.o+*xsd^v><ph]+$/i.test(s);
}

export function parseMATLABLineSpec(specStr, colorIndex = 0) {
  const defaultColor = PALETTE[colorIndex % PALETTE.length];
  if (!specStr || typeof specStr !== 'string') {
    return {
      color: defaultColor,
      lineStyle: 'solid',
      lineWidth: 2,
      marker: 'none',
      markerSize: 4.5,
    };
  }

  let s = specStr.trim();
  let color = null;
  let lineStyle = null;
  let marker = 'none';

  if (s.includes('--')) {
    lineStyle = 'dashed';
    s = s.replace('--', '');
  } else if (s.includes('-.')) {
    lineStyle = 'dashdot';
    s = s.replace('-.', '');
  } else if (s.includes(':')) {
    lineStyle = 'dotted';
    s = s.replace(':', '');
  } else if (s.includes('-')) {
    lineStyle = 'solid';
    s = s.replace('-', '');
  }

  const markers = ['o', 's', 'd', '^', 'v', '*', '+', 'x', '.'];
  for (const m of markers) {
    if (s.includes(m)) {
      marker = m;
      s = s.replace(m, '');
      break;
    }
  }

  for (const ch of s.toLowerCase()) {
    if (NAMED_COLORS[ch]) {
      color = NAMED_COLORS[ch];
      break;
    }
  }

  // If marker was specified without a line style (e.g., 'ro'), lineStyle is 'none'
  if (lineStyle === null) {
    lineStyle = marker !== 'none' ? 'none' : 'solid';
  }

  return {
    color: color || defaultColor,
    lineStyle,
    lineWidth: 2,
    marker,
    markerSize: marker === '.' ? 3 : 4.5,
  };
}

// ============================================================================
// 4. Lexer / Tokenizer & Recursive-Descent AST Parser
// ============================================================================

function tokenizeExpr(input) {
  const tokens = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    // Whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Numbers (including scientific notation 1e-6, .5)
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(input[i + 1] || ''))) {
      let numStr = '';
      while (i < len && /[\d.]/.test(input[i])) {
        // Avoid consuming `.*`, `.^`, `./` after a number
        if (input[i] === '.' && /[*^\\/]/.test(input[i + 1] || '')) {
          break;
        }
        numStr += input[i++];
      }
      if (i < len && (input[i] === 'e' || input[i] === 'E')) {
        const next = input[i + 1] || '';
        const next2 = input[i + 2] || '';
        if (/\d/.test(next) || ((next === '+' || next === '-') && /\d/.test(next2))) {
          numStr += input[i++];
          if (input[i] === '+' || input[i] === '-') numStr += input[i++];
          while (i < len && /\d/.test(input[i])) numStr += input[i++];
        }
      }
      // Imaginary suffix 1i or 1j
      if (i < len && (input[i] === 'i' || input[i] === 'j') && !/[a-zA-Z0-9_]/.test(input[i + 1] || '')) {
        i++;
      }
      tokens.push({ type: 'num', value: Number(numStr) });
      continue;
    }

    // String literal ('...' or "...")
    if (ch === "'" || ch === '"') {
      // Check if single quote is MATLAB transpose operator (immediately following identifier, number, ), or ])
      if (ch === "'") {
        const prev = tokens[tokens.length - 1];
        if (
          prev &&
          (prev.type === 'id' ||
            prev.type === 'num' ||
            (prev.type === 'punc' && (prev.value === ')' || prev.value === ']')))
        ) {
          tokens.push({ type: 'op', value: "'" });
          i++;
          continue;
        }
      }
      const quote = ch;
      i++;
      let str = '';
      while (i < len) {
        if (input[i] === '\\' && i + 1 < len) {
          str += input[i + 1];
          i += 2;
          continue;
        }
        if (input[i] === quote) {
          if (input[i + 1] === quote) {
            str += quote;
            i += 2;
            continue;
          }
          i++;
          break;
        }
        str += input[i++];
      }
      tokens.push({ type: 'str', value: str });
      continue;
    }

    // Multi-char operators
    const two = input.slice(i, i + 2);
    if (
      two === '.*' ||
      two === './' ||
      two === '.^' ||
      two === '**' ||
      two === '>=' ||
      two === '<=' ||
      two === '==' ||
      two === '~=' ||
      two === '!=' ||
      two === '&&' ||
      two === '||'
    ) {
      tokens.push({ type: 'op', value: two });
      i += 2;
      continue;
    }

    // Single-char operators & punctuation
    if ('+-*/^:<>=~&|@'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    if ('()[]{};,.'.includes(ch)) {
      tokens.push({ type: 'punc', value: ch });
      i++;
      continue;
    }

    // Identifiers
    if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (i < len && /[a-zA-Z0-9_]/.test(input[i])) {
        id += input[i++];
      }
      if (id === 'and') tokens.push({ type: 'op', value: '&&' });
      else if (id === 'or') tokens.push({ type: 'op', value: '||' });
      else if (id === 'not') tokens.push({ type: 'op', value: '~' });
      else tokens.push({ type: 'id', value: id });
      continue;
    }

    // Unknown char: skip
    i++;
  }

  return tokens;
}

class ExprParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.pos + offset] || null;
  }

  next() {
    return this.tokens[this.pos++] || null;
  }

  match(type, val) {
    const t = this.peek();
    if (t && t.type === type && (val === undefined || t.value === val)) {
      this.pos++;
      return t;
    }
    return null;
  }

  parseExpression() {
    // Check for MATLAB anonymous function: @(x, y) expr
    if (this.peek()?.type === 'op' && this.peek()?.value === '@') {
      this.next(); // consume @
      const params = [];
      if (this.match('punc', '(')) {
        while (this.peek() && !(this.peek().type === 'punc' && this.peek().value === ')')) {
          const p = this.next();
          if (p.type === 'id') params.push(p.value);
          this.match('punc', ',');
        }
        this.match('punc', ')');
      } else if (this.peek()?.type === 'id') {
        // Function handle @sin
        const fnName = this.next().value;
        return { type: 'Var', name: fnName };
      }
      const body = this.parseExpression();
      return { type: 'AnonFn', params, body };
    }

    // Check for Python lambda: lambda x, y: expr
    if (this.peek()?.type === 'id' && this.peek()?.value === 'lambda') {
      this.next();
      const params = [];
      while (this.peek() && !(this.peek().type === 'op' && this.peek().value === ':')) {
        const p = this.next();
        if (p.type === 'id') params.push(p.value);
        this.match('punc', ',');
      }
      this.match('op', ':');
      const body = this.parseExpression();
      return { type: 'AnonFn', params, body };
    }

    // Check for keyword argument in call: key = expr
    if (
      this.peek()?.type === 'id' &&
      this.peek(1)?.type === 'op' &&
      this.peek(1)?.value === '='
    ) {
      const key = this.next().value;
      this.next(); // consume =
      const val = this.parseLogicalOr();
      return { type: 'KwArg', key, value: val };
    }

    return this.parseLogicalOr();
  }

  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    while (this.peek()?.type === 'op' && (this.peek().value === '|' || this.peek().value === '||')) {
      const op = this.next().value;
      const right = this.parseLogicalAnd();
      left = { type: 'Binary', op, left, right };
    }
    return left;
  }

  parseLogicalAnd() {
    let left = this.parseComparison();
    while (this.peek()?.type === 'op' && (this.peek().value === '&' || this.peek().value === '&&')) {
      const op = this.next().value;
      const right = this.parseComparison();
      left = { type: 'Binary', op, left, right };
    }
    return left;
  }

  parseComparison() {
    let left = this.parseColon();
    while (
      this.peek()?.type === 'op' &&
      ['==', '~=', '!=', '<', '<=', '>', '>='].includes(this.peek().value)
    ) {
      const op = this.next().value;
      const right = this.parseColon();
      left = { type: 'Binary', op, left, right };
    }
    return left;
  }

  parseColon() {
    let first = this.parseAdditive();
    if (this.peek()?.type === 'op' && this.peek().value === ':') {
      this.next(); // consume first :
      const second = this.parseAdditive();
      if (this.peek()?.type === 'op' && this.peek().value === ':') {
        this.next(); // consume second :
        const third = this.parseAdditive();
        return { type: 'Colon', start: first, step: second, stop: third };
      }
      return { type: 'Colon', start: first, step: null, stop: second };
    }
    return first;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.peek()?.type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.next().value;
      const right = this.parseMultiplicative();
      left = { type: 'Binary', op, left, right };
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (
      this.peek()?.type === 'op' &&
      ['*', '.*', '/', './'].includes(this.peek().value)
    ) {
      const op = this.next().value;
      const right = this.parseUnary();
      left = { type: 'Binary', op, left, right };
    }
    return left;
  }

  parseUnary() {
    if (
      this.peek()?.type === 'op' &&
      (this.peek().value === '-' || this.peek().value === '+' || this.peek().value === '~')
    ) {
      const op = this.next().value;
      const arg = this.parseUnary();
      return { type: 'Unary', op, arg };
    }
    return this.parsePower();
  }

  parsePower() {
    let base = this.parsePostfix();
    if (
      this.peek()?.type === 'op' &&
      (this.peek().value === '^' || this.peek().value === '.^' || this.peek().value === '**')
    ) {
      const op = this.next().value;
      const exp = this.parseUnary(); // Right-associative and allows unary minus in exponent: 2^-3
      return { type: 'Binary', op, left: base, right: exp };
    }
    return base;
  }

  parsePostfix() {
    let node = this.parsePrimary();

    while (this.peek()) {
      // Property access: np.sin, plt.plot, ax.set_title
      if (this.peek().type === 'punc' && this.peek().value === '.') {
        this.next();
        const prop = this.next();
        if (prop && prop.type === 'id') {
          node = { type: 'Member', object: node, property: prop.value };
        }
        continue;
      }

      // Transpose operator '
      if (this.peek().type === 'op' && this.peek().value === "'") {
        this.next();
        node = { type: 'Unary', op: "'", arg: node };
        continue;
      }

      // Function call or MATLAB 1-based indexing: node(arg1, arg2, ...)
      if (this.peek().type === 'punc' && this.peek().value === '(') {
        this.next(); // consume (
        const args = [];
        while (this.peek() && !(this.peek().type === 'punc' && this.peek().value === ')')) {
          if (this.peek().type === 'op' && this.peek().value === ':') {
            this.next();
            args.push({ type: 'AllSlice' });
          } else {
            args.push(this.parseExpression());
          }
          this.match('punc', ',');
        }
        this.match('punc', ')');
        node = { type: 'CallOrIndex', callee: node, args, style: 'paren' };
        continue;
      }

      // Python 0-based bracket indexing: node[arg]
      if (this.peek().type === 'punc' && this.peek().value === '[') {
        this.next(); // consume [
        const args = [];
        while (this.peek() && !(this.peek().type === 'punc' && this.peek().value === ']')) {
          if (this.peek().type === 'op' && this.peek().value === ':') {
            this.next();
            args.push({ type: 'AllSlice' });
          } else {
            args.push(this.parseExpression());
          }
          this.match('punc', ',');
        }
        this.match('punc', ']');
        node = { type: 'CallOrIndex', callee: node, args, style: 'bracket' };
        continue;
      }

      break;
    }

    return node;
  }

  parsePrimary() {
    const t = this.peek();
    if (!t) return { type: 'Literal', value: 0 };

    if (t.type === 'num') {
      this.next();
      return { type: 'Literal', value: t.value };
    }

    if (t.type === 'str') {
      this.next();
      return { type: 'Literal', value: t.value };
    }

    if (t.type === 'id') {
      this.next();
      if (t.value === 'true' || t.value === 'True') return { type: 'Literal', value: 1 };
      if (t.value === 'false' || t.value === 'False') return { type: 'Literal', value: 0 };
      if (t.value === 'None') return { type: 'Literal', value: null };
      return { type: 'Var', name: t.value };
    }

    // Parenthesized expression or tuple: (a + b) or (a, b)
    if (t.type === 'punc' && t.value === '(') {
      this.next(); // consume (
      const items = [];
      while (this.peek() && !(this.peek().type === 'punc' && this.peek().value === ')')) {
        items.push(this.parseExpression());
        if (!this.match('punc', ',')) break;
      }
      this.match('punc', ')');
      if (items.length === 1) return items[0];
      return { type: 'ArrayLit', rows: [items] };
    }

    // Array / Matrix literal: [1, 2, 3] or [1 2 3] or [1 2; 3 4]
    if (t.type === 'punc' && t.value === '[') {
      this.next(); // consume [
      const rows = [];
      let currentRow = [];
      while (this.peek() && !(this.peek().type === 'punc' && this.peek().value === ']')) {
        if (this.match('punc', ';')) {
          if (currentRow.length > 0) rows.push(currentRow);
          currentRow = [];
          continue;
        }
        if (this.match('punc', ',')) {
          continue;
        }
        currentRow.push(this.parseExpression());
      }
      if (currentRow.length > 0) rows.push(currentRow);
      this.match('punc', ']');
      return { type: 'ArrayLit', rows };
    }

    // Curly cell literal: {'a', 'b'}
    if (t.type === 'punc' && t.value === '{') {
      this.next();
      const items = [];
      while (this.peek() && !(this.peek().type === 'punc' && this.peek().value === '}')) {
        if (this.match('punc', ',') || this.match('punc', ';')) continue;
        items.push(this.parseExpression());
      }
      this.match('punc', '}');
      return { type: 'ArrayLit', rows: [items] };
    }

    this.next();
    return { type: 'Literal', value: 0 };
  }
}

export function evalAST(node, env) {
  if (!node) return 0;

  switch (node.type) {
    case 'Literal':
      return node.value;

    case 'Var': {
      if (env.variables.has(node.name)) {
        return env.variables.get(node.name);
      }
      return 0;
    }

    case 'KwArg': {
      return { __isKwArg: true, key: node.key, value: evalAST(node.value, env) };
    }

    case 'AnonFn': {
      return (...callArgs) => {
        const prevValues = new Map();
        for (let i = 0; i < node.params.length; i++) {
          const pName = node.params[i];
          if (env.variables.has(pName)) {
            prevValues.set(pName, { had: true, val: env.variables.get(pName) });
          } else {
            prevValues.set(pName, { had: false });
          }
          env.variables.set(pName, callArgs[i] ?? 0);
        }
        try {
          return evalAST(node.body, env);
        } finally {
          for (const [pName, info] of prevValues.entries()) {
            if (info.had) env.variables.set(pName, info.val);
            else env.variables.delete(pName);
          }
        }
      };
    }

    case 'ArrayLit': {
      if (node.rows.length === 0) return [];
      const evaluatedRows = node.rows.map((row) => {
        const flatRow = [];
        for (const item of row) {
          const v = evalAST(item, env);
          if (Array.isArray(v) && !VectorizedMath.is2D(v)) {
            flatRow.push(...v);
          } else {
            flatRow.push(v);
          }
        }
        return flatRow;
      });
      if (evaluatedRows.length === 1) return evaluatedRows[0];
      // If each row has 1 scalar (e.g. [1; 2; 3] column vector), return 1D vector for plotting compatibility
      if (evaluatedRows.every((r) => r.length === 1)) {
        return evaluatedRows.map((r) => r[0]);
      }
      return evaluatedRows;
    }

    case 'Colon': {
      const start = evalAST(node.start, env);
      const stop = evalAST(node.stop, env);
      if (node.step !== null) {
        const step = evalAST(node.step, env);
        return VectorizedMath.colonRange(start, step, stop);
      }
      return VectorizedMath.colonRange(start, stop);
    }

    case 'Unary': {
      const v = evalAST(node.arg, env);
      if (node.op === '-') return VectorizedMath.neg(v);
      if (node.op === '+') return v;
      if (node.op === '~') return VectorizedMath.not(v);
      if (node.op === "'") {
        // Transpose 2D matrix; keep 1D vector intact
        if (VectorizedMath.is2D(v)) {
          const rows = v.length;
          const cols = v[0].length;
          return Array.from({ length: cols }, (_, c) =>
            Array.from({ length: rows }, (__, r) => v[r][c])
          );
        }
        return v;
      }
      return v;
    }

    case 'Binary': {
      const l = evalAST(node.left, env);
      const r = evalAST(node.right, env);
      switch (node.op) {
        case '+': return VectorizedMath.add(l, r);
        case '-': return VectorizedMath.sub(l, r);
        case '*':
        case '.*': return VectorizedMath.mul(l, r);
        case '/':
        case './': return VectorizedMath.div(l, r);
        case '^':
        case '.^':
        case '**': return VectorizedMath.pow(l, r);
        case '==': return VectorizedMath.eq(l, r);
        case '~=':
        case '!=': return VectorizedMath.neq(l, r);
        case '<': return VectorizedMath.lt(l, r);
        case '<=': return VectorizedMath.le(l, r);
        case '>': return VectorizedMath.gt(l, r);
        case '>=': return VectorizedMath.ge(l, r);
        case '&':
        case '&&': return VectorizedMath.and(l, r);
        case '|':
        case '||': return VectorizedMath.or(l, r);
        default: return 0;
      }
    }

    case 'Member': {
      // Handle np.sin, np.random.randn, np.fft.fft, etc.
      if (env.variables.has(node.property)) {
        return env.variables.get(node.property);
      }
      const obj = evalAST(node.object, env);
      if (obj && typeof obj === 'object' && node.property in obj) {
        return obj[node.property];
      }
      return 0;
    }

    case 'CallOrIndex': {
      const target = evalAST(node.callee, env);

      // 1. Callable Function
      if (typeof target === 'function') {
        const evaledArgs = node.args.map((a) => evalAST(a, env));
        return target(...evaledArgs);
      }

      // 2. Array Indexing / Slicing (e.g. t(1), t(end), P2(1:length(f)), t[0], t[-1])
      if (Array.isArray(target)) {
        return indexArray(target, node.args, node.style, env);
      }

      return target;
    }

    default:
      return 0;
  }
}

function indexArray(arr, argNodes, style, env) {
  if (argNodes.length === 0) return arr;

  const isOneBased = style === 'paren' && env.lang === 'matlab';

  // Helper to evaluate an index node with `end` bound to dimension length
  const evalIndexArg = (argNode, dimLen) => {
    if (argNode.type === 'AllSlice') {
      return isOneBased
        ? VectorizedMath.colonRange(1, dimLen)
        : VectorizedMath.arange(0, dimLen, 1);
    }
    const hadEnd = env.variables.has('end');
    const prevEnd = env.variables.get('end');
    env.variables.set('end', isOneBased ? dimLen : dimLen - 1);
    try {
      return evalAST(argNode, env);
    } finally {
      if (hadEnd) env.variables.set('end', prevEnd);
      else env.variables.delete('end');
    }
  };

  if (!VectorizedMath.is2D(arr)) {
    const len = arr.length;
    if (len === 0) return 0;
    const idxVal = evalIndexArg(argNodes[0], len);

    if (Array.isArray(idxVal)) {
      return idxVal.map((k) => {
        const rawIdx = Math.round(Number(k));
        const jsIdx = isOneBased ? rawIdx - 1 : rawIdx < 0 ? len + rawIdx : rawIdx;
        return arr[Math.max(0, Math.min(len - 1, jsIdx))] ?? 0;
      });
    }

    const rawIdx = Math.round(Number(idxVal));
    const jsIdx = isOneBased ? rawIdx - 1 : rawIdx < 0 ? len + rawIdx : rawIdx;
    return arr[Math.max(0, Math.min(len - 1, jsIdx))] ?? 0;
  }

  // 2D Matrix Indexing
  const rows = arr.length;
  const cols = arr[0] ? arr[0].length : 0;
  if (argNodes.length === 1) {
    const flat = arr.flat();
    return indexArray(flat, argNodes, style, env);
  }

  const rIdx = evalIndexArg(argNodes[0], rows);
  const cIdx = evalIndexArg(argNodes[1], cols);

  const normIdx = (k, maxLen) => {
    const raw = Math.round(Number(k));
    const j = isOneBased ? raw - 1 : raw < 0 ? maxLen + raw : raw;
    return Math.max(0, Math.min(maxLen - 1, j));
  };

  if (Array.isArray(rIdx) && Array.isArray(cIdx)) {
    const sub = rIdx.map((r) => cIdx.map((c) => arr[normIdx(r, rows)][normIdx(c, cols)]));
    if (sub.length === 1) return sub[0];
    if (sub.every((row) => row.length === 1)) return sub.map((row) => row[0]);
    return sub;
  }
  if (Array.isArray(rIdx) && !Array.isArray(cIdx)) {
    const c = normIdx(cIdx, cols);
    return rIdx.map((r) => arr[normIdx(r, rows)][c]);
  }
  if (!Array.isArray(rIdx) && Array.isArray(cIdx)) {
    const r = normIdx(rIdx, rows);
    return cIdx.map((c) => arr[r][normIdx(c, cols)]);
  }
  return arr[normIdx(rIdx, rows)][normIdx(cIdx, cols)];
}

export function evaluateExpr(exprStr, env) {
  if (exprStr === null || exprStr === undefined) return 0;
  if (typeof exprStr === 'number') return exprStr;
  if (typeof exprStr !== 'string') return exprStr;
  const s = exprStr.trim();
  if (!s) return 0;

  const tokens = tokenizeExpr(s);
  if (tokens.length === 0) return 0;
  const parser = new ExprParser(tokens);
  const ast = parser.parseExpression();
  return evalAST(ast, env);
}

// ============================================================================
// 5. Execution Environment & Built-in Registration
// ============================================================================

export class ScriptEnvironment {
  constructor(lang = 'matlab') {
    this.lang = lang;
    this.variables = new Map();
    this.logs = [];
    this.figure = {
      title: '',
      subplots: [],
      currentSubplot: this.createDefaultSubplot(1, 1, 1),
    };
    this.subplotGrid = { rows: 1, cols: 1 };
    this.hold = false;
    this.colorCounter = 0;
    this.initBuiltins();
  }

  createDefaultSubplot(rows = 1, cols = 1, index = 1) {
    return {
      rows,
      cols,
      index,
      title: '',
      xlabel: '',
      ylabel: '',
      zlabel: '',
      xscale: 'linear',
      yscale: 'linear',
      isPolar: false,
      is3D: false,
      grid: true,
      xlim: null,
      ylim: null,
      series: [],
    };
  }

  initBuiltins() {
    this.variables.set('pi', Math.PI);
    this.variables.set('PI', Math.PI);
    this.variables.set('e', Math.E);
    this.variables.set('E', Math.E);
    this.variables.set('Inf', Infinity);
    this.variables.set('inf', Infinity);
    this.variables.set('NaN', NaN);
    this.variables.set('nan', NaN);

    const math1 = [
      ['sin', Math.sin],
      ['cos', Math.cos],
      ['tan', Math.tan],
      ['sec', (x) => 1 / Math.cos(x)],
      ['csc', (x) => 1 / Math.sin(x)],
      ['cot', (x) => 1 / Math.tan(x)],
      ['sind', (d) => Math.sin((d * Math.PI) / 180)],
      ['cosd', (d) => Math.cos((d * Math.PI) / 180)],
      ['tand', (d) => Math.tan((d * Math.PI) / 180)],
      ['asin', Math.asin],
      ['acos', Math.acos],
      ['atan', Math.atan],
      ['arcsin', Math.asin],
      ['arccos', Math.acos],
      ['arctan', Math.atan],
      ['sinh', Math.sinh],
      ['cosh', Math.cosh],
      ['tanh', Math.tanh],
      ['exp', Math.exp],
      ['log', Math.log],
      ['ln', Math.log],
      ['log10', Math.log10],
      ['log2', Math.log2],
      ['sqrt', (x) => (x < 0 ? 0 : Math.sqrt(x))],
      ['cbrt', Math.cbrt],
      ['abs', Math.abs],
      ['floor', Math.floor],
      ['ceil', Math.ceil],
      ['round', Math.round],
      ['fix', Math.trunc],
      ['sign', Math.sign],
      ['double', (x) => Number(x)],
      ['single', (x) => Number(x)],
      ['logical', (x) => (x !== 0 ? 1 : 0)],
      ['real', (x) => Number(x)],
      ['imag', () => 0],
      ['deg2rad', (d) => (d * Math.PI) / 180],
      ['rad2deg', (r) => (r * 180) / Math.PI],
      ['radians', (d) => (d * Math.PI) / 180],
      ['degrees', (r) => (r * 180) / Math.PI],
      ['sinc', (x) => (Math.abs(x) < 1e-12 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x))],
      ['heaviside', (x) => (x < 0 ? 0 : x === 0 ? 0.5 : 1)],
      ['rectpuls', (t) => (Math.abs(t) < 0.5 ? 1 : Math.abs(t) === 0.5 ? 0.5 : 0)],
      ['tripuls', (t) => (Math.abs(t) < 1 ? 1 - Math.abs(t) : 0)],
      ['square', (t) => (Math.sin(t) >= 0 ? 1 : -1)],
      ['sawtooth', (t) => 2 * (t / (2 * Math.PI) - Math.floor(0.5 + t / (2 * Math.PI)))],
    ];

    for (const [name, fn] of math1) {
      this.variables.set(name, (v) => VectorizedMath.map(v, fn));
    }

    this.variables.set('atan2', (y, x) => VectorizedMath.binaryOp(y, x, Math.atan2));
    this.variables.set('arctan2', (y, x) => VectorizedMath.binaryOp(y, x, Math.atan2));
    this.variables.set('mod', (a, b) =>
      VectorizedMath.binaryOp(a, b, (x, y) => ((x % y) + y) % y)
    );
    this.variables.set('rem', (a, b) => VectorizedMath.binaryOp(a, b, (x, y) => x % y));
    this.variables.set('power', (a, b) => VectorizedMath.pow(a, b));

    // Vector & Signal Generators
    this.variables.set('linspace', (...args) => VectorizedMath.linspace(...args));
    this.variables.set('logspace', (...args) => VectorizedMath.logspace(...args));
    this.variables.set('arange', (...args) => VectorizedMath.arange(...args));
    this.variables.set('range', (...args) => VectorizedMath.arange(...args));
    this.variables.set('zeros', (...args) => VectorizedMath.zeros(...args));
    this.variables.set('ones', (...args) => VectorizedMath.ones(...args));
    this.variables.set('rand', (...args) => VectorizedMath.rand(...args));
    this.variables.set('randn', (...args) => VectorizedMath.randn(...args));
    this.variables.set('normal', (loc = 0, scale = 1, size = 100) => {
      const z = VectorizedMath.randn(size, 1);
      return VectorizedMath.add(loc, VectorizedMath.mul(scale, z));
    });
    this.variables.set('uniform', (low = 0, high = 1, size = 100) => {
      const u = VectorizedMath.rand(size, 1);
      return VectorizedMath.add(low, VectorizedMath.mul(high - low, u));
    });
    this.variables.set('meshgrid', (...args) => VectorizedMath.meshgrid(...args));
    this.variables.set('conv', (u, v, shape) => VectorizedMath.conv(u, v, shape));
    this.variables.set('convolve', (u, v, shape) => VectorizedMath.conv(u, v, shape));

    // Reductions & Array Operations
    this.variables.set('sum', (v) => VectorizedMath.sum(v));
    this.variables.set('mean', (v) => VectorizedMath.mean(v));
    this.variables.set('min', (v, b) => VectorizedMath.min(v, b));
    this.variables.set('max', (v, b) => VectorizedMath.max(v, b));
    this.variables.set('std', (v) => VectorizedMath.std(v));
    this.variables.set('cumsum', (v) => VectorizedMath.cumsum(v));
    this.variables.set('trapz', (x, y) => VectorizedMath.trapz(x, y));
    this.variables.set('diff', (v) => VectorizedMath.diff(v));
    this.variables.set('gradient', (v, dx) => VectorizedMath.gradient(v, dx));
    this.variables.set('length', (v) => (Array.isArray(v) ? v.length : 1));
    this.variables.set('len', (v) => (Array.isArray(v) ? v.length : 1));
    this.variables.set('numel', (v) => {
      if (VectorizedMath.is2D(v)) return v.length * (v[0] ? v[0].length : 0);
      return Array.isArray(v) ? v.length : 1;
    });
    this.variables.set('size', (v, dim) => {
      const shape = VectorizedMath.is2D(v)
        ? [v.length, v[0] ? v[0].length : 0]
        : Array.isArray(v)
        ? [1, v.length]
        : [1, 1];
      if (dim === 1) return shape[0];
      if (dim === 2) return shape[1];
      return shape;
    });
    this.variables.set('fliplr', (v) => (Array.isArray(v) ? [...v].reverse() : v));
    this.variables.set('flipud', (v) => (Array.isArray(v) ? [...v].reverse() : v));
    this.variables.set('flip', (v) => (Array.isArray(v) ? [...v].reverse() : v));
    this.variables.set('sort', (v) => (Array.isArray(v) ? [...v].sort((a, b) => a - b) : v));
    this.variables.set('polyval', (p, x) => {
      if (!Array.isArray(p)) return p;
      return VectorizedMath.map(x, (xv) => {
        let acc = 0;
        for (let i = 0; i < p.length; i++) {
          acc = acc * xv + p[i];
        }
        return acc;
      });
    });

    this.variables.set('fft', (s, n) => VectorizedMath.fft(s, n));
    this.variables.set('fftshift', (s) => VectorizedMath.fftshift(s));
    this.builtinKeys = new Set(this.variables.keys());
    this.builtinKeys.add('end');
  }

  ensureCurrentSubplot() {
    if (!this.figure.currentSubplot) {
      this.figure.currentSubplot = this.createDefaultSubplot(
        this.subplotGrid.rows,
        this.subplotGrid.cols,
        1
      );
    }
  }

  saveSubplot() {
    const cur = this.figure.currentSubplot;
    if (!cur) return;

    const hasContent = cur.series.length > 0 || Boolean(cur.title) || Boolean(cur.xlabel) || Boolean(cur.ylabel);
    if (!hasContent && this.figure.subplots.length > 0) {
      return;
    }

    const idx = this.figure.subplots.findIndex(
      (sp) => sp.index === cur.index && sp.rows === cur.rows && sp.cols === cur.cols
    );
    if (idx >= 0) {
      this.figure.subplots[idx] = cur;
    } else if (
      this.figure.subplots.length === 1 &&
      this.figure.subplots[0].series.length === 0 &&
      !this.figure.subplots[0].title
    ) {
      this.figure.subplots[0] = cur;
    } else {
      this.figure.subplots.push(cur);
    }
  }

  setSubplot(rows, cols, index) {
    this.saveSubplot();
    this.subplotGrid = { rows, cols };
    const existing = this.figure.subplots.find(
      (sp) => sp.rows === rows && sp.cols === cols && sp.index === index
    );
    if (existing) {
      this.figure.currentSubplot = existing;
    } else {
      this.figure.currentSubplot = this.createDefaultSubplot(rows, cols, index);
    }
    this.hold = false;
    this.colorCounter = 0;
  }
}

// ============================================================================
// 6. Script Preprocessing & Statement Execution
// ============================================================================

export function runCodePlotScript(rawCode, language = 'auto') {
  const lang = language === 'auto' ? detectCodeLanguage(rawCode) : language;
  const env = new ScriptEnvironment(lang);

  // Join MATLAB line continuations (...)
  const joinedCode = rawCode.replace(/\.\.\.\s*\r?\n/g, ' ');
  const rawLines = joinedCode.split(/\r?\n/);
  const cleanedStatements = [];

  for (const rawLine of rawLines) {
    let line = stripInlineComment(rawLine, lang).trim();
    if (!line) continue;

    if (lang === 'python' && (line.startsWith('import ') || line.startsWith('from '))) {
      continue;
    }

    const stmts = splitStatements(line);
    for (const st of stmts) {
      const trimmed = st.trim();
      if (trimmed) cleanedStatements.push(trimmed);
    }
  }

  // Execute statements (isolating errors per statement so one unsupported call never kills the rest of the script!)
  for (let i = 0; i < cleanedStatements.length; i++) {
    const stmt = cleanedStatements[i];
    try {
      i = executeBlockOrStatement(cleanedStatements, i, env, lang);
    } catch (err) {
      env.logs.push(`⚠️ Line notice (${stmt.slice(0, 40)}): ${err.message}`);
    }
  }

  env.saveSubplot();

  if (env.figure.subplots.length > 1) {
    const withContent = env.figure.subplots.filter(
      (sp) => sp.series.length > 0 || sp.title || sp.xlabel || sp.ylabel
    );
    if (withContent.length > 0) {
      env.figure.subplots = withContent;
    }
  }

  // Sort subplots by index so subplot(3,1,1), (3,1,2), (3,1,3) always appear in order
  env.figure.subplots.sort((a, b) => a.index - b.index);

  // Collect workspace variable summaries
  const workspaceVars = [];
  for (const [name, val] of env.variables.entries()) {
    if (env.builtinKeys && env.builtinKeys.has(name)) continue;
    if (typeof val === 'function') {
      workspaceVars.push({
        name,
        type: 'function_handle',
        size: '1×1',
        min: '@(...)',
        max: '@(...)',
      });
      continue;
    }
    let type = typeof val;
    let size = '1×1';
    let min = val;
    let max = val;

    if (Array.isArray(val)) {
      type = VectorizedMath.is2D(val) ? 'matrix' : 'vector';
      size = VectorizedMath.is2D(val)
        ? `${val.length}×${val[0] ? val[0].length : 0}`
        : `1×${val.length}`;
      min = VectorizedMath.min(val);
      max = VectorizedMath.max(val);
    }

    workspaceVars.push({
      name,
      type,
      size,
      min: typeof min === 'number' && Number.isFinite(min) ? Number(min.toFixed(4)) : String(min),
      max: typeof max === 'number' && Number.isFinite(max) ? Number(max.toFixed(4)) : String(max),
    });
  }

  return {
    language: lang,
    figure: env.figure,
    logs: env.logs,
    variables: workspaceVars,
  };
}

function stripInlineComment(line, lang) {
  let inSingle = false;
  let inDouble = false;
  const commentChar = lang === 'matlab' ? '%' : '#';

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === commentChar && !inSingle && !inDouble) {
      return line.slice(0, i);
    }
  }
  return line;
}

function splitStatements(line) {
  const stmts = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let bracketDepth = 0;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
    else if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
    else if ((char === '[' || char === '(' || char === '{') && !inSingleQuote && !inDoubleQuote) {
      bracketDepth++;
    } else if ((char === ']' || char === ')' || char === '}') && !inSingleQuote && !inDoubleQuote) {
      bracketDepth--;
    } else if (char === ';' && bracketDepth === 0 && !inSingleQuote && !inDoubleQuote) {
      stmts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current) stmts.push(current);
  return stmts;
}

function executeBlockOrStatement(stmts, idx, env, lang) {
  const stmt = stmts[idx];

  // Handle simple MATLAB `for var = rangeExpr ... end` loop
  const matlabFor = stmt.match(/^for\s+([a-zA-Z_]\w*)\s*=\s*(.+)$/);
  if (matlabFor) {
    const loopVar = matlabFor[1];
    const rangeVals = evaluateExpr(matlabFor[2], env);
    const bodyStmts = [];
    let j = idx + 1;
    let depth = 1;
    while (j < stmts.length && depth > 0) {
      if (/^(for|if|while)\b/.test(stmts[j])) depth++;
      else if (/^end\b/.test(stmts[j])) {
        depth--;
        if (depth === 0) break;
      }
      bodyStmts.push(stmts[j]);
      j++;
    }
    const iterArr = Array.isArray(rangeVals) ? rangeVals : [rangeVals];
    for (const val of iterArr.slice(0, 500)) {
      env.variables.set(loopVar, val);
      for (const bStmt of bodyStmts) {
        executeStatement(bStmt, env, lang);
      }
    }
    return j;
  }

  executeStatement(stmt, env, lang);
  return idx;
}

function executeStatement(stmt, env, _lang) {
  const s = stmt.trim();
  if (!s) return;

  // Ignore MATLAB workspace house-keeping commands
  if (/^(clear(\s+all|\s+vars|\s+classes)?|clc|close(\s+all)?| clf|shg|drawnow|end|plt\.show\s*\(.*\)|plt\.tight_layout\s*\(.*\)|fig\.tight_layout\s*\(.*\))$/i.test(s)) {
    return;
  }

  // Handle disp / fprintf / print
  if (/^(disp|print|fprintf)\s*\((.*)\)$/i.test(s)) {
    const match = s.match(/^(disp|print|fprintf)\s*\((.*)\)$/i);
    const args = parseArguments(match[2], env);
    if (args.length > 0) {
      env.logs.push(args.map(formatDisplayOutput).join(' '));
    }
    return;
  }

  // Handle hold on / hold off
  if (/^hold\s*(on|off|\(\s*['"]?(on|off|true|false)['"]?\s*\))?$/i.test(s)) {
    const lower = s.toLowerCase();
    env.hold = !lower.includes('off') && !lower.includes('false');
    return;
  }

  // Handle grid on / grid off / grid minor / plt.grid(...)
  if (/^(grid(\s+(on|off|minor))?|(plt\.|ax(\[[^\]]+\])?\.)grid\s*\(.*\))$/i.test(s)) {
    env.ensureCurrentSubplot();
    const lower = s.toLowerCase();
    env.figure.currentSubplot.grid = !lower.includes('off') && !lower.includes('false');
    return;
  }

  // Handle box on / box off / axis tight / axis equal / axis([xmin xmax ymin ymax])
  if (/^box\s+(on|off)$/i.test(s)) return;
  if (/^(axis|plt\.axis)\s*(\((.*)\)|\s+\w+)$/i.test(s)) {
    env.ensureCurrentSubplot();
    const m = s.match(/\((.*)\)/);
    if (m) {
      const args = parseArguments(m[1], env);
      if (Array.isArray(args[0]) && args[0].length >= 4) {
        env.figure.currentSubplot.xlim = [args[0][0], args[0][1]];
        env.figure.currentSubplot.ylim = [args[0][2], args[0][3]];
      }
    }
    return;
  }

  // Handle figure(...) / plt.figure(...)
  if (/^(figure(\s*\(.*\))?|plt\.figure\s*\(.*\))$/i.test(s)) {
    env.saveSubplot();
    return;
  }

  // Handle legend / legend(...) / plt.legend(...) / ax.legend(...)
  if (/^(legend(\s+on|\s+show)?|(legend|(plt\.|ax(\[[^\]]+\])?\.)legend)\s*\((.*)\))$/i.test(s)) {
    handleLegendCall(s, env);
    return;
  }

  // Handle title / xlabel / ylabel / zlabel / sgtitle / suptitle
  if (/^(title|xlabel|ylabel|zlabel|sgtitle|suptitle|(plt\.|fig\.|ax(\[[^\]]+\])?\.)(set_)?(title|xlabel|ylabel|zlabel|suptitle))\s*\((.*)\)$/i.test(s)) {
    handleLabels(s, env);
    return;
  }

  // Handle xlim / ylim
  if (/^(xlim|ylim|(plt\.|ax(\[[^\]]+\])?\.)(set_)?(xlim|ylim))\s*\((.*)\)$/i.test(s)) {
    handleLimits(s, env);
    return;
  }

  // Handle subplot / plt.subplot / fig, ax = plt.subplots(...)
  if (/^(subplot\s*\(.*\)|plt\.subplot\s*\(.*\)|([a-zA-Z0-9_,\s]+\s*=\s*)?plt\.subplots\s*\(.*\))$/i.test(s)) {
    handleSubplotCall(s, env);
    return;
  }

  // Handle plotting commands
  if (isPlotCommand(s)) {
    handlePlotCall(s, env);
    return;
  }

  // Handle variable assignments: make sure `=` is not part of `>=`, `<=`, `==`, `~=`, `!=`
  const assignIdx = findTopLevelAssignmentIndex(s);
  if (assignIdx > 0) {
    handleAssignment(s, assignIdx, env);
    return;
  }

  // Plain expression evaluation
  const res = evaluateExpr(s, env);
  if (res !== undefined) {
    env.variables.set('ans', res);
  }
}

function findTopLevelAssignmentIndex(s) {
  let inSingle = false;
  let inDouble = false;
  let depth = 0;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if (ch === '=' && depth === 0) {
        const prev = s[i - 1] || '';
        const next = s[i + 1] || '';
        if (prev === '>' || prev === '<' || prev === '=' || prev === '~' || prev === '!' || next === '=') {
          continue;
        }
        return i;
      }
    }
  }
  return -1;
}

function handleLegendCall(s, env) {
  env.ensureCurrentSubplot();
  const sp = env.figure.currentSubplot;
  sp.showLegend = true;
  const match = s.match(/\((.*)\)$/);
  if (!match) return;
  const rawArgs = parseArguments(match[1], env);
  if (rawArgs.length === 0) return;

  // Extract string labels (ignoring 'Location', 'best', etc.)
  const labels = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg && typeof arg === 'object' && arg.__isKwArg) continue;
    if (typeof arg === 'string') {
      const lower = arg.toLowerCase();
      if (lower === 'off' || lower === 'hide') {
        sp.showLegend = false;
        return;
      }
      if (['location', 'orientation', 'box', 'interpreter', 'fontsize', 'show'].includes(lower)) {
        i++; // skip option value
        continue;
      }
      labels.push(arg);
    } else if (Array.isArray(arg)) {
      for (const item of arg) {
        if (typeof item === 'string') labels.push(item);
      }
    }
  }

  for (let i = 0; i < Math.min(labels.length, sp.series.length); i++) {
    sp.series[i].label = labels[i];
    sp.series[i].hasExplicitLabel = true;
  }
}

function handleLabels(s, env) {
  env.ensureCurrentSubplot();
  const match = s.match(/^([a-zA-Z0-9_.[\],]+)\s*\((.*)\)$/);
  if (!match) return;
  const fn = match[1].toLowerCase();
  const rawArgs = parseArguments(match[2], env);
  const text = rawArgs[0] !== undefined ? String(rawArgs[0]) : '';

  if (fn.includes('sgtitle') || fn.includes('suptitle')) {
    env.figure.title = text;
  } else if (fn.includes('title')) {
    env.figure.currentSubplot.title = text;
  } else if (fn.includes('xlabel')) {
    env.figure.currentSubplot.xlabel = text;
  } else if (fn.includes('ylabel')) {
    env.figure.currentSubplot.ylabel = text;
  } else if (fn.includes('zlabel')) {
    env.figure.currentSubplot.zlabel = text;
  }
}

function handleLimits(s, env) {
  env.ensureCurrentSubplot();
  const match = s.match(/^([a-zA-Z0-9_.[\],]+)\s*\((.*)\)$/);
  if (!match) return;
  const fn = match[1].toLowerCase();
  const rawArgs = parseArguments(match[2], env);

  let min = null;
  let max = null;
  if (Array.isArray(rawArgs[0]) && rawArgs[0].length >= 2) {
    min = Number(rawArgs[0][0]);
    max = Number(rawArgs[0][1]);
  } else if (rawArgs.length >= 2) {
    min = Number(rawArgs[0]);
    max = Number(rawArgs[1]);
  }

  if (Number.isFinite(min) && Number.isFinite(max) && min < max) {
    if (fn.includes('xlim')) {
      env.figure.currentSubplot.xlim = [min, max];
    } else if (fn.includes('ylim')) {
      env.figure.currentSubplot.ylim = [min, max];
    }
  }
}

function handleSubplotCall(s, env) {
  const innerMatch = s.match(/\((.*)\)/);
  if (!innerMatch) return;
  const rawArgs = parseArguments(innerMatch[1], env);

  let rows = 1;
  let cols = 1;
  let idx = 1;
  if (rawArgs.length === 1 && typeof rawArgs[0] === 'number' && rawArgs[0] >= 111 && rawArgs[0] <= 999) {
    const str = String(Math.round(rawArgs[0]));
    rows = parseInt(str[0], 10);
    cols = parseInt(str[1], 10);
    idx = parseInt(str[2], 10);
  } else if (rawArgs.length >= 2) {
    rows = Math.max(1, Math.round(Number(rawArgs[0]) || 1));
    cols = Math.max(1, Math.round(Number(rawArgs[1]) || 1));
    idx = rawArgs[2] !== undefined ? Math.max(1, Math.round(Number(rawArgs[2]) || 1)) : 1;
  }

  env.setSubplot(rows, cols, idx);
}

function isPlotCommand(s) {
  return /^(plot|semilogx|semilogy|loglog|polarplot|polar|stem|stairs|step|scatter|bar|barh|histogram|hist|quiver|fill_between|area|fill|surf|mesh|plot3|contour|contourf|imagesc|imshow|yline|xline|fplot|(plt\.|ax(\[[^\]]+\])?\.)(plot|semilogx|semilogy|loglog|polar|stem|step|scatter|bar|barh|hist|quiver|fill_between|fill|plot_surface|plot_wireframe|plot3D|contour|contourf|imshow|axhline|axvline))\s*\(/i.test(
    s
  );
}

function handlePlotCall(s, env) {
  // Check if Python indexed axes: axes[0, 1].plot(...) or ax[1].plot(...)
  const axIdxMatch = s.match(/^ax(?:es)?\[([^\]]+)\]\.(\w+)\s*\((.*)\)$/i);
  if (axIdxMatch) {
    const idxParts = axIdxMatch[1].split(',').map((p) => parseInt(p.trim(), 10));
    const { rows, cols } = env.subplotGrid;
    let targetIdx = 1;
    if (idxParts.length === 2 && !isNaN(idxParts[0]) && !isNaN(idxParts[1])) {
      targetIdx = idxParts[0] * cols + idxParts[1] + 1;
    } else if (!isNaN(idxParts[0])) {
      targetIdx = idxParts[0] + 1;
    }
    env.setSubplot(rows, cols, targetIdx);
    env.hold = true;
  }

  env.ensureCurrentSubplot();
  const sp = env.figure.currentSubplot;

  if (!env.hold && sp.series.length > 0 && env.lang === 'matlab') {
    sp.series = [];
    env.colorCounter = 0;
  }

  const match = s.match(/^([a-zA-Z0-9_.[\],\s]+?)\s*\((.*)\)$/);
  if (!match) return;

  const cmd = match[1]
    .trim()
    .toLowerCase()
    .replace(/^(plt\.|ax(\[[^\]]+\])?\.)/, '');
  const rawArgs = parseArguments(match[2], env);

  let type = 'line';
  if (cmd === 'semilogx') {
    sp.xscale = 'log';
    type = 'line';
  } else if (cmd === 'semilogy') {
    sp.yscale = 'log';
    type = 'line';
  } else if (cmd === 'loglog') {
    sp.xscale = 'log';
    sp.yscale = 'log';
    type = 'line';
  } else if (cmd === 'polarplot' || cmd === 'polar') {
    sp.isPolar = true;
    type = 'polar';
  } else if (cmd === 'stem') {
    type = 'stem';
  } else if (cmd === 'stairs' || cmd === 'step') {
    type = 'stairs';
  } else if (cmd === 'scatter') {
    type = 'scatter';
  } else if (cmd === 'bar' || cmd === 'barh') {
    type = cmd;
  } else if (cmd === 'histogram' || cmd === 'hist') {
    type = 'histogram';
  } else if (cmd === 'quiver') {
    type = 'quiver';
  } else if (cmd === 'fill_between' || cmd === 'area' || cmd === 'fill') {
    type = 'area';
  } else if (cmd === 'surf' || cmd === 'plot_surface') {
    sp.is3D = true;
    type = 'surf';
  } else if (cmd === 'mesh' || cmd === 'plot_wireframe') {
    sp.is3D = true;
    type = 'mesh';
  } else if (cmd === 'plot3' || cmd === 'plot3d') {
    sp.is3D = true;
    type = 'plot3';
  } else if (cmd === 'contour' || cmd === 'contourf') {
    type = cmd;
  } else if (cmd === 'imagesc' || cmd === 'imshow') {
    type = 'heatmap';
  } else if (cmd === 'yline' || cmd === 'axhline') {
    type = 'yline';
  } else if (cmd === 'xline' || cmd === 'axvline') {
    type = 'xline';
  } else if (cmd === 'fplot') {
    type = 'fplot';
  }

  const seriesItems = parseSeriesData(type, rawArgs, env);
  for (const item of seriesItems) {
    if (item) sp.series.push(item);
  }
}

function parseSeriesData(type, rawArgs, env) {
  // Separate positional arguments from keyword / Name-Value pairs
  const positional = [];
  const options = {};

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg && typeof arg === 'object' && arg.__isKwArg) {
      options[arg.key.toLowerCase()] = arg.value;
      continue;
    }
    if (typeof arg === 'string') {
      const lower = arg.toLowerCase();
      if (
        [
          'linewidth', 'lw', 'color', 'c', 'displayname', 'label',
          'linestyle', 'ls', 'marker', 'markersize', 'ms', 'alpha',
          'facecolor', 'edgecolor', 'bins',
        ].includes(lower) &&
        i + 1 < rawArgs.length
      ) {
        options[lower] = rawArgs[i + 1];
        i++;
        continue;
      }
    }
    positional.push(arg);
  }

  // Handle Horizontal / Vertical reference lines: yline(val, spec, label)
  if (type === 'yline' || type === 'xline') {
    const val = typeof positional[0] === 'number' ? positional[0] : 0;
    const spec = typeof positional[1] === 'string' ? parseMATLABLineSpec(positional[1], env.colorCounter) : null;
    const labelStr =
      options.displayname ||
      options.label ||
      (typeof positional[2] === 'string' ? positional[2] : `${type === 'yline' ? 'y' : 'x'} = ${val}`);
    return [
      {
        type,
        val,
        color: resolveColorValue(options.color || options.c, spec?.color || '#ec4899'),
        lineStyle: spec?.lineStyle || 'dashed',
        lineWidth: Number(options.linewidth || options.lw || 1.8),
        label: String(labelStr),
      },
    ];
  }

  // Handle fplot(@(x) ..., [xmin xmax])
  if (type === 'fplot') {
    const fn = positional[0];
    const range = Array.isArray(positional[1]) && positional[1].length >= 2 ? positional[1] : [-5, 5];
    if (typeof fn === 'function') {
      const x = VectorizedMath.linspace(range[0], range[1], 300);
      const y = fn(x);
      return parseSeriesData('line', [x, Array.isArray(y) ? y : x.map((xv) => fn(xv)), ...positional.slice(2)], env);
    }
    return [];
  }

  // Handle 3D surface / mesh / contour / heatmap
  if (['surf', 'mesh', 'contour', 'contourf', 'heatmap'].includes(type)) {
    let X = null;
    let Y = null;
    let Z = null;
    if (positional.length >= 3 && VectorizedMath.is2D(positional[2])) {
      X = positional[0];
      Y = positional[1];
      Z = positional[2];
    } else if (positional.length >= 1 && VectorizedMath.is2D(positional[0])) {
      Z = positional[0];
      const rows = Z.length;
      const cols = Z[0].length;
      const [gridX, gridY] = VectorizedMath.meshgrid(
        VectorizedMath.arange(0, cols),
        VectorizedMath.arange(0, rows)
      );
      X = gridX;
      Y = gridY;
    }
    if (!Z) return [];
    return [
      {
        type,
        x: X,
        y: Y,
        z: Z,
        colorMap: 'viridis',
        label: options.displayname || options.label || (type === 'surf' ? 'Surface' : type === 'mesh' ? 'Mesh' : 'Contour'),
      },
    ];
  }

  if (type === 'plot3') {
    const color = resolveColorValue(options.color || options.c, PALETTE[env.colorCounter++ % PALETTE.length]);
    return [
      {
        type: 'plot3',
        x: Array.isArray(positional[0]) ? positional[0] : [],
        y: Array.isArray(positional[1]) ? positional[1] : [],
        z: Array.isArray(positional[2]) ? positional[2] : [],
        color,
        lineWidth: Number(options.linewidth || options.lw || 2.5),
        label: String(options.displayname || options.label || '3D Trajectory'),
      },
    ];
  }

  // Handle Histogram binning right in the engine so x = binCenters and y = binCounts!
  if (type === 'histogram') {
    const rawData = Array.isArray(positional[0]) ? positional[0].flat().filter(Number.isFinite) : [];
    if (rawData.length === 0) return [];
    const numBins = Math.max(
      4,
      Math.min(100, Math.round(Number(options.bins || positional[1] || Math.ceil(Math.sqrt(rawData.length)))))
    );
    const minVal = VectorizedMath.min(rawData);
    const maxVal = VectorizedMath.max(rawData);
    const span = maxVal - minVal || 1;
    const binWidth = span / numBins;
    const counts = new Array(numBins).fill(0);
    const centers = new Array(numBins);

    for (let b = 0; b < numBins; b++) {
      centers[b] = minVal + (b + 0.5) * binWidth;
    }
    for (const v of rawData) {
      let b = Math.floor((v - minVal) / binWidth);
      if (b >= numBins) b = numBins - 1;
      if (b < 0) b = 0;
      counts[b]++;
    }

    const color = resolveColorValue(
      options.color || options.facecolor || options.c,
      PALETTE[env.colorCounter++ % PALETTE.length]
    );
    return [
      {
        type: 'bar',
        x: centers,
        y: counts,
        barWidthRatio: 0.92,
        color,
        lineWidth: 1,
        lineStyle: 'solid',
        marker: 'none',
        label: String(options.displayname || options.label || 'Histogram'),
      },
    ];
  }

  // Handle multi-triplet `plot(x1, y1, 'b-', x2, y2, 'r--')` or standard `plot(x, y, spec)`
  const results = [];
  let pIdx = 0;

  while (pIdx < positional.length) {
    let x = [];
    let y = [];
    let specStr = null;

    const first = positional[pIdx];
    const second = positional[pIdx + 1];
    const third = positional[pIdx + 2];

    if (second === undefined || typeof second === 'string') {
      // plot(y) or plot(y, 'r--')
      y = Array.isArray(first) ? first : [Number(first)];
      x = Array.from({ length: y.length }, (_, k) => k + 1);
      if (typeof second === 'string' && isLineSpecString(second)) {
        specStr = second;
        pIdx += 2;
      } else {
        pIdx += 1;
      }
    } else {
      // plot(x, y) or plot(x, y, 'r--')
      x = Array.isArray(first) ? first : [Number(first)];
      y = Array.isArray(second) ? second : [Number(second)];
      if (typeof third === 'string' && isLineSpecString(third)) {
        specStr = third;
        pIdx += 3;
      } else {
        pIdx += 2;
      }
    }

    const cIdx = env.colorCounter++;
    const parsedSpec = parseMATLABLineSpec(specStr, cIdx);
    const color = resolveColorValue(options.color || options.c, parsedSpec.color);
    let lineStyle = parsedSpec.lineStyle;
    if (options.linestyle || options.ls) {
      const ls = String(options.linestyle || options.ls);
      if (ls === '--' || ls === 'dashed') lineStyle = 'dashed';
      else if (ls === ':' || ls === 'dotted') lineStyle = 'dotted';
      else if (ls === '-.' || ls === 'dashdot') lineStyle = 'dashdot';
      else if (ls === 'none') lineStyle = 'none';
      else lineStyle = 'solid';
    }
    const marker = options.marker ? String(options.marker) : parsedSpec.marker;
    const lineWidth = Number(options.linewidth || options.lw || parsedSpec.lineWidth || 2);
    const hasExplicitLabel = Boolean(options.displayname || options.label);
    if (hasExplicitLabel && env.figure.currentSubplot) {
      env.figure.currentSubplot.showLegend = true;
    }
    const label = String(options.displayname || options.label || `Series ${cIdx + 1}`);

    // Ensure equal lengths and finite numbers
    const len = Math.min(x.length, y.length);
    if (len > 0) {
      results.push({
        type,
        x: x.slice(0, len),
        y: y.slice(0, len),
        color,
        lineWidth,
        lineStyle,
        marker,
        markerSize: Number(options.markersize || options.ms || parsedSpec.markerSize || 4.5),
        label,
        hasExplicitLabel,
      });
    }

    // Only `line` plots support multiple (x,y,spec) triplets in one call
    if (type !== 'line') break;
  }

  return results;
}

function handleAssignment(stmt, eqIdx, env) {
  const lhs = stmt.slice(0, eqIdx).trim();
  const rhs = stmt.slice(eqIdx + 1).trim();

  // Check for MATLAB `[X, Y] = meshgrid(...)` or Python `X, Y = np.meshgrid(...)`
  const bracketMatch = lhs.match(/^\[\s*([a-zA-Z0-9_,\s]+)\s*\]$/);
  const tupleMatch = !bracketMatch && lhs.includes(',') ? lhs.match(/^([a-zA-Z0-9_,\s]+)$/) : null;
  if (bracketMatch || tupleMatch) {
    const rawNames = (bracketMatch ? bracketMatch[1] : tupleMatch[1])
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    const val = evaluateExpr(rhs, env);
    if (Array.isArray(val)) {
      for (let i = 0; i < rawNames.length; i++) {
        if (rawNames[i] && val[i] !== undefined) {
          env.variables.set(rawNames[i], val[i]);
        }
      }
    }
    return;
  }

  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(lhs)) {
    const val = evaluateExpr(rhs, env);
    env.variables.set(lhs, val);
  }
}

function parseArguments(argsStr, env = null) {
  if (!argsStr || !argsStr.trim()) return [];
  const args = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let depth = 0;

  for (let i = 0; i < argsStr.length; i++) {
    const c = argsStr[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if ((c === '(' || c === '[' || c === '{') && !inSingle && !inDouble) depth++;
    else if ((c === ')' || c === ']' || c === '}') && !inSingle && !inDouble) depth--;
    else if (c === ',' && depth === 0 && !inSingle && !inDouble) {
      if (current.trim()) args.push(evaluateExpr(current.trim(), env));
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) {
    args.push(evaluateExpr(current.trim(), env));
  }
  return args;
}

function formatDisplayOutput(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (VectorizedMath.is2D(val)) {
    return `[Matrix ${val.length}×${val[0] ? val[0].length : 0}]`;
  }
  if (Array.isArray(val)) {
    if (val.length <= 10) {
      return `[${val.map((x) => (typeof x === 'number' && Number.isFinite(x) ? Number(x.toFixed(4)) : x)).join(', ')}]`;
    }
    return `[Vector 1×${val.length}: ${val.slice(0, 5).map((x) => (typeof x === 'number' && Number.isFinite(x) ? Number(x.toFixed(3)) : x)).join(', ')} ...]`;
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return String(Number(val.toFixed(5)));
  }
  return String(val);
}
