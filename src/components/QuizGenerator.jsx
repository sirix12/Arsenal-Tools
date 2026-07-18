import { useState, useEffect, useCallback } from 'react';
import { jsonrepair } from 'jsonrepair';
import './QuizGenerator.css';

/* ------------------------------------------------------------------
   Script loader for Highlight.js (code question support)
------------------------------------------------------------------- */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}
function loadLink(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href;
  document.head.appendChild(l);
}

const PROMPT_TEMPLATE = `Please generate a set of multiple-choice questions based on the provided content.
Format the output EXACTLY as a JSON array of objects, with no markdown formatting around the JSON itself.
CRITICAL JSON rules:
1. All nested double quotes inside option strings or explanations MUST be escaped.
2. Do not omit the dollar sign '$' prefix from MongoDB operators.
3. Generate between 2 and 4 options per question.

Each object must have:
- "question": The question text.
- "code": (Optional) A code block string.
- "language": (Optional) The programming language of the code block.
- "options": An array of possible answer strings (2–4 options).
- "correctAnswer": The exact string of the correct answer.
- "explanation": A brief explanation of why the answer is correct.`;

const STORAGE_KEY = 'arsenal_quiz_state';

/* ------------------------------------------------------------------
   Helpers
------------------------------------------------------------------- */
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatText(text) {
  if (!text) return '';
  const parts = text.split(/```/g);
  if (parts.length === 1) {
    let t = escapeHTML(text);
    t = t.replace(/`([^`]+)`/g, '<code class="qz-inline-code">$1</code>');
    return t.replace(/\n/g, '<br>');
  }
  let html = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      let t = escapeHTML(parts[i]);
      t = t.replace(/`([^`]+)`/g, '<code class="qz-inline-code">$1</code>');
      html += t.replace(/\n/g, '<br>');
    } else {
      const nl = parts[i].indexOf('\n');
      let lang = 'javascript', code = parts[i];
      if (nl !== -1) {
        const l = parts[i].substring(0, nl).trim();
        if (l && l.length < 15) { lang = l; code = parts[i].substring(nl + 1); }
      }
      html += makeCodeBlock(code.trim(), lang);
    }
  }
  return html;
}

function makeCodeBlock(code, lang) {
  const id = 'cb-' + Math.random().toString(36).slice(2, 8);
  return `<div class="qz-code-block">
    <div class="qz-code-header">
      <span class="qz-code-lang">${lang || 'code'}</span>
      <button class="qz-copy-btn" onclick="window.__qzCopy('${id}')">Copy</button>
    </div>
    <div class="qz-code-body"><pre><code id="${id}" class="language-${lang || 'plaintext'}">${escapeHTML(code)}</code></pre></div>
  </div>`;
}

/* ------------------------------------------------------------------
   Main component
------------------------------------------------------------------- */
export default function QuizGenerator() {
  const [view, setView] = useState('setup');   // 'setup' | 'quiz' | 'result'
  const [jsonInput, setJsonInput] = useState('');
  const [error, setError] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [savedState, setSavedState] = useState(null);

  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [isAnswered, setIsAnswered] = useState(false);
  const [selectedOpt, setSelectedOpt] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);

  /* Load hljs once */
  useEffect(() => {
    loadLink('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/tokyo-night-dark.min.css');
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');

    /* Global copy helper */
    window.__qzCopy = (id) => {
      const el = document.getElementById(id);
      if (el) navigator.clipboard.writeText(el.textContent);
    };
  }, []);

  /* highlight after render */
  useEffect(() => {
    if (view === 'quiz' && window.hljs) {
      document.querySelectorAll('.qz-code-body code:not(.hljs)').forEach(el => window.hljs.highlightElement(el));
    }
  }, [view, currentIndex]);

  /* Restore saved quiz */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.questions?.length && s.currentIndex < s.questions.length) setSavedState(s);
      }
    } catch (_) {}
  }, []);

  /* ----------------------------------------------------------------
     Parse & validate
  ---------------------------------------------------------------- */
  const parseInput = () => {
    setError('');
    const raw = jsonInput.trim();
    if (!raw) { setError('Please paste some JSON data first.'); return null; }
    try {
      const repairedRaw = jsonrepair(raw);
      const data = JSON.parse(repairedRaw);
      if (!Array.isArray(data) || data.length === 0) { setError('Data must be a non-empty JSON array.'); return null; }
      for (let i = 0; i < data.length; i++) {
        const q = data[i];
        if (!q.question || !Array.isArray(q.options) || q.options.length < 2 || !q.correctAnswer || !q.explanation) {
          setError(`Item ${i} is missing required fields.`); return null;
        }
      }
      return data;
    } catch (_) {
      setError('Invalid JSON — even after attempting auto-repair. Please check for syntax errors.');
      return null;
    }
  };

  const startNew = () => {
    const qs = parseInput();
    if (!qs) return;
    const state = { questions: qs, currentIndex: 0, score: 0 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setQuestions(qs); setCurrentIndex(0); setScore(0);
    setIsAnswered(false); setSelectedOpt(null); setShowExplanation(false);
    setView('quiz');
  };

  const resume = () => {
    if (!savedState) return;
    setQuestions(savedState.questions);
    setCurrentIndex(savedState.currentIndex);
    setScore(savedState.score);
    setIsAnswered(false); setSelectedOpt(null); setShowExplanation(false);
    setView('quiz');
  };

  /* ----------------------------------------------------------------
     Quiz logic
  ---------------------------------------------------------------- */
  const handleAnswer = (opt) => {
    if (isAnswered) return;
    setIsAnswered(true);
    setSelectedOpt(opt);
    setShowExplanation(true);
    const correct = opt === questions[currentIndex].correctAnswer;
    if (correct) {
      const newScore = score + 1;
      setScore(newScore);
      const next = { questions, currentIndex, score: newScore };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  };

  const next = () => {
    const ni = currentIndex + 1;
    if (ni < questions.length) {
      setCurrentIndex(ni);
      setIsAnswered(false); setSelectedOpt(null); setShowExplanation(false);
      const state = { questions, currentIndex: ni, score };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(STORAGE_KEY);
      setView('result');
    }
  };

  const restart = () => {
    setCurrentIndex(0); setScore(0);
    setIsAnswered(false); setSelectedOpt(null); setShowExplanation(false);
    const state = { questions, currentIndex: 0, score: 0 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setView('quiz');
  };

  const newQuiz = () => {
    setJsonInput(''); setSavedState(null); setError('');
    setView('setup');
  };

  const copyPrompt = () => {
    navigator.clipboard.writeText(PROMPT_TEMPLATE);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  /* ----------------------------------------------------------------
     Render helpers
  ---------------------------------------------------------------- */
  const q = questions[currentIndex];
  const pct = questions.length ? Math.round(((currentIndex + 1) / questions.length) * 100) : 0;
  const resultPct = questions.length ? score / questions.length : 0;

  const getOptClass = (opt) => {
    if (!isAnswered) return 'qz-option';
    if (opt === questions[currentIndex].correctAnswer) return 'qz-option correct';
    if (opt === selectedOpt) return 'qz-option wrong';
    return 'qz-option disabled';
  };

  /* ----------------------------------------------------------------
     Views
  ---------------------------------------------------------------- */
  if (view === 'setup') return (
    <div className="qz-page">
      <div className="qz-setup">
        <div className="qz-hero">
          <h1 className="qz-h1">Quiz Generator</h1>
          <p className="qz-sub">Paste AI-generated JSON to start an interactive quiz.</p>
        </div>

        {/* AI Prompt */}
        <div className="qz-panel glass">
          <div className="qz-panel-header">
            <h3>AI Prompt Template</h3>
            <button className="btn btn-ghost qz-copy-prompt-btn" onClick={copyPrompt}>
              {promptCopied ? '✓ Copied!' : (
                <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Prompt</>
              )}
            </button>
          </div>
          <div className="qz-prompt-body">
            <code>{PROMPT_TEMPLATE}</code>
          </div>
        </div>

        {/* JSON input */}
        <div className="qz-panel glass">
          <label className="qz-label">JSON Quiz Data</label>
          <textarea
            className="qz-textarea"
            value={jsonInput}
            onChange={e => setJsonInput(e.target.value)}
            placeholder='Paste your JSON array here…'
          />
          {error && <div className="qz-error">{error}</div>}
          <div className="qz-actions">
            {savedState && (
              <button className="btn btn-ghost" onClick={resume}>Resume Saved Quiz</button>
            )}
            <button className="btn btn-primary" onClick={startNew}>Start Quiz</button>
          </div>
        </div>
      </div>
    </div>
  );

  if (view === 'quiz') return (
    <div className="qz-page">
      <div className="qz-quiz-wrap">
        {/* Progress */}
        <div className="qz-progress-row">
          <div className="qz-progress-track">
            <div className="qz-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="qz-progress-label">Question {currentIndex + 1} of {questions.length}</span>
          <span className="qz-score-badge">Score: <strong>{score}</strong></span>
        </div>

        {/* Question */}
        <div className="qz-panel glass qz-question-panel">
          <h2 className="qz-question" dangerouslySetInnerHTML={{ __html: formatText(q.question) }} />

          {(q.code || q.codeBlock) && (
            <div dangerouslySetInnerHTML={{ __html: makeCodeBlock((q.code || q.codeBlock).trim(), q.language || 'javascript') }} />
          )}

          <div className="qz-options">
            {q.options.map((opt, i) => (
              <button
                key={i}
                className={getOptClass(opt)}
                onClick={() => handleAnswer(opt)}
                disabled={isAnswered}
                dangerouslySetInnerHTML={{ __html: formatText(opt) }}
              />
            ))}
          </div>
        </div>

        {/* Explanation */}
        {showExplanation && (
          <div className="qz-panel glass qz-explanation">
            <h3>Explanation</h3>
            <p dangerouslySetInnerHTML={{ __html: formatText(q.explanation) }} />
          </div>
        )}

        {/* Next */}
        {isAnswered && (
          <div className="qz-next-row">
            <button className="btn btn-primary" onClick={next}>
              {currentIndex < questions.length - 1 ? 'Next Question →' : 'Finish Quiz'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (view === 'result') return (
    <div className="qz-page">
      <div className="qz-result-wrap">
        <div className="qz-panel glass qz-result-panel">
          <div className="qz-trophy">
            <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
              <path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
            </svg>
          </div>
          <h1>Quiz Complete!</h1>
          <div className="qz-final-score">
            <span className="qz-score-num">{score}</span>
            <span className="qz-score-denom">/ {questions.length}</span>
          </div>
          <p className="qz-result-msg">
            {resultPct === 1 ? 'Perfect score! Outstanding!' :
             resultPct >= 0.7 ? 'Great job! Solid understanding.' :
             resultPct >= 0.5 ? 'Good effort! Keep practising.' :
             'Keep learning — every mistake is progress.'}
          </p>
          <div className="qz-actions qz-result-actions">
            <button className="btn btn-ghost" onClick={restart}>Take Again</button>
            <button className="btn btn-primary" onClick={newQuiz}>New Quiz</button>
          </div>
        </div>
      </div>
    </div>
  );
}
