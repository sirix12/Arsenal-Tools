import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

const coreTools = [
  {
    path: '/md-reader',
    name: 'MD Reader Pro',
    tagline: 'Read & render Markdown with math',
    description:
      'Paste or upload any Markdown file. Renders LaTeX math, syntax-highlighted code, tables, and more. Export to PDF or save back as .md.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    features: ['LaTeX / KaTeX math', 'Syntax highlighting', 'Export to PDF'],
  },
  {
    path: '/pdf-tools',
    name: 'PDF Toolkit',
    tagline: 'All your PDF tasks in one place',
    description:
      'Compress, merge, split, and organise PDF pages. Convert Word docs and images to PDF. Extract text or export pages as images — all in the browser.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" />
        <line x1="9" y1="15" x2="15" y2="15" />
      </svg>
    ),
    gradient: 'linear-gradient(135deg, #3b82f6, #6366f1)',
    features: ['Merge & split', 'Compress PDFs', 'Word / Image → PDF'],
  },
  {
    path: '/quiz',
    name: 'Quiz Generator',
    tagline: 'Turn notes into interactive quizzes',
    description:
      'Paste AI-generated JSON questions and take an interactive multiple-choice quiz. Tracks your score, shows explanations, and saves progress.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    gradient: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
    features: ['JSON quiz input', 'Progress tracking', 'Code questions'],
  },
];

const hubCategories = ['All', 'Electronics', 'Mathematics'];

