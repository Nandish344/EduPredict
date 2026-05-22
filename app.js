
'use strict';

let currentUser  = null;
let studentData  = {};
let bootstrapped = false;   // ← FIX ①: prevents re-render on token refresh

// ============================================================
//  UTILITIES
// ============================================================

function showLoading(v) {
  document.getElementById('loading').classList.toggle('hidden', !v);
}

function showMsg(id, msg, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--danger)' : 'var(--success)';
  setTimeout(() => { el.textContent = ''; }, 4000);
}

// ← FIX ②: Fully replace the canvas element before each new chart.
//   This is more reliable than chart.destroy() alone.
function destroyAndRecreate(canvasId) {
  const old = document.getElementById(canvasId);
  if (!old) return;
  const parent = old.parentNode;
  parent.removeChild(old);
  const fresh = document.createElement('canvas');
  fresh.id = canvasId;
  parent.appendChild(fresh);
}

// ============================================================
//  AUTH — TAB SWITCHING
// ============================================================

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active',
      (i === 0 && tab === 'login') || (i === 1 && tab === 'register'));
  });
  document.getElementById('login-form').classList.toggle('active', tab === 'login');
  document.getElementById('register-form').classList.toggle('active', tab === 'register');
}

// ============================================================
//  REGISTER
// ============================================================

async function registerUser() {
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const dob      = document.getElementById('reg-dob').value;
  const cls      = document.getElementById('reg-class').value.trim();
  const duration = document.getElementById('reg-duration').value;
  const prevPct  = parseFloat(document.getElementById('reg-prev-percent').value);

  if (!name || !email || !password || !dob || !cls || !duration || isNaN(prevPct)) {
    return showMsg('register-error', '⚠️ Please fill all fields correctly.', true);
  }
  if (password.length < 6) {
    return showMsg('register-error', '⚠️ Password must be at least 6 characters.', true);
  }

  showLoading(true);
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection('students').doc(cred.user.uid).set({
      name,
      email,
      dob,
      class          : cls,
      duration,
      prevPercentage : prevPct,
      assignments    : { a1: null, a2: null },
      internals      : { i1: null, i2: null },
      dailyLogs      : [],
      createdAt      : firebase.firestore.FieldValue.serverTimestamp()
    });
    // onAuthStateChanged will fire and handle the dashboard transition
  } catch (err) {
    showLoading(false);
    showMsg('register-error', '❌ ' + friendlyError(err.code), true);
  }
}

// ============================================================
//  LOGIN
// ============================================================

async function loginUser() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    return showMsg('login-error', '⚠️ Enter your email and password.', true);
  }
  showLoading(true);
  try {
    await auth.signInWithEmailAndPassword(email, password);
    // onAuthStateChanged will fire and handle the dashboard transition
  } catch (err) {
    showLoading(false);
    showMsg('login-error', '❌ ' + friendlyError(err.code), true);
  }
}

// ============================================================
//  LOGOUT
// ============================================================

async function logoutUser() {
  if (!confirm('Are you sure you want to logout?')) return;
  bootstrapped = false;   // reset so next login works cleanly
  await auth.signOut();
}

// ============================================================
//  AUTH STATE OBSERVER  ← FIX ①
//
//  Firebase calls this every time the user's auth state changes,
//  including silent token refreshes. Without the `bootstrapped`
//  flag, every refresh would re-render the dashboard and recreate
//  all charts — causing memory overflow and the white screen.
// ============================================================

auth.onAuthStateChanged(async (user) => {

  if (user && !bootstrapped) {
    // ── First login or page load ──────────────────────────
    bootstrapped = true;
    currentUser  = user;

    showLoading(true);
    try {
      const doc   = await db.collection('students').doc(user.uid).get();
      studentData = doc.exists ? (doc.data() || {}) : {};
    } catch (e) {
      console.error('Firestore read failed:', e);
      studentData = {};
    }
    showLoading(false);

    // Switch to dashboard
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('dashboard-screen').classList.add('active');

    // Header info
    const name = studentData.name || 'Student';
    document.getElementById('user-name-display').textContent = name;
    document.getElementById('user-avatar').textContent =
      name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('header-date').textContent =
      new Date().toLocaleDateString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });

    populateForms();
    renderOverview();

  } else if (!user) {
    // ── Logged out ────────────────────────────────────────
    bootstrapped = false;
    currentUser  = null;
    studentData  = {};

    document.getElementById('auth-screen').classList.add('active');
    document.getElementById('dashboard-screen').classList.remove('active');
    showLoading(false);
  }
  // If user && bootstrapped → silent token refresh; do nothing.
});

