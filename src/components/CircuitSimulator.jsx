import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
    type: 'file',
    file: 'diodeclip.txt',
  },
  {
    id: 'zenerref',
    name: 'Zener Voltage Reference',
    description: 'DC voltage regulator maintaining steady breakdown reference',
    type: 'file',
    file: 'zenerref.txt',
  },
  {
    id: 'fullrectf',
    name: 'Full-Wave Bridge Rectifier & Filter',
    description: '4-diode bridge with capacitor smoothing filter and load resistor',
    type: 'file',
    file: 'fullrectf.txt',
  },
  {
    id: 'filt-lopass',
    name: 'RC Low-Pass Filter',
    description: 'Passive RC low-pass frequency filter with frequency response',
    type: 'file',
    file: 'filt-lopass.txt',
  },
  {
    id: 'lrc',
    name: 'LRC Resonant Circuit',
    description: 'Underdamped RLC tank showing resonant frequency oscillations',
    type: 'file',
    file: 'lrc.txt',
  },
  {
    id: '555square',
    name: '555 Square Wave Generator',
    description: 'Astable multivibrator oscillating with dual threshold/discharge scopes',
    type: 'file',
    file: '555square.txt',
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
  if (preset.type === 'file') {
    return `https://www.falstad.com/circuit/circuitjs.html?startCircuit=${preset.file}`;
  }
  const code = autoRepairNetlist(preset.code);
  const compressed = LZString.compressToEncodedURIComponent(code);
  return `https://www.falstad.com/circuit/circuitjs.html?ctz=${compressed}`;
}

export default function CircuitSimulator() {
  const navigate = useNavigate();
  const containerRef = useRef(null);

  const [selectedPreset, setSelectedPreset] = useState(STUDY_PRESETS[0].id);
  const [simUrl, setSimUrl] = useState(() => buildUrlForPreset(STUDY_PRESETS[0]));
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [customCode, setCustomCode] = useState(STUDY_PRESETS[0].code);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // Handle preset switch
  const handleSelectPreset = (presetId) => {
    setSelectedPreset(presetId);
    const preset = STUDY_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSimUrl(buildUrlForPreset(preset));
    setIframeKey((k) => k + 1);
  };

  // Handle Load from Code (with auto-repair for wire junctions and floating grounds)
  const handleLoadFromCode = () => {
    if (!customCode.trim()) return;
    const repairedCode = autoRepairNetlist(customCode.trim());
    const compressed = LZString.compressToEncodedURIComponent(repairedCode);
    setSimUrl(`https://www.falstad.com/circuit/circuitjs.html?ctz=${compressed}`);
    setSelectedPreset('custom');
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

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  return (
    <div className={`circuit-sim-page ${isFullscreen ? 'is-fullscreen' : ''}`} ref={containerRef}>
      {/* Sleek, Non-Crowded Arsenal Top Bar */}
      <header className="circuit-sim-topbar">
        {/* Left: Back & Title */}
        <div className="sim-bar-left">
          <button
            className="sim-bar-btn sim-back-btn"
            onClick={() => navigate('/')}
            title="Return to Tool Hub"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Tool Hub</span>
          </button>

          <div className="sim-title-group">
            <span className="sim-lightning">⚡</span>
            <h1 className="sim-title">Circuit Simulator</h1>
            <span className="sim-engine-badge">Original Engine</span>
          </div>
        </div>

        {/* Center: Study Presets & Add from Code */}
        <div className="sim-bar-center">
          <div className="sim-preset-picker">
            <label htmlFor="sim-preset-select" className="sim-preset-label">Preset:</label>
            <select
              id="sim-preset-select"
              className="sim-preset-select"
              value={selectedPreset}
              onChange={(e) => handleSelectPreset(e.target.value)}
            >
              {STUDY_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {selectedPreset === 'custom' && (
                <option value="custom">★ Custom Netlist (Code)</option>
              )}
            </select>
          </div>

          <button
            className="sim-bar-btn sim-btn-primary"
            onClick={() => setShowCodeModal(true)}
            title="Import or paste circuit code netlist"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            <span>Add from Code</span>
          </button>
        </div>

        {/* Right: Fullscreen, Help, External */}
        <div className="sim-bar-right">
          <button
            className="sim-bar-btn"
            onClick={() => setShowHelp(true)}
            title="Shortcuts & Tips"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Help</span>
          </button>

          <button
            className="sim-bar-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
            <span>{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
          </button>

          <a
            href={simUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="sim-bar-btn"
            title="Open in new window"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      </header>

      {/* Main Original CircuitJS Frame (Uncrowded, Full Viewport) */}
      <div className="circuit-iframe-container">
        <iframe
          key={iframeKey}
          id="circuitjs-iframe"
          className="circuitjs-iframe"
          title="CircuitJS Simulator"
          src={simUrl}
          allow="fullscreen"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
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
