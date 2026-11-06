import { ComputeEngine } from '@cortex-js/compute-engine';

// Singleton ComputeEngine instance
const ce = new ComputeEngine();

// Built-in identifiers that should NOT be treated as user slider parameters
const BUILTIN_SYMBOLS = new Set([
  'x',
  'y',
  'r',
  't',
  'theta',
  '\\theta',
  'Theta',
  'Pi',
  'pi',
  '\\pi',
  'ExponentialE',
  'e',
  'ImaginaryUnit',
  'i',
  'Infinity',
  'ComplexInfinity',
  'NaN',
  'True',
  'False',
  'Nothing',
  // Standard functions
  'Sin',
  'Cos',
  'Tan',
  'Cot',
  'Sec',
  'Csc',
  'Arcsin',
  'Arccos',
  'Arctan',
  'Arctan2',
  'Sinh',
  'Cosh',
  'Tanh',
  'Exp',
  'Ln',
  'Log',
  'Lb',
  'Sqrt',
  'Root',
  'Abs',
  'Sign',
  'Floor',
  'Ceil',
  'Round',
  'Max',
  'Min',
  'Mod',
  'Gamma',
  'Factorial',
  'Binomial',
  'GCD',
  'LCM',
  // Structural operators
  'Add',
  'Subtract',
  'Multiply',
  'Divide',
  'Negate',
  'Power',
  'Square',
  'Equal',
  'NotEqual',
  'Less',
  'LessEqual',
  'Greater',
  'GreaterEqual',
  'Assign',
  'Delimiter',
  'Tuple',
  'Sequence',
  'List',
  'Half',
  'Rational',
  'Integrate',
  'D',
  'Derivative',
  'Sum',
  'Product',
  'Hold',
  'Error',
]);

/**
 * Clean and normalize LaTeX emitted by MathLive before passing to Compute Engine
 */
export function normalizeLatex(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim();
  // Normalize MathLive placeholders or empty braces
  s = s.replace(/\\placeholder\{[^}]*\}/g, '');
  s = s.replace(/\\exponentialE/g, 'e');
  s = s.replace(/\\imaginaryI/g, 'i');
  return s.trim();
}

/**
 * Recursively collect symbol names from a MathJSON expression
 */
export function extractSymbols(json, definedFunctions = new Set(), out = new Set()) {
  if (json === null || json === undefined) return out;
  if (typeof json === 'number') return out;
  if (typeof json === 'string') {
    // Strip surrounding quotes if string literal
    if (json.startsWith("'") && json.endsWith("'")) return out;
    if (!BUILTIN_SYMBOLS.has(json) && !definedFunctions.has(json)) {
      out.add(json);
    }
    return out;
  }
  if (Array.isArray(json)) {
    const [head, ...args] = json;
    // If head is a user-defined function or unknown identifier applied as a function
    if (typeof head === 'string' && head === 'Error') {
      return out;
    }
    for (const arg of args) {
      extractSymbols(arg, definedFunctions, out);
    }
    return out;
  }
  if (typeof json === 'object') {
    if (typeof json.sym === 'string') {
      if (!BUILTIN_SYMBOLS.has(json.sym) && !definedFunctions.has(json.sym)) {
        out.add(json.sym);
      }
    }
    if (Array.isArray(json.fn)) {
      extractSymbols(json.fn, definedFunctions, out);
    }
  }
  return out;
}

/**
 * Convert a MathJSON AST node directly into a fast JavaScript expression string
 * for 60fps graphing, falling back to ComputeEngine evaluation when symbolic constructs appear.
 */