// ============================================================
//  POPULATE SAVED MARKS INTO FORM INPUTS
// ============================================================

function populateForms() {
  const a = studentData.assignments || {};
  const i = studentData.internals   || {};
  if (a.a1 != null) document.getElementById('assign1').value   = a.a1;
  if (a.a2 != null) document.getElementById('assign2').value   = a.a2;
  if (i.i1 != null) document.getElementById('internal1').value = i.i1;
  if (i.i2 != null) document.getElementById('internal2').value = i.i2;
}

// ============================================================
//  NAVIGATION
// ============================================================

const SECTION_TITLES = {
  'overview'       : 'Overview',
  'assignments'    : 'Assignments',
  'internals'      : 'Internal Exams',
  'daily-progress' : 'Daily Progress',
  'prediction'     : 'Grade Prediction',
  'analytics'      : 'Analytics'
};

function showSection(name) {
  // Hide all sections
  document.querySelectorAll('.content-section')
    .forEach(s => s.classList.remove('active'));

  // Update nav highlight
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.getAttribute('onclick')?.includes(`'${name}'`));
  });

  // Show target section
  const target = document.getElementById(name);
  if (target) target.classList.add('active');

  // Update header title
  document.getElementById('section-title').textContent =
    SECTION_TITLES[name] || name;

  // Render the chart(s) for this section (only when visible)
  const renderers = {
    'overview'       : renderOverview,
    'assignments'    : renderAssignChart,
    'internals'      : renderInternalChart,
    'daily-progress' : renderDailyChart,
    'analytics'      : renderAnalytics
  };
  if (renderers[name]) renderers[name]();
}

// ============================================================
//  SAVE ASSIGNMENTS
// ============================================================

async function saveAssignments() {
  const a1 = parseFloat(document.getElementById('assign1').value);
  const a2 = parseFloat(document.getElementById('assign2').value);

  if (isNaN(a1) || isNaN(a2) || a1 < 0 || a1 > 5 || a2 < 0 || a2 > 5) {
    return showMsg('assign-msg', '⚠️ Marks must be between 0 and 5.', true);
  }
  showLoading(true);
  await db.collection('students').doc(currentUser.uid).update({ assignments: { a1, a2 } });
  studentData.assignments = { a1, a2 };
  showLoading(false);
  showMsg('assign-msg', '✅ Assignment marks saved!');
  renderAssignChart();
  updateStatCards();
}

// ============================================================
//  SAVE INTERNALS
// ============================================================

async function saveInternals() {
  const i1 = parseFloat(document.getElementById('internal1').value);
  const i2 = parseFloat(document.getElementById('internal2').value);

  if (isNaN(i1) || isNaN(i2) || i1 < 0 || i1 > 50 || i2 < 0 || i2 > 50) {
    return showMsg('internal-msg', '⚠️ Marks must be between 0 and 50.', true);
  }
  showLoading(true);
  await db.collection('students').doc(currentUser.uid).update({ internals: { i1, i2 } });
  studentData.internals = { i1, i2 };
  showLoading(false);
  showMsg('internal-msg', '✅ Internal marks saved!');
  renderInternalChart();
  updateStatCards();
}

// ============================================================
//  SAVE DAILY PROGRESS
// ============================================================

