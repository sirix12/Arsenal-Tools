// DOM Elements
const views = {
    setup: document.getElementById('setup-view'),
    quiz: document.getElementById('quiz-view'),
    result: document.getElementById('result-view')
};

// Setup Elements
const jsonInput = document.getElementById('json-input');
const startBtn = document.getElementById('start-btn');
const resumeBtn = document.getElementById('resume-btn');
const copyPromptBtn = document.getElementById('copy-prompt-btn');
const setupError = document.getElementById('setup-error');

// Quiz Elements
const progressBarFill = document.getElementById('progress-bar-fill');
const progressText = document.getElementById('progress-text');
const currentScoreEl = document.getElementById('current-score');
const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const explanationPanel = document.getElementById('explanation-panel');
const explanationText = document.getElementById('explanation-text');
const quizActions = document.getElementById('quiz-actions');
const nextBtn = document.getElementById('next-btn');

// Result Elements
const finalScoreEl = document.getElementById('final-score');
const totalScoreEl = document.getElementById('total-score');
const resultMessage = document.getElementById('result-message');
const restartBtn = document.getElementById('restart-btn');
const newQuizBtn = document.getElementById('new-quiz-btn');

// State
let state = {
    questions: [],
    currentIndex: 0,
    score: 0,
    isAnswered: false
};

const STORAGE_KEY = 'quiz_app_state';

// Initialize
function init() {
    // Check for saved state
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState) {
        try {
            const parsed = JSON.parse(savedState);
            // Only show resume if there are questions and it's not completed
            if (parsed && parsed.questions && parsed.questions.length > 0 && parsed.currentIndex < parsed.questions.length) {
                resumeBtn.classList.remove('hidden');
                // Store the parsed state temporarily, we will load it if they click resume
                window.__savedState = parsed;
            }
        } catch (e) {
            console.error("Failed to parse saved state", e);
            localStorage.removeItem(STORAGE_KEY);
        }
    }

    // Event Listeners
    copyPromptBtn.addEventListener('click', handleCopyPrompt);
    startBtn.addEventListener('click', handleStartNew);
    resumeBtn.addEventListener('click', handleResume);
    nextBtn.addEventListener('click', handleNextQuestion);
    restartBtn.addEventListener('click', handleRestart);
    newQuizBtn.addEventListener('click', handleNewQuiz);
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearState() {
    localStorage.removeItem(STORAGE_KEY);
}

function switchView(viewName) {
    Object.values(views).forEach(v => {
        v.classList.remove('active');
        // Small delay to allow transform animation out before hiding
        setTimeout(() => {
            if (!v.classList.contains('active')) {
                v.style.display = 'none';
            }
        }, 400);
    });

    const target = views[viewName];
    target.style.display = 'block';
    // Force reflow
    void target.offsetWidth;
    target.classList.add('active');
}

function handleCopyPrompt() {
    const code = document.querySelector('.prompt-content code').innerText;
    navigator.clipboard.writeText(code).then(() => {
        const span = copyPromptBtn.querySelector('span');
        const originalText = span.innerText;
        span.innerText = 'Copied!';
        setTimeout(() => {
            span.innerText = originalText;
        }, 2000);
    });
}

function parseInput() {
    setupError.classList.add('hidden');
    const raw = jsonInput.value.trim();
    if (!raw) {
        showError("Please paste some JSON data first.");
        return null;
    }

    try {
        const data = JSON.parse(raw);
        if (!Array.isArray(data)) {
            showError("Data must be a JSON array.");
            return null;
        }
        if (data.length === 0) {
            showError("Array is empty.");
            return null;
        }
        
        // Validate items
        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            if (!item.question || !Array.isArray(item.options) || item.options.length !== 4 || !item.correctAnswer || !item.explanation) {
                showError(`Item at index ${i} is missing required fields or format is incorrect.`);
                return null;
            }
        }
        return data;
    } catch (e) {
        showError("Invalid JSON structure. Please check for syntax errors.");
        return null;
    }
}

