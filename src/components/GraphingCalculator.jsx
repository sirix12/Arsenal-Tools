import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import JXG from 'jsxgraph';
import 'mathlive';
import {
  evaluateExpressionList,
  findExplicitCurvePOI,
  findCurveIntersections,
  computeImplicitContour,
  formatNum,
} from '../utils/mathEngine';
import './GraphingCalculator.css';

/* ---------------------------------------------------------------
   Desmos-inspired Color Palette
--------------------------------------------------------------- */
const DESMOS_COLORS = [
  '#c74440', // Desmos Red
  '#2d70b3', // Desmos Blue
  '#388c46', // Desmos Green
  '#6042a6', // Desmos Purple
  '#fa7e19', // Desmos Orange
  '#06b6d4', // Arsenal Cyan
  '#ec4899', // Arsenal Pink
  '#eab308', // Gold
];

/* ---------------------------------------------------------------
   Pre-built Mathematical Study Presets
--------------------------------------------------------------- */
const GRAPH_PRESETS = [
  {
    id: 'wave-interference',
    name: 'Harmonic Wave Packet & Envelope',
    description: 'Carrier wave modulated by a low-frequency cosine envelope with animated phase slider',
    bbox: [-10, 6, 10, -6],
    items: [
      {
        id: 'p1-note',
        type: 'note',
        text: 'Press Play on slider "a" to animate the traveling wave packet inside its envelope.',
      },
      {
        id: 'p1-1',
        type: 'expression',
        latex: 'y = 3\\cos(0.35x)\\sin(2x - a)',
        color: '#2d70b3',
        visible: true,
        lineStyle: 'solid',
        lineWidth: 3,
      },
      {
        id: 'p1-2',
        type: 'expression',
        latex: 'y = 3\\cos(0.35x)',
        color: '#c74440',
        visible: true,
        lineStyle: 'dashed',
        lineWidth: 2,
      },
      {
        id: 'p1-3',
        type: 'expression',
        latex: 'y = -3\\cos(0.35x)',
        color: '#c74440',
        visible: true,
        lineStyle: 'dashed',
        lineWidth: 2,
      },
      {
        id: 'p1-4',
        type: 'expression',
        latex: 'a = 1.2',
        color: '#388c46',
        visible: true,
        sliderActive: true,
        sliderValue: 1.2,
        sliderMin: -6.28,
        sliderMax: 6.28,
        sliderStep: 0.05,
        playing: false,
      },
    ],
  },
  {
    id: 'calculus-tangent',
    name: 'Calculus: Tangent Line & Derivative',
    description: 'Explore f(x), its derivative curve, and a movable tangent line at x = a',
    bbox: [-6, 6, 6, -6],
    items: [
      {
        id: 'p2-note',
        type: 'note',
        text: 'Drag slider "a" to move the point of tangency (a, f(a)) along the cubic polynomial.',
      },
      {
        id: 'p2-1',
        type: 'expression',
        latex: 'f(x) = 0.25x^3 - 0.75x^2 - 1.5x + 2',
        color: '#c74440',
        visible: true,
        lineStyle: 'solid',
        lineWidth: 3,
      },
      {
        id: 'p2-2',
        type: 'expression',
        latex: 'g(x) = 0.75x^2 - 1.5x - 1.5',
        color: '#2d70b3',
        visible: true,
        lineStyle: 'dashed',
        lineWidth: 2,
      },
      {
        id: 'p2-3',
        type: 'expression',
        latex: 'a = 1.5',
        color: '#388c46',
        visible: true,
        sliderActive: true,
        sliderValue: 1.5,
        sliderMin: -4,
        sliderMax: 5,
        sliderStep: 0.05,
        playing: false,
      },
      {
        id: 'p2-4',
        type: 'expression',
        latex: 'y = g(a)(x - a) + f(a)',
        color: '#388c46',
        visible: true,
        lineStyle: 'solid',
        lineWidth: 2.5,
      },
      {
        id: 'p2-5',
        type: 'expression',
        latex: '(a, f(a))',
        color: '#fa7e19',
        visible: true,
      },
    ],
  },
  {
    id: 'conics-implicit',
    name: 'Implicit Curves & Conic Sections',
    description: 'Circle, Hyperbola, and Folium of Descartes plotted via implicit contour solver',
    bbox: [-8, 6, 8, -6],
    items: [
      {
        id: 'p3-note',
        type: 'note',
        text: 'Implicit equations F(x, y) = 0 rendered in real time using Marching Squares.',
      },
      {
        id: 'p3-1',
        type: 'expression',
        latex: 'x^2 + y^2 = r_0^2',
        color: '#2d70b3',
        visible: true,
        lineStyle: 'solid',
        lineWidth: 2.5,
      },
      {
        id: 'p3-2',
        type: 'expression',
        latex: '\\frac{x^2}{9} - \\frac{y^2}{4} = 1',
        color: '#c74440',
        visible: true,
        lineStyle: 'solid',
        lineWidth: 2.5,
      },
      {
        id: 'p3-3',
        type: 'expression',
        latex: 'x^3 + y^3 = 3 \\cdot a \\cdot x \\cdot y',
        color: '#6042a6',
        visible: true,
        lineStyle: 'solid',
        lineWidth: 2.5,
      },
      {
        id: 'p3-4',
        type: 'expression',
        latex: 'r_0 = 4',
        color: '#2d70b3',
        visible: true,
        sliderActive: true,
        sliderValue: 4,
        sliderMin: 0.5,
        sliderMax: 6,
        sliderStep: 0.1,
        playing: false,
      },
      {
        id: 'p3-5',
        type: 'expression',
        latex: 'a = 1.8',
        color: '#6042a6',
        visible: true,
        sliderActive: true,
        sliderValue: 1.8,
        sliderMin: -4,
        sliderMax: 4,
        sliderStep: 0.1,
        playing: false,
      },
    ],
  },
  {
    id: 'polar-gallery',
    name: 'Polar Rose & Cardioid Curves',
    description: 'Polar equations r = f(theta) with customizable petal frequency k',
    bbox: [-6, 5, 6, -5],
    polarGrid: true,
    items: [
      {
        id: 'p4-note',
        type: 'note',
        text: 'Polar curves use r and \\theta. Adjust k to change the number of rose petals.',
      },
      {
        id: 'p4-1',
        type: 'expression',
        latex: 'r = 4\\cos(k\\theta)',
        color: '#ec4899',
        visible: true,
        lineStyle: 'solid',
        lineWidth: 3,
      },
      {
        id: 'p4-2',
        type: 'expression',
        latex: 'r = 2 + 2\\sin(\\theta)',
        color: '#06b6d4',
        visible: true,
        lineStyle: 'solid',
        lineWidth: 2.5,
      },
      {
        id: 'p4-3',
        type: 'expression',
        latex: 'k = 5',
        color: '#ec4899',
        visible: true,
        sliderActive: true,
        sliderValue: 5,
        sliderMin: 1,
        sliderMax: 12,
        sliderStep: 1,
        playing: false,
      },
    ],
  },
  {
    id: 'parametric-lissajous',
    name: 'Parametric Lissajous & Spirograph',
    description: 'Parametric curves (x(t), y(t)) showing harmonic frequency ratios',
    bbox: [-7, 6, 7, -6],
    items: [
      {
        id: 'p5-note',
        type: 'note',
        text: 'Parametric tuples (x(t), y(t)) evaluated for t in [0, 2pi].',
      },
      {
        id: 'p5-1',
        type: 'expression',
        latex: '(5\\sin(a \\cdot t + d), 4\\sin(b \\cdot t))',
        color: '#6042a6',
        visible: true,
        lineStyle: 'solid',
        lineWidth: 3,
      },
      {
        id: 'p5-2',
        type: 'expression',
        latex: 'a = 3',
        color: '#2d70b3',
        visible: true,
        sliderActive: true,
        sliderValue: 3,
        sliderMin: 1,
        sliderMax: 8,
        sliderStep: 1,
        playing: false,
      },
      {
        id: 'p5-3',
        type: 'expression',
        latex: 'b = 4',
        color: '#388c46',
        visible: true,
        sliderActive: true,
        sliderValue: 4,
        sliderMin: 1,
        sliderMax: 8,
        sliderStep: 1,
        playing: false,
      },
      {
        id: 'p5-4',
        type: 'expression',
        latex: 'd = 0.8',
        color: '#fa7e19',
        visible: true,
        sliderActive: true,
        sliderValue: 0.8,
        sliderMin: 0,
        sliderMax: 6.28,
        sliderStep: 0.05,
        playing: false,
      },
    ],
  },
  {
    id: 'inequalities-region',
    name: 'Shaded Inequalities & Feasible Region',
    description: 'Strict and non-strict inequalities with automatic boundary styling and shading',
    bbox: [-8, 7, 8, -7],
    items: [
      {
        id: 'p6-note',
        type: 'note',
        text: 'Use <, <=, >, >= to shade regions. Strict inequalities (<, >) use dashed boundaries.',
      },
      {
        id: 'p6-1',
        type: 'expression',
        latex: 'y \\le 4 - 0.35x^2',
        color: '#2d70b3',
        visible: true,
        lineStyle: 'solid',
        lineWidth: 2.5,
      },
      {
        id: 'p6-2',
        type: 'expression',
        latex: 'y > 0.5x - 2',
        color: '#388c46',
        visible: true,
        lineStyle: 'dashed',
        lineWidth: 2.5,
      },
    ],
  },
  {
    id: 'slope-field-ode',
    name: 'Differential Equations & Slope Field',
    description: "Vector slope field dy/dx = x - y with a family of particular solution curves",
    bbox: [-6, 5, 6, -5],
    items: [
      {
        id: 'p7-note',
        type: 'note',
        text: "Slope field dy/dx = x - y alongside the general solution y = C*e^(-x) + x - 1.",
      },
      {
        id: 'p7-1',
        type: 'slopefield',
        latex: 'x - y',
        color: '#06b6d4',
        visible: true,
        lineStyle: 'solid',
        lineWidth: 1.5,
      },
      {
        id: 'p7-2',
        type: 'expression',
        latex: 'y = c \\cdot e^{-x} + x - 1',
        color: '#fa7e19',
        visible: true,
        lineStyle: 'solid',
        lineWidth: 3,
      },
      {
        id: 'p7-3',
        type: 'expression',
        latex: 'c = 2',
        color: '#fa7e19',
        visible: true,
        sliderActive: true,
        sliderValue: 2,
        sliderMin: -5,
        sliderMax: 5,
        sliderStep: 0.1,
        playing: false,
      },
    ],
  },
];