async function saveDailyProgress() {
  const hours      = parseFloat(document.getElementById('d-hours').value);
  const attendance = parseFloat(document.getElementById('d-attendance').value);
  const sleep      = parseFloat(document.getElementById('d-sleep').value);
  const rest       = parseFloat(document.getElementById('d-rest').value);
  const confidence = parseFloat(document.getElementById('d-confidence').value);
  const distract   = parseFloat(document.getElementById('d-distraction').value) || 0;
  const topics     = document.getElementById('d-topics').value.trim();
  const mood       = parseInt(document.getElementById('d-mood').value);

  if ([hours, attendance, sleep, rest, confidence].some(v => isNaN(v))) {
    return showMsg('daily-msg', '⚠️ Please fill in all required fields.', true);
  }
  if (attendance < 0 || attendance > 100) {
    return showMsg('daily-msg', '⚠️ Attendance must be between 0 and 100.', true);
  }

  const mlScore   = mlDayScore({ hours, attendance, sleep, rest, confidence, distract, mood });
  const todayDate = new Date().toISOString().split('T')[0];

  const log = { date: todayDate, hours, attendance, sleep, rest, confidence, distract, topics, mood, mlScore };

  // Replace today's log if it already exists, otherwise append
  const logs = [...(studentData.dailyLogs || [])];
  const idx  = logs.findIndex(l => l.date === todayDate);
  if (idx >= 0) logs[idx] = log; else logs.push(log);
  logs.sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = logs.slice(-30);  // keep only last 30 days

  showLoading(true);
  await db.collection('students').doc(currentUser.uid).update({ dailyLogs: trimmed });
  studentData.dailyLogs = trimmed;
  showLoading(false);
  showMsg('daily-msg', `✅ Progress saved! Today's ML Score: ${mlScore.toFixed(1)} / 100`);
  renderDailyChart();
  updateStatCards();
}

// ============================================================
//  ML DAY SCORE  — Weighted Multi-Factor Model
//
//  Factors and weights based on academic performance research:
//  Study Hours (30) + Attendance (25) + Sleep (20) +
//  Confidence (10) + Mood (10) + Rest bonus (5) - Distraction (10)
// ============================================================

function mlDayScore({ hours, attendance, sleep, rest, confidence, distract, mood }) {
  const studyPts  = Math.min(hours / 8, 1) * 30;        // cap at 8h = full marks
  const attendPts = (attendance / 100) * 25;
  const sleepPts  = optimalSleep(sleep) * 20;            // bell-curve around 7-8h
  const confPts   = (confidence / 10) * 10;
  const moodPts   = (mood / 5) * 10;
  const distractP = Math.min(distract / 5, 1) * 10;     // penalty, max 10
  const restBonus = Math.min(rest / 3, 1) * 5;          // bonus, max 5

  const raw = studyPts + attendPts + sleepPts + confPts + moodPts + restBonus - distractP;
  return Math.max(0, Math.min(100, raw));
}

function optimalSleep(h) {
  if (h >= 7 && h <= 8)  return 1.00;
  if ((h >= 6 && h < 7) || (h > 8 && h <= 9))  return 0.85;
  if ((h >= 5 && h < 6) || (h > 9 && h <= 10)) return 0.60;
  return 0.30;
}

// ============================================================
//  GRADE PREDICTION ENGINE
// ============================================================

function runPrediction() {
  const a    = studentData.assignments   || {};
  const i    = studentData.internals     || {};
  const logs = studentData.dailyLogs     || [];
  const prev = studentData.prevPercentage || 50;

  const a1 = a.a1 != null ? a.a1 : 0;
  const a2 = a.a2 != null ? a.a2 : 0;
  const i1 = i.i1 != null ? i.i1 : 0;
  const i2 = i.i2 != null ? i.i2 : 0;

  const assignPct   = ((a1 + a2) / 10)  * 100;   // out of 10 → %
  const internalPct = ((i1 + i2) / 100) * 100;   // out of 100 → %
  const avgML       = logs.length
    ? logs.reduce((s, l) => s + l.mlScore, 0) / logs.length : 50;
  const avgAtt      = logs.length
    ? logs.reduce((s, l) => s + l.attendance, 0) / logs.length : 75;

  const score = Math.max(0, Math.min(100,
    assignPct   * 0.10 +
    internalPct * 0.35 +
    avgML       * 0.30 +
    avgAtt      * 0.15 +
    prev        * 0.10
  ));

  const grade = scoreToGrade(score);

  document.getElementById('pred-grade-letter').textContent = grade;
  document.getElementById('pred-score-val').textContent    = score.toFixed(1);
  document.getElementById('stat-grade').textContent        = grade;

  document.getElementById('pred-breakdown').innerHTML = `
    <div class="breakdown-row"><span>📝 Assignments  (10%)</span><span>${assignPct.toFixed(1)}%</span></div>
    <div class="breakdown-row"><span>📋 Internals   (35%)</span><span>${internalPct.toFixed(1)}%</span></div>
    <div class="breakdown-row"><span>📅 Study Habits (30%)</span><span>${avgML.toFixed(1)}%</span></div>
    <div class="breakdown-row"><span>🎓 Attendance  (15%)</span><span>${avgAtt.toFixed(1)}%</span></div>
    <div class="breakdown-row"><span>📚 Previous Yr (10%)</span><span>${prev.toFixed(1)}%</span></div>
  `;
  document.getElementById('pred-advice').textContent = gradeAdvice(grade);
  document.getElementById('prediction-result').classList.remove('hidden');

  renderPredictionChart(assignPct, internalPct, avgML, avgAtt, prev);
}