function mathJsonToJsExpr(node, userFuncs = {}) {
  if (node === null || node === undefined) return 'NaN';
  if (typeof node === 'number') return String(node);
  if (typeof node === 'object' && !Array.isArray(node)) {
    if (typeof node.num === 'string') {
      const n = Number(node.num);
      return Number.isFinite(n) ? String(n) : 'NaN';
    }
    if (typeof node.sym === 'string') {
      return mathJsonToJsExpr(node.sym, userFuncs);
    }
    if (Array.isArray(node.fn)) {
      return mathJsonToJsExpr(node.fn, userFuncs);
    }
    return 'NaN';
  }
  if (typeof node === 'string') {
    switch (node) {
      case 'Pi':
      case 'pi':
      case '\\pi':
        return 'Math.PI';
      case 'ExponentialE':
      case 'e':
        return 'Math.E';
      case 'Half':
        return '0.5';
      case 'Infinity':
        return 'Infinity';
      case 'NaN':
        return 'NaN';
      case 'theta':
      case '\\theta':
      case 'Theta':
        return '(__scope.theta ?? __scope.x ?? 0)';
      case 'x':
        return '__x';
      case 'y':
        return '__y';
      case 't':
        return '__t';
      case 'r':
        return 'Math.hypot(__x, __y)';
      default: {
        // Safe variable lookup in scope
        const safeKey = JSON.stringify(node);
        return `(__scope[${safeKey}] ?? NaN)`;
      }
    }
  }

  if (!Array.isArray(node) || node.length === 0) return 'NaN';
  const [op, ...args] = node;
  const c = (a) => mathJsonToJsExpr(a, userFuncs);

  switch (op) {
    case 'Delimiter':
    case 'Hold':
      return args.length > 0 ? `(${c(args[0])})` : 'NaN';
    case 'Add':
      if (args.length === 0) return '0';
      return `(${args.map(c).join(' + ')})`;
    case 'Subtract':
      if (args.length === 1) return `(-(${c(args[0])}))`;
      return `(${c(args[0])} - ${c(args[1])})`;
    case 'Negate':
      return `(-(${c(args[0])}))`;
    case 'Multiply':
      if (args.length === 0) return '1';
      return `(${args.map(c).join(' * ')})`;
    case 'Divide':
    case 'Rational':
      return `((${c(args[0])}) / (${c(args[1])}))`;
    case 'Power': {
      // Handle fractional powers of negative numbers gracefully (e.g., x^(1/3))
      return `__pow(${c(args[0])}, ${c(args[1])})`;
    }
    case 'Square':
      return `((${c(args[0])}) * (${c(args[0])}))`;
    case 'Sqrt':
      return `Math.sqrt(${c(args[0])})`;
    case 'Root':
      return `__pow(${c(args[0])}, 1 / (${c(args[1])}))`;
    case 'Abs':
      return `Math.abs(${c(args[0])})`;
    case 'Sign':
      return `Math.sign(${c(args[0])})`;
    case 'Floor':
      return `Math.floor(${c(args[0])})`;
    case 'Ceil':
      return `Math.ceil(${c(args[0])})`;
    case 'Round':
      return `Math.round(${c(args[0])})`;
    case 'Sin':
      return `Math.sin(__ang(${c(args[0])}))`;
    case 'Cos':
      return `Math.cos(__ang(${c(args[0])}))`;
    case 'Tan':
      return `Math.tan(__ang(${c(args[0])}))`;
    case 'Cot':
      return `(1 / Math.tan(__ang(${c(args[0])})))`;
    case 'Sec':
      return `(1 / Math.cos(__ang(${c(args[0])})))`;
    case 'Csc':
      return `(1 / Math.sin(__ang(${c(args[0])})))`;
    case 'Arcsin':
      return `__invAng(Math.asin(${c(args[0])}))`;
    case 'Arccos':
      return `__invAng(Math.acos(${c(args[0])}))`;
    case 'Arctan':
      return `__invAng(Math.atan(${c(args[0])}))`;
    case 'Arctan2':
      return `__invAng(Math.atan2(${c(args[0])}, ${c(args[1])}))`;
    case 'Sinh':
      return `Math.sinh(${c(args[0])})`;
    case 'Cosh':
      return `Math.cosh(${c(args[0])})`;
    case 'Tanh':
      return `Math.tanh(${c(args[0])})`;
    case 'Exp':
      return `Math.exp(${c(args[0])})`;
    case 'Ln':
      return `Math.log(${c(args[0])})`;
    case 'Log':
      if (args.length === 2) {
        return `(Math.log(${c(args[0])}) / Math.log(${c(args[1])}))`;
      }
      return `Math.log10(${c(args[0])})`;
    case 'Lb':
      return `Math.log2(${c(args[0])})`;
    case 'Max':
      return `Math.max(${args.map(c).join(', ')})`;
    case 'Min':
      return `Math.min(${args.map(c).join(', ')})`;
    case 'Mod':
      return `(((${c(args[0])}) % (${c(args[1])}) + (${c(args[1])})) % (${c(args[1])}))`;
    case 'Factorial':
      return `__fact(${c(args[0])})`;
    case 'Gamma':
      return `__gamma(${c(args[0])})`;
    default: {
      // Check if op is a user-defined function like f(x) or g(x)
      if (typeof op === 'string' && userFuncs[op]) {
        const fnKey = JSON.stringify(op);
        return `__funcs[${fnKey}](${args.map(c).join(', ')})`;
      }
      // Check if Compute Engine parsed implicit multiplication like f(x) where f is a slider variable!
      if (typeof op === 'string' && args.length === 1 && !BUILTIN_SYMBOLS.has(op)) {
        const safeKey = JSON.stringify(op);
        return `(typeof __funcs[${safeKey}] === 'function' ? __funcs[${safeKey}](${c(args[0])}) : ((__scope[${safeKey}] ?? NaN) * (${c(args[0])})))`;
      }
      return 'NaN';
    }
  }
}

