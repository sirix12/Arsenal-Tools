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

const hubCategories = ['All', 'Electronics', 'Mathematics', 'Physics', 'Computer Science'];

const toolHubItems = [
  {
    path: '/circuit-simulator',
    name: 'Circuit Simulator',
    module: 'Electronics',
    tagline: 'Interactive MNA & SPICE Lab',
    badge: 'Native Lab',
    description:
      'Real-time circuit schematic canvas with animated current flow, live dual-channel oscilloscope, interactive switches, presets, and CircuitJS code import.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
    gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
    features: ['Real-time MNA solver', 'Live dual oscilloscope', 'Add from CircuitJS code', 'Zener clipping & filter presets'],
    isReady: true,
  },
  {
    path: '#',
    name: 'Logic Gate Designer',
    module: 'Computer Science',
    tagline: 'Digital logic & state machines',
    badge: 'Coming Soon',
    description:
      'Design combinational and sequential digital circuits with logic gates, flip-flops, clock generators, and automated truth tables.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <rect x="9" y="9" width="6" height="6" />
        <line x1="9" y1="1" x2="9" y2="4" />
        <line x1="15" y1="1" x2="15" y2="4" />
        <line x1="9" y1="20" x2="9" y2="23" />
        <line x1="15" y1="20" x2="15" y2="23" />
        <line x1="20" y1="9" x2="23" y2="9" />
        <line x1="20" y1="14" x2="23" y2="14" />
        <line x1="1" y1="9" x2="4" y2="9" />
        <line x1="1" y1="14" x2="4" y2="14" />
      </svg>
    ),
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
    features: ['Gate-level simulation', 'Truth table generator', 'Clock & latch timing'],
    isReady: false,
  },
  {
    path: '#',
    name: 'Signal & Fourier Lab',
    module: 'Mathematics',
    tagline: 'Harmonics & spectrum analysis',
    badge: 'Coming Soon',
    description:
      'Interactive wave superposition, Fourier series synthesis, frequency domain harmonics decomposition, and filter response curves.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12c3-8 5-8 8 0s5 8 8 0 5-8 8 0" />
        <line x1="2" y1="12" x2="22" y2="12" />
      </svg>
    ),
    gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
    features: ['Harmonic superposition', 'Bode plot curves', 'Audio waveform synthesis'],
    isReady: false,
  },
  {
    path: '#',
    name: 'Field & Motion Lab',
    module: 'Physics',
    tagline: 'Electromagnetics & dynamics',
    badge: 'Coming Soon',
    description:
      'Vector field visualization for electric/magnetic charges, projectile trajectories, potential energy contours, and Newtonian collisions.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M3.6 9h16.8" />
        <path d="M3.6 15h16.8" />
        <path d="M12 3a14 14 0 0 0 0 18" />
      </svg>
    ),
    gradient: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
    features: ['E & B vector fields', 'Gravity & charge interaction', 'Real-time trajectory physics'],
    isReady: false,
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
      {/* Hero */}
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

      {/* Core Productivity Suite */}
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

      {/* Tool Hub Section (Extensible for all modules) */}
      <section id="tool-hub" className="dashboard-section tool-hub-section">
        <div className="section-header">
          <div className="section-badge hub-badge">🛠️ Tool Hub</div>
          <h2 className="section-title">Interactive Labs & Simulators</h2>
          <p className="section-desc">
            Native interactive simulations, visualizers, and analytical tools across Electronics, Mathematics, Physics, and Computer Science.
          </p>
        </div>

        {/* Category Filter Pills */}
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

        {/* Tool Hub Cards */}
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

      {/* Footer note */}
      <footer className="dashboard-footer">
        <p>All processing & circuit simulation happens in your browser. Fully offline-capable and private.</p>
      </footer>
    </div>
  );
}