/* ---------------------------------------------------------------
   Virtual Math Keypad Layout
--------------------------------------------------------------- */
const KEYPAD_BUTTONS = [
  { label: 'x', insert: 'x', category: 'var' },
  { label: 'y', insert: 'y', category: 'var' },
  { label: 'a²', insert: '^2', category: 'op' },
  { label: 'aᵇ', insert: '^\\placeholder{}', category: 'op' },
  { label: '(', insert: '(', category: 'op' },
  { label: ')', insert: ')', category: 'op' },
  { label: '<', insert: '<', category: 'op' },
  { label: '>', insert: '>', category: 'op' },
  { label: '≤', insert: '\\le ', category: 'op' },
  { label: '≥', insert: '\\ge ', category: 'op' },
  { label: 'a/b', insert: '\\frac{#@}{\\placeholder{}}', category: 'op' },
  { label: '√', insert: '\\sqrt{\\placeholder{}}', category: 'fn' },
  { label: '|a|', insert: '\\left|\\placeholder{}\\right|', category: 'fn' },
  { label: 'π', insert: '\\pi', category: 'const' },
  { label: 'θ', insert: '\\theta', category: 'var' },
  { label: 'e', insert: 'e', category: 'const' },
  { label: 'sin', insert: '\\sin(\\placeholder{})', category: 'fn' },
  { label: 'cos', insert: '\\cos(\\placeholder{})', category: 'fn' },
  { label: 'tan', insert: '\\tan(\\placeholder{})', category: 'fn' },
  { label: 'ln', insert: '\\ln(\\placeholder{})', category: 'fn' },
  { label: 'log', insert: '\\log(\\placeholder{})', category: 'fn' },
  { label: 'r', insert: 'r', category: 'var' },
  { label: 't', insert: 't', category: 'var' },
  { label: '=', insert: '=', category: 'op' },
];

/* ---------------------------------------------------------------
   MathLive <math-field> Wrapper Component
--------------------------------------------------------------- */
function MathFieldEditor({ value, onChange, onEnter, onBackspaceEmpty, onFocusField, placeholder }) {
  const mfRef = useRef(null);
  const lastEmittedRef = useRef(value);

  useEffect(() => {
    const mf = mfRef.current;
    if (!mf) return;

    // Configure MathLive behavior
    mf.smartFence = true;
    mf.smartSuperscript = true;
    mf.mathVirtualKeyboardPolicy = 'manual';

    if (mf.value !== value) {
      mf.setValue(value || '', { silenceNotifications: true });
      lastEmittedRef.current = value || '';
    }
  }, [value]);

  useEffect(() => {
    const mf = mfRef.current;
    if (!mf) return;

    const handleInput = (e) => {
      const nextVal = e.target.value;
      lastEmittedRef.current = nextVal;
      onChange(nextVal);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (onEnter) onEnter();
      } else if (e.key === 'Backspace' && (!mf.value || mf.value.trim() === '')) {
        if (onBackspaceEmpty) {
          e.preventDefault();
          onBackspaceEmpty();
        }
      }
    };

    const handleFocus = () => {
      if (onFocusField) onFocusField(mf);
    };

    mf.addEventListener('input', handleInput);
    mf.addEventListener('keydown', handleKeyDown);
    mf.addEventListener('focus', handleFocus);

    return () => {
      mf.removeEventListener('input', handleInput);
      mf.removeEventListener('keydown', handleKeyDown);
      mf.removeEventListener('focus', handleFocus);
    };
  }, [onChange, onEnter, onBackspaceEmpty, onFocusField]);

  return (
    <math-field
      ref={mfRef}
      class="desmos-math-field"
      placeholder={placeholder || '\\text{Type an equation, e.g. } y=\\sin(x)'}
    />
  );
}

