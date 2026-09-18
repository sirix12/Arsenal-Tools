import { useState, useRef, useEffect } from 'react';
import LZString from 'lz-string';
import './CircuitSimulator.css';

const STUDY_PRESETS = [
  {
    id: 'zener-clipper',
    name: 'Zener Diode Voltage Clipper',
    description: 'AC signal clipped by 5.1V Zener diode with dual input & output oscilloscopes',
    type: 'code',
    code: `$ 1 0.000005 10.20027730826997 50 5 43
v 140 160 140 300 0 1 50 10 0 0 0.5
w 140 160 260 160 0
r 260 160 380 160 0 1000
w 380 160 480 160 0
z 480 300 480 160 0 5.1
w 140 300 310 300 0
w 310 300 480 300 0
g 310 300 310 340 0
o 0 64 0 4099 20 0.05 0 -1
o 4 64 0 4099 20 0.05 1 -1`,
  },
  {
    id: 'diodeclip',
    name: 'Waveform Clipper (Diode)',
    description: 'Diode clipping circuit with bias voltage and output scope',
    type: 'code',
    code: `$ 1 5.0E-6 11.251013186076355 58 5.0 50
r 272 160 320 160 0 200.0
r 320 160 320 240 0 100.0
d 320 240 320 288 0
R 320 288 320 320 0 0 40.0 5.0 0.0 0.0 0.5
O 320 160 384 160 0
R 272 160 240 160 0 3 40.0 10.0 0.0 0.0 0.5
o 5 64 0 35 10.0 0.1 0 -1
o 4 64 0 34 10.0 9.765625E-5 1 -1`,
  },
  {
    id: 'zenerref',
    name: 'Zener Voltage Reference',
    description: 'DC voltage regulator maintaining steady breakdown reference',
    type: 'code',
    code: `$ 1 5.0E-6 10.20027730826997 54 5.0 50
R 272 160 224 160 0 1 40.0 1.0 6.7 0.0 0.5
z 336 288 336 160 1 0.805904783 5.6
g 336 288 336 304 0
w 336 160 416 160 0
r 416 160 416 288 0 10000.0
g 416 288 416 304 0
r 272 160 336 160 0 500.0
o 0 64 0 34 10.0 0.003125 0 -1 in
o 4 64 0 34 10.0 3.90625E-4 1 -1 out
o 1 64 0 35 10.0 0.00625 2 -1 zener`,
  },
  {
    id: 'fullrectf',
    name: 'Full-Wave Bridge Rectifier & Filter',
    description: '4-diode bridge with capacitor smoothing filter and load resistor',
    type: 'code',
    code: `$ 1 5.0E-6 10 50 5.0 48
v 96 336 96 48 0 1 40.0 5.0 0.0
w 96 48 224 48 0
w 224 48 224 112 0
d 224 112 288 176 0
d 224 240 288 176 0
d 160 176 224 112 0
d 160 176 224 240 0
w 224 240 224 336 0
w 224 336 96 336 0
w 160 176 160 272 0
w 288 176 336 176 0
w 160 272 336 272 0
c 336 176 336 272 0 1.02E-4 3.2105610440835166
w 336 176 416 176 0
w 336 272 416 272 0
r 416 176 416 272 0 430.0
x 451 232 457 232 0 16 load
o 0 32 0 2 5.0 9.765625E-5
o 15 32 0 3 5.0 0.0125`,
  },
  {
    id: 'filt-lopass',
    name: 'RC Low-Pass Filter',
    description: 'Passive RC low-pass frequency filter with frequency response',
    type: 'code',
    code: `$ 1 5.0E-6 6.499443210467817 50 5.0 50
O 400 160 512 160 0
g 400 288 400 320 0
r 240 160 400 160 0 187.0
c 400 160 400 288 0 1.0E-5 0
170 240 160 208 160 3 20.0 1000.0 5.0 0.1
o 4 32 0 34 5.0 9.765625E-5 0 -1
o 0 32 0 34 5.0 9.765625E-5 1 -1
h 3 2 3`,
  },
  {
    id: 'lrc',
    name: 'LRC Resonant Circuit',
    description: 'Underdamped RLC tank showing resonant frequency oscillations',
    type: 'code',
    code: `$ 1 5.0E-6 10 50 5.0 43
r 176 80 384 80 0 10
s 384 80 448 80 0 true false
w 176 80 176 352 0
c 176 352 384 352 0 1.4999999999999999E-5 -9.860041921625609
l 384 80 384 352 0 1.0 0.03019234785322575
v 448 352 448 80 0 0 40.0 5.0 0.0
r 384 352 448 352 0 100.0
o 4 64 0 3 20.0 0.05
o 3 64 0 3 10.0 0.05
o 0 64 0 3 0.625 0.05
h 1 4 3`,
  },
  {
    id: '555square',
    name: '555 Square Wave Generator',
    description: 'Astable multivibrator oscillating with dual threshold/discharge scopes',
    type: 'code',
    code: `$ 1 5.0E-6 5.023272298708815 64 7.0 50
w 272 176 240 176 0
r 240 176 240 240 0 10000.0
w 240 240 272 240 0
w 240 240 240 272 0
w 240 272 272 272 0
c 240 272 240 336 0 3.0E-7 6.6394202099608295
g 240 336 240 352 0
r 240 176 240 112 0 10000.0
w 240 112 336 112 0
R 240 112 176 112 0 0 40.0 10.0 0.0 0.0 0.5
O 400 208 464 208 0
165 272 144 288 144 2 10.0
w 336 112 400 112 0
w 400 112 400 176 0
o 5 32 0 35 10.0 0.0015625 0 -1
o 10 32 0 42 10.0 9.765625E-5 1 -1`,
  },
];