function scoreToGrade(s) {
  if (s >= 90) return 'O';
  if (s >= 80) return 'A+';
  if (s >= 70) return 'A';
  if (s >= 60) return 'B+';
  if (s >= 50) return 'B';
  if (s >= 40) return 'C';
  return 'F';
}

function gradeAdvice(g) {
  const msgs = {
    'O' : '🏆 Outstanding! You are at the very top. Keep this momentum!',
    'A+': '🌟 Excellent! A small push in internals will get you to Outstanding.',
    'A' : '✅ Great work! Consistent daily study will get you to A+.',
    'B+': '📈 Good progress. Try to improve attendance and reduce distractions.',
    'B' : '⚡ Decent, but push harder. More study hours and better sleep will help.',
    'C' : '⚠️ Needs improvement. Study daily and attend all classes.',
    'F' : '🆘 At risk of failing. Please speak to your teacher immediately.'
  };
  return msgs[g] || '';
}

// ============================================================
//  UPDATE STAT CARDS
// ============================================================

function updateStatCards() {
  const a    = studentData.assignments || {};
  const i    = studentData.internals   || {};
  const logs = studentData.dailyLogs   || [];

  if (a.a1 != null && a.a2 != null)
    document.getElementById('stat-assignment').textContent =
      `${((a.a1 + a.a2) / 2).toFixed(1)}/5`;

  if (i.i1 != null && i.i2 != null)
    document.getElementById('stat-internal').textContent =
      `${((i.i1 + i.i2) / 2).toFixed(1)}/50`;

  document.getElementById('stat-days').textContent = logs.length;
}

// ============================================================
//  CHART HELPERS
// ============================================================

// ← FIX ③: maintainAspectRatio MUST be false. Height comes from
//   .chart-wrap CSS (220px fixed). If true, Chart.js ignores the
//   parent height and grows the canvas based on its own ratio.
const BASE_OPTS = {
  responsive          : true,
  maintainAspectRatio : false,
  animation           : { duration: 400 },
  plugins: {
    legend: {
      labels: { color: '#8899bb', font: { family: 'Space Grotesk', size: 12 } }
    }
  },
  scales: {
    x: { ticks: { color: '#8899bb' }, grid: { color: 'rgba(42,52,80,0.6)' } },
    y: { ticks: { color: '#8899bb' }, grid: { color: 'rgba(42,52,80,0.6)' } }
  }
};

