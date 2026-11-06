import { useState, useRef, useEffect, useCallback } from 'react';
import { runCodePlotScript, detectCodeLanguage } from '../utils/codePlotEngine';
import { runPyodideMatplotlib, isPyodideReady } from '../utils/pyodideRunner';
import { CODE_PLOT_PRESETS } from './codePlotPresets';
import './CodePlotter.css';

export default function CodePlotter() {
  const [selectedPresetId, setSelectedPresetId] = useState(CODE_PLOT_PRESETS[0].id);
  const [code, setCode] = useState(CODE_PLOT_PRESETS[0].code);
  const [languageMode, setLanguageMode] = useState('auto'); // 'auto' | 'matlab' | 'python'
  const [plotTheme, setPlotTheme] = useState(() =>
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  );
  const [autoRun, setAutoRun] = useState(true);
  const [activeBottomTab, setActiveBottomTab] = useState('console'); // 'console' | 'workspace'
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [mobileView, setMobileView] = useState('split'); // 'split' | 'editor' | 'diagram'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [figureScale, setFigureScale] = useState('auto'); // 'auto' | 'compact' | 'standard' | 'wide' | 'tall' | 'large'
  const [zoomPercent, setZoomPercent] = useState(100);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Execution outputs
  const [subplotCount, setSubplotCount] = useState(1);
  const [pyodideFigures, setPyodideFigures] = useState([]);
  const [pyodideLoadingMsg, setPyodideLoadingMsg] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [wasmReady, setWasmReady] = useState(() => isPyodideReady());
  const [logs, setLogs] = useState([]);
  const [variables, setVariables] = useState([]);

  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const exportMenuRef = useRef(null);
  const autoRunTimeoutRef = useRef(null);
  const runCounterRef = useRef(0);

  const effectiveLanguage = languageMode === 'auto' ? detectCodeLanguage(code) : languageMode;

  const executeWasm = useCallback(
    async (codeToRun, langToUse, themeToUse, scaleToUse = 'auto') => {
      const runId = ++runCounterRef.current;
      setIsExecuting(true);
      setPyodideLoadingMsg(
        isPyodideReady() ? 'Rendering Matplotlib figure...' : 'Starting Python Wasm runtime...'
      );

      try {
        let matlabSpec = null;
        let jsLogs = [];
        let jsVars = [];

        if (langToUse === 'matlab') {
          const jsRes = runCodePlotScript(codeToRun, 'matlab');
          matlabSpec = jsRes.figure;
          jsLogs = jsRes.logs || [];
          jsVars = jsRes.variables || [];
          setSubplotCount(jsRes.figure?.subplots?.length || 1);
          setVariables(jsVars);
        }

        const res = await runPyodideMatplotlib(
          codeToRun,
          (msg) => {
            if (runId === runCounterRef.current) {
              setPyodideLoadingMsg(msg);
            }
          },
          {
            matlabFigureSpec: matlabSpec,
            plotTheme: themeToUse,
            figureScale: scaleToUse,
            subplotSpacing: 'normal',
          }
        );

        if (runId !== runCounterRef.current) return;

        setWasmReady(true);
        setIsExecuting(false);
        setPyodideLoadingMsg('');

        if (res.figures && res.figures.length > 0) {
          setPyodideFigures(res.figures);
          if (langToUse === 'python') {
            setSubplotCount(res.figures.length);
          }
        } else {
          setPyodideFigures([]);
        }

        if (langToUse === 'python' && Array.isArray(res.variables)) {
          setVariables(res.variables);
        }

        const newLogs = [...jsLogs];
        if (res.stdout && res.stdout.trim()) {
          newLogs.push(res.stdout.trim());
        }
        if (res.stderr && !res.stderr.includes('building the font cache')) {
          newLogs.push(`stderr:\n${res.stderr.trim()}`);
        }
        if (res.error) {
          newLogs.push(`❌ Error:\n${res.error}`);
        }
        setLogs(newLogs.filter(Boolean));
      } catch (err) {
        if (runId !== runCounterRef.current) return;
        setIsExecuting(false);
        setPyodideLoadingMsg('');
        setLogs((prev) => [...prev, `❌ Execution Error: ${err.message}`]);
      }
    },
    []
  );

  const handleRun = useCallback(() => {
    if (autoRunTimeoutRef.current) clearTimeout(autoRunTimeoutRef.current);
    if (typeof window !== 'undefined' && window.innerWidth <= 900 && mobileView === 'editor') {
      setMobileView('diagram');
    }
    executeWasm(code, effectiveLanguage, plotTheme, figureScale);
  }, [code, effectiveLanguage, plotTheme, figureScale, mobileView, executeWasm]);

  // Run when preset, language mode, plot theme, or figure scale changes (or initial mount)
  useEffect(() => {
    executeWasm(code, effectiveLanguage, plotTheme, figureScale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPresetId, languageMode, plotTheme, figureScale]);

  useEffect(() => {
    const onToggleFullscreen = () => setIsFullscreen((prev) => !prev);
    const onOpenHelp = () => setShowHelpModal(true);

    window.addEventListener('toggle-codeplot-fullscreen', onToggleFullscreen);
    window.addEventListener('open-codeplot-help-modal', onOpenHelp);

    return () => {
      window.removeEventListener('toggle-codeplot-fullscreen', onToggleFullscreen);
      window.removeEventListener('open-codeplot-help-modal', onOpenHelp);
    };
  }, []);

  // Close Export dropdown when clicking outside
  useEffect(() => {
    if (!showExportMenu) return;
    const handleOutsideClick = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showExportMenu]);

  const handleCodeChange = (e) => {
    const newCode = e.target.value;
    setCode(newCode);

    if (autoRun) {
      if (autoRunTimeoutRef.current) clearTimeout(autoRunTimeoutRef.current);
      const nextLang = languageMode === 'auto' ? detectCodeLanguage(newCode) : languageMode;
      autoRunTimeoutRef.current = setTimeout(() => {
        executeWasm(newCode, nextLang, plotTheme, figureScale);
      }, 450);
    }
  };

  const handleEditorScroll = (e) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.target.scrollTop;
    }
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRun();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const val = target.value;
      const updated = val.substring(0, start) + '  ' + val.substring(end);
      setCode(updated);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  };

  const handlePresetSelect = (id) => {
    setSelectedPresetId(id);
    const preset = CODE_PLOT_PRESETS.find((p) => p.id === id);
    if (preset) {
      setCode(preset.code);
      setLanguageMode('auto');
    }
  };

  const handleDownloadPng = () => {
    setShowExportMenu(false);
    if (pyodideFigures.length === 0) return;
    const fig = pyodideFigures[0];
    const a = document.createElement('a');
    a.href = fig.png;
    a.download = `${selectedPresetId || 'diagram'}.png`;
    a.click();
  };

  const handleDownloadSvg = () => {
    setShowExportMenu(false);
    if (pyodideFigures.length === 0 || !pyodideFigures[0].svg) return;
    const svgBlob = new Blob([pyodideFigures[0].svg], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(svgBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedPresetId || 'diagram'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lineCount = Math.max(1, code.split('\n').length);

  return (
    <div className={`code-plotter-page ${isFullscreen ? 'is-fullscreen' : ''}`}>
      {/* ====================================================================
          Top Control Bar
      ==================================================================== */}
      <header className="plot-topbar">
        <div className="plot-bar-left">
          <div className="plot-title-group">
            <span className="plot-logo-icon">📊</span>
            <span className="plot-title">MATLAB & Matplotlib Studio</span>
            <span
              className="plot-engine-badge"
              title="Powered by Pyodide Python WebAssembly + Matplotlib"
            >
              🐍 {wasmReady ? 'Wasm Ready' : 'Python Wasm'}
            </span>
          </div>

          <div className="preset-selector-wrap">
            <select
              className="preset-select"
              value={selectedPresetId}
              onChange={(e) => handlePresetSelect(e.target.value)}
              title="Select a pre-built MATLAB or Matplotlib diagram preset"
            >
              {CODE_PLOT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.category}] {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="plot-bar-right">
          <button
            type="button"
            className="action-icon-btn"
            onClick={() => setPlotTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title={
              plotTheme === 'dark'
                ? 'Switch to Publication Light Plot Theme'
                : 'Switch to Dark Plot Theme'
            }
          >
            {plotTheme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>

          <label className="toggle-label" title="Automatically re-run diagram when editing code">
            <input
              type="checkbox"
              checked={autoRun}
              onChange={(e) => setAutoRun(e.target.checked)}
            />
            <span>Auto-Run</span>
          </label>

          <button
            type="button"
            className="btn btn-primary run-btn"
            onClick={handleRun}
            disabled={isExecuting}
            title="Execute Code (Ctrl + Enter)"
          >
            {isExecuting ? (
              <span>⏳ Rendering...</span>
            ) : (
              <>
                <span>▶ Run</span>
                <kbd className="kbd-shortcut">Ctrl+↵</kbd>
              </>
            )}
          </button>

          {isFullscreen && (
            <button
              type="button"
              className="action-icon-btn"
              onClick={() => setIsFullscreen(false)}
              title="Exit Fullscreen"
            >
              ✕ Exit
            </button>
          )}
        </div>
      </header>

      {/* ====================================================================
          Mobile / Tablet View Switcher Bar (Visible on <= 900px)
      ==================================================================== */}
      <div className="mobile-view-switcher" role="tablist" aria-label="Workspace View Mode">
        <button
          type="button"
          role="tab"
          aria-selected={mobileView === 'split'}
          className={`mobile-tab-btn ${mobileView === 'split' ? 'active' : ''}`}
          onClick={() => setMobileView('split')}
        >
          ⬍ Split View
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileView === 'editor'}
          className={`mobile-tab-btn ${mobileView === 'editor' ? 'active' : ''}`}
          onClick={() => setMobileView('editor')}
        >
          📝 Code ({lineCount}L)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileView === 'diagram'}
          className={`mobile-tab-btn ${mobileView === 'diagram' ? 'active' : ''}`}
          onClick={() => setMobileView('diagram')}
        >
          📊 Diagram ({subplotCount})
        </button>
      </div>

      {/* ====================================================================
          Main Work Area: Split Editor & Diagram Viewport
      ==================================================================== */}
      <div className={`plot-workspace mobile-mode-${mobileView}`}>
        {/* Left Split: Code Editor & Console/Variables */}
        <div className="editor-pane">
          <div className="editor-header">
            <div className="editor-title-wrap">
              <span className="editor-title">Code Editor</span>
            </div>

            <div className="editor-tools">
              <select
                className="lang-mini-select"
                value={languageMode}
                onChange={(e) => setLanguageMode(e.target.value)}
                title="Language Syntax Mode"
              >
                <option value="auto">
                  Auto ({effectiveLanguage === 'matlab' ? 'MATLAB .m' : 'Python .py'})
                </option>
                <option value="matlab">MATLAB (.m)</option>
                <option value="python">Python (.py)</option>
              </select>
            </div>
          </div>

          <div className="code-editor-wrapper">
            <div ref={lineNumbersRef} className="line-numbers" aria-hidden="true">
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i + 1}>{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="code-textarea"
              value={code}
              onChange={handleCodeChange}
              onScroll={handleEditorScroll}
              onKeyDown={handleKeyDown}
              placeholder={`% Paste your MATLAB or Matplotlib code here (Ctrl+V)\nt = 0:0.01:10;\ny = sin(2*pi*t);\nplot(t, y, 'b-', 'LineWidth', 2);\ntitle('Sine Wave');\ngrid on;`}
              spellCheck="false"
              autoCapitalize="off"
              autoComplete="off"
            />
          </div>

          <div className={`editor-bottom-drawer ${isDrawerOpen ? 'is-open' : 'is-collapsed'}`}>
            <div className="drawer-tabs">
              <div className="drawer-tabs-left">
                <button
                  type="button"
                  className={`drawer-tab-btn ${activeBottomTab === 'console' && isDrawerOpen ? 'active' : ''}`}
                  onClick={() => {
                    setActiveBottomTab('console');
                    setIsDrawerOpen(true);
                  }}
                >
                  📟 Console ({logs.length})
                </button>
                <button
                  type="button"
                  className={`drawer-tab-btn ${activeBottomTab === 'workspace' && isDrawerOpen ? 'active' : ''}`}
                  onClick={() => {
                    setActiveBottomTab('workspace');
                    setIsDrawerOpen(true);
                  }}
                >
                  📦 Variables ({variables.length})
                </button>
              </div>
              <button
                type="button"
                className="drawer-collapse-btn"
                onClick={() => setIsDrawerOpen((prev) => !prev)}
                title={isDrawerOpen ? 'Collapse Drawer' : 'Expand Drawer'}
              >
                {isDrawerOpen ? '▾ Hide' : '▴ Show'}
              </button>
            </div>

            {isDrawerOpen && (
              <div className="drawer-content">
                {activeBottomTab === 'console' ? (
                  <div className="console-view">
                    {logs.length === 0 ? (
                      <div className="console-empty">
                        ✓ Executed cleanly via Python Wasm ({subplotCount} subplot
                        {subplotCount === 1 ? '' : 's'} rendered).
                      </div>
                    ) : (
                      logs.map((log, idx) => (
                        <div key={idx} className="console-line">
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="workspace-view">
                    {variables.length === 0 ? (
                      <div className="workspace-empty">No workspace variables assigned yet.</div>
                    ) : (
                      <table className="variables-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Size</th>
                            <th>Min</th>
                            <th>Max</th>
                          </tr>
                        </thead>
                        <tbody>
                          {variables.map((v) => (
                            <tr key={v.name}>
                              <td className="var-name">{v.name}</td>
                              <td>{v.type}</td>
                              <td className="var-size">{v.size}</td>
                              <td className="var-num">{v.min}</td>
                              <td className="var-num">{v.max}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Split: Diagram Output Viewport */}
        <div className="diagram-pane">
          <div className="diagram-toolbar">
            <div className="diagram-title-wrap">
              <span className="diagram-title">Diagram Output</span>
              <span className="diagram-meta">
                {subplotCount} Subplot{subplotCount > 1 ? 's' : ''}
              </span>
              {isExecuting && pyodideFigures.length > 0 && (
                <span className="rendering-inline-pill">⏳ Updating...</span>
              )}
            </div>

            <div className="diagram-actions">
              <label
                className="toolbar-select-label"
                title="Matplotlib Figure Canvas Dimensions (prevents text/subplot overlap)"
              >
                <span>Scale:</span>
                <select
                  className="toolbar-mini-select"
                  value={figureScale}
                  onChange={(e) => setFigureScale(e.target.value)}
                >
                  <option value="auto">Auto Fit</option>
                  <option value="compact">Compact (7.5×5)</option>
                  <option value="standard">Standard (9.5×6.5)</option>
                  <option value="wide">Wide (12.5×7.5)</option>
                  <option value="tall">Tall (9.5×10.5)</option>
                  <option value="large">Large HD (14×10)</option>
                </select>
              </label>

              <div className="zoom-controls-group" title="Viewport Display Zoom">
                <button
                  type="button"
                  className="zoom-step-btn"
                  onClick={() => setZoomPercent((z) => Math.max(50, z - 15))}
                  title="Zoom Out (−)"
                  aria-label="Zoom Out"
                >
                  −
                </button>
                <button
                  type="button"
                  className="zoom-reset-btn"
                  onClick={() => setZoomPercent(100)}
                  title="Reset Zoom to 100%"
                >
                  {zoomPercent}%
                </button>
                <button
                  type="button"
                  className="zoom-step-btn"
                  onClick={() => setZoomPercent((z) => Math.min(220, z + 15))}
                  title="Zoom In (+)"
                  aria-label="Zoom In"
                >
                  +
                </button>
              </div>

              {pyodideFigures.length > 0 && (
                <div ref={exportMenuRef} className="export-dropdown-wrap">
                  <button
                    type="button"
                    className="diagram-export-btn"
                    onClick={() => setShowExportMenu((prev) => !prev)}
                    aria-expanded={showExportMenu}
                    title="Export Diagram as PNG or SVG"
                  >
                    📥 Export ▾
                  </button>

                  {showExportMenu && (
                    <div className="export-dropdown-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className="export-dropdown-item"
                        onClick={handleDownloadPng}
                      >
                        🖼️ Download PNG (150 DPI)
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="export-dropdown-item"
                        onClick={handleDownloadSvg}
                      >
                        📐 Download SVG (Vector)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div
            className={`diagram-canvas-container ${
              plotTheme === 'dark' ? 'canvas-bg-dark' : 'canvas-bg-light'
            }`}
          >
            {isExecuting && pyodideFigures.length === 0 && (
              <div className="loading-overlay">
                <div className="loading-spinner" />
                <div className="loading-text">
                  {pyodideLoadingMsg || 'Initializing Matplotlib WebAssembly...'}
                </div>
              </div>
            )}

            <div className="pyodide-viewport">
              {pyodideFigures.length > 0 ? (
                <div
                  className="pyodide-figures-list"
                  style={{ maxWidth: `${Math.round(880 * (zoomPercent / 100))}px` }}
                >
                  {pyodideFigures.map((fig) => (
                    <div
                      key={fig.id}
                      className={`pyodide-figure-card ${
                        plotTheme === 'dark' ? 'fig-card-dark' : 'fig-card-light'
                      }`}
                    >
                      <img
                        src={fig.png}
                        alt={`Matplotlib Figure ${fig.id}`}
                        className="pyodide-fig-img"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                !isExecuting && (
                  <div className="plot-empty-state">
                    <div className="empty-icon">🐍</div>
                    <h3>No Figure Generated</h3>
                    <p>
                      Paste MATLAB or Python Matplotlib plotting commands on the left and press{' '}
                      <strong>Run</strong>.
                    </p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ====================================================================
          Syntax Help & Supported Functions Modal
      ==================================================================== */}
      {showHelpModal && (
        <div className="help-modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div className="help-modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="help-modal-header">
              <h3>MATLAB & Matplotlib Syntax Guide</h3>
              <button
                type="button"
                className="help-close-btn"
                onClick={() => setShowHelpModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="help-modal-body">
              <section className="help-section">
                <h4>Supported MATLAB Commands & Features</h4>
                <ul>
                  <li>
                    <code>t = -1:0.001:6;</code> or <code>linspace(0, 10, 500)</code> : Vector ranges &amp; <code>t(1)</code>, <code>t(end)</code> indexing
                  </li>
                  <li>
                    <code>u = @(t) double(t &gt;= 0);</code> : Anonymous functions &amp; vectorized logical comparisons
                  </li>
                  <li>
                    <code>y = conv(x, h) * dt;</code>, <code>fft(x)</code>, <code>heaviside(t)</code>, <code>sinc(t)</code> : Signal processing
                  </li>
                  <li>
                    <code>plot(x, y, 'r--', 'LineWidth', 2, 'DisplayName', 'label')</code> : 2D curve plotting
                  </li>
                  <li>
                    <code>subplot(3, 1, 1); ... subplot(3, 1, 3);</code> : Multi-subplot grids
                  </li>
                  <li>
                    <code>semilogx(w, mag);</code>, <code>semilogy(...)</code>, <code>loglog(...)</code> : Logarithmic axes
                  </li>
                  <li>
                    <code>polarplot(theta, rho);</code>, <code>stem(n, x);</code>, <code>stairs(n, x);</code>, <code>bar(x, y);</code>
                  </li>
                  <li>
                    <code>[X, Y] = meshgrid(x, y); surf(X, Y, Z); contourf(X, Y, Z);</code> : 3D surfaces &amp; 2D contours
                  </li>
                </ul>
              </section>

              <section className="help-section">
                <h4>Supported Python &amp; Matplotlib Commands</h4>
                <ul>
                  <li>
                    <code>import matplotlib.pyplot as plt</code> and <code>import numpy as np</code>
                  </li>
                  <li>
                    <code>t = np.linspace(0, 10, 200)</code>, <code>np.arange(0, 10, 0.1)</code>, <code>np.convolve(x, h)</code>
                  </li>
                  <li>
                    <code>fig, axes = plt.subplots(2, 2)</code> or <code>plt.subplot(2, 2, 1)</code>
                  </li>
                  <li>
                    <code>plt.plot(t, y, 'b-', label='series')</code>, <code>plt.scatter(x, y)</code>, <code>plt.bar(x, y)</code>, <code>plt.hist(data)</code>
                  </li>
                  <li>
                    <code>ax.plot_surface(X, Y, Z)</code>, <code>ax.plot_wireframe(X, Y, Z)</code>, <code>plt.contourf(X, Y, Z)</code>
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
