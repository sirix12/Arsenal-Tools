import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { stepCircuit, parseNetlist, exportNetlist, ptDist } from './circuit/engine';
import { PRESETS } from './circuit/presets';
import './CircuitSimulator.css';

const TOOLS = [
  { id: 'select', label: 'Select / Move', icon: '👆' },
  { id: 'w', label: 'Wire', icon: '⎯' },
  { id: 'r', label: 'Resistor', icon: '⧛' },
  { id: 'c', label: 'Capacitor', icon: '⫲' },
  { id: 'l', label: 'Inductor', icon: '∿' },
  { id: 'vac', label: 'AC Source', icon: '∿' },
  { id: 'vdc', label: 'DC Source', icon: '⎓' },
  { id: 'd', label: 'Diode', icon: '▷|' },
  { id: 'z', label: 'Zener Diode', icon: '▷|' },
  { id: 's', label: 'Switch', icon: '⏻' },
  { id: 'g', label: 'Ground', icon: '⏚' },
];

export default function CircuitSimulator() {
  const navigate = useNavigate();

  // Circuit elements and simulation state
  const [elements, setElements] = useState(() => PRESETS[0].elements.map(el => ({ ...el, state: {} })));
  const [activeTool, setActiveTool] = useState('select');
  const [selectedElId, setSelectedElId] = useState('z1');
  const [isRunning, setIsRunning] = useState(true);
  const [simSpeed, setSimSpeed] = useState(1);
  const [selectedPreset, setSelectedPreset] = useState('zener');

  // Drawing state
  const [drawingStart, setDrawingStart] = useState(null);
  const [currentMouse, setCurrentMouse] = useState(null);
  const [draggedElement, setDraggedElement] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Modals & Panels
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [customCode, setCustomCode] = useState('');
  const [showScope, setShowScope] = useState(true);
  const [copyStatus, setCopyStatus] = useState(false);
  const [editModalEl, setEditModalEl] = useState(null);

  // References
  const canvasRef = useRef(null);
  const scopeCanvasRef = useRef(null);
  const simTimeRef = useRef(0);
  const scopeDataRef = useRef([]); // history of { t, v, i }
  const animFrameRef = useRef(null);
  const renderCanvasRef = useRef(null);
  const renderScopeRef = useRef(null);

  // Snap to 20px grid
  const snap = (val) => Math.round(val / 20) * 20;

  // Initialize or load preset
  const loadPreset = (presetId) => {
    const preset = PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    setSelectedPreset(presetId);
    const newElements = preset.elements.map(el => ({
      ...el,
      p1: { ...el.p1 },
      p2: el.p2 ? { ...el.p2 } : undefined,
      state: {}
    }));
    setElements(newElements);
    scopeDataRef.current = [];
    simTimeRef.current = 0;
    // Auto-select a dynamic/active element for scope
    const probeTarget = newElements.find(e => ['z', 'c', 'd', 'r'].includes(e.type)) || newElements[0];
    if (probeTarget) setSelectedElId(probeTarget.id);
  };

  // Handle "Add from Code"
  const handleLoadFromCode = () => {
    if (!customCode.trim()) return;
    try {
      const parsed = parseNetlist(customCode);
      if (parsed.length > 0) {
        setElements(parsed);
        setSelectedPreset('custom');
        scopeDataRef.current = [];
        simTimeRef.current = 0;
        if (parsed[0]) setSelectedElId(parsed[0].id);
        setShowCodeModal(false);
      } else {
        alert('No valid circuit components found in code.');
      }
    } catch (err) {
      alert('Error parsing circuit code: ' + err.message);
    }
  };

  // Export current circuit to clipboard
  const handleExportCode = () => {
    const code = exportNetlist(elements);
    navigator.clipboard.writeText(code);
    setCopyStatus(true);
    setTimeout(() => setCopyStatus(false), 2000);
  };

  // Open "Add from Code" modal prefilled with current netlist or sample
  const openCodeModal = () => {
    setCustomCode(exportNetlist(elements));
    setShowCodeModal(true);
  };

  // Simulation step loop
  useEffect(() => {
    const loop = () => {
      if (isRunning && elements.length > 0) {
        const subSteps = 8;
        const dt = (0.00025 * simSpeed) / subSteps;

        for (let step = 0; step < subSteps; step++) {
          simTimeRef.current += dt;
          stepCircuit(elements, simTimeRef.current, dt);
        }

        // Record scope history for currently selected element
        const target = elements.find(e => e.id === selectedElId) || elements[0];
        if (target && target.state) {
          scopeDataRef.current.push({
            t: simTimeRef.current,
            v: target.state.v || (target.state.v1 - target.state.v2) || 0,
            i: target.state.i || 0,
          });
          if (scopeDataRef.current.length > 250) {
            scopeDataRef.current.shift();
          }
        }
      }

      renderCanvasRef.current?.();
      renderScopeRef.current?.();
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isRunning, simSpeed, elements, selectedElId]);

  // Main Canvas Rendering
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Subtle Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 20;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Render Elements
    elements.forEach((el) => {
      const isSelected = el.id === selectedElId;
      drawComponent(ctx, el, isSelected, simTimeRef.current);
    });

    // Draw active drawing preview
    if (drawingStart && currentMouse && activeTool !== 'select') {
      const p1 = drawingStart;
      const p2 = { x: snap(currentMouse.x), y: snap(currentMouse.y) };
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
    }
  }, [elements, selectedElId, drawingStart, currentMouse, activeTool]);

  // Keep render refs updated
  useEffect(() => {
    renderCanvasRef.current = renderCanvas;
  }, [renderCanvas]);

  // Component rendering routines
  const drawComponent = (ctx, el, isSelected, time) => {
    const { p1, p2, type, state } = el;
    if (!p1) return;

    ctx.save();

    // Voltage color coding
    const vAvg = state ? ((state.v1 || 0) + (state.v2 || 0)) / 2 : 0;
    let voltageColor = '#94a3b8'; // neutral
    if (vAvg > 0.5) voltageColor = '#22c55e'; // positive green
    else if (vAvg < -0.5) voltageColor = '#ef4444'; // negative red

    ctx.strokeStyle = isSelected ? '#38bdf8' : voltageColor;
    ctx.lineWidth = isSelected ? 3.5 : 2.5;

    // Draw component based on type
    if (type === 'w') {
      // Wire
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    } else if (type === 'r') {
      // Resistor (Zig-zag)
      drawResistor(ctx, p1, p2, el.value);
    } else if (type === 'c') {
      // Capacitor (Parallel plates)
      drawCapacitor(ctx, p1, p2, el.value);
    } else if (type === 'l') {
      // Inductor (Coils)
      drawInductor(ctx, p1, p2, el.value);
    } else if (type === 'vdc') {
      // DC Source (Circle with +/-)
      drawDCSource(ctx, p1, p2, el.value);
    } else if (type === 'vac') {
      // AC Source (Circle with sine)
      drawACSource(ctx, p1, p2, el.value, el.freq);
    } else if (type === 'd') {
      // Standard Diode
      drawDiode(ctx, p1, p2, false);
    } else if (type === 'z') {
      // Zener Diode
      drawDiode(ctx, p1, p2, true, el.vz);
    } else if (type === 'g') {
      // Ground
      drawGround(ctx, p1, p2 || { x: p1.x, y: p1.y + 20 });
    } else if (type === 's') {
      // Switch
      drawSwitch(ctx, p1, p2, el.closed);
    }

    // Terminals dots
    ctx.fillStyle = isSelected ? '#38bdf8' : '#e2e8f0';
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 3, 0, 2 * Math.PI);
    ctx.fill();
    if (p2) {
      ctx.beginPath();
      ctx.arc(p2.x, p2.y, 3, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Animated Current Dots
    const current = state?.i || 0;
    if (Math.abs(current) > 1e-5 && p2) {
      drawCurrentFlow(ctx, p1, p2, current, time);
    }

    ctx.restore();
  };

  // Schematic drawing primitives
  const drawResistor = (ctx, p1, p2, val) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(p1.x, p1.y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    const lead = Math.max(10, (len - 40) / 2);
    ctx.lineTo(lead, 0);

    // 6 peaks
    const seg = 40 / 6;
    for (let i = 0; i < 6; i++) {
      const x = lead + (i + 0.5) * seg;
      const y = (i % 2 === 0 ? -1 : 1) * 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(len - lead, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();

    // Value label
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${val || 1000}Ω`, len / 2, -14);

    ctx.restore();
  };

  const drawCapacitor = (ctx, p1, p2, val) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const mid = len / 2;

    ctx.save();
    ctx.translate(p1.x, p1.y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(mid - 4, 0);
    ctx.moveTo(mid + 4, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();

    // Plates
    ctx.beginPath();
    ctx.moveTo(mid - 4, -12);
    ctx.lineTo(mid - 4, 12);
    ctx.moveTo(mid + 4, -12);
    ctx.lineTo(mid + 4, 12);
    ctx.stroke();

    // Label
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    const cVal = val >= 1e-6 ? `${(val * 1e6).toFixed(1)}µF` : `${(val * 1e9).toFixed(1)}nF`;
    ctx.fillText(cVal, mid, -16);

    ctx.restore();
  };

  const drawInductor = (ctx, p1, p2, val) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const lead = (len - 40) / 2;

    ctx.save();
    ctx.translate(p1.x, p1.y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(lead, 0);

    for (let i = 0; i < 4; i++) {
      ctx.arc(lead + i * 10 + 5, 0, 5, Math.PI, 0, false);
    }
    ctx.lineTo(len, 0);
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${(val || 0.1) * 1000}mH`, len / 2, -14);

    ctx.restore();
  };

  const drawDiode = (ctx, p1, p2, isZener = false, vz = 5.1) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const mid = len / 2;

    ctx.save();
    ctx.translate(p1.x, p1.y);
    ctx.rotate(angle);

    // Leads
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(mid - 10, 0);
    ctx.moveTo(mid + 10, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();

    // Triangle (pointing towards p2)
    ctx.beginPath();
    ctx.moveTo(mid - 10, -10);
    ctx.lineTo(mid + 10, 0);
    ctx.lineTo(mid - 10, 10);
    ctx.closePath();
    ctx.fillStyle = isZener ? '#0284c7' : '#334155';
    ctx.fill();
    ctx.stroke();

    // Cathode bar
    ctx.beginPath();
    ctx.moveTo(mid + 10, -10);
    ctx.lineTo(mid + 10, 10);
    if (isZener) {
      // Bent tabs for Zener
      ctx.moveTo(mid + 10, -10);
      ctx.lineTo(mid + 15, -10);
      ctx.moveTo(mid + 10, 10);
      ctx.lineTo(mid + 5, 10);
    }
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(isZener ? `Zener ${vz}V` : 'Diode', mid, -14);

    ctx.restore();
  };

  const drawDCSource = (ctx, p1, p2, val) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const mid = len / 2;

    ctx.save();
    ctx.translate(p1.x, p1.y);
    ctx.rotate(angle);

    // Leads
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(mid - 14, 0);
    ctx.moveTo(mid + 14, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();

    // Circle
    ctx.beginPath();
    ctx.arc(mid, 0, 14, 0, 2 * Math.PI);
    ctx.stroke();

    // Signs: + near p1, - near p2
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', mid - 6, 0);
    ctx.fillText('−', mid + 6, 0);

    ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillText(`${val || 5}V`, mid, -20);

    ctx.restore();
  };

  const drawACSource = (ctx, p1, p2, val, freq) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const mid = len / 2;

    ctx.save();
    ctx.translate(p1.x, p1.y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(mid - 14, 0);
    ctx.moveTo(mid + 14, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();

    // Circle
    ctx.beginPath();
    ctx.arc(mid, 0, 14, 0, 2 * Math.PI);
    ctx.stroke();

    // Sine wave inside
    ctx.beginPath();
    for (let x = -8; x <= 8; x++) {
      const y = -Math.sin((x / 8) * Math.PI) * 5;
      if (x === -8) ctx.moveTo(mid + x, y);
      else ctx.lineTo(mid + x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${val || 10}V ~ ${freq || 50}Hz`, mid, -20);

    ctx.restore();
  };

  const drawGround = (ctx, p1, p2) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // 3 parallel horizontal bars
    const y = p2.y;
    ctx.beginPath();
    ctx.moveTo(p2.x - 12, y);
    ctx.lineTo(p2.x + 12, y);
    ctx.moveTo(p2.x - 7, y + 4);
    ctx.lineTo(p2.x + 7, y + 4);
    ctx.moveTo(p2.x - 3, y + 8);
    ctx.lineTo(p2.x + 3, y + 8);
    ctx.stroke();

    ctx.restore();
  };

  const drawSwitch = (ctx, p1, p2, closed) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const mid = len / 2;

    ctx.save();
    ctx.translate(p1.x, p1.y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(mid - 10, 0);
    ctx.moveTo(mid + 10, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();

    // Contact dots
    ctx.beginPath();
    ctx.arc(mid - 10, 0, 2.5, 0, 2 * Math.PI);
    ctx.arc(mid + 10, 0, 2.5, 0, 2 * Math.PI);
    ctx.fill();

    // Arm
    ctx.beginPath();
    ctx.moveTo(mid - 10, 0);
    if (closed) {
      ctx.lineTo(mid + 10, 0);
    } else {
      ctx.lineTo(mid + 8, -10); // Open lever
    }
    ctx.stroke();

    ctx.fillStyle = closed ? '#22c55e' : '#f59e0b';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(closed ? 'ON' : 'OFF', mid, -14);

    ctx.restore();
  };

  // Draw animated flowing charge dots
  const drawCurrentFlow = (ctx, p1, p2, current, time) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 10) return;

    const dotSpacing = 16;
    const numDots = Math.floor(len / dotSpacing);
    const speed = Math.sign(current) * Math.min(100, Math.abs(current) * 150);
    const offset = ((time * speed) % dotSpacing + dotSpacing) % dotSpacing;

    ctx.fillStyle = '#facc15'; // bright yellow current dots
    for (let i = 0; i < numDots; i++) {
      const d = offset + i * dotSpacing;
      if (d > 0 && d < len) {
        const x = p1.x + (dx * d) / len;
        const y = p1.y + (dy * d) / len;
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  };

  // Real-Time Oscilloscope Rendering
  const renderScope = useCallback(() => {
    const canvas = scopeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Scope background & grid
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Center zero-voltage reference line
    const zeroY = height / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(width, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    const data = scopeDataRef.current;
    if (data.length < 2) return;

    // Dynamic vertical scale
    let maxV = 1;
    data.forEach(d => {
      if (Math.abs(d.v) > maxV) maxV = Math.abs(d.v);
    });
    maxV = Math.max(2, Math.ceil(maxV * 1.2));

    const scaleY = (zeroY - 10) / maxV;

    // Plot Voltage Waveform (Cyan)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((pt, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = zeroY - pt.v * scaleY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Scale readout overlay
    ctx.fillStyle = '#38bdf8';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`+${maxV}V`, 8, 14);
    ctx.fillText(`-${maxV}V`, 8, height - 6);
    ctx.fillText('0V', 8, zeroY - 4);
  }, []);

  useEffect(() => {
    renderScopeRef.current = renderScope;
  }, [renderScope]);

  // Mouse / Pointer Interaction handlers
  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === 'select') {
      // Find clicked element
      const clicked = elements.find(el => {
        if (!el.p1) return false;
        if (el.p2) {
          const d1 = ptDist({ x, y }, el.p1);
          const d2 = ptDist({ x, y }, el.p2);
          const dLine = ptDist(el.p1, el.p2);
          return (d1 + d2 - dLine) < 6;
        }
        return ptDist({ x, y }, el.p1) < 15;
      });

      if (clicked) {
        // If switch clicked, toggle it directly!
        if (clicked.type === 's') {
          clicked.closed = !clicked.closed;
          setElements([...elements]);
        }
        setSelectedElId(clicked.id);
        setDraggedElement(clicked);
        setDragOffset({ x: x - clicked.p1.x, y: y - clicked.p1.y });
      } else {
        setSelectedElId(null);
      }
    } else {
      // Start drawing component
      setDrawingStart({ x: snap(x), y: snap(y) });
    }
  };

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentMouse({ x, y });

    if (draggedElement && activeTool === 'select') {
      const newX = snap(x - dragOffset.x);
      const newY = snap(y - dragOffset.y);
      const dx = newX - draggedElement.p1.x;
      const dy = newY - draggedElement.p1.y;

      draggedElement.p1.x += dx;
      draggedElement.p1.y += dy;
      if (draggedElement.p2) {
        draggedElement.p2.x += dx;
        draggedElement.p2.y += dy;
      }
      setElements([...elements]);
    }
  };

  const handleMouseUp = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = snap(e.clientX - rect.left);
    const y = snap(e.clientY - rect.top);

    if (drawingStart && activeTool !== 'select') {
      const p1 = drawingStart;
      const p2 = { x, y };

      if (ptDist(p1, p2) >= 15 || activeTool === 'g') {
        const newId = `el_${Date.now()}`;
        let newEl = {
          id: newId,
          type: activeTool,
          p1,
          p2: activeTool === 'g' ? { x: p1.x, y: p1.y + 20 } : p2,
          state: {}
        };

        if (activeTool === 'r') newEl.value = 1000;
        if (activeTool === 'c') newEl.value = 1e-5;
        if (activeTool === 'l') newEl.value = 0.1;
        if (activeTool === 'vdc') newEl.value = 5;
        if (activeTool === 'vac') { newEl.value = 10; newEl.freq = 50; }
        if (activeTool === 'z') newEl.vz = 5.1;
        if (activeTool === 's') newEl.closed = true;

        setElements(prev => [...prev, newEl]);
        setSelectedElId(newId);
      }
      setDrawingStart(null);
    }

    setDraggedElement(null);
  };

  const handleDoubleClick = () => {
    const selected = elements.find(e => e.id === selectedElId);
    if (selected && ['r', 'c', 'l', 'vdc', 'vac', 'z'].includes(selected.type)) {
      setEditModalEl({ ...selected });
    }
  };

  // Keyboard shortcut actions
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setIsRunning(r => !r);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElId) {
          setElements(prev => prev.filter(el => el.id !== selectedElId));
          setSelectedElId(null);
        }
      } else if (e.key.toLowerCase() === 'w') setActiveTool('w');
      else if (e.key.toLowerCase() === 'r') setActiveTool('r');
      else if (e.key.toLowerCase() === 'c') setActiveTool('c');
      else if (e.key.toLowerCase() === 'l') setActiveTool('l');
      else if (e.key.toLowerCase() === 'd') setActiveTool('d');
      else if (e.key.toLowerCase() === 'z') setActiveTool('z');
      else if (e.key.toLowerCase() === 'g') setActiveTool('g');
      else if (e.key.toLowerCase() === 'v') setActiveTool('vac');
      else if (e.key.toLowerCase() === 's') setActiveTool('s');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElId]);

  const selectedElement = elements.find(e => e.id === selectedElId);

  return (
    <div className="circuit-sim-native">
      {/* Top Navbar */}
      <header className="sim-header glass">
        <div className="sim-nav-left">
          <button className="btn btn-ghost sim-btn" onClick={() => navigate('/')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Home</span>
          </button>
          <div className="sim-brand">
            <span className="sim-brand-icon">⚡</span>
            <span className="sim-brand-title">Circuit Simulator</span>
            <span className="sim-badge">Native Engine</span>
          </div>
        </div>

        <div className="sim-nav-center">
          {/* Preset Selector */}
          <div className="sim-preset-wrap">
            <label>Preset:</label>
            <select
              className="sim-select"
              value={selectedPreset}
              onChange={(e) => loadPreset(e.target.value)}
            >
              {PRESETS.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
              {selectedPreset === 'custom' && <option value="custom">Custom Netlist</option>}
            </select>
          </div>

          {/* Add from Code button */}
          <button className="btn btn-primary sim-code-btn" onClick={openCodeModal}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            <span>Add from Code</span>
          </button>

          {/* Export Code button */}
          <button className="btn btn-ghost sim-btn" onClick={handleExportCode} title="Copy Netlist Code">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>{copyStatus ? '✓ Copied!' : 'Export Code'}</span>
          </button>
        </div>

        <div className="sim-nav-right">
          {/* Speed Selector */}
          <div className="sim-speed-pills" title="Simulation Speed">
            {[0.5, 1, 2].map((spd) => (
              <button
                key={spd}
                className={`speed-pill ${simSpeed === spd ? 'active' : ''}`}
                onClick={() => setSimSpeed(spd)}
              >
                {spd}x
              </button>
            ))}
          </div>

          <button
            className={`btn ${isRunning ? 'btn-primary' : 'btn-ghost'} sim-run-btn`}
            onClick={() => setIsRunning(r => !r)}
          >
            {isRunning ? '⏸ Pause' : '▶ Run'}
          </button>

          <button
            className="btn btn-ghost sim-btn"
            onClick={() => { setElements([]); setSelectedElId(null); scopeDataRef.current = []; }}
            title="Clear Schematic"
          >
            Clear
          </button>

          <button
            className={`btn btn-ghost sim-btn ${showScope ? 'active' : ''}`}
            onClick={() => setShowScope(s => !s)}
            title="Toggle Oscilloscope"
          >
            📊 Scope
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="sim-workspace">
        {/* Left Component Toolbox */}
        <aside className="sim-toolbox glass">
          <span className="toolbox-title">Components</span>
          <div className="toolbox-grid">
            {TOOLS.map(tool => (
              <button
                key={tool.id}
                className={`tool-btn ${activeTool === tool.id ? 'active' : ''}`}
                onClick={() => setActiveTool(tool.id)}
                title={tool.label}
              >
                <span className="tool-icon">{tool.icon}</span>
                <span className="tool-name">{tool.label}</span>
              </button>
            ))}
          </div>

          <div className="sim-hint">
            <p><strong>Hotkeys:</strong> Space (Pause), W (Wire), R (Resistor), C (Cap), D (Diode), Z (Zener), Delete (Remove)</p>
          </div>
        </aside>

        {/* Center Schematic Canvas */}
        <main className="sim-canvas-container">
          <canvas
            ref={canvasRef}
            width={1100}
            height={600}
            className="sim-canvas"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDoubleClick={handleDoubleClick}
          />

          {/* Quick Inspector badge for selected element */}
          {selectedElement && (
            <div className="sim-inspector glass">
              <span className="inspector-type">{selectedElement.type.toUpperCase()} Component</span>
              <span className="inspector-val">
                Voltage: {(selectedElement.state?.v || 0).toFixed(3)} V
              </span>
              <span className="inspector-val">
                Current: {((selectedElement.state?.i || 0) * 1000).toFixed(3)} mA
              </span>
              {['r', 'c', 'l', 'vdc', 'vac', 'z'].includes(selectedElement.type) && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditModalEl({ ...selectedElement })}
                >
                  Edit Value
                </button>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Bottom Live Oscilloscope Panel */}
      {showScope && (
        <section className="sim-scope-panel glass">
          <div className="scope-header">
            <div className="scope-title-group">
              <span className="scope-icon">📈</span>
              <h3>Real-Time Oscilloscope Waveform</h3>
              <span className="scope-target">
                Probing: {selectedElement ? `${selectedElement.type.toUpperCase()} (${selectedElement.id})` : 'None'}
              </span>
            </div>
            <div className="scope-stats">
              <span>V_inst: {(selectedElement?.state?.v || 0).toFixed(3)} V</span>
              <span>I_inst: {((selectedElement?.state?.i || 0) * 1000).toFixed(2)} mA</span>
            </div>
          </div>
          <div className="scope-body">
            <canvas ref={scopeCanvasRef} width={1000} height={130} className="scope-canvas" />
          </div>
        </section>
      )}

      {/* Modal: "Add from Code" */}
      {showCodeModal && (
        <div className="sim-modal-overlay" onClick={() => setShowCodeModal(false)}>
          <div className="sim-modal glass" onClick={e => e.stopPropagation()}>
            <div className="sim-modal-header">
              <h3>Add / Import Circuit from Code</h3>
              <button className="btn btn-ghost" onClick={() => setShowCodeModal(false)}>✕</button>
            </div>
            <div className="sim-modal-body">
              <p className="sim-modal-desc">
                Paste your circuit netlist or schematic code below. You can also pick from common study presets to load them into the editor.
              </p>

              {/* Sample template buttons */}
              <div className="sim-modal-templates">
                <span>Load Sample:</span>
                {PRESETS.map(p => (
                  <button
                    key={p.id}
                    className="btn btn-ghost btn-sm"
                    onClick={() => setCustomCode(exportNetlist(p.elements))}
                  >
                    {p.name}
                  </button>
                ))}
              </div>

              <textarea
                className="sim-modal-textarea"
                rows={10}
                value={customCode}
                onChange={e => setCustomCode(e.target.value)}
                placeholder="r 140 160 260 160 0 1000&#10;c 260 160 260 300 0 0.00001&#10;v 140 300 140 160 0 1 50 10"
                spellCheck="false"
              />
            </div>
            <div className="sim-modal-footer">
              <button className="btn btn-ghost" onClick={() => setCustomCode('')}>Clear</button>
              <div className="sim-modal-actions">
                <button className="btn btn-ghost" onClick={() => setShowCodeModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleLoadFromCode}>Load into Simulator</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Component Value Editor */}
      {editModalEl && (
        <div className="sim-modal-overlay" onClick={() => setEditModalEl(null)}>
          <div className="sim-modal glass sim-edit-modal" onClick={e => e.stopPropagation()}>
            <div className="sim-modal-header">
              <h3>Edit {editModalEl.type.toUpperCase()} Properties</h3>
              <button className="btn btn-ghost" onClick={() => setEditModalEl(null)}>✕</button>
            </div>
            <div className="sim-modal-body">
              {['r', 'c', 'l', 'vdc', 'vac'].includes(editModalEl.type) && (
                <div className="sim-input-row">
                  <label>Value ({editModalEl.type === 'r' ? 'Ω' : editModalEl.type === 'c' ? 'F' : editModalEl.type === 'l' ? 'H' : 'V'}):</label>
                  <input
                    type="number"
                    className="sim-input"
                    value={editModalEl.value || 0}
                    onChange={e => setEditModalEl({ ...editModalEl, value: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              )}
              {editModalEl.type === 'vac' && (
                <div className="sim-input-row">
                  <label>Frequency (Hz):</label>
                  <input
                    type="number"
                    className="sim-input"
                    value={editModalEl.freq || 50}
                    onChange={e => setEditModalEl({ ...editModalEl, freq: parseFloat(e.target.value) || 50 })}
                  />
                </div>
              )}
              {editModalEl.type === 'z' && (
                <div className="sim-input-row">
                  <label>Zener Breakdown Voltage (V):</label>
                  <input
                    type="number"
                    className="sim-input"
                    value={editModalEl.vz || 5.1}
                    onChange={e => setEditModalEl({ ...editModalEl, vz: parseFloat(e.target.value) || 5.1 })}
                  />
                </div>
              )}
            </div>
            <div className="sim-modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditModalEl(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setElements(prev => prev.map(el => el.id === editModalEl.id ? editModalEl : el));
                  setEditModalEl(null);
                }}
              >
                Save Properties
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