// Helper math runtime functions injected into compiled evaluators
function safePow(base, exp) {
  if (base >= 0 || Number.isInteger(exp)) {
    return Math.pow(base, exp);
  }
  // Check for odd-denominator rational powers like 1/3, 2/3, 1/5
  for (let q = 3; q <= 9; q += 2) {
    const p = Math.round(exp * q);
    if (Math.abs(exp - p / q) < 1e-7) {
      const root = -Math.pow(-base, 1 / q);
      return Math.pow(root, p);
    }
  }
  return NaN;
}

function lanczosGamma(z) {
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * lanczosGamma(1 - z));
  }
  z -= 1;
  const p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  let x = p[0];
  for (let i = 1; i < p.length; i++) {
    x += p[i] / (z + i);
  }
  const t = z + 7.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

function safeFactorial(n) {
  if (!Number.isFinite(n) || n < -0.5) return NaN;
  return lanczosGamma(n + 1);
}

/**
 * Compile a MathJSON AST node into a fast callable `(x, y, t, scope, funcs, degMode) => number`
 */
export function compileMathJson(jsonNode, userFuncs = {}) {
  const jsBody = mathJsonToJsExpr(jsonNode, userFuncs);
  try {
    const rawFn = new Function(
      '__x',
      '__y',
      '__t',
      '__scope',
      '__funcs',
      '__ang',
      '__invAng',
      '__pow',
      '__fact',
      '__gamma',
      `return (${jsBody});`
    );
    return (x = 0, y = 0, t = 0, scope = {}, funcs = {}, degreeMode = false) => {
      const ang = degreeMode ? (v) => (v * Math.PI) / 180 : (v) => v;
      const invAng = degreeMode ? (v) => (v * 180) / Math.PI : (v) => v;
      try {
        const res = rawFn(x, y, t, scope, funcs, ang, invAng, safePow, safeFactorial, lanczosGamma);
        return typeof res === 'number' ? res : NaN;
      } catch {
        return NaN;
      }
    };
  } catch {
    return () => NaN;
  }
}

/**
 * Check if a MathJSON tree references a specific variable symbol
 */
function usesSymbol(json, symName) {
  if (json === symName) return true;
  if (Array.isArray(json)) {
    return json.some((child, idx) => idx > 0 && usesSymbol(child, symName));
  }
  if (json && typeof json === 'object') {
    if (json.sym === symName) return true;
    if (Array.isArray(json.fn)) return usesSymbol(json.fn, symName);
  }
  return false;
}

/**
 * Unwrap Top-Level Delimiter or Hold nodes
 */
function unwrapNode(json) {
  let curr = json;
  while (Array.isArray(curr) && (curr[0] === 'Delimiter' || curr[0] === 'Hold') && curr.length >= 2) {
    curr = curr[1];
  }
  return curr;
}

/**
 * Main analysis pipeline for a list of expressions in the sidebar.
 * Resolves variable assignments, user functions (f(x) = ...), sliders, and classifies each expression.
 */