// Always call destroyAndRecreate before creating a new chart.
function makeChart(canvasId, config) {
  destroyAndRecreate(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  return new Chart(ctx.getContext('2d'), config);
}

// ============================================================
//  RENDER: OVERVIEW
// ============================================================

function renderOverview() {
  updateStatCards();
  renderRecentLogs();

  const logs   = studentData.dailyLogs || [];
  const labels = logs.map(l => l.date.slice(5));  // MM-DD
  const scores = logs.map(l => l.mlScore);

  // Line chart — daily ML score trend
  makeChart('overview-chart', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label               : 'Daily ML Score',
        data                : scores,
        borderColor         : '#4f8ef7',
        backgroundColor     : 'rgba(79,142,247,0.12)',
        fill                : true,
        tension             : 0.4,
        pointBackgroundColor: '#4f8ef7',
        pointRadius         : 4,
        pointHoverRadius    : 6
      }]
    },
    options: {
      ...BASE_OPTS,
      scales: {
        x: { ...BASE_OPTS.scales.x },
        y: { ...BASE_OPTS.scales.y, min: 0, max: 100 }
      }
    }
  });

  // Radar chart — performance breakdown
  const a      = studentData.assignments || {};
  const i      = studentData.internals   || {};
  const avgDay = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
  const avgAtt = logs.length   ? logs.reduce((s, l) => s + l.attendance, 0) / logs.length : 0;
  const avgHrs = logs.length   ? logs.reduce((s, l) => s + l.hours, 0) / logs.length : 0;

  makeChart('radar-chart', {
    type: 'radar',
    data: {
      labels  : ['Assignments', 'Internals', 'Study Habits', 'Attendance', 'Study Hrs'],
      datasets: [{
        label               : 'You',
        data                : [
          ((a.a1 || 0) + (a.a2 || 0)) / 10  * 100,
          ((i.i1 || 0) + (i.i2 || 0)) / 100 * 100,
          avgDay,
          avgAtt,
          Math.min(avgHrs / 8, 1) * 100
        ],
        borderColor         : '#7c3aed',
        backgroundColor     : 'rgba(124,58,237,0.2)',
        pointBackgroundColor: '#7c3aed',
        pointRadius         : 5
      }]
    },
    options: {
      responsive          : true,
      maintainAspectRatio : false,
      animation           : { duration: 400 },
      plugins: { legend: { display: false } },
      scales: {
        r: {
          min         : 0,
          max         : 100,
          ticks       : { color: '#8899bb', backdropColor: 'transparent', stepSize: 25 },
          grid        : { color: 'rgba(42,52,80,0.5)' },
          pointLabels : { color: '#8899bb', font: { size: 11 } }
        }
      }
    }
  });
}

// ============================================================
//  RENDER: RECENT LOGS (text list, no chart)
// ============================================================

function renderRecentLogs() {
  const container = document.getElementById('recent-logs');
  const logs = [...(studentData.dailyLogs || [])].reverse().slice(0, 5);

  if (!logs.length) {
    container.innerHTML = '<p class="empty-msg">No logs yet. Add your first daily progress!</p>';
    return;
  }
  container.innerHTML = logs.map(l => `
    <div class="log-item">
      <span class="log-date">${l.date}</span>
      <div class="log-details">
        📚 ${l.hours}h studied &nbsp;·&nbsp;
        🎓 ${l.attendance}% attendance &nbsp;·&nbsp;
        😴 ${l.sleep}h sleep
        ${l.topics ? `<br>📝 ${l.topics}` : ''}
      </div>
      <span class="log-score">${l.mlScore.toFixed(0)}/100</span>
    </div>
  `).join('');
}

// ============================================================
//  RENDER: ASSIGNMENT CHART
// ============================================================

function renderAssignChart() {
  const a  = studentData.assignments || {};
  const a1 = a.a1 != null ? a.a1 : 0;
  const a2 = a.a2 != null ? a.a2 : 0;

  makeChart('assign-chart', {
    type: 'bar',
    data: {
      labels  : ['Assignment 1', 'Assignment 2', 'Maximum (5)'],
      datasets: [{
        data           : [a1, a2, 5],
        backgroundColor: ['#4f8ef7', '#7c3aed', 'rgba(42,52,80,0.5)'],
        borderRadius   : 8
      }]
    },
    options: {
      ...BASE_OPTS,
      plugins: { legend: { display: false } },
      scales : {
        x: { ...BASE_OPTS.scales.x },
        y: { ...BASE_OPTS.scales.y, min: 0, max: 5 }
      }
    }
  });
}

// ============================================================
//  RENDER: INTERNAL EXAM CHART
// ============================================================

