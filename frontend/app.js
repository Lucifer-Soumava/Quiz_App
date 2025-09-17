// ====================
// CONFIG
// ====================
const API_BASE = "http://127.0.0.1:8000";
let currentQuizId = null;
let currentQuizTitle = null;
let playerName = null;
let questions = [];
let score = 0;
let adminStatusInterval = null;
let participantPollInterval = null;
let timerInterval = null;
let timeLeft = 0;

// ====================
// EVENT BINDING
// ====================
document.addEventListener("DOMContentLoaded", () => {
  // Admin page elements
  const createBtn = document.getElementById("createQuizBtn");
  if (createBtn) createBtn.addEventListener("click", createQuiz);

  const addQBtn = document.getElementById("addQuestionBtn");
  if (addQBtn) addQBtn.addEventListener("click", addQuestion);

  const startTimerBtn = document.getElementById("startTimerBtn");
  if (startTimerBtn) startTimerBtn.addEventListener("click", () => startTimerForQuiz(currentQuizId));

  const plus20Btn = document.getElementById("plus20Btn");
  if (plus20Btn) plus20Btn.addEventListener("click", () => adjustTimerForQuiz(currentQuizId, 20));

  const minus20Btn = document.getElementById("minus20Btn");
  if (minus20Btn) minus20Btn.addEventListener("click", () => adjustTimerForQuiz(currentQuizId, -20));

  // Play page
  const joinBtn = document.getElementById("joinQuizBtn");
  if (joinBtn) joinBtn.addEventListener("click", joinQuiz);

  const submitBtn = document.getElementById("submitAnswersBtn");
  if (submitBtn) submitBtn.addEventListener("click", () => submitAnswers());

  // If admin page is open and a quiz exists (e.g. after create), start polling admin status display
  const existingQuizId = currentQuizIdFromDOM();
  if (existingQuizId) {
    currentQuizId = existingQuizId;
    startAdminStatusPoll(existingQuizId);
  }

  // load leaderboard if result page
  loadLeaderboard();
});

// Helper: read currentQuizId from DOM (quizCode) if present
function currentQuizIdFromDOM() {
  const el = document.getElementById("quizCode");
  if (!el) return null;
  // element is like "Quiz ID: abc123"
  const txt = el.innerText || "";
  const parts = txt.split(":");
  if (parts.length < 2) return null;
  return parts[1].trim() || null;
}

// ====================
// ADMIN FUNCTIONS
// ====================
async function createQuiz() {
  const title = document.getElementById("quizTitle")?.value;
  const timerMinutes = parseInt(document.getElementById("quizTimer")?.value) || 0;
  const timerSeconds = timerMinutes * 60;

  if (!title) {
    alert("Please enter a quiz title!");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/quizzes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, questions: [], timer: timerSeconds })
    });
    if (!res.ok) throw new Error("Failed to create quiz");
    const data = await res.json();
    currentQuizId = data.quiz_id;
    currentQuizTitle = title;
    document.getElementById("quizCode").innerText = "Quiz ID: " + currentQuizId;
    document.getElementById("questionForm").style.display = "block";
    document.getElementById("adminControls").style.display = "flex";
    // start polling admin status to show time left
    startAdminStatusPoll(currentQuizId);
  } catch (err) {
    console.error(err);
    alert("Error creating quiz. Check backend.");
  }
}

async function addQuestion() {
  if (!currentQuizId) {
    alert("Please create a quiz first!");
    return;
  }

  const questionText = document.getElementById("questionText").value;
  const options = [
    document.getElementById("option1").value,
    document.getElementById("option2").value,
    document.getElementById("option3").value,
    document.getElementById("option4").value
  ].filter(opt => opt.trim() !== "");

  const answerText = document.getElementById("answer").value;
  const answerIndex = options.indexOf(answerText);

  if (!questionText || options.length < 2 || answerIndex === -1) {
    alert("Please fill all fields (at least 2 options) and ensure the correct answer matches one option.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/questions/${currentQuizId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: questionText, options, answer: answerIndex })
    });

    if (!res.ok) throw new Error("Failed to add question");
    document.getElementById("questionStatus").innerText = "✅ Question added!";
    // clear inputs
    ["questionText","option1","option2","option3","option4","answer"].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = "";
    });
  } catch (err) {
    console.error(err);
    alert("Error adding question. Check backend.");
  }
}