const toolHubItems = [
  {
    path: '/code-plotter',
    name: 'MATLAB & Matplotlib Studio',
    module: 'Mathematics',
    tagline: 'Code to Publication Diagrams',
    badge: 'Python Wasm',
    description:
      'Paste MATLAB or Python Matplotlib code to render publication-grade 2D curves, subplots, convolutions, FFT spectrums, Bode plots, polar charts, and 3D surfaces via Matplotlib WebAssembly.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
        <circle cx="18.7" cy="8" r="1.5" fill="currentColor" />
        <circle cx="13.6" cy="13.2" r="1.5" fill="currentColor" />
        <circle cx="10.8" cy="10.5" r="1.5" fill="currentColor" />
        <circle cx="7" cy="14.3" r="1.5" fill="currentColor" />
      </svg>
    ),
    gradient: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
    features: [
      'Powered by Pyodide Python + Matplotlib Wasm',
      'MATLAB .m & Python Matplotlib auto-detection',
      'Subplots, convolution, log scales, polar & 3D',
      'Workspace variable inspector & PNG/SVG export',
    ],
    isReady: true,
  },
  {
    path: '/graphing-calculator',
    name: 'Desmos Graphing Studio',
    module: 'Mathematics',
    tagline: 'JSXGraph + MathLive + CortexJS',
    badge: '3-Part Engine',
    description:
      'Interactive graphing calculator with LaTeX equation sidebar (MathLive), MathJSON symbolic & numeric engine (CortexJS), and 2D/polar/parametric/implicit/slope-field plotting (JSXGraph).',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="3" x2="3" y2="21" />
        <line x1="3" y1="21" x2="21" y2="21" />
        <path d="M4 16c3-8 6-8 9 0s6 8 8-6" />
      </svg>
    ),
    gradient: 'linear-gradient(135deg, #10b981, #3b82f6)',
    features: [
      'MathLive LaTeX sidebar & virtual keypad',
      'CortexJS MathJSON parser & sliders',
      'Explicit, Implicit, Polar & Parametric plots',
      'Key points (roots, extrema, intersections)',
    ],
    isReady: true,
  },
  {
    path: '/circuit-simulator',
    name: 'Circuit Simulator',
    module: 'Electronics',
    tagline: 'CircuitJS1 Interactive Lab',
    badge: 'Original Engine',
    description:
      'Original CircuitJS1 simulation engine with multi-oscilloscope support, right-click context menus, animated current flow, 100+ circuits, and netlist code import.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
    gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
    features: ['Original CircuitJS1 engine', 'Multi-channel oscilloscopes', 'Right-click context menus', 'Add from Code & netlist import'],
    isReady: true,
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState('All');

  const filteredHubItems = activeCategory === 'All'
    ? toolHubItems
    : toolHubItems.filter((item) => item.module === activeCategory);

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div className="hero-badge">
          <span>⚡</span> All tools. One place.
        </div>
        <h1 className="hero-title">
          <span className="gradient-text">Arsenal</span> Tools
        </h1>
        <p className="hero-sub">
          A premium suite of browser-based productivity tools and interactive engineering simulators — fully private, zero backend dependencies.
        </p>
      </section>

      <section className="dashboard-section">
        <div className="section-header">
          <div className="section-badge">Productivity Suite</div>
          <h2 className="section-title">Core Tools</h2>
          <p className="section-desc">Essential document, study, and format utilities designed for speed and privacy.</p>
        </div>

        <div className="tools-grid">
          {coreTools.map((tool) => (
            <div
              key={tool.path}
              className="tool-card glass"
              onClick={() => navigate(tool.path)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && navigate(tool.path)}
            >
              <div className="card-icon-wrap" style={{ background: tool.gradient }}>
                {tool.icon}
              </div>

              <div className="card-body">
                <span className="card-tagline">{tool.tagline}</span>
                <h3 className="card-name">{tool.name}</h3>
                <p className="card-desc">{tool.description}</p>

                <ul className="card-features">
                  {tool.features.map((f) => (
                    <li key={f}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <button className="card-launch btn btn-primary">
                Launch Tool
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>

              <div className="card-glow" style={{ background: tool.gradient }} />
            </div>
          ))}
        </div>
      </section>

      <section id="tool-hub" className="dashboard-section tool-hub-section">
        <div className="section-header">
          <div className="section-badge hub-badge">🛠️ Tool Hub</div>
          <h2 className="section-title">Interactive Labs & Simulators</h2>
          <p className="section-desc">
            Native interactive simulations, visualizers, and analytical tools across Electronics, Mathematics, Physics, and Computer Science.
          </p>
        </div>

        <div className="hub-categories" role="tablist" aria-label="Tool Hub categories">
          {hubCategories.map((cat) => (
            <button
              key={cat}
              className={`category-pill ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
              role="tab"
              aria-selected={activeCategory === cat}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="tools-grid">
          {filteredHubItems.map((tool) => (
            <div
              key={tool.name}
              className={`tool-card glass ${!tool.isReady ? 'tool-card-upcoming' : ''}`}
              onClick={() => tool.isReady && navigate(tool.path)}
              role="button"
              tabIndex={tool.isReady ? 0 : -1}
              onKeyDown={(e) => tool.isReady && e.key === 'Enter' && navigate(tool.path)}
            >
              <div className="card-top-meta">
                <span className="card-module-badge">{tool.module}</span>
                <span className={`status-pill ${tool.isReady ? 'status-ready' : 'status-upcoming'}`}>
                  {tool.badge}
                </span>
              </div>

              <div className="card-icon-wrap" style={{ background: tool.gradient }}>
                {tool.icon}
              </div>

              <div className="card-body">
                <span className="card-tagline">{tool.tagline}</span>
                <h3 className="card-name">{tool.name}</h3>
                <p className="card-desc">{tool.description}</p>

                <ul className="card-features">
                  {tool.features.map((f) => (
                    <li key={f}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              {tool.isReady ? (
                <button className="card-launch btn btn-primary">
                  Launch Simulator
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              ) : (
                <button className="card-launch btn btn-ghost" disabled>
                  Coming Soon
                </button>
              )}

              <div className="card-glow" style={{ background: tool.gradient }} />
            </div>
          ))}
        </div>
      </section>

      <footer className="dashboard-footer">
        <p>All processing happens in your browser. Your files never leave your device.</p>
      </footer>
    </div>
  );
}