function renderInternalChart() {
  const i  = studentData.internals || {};
  const i1 = i.i1 != null ? i.i1 : 0;
  const i2 = i.i2 != null ? i.i2 : 0;

  makeChart('internal-chart', {
    type: 'bar',
    data: {
      labels  : ['Internal 1', 'Internal 2', 'Maximum (50)'],
      datasets: [{
        data           : [i1, i2, 50],
        backgroundColor: ['#10b981', '#f59e0b', 'rgba(42,52,80,0.5)'],
        borderRadius   : 8
      }]
    },
    options: {
      ...BASE_OPTS,
      plugins: { legend: { display: false } },
      scales : {
        x: { ...BASE_OPTS.scales.x },
        y: { ...BASE_OPTS.scales.y, min: 0, max: 50 }
      }
    }
  });
}

// ============================================================
//  RENDER: DAILY PROGRESS CHART  (bar + line combo)
// ============================================================

function renderDailyChart() {
  const logs   = (studentData.dailyLogs || []).slice(-7);
  const labels = logs.map(l => l.date.slice(5));

  makeChart('daily-chart', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label          : 'Study Hours',
          data           : logs.map(l => l.hours),
          backgroundColor: 'rgba(79,142,247,0.75)',
          borderRadius   : 6,
          yAxisID        : 'yHours'
        },
        {
          type                : 'line',
          label               : 'ML Score',
          data                : logs.map(l => l.mlScore),
          borderColor         : '#10b981',
          backgroundColor     : 'rgba(16,185,129,0.1)',
          fill                : false,
          tension             : 0.4,
          pointRadius         : 5,
          pointHoverRadius    : 7,
          pointBackgroundColor: '#10b981',
          yAxisID             : 'yScore'
        }
      ]
    },
    options: {
      responsive          : true,
      maintainAspectRatio : false,
      animation           : { duration: 400 },
      plugins: { legend: { labels: { color: '#8899bb' } } },
      scales : {
        x      : { ticks: { color: '#8899bb' }, grid: { color: 'rgba(42,52,80,0.6)' } },
        yHours : {
          type    : 'linear',
          position: 'left',
          min     : 0,
          ticks   : { color: '#4f8ef7' },
          grid    : { color: 'rgba(42,52,80,0.6)' },
          title   : { display: true, text: 'Hours', color: '#4f8ef7' }
        },
        yScore : {
          type    : 'linear',
          position: 'right',
          min     : 0,
          max     : 100,
          ticks   : { color: '#10b981' },
          grid    : { drawOnChartArea: false },
          title   : { display: true, text: 'ML Score', color: '#10b981' }
        }
      }
    }
  });
}

// ============================================================
//  RENDER: PREDICTION DOUGHNUT CHART
// ============================================================

function renderPredictionChart(ap, ip, ml, att, prev) {
  makeChart('prediction-chart', {
    type: 'doughnut',
    data: {
      labels  : [
        'Assignments (10%)',
        'Internals (35%)',
        'Study Habits (30%)',
        'Attendance (15%)',
        'Previous Yr (10%)'
      ],
      datasets: [{
        data           : [ap * 0.10, ip * 0.35, ml * 0.30, att * 0.15, prev * 0.10],
        backgroundColor: ['#4f8ef7', '#7c3aed', '#10b981', '#f59e0b', '#ef4444'],
        borderColor    : '#161d2e',
        borderWidth    : 3
      }]
    },
    options: {
      responsive          : true,
      maintainAspectRatio : false,
      animation           : { duration: 400 },
      plugins: {
        legend: {
          position: 'right',
          labels  : { color: '#8899bb', padding: 14, font: { size: 12 } }
        }
      }
    }
  });
}

// ============================================================
//  RENDER: ANALYTICS CHARTS  (3 charts)
// ============================================================