function showError(msg) {
    setupError.innerText = msg;
    setupError.classList.remove('hidden');
}

function handleStartNew() {
    const questions = parseInput();
    if (!questions) return;

    state = {
        questions: questions,
        currentIndex: 0,
        score: 0,
        isAnswered: false
    };
    saveState();
    startQuiz();
}

function handleResume() {
    if (window.__savedState) {
        state = window.__savedState;
        startQuiz();
    }
}

function startQuiz() {
    switchView('quiz');
    renderQuestion();
}

function renderQuestion() {
    const q = state.questions[state.currentIndex];
    
    // Update header
    progressText.innerText = `Question ${state.currentIndex + 1} of ${state.questions.length}`;
    progressBarFill.style.width = `${((state.currentIndex + 1) / state.questions.length) * 100}%`;
    currentScoreEl.innerText = state.score;

    // Set text
    questionText.innerText = q.question;
    
    // Clear previous options and state
    optionsContainer.innerHTML = '';
    explanationPanel.classList.add('hidden');
    quizActions.classList.add('hidden');
    state.isAnswered = false;

    // Render options
    q.options.forEach((opt, index) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt;
        btn.onclick = () => handleAnswer(opt, btn);
        optionsContainer.appendChild(btn);
    });
}

function handleAnswer(selectedOption, btnElement) {
    if (state.isAnswered) return;
    state.isAnswered = true;

    const q = state.questions[state.currentIndex];
    const isCorrect = selectedOption === q.correctAnswer;

    // Disable all buttons
    const buttons = optionsContainer.querySelectorAll('.option-btn');
    buttons.forEach(b => {
        b.disabled = true;
        if (b.innerText === q.correctAnswer) {
            b.classList.add('correct');
        } else if (b === btnElement && !isCorrect) {
            b.classList.add('wrong');
        }
    });

    if (isCorrect) {
        state.score++;
        currentScoreEl.innerText = state.score;
    }

    // Show explanation
    explanationText.innerText = q.explanation;
    explanationPanel.classList.remove('hidden');

    // Show next button
    if (state.currentIndex < state.questions.length - 1) {
        nextBtn.innerText = "Next Question";
    } else {
        nextBtn.innerText = "Finish Quiz";
    }
    quizActions.classList.remove('hidden');

    // We don't save immediately on answer because if they reload, they can just retry the current question. 
    // Or we could save it, but we'd need to store 'isAnswered' and 'selectedOption'. 
    // For simplicity, we just let them restart the current question on reload.
}

function handleNextQuestion() {
    state.currentIndex++;
    
    if (state.currentIndex < state.questions.length) {
        saveState();
        renderQuestion();
    } else {
        showResults();
    }
}

function showResults() {
    // Clear state so it doesn't try to resume a finished quiz
    clearState();
    
    finalScoreEl.innerText = state.score;
    totalScoreEl.innerText = `/ ${state.questions.length}`;

    const percentage = state.score / state.questions.length;
    if (percentage === 1) {
        resultMessage.innerText = "Perfect! You nailed every question!";
    } else if (percentage >= 0.7) {
        resultMessage.innerText = "Great job! You have a solid understanding.";
    } else if (percentage >= 0.5) {
        resultMessage.innerText = "Good effort! A little more practice and you'll be there.";
    } else {
        resultMessage.innerText = "Keep learning! Every mistake is a step towards understanding.";
    }

    switchView('result');
}

function handleRestart() {
    state.currentIndex = 0;
    state.score = 0;
    state.isAnswered = false;
    saveState();
    startQuiz();
}

function handleNewQuiz() {
    jsonInput.value = '';
    resumeBtn.classList.add('hidden');
    switchView('setup');
}

// Run on load
document.addEventListener('DOMContentLoaded', init);