/**
 * Auto-repairs CircuitJS netlists by detecting any component terminals (e.g. grounds, switches, branch wires)
 * that intersect the interior of continuous wire segments.
 * In interactive canvas drawing, CircuitJS auto-splits wires on collision, but text netlist importing
 * does NOT auto-split them, causing "bad connection to ground" (red dots).
 * This function automatically splits continuous wires at intermediate terminals and remaps scope indices.
 */
function autoRepairNetlist(text) {
  if (!text || typeof text !== 'string') return text;
  const lines = text.split('\n');
  const parsed = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('$')) {
      parsed.push({ type: 'meta', raw: rawLine });
      continue;
    }
    const parts = line.split(/\s+/);
    const tag = parts[0];
    if (tag === 'o') {
      parsed.push({
        type: 'scope',
        targetIndex: parseInt(parts[1], 10),
        rest: parts.slice(2).join(' '),
        raw: rawLine,
      });
    } else if (
      parts.length >= 5 &&
      !isNaN(Number(parts[1])) &&
      !isNaN(Number(parts[2])) &&
      !isNaN(Number(parts[3])) &&
      !isNaN(Number(parts[4]))
    ) {
      parsed.push({
        type: 'elem',
        tag,
        x1: Number(parts[1]),
        y1: Number(parts[2]),
        x2: Number(parts[3]),
        y2: Number(parts[4]),
        rest: parts.slice(5).join(' '),
        raw: rawLine,
      });
    } else {
      parsed.push({ type: 'other', raw: rawLine });
    }
  }

  // Collect all terminal points (x, y)
  const terminals = new Set();
  for (const item of parsed) {
    if (item.type === 'elem') {
      terminals.add(`${item.x1},${item.y1}`);
      if (item.tag !== 'g') {
        terminals.add(`${item.x2},${item.y2}`);
      }
    }
  }

  // Check each wire for intermediate terminals
  const newElements = [];
  const indexMap = new Map();
  let oldElemCount = 0;

  for (const item of parsed) {
    if (item.type !== 'elem') {
      newElements.push(item);
      continue;
    }

    const currentOldIdx = oldElemCount++;
    indexMap.set(currentOldIdx, newElements.filter((e) => e.type === 'elem').length);

    if (item.tag === 'w') {
      const isHoriz = item.y1 === item.y2 && item.x1 !== item.x2;
      const isVert = item.x1 === item.x2 && item.y1 !== item.y2;

      if (isHoriz || isVert) {
        const intermediatePts = [];
        for (const ptStr of terminals) {
          const [px, py] = ptStr.split(',').map(Number);
          if (isHoriz && py === item.y1) {
            const minX = Math.min(item.x1, item.x2);
            const maxX = Math.max(item.x1, item.x2);
            if (px > minX && px < maxX) {
              intermediatePts.push(px);
            }
          } else if (isVert && px === item.x1) {
            const minY = Math.min(item.y1, item.y2);
            const maxY = Math.max(item.y1, item.y2);
            if (py > minY && py < maxY) {
              intermediatePts.push(py);
            }
          }
        }

        if (intermediatePts.length > 0) {
          if (isHoriz) {
            const asc = item.x2 > item.x1;
            intermediatePts.sort((a, b) => (asc ? a - b : b - a));
            let curX = item.x1;
            for (const nextX of intermediatePts) {
              newElements.push({
                type: 'elem',
                tag: 'w',
                raw: `w ${curX} ${item.y1} ${nextX} ${item.y1} ${item.rest}`.trim(),
              });
              curX = nextX;
            }
            newElements.push({
              type: 'elem',
              tag: 'w',
              raw: `w ${curX} ${item.y1} ${item.x2} ${item.y1} ${item.rest}`.trim(),
            });
            continue;
          } else {
            const asc = item.y2 > item.y1;
            intermediatePts.sort((a, b) => (asc ? a - b : b - a));
            let curY = item.y1;
            for (const nextY of intermediatePts) {
              newElements.push({
                type: 'elem',
                tag: 'w',
                raw: `w ${item.x1} ${curY} ${item.x1} ${nextY} ${item.rest}`.trim(),
              });
              curY = nextY;
            }
            newElements.push({
              type: 'elem',
              tag: 'w',
              raw: `w ${item.x1} ${curY} ${item.x1} ${item.y2} ${item.rest}`.trim(),
            });
            continue;
          }
        }
      }
    }

    newElements.push(item);
  }

  // Remap scopes to matching element indices
  const output = [];
  for (const item of newElements) {
    if (item.type === 'scope') {
      const newTarget = indexMap.has(item.targetIndex)
        ? indexMap.get(item.targetIndex)
        : item.targetIndex;
      output.push(`o ${newTarget} ${item.rest}`.trim());
    } else {
      output.push(item.raw);
    }
  }

  return output.join('\n');
}