/* ---------------------------------------------------------------
   Main GraphingCalculator Component
--------------------------------------------------------------- */
export default function GraphingCalculator() {
  const [selectedPresetId, setSelectedPresetId] = useState(GRAPH_PRESETS[0].id);
  const [items, setItems] = useState(() => GRAPH_PRESETS[0].items);
  const [bbox, setBbox] = useState(GRAPH_PRESETS[0].bbox);
  const [degreeMode, setDegreeMode] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [polarGrid, setPolarGrid] = useState(false);
  const [showPOI, setShowPOI] = useState(true);
  const [lockAspect, setLockAspect] = useState(true);
  const [showKeypad, setShowKeypad] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [stylePopoverId, setStylePopoverId] = useState(null);
  const [cursorCoords, setCursorCoords] = useState({ x: 0, y: 0, active: false });
  const [pinnedPOIs, setPinnedPOIs] = useState([]);

  const boardContainerRef = useRef(null);
  const boardRef = useRef(null);
  const activeMathFieldRef = useRef(null);
  const isInternalZoomRef = useRef(false);

  // Listen to navbar custom events
  useEffect(() => {
    const onToggleFullscreen = () => setIsFullscreen((prev) => !prev);
    const onOpenHelp = () => setShowHelpModal(true);
    const onToggleKeypad = () => setShowKeypad((prev) => !prev);

    window.addEventListener('toggle-graph-fullscreen', onToggleFullscreen);
    window.addEventListener('open-graph-help-modal', onOpenHelp);
    window.addEventListener('toggle-graph-keypad', onToggleKeypad);
    return () => {
      window.removeEventListener('toggle-graph-fullscreen', onToggleFullscreen);
      window.removeEventListener('open-graph-help-modal', onOpenHelp);
      window.removeEventListener('toggle-graph-keypad', onToggleKeypad);
    };
  }, []);

  // Evaluate all expressions via CortexJS Compute Engine
  const evaluatedList = useMemo(
    () => evaluateExpressionList(items, degreeMode),
    [items, degreeMode]
  );

  // Map evaluated results by item ID
  const evalMap = useMemo(() => {
    const map = new Map();
    for (const ev of evaluatedList) {
      map.set(ev.id, ev);
    }
    return map;
  }, [evaluatedList]);

  // Animation loop for playing sliders
  useEffect(() => {
    const hasPlaying = items.some((it) => it.playing);
    if (!hasPlaying) return;

    let animId;
    let lastTime = performance.now();

    const stepFrame = (now) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      setItems((prevItems) =>
        prevItems.map((it) => {
          if (!it.playing) return it;
          const min = Number(it.sliderMin ?? -10);
          const max = Number(it.sliderMax ?? 10);
          const speed = Number(it.sliderSpeed ?? 1) * (max - min) * 0.22;
          let dir = it.sliderDir ?? 1;
          let nextVal = Number(it.sliderValue ?? 0) + dir * speed * dt;

          if (nextVal >= max) {
            nextVal = max;
            dir = -1;
          } else if (nextVal <= min) {
            nextVal = min;
            dir = 1;
          }
          const rounded = Number(nextVal.toFixed(3));
          const varName = it.varName || (it.latex ? it.latex.split('=')[0].trim() : 'a');
          return {
            ...it,
            sliderValue: rounded,
            sliderDir: dir,
            latex: `${varName} = ${rounded}`,
          };
        })
      );

      animId = requestAnimationFrame(stepFrame);
    };

    animId = requestAnimationFrame(stepFrame);
    return () => cancelAnimationFrame(animId);
  }, [items]);

  // Helper to enforce 1:1 geometric aspect ratio (1 unit X = 1 unit Y in pixels)
  const getAspectCorrectedBox = useCallback((targetBox, containerEl) => {
    const [xmin, ymax, xmax, ymin] = targetBox;
    const width = xmax - xmin;
    const cx = 0.5 * (xmin + xmax);
    const cy = 0.5 * (ymin + ymax);
    const el = containerEl || boardContainerRef.current;
    if (el && el.clientWidth > 40 && el.clientHeight > 40) {
      const ratio = el.clientHeight / el.clientWidth;
      const halfH = 0.5 * width * ratio;
      return [cx - 0.5 * width, cy + halfH, cx + 0.5 * width, cy - halfH];
    }
    return [xmin, ymax, xmax, ymin];
  }, []);

  // Initialize JSXGraph Board
  useEffect(() => {
    const container = boardContainerRef.current;
    if (!container) return;

    if (boardRef.current) {
      JXG.JSXGraph.freeBoard(boardRef.current);
      boardRef.current = null;
    }

    const initialBox = getAspectCorrectedBox(bbox, container);

    const board = JXG.JSXGraph.initBoard(container, {
      boundingbox: initialBox,
      axis: true,
      grid: showGrid,
      showNavigation: false,
      showCopyright: false,
      keepaspectratio: false,
      resize: {
        enabled: false,
      },
      pan: {
        enabled: true,
        needTwoFingers: false,
        needShift: false,
      },
      zoom: {
        enabled: false,
        wheel: false,
      },
      defaultAxes: {
        x: {
          strokeColor: '#64748b',
          highlightStrokeColor: '#64748b',
          strokeWidth: 1.6,
          ticks: {
            strokeColor: 'rgba(148, 163, 184, 0.25)',
            majorHeight: -1,
            minorTicks: 4,
            minorHeight: -1,
            drawZero: false,
            label: {
              strokeColor: '#64748b',
              fontSize: 11,
              offset: [-6, -14],
            },
          },
        },
        y: {
          strokeColor: '#64748b',
          highlightStrokeColor: '#64748b',
          strokeWidth: 1.6,
          ticks: {
            strokeColor: 'rgba(148, 163, 184, 0.25)',
            majorHeight: -1,
            minorTicks: 4,
            minorHeight: -1,
            drawZero: false,
            label: {
              strokeColor: '#64748b',
              fontSize: 11,
              offset: [8, -2],
            },
          },
        },
      },
    });

    board.on('boundingbox', () => {
      if (isInternalZoomRef.current) return;
      const newBox = board.getBoundingBox();
      if (newBox && newBox.every((n) => Number.isFinite(n))) {
        const spanX = Math.abs(newBox[2] - newBox[0]);
        const spanY = Math.abs(newBox[1] - newBox[3]);
        if (spanX >= 0.005 && spanX <= 50000 && spanY >= 0.005 && spanY <= 50000) {
          setBbox([...newBox]);
        }
      }
    });

    board.on('move', (e) => {
      const coords = board.getUsrCoordsOfMouse(e);
      if (coords && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
        setCursorCoords({ x: coords[0], y: coords[1], active: true });
      }
    });

    // Smooth, clamped wheel/touchpad zoom centered around cursor
    // Supports independent axis scaling:
    // - Shift + Scroll -> Vertical (Y-axis) zoom only
    // - Alt/Ctrl + Scroll -> Horizontal (X-axis) zoom only
    // - Standard Scroll -> Uniform zoom on both axes preserving current X:Y scale ratio
    const handleWheel = (e) => {
      e.preventDefault();
      if (!boardRef.current) return;
      const b = boardRef.current;
      const [xmin, ymax, xmax, ymin] = b.getBoundingBox();
      const spanX = xmax - xmin;
      const spanY = ymax - ymin;
      if (!(spanX > 0 && spanY > 0)) return;

      const rawDelta = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaY;
      const clampedDelta = Math.max(-60, Math.min(60, rawDelta));
      const factor = Math.exp(clampedDelta * 0.0016);

      const zoomYOnly = e.shiftKey && !e.altKey && !e.ctrlKey;
      const zoomXOnly = (e.altKey || e.ctrlKey) && !e.shiftKey;

      const newSpanX = zoomYOnly ? spanX : spanX * factor;
      const newSpanY = zoomXOnly ? spanY : spanY * factor;

      // Clamp zoom span between 0.01 and 20000 so axes never explode
      if (newSpanX < 0.01 || newSpanX > 20000) return;
      if (newSpanY < 0.01 || newSpanY > 20000) return;

      if (zoomXOnly || zoomYOnly) {
        setLockAspect(false);
      }

      const mouseCoords = b.getUsrCoordsOfMouse(e);
      const mx =
        mouseCoords && Number.isFinite(mouseCoords[0]) ? mouseCoords[0] : 0.5 * (xmin + xmax);
      const my =
        mouseCoords && Number.isFinite(mouseCoords[1]) ? mouseCoords[1] : 0.5 * (ymin + ymax);

      const relX = (mx - xmin) / spanX;
      const relY = (ymax - my) / spanY;

      const nextXmin = zoomYOnly ? xmin : mx - relX * newSpanX;
      const nextXmax = zoomYOnly ? xmax : nextXmin + newSpanX;
      const nextYmax = zoomXOnly ? ymax : my + relY * newSpanY;
      const nextYmin = zoomXOnly ? ymin : nextYmax - newSpanY;

      const nextBox = [nextXmin, nextYmax, nextXmax, nextYmin];
      isInternalZoomRef.current = true;
      b.setBoundingBox(nextBox, false);
      setBbox(nextBox);
      isInternalZoomRef.current = false;
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    boardRef.current = board;

    let lastW = container.clientWidth;
    let lastH = container.clientHeight;
    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (boardRef.current && w > 40 && h > 40 && (w !== lastW || h !== lastH)) {
        lastW = w;
        lastH = h;
        isInternalZoomRef.current = true;
        // resizeContainer(w, h, true, true) preserves exact unitX and unitY pixel scales
        // and shifts the origin to keep the viewport center fixed while expanding/contracting
        // the visible coordinate range cleanly when the sidebar opens or closes.
        boardRef.current.resizeContainer(w, h, true, true);
        const updatedBox = boardRef.current.getBoundingBox();
        if (updatedBox && updatedBox.every((n) => Number.isFinite(n))) {
          setBbox([...updatedBox]);
        }
        isInternalZoomRef.current = false;
      }
    });
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      resizeObserver.disconnect();
      if (boardRef.current) {
        JXG.JSXGraph.freeBoard(boardRef.current);
        boardRef.current = null;
      }
    };
    // Only re-init board on mount or grid toggle; bbox updates happen smoothly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGrid]);

  // Render curves, points, inequalities, slope fields, and POIs on the JSXGraph board
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    board.suspendUpdate();

    // Remove previous custom plotted objects
    if (board._customObjects) {
      for (const obj of board._customObjects) {
        try {
          board.removeObject(obj);
        } catch {
          // ignore
        }
      }
    }
    board._customObjects = [];
    const registerObj = (obj) => {
      if (obj) board._customObjects.push(obj);
      return obj;
    };

    const currentBbox = board.getBoundingBox();
    const [xmin, ymax, xmax, ymin] = currentBbox;

    // Optional Polar Radar Grid circles & rays
    if (polarGrid) {
      const maxR = Math.hypot(
        Math.max(Math.abs(xmin), Math.abs(xmax)),
        Math.max(Math.abs(ymin), Math.abs(ymax))
      );
      const stepR = Math.max(1, Math.pow(2, Math.floor(Math.log2(maxR / 5))));
      for (let r = stepR; r <= maxR; r += stepR) {
        registerObj(
          board.create('circle', [[0, 0], r], {
            strokeColor: 'rgba(139, 92, 246, 0.22)',
            strokeWidth: 1,
            dash: 2,
            fixed: true,
            highlight: false,
          })
        );
      }
    }

    const explicitCurvesForIntersection = [];

    items.forEach((item) => {
      if (item.visible === false) return;
      const ev = evalMap.get(item.id);
      if (!ev) return;

      const color = item.color || '#2d70b3';
      const dash = item.lineStyle === 'dashed' ? 2 : item.lineStyle === 'dotted' ? 1 : 0;
      const strokeWidth = item.lineWidth || 2.8;

      // 1. Explicit Function y = f(x)
      if (ev.kind === 'explicit' && ev.evalX) {
        const curve = registerObj(
          board.create('functiongraph', [ev.evalX], {
            strokeColor: color,
            highlightStrokeColor: color,
            strokeWidth,
            highlightStrokeWidth: strokeWidth + 1,
            dash,
          })
        );
        explicitCurvesForIntersection.push({ item, ev, curve });

        // Key Points of Interest (roots, y-intercept, local extrema)
        if (showPOI) {
          const pois = findExplicitCurvePOI(ev.evalX, currentBbox);
          for (const poi of pois) {
            const isPinned = pinnedPOIs.some(
              (p) => Math.hypot(p.x - poi.x, p.y - poi.y) < (xmax - xmin) * 0.015
            );
            const pt = registerObj(
              board.create('point', [poi.x, poi.y], {
                name: isPinned ? poi.label : '',
                withLabel: isPinned,
                size: isPinned ? 4.5 : 3.2,
                fillColor: isPinned ? color : '#94a3b8',
                strokeColor: '#0f172a',
                strokeWidth: 1.5,
                fixed: true,
                label: {
                  strokeColor: '#f8fafc',
                  fontSize: 11,
                  offset: [8, 10],
                  cssStyle:
                    'background: rgba(15,23,42,0.92); color: #f8fafc; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.18);',
                },
              })
            );
            pt.on('down', () => {
              setPinnedPOIs((prev) => {
                const exists = prev.some(
                  (p) => Math.hypot(p.x - poi.x, p.y - poi.y) < (xmax - xmin) * 0.015
                );
                if (exists) {
                  return prev.filter(
                    (p) => Math.hypot(p.x - poi.x, p.y - poi.y) >= (xmax - xmin) * 0.015
                  );
                }
                return [...prev, poi];
              });
            });
          }
        }
      }

      // 2. Horizontal / Vertical Curve x = g(y)
      if (ev.kind === 'explicit_y' && ev.evalY) {
        registerObj(
          board.create(
            'curve',
            [
              (t) => ev.evalY(t),
              (t) => t,
              ymin,
              ymax,
            ],
            {
              strokeColor: color,
              strokeWidth,
              dash,
            }
          )
        );
      }

      // 3. Polar Curve r = f(theta)
      if (ev.kind === 'polar' && ev.evalTheta) {
        const maxTheta = degreeMode ? 360 : 2 * Math.PI;
        registerObj(
          board.create(
            'curve',
            [
              (theta) => {
                const r = ev.evalTheta(theta);
                const rad = degreeMode ? (theta * Math.PI) / 180 : theta;
                return r * Math.cos(rad);
              },
              (theta) => {
                const r = ev.evalTheta(theta);
                const rad = degreeMode ? (theta * Math.PI) / 180 : theta;
                return r * Math.sin(rad);
              },
              0,
              maxTheta,
            ],
            {
              strokeColor: color,
              strokeWidth,
              dash,
              numberPointsHigh: 600,
            }
          )
        );
      }

      // 4. Parametric Curve (x(t), y(t))
      if (ev.kind === 'parametric' && ev.evalT) {
        const tMin = item.tMin ?? 0;
        const tMax = item.tMax ?? 2 * Math.PI;
        registerObj(
          board.create(
            'curve',
            [
              (t) => ev.evalT(t)[0],
              (t) => ev.evalT(t)[1],
              tMin,
              tMax,
            ],
            {
              strokeColor: color,
              strokeWidth,
              dash,
              numberPointsHigh: 600,
            }
          )
        );
      }

      // 5. Point (x0, y0)
      if (ev.kind === 'point' && ev.coords) {
        const [px, py] = ev.coords;
        if (Number.isFinite(px) && Number.isFinite(py)) {
          registerObj(
            board.create('point', [px, py], {
              name: ev.label,
              size: 5,
              fillColor: color,
              strokeColor: '#ffffff',
              strokeWidth: 1.5,
              fixed: true,
              label: {
                strokeColor: '#f8fafc',
                fontSize: 12,
                offset: [10, 10],
              },
            })
          );
        }
      }

      // 6. Inequality Shading y < f(x), y >= f(x)
      if (ev.kind === 'inequality' && ev.evalX) {
        const boundary = registerObj(
          board.create('functiongraph', [ev.evalX], {
            strokeColor: color,
            strokeWidth,
            dash: ev.strict ? 2 : 0,
          })
        );
        registerObj(
          board.create('inequality', [boundary], {
            inverse: ev.above,
            fillColor: color,
            fillOpacity: 0.18,
          })
        );
      }

      // 7. Implicit Curve F(x, y) = 0 via Marching Squares
      if (ev.kind === 'implicit' && ev.evalXY) {
        const { xs, ys } = computeImplicitContour(ev.evalXY, currentBbox, 68);
        if (xs.length > 0) {
          const impCurve = registerObj(
            board.create('curve', [xs, ys], {
              strokeColor: color,
              strokeWidth,
              dash,
              highlight: false,
            })
          );
          impCurve.updateDataArray = function () {
            const box = board.getBoundingBox();
            const contour = computeImplicitContour(ev.evalXY, box, 68);
            this.dataX = contour.xs;
            this.dataY = contour.ys;
          };
        }
      }

      // 8. Slope Field / Differential Equation dy/dx = F(x, y)
      if (ev.kind === 'slopefield' && ev.evalXY) {
        const cols = 18;
        const rows = 14;
        const dx = (xmax - xmin) / cols;
        const dy = (ymax - ymin) / rows;
        const segLen = Math.min(dx, dy) * 0.34;
        const xs = [];
        const ys = [];

        for (let i = 1; i < cols; i++) {
          const x = xmin + i * dx;
          for (let j = 1; j < rows; j++) {
            const y = ymin + j * dy;
            const slope = ev.evalXY(x, y);
            if (Number.isFinite(slope)) {
              const angle = Math.atan(slope);
              const hx = Math.cos(angle) * segLen;
              const hy = Math.sin(angle) * segLen;
              xs.push(x - hx, x + hx, NaN);
              ys.push(y - hy, y + hy, NaN);
            }
          }
        }
        registerObj(
          board.create('curve', [xs, ys], {
            strokeColor: color,
            strokeWidth: 1.6,
            highlight: false,
          })
        );
      }

      // 9. Data Table points (x_i, y_i)
      if (item.type === 'table' && Array.isArray(item.rows)) {
        const ptsX = [];
        const ptsY = [];
        for (const r of item.rows) {
          const vx = Number(r.x);
          const vy = Number(r.y);
          if (Number.isFinite(vx) && Number.isFinite(vy)) {
            ptsX.push(vx);
            ptsY.push(vy);
            registerObj(
              board.create('point', [vx, vy], {
                name: `(${formatNum(vx)}, ${formatNum(vy)})`,
                size: 4,
                fillColor: color,
                strokeColor: '#fff',
                strokeWidth: 1.2,
                fixed: true,
                label: {
                  strokeColor: '#cbd5e1',
                  fontSize: 10,
                  offset: [8, 8],
                },
              })
            );
          }
        }
        if (item.connectPoints && ptsX.length >= 2) {
          registerObj(
            board.create('curve', [ptsX, ptsY], {
              strokeColor: color,
              strokeWidth: 2,
              dash: 2,
            })
          );
        }
      }
    });

    // Compute intersections between pairs of active explicit curves
    if (showPOI && explicitCurvesForIntersection.length >= 2) {
      for (let i = 0; i < explicitCurvesForIntersection.length; i++) {
        for (let j = i + 1; j < explicitCurvesForIntersection.length; j++) {
          const fA = explicitCurvesForIntersection[i].ev.evalX;
          const fB = explicitCurvesForIntersection[j].ev.evalX;
          const inters = findCurveIntersections(fA, fB, currentBbox);
          for (const poi of inters) {
            const isPinned = pinnedPOIs.some(
              (p) => Math.hypot(p.x - poi.x, p.y - poi.y) < (xmax - xmin) * 0.015
            );
            const pt = registerObj(
              board.create('point', [poi.x, poi.y], {
                name: isPinned ? poi.label : '',
                withLabel: isPinned,
                size: isPinned ? 5 : 3.5,
                fillColor: isPinned ? '#facc15' : '#cbd5e1',
                strokeColor: '#020617',
                strokeWidth: 1.5,
                fixed: true,
                label: {
                  strokeColor: '#facc15',
                  fontSize: 11,
                  offset: [8, -12],
                  cssStyle:
                    'background: rgba(15,23,42,0.92); color: #facc15; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(250,204,21,0.4);',
                },
              })
            );
            pt.on('down', () => {
              setPinnedPOIs((prev) => {
                const exists = prev.some(
                  (p) => Math.hypot(p.x - poi.x, p.y - poi.y) < (xmax - xmin) * 0.015
                );
                if (exists) {
                  return prev.filter(
                    (p) => Math.hypot(p.x - poi.x, p.y - poi.y) >= (xmax - xmin) * 0.015
                  );
                }
                return [...prev, poi];
              });
            });
          }
        }
      }
    }

    board.unsuspendUpdate();
  }, [items, evalMap, bbox, degreeMode, polarGrid, showPOI, pinnedPOIs]);

  /* ---------------------------------------------------------------
     Handlers for Sidebar Items, Sliders, Presets, and Viewport
  --------------------------------------------------------------- */
  const handleSelectPreset = (presetId) => {
    const preset = GRAPH_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectedPresetId(presetId);
    setItems(preset.items.map((it) => ({ ...it })));
    setPolarGrid(Boolean(preset.polarGrid));
    setPinnedPOIs([]);

    if (boardRef.current && preset.bbox) {
      const corrected = getAspectCorrectedBox(preset.bbox, boardContainerRef.current);
      isInternalZoomRef.current = true;
      boardRef.current.setBoundingBox(corrected, false);
      setBbox(corrected);
      isInternalZoomRef.current = false;
    }
  };

  const addExpressionItem = useCallback((type = 'expression', afterId = null) => {
    setItems((prev) => {
      const nextColor = DESMOS_COLORS[prev.length % DESMOS_COLORS.length];
      const newId = `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      let newItem;

      if (type === 'note') {
        newItem = { id: newId, type: 'note', text: '' };
      } else if (type === 'table') {
        newItem = {
          id: newId,
          type: 'table',
          color: nextColor,
          visible: true,
          connectPoints: true,
          rows: [
            { x: '-2', y: '4' },
            { x: '-1', y: '1' },
            { x: '0', y: '0' },
            { x: '1', y: '1' },
            { x: '2', y: '4' },
          ],
        };
      } else if (type === 'slopefield') {
        newItem = {
          id: newId,
          type: 'slopefield',
          latex: 'x - y',
          color: nextColor,
          visible: true,
          lineStyle: 'solid',
          lineWidth: 1.5,
        };
      } else {
        newItem = {
          id: newId,
          type: 'expression',
          latex: '',
          color: nextColor,
          visible: true,
          lineStyle: 'solid',
          lineWidth: 2.8,
        };
      }

      if (!afterId) return [...prev, newItem];
      const idx = prev.findIndex((it) => it.id === afterId);
      if (idx === -1) return [...prev, newItem];
      const copy = [...prev];
      copy.splice(idx + 1, 0, newItem);
      return copy;
    });
    setShowAddMenu(false);
  }, []);

  const updateItem = useCallback((id, patch) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const deleteItem = useCallback((id) => {
    setItems((prev) => {
      if (prev.length <= 1) {
        return [
          {
            id: `item-${Date.now()}`,
            type: 'expression',
            latex: '',
            color: DESMOS_COLORS[0],
            visible: true,
            lineStyle: 'solid',
            lineWidth: 2.8,
          },
        ];
      }
      return prev.filter((it) => it.id !== id);
    });
  }, []);

  const handleAddSliderForVar = (varName, afterId) => {
    setItems((prev) => {
      const nextColor = DESMOS_COLORS[prev.length % DESMOS_COLORS.length];
      const newSlider = {
        id: `slider-${varName}-${Date.now()}`,
        type: 'expression',
        varName,
        latex: `${varName} = 1`,
        color: nextColor,
        visible: true,
        sliderActive: true,
        sliderValue: 1,
        sliderMin: -10,
        sliderMax: 10,
        sliderStep: 0.1,
        playing: false,
      };
      const idx = prev.findIndex((it) => it.id === afterId);
      if (idx === -1) return [...prev, newSlider];
      const copy = [...prev];
      copy.splice(idx + 1, 0, newSlider);
      return copy;
    });
  };

  const handleSliderChange = (item, rawVal) => {
    const num = Number(rawVal);
    if (!Number.isFinite(num)) return;
    const ev = evalMap.get(item.id);
    const varName = item.varName || ev?.varName || item.latex.split('=')[0].trim() || 'a';
    updateItem(item.id, {
      sliderActive: true,
      sliderValue: num,
      varName,
      latex: `${varName} = ${num}`,
    });
  };

  // Ensure JSXGraph container resizes cleanly when sidebar, keypad, or fullscreen state toggles
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      const container = boardContainerRef.current;
      const board = boardRef.current;
      if (!container || !board) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 40 && h > 40) {
        isInternalZoomRef.current = true;
        board.resizeContainer(w, h, true, true);
        const updatedBox = board.getBoundingBox();
        if (updatedBox && updatedBox.every((n) => Number.isFinite(n))) {
          setBbox([...updatedBox]);
        }
        isInternalZoomRef.current = false;
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [sidebarOpen, showKeypad, isFullscreen]);

  const handleZoom = (factor, axis = 'both') => {
    const board = boardRef.current;
    if (!board) return;
    const [xmin, ymax, xmax, ymin] = board.getBoundingBox();
    const spanX = xmax - xmin;
    const spanY = ymax - ymin;
    const nextSpanX = axis === 'y' ? spanX : spanX * factor;
    const nextSpanY = axis === 'x' ? spanY : spanY * factor;
    if (nextSpanX < 0.01 || nextSpanX > 20000) return;
    if (nextSpanY < 0.01 || nextSpanY > 20000) return;

    if (axis !== 'both') {
      setLockAspect(false);
    }

    const cx = 0.5 * (xmin + xmax);
    const cy = 0.5 * (ymin + ymax);
    const hw = 0.5 * nextSpanX;
    const hh = 0.5 * nextSpanY;
    const rawBox = [cx - hw, cy + hh, cx + hw, cy - hh];
    const nextBox =
      axis === 'both' && lockAspect
        ? getAspectCorrectedBox(rawBox, boardContainerRef.current)
        : rawBox;
    isInternalZoomRef.current = true;
    board.setBoundingBox(nextBox, false);
    setBbox(nextBox);
    isInternalZoomRef.current = false;
  };

  const handleAxisBoundChange = (index, rawValue) => {
    const val = Number(rawValue);
    if (!Number.isFinite(val) || !boardRef.current) return;
    const nextBox = [...boardRef.current.getBoundingBox()];
    nextBox[index] = val;
    const [xmin, ymax, xmax, ymin] = nextBox;
    if (xmax - xmin <= 0.005 || ymax - ymin <= 0.005) return;
    setLockAspect(false);
    isInternalZoomRef.current = true;
    boardRef.current.setBoundingBox(nextBox, false);
    setBbox(nextBox);
    isInternalZoomRef.current = false;
  };

  const handleZoomSquare = () => {
    const board = boardRef.current;
    if (!board) return;
    const current = board.getBoundingBox();
    const corrected = getAspectCorrectedBox(current, boardContainerRef.current);
    setLockAspect(true);
    isInternalZoomRef.current = true;
    board.setBoundingBox(corrected, false);
    setBbox(corrected);
    isInternalZoomRef.current = false;
  };

  const handleResetHome = () => {
    const board = boardRef.current;
    if (!board) return;
    const defaultBox = getAspectCorrectedBox([-10, 6.5, 10, -6.5], boardContainerRef.current);
    setLockAspect(true);
    isInternalZoomRef.current = true;
    board.setBoundingBox(defaultBox, false);
    setBbox(defaultBox);
    isInternalZoomRef.current = false;
    setPinnedPOIs([]);
  };

  const handleKeypadInsert = (latexSnippet) => {
    const mf = activeMathFieldRef.current;
    if (mf && typeof mf.executeCommand === 'function') {
      mf.focus();
      mf.executeCommand(['insert', latexSnippet]);
    }
  };

  const handleExportSvg = () => {
    const board = boardRef.current;
    if (!board || !board.renderer || !board.renderer.svgRoot) return;
    const svgEl = board.renderer.svgRoot;
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgEl);
    if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arsenal-graph-${selectedPresetId}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`graph-calc-page ${isFullscreen ? 'is-fullscreen' : ''}`}>
      {/* Top Control Bar */}
      <header className="graph-topbar">
        <div className="graph-bar-left">
          <button
            type="button"
            className="btn btn-ghost graph-icon-btn"
            onClick={() => setSidebarOpen((prev) => !prev)}
            title={sidebarOpen ? 'Hide Expression Sidebar' : 'Show Expression Sidebar'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>

          <div className="graph-title-group">
            <span className="graph-logo-icon">📈</span>
            <h1 className="graph-title">Desmos Graphing Studio</h1>
            <span className="graph-engine-badge">JSXGraph + CortexJS</span>
          </div>
        </div>

        <div className="graph-bar-center">
          <label className="graph-preset-picker">
            <span className="graph-preset-label">Presets:</span>
            <select
              className="graph-preset-select"
              value={selectedPresetId}
              onChange={(e) => handleSelectPreset(e.target.value)}
            >
              {GRAPH_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          {/* Angle Mode Toggle (RAD / DEG) */}
          <div className="angle-mode-pill" role="group" aria-label="Angle unit">
            <button
              type="button"
              className={`angle-btn ${!degreeMode ? 'active' : ''}`}
              onClick={() => setDegreeMode(false)}
            >
              RAD
            </button>
            <button
              type="button"
              className={`angle-btn ${degreeMode ? 'active' : ''}`}
              onClick={() => setDegreeMode(true)}
            >
              DEG
            </button>
          </div>
        </div>

        <div className="graph-bar-right">
          <button
            type="button"
            className={`btn btn-ghost graph-action-btn ${showKeypad ? 'active' : ''}`}
            onClick={() => setShowKeypad((prev) => !prev)}
            title="Toggle Math Keypad"
          >
            <span>⌨️ Keypad</span>
          </button>

          <button
            type="button"
            className={`btn btn-ghost graph-action-btn ${polarGrid ? 'active' : ''}`}
            onClick={() => setPolarGrid((prev) => !prev)}
            title="Toggle Polar Radar Grid"
          >
            <span>◎ Polar Grid</span>
          </button>

          <button
            type="button"
            className="btn btn-ghost graph-action-btn"
            onClick={handleExportSvg}
            title="Export Graph as SVG"
          >
            <span>⬇ SVG</span>
          </button>

          <button
            type="button"
            className="btn btn-ghost graph-icon-btn"
            onClick={() => setShowHelpModal(true)}
            title="Math Syntax & Shortcuts Guide"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>

          <button
            type="button"
            className="btn btn-ghost graph-icon-btn"
            onClick={() => setIsFullscreen((prev) => !prev)}
            title="Toggle Fullscreen"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Split Workspace */}
      <div className="graph-workspace">
        {/* Left Expression Sidebar */}
        {sidebarOpen && (
          <aside className="graph-sidebar">
            {/* Sidebar Toolbar */}
            <div className="sidebar-toolbar">
              <div className="add-item-dropdown-wrap">
                <button
                  type="button"
                  className="add-expr-btn"
                  onClick={() => addExpressionItem('expression')}
                  title="Add New Expression"
                >
                  <span className="plus-icon">+</span>
                  <span>Add Expression</span>
                </button>
                <button
                  type="button"
                  className="add-expr-more-btn"
                  onClick={() => setShowAddMenu((prev) => !prev)}
                  title="More Item Types"
                >
                  ▾
                </button>

                {showAddMenu && (
                  <div className="add-item-menu glass">
                    <button type="button" onClick={() => addExpressionItem('expression')}>
                      <span>𝑓(𝑥)</span> Expression / Equation
                    </button>
                    <button type="button" onClick={() => addExpressionItem('note')}>
                      <span>📝</span> Text Note
                    </button>
                    <button type="button" onClick={() => addExpressionItem('table')}>
                      <span>⊞</span> Data Table (x, y)
                    </button>
                    <button type="button" onClick={() => addExpressionItem('slopefield')}>
                      <span>↗</span> Differential Slope Field
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="sidebar-clear-btn"
                onClick={() => {
                  setItems([
                    {
                      id: `item-${Date.now()}`,
                      type: 'expression',
                      latex: 'y = \\sin(x)',
                      color: DESMOS_COLORS[0],
                      visible: true,
                      lineStyle: 'solid',
                      lineWidth: 2.8,
                    },
                  ]);
                  handleResetHome();
                }}
                title="Reset to Single Equation & Home Viewport"
              >
                Clear All
              </button>
            </div>

            {/* Expression Rows List */}
            <div className="expression-list">
              {items.map((item, index) => {
                const ev = evalMap.get(item.id);
                const isSliderRow =
                  item.sliderActive || (ev && ev.kind === 'assignment' && Number.isFinite(ev.value));
                const sliderVal = Number(item.sliderValue ?? ev?.value ?? 1);
                const sliderMin = Number(item.sliderMin ?? -10);
                const sliderMax = Number(item.sliderMax ?? 10);
                const sliderStep = Number(item.sliderStep ?? 0.1);

                return (
                  <div key={item.id} className={`expr-card ${item.visible === false ? 'is-muted' : ''}`}>
                    {/* Left Gutter with Row Index & Color/Visibility Toggle */}
                    <div className="expr-gutter">
                      <span className="expr-index">{index + 1}</span>
                      {item.type !== 'note' && (
                        <div className="expr-color-wrap">
                          <button
                            type="button"
                            className={`expr-color-dot ${item.visible === false ? 'hidden-dot' : ''}`}
                            style={{
                              backgroundColor: item.visible === false ? 'transparent' : item.color,
                              borderColor: item.color,
                            }}
                            onClick={() => updateItem(item.id, { visible: item.visible === false })}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setStylePopoverId(stylePopoverId === item.id ? null : item.id);
                            }}
                            title="Click to show/hide • Right-click or click gear for style"
                          />
                          <button
                            type="button"
                            className="expr-style-trigger"
                            onClick={() =>
                              setStylePopoverId(stylePopoverId === item.id ? null : item.id)
                            }
                            title="Curve Color & Style"
                          >
                            🎨
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Main Body of Expression Row */}
                    <div className="expr-body">
                      {/* Style Popover */}
                      {stylePopoverId === item.id && (
                        <div className="expr-style-popover glass">
                          <div className="style-row-colors">
                            {DESMOS_COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                className={`color-swatch ${item.color === c ? 'selected' : ''}`}
                                style={{ backgroundColor: c }}
                                onClick={() => updateItem(item.id, { color: c })}
                              />
                            ))}
                          </div>
                          <div className="style-row-lines">
                            {['solid', 'dashed', 'dotted'].map((st) => (
                              <button
                                key={st}
                                type="button"
                                className={`line-style-btn ${item.lineStyle === st ? 'active' : ''}`}
                                onClick={() => updateItem(item.id, { lineStyle: st })}
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Note Item */}
                      {item.type === 'note' && (
                        <textarea
                          className="expr-note-input"
                          placeholder="Add mathematical note or comment..."
                          value={item.text || ''}
                          onChange={(e) => updateItem(item.id, { text: e.target.value })}
                          rows={2}
                        />
                      )}

                      {/* Table Item */}
                      {item.type === 'table' && (
                        <div className="expr-table-wrap">
                          <div className="expr-table-header">
                            <span>x₁</span>
                            <span>y₁</span>
                            <button
                              type="button"
                              className="table-connect-toggle"
                              onClick={() =>
                                updateItem(item.id, { connectPoints: !item.connectPoints })
                              }
                            >
                              {item.connectPoints ? '⏤ Connected' : '•• Points Only'}
                            </button>
                          </div>
                          {item.rows.map((row, rIdx) => (
                            <div key={rIdx} className="expr-table-row">
                              <input
                                type="number"
                                step="any"
                                value={row.x}
                                onChange={(e) => {
                                  const nextRows = [...item.rows];
                                  nextRows[rIdx] = { ...row, x: e.target.value };
                                  updateItem(item.id, { rows: nextRows });
                                }}
                              />
                              <input
                                type="number"
                                step="any"
                                value={row.y}
                                onChange={(e) => {
                                  const nextRows = [...item.rows];
                                  nextRows[rIdx] = { ...row, y: e.target.value };
                                  updateItem(item.id, { rows: nextRows });
                                }}
                              />
                            </div>
                          ))}
                          <button
                            type="button"
                            className="table-add-row-btn"
                            onClick={() =>
                              updateItem(item.id, {
                                rows: [...item.rows, { x: '0', y: '0' }],
                              })
                            }
                          >
                            + Add Row
                          </button>
                        </div>
                      )}

                      {/* MathLive Equation or Slope Field Item */}
                      {(item.type === 'expression' || item.type === 'slopefield') && (
                        <>
                          {item.type === 'slopefield' && (
                            <div className="slopefield-prefix">dy/dx =</div>
                          )}
                          <MathFieldEditor
                            value={item.latex}
                            onChange={(nextLatex) => updateItem(item.id, { latex: nextLatex })}
                            onEnter={() => addExpressionItem('expression', item.id)}
                            onBackspaceEmpty={() => deleteItem(item.id)}
                            onFocusField={(mf) => {
                              activeMathFieldRef.current = mf;
                            }}
                          />

                          {/* Type / Result Meta Badge */}
                          <div className="expr-meta-bar">
                            {ev && ev.kind === 'constant' && ev.formattedValue && (
                              <span className="expr-eval-badge">= {ev.formattedValue}</span>
                            )}
                            {ev && ev.kind !== 'empty' && ev.kind !== 'constant' && (
                              <span className="expr-kind-tag">{ev.kind}</span>
                            )}
                            {ev && ev.error && <span className="expr-error-tag">{ev.error}</span>}
                          </div>

                          {/* Missing Slider Suggestions ("add slider: a b") */}
                          {ev && ev.missingVars && ev.missingVars.length > 0 && (
                            <div className="add-slider-prompt">
                              <span>add slider:</span>
                              {ev.missingVars.map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  className="add-slider-chip"
                                  onClick={() => handleAddSliderForVar(v, item.id)}
                                >
                                  {v}
                                </button>
                              ))}
                              {ev.missingVars.length > 1 && (
                                <button
                                  type="button"
                                  className="add-slider-chip all-chip"
                                  onClick={() =>
                                    ev.missingVars.forEach((v) => handleAddSliderForVar(v, item.id))
                                  }
                                >
                                  all
                                </button>
                              )}
                            </div>
                          )}

                          {/* Interactive Parameter Slider Bar */}
                          {isSliderRow && (
                            <div className="slider-control-panel">
                              <button
                                type="button"
                                className={`slider-play-btn ${item.playing ? 'playing' : ''}`}
                                onClick={() => updateItem(item.id, { playing: !item.playing })}
                                title={item.playing ? 'Pause Animation' : 'Animate Parameter'}
                              >
                                {item.playing ? '⏸' : '▶'}
                              </button>

                              <input
                                type="number"
                                className="slider-bound-input"
                                value={sliderMin}
                                onChange={(e) =>
                                  updateItem(item.id, { sliderMin: Number(e.target.value) })
                                }
                                title="Slider Minimum"
                              />

                              <input
                                type="range"
                                className="desmos-slider-range"
                                min={sliderMin}
                                max={sliderMax}
                                step={sliderStep}
                                value={sliderVal}
                                onChange={(e) => handleSliderChange(item, e.target.value)}
                              />

                              <input
                                type="number"
                                className="slider-bound-input"
                                value={sliderMax}
                                onChange={(e) =>
                                  updateItem(item.id, { sliderMax: Number(e.target.value) })
                                }
                                title="Slider Maximum"
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Delete Row Button */}
                    <button
                      type="button"
                      className="expr-delete-btn"
                      onClick={() => deleteItem(item.id)}
                      title="Delete Expression"
                      aria-label="Delete Expression"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Bottom Interactive Math Keypad Drawer */}
            {showKeypad && (
              <div className="desmos-keypad-drawer">
                <div className="keypad-header">
                  <span>Math Keypad (Click to insert into active equation)</span>
                  <button type="button" onClick={() => setShowKeypad(false)}>
                    Hide ▾
                  </button>
                </div>
                <div className="keypad-grid">
                  {KEYPAD_BUTTONS.map((btn) => (
                    <button
                      key={btn.label}
                      type="button"
                      className={`keypad-key key-${btn.category}`}
                      onMouseDown={(e) => {
                        e.preventDefault(); // Keep focus inside <math-field>
                        handleKeypadInsert(btn.insert);
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Right Interactive JSXGraph Canvas */}
        <section className="graph-canvas-wrapper">
          <div ref={boardContainerRef} id="jxgbox" className="jxg-canvas-board" />

          {/* Floating Viewport Controls (Top-Right) */}
          <div className="graph-floating-controls">
            <button
              type="button"
              className="floating-ctrl-btn"
              onClick={() => handleZoom(0.75)}
              title="Zoom In"
            >
              +
            </button>
            <button
              type="button"
              className="floating-ctrl-btn"
              onClick={() => handleZoom(1.33)}
              title="Zoom Out"
            >
              −
            </button>
            <button
              type="button"
              className="floating-ctrl-btn"
              onClick={handleResetHome}
              title="Reset Default Zoom [-10, 10]"
            >
              ⌂
            </button>
            <button
              type="button"
              className={`floating-ctrl-btn ${showSettingsMenu ? 'active' : ''}`}
              onClick={() => setShowSettingsMenu((prev) => !prev)}
              title="Graph Display Settings"
            >
              ⚙
            </button>
          </div>

          {/* Graph Settings Popover */}
          {showSettingsMenu && (
            <div className="graph-settings-popover glass">
              <div className="settings-popover-header">
                <h4>Graph Settings & Scales</h4>
                <button
                  type="button"
                  className="zoom-square-btn"
                  onClick={handleZoomSquare}
                  title="Equalize X and Y pixel scales to 1:1"
                >
                  1:1 Square
                </button>
              </div>

              {/* Independent Horizontal (X-Axis) Scale & Bounds */}
              <div className="axis-scale-group">
                <div className="axis-scale-header">
                  <span>X-Axis (Horizontal)</span>
                  <div className="axis-quick-btns">
                    <button
                      type="button"
                      onClick={() => handleZoom(0.75, 'x')}
                      title="Zoom In X-Axis (Expand Horizontal Scale)"
                    >
                      X+
                    </button>
                    <button
                      type="button"
                      onClick={() => handleZoom(1.33, 'x')}
                      title="Zoom Out X-Axis (Compress Horizontal Scale)"
                    >
                      X−
                    </button>
                  </div>
                </div>
                <div className="axis-bounds-inputs">
                  <input
                    type="number"
                    step="any"
                    value={Number(bbox[0].toFixed(2))}
                    onChange={(e) => handleAxisBoundChange(0, e.target.value)}
                    aria-label="X Minimum"
                  />
                  <span className="bounds-sep">≤ x ≤</span>
                  <input
                    type="number"
                    step="any"
                    value={Number(bbox[2].toFixed(2))}
                    onChange={(e) => handleAxisBoundChange(2, e.target.value)}
                    aria-label="X Maximum"
                  />
                </div>
              </div>

              {/* Independent Vertical (Y-Axis) Scale & Bounds */}
              <div className="axis-scale-group">
                <div className="axis-scale-header">
                  <span>Y-Axis (Vertical)</span>
                  <div className="axis-quick-btns">
                    <button
                      type="button"
                      onClick={() => handleZoom(0.75, 'y')}
                      title="Zoom In Y-Axis (Expand Vertical Scale)"
                    >
                      Y+
                    </button>
                    <button
                      type="button"
                      onClick={() => handleZoom(1.33, 'y')}
                      title="Zoom Out Y-Axis (Compress Vertical Scale)"
                    >
                      Y−
                    </button>
                  </div>
                </div>
                <div className="axis-bounds-inputs">
                  <input
                    type="number"
                    step="any"
                    value={Number(bbox[3].toFixed(2))}
                    onChange={(e) => handleAxisBoundChange(3, e.target.value)}
                    aria-label="Y Minimum"
                  />
                  <span className="bounds-sep">≤ y ≤</span>
                  <input
                    type="number"
                    step="any"
                    value={Number(bbox[1].toFixed(2))}
                    onChange={(e) => handleAxisBoundChange(1, e.target.value)}
                    aria-label="Y Maximum"
                  />
                </div>
              </div>

              <div className="axis-shortcut-tip">
                Tip: <strong>Shift + Scroll</strong> zooms Y-axis • <strong>Alt/Ctrl + Scroll</strong> zooms X-axis
              </div>

              <div className="settings-divider" />

              <label className="settings-check-row">
                <input
                  type="checkbox"
                  checked={lockAspect}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setLockAspect(checked);
                    if (checked) handleZoomSquare();
                  }}
                />
                <span>Lock 1:1 Aspect Ratio</span>
              </label>

              <label className="settings-check-row">
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={(e) => setShowGrid(e.target.checked)}
                />
                <span>Show Cartesian Grid</span>
              </label>
              <label className="settings-check-row">
                <input
                  type="checkbox"
                  checked={polarGrid}
                  onChange={(e) => setPolarGrid(e.target.checked)}
                />
                <span>Show Polar Radar Circles</span>
              </label>
              <label className="settings-check-row">
                <input
                  type="checkbox"
                  checked={showPOI}
                  onChange={(e) => setShowPOI(e.target.checked)}
                />
                <span>Highlight Roots, Extrema & Intersections</span>
              </label>
            </div>
          )}

          {/* Bottom Status Overlay (Live Cursor Coordinates & POI Hint) */}
          <div className="graph-status-overlay">
            {cursorCoords.active && (
              <span className="cursor-readout">
                x: {formatNum(cursorCoords.x)}, y: {formatNum(cursorCoords.y)}
              </span>
            )}
            <span className="poi-hint">
              Click any gray/gold dot on a curve to pin its exact coordinates
            </span>
          </div>
        </section>
      </div>

      {/* Help & Syntax Modal */}
      {showHelpModal && (
        <div className="graph-modal-backdrop" onClick={() => setShowHelpModal(false)}>
          <div className="graph-modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="graph-modal-header">
              <h3>Desmos Graphing Studio — Guide & Syntax</h3>
              <button type="button" onClick={() => setShowHelpModal(false)}>
                ✕
              </button>
            </div>
            <div className="graph-modal-body">
              <div className="help-grid">
                <div className="help-card">
                  <h4>1. Explicit & Function Definitions</h4>
                  <p>Type standard equations or reusable functions:</p>
                  <code>y = \sin(2x) + \cos(x)</code>
                  <code>f(x) = x^3 - 3x</code>
                  <code>g(x) = f(x - 2)</code>
                </div>
                <div className="help-card">
                  <h4>2. Sliders & Animated Parameters</h4>
                  <p>Assign any variable or type free variables to get slider prompts:</p>
                  <code>a = 2.5</code>
                  <code>y = a \cdot \sin(b \cdot x)</code>
                </div>
                <div className="help-card">
                  <h4>3. Implicit Equations & Conics</h4>
                  <p>Plot circles, ellipses, hyperbolas, and general relations in x and y:</p>
                  <code>x^2 + y^2 = 16</code>
                  <code>x^3 + y^3 = 6xy</code>
                </div>
                <div className="help-card">
                  <h4>4. Polar, Parametric & Inequalities</h4>
                  <p>Use r and θ for polar, t for parametric tuples, or inequality operators:</p>
                  <code>r = 3\cos(5\theta)</code>
                  <code>(\cos(3t), \sin(2t))</code>
                  <code>y \le 4 - 0.5x^2</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