export function evaluateExpressionList(items, degreeMode = false) {
  const scope = { pi: Math.PI, e: Math.E };
  const userFuncs = {};
  const definedFuncNames = new Set();

  // Pass 1: Gather slider items and explicit constant assignments (`a = 2`)
  for (const item of items) {
    if (item.type === 'slider' && item.varName) {
      scope[item.varName] = Number(item.value ?? 1);
    }
  }

  const parsedItems = items.map((item) => {
    if (item.type === 'note' || item.type === 'table') {
      return { item, rawLatex: '', json: null };
    }
    const clean = normalizeLatex(item.latex || '');
    if (!clean) {
      return { item, rawLatex: '', json: null };
    }

    // Handle derivative notation d/dx (...) or f'(x) shorthand
    let boxed = null;
    let json = null;
    try {
      boxed = ce.parse(clean);
      json = unwrapNode(boxed.json);
    } catch {
      json = null;
    }
    return { item, rawLatex: clean, boxed, json };
  });

  // Pass 2: Extract constant assignments (`a = 3.5`) and function definitions (`f(x) = x^2`)
  for (const entry of parsedItems) {
    const { item, json } = entry;
    if (!json || !Array.isArray(json)) continue;
    const [head, lhs, rhs] = json;
    if (head === 'Equal' || head === 'Assign') {
      // Variable assignment: `a = 5` where LHS is a single symbol not in {x, y, r}
      if (
        typeof lhs === 'string' &&
        !['x', 'y', 'r', 't'].includes(lhs) &&
        !usesSymbol(rhs, 'x') &&
        !usesSymbol(rhs, 'y') &&
        !usesSymbol(rhs, 't') &&
        !usesSymbol(rhs, 'theta') &&
        !usesSymbol(rhs, '\\theta')
      ) {
        const fn = compileMathJson(rhs, userFuncs);
        const val = fn(0, 0, 0, scope, userFuncs, degreeMode);
        if (Number.isFinite(val)) {
          // If the item has a slider value override, keep slider value synced
          scope[lhs] = item.sliderActive && Number.isFinite(Number(item.sliderValue))
            ? Number(item.sliderValue)
            : val;
          entry.assignedVar = lhs;
          entry.assignedVal = scope[lhs];
        }
      }
      // Function definition: `f(x) = ...` where Compute Engine parses LHS as `['f', 'x']` or `['Multiply', 'f', 'x']`
      if (Array.isArray(lhs)) {
        let fnName = null;
        let paramName = null;
        if (typeof lhs[0] === 'string' && lhs.length === 2 && typeof lhs[1] === 'string' && !BUILTIN_SYMBOLS.has(lhs[0])) {
          fnName = lhs[0];
          paramName = lhs[1];
        } else if (
          lhs[0] === 'Multiply' &&
          lhs.length === 3 &&
          typeof lhs[1] === 'string' &&
          !BUILTIN_SYMBOLS.has(lhs[1]) &&
          (lhs[2] === 'x' || (Array.isArray(lhs[2]) && lhs[2][0] === 'Delimiter' && lhs[2][1] === 'x'))
        ) {
          fnName = lhs[1];
          paramName = 'x';
        }
        if (fnName && paramName) {
          definedFuncNames.add(fnName);
          const compiledRhs = compileMathJson(rhs, userFuncs);
          userFuncs[fnName] = (argVal) => {
            const localScope = { ...scope, [paramName]: argVal };
            return compiledRhs(argVal, 0, argVal, localScope, userFuncs, degreeMode);
          };
          entry.definedFunc = { fnName, paramName, rhs };
        }
      }
    }
  }

  // Pass 3: Classify each item and produce evaluators + missing slider suggestions
  return parsedItems.map((entry) => {
    const { item, rawLatex, boxed, json } = entry;
    if (item.type === 'note') {
      return { id: item.id, kind: 'note' };
    }
    if (item.type === 'table') {
      return { id: item.id, kind: 'table', scope, userFuncs };
    }
    if (!rawLatex || !json) {
      return { id: item.id, kind: 'empty', missingVars: [] };
    }

    // Check for syntax errors
    if (Array.isArray(json) && json[0] === 'Error') {
      return {
        id: item.id,
        kind: 'error',
        error: 'Incomplete or invalid math expression',
        missingVars: [],
      };
    }

    // Gather all non-builtin symbols used
    const allSyms = extractSymbols(json, definedFuncNames);
    if (entry.assignedVar) {
      allSyms.delete(entry.assignedVar);
    }
    const missingVars = [...allSyms].filter((s) => !(s in scope));

    // 1. Variable assignment / Slider row (`a = 2`)
    if (entry.assignedVar) {
      return {
        id: item.id,
        kind: 'assignment',
        varName: entry.assignedVar,
        value: entry.assignedVal,
        missingVars,
      };
    }

    // 2. Function definition (`f(x) = ...`) -> also plot as explicit curve in x!
    if (entry.definedFunc) {
      const { fnName, rhs } = entry.definedFunc;
      const fn = compileMathJson(rhs, userFuncs);
      return {
        id: item.id,
        kind: 'explicit',
        fnName,
        evalX: (x) => fn(x, 0, x, scope, userFuncs, degreeMode),
        symbolicLatex: trySymbolicSimplify(boxed),
        missingVars,
      };
    }

    // 3. Point or Parametric Tuple: `(x0, y0)` or `(x(t), y(t))`
    if (Array.isArray(json) && (json[0] === 'Tuple' || json[0] === 'Sequence' || json[0] === 'List')) {
      const elements = json.slice(1);
      if (elements.length === 2) {
        const [ex, ey] = elements;
        const hasT = usesSymbol(ex, 't') || usesSymbol(ey, 't');
        const fnX = compileMathJson(ex, userFuncs);
        const fnY = compileMathJson(ey, userFuncs);
        if (hasT) {
          return {
            id: item.id,
            kind: 'parametric',
            evalT: (t) => [
              fnX(t, 0, t, scope, userFuncs, degreeMode),
              fnY(t, 0, t, scope, userFuncs, degreeMode),
            ],
            missingVars,
          };
        }
        const px = fnX(0, 0, 0, scope, userFuncs, degreeMode);
        const py = fnY(0, 0, 0, scope, userFuncs, degreeMode);
        return {
          id: item.id,
          kind: 'point',
          coords: [px, py],
          label: `(${formatNum(px)}, ${formatNum(py)})`,
          missingVars,
        };
      }
    }

    // 4. Inequalities: `y < f(x)`, `y <= f(x)`, `y > f(x)`, `y >= f(x)`
    if (
      Array.isArray(json) &&
      ['Less', 'LessEqual', 'Greater', 'GreaterEqual'].includes(json[0]) &&
      json.length === 3
    ) {
      const [op, lhs, rhs] = json;
      if (lhs === 'y' && !usesSymbol(rhs, 'y')) {
        const fn = compileMathJson(rhs, userFuncs);
        return {
          id: item.id,
          kind: 'inequality',
          operator: op, // Less, LessEqual, Greater, GreaterEqual
          strict: op === 'Less' || op === 'Greater',
          above: op === 'Greater' || op === 'GreaterEqual',
          evalX: (x) => fn(x, 0, x, scope, userFuncs, degreeMode),
          missingVars,
        };
      }
      if (rhs === 'y' && !usesSymbol(lhs, 'y')) {
        const fn = compileMathJson(lhs, userFuncs);
        const flippedAbove = op === 'Less' || op === 'LessEqual';
        return {
          id: item.id,
          kind: 'inequality',
          operator: op,
          strict: op === 'Less' || op === 'Greater',
          above: flippedAbove,
          evalX: (x) => fn(x, 0, x, scope, userFuncs, degreeMode),
          missingVars,
        };
      }
    }

    // 5. Equations (`LHS = RHS`)
    if (Array.isArray(json) && (json[0] === 'Equal' || json[0] === 'Assign') && json.length === 3) {
      const [, lhs, rhs] = json;

      // 5a. Polar curve: `r = f(\theta)`
      if (lhs === 'r' && !usesSymbol(rhs, 'r')) {
        const fn = compileMathJson(rhs, userFuncs);
        return {
          id: item.id,
          kind: 'polar',
          evalTheta: (theta) => fn(theta, 0, theta, { ...scope, theta }, userFuncs, degreeMode),
          missingVars,
        };
      }

      // 5b. Explicit `y = f(x)`
      if (lhs === 'y' && !usesSymbol(rhs, 'y')) {
        const fn = compileMathJson(rhs, userFuncs);
        return {
          id: item.id,
          kind: 'explicit',
          evalX: (x) => fn(x, 0, x, scope, userFuncs, degreeMode),
          symbolicLatex: trySymbolicSimplify(boxed),
          missingVars,
        };
      }
      if (rhs === 'y' && !usesSymbol(lhs, 'y')) {
        const fn = compileMathJson(lhs, userFuncs);
        return {
          id: item.id,
          kind: 'explicit',
          evalX: (x) => fn(x, 0, x, scope, userFuncs, degreeMode),
          missingVars,
        };
      }

      // 5c. Vertical line `x = c` or horizontal curve `x = g(y)`
      if (lhs === 'x' && !usesSymbol(rhs, 'x')) {
        const fn = compileMathJson(rhs, userFuncs);
        return {
          id: item.id,
          kind: 'explicit_y',
          evalY: (y) => fn(0, y, y, scope, userFuncs, degreeMode),
          missingVars,
        };
      }

      // 5d. General Implicit Equation `F(x, y) = LHS - RHS = 0`
      const fnL = compileMathJson(lhs, userFuncs);
      const fnR = compileMathJson(rhs, userFuncs);
      return {
        id: item.id,
        kind: 'implicit',
        evalXY: (x, y) =>
          fnL(x, y, 0, scope, userFuncs, degreeMode) - fnR(x, y, 0, scope, userFuncs, degreeMode),
        missingVars,
      };
    }

    // 6. Slope / Vector field item mode
    if (item.type === 'slopefield') {
      const targetAst =
        Array.isArray(json) && (json[0] === 'Equal' || json[0] === 'Assign') ? json[2] : json;
      const fn = compileMathJson(targetAst, userFuncs);
      return {
        id: item.id,
        kind: 'slopefield',
        evalXY: (x, y) => fn(x, y, 0, scope, userFuncs, degreeMode),
        missingVars,
      };
    }

    // 7. Bare expression without `=`:
    //    - If it uses `theta` or `\theta`, treat as Polar `r = f(\theta)`
    //    - If it uses `x`, treat as Explicit `y = f(x)`
    //    - If it only uses constants/slider vars, evaluate numerically AND plot horizontal line if requested
    const hasTheta =
      usesSymbol(json, 'theta') || usesSymbol(json, '\\theta') || usesSymbol(json, 'Theta');
    if (hasTheta) {
      const fn = compileMathJson(json, userFuncs);
      return {
        id: item.id,
        kind: 'polar',
        evalTheta: (theta) => fn(theta, 0, theta, { ...scope, theta }, userFuncs, degreeMode),
        missingVars,
      };
    }

    const hasX = usesSymbol(json, 'x');
    const fn = compileMathJson(json, userFuncs);
    if (hasX) {
      return {
        id: item.id,
        kind: 'explicit',
        evalX: (x) => fn(x, 0, x, scope, userFuncs, degreeMode),
        symbolicLatex: trySymbolicSimplify(boxed),
        missingVars,
      };
    }

    // Constant / calculator evaluation (e.g., `2^{10} + \sqrt{144}` or `a^2 + b^2`)
    let numericVal = fn(0, 0, 0, scope, userFuncs, degreeMode);
    if (!Number.isFinite(numericVal) && boxed) {
      try {
        const nBox = boxed.N();
        const v = Number(nBox.valueOf());
        if (Number.isFinite(v)) numericVal = v;
      } catch {
        // ignore
      }
    }

    return {
      id: item.id,
      kind: 'constant',
      value: numericVal,
      formattedValue: Number.isFinite(numericVal) ? formatNum(numericVal) : null,
      evalX: () => numericVal,
      missingVars,
    };
  });
}