// Start timer endpoint
async function startTimerForQuiz(quizId) {
  if (!quizId) { alert("Quiz not created yet"); return; }
  try {
    const res = await fetch(`${API_BASE}/quizzes/${quizId}/start`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to start");
    const data = await res.json();
    updateAdminTimerDisplay(data.time_left);
  } catch (err) {
    console.error(err);
    alert("Error starting quiz timer.");
  }
}

// Adjust timer by delta seconds (positive or negative)
async function adjustTimerForQuiz(quizId, deltaSeconds) {
  if (!quizId) { alert("Quiz not created yet"); return; }
  try {
    const res = await fetch(`${API_BASE}/quizzes/${quizId}/adjust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta: deltaSeconds })
    });
    if (!res.ok) throw new Error("Adjust failed");
    const data = await res.json();
    updateAdminTimerDisplay(data.time_left);
  } catch (err) {
    console.error(err);
    alert("Error adjusting timer.");
  }
}

// Poll admin status (to show live remaining time)
function startAdminStatusPoll(quizId) {
  if (!quizId) return;
  clearInterval(adminStatusInterval);
  async function poll() {
    try {
      const res = await fetch(`${API_BASE}/quizzes/${quizId}/status`);
      if (!res.ok) return;
      const data = await res.json();
      updateAdminTimerDisplay(data.time_left, data.started);
      // also allow admin to see questions when started
      if (data.started) {
        document.getElementById("questionForm").style.display = "block";
      }
    } catch (err) {
      console.error("admin poll error", err);
    }
  }
  poll();
  adminStatusInterval = setInterval(poll, 2000);
}

function updateAdminTimerDisplay(time_left_seconds, started = false) {
  const el = document.getElementById("adminTimerDisplay");
  if (!el) return;
  const mins = Math.floor(time_left_seconds / 60);
  const secs = time_left_seconds % 60;
  el.innerText = `Time left: ${mins}:${secs < 10 ? "0" : ""}${secs}` + (started ? " (running)" : " (not started)");
  document.getElementById("adminControls").style.display = "flex";
}

// ====================
// PLAYER FUNCTIONS
// ====================
async function joinQuiz() {
  playerName = document.getElementById("playerName")?.value;
  currentQuizId = document.getElementById("quizIdInput")?.value;

  if (!playerName || !currentQuizId) {
    alert("Enter your name and quiz ID");
    return;
  }

  // clear any previous answers map
  window.userAnswers = {};
  questions = [];

  try {
    // call status endpoint (participant view)
    const res = await fetch(`${API_BASE}/quizzes/${currentQuizId}/status`);
    if (!res.ok) throw new Error("Quiz not found");
    const data = await res.json();
    currentQuizTitle = data.title || currentQuizTitle;

    if (!data.started) {
      // show waiting UI and poll until started
      document.getElementById("quizContainer").innerHTML = `<div class="card"><p class="hint">Waiting for the admin to start the quiz...</p></div>`;
      document.getElementById("timerDisplay").innerText = "";
      startParticipantPollForStart(currentQuizId);
      return;
    }

    // if started, load questions + start timer
    questions = data.questions;
    renderQuestions();
    startQuizTimer(data.time_left);
  } catch (err) {
    console.error(err);
    alert("Could not load quiz. Check ID.");
  }
}

// Poll until admin starts the quiz, then load questions and timer
function startParticipantPollForStart(quizId) {
  // Poll the status every 1.5s until started, then continue polling while running
  clearInterval(participantPollInterval);

  async function poll() {
    try {
      const res = await fetch(`${API_BASE}/quizzes/${quizId}/status`);
      if (!res.ok) return;
      const data = await res.json();

      // If not started, show waiting and display configured duration
      if (!data.started) {
        const preTime = data.time_left;
        const mins = Math.floor(preTime / 60);
        const secs = preTime % 60;
        const el = document.getElementById("timerDisplay");
        if (el) el.innerText = `Quiz will start when admin clicks start. Duration: ${mins}m ${secs}s`;
        return;
      }

      // If started, set server-provided questions and time_left, then start the running poll+timer
      questions = data.questions || [];
      currentQuizTitle = data.title || currentQuizTitle;

      // render questions once
      renderQuestions();

      // sync timeLeft to server value and start local countdown
      syncAndStartTimer(data.time_left);

      // ensure we keep polling to pick up adjustments / remaining time
      // The function below will ensure polling continues during running.
    } catch (err) {
      console.error("participant pre-start poll error:", err);
    }
  }

  // initial immediate poll, then interval
  poll();
  participantPollInterval = setInterval(poll, 1500);
}

// ====================
// QUESTION RENDER + SUBMIT
// ====================
function renderQuestions() {
  const container = document.getElementById("quizContainer");
  container.innerHTML = "";
  if (!questions || !questions.length) {
    container.innerHTML = '<div class="card"><p class="hint">No questions yet.</p></div>';
    return;
  }

  questions.forEach((q, idx) => {
    const card = document.createElement("div");
    card.className = "question-card";
    const title = document.createElement("h3");
    title.innerText = `${idx + 1}. ${q.question}`;
    card.appendChild(title);

    const opts = document.createElement("div");
    opts.className = "options";

    q.options.forEach((opt, optIdx) => {
      const btn = document.createElement("div");
      btn.className = "option-btn";
      btn.setAttribute("data-q", idx);
      btn.setAttribute("data-opt", optIdx);

      const dot = document.createElement("span");
      dot.className = "dot";
      btn.appendChild(dot);

      const label = document.createElement("span");
      label.innerText = opt;
      btn.appendChild(label);

      btn.addEventListener("click", () => {
        const siblings = opts.querySelectorAll(".option-btn");
        siblings.forEach(s => s.classList.remove("selected"));
        btn.classList.add("selected");
        window.userAnswers = window.userAnswers || {};
        window.userAnswers[idx] = optIdx;
      });

      opts.appendChild(btn);
    });

    card.appendChild(opts);
    container.appendChild(card);
  });

  const submitBtn = document.getElementById("submitAnswersBtn");
  if (submitBtn) submitBtn.style.display = "block";
}

async function submitAnswers() {
  // compute score
  let selectedMap = window.userAnswers || {};
  score = 0;
  questions.forEach((q, idx) => {
    const sel = (selectedMap[idx] !== undefined) ? selectedMap[idx] : ( () => {
      const el = document.querySelector(`input[name="q${idx}"]:checked`);
      return el ? parseInt(el.value) : null;
    })();
    if (sel !== null && parseInt(sel) === q.answer) score++;
  });

  try {
    await fetch(`${API_BASE}/score/${currentQuizId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: playerName, score })
    });

    localStorage.setItem("lastScore", score);
    localStorage.setItem("lastPlayer", playerName);
    localStorage.setItem("lastQuizId", currentQuizId);

    // show animated completion modal (then redirect to results)
    showCompletionModal(currentQuizTitle || "Quiz");
  } catch (err) {
    console.error(err);
    alert("Error submitting score.");
  }
}