function renderAnalytics() {
  const logs = studentData.dailyLogs || [];
  const a    = studentData.assignments   || {};
  const i    = studentData.internals     || {};
  const prev = studentData.prevPercentage || 50;

  const ap = ((a.a1 || 0) + (a.a2 || 0)) / 10  * 100;
  const ip = ((i.i1 || 0) + (i.i2 || 0)) / 100 * 100;

  // 1) Predicted score trajectory over all logged days
  const timeLabels = logs.map(l => l.date.slice(5));
  const trajectory = logs.map((_, idx) => {
    const slice  = logs.slice(0, idx + 1);
    const avgML  = slice.reduce((s, l) => s + l.mlScore, 0) / slice.length;
    const avgAtt = slice.reduce((s, l) => s + l.attendance, 0) / slice.length;
    return Math.max(0, Math.min(100,
      ap * 0.10 + ip * 0.35 + avgML * 0.30 + avgAtt * 0.15 + prev * 0.10
    ));
  });

  makeChart('analytics-chart', {
    type: 'line',
    data: {
      labels  : timeLabels,
      datasets: [{
        label               : 'Predicted Score (%)',
        data                : trajectory,
        borderColor         : '#7c3aed',
        backgroundColor     : 'rgba(124,58,237,0.12)',
        fill                : true,
        tension             : 0.4,
        pointBackgroundColor: '#7c3aed',
        pointRadius         : 4
      }]
    },
    options: {
      ...BASE_OPTS,
      scales: {
        x: { ...BASE_OPTS.scales.x },
        y: { ...BASE_OPTS.scales.y, min: 0, max: 100 }
      }
    }
  });

  // 2) Scatter: sleep hours vs ML score
  makeChart('sleep-chart', {
    type: 'scatter',
    data: {
      datasets: [{
        label          : 'Sleep vs Score',
        data           : logs.map(l => ({ x: l.sleep, y: l.mlScore })),
        backgroundColor: '#4f8ef7',
        pointRadius    : 7,
        pointHoverRadius: 9
      }]
    },
    options: {
      responsive          : true,
      maintainAspectRatio : false,
      animation           : { duration: 400 },
      plugins: { legend: { labels: { color: '#8899bb' } } },
      scales : {
        x: {
          title: { display: true, text: 'Sleep (hrs)', color: '#8899bb' },
          ticks: { color: '#8899bb' },
          grid : { color: 'rgba(42,52,80,0.6)' }
        },
        y: {
          title: { display: true, text: 'ML Score', color: '#8899bb' },
          ticks: { color: '#8899bb' },
          grid : { color: 'rgba(42,52,80,0.6)' },
          min  : 0,
          max  : 100
        }
      }
    }
  });

  // 3) Scatter: study hours vs ML score
  makeChart('study-chart', {
    type: 'scatter',
    data: {
      datasets: [{
        label          : 'Study Hrs vs Score',
        data           : logs.map(l => ({ x: l.hours, y: l.mlScore })),
        backgroundColor: '#10b981',
        pointRadius    : 7,
        pointHoverRadius: 9
      }]
    },
    options: {
      responsive          : true,
      maintainAspectRatio : false,
      animation           : { duration: 400 },
      plugins: { legend: { labels: { color: '#8899bb' } } },
      scales : {
        x: {
          title: { display: true, text: 'Study Hours', color: '#8899bb' },
          ticks: { color: '#8899bb' },
          grid : { color: 'rgba(42,52,80,0.6)' }
        },
        y: {
          title: { display: true, text: 'ML Score', color: '#8899bb' },
          ticks: { color: '#8899bb' },
          grid : { color: 'rgba(42,52,80,0.6)' },
          min  : 0,
          max  : 100
        }
      }
    }
  });
}

// ============================================================
//  FRIENDLY FIREBASE ERROR MESSAGES
// ============================================================

function friendlyError(code) {
  const map = {
    'auth/email-already-in-use'  : 'This email is already registered. Try logging in.',
    'auth/invalid-email'         : 'That email address is not valid.',
    'auth/weak-password'         : 'Password is too weak. Use at least 6 characters.',
    'auth/user-not-found'        : 'No account found with this email.',
    'auth/wrong-password'        : 'Incorrect password. Please try again.',
    'auth/invalid-credential'    : 'Incorrect email or password.',
    'auth/too-many-requests'     : 'Too many failed attempts. Please wait and try again.',
    'auth/network-request-failed': 'Network error. Please check your internet connection.'
  };
  return map[code] || 'Something went wrong. Please try again.';
}
