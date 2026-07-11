import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

const tools = [
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

export default function Dashboard() {
  const navigate = useNavigate();

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
          A premium suite of browser-based productivity tools — no installs, no uploads to servers, fully private.
        </p>
      </section>

      {/* Tool Cards */}
      <section className="tools-grid">
        {tools.map((tool) => (
          <div
            key={tool.path}
            className="tool-card glass"
            onClick={() => navigate(tool.path)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && navigate(tool.path)}
          >
            {/* Icon */}
            <div className="card-icon-wrap" style={{ background: tool.gradient }}>
              {tool.icon}
            </div>

            {/* Content */}
            <div className="card-body">
              <span className="card-tagline">{tool.tagline}</span>
              <h2 className="card-name">{tool.name}</h2>
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

            {/* Launch button */}
            <button className="card-launch btn btn-primary">
              Launch Tool
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>

            {/* Hover glow overlay */}
            <div className="card-glow" style={{ background: tool.gradient }} />
          </div>
        ))}
      </section>

      {/* Footer note */}
      <footer className="dashboard-footer">
        <p>All processing happens in your browser. Your files never leave your device.</p>
      </footer>
    </div>
  );
}