function trySymbolicSimplify(boxed) {
  if (!boxed) return null;
  try {
    const simplified = boxed.simplify();
    return simplified?.latex || null;
  } catch {
    return null;
  }
}

export function formatNum(n) {
  if (!Number.isFinite(n)) return 'undefined';
  if (Math.abs(n) < 1e-12) return '0';
  const rounded = Number(n.toPrecision(6));
  return String(rounded);
}

/**
 * Find key points of interest (roots, y-intercept, local extrema) for an explicit function y = f(x)
 * within [xmin, xmax] and [ymin, ymax].
 */
export function findExplicitCurvePOI(evalX, bbox, samples = 300) {
  const [xmin, ymax, xmax, ymin] = bbox;
  const points = [];
  const dx = (xmax - xmin) / samples;
  if (!(dx > 0)) return points;

  // 1. Y-intercept (x = 0)
  if (xmin <= 0 && xmax >= 0) {
    const y0 = evalX(0);
    if (Number.isFinite(y0) && y0 >= ymin && y0 <= ymax) {
      points.push({ x: 0, y: y0, type: 'y-intercept', label: `(0, ${formatNum(y0)})` });
    }
  }

  let prevX = xmin;
  let prevY = evalX(prevX);
  let prevSlope = null;

  for (let i = 1; i <= samples; i++) {
    const currX = xmin + i * dx;
    const currY = evalX(currX);

    if (Number.isFinite(prevY) && Number.isFinite(currY)) {
      // Check root (sign change across x-axis, avoiding vertical asymptotes)
      if ((prevY <= 0 && currY >= 0) || (prevY >= 0 && currY <= 0)) {
        if (Math.abs(currY - prevY) < (ymax - ymin) * 0.8) {
          const rx = bisectRoot(evalX, prevX, currX);
          const ry = evalX(rx);
          if (Math.abs(ry) < 1e-3 && !isDuplicatePoint(points, rx, 0, dx)) {
            points.push({ x: rx, y: 0, type: 'root', label: `(${formatNum(rx)}, 0)` });
          }
        }
      }

      // Check local extremum (slope sign change)
      const currSlope = currY - prevY;
      if (
        prevSlope !== null &&
        ((prevSlope > 1e-9 && currSlope < -1e-9) || (prevSlope < -1e-9 && currSlope > 1e-9))
      ) {
        if (Math.abs(currSlope - prevSlope) < (ymax - ymin) * 0.5) {
          const isMax = prevSlope > 0 && currSlope < 0;
          const ex = goldenSectionExtremum(evalX, prevX - dx, currX, isMax);
          const ey = evalX(ex);
          if (
            Number.isFinite(ey) &&
            ey >= ymin &&
            ey <= ymax &&
            !isDuplicatePoint(points, ex, ey, dx * 1.5)
          ) {
            points.push({
              x: ex,
              y: ey,
              type: isMax ? 'maximum' : 'minimum',
              label: `(${formatNum(ex)}, ${formatNum(ey)})`,
            });
          }
        }
      }
      prevSlope = currSlope;
    } else {
      prevSlope = null;
    }

    prevX = currX;
    prevY = currY;
  }

  if (points.length > 28) {
    const cx = 0.5 * (xmin + xmax);
    const cy = 0.5 * (ymin + ymax);
    points.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    return points.slice(0, 28);
  }

  return points;
}