function buildUrlForPreset(preset) {
  const code = autoRepairNetlist(preset.code);
  const compressed = LZString.compressToEncodedURIComponent(code);
  return `/circuitjs/circuitjs.html?ctz=${compressed}`;
}

export default function CircuitSimulator() {
  const containerRef = useRef(null);
  const iframeRef = useRef(null);

  const [simUrl, setSimUrl] = useState(() => buildUrlForPreset(STUDY_PRESETS[0]));
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [customCode, setCustomCode] = useState(STUDY_PRESETS[0].code);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // Handle Load from Code (with auto-repair for wire junctions and floating grounds)
  const handleLoadFromCode = () => {
    if (!customCode.trim()) return;
    const repairedCode = autoRepairNetlist(customCode.trim());
    const compressed = LZString.compressToEncodedURIComponent(repairedCode);
    setSimUrl(`/circuitjs/circuitjs.html?ctz=${compressed}`);
    setSelectedPreset('custom');
    setIframeKey((k) => k + 1);
    setShowCodeModal(false);
    setIframeKey((k) => k + 1);
  };

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => { });
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => { });
    }
  };

  // Mouse event forwarder so Live2D anime girl tracks cursor inside the simulator
  const handleIframeLoad = () => {
    try {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const iframeWin = iframe.contentWindow;
      if (!iframeWin) return;

      const forwardMouse = (e) => {
        const rect = iframe.getBoundingClientRect();
        const parentEvt = new MouseEvent('mousemove', {
          clientX: e.clientX + rect.left,
          clientY: e.clientY + rect.top,
          screenX: e.screenX,
          screenY: e.screenY,
          bubbles: true,
          cancelable: true,
          view: window,
        });
        window.dispatchEvent(parentEvt);
        document.dispatchEvent(parentEvt);
      };

      iframeWin.addEventListener('mousemove', forwardMouse, { passive: true });
    } catch (err) {
      console.warn('Unable to attach iframe mouse listener:', err);
    }
  };

  // Elevate Live2D anime girl companion to stand on top of the bottom scope bar
  useEffect(() => {
    let intervalId = null;
    const applyLive2dPosition = () => {
      const widget = document.getElementById('live2d-widget');
      if (widget) {
        widget.classList.add('live2d-on-scope-bar');
        widget.style.setProperty('bottom', '118px', 'important');
        widget.style.setProperty('transition', 'bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 'important');
        return true;
      }
      return false;
    };

    if (!applyLive2dPosition()) {
      intervalId = setInterval(() => {
        if (applyLive2dPosition()) {
          clearInterval(intervalId);
        }
      }, 250);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      const widget = document.getElementById('live2d-widget');
      if (widget) {
        widget.classList.remove('live2d-on-scope-bar');
        widget.style.setProperty('bottom', '20px', 'important');
      }
    };
  }, []);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    const handleOpenModal = () => setShowCodeModal(true);
    const handleToggleFs = () => toggleFullscreen();
    const handleOpenHelp = () => setShowHelp(true);

    document.addEventListener('fullscreenchange', handleFsChange);
    window.addEventListener('open-circuit-code-modal', handleOpenModal);
    window.addEventListener('toggle-circuit-fullscreen', handleToggleFs);
    window.addEventListener('open-circuit-help-modal', handleOpenHelp);

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      window.removeEventListener('open-circuit-code-modal', handleOpenModal);
      window.removeEventListener('toggle-circuit-fullscreen', handleToggleFs);
      window.removeEventListener('open-circuit-help-modal', handleOpenHelp);
    };
  }, []);

  return (
    <div className={`circuit-sim-page ${isFullscreen ? 'is-fullscreen' : ''}`} ref={containerRef}>
      {/* Main Original CircuitJS Frame (Uncrowded, 100% Full Viewport) */}
      <div className="circuit-iframe-container">
        <iframe
          ref={iframeRef}
          key={iframeKey}
          id="circuitjs-iframe"
          className="circuitjs-iframe"
          title="CircuitJS Simulator"
          src={simUrl}
          allow="fullscreen"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
          onLoad={handleIframeLoad}
        />
      </div>

      {/* "Add from Code" Modal */}
      {showCodeModal && (
        <div className="sim-modal-backdrop" onClick={() => setShowCodeModal(false)}>
          <div className="sim-modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="sim-modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">&lt;/&gt;</span>
                <h3>Add Circuit from Code / Netlist</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setShowCodeModal(false)}>
                ✕
              </button>
            </div>

            <p className="modal-desc">
              Paste your CircuitJS / ASCII netlist code below, or pick a sample template. The simulator will instantly compile and load it.
            </p>

            {/* Quick Sample Loaders */}
            <div className="modal-samples">
              <span className="samples-label">Load Template:</span>
              <button
                type="button"
                className="sample-pill"
                onClick={() => setCustomCode(STUDY_PRESETS[0].code)}
              >
                Zener Diode Clipper
              </button>
              <button
                type="button"
                className="sample-pill"
                onClick={() =>
                  setCustomCode(
                    `$ 1 0.000005 10.20027730826997 50 5 43
v 160 320 160 200 0 1 50 10 0 0 0.5
r 160 200 280 200 0 1000
c 280 200 280 320 0 0.00001
w 160 320 280 320 0
w 160 320 220 320 0
w 220 320 280 320 0
g 220 320 220 350 0
o 0 64 0 4099 20 0.05 0 -1
o 2 64 0 4099 20 0.05 1 -1`
                  )
                }
              >
                RC Low-Pass Filter
              </button>
              <button
                type="button"
                className="sample-pill"
                onClick={() =>
                  setCustomCode(
                    `$ 1 0.000005 10.20027730826997 50 5 43
v 160 320 160 200 0 1 50 10 0 0 0.5
r 160 200 240 200 0 100
l 240 200 320 200 0 0.1
c 320 200 320 320 0 0.00001
w 160 320 320 320 0
w 160 320 240 320 0
w 240 320 320 320 0
g 240 320 240 350 0
o 0 64 0 4099 20 0.05 0 -1
o 3 64 0 4099 20 0.05 1 -1`
                  )
                }
              >
                RLC Resonant Circuit
              </button>
            </div>

            {/* Code Textarea */}
            <textarea
              className="modal-code-textarea"
              rows={11}
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value)}
              placeholder="Paste CircuitJS netlist code here (e.g. $ 1 0.000005 ...)"
              spellCheck={false}
            />

            <div className="modal-actions">
              <span className="modal-hint">
                ⚡ <strong>Auto-Repair Active</strong>: Automatically splits continuous wire rails so copy-pasted grounds &amp; branches connect cleanly with 0 bad connections.
              </span>
              <div className="modal-btn-group">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowCodeModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleLoadFromCode}
                >
                  Load into Simulator
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help / Shortcuts Modal */}
      {showHelp && (
        <div className="sim-modal-backdrop" onClick={() => setShowHelp(false)}>
          <div className="sim-modal sim-help-modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="sim-modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">💡</span>
                <h3>CircuitJS1 Tips & Features</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setShowHelp(false)}>
                ✕
              </button>
            </div>

            <div className="help-content">
              <h4>🔌 Connecting Wires & Snapping (No Red Dots)</h4>
              <p>
                CircuitJS connects components at <strong>endpoints</strong> on a grid. If you see a <strong style={{ color: '#ef4444' }}>Red Dot 🔴</strong>, it means a terminal is floating or unconnected.
              </p>
              <ul>
                <li><strong>Branch off an existing wire</strong>: Right-click the wire and choose <strong>&quot;Split Wire&quot;</strong>, or draw a new wire directly to it to create a junction (<strong style={{ color: '#ffffff' }}>White Dot ⚪</strong>).</li>
                <li><strong>Copy-Pasting Netlists</strong>: Use Arsenal&apos;s <strong>&quot;Add from Code&quot;</strong> button, which automatically splits continuous rails so copy-pasted grounds and branches connect with 0 bad connections!</li>
                <li><strong>Snap to Nearest Grid</strong>: If terminals are misaligned, press <kbd>Ctrl+A</kbd> then click <strong>Edit → Align to Grid</strong>.</li>
                <li><strong>Connecting Ground</strong>: Ground only connects at its single top terminal dot.</li>
              </ul>

              <h4>🎯 Adding Multiple Oscilloscopes</h4>
              <p>
                To view waveforms at any node or component, <strong>Right-Click</strong> on the component or wire and select <strong>&quot;View in Scope&quot;</strong>. You can add as many scopes across the circuit as you need!
              </p>

              <h4>🖱️ Right-Click Context Menu</h4>
              <p>
                Right-clicking on any component allows you to:
              </p>
              <ul>
                <li><strong>View in Scope</strong>: Attach a dedicated oscilloscope</li>
                <li><strong>Edit...</strong>: Change resistance, capacitance, frequency, or breakdown voltage</li>
                <li><strong>Sliders...</strong>: Create real-time sliders on the right sidebar</li>
                <li><strong>Flip / Rotate</strong>: Change component orientation</li>
              </ul>

              <h4>⌨️ Common Keyboard Shortcuts</h4>
              <div className="shortcuts-grid">
                <div><kbd>Space</kbd> Pause / Run Simulation</div>
                <div><kbd>W</kbd> Add Wire</div>
                <div><kbd>R</kbd> Add Resistor</div>
                <div><kbd>C</kbd> Add Capacitor</div>
                <div><kbd>L</kbd> Add Inductor</div>
                <div><kbd>D</kbd> Add Diode</div>
                <div><kbd>Z</kbd> Add Zener Diode</div>
                <div><kbd>S</kbd> Add Switch</div>
                <div><kbd>G</kbd> Add Ground</div>
                <div><kbd>V</kbd> Add AC Source</div>
                <div><kbd>Del</kbd> Delete Selected</div>
                <div><kbd>Ctrl+Z</kbd> Undo</div>
              </div>
            </div>

            <div className="modal-actions">
              <div />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowHelp(false)}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
