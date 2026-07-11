import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';

import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import MarkdownReader from './components/MarkdownReader';
import PdfTools from './components/PdfTools';
import QuizGenerator from './components/QuizGenerator';

/* ---------------------------------------------------------------
   Live2D widget loader (shared across all pages)
--------------------------------------------------------------- */
function loadLive2D() {
  if (document.querySelector('script[data-live2d]')) return;
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/live2d-widget@3.1.4/lib/L2Dwidget.min.js';
  s.setAttribute('data-live2d', '1');
  s.onload = () => {
    window.L2Dwidget.init({
      model: {
        jsonPath:
          'https://cdn.jsdelivr.net/gh/evrstr/live2d-widget-models/live2d_evrstr/mai/model.json',
      },
      display: { position: 'right', width: 85, height: 200, hOffset: 20, vOffset: 20 },
      mobile: { show: true, scale: 0.3, motion: true },
    });
  };
  document.body.appendChild(s);
}

/* ---------------------------------------------------------------
   Theme helpers
--------------------------------------------------------------- */
function getInitialTheme() {
  const saved = localStorage.getItem('arsenal-theme');
  if (saved) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/* ---------------------------------------------------------------
   App Shell
--------------------------------------------------------------- */
export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);

  /* Apply theme to root element */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('arsenal-theme', theme);
  }, [theme]);

  /* Load Live2D widget once */
  useEffect(() => {
    loadLive2D();
  }, []);

  const toggleTheme = () => {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  };

  return (
    <BrowserRouter>
      {/* Animated background orbs */}
      <div className="bg-orbs" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {/* Top navigation */}
      <Navbar theme={theme} onToggleTheme={toggleTheme} />

      {/* Page content */}
      <main className="page-content">
        <Routes>
          <Route path="/"          element={<Dashboard />} />
          <Route path="/md-reader" element={<MarkdownReader />} />
          <Route path="/pdf-tools" element={<PdfTools />} />
          <Route path="/quiz"      element={<QuizGenerator />} />
          {/* Fallback */}
          <Route path="*"          element={<Dashboard />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