/**
 * Find intersections between two explicit curves f(x) and g(x) in [xmin, xmax]
 */
export function findCurveIntersections(evalF, evalG, bbox, samples = 250) {
  const [xmin, ymax, xmax, ymin] = bbox;
  const points = [];
  const dx = (xmax - xmin) / samples;
  if (!(dx > 0)) return points;

  const diff = (x) => evalF(x) - evalG(x);
  let prevX = xmin;
  let prevD = diff(prevX);

  for (let i = 1; i <= samples; i++) {
    const currX = xmin + i * dx;
    const currD = diff(currX);
    if (
      Number.isFinite(prevD) &&
      Number.isFinite(currD) &&
      ((prevD <= 0 && currD >= 0) || (prevD >= 0 && currD <= 0))
    ) {
      if (Math.abs(currD - prevD) < (ymax - ymin) * 0.8) {
        const ix = bisectRoot(diff, prevX, currX);
        const iy = evalF(ix);
        if (
          Number.isFinite(iy) &&
          Math.abs(diff(ix)) < 1e-3 &&
          iy >= ymin &&
          iy <= ymax &&
          !isDuplicatePoint(points, ix, iy, dx)
        ) {
          points.push({
            x: ix,
            y: iy,
            type: 'intersection',
            label: `(${formatNum(ix)}, ${formatNum(iy)})`,
          });
        }
      }
    }
    prevX = currX;
    prevD = currD;
  }
  return points.slice(0, 16);
}

