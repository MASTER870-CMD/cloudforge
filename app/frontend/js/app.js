/**
 * CloudForge Dashboard — Frontend Application Logic
 * Fetches data from the API and renders it into the dashboard UI.
 */

const API_BASE = '/api';

// ---------- State ----------
let currentSection = 'overview';

// ---------- DOM Helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---------- API Helpers ----------
async function api(endpoint) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[CloudForge] API call failed: ${endpoint}`, err);
    return null;
  }
}

// ---------- Format Helpers ----------
function formatDuration(ms) {
  if (!ms || ms === 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr.replace(' ', 'T') + 'Z');
    const now = new Date();
    const diff = now - d;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

function truncateSHA(sha) {
  if (!sha) return '—';
  return sha.substring(0, 7);
}

function statusBadge(status) {
  const safeStatus = (status || 'pending').toLowerCase().replace(' ', '_');
  return `<span class="badge badge--${safeStatus}">${safeStatus.replace('_', ' ')}</span>`;
}

// ---------- Render Stats ----------
async function renderStats() {
  const stats = await api('/stats');
  if (!stats) return;

  $('#stat-total-builds').textContent = stats.totalBuilds;
  $('#stat-success-rate').textContent = `${stats.successRate}%`;
  $('#stat-total-deploys').textContent = stats.totalDeployments;
  $('#stat-avg-build').textContent = formatDuration(stats.avgBuildTime);

  // Last Build
  if (stats.lastBuild) {
    const b = stats.lastBuild;
    $('#last-build-status').outerHTML = statusBadge(b.status);
    $('#last-build-sha').textContent = truncateSHA(b.commit_sha);
    $('#last-build-branch').textContent = b.branch || 'main';
    $('#last-build-duration').textContent = formatDuration(b.duration_ms);
    $('#last-build-time').textContent = formatTime(b.created_at);
  }

  // Last Deployment
  if (stats.lastDeployment) {
    const d = stats.lastDeployment;
    $('#last-deploy-status').outerHTML = statusBadge(d.status);
    $('#last-deploy-version').textContent = d.version || '—';
    $('#last-deploy-env').textContent = d.environment || '—';
    $('#last-deploy-sha').textContent = truncateSHA(d.commit_sha);
    $('#last-deploy-time').textContent = formatTime(d.created_at);
  }
}

// ---------- Render Builds Table ----------
async function renderBuilds() {
  const builds = await api('/builds');
  const tbody = $('#builds-tbody');
  if (!builds || builds.length === 0) {
    tbody.innerHTML = `<tr class="table__empty"><td colspan="7">No builds found.</td></tr>`;
    return;
  }

  tbody.innerHTML = builds.map(b => `
    <tr>
      <td>${statusBadge(b.status)}</td>
      <td><code class="mono">${truncateSHA(b.commit_sha)}</code></td>
      <td>${b.branch || 'main'}</td>
      <td>${b.triggered_by || 'push'}</td>
      <td>${formatDuration(b.duration_ms)}</td>
      <td>${formatTime(b.created_at)}</td>
      <td>
        <button class="btn btn--outline" onclick="viewLogs('build', '${b.id}', '${truncateSHA(b.commit_sha)}')" aria-label="View logs">
          View Logs
        </button>
      </td>
    </tr>
  `).join('');
}

// ---------- Render Deployments Table ----------
async function renderDeployments() {
  const deployments = await api('/deployments');
  const tbody = $('#deployments-tbody');
  if (!deployments || deployments.length === 0) {
    tbody.innerHTML = `<tr class="table__empty"><td colspan="7">No deployments found.</td></tr>`;
    return;
  }

  tbody.innerHTML = deployments.map(d => `
    <tr>
      <td>${statusBadge(d.status)}</td>
      <td><code class="mono">${d.version || '—'}</code></td>
      <td>${d.environment || '—'}</td>
      <td><code class="mono">${truncateSHA(d.commit_sha)}</code></td>
      <td>${formatDuration(d.duration_ms)}</td>
      <td>${formatTime(d.created_at)}</td>
      <td>
        <button class="btn btn--outline" onclick="viewLogs('deployment', '${d.id}', '${d.version}')" aria-label="View logs">
          View Logs
        </button>
      </td>
    </tr>
  `).join('');
}

// ---------- View Logs Modal ----------
async function viewLogs(refType, refId, label) {
  const modal = $('#log-modal');
  const title = $('#modal-title');
  const content = $('#modal-log-content');

  title.textContent = `Logs — ${refType === 'build' ? 'Build' : 'Deploy'} ${label}`;
  content.textContent = 'Loading logs…';
  modal.hidden = false;

  const logs = await api(`/logs/${refType}/${refId}`);
  if (!logs || logs.length === 0) {
    content.textContent = 'No logs available for this item.';
    return;
  }

  content.textContent = logs.map(l => {
    const prefix = l.level === 'error' ? '✗' : l.level === 'warn' ? '⚠' : '→';
    return `[${l.level.toUpperCase()}] ${prefix} ${l.content}`;
  }).join('\n\n');
}

// ---------- Close Modal ----------
function closeModal() {
  $('#log-modal').hidden = true;
}

// ---------- AI Summarizer ----------
async function triggerSummarize() {
  const type = $('#ai-select-type').value;
  const output = $('#ai-output');

  output.innerHTML = `
    <div class="ai-panel__loading">
      <div class="spinner"></div>
      <span>Analyzing logs with AI…</span>
    </div>
  `;

  // Get the latest item
  const items = await api(`/${type === 'build' ? 'builds' : 'deployments'}`);
  if (!items || items.length === 0) {
    output.innerHTML = `<div class="ai-panel__placeholder"><p>No ${type}s found to analyze.</p></div>`;
    return;
  }

  const latest = items[0];
  const logs = await api(`/logs/${type}/${latest.id}`);

  if (!logs || logs.length === 0) {
    output.innerHTML = `<div class="ai-panel__placeholder"><p>No logs available for the latest ${type}.</p></div>`;
    return;
  }

  // Check if there's already a summary
  const existing = await api(`/summaries/${type}/${latest.id}`);
  if (existing) {
    output.innerHTML = `<div class="ai-panel__summary">${escapeHtml(existing.summary)}</div>`;
    return;
  }

  // For now, generate a client-side summary from the logs (Stage 10 will add Gemini API)
  const logText = logs.map(l => l.content).join('\n');
  const summary = generateLocalSummary(type, latest, logText);
  output.innerHTML = `<div class="ai-panel__summary">${escapeHtml(summary)}</div>`;
}

/**
 * Local summary generator — used as fallback when Gemini API key isn't configured.
 * Stage 10 will replace this with actual AI-powered summarization.
 */
function generateLocalSummary(type, item, logText) {
  if (type === 'build') {
    const status = item.status === 'passed' ? '✅ Passed' : '❌ Failed';
    return `📋 Build Summary\n\n` +
      `Status: ${status}\n` +
      `Commit: ${item.commit_sha}\n` +
      `Branch: ${item.branch}\n` +
      `Duration: ${formatDuration(item.duration_ms)}\n\n` +
      `--- Log Analysis ---\n${logText}\n\n` +
      `💡 Tip: Configure a Gemini API key in .env to get AI-powered summaries.`;
  } else {
    return `🚀 Deployment Summary\n\n` +
      `Status: ${item.status === 'deployed' ? '✅ Live' : '❌ ' + item.status}\n` +
      `Version: ${item.version}\n` +
      `Environment: ${item.environment}\n` +
      `Duration: ${formatDuration(item.duration_ms)}\n\n` +
      `--- Log Analysis ---\n${logText}\n\n` +
      `💡 Tip: Configure a Gemini API key in .env to get AI-powered summaries.`;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ---------- Navigation ----------
function initNavigation() {
  const links = $$('.header__link');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      setActiveSection(section);
      const target = document.getElementById(section);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Mobile menu toggle
  const menuBtn = $('#btn-menu');
  const nav = $('#nav-links');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      nav.classList.toggle('header__nav--open');
    });
  }

  // Close mobile nav when a link is clicked
  links.forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('header__nav--open');
    });
  });
}

function setActiveSection(section) {
  currentSection = section;
  $$('.header__link').forEach(l => {
    l.classList.toggle('header__link--active', l.dataset.section === section);
  });
}

// ---------- Scroll Spy ----------
function initScrollSpy() {
  const sections = ['overview', 'builds', 'deployments', 'ai-summary'];
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        setActiveSection(entry.target.id);
      }
    });
  }, { rootMargin: '-100px 0px -60% 0px', threshold: 0 });

  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
}

// ---------- Event Listeners ----------
function initEvents() {
  // Refresh button
  $('#btn-refresh')?.addEventListener('click', () => {
    loadAll();
  });

  // Summarize button
  $('#btn-summarize')?.addEventListener('click', triggerSummarize);

  // Close modal
  $('#btn-modal-close')?.addEventListener('click', closeModal);
  $('#log-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Escape key closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

// ---------- Load All Data ----------
async function loadAll() {
  await Promise.all([renderStats(), renderBuilds(), renderDeployments()]);
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initScrollSpy();
  initEvents();
  loadAll();

  // Auto-refresh every 30 seconds
  setInterval(loadAll, 30000);
});

// Expose viewLogs globally for onclick handlers
window.viewLogs = viewLogs;
