import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';

import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import MarkdownReader from './components/MarkdownReader';
import PdfTools from './components/PdfTools';
import QuizGenerator from './components/QuizGenerator';
import CircuitSimulator from './components/CircuitSimulator';

/* ---------------------------------------------------------------
   Live2D widget loader (shared across all pages)
--------------------------------------------------------------- */
function loadLive2D() {
  if (document.querySelector('script[data-live2d]')) return;

  // Intercept XHR to fix models with unkeyed touch motions (such as welrod_1401)
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this._url = url;
    return origOpen.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (this._url && typeof this._url === 'string' && this._url.endsWith('model.json')) {
      const origOnload = this.onload;
      this.onload = function (e) {
        if (this.response && this.responseType === 'arraybuffer') {
          try {
            const dec = new TextDecoder();
            const text = dec.decode(this.response);
            const data = JSON.parse(text);

            let modified = false;
            // Map empty-string motions group to tap_body and tap_face
            if (data.motions && data.motions[''] && (!data.motions.tap_body || data.motions.tap_body.length === 0)) {
              data.motions.tap_body = data.motions[''];
              data.motions.tap_face = data.motions[''];
              modified = true;
            }

            // Ensure head hit area exists for face taps
            if (Array.isArray(data.hit_areas)) {
              const hasHead = data.hit_areas.some((h) => h.name === 'head');
              if (!hasHead) {
                const face = data.hit_areas.find((h) => h.name === 'face');
                if (face) {
                  data.hit_areas.push({ name: 'head', id: face.id });
                  modified = true;
                }
              }
            }

            if (modified) {
              const enc = new TextEncoder();
              const newBuf = enc.encode(JSON.stringify(data)).buffer;
              Object.defineProperty(this, 'response', { value: newBuf });
            }
          } catch (err) {
            console.warn('Live2D model config patch notice:', err);
          }
        }
        if (origOnload) return origOnload.call(this, e);
      };
    }
    return origSend.call(this, ...args);
  };

  // Intercept webpack chunk to enable immediate click reactions and diverse motion playback
  Object.defineProperty(window, 'webpackJsonpL2Dwidget', {
    configurable: true,
    enumerable: true,
    get() {
      return this._wjsonp;
    },
    set(fn) {
      this._wjsonp = function (chunkIds, moreModules, ...rest) {
        // Module 84 is cManager: handles hit tests and events
        if (moreModules && moreModules[84]) {
          const orig84 = moreModules[84];
          moreModules[84] = function (t, e, i) {
            orig84(t, e, i);
            const a = e.cManager;
            a.prototype.tapEvent = function (viewX, viewY) {
              for (let m = 0; m < this.models.length; m++) {
                const model = this.models[m];
                if (model.hitTest('head', viewX, viewY) || model.hitTest('body', viewX, viewY)) {
                  this.eventemitter.emit('tapbody');
                  model.startRandomMotion('tap_body', 3);
                  return true;
                }
              }
              // If click landed anywhere on the canvas, play a random motion
              if (this.models.length > 0) {
                this.models[0].startRandomMotion('tap_body', 3);
              }
              return true;
            };
          };
        }

        // Module 86 is cModel: handles motions and animations
        if (moreModules && moreModules[86]) {
          const orig86 = moreModules[86];
          moreModules[86] = function (t, e, i) {
            orig86(t, e, i);
            const cModel = e.cModel;
            const origStartMotion = cModel.prototype.startMotion;
            cModel.prototype.startMotion = function (name, no, priority) {
              const file = this.modelSetting.getMotionFile(name, no);
              if (file) {
                if (!this._cachedMotions) this._cachedMotions = {};
                if (priority == 3) {
                  this.mainMotionManager.setReservePriority(priority);
                } else if (!this.mainMotionManager.reserveMotion(priority)) {
                  return;
                }
                const self = this;
                if (!this._cachedMotions[file]) {
                  this.loadMotion(name, this.modelHomeDir + file, function (motion) {
                    self._cachedMotions[file] = motion;
                    self.setFadeInFadeOut(name, no, priority, motion);
                  });
                } else {
                  self.setFadeInFadeOut(name, no, priority, this._cachedMotions[file]);
                }
                return;
              }
              return origStartMotion.call(this, name, no, priority);
            };
          };
        }

        return fn.call(this, chunkIds, moreModules, ...rest);
      };
    },
  });

  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/live2d-widget@3.1.4/lib/L2Dwidget.min.js';
  s.setAttribute('data-live2d', '1');
  s.onload = () => {
    window.L2Dwidget.init({
      model: {
        jsonPath:
          'https://cdn.jsdelivr.net/gh/evrstr/live2d-widget-models/live2d_evrstr/welrod_1401/model.json',
        scale: 0.8,
      },
      display: { position: 'right', width: 270, height: 380, hOffset: 10, vOffset: -60 },
      mobile: { show: true, scale: 0.5, motion: true },
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
          <Route path="/" element={<Dashboard />} />
          <Route path="/md-reader" element={<MarkdownReader />} />
          <Route path="/pdf-tools" element={<PdfTools />} />
          <Route path="/quiz" element={<QuizGenerator />} />
          <Route path="/pdf-tools" element={<PdfTools />} />
          <Route path="/quiz" element={<QuizGenerator />} />
          <Route path="/circuit-simulator" element={<CircuitSimulator />} />
          {/* Fallback */}
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