function isDuplicatePoint(points, x, y, tol) {
  return points.some((p) => Math.hypot(p.x - x, p.y - y) < tol);
}

function bisectRoot(fn, a, b, iterations = 22) {
  let fa = fn(a);
  let lo = a;
  let hi = b;
  for (let i = 0; i < iterations; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = fn(mid);
    if (!Number.isFinite(fm)) break;
    if (Math.abs(fm) < 1e-12) return mid;
    if ((fa <= 0 && fm <= 0) || (fa >= 0 && fm >= 0)) {
      lo = mid;
      fa = fm;
    } else {
      hi = mid;
    }
  }
  return 0.5 * (lo + hi);
}

function goldenSectionExtremum(fn, a, b, isMax, iterations = 20) {
  const phi = (Math.sqrt(5) - 1) / 2;
  let lo = a;
  let hi = b;
  let c = hi - phi * (hi - lo);
  let d = lo + phi * (hi - lo);
  for (let i = 0; i < iterations; i++) {
    const fc = fn(c);
    const fd = fn(d);
    if (isMax ? fc > fd : fc < fd) {
      hi = d;
    } else {
      lo = c;
    }
    c = hi - phi * (hi - lo);
    d = lo + phi * (hi - lo);
  }
  return 0.5 * (lo + hi);
}