// ====================
// TIMER (participant visible)
// ====================
function startQuizTimer(seconds) {
  // clear previous
  clearInterval(timerInterval);
  let timeLeft = seconds;
  const display = document.getElementById("timerDisplay");
  if (!display) return;

  function tick() {
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    display.innerText = `Time Left: ${mins}:${secs < 10 ? "0" : ""}${secs}`;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      alert("Time's up! Submitting answers...");
      submitAnswers();
    }
    timeLeft--;
  }

  tick();
  timerInterval = setInterval(tick, 1000);
}

// ====================
// LEADERBOARD
// ====================
async function loadLeaderboard() {
  const container = document.getElementById("leaderboard");
  if (!container) return;

  const quizId = currentQuizId || localStorage.getItem("lastQuizId");
  if (!quizId) {
    container.innerHTML = "<div class='card'><p class='hint'>No leaderboard available.</p></div>";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/leaderboard/${quizId}`);
    if (!res.ok) throw new Error("No leaderboard");
    const data = await res.json();

    // styled leaderboard markup
    const card = document.createElement("div");
    card.className = "leaderboard-card";
    const list = document.createElement("ul");
    list.className = "leaderboard-list";

    data.forEach((entry, i) => {
      const li = document.createElement("li");
      li.className = "leaderboard-item";
      if (entry.name === (localStorage.getItem("lastPlayer") || playerName)) li.classList.add("me");

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.alignItems = "center";
      left.style.gap = "12px";

      const rank = document.createElement("div");
      rank.className = "rank";
      if (i === 0) rank.classList.add("gold");
      else if (i === 1) rank.classList.add("silver");
      else if (i === 2) rank.classList.add("bronze");
      else rank.classList.add("default");
      rank.innerText = (i + 1);

      const nameSpan = document.createElement("div");
      nameSpan.className = "lb-name";
      nameSpan.innerText = entry.name;

      left.appendChild(rank);
      left.appendChild(nameSpan);

      const scoreSpan = document.createElement("div");
      scoreSpan.className = "lb-score";
      scoreSpan.innerText = entry.score;

      li.appendChild(left);
      li.appendChild(scoreSpan);
      list.appendChild(li);
    });

    card.appendChild(list);
    container.innerHTML = "";
    container.appendChild(card);
  } catch (err) {
    console.error(err);
    container.innerHTML = "<div class='card'><p class='hint'>No leaderboard yet.</p></div>";
  }
}

/* -----------------------------
   Completion modal (copy from earlier)
   ----------------------------- */
function showCompletionModal(quizTitle) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const modal = document.createElement("div");
  modal.className = "completion-modal";

  const checkWrap = document.createElement("div");
  checkWrap.className = "checkmark-wrap";
  checkWrap.innerHTML = `
    <svg class="checkmark" viewBox="0 0 52 52" aria-hidden="true">
      <path d="M14 27 L22 34 L38 16" fill="none"/>
    </svg>
  `;
  modal.appendChild(checkWrap);

  const h = document.createElement("h3");
  h.innerText = "Thanks for participating!";
  modal.appendChild(h);

  const p = document.createElement("p");
  p.innerText = `You completed the "${quizTitle}" quiz.`;
  modal.appendChild(p);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.innerText = "Redirecting to results...";
  modal.appendChild(hint);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const colors = ["#ef4444", "#f97316", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6"];
  const confettiCount = 18;
  for (let i = 0; i < confettiCount; i++) {
    const c = document.createElement("div");
    c.className = "confetti-piece";
    const left = Math.random() * 100;
    c.style.left = left + "vw";
    c.style.top = (Math.random() * -6) + "vh";
    c.style.background = colors[i % colors.length];
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    const delay = Math.random() * 0.12;
    const duration = 1.2 + Math.random() * 0.9;
    c.style.animationDuration = duration + "s";
    c.style.animationDelay = delay + "s";
    c.style.borderRadius = (Math.random() > 0.6) ? "3px" : "1px";
    document.body.appendChild(c);
    setTimeout(() => c.remove(), (duration + delay) * 1000 + 800);
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.remove();
      window.location.href = "result.html";
    }
  });

  setTimeout(() => {
    modal.classList.add("fade-out");
    overlay.classList.add("fade-out");
    setTimeout(() => {
      try { overlay.remove(); } catch (e) {}
      window.location.href = "result.html";
    }, 380);
  }, 2400);
}
function syncAndStartTimer(serverSeconds) {
  // clear any existing local timer
  clearInterval(timerInterval);

  // set authoritative timeLeft from server
  timeLeft = Math.max(0, parseInt(serverSeconds || 0));

  // start countdown tick that relies on local timeLeft
  const display = document.getElementById("timerDisplay");
  function tick() {
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    if (display) display.innerText = `Time Left: ${mins}:${secs < 10 ? "0" : ""}${secs}`;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      // stop polling too because quiz ended
      if (participantPollInterval) { clearInterval(participantPollInterval); participantPollInterval = null; }
      // auto-submit
      alert("Time's up! Submitting answers...");
      submitAnswers();
      return;
    }
    timeLeft--;
  }
  tick();
  timerInterval = setInterval(tick, 1000);

  // ensure participant keeps polling server for resync/adjusts every 1.5s
  // If a poll is already set (e.g. from pre-start), keep it; otherwise create one.
  if (!participantPollInterval) {
    async function runningPoll() {
      try {
        const res = await fetch(`${API_BASE}/quizzes/${currentQuizId}/status`);
        if (!res.ok) return;
        const data = await res.json();
        // server's time_left is authoritative; resync if difference > 1 second
        const serverLeft = parseInt(data.time_left || 0);
        if (Math.abs(serverLeft - timeLeft) > 1) {
          // resync local to server value
          timeLeft = serverLeft;
        }
      } catch (err) {
        console.error("participant running poll error:", err);
      }
    }
    // initial poll + interval
    runningPoll();
    participantPollInterval = setInterval(runningPoll, 1500);
  }
}

// ---------- Also update startQuizTimer usage: replace any earlier startQuizTimer with call to syncAndStartTimer
// Example: where you previously had `startQuizTimer(data.time_left)`, change to:
 // syncAndStartTimer(data.time_left);

// ---------- Clean-up helper (call where appropriate, e.g. on page unload) ----------
window.addEventListener("beforeunload", () => {
  clearInterval(participantPollInterval);
  clearInterval(timerInterval);
});