/**
 * Marching squares contour extractor for implicit equations F(x, y) = 0
 * Returns arrays of X and Y coordinates separated by NaN for JSXGraph curve plotting.
 */
export function computeImplicitContour(evalXY, bbox, gridRes = 72) {
  const [xmin, ymax, xmax, ymin] = bbox;
  const dx = (xmax - xmin) / gridRes;
  const dy = (ymax - ymin) / gridRes;
  const xs = [];
  const ys = [];
  if (!(dx > 0 && dy > 0)) return { xs, ys };

  // Evaluate grid values
  const grid = Array.from({ length: gridRes + 1 }, () => new Float64Array(gridRes + 1));
  for (let i = 0; i <= gridRes; i++) {
    const x = xmin + i * dx;
    for (let j = 0; j <= gridRes; j++) {
      const y = ymin + j * dy;
      grid[i][j] = evalXY(x, y);
    }
  }

  const interp = (v1, v2) => {
    const denom = v1 - v2;
    if (Math.abs(denom) < 1e-12) return 0.5;
    return Math.max(0, Math.min(1, v1 / denom));
  };

  for (let i = 0; i < gridRes; i++) {
    const x0 = xmin + i * dx;
    const x1 = x0 + dx;
    for (let j = 0; j < gridRes; j++) {
      const y0 = ymin + j * dy;
      const y1 = y0 + dy;

      const v00 = grid[i][j];
      const v10 = grid[i + 1][j];
      const v11 = grid[i + 1][j + 1];
      const v01 = grid[i][j + 1];

      if (
        !Number.isFinite(v00) ||
        !Number.isFinite(v10) ||
        !Number.isFinite(v11) ||
        !Number.isFinite(v01)
      ) {
        continue;
      }

      let mask = 0;
      if (v00 > 0) mask |= 1;
      if (v10 > 0) mask |= 2;
      if (v11 > 0) mask |= 4;
      if (v01 > 0) mask |= 8;
      if (mask === 0 || mask === 15) continue;

      // Edge points: 0=bottom, 1=right, 2=top, 3=left
      const edgePt = (edge) => {
        switch (edge) {
          case 0:
            return [x0 + interp(v00, v10) * dx, y0];
          case 1:
            return [x1, y0 + interp(v10, v11) * dy];
          case 2:
            return [x0 + interp(v01, v11) * dx, y1];
          case 3:
            return [x0, y0 + interp(v00, v01) * dy];
          default:
            return [x0, y0];
        }
      };

      const segments = MARCHING_SQUARES_TABLE[mask];
      if (!segments) continue;
      for (let s = 0; s < segments.length; s += 2) {
        const [ax, ay] = edgePt(segments[s]);
        const [bx, by] = edgePt(segments[s + 1]);
        // Filter out discontinuous jump artifacts
        if (Math.abs( evalXY(0.5 * (ax + bx), 0.5 * (ay + by)) ) < Math.max(dx, dy) * 50) {
          xs.push(ax, bx, NaN);
          ys.push(ay, by, NaN);
        }
      }
    }
  }

  return { xs, ys };
}

const MARCHING_SQUARES_TABLE = {
  1: [3, 0],
  2: [0, 1],
  3: [3, 1],
  4: [1, 2],
  5: [3, 2, 0, 1],
  6: [0, 2],
  7: [3, 2],
  8: [2, 3],
  9: [0, 2],
  10: [0, 3, 1, 2],
  11: [1, 2],
  12: [1, 3],
  13: [0, 1],
  14: [3, 0],
};

