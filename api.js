
const GAS_CONFIG = {
  URL: 'https://script.google.com/macros/s/AKfycbwwkz9T8iuNj35StYWCTZ59CtMtQ0RBvRugNoBkE7Czxkl45YpoUGOBkoEEW74ocATkiw/exec'
};

// ── Shared loading manager ────────────────────────────────────────────────
const API_LOADING_LABELS = {
  adminLogin: 'Checking credentials',
  getDashboard: 'Refreshing dashboard',
  getStudents: 'Loading students',
  getRooms: 'Loading rooms',
  getAllocations: 'Loading allocations',
  getGrievances: 'Loading grievances',
  getNotices: 'Loading notices',
  getSettingsPublic: 'Loading settings',
  getProvenanceVerifierHealth: 'Checking verifier',
  getHistoricalMarksheetMigrationStatus: 'Checking migration',
  getAllocationPreview: 'Checking allocation preview',
  runAllocation: 'Running allocation',
  sendLetters: 'Sending allotment letters',
  postNotice: 'Posting notice',
  resolveGrievance: 'Resolving grievance',
  updateDocumentVerification: 'Saving verification',
  sendDiscrepancyEmail: 'Sending discrepancy mail',
  sendDiscrepancyEmails: 'Sending discrepancy mails',
  updateSetting: 'Saving settings',
  submitApplication: 'Submitting application',
  getStudentStatus: 'Checking student status',
  fileGrievance: 'Submitting grievance',
  askChatbot: 'Checking assistant'
};

const APP_LOADING_LOTTIE_SRC = 'assets/animations/loading.lottie';

function ensureAppLoading() {
  if (window.AppLoading) return window.AppLoading;

  let styleInjected = false;
  let activeCount = 0;
  let topBar = null;
  let overlayEl = null;
  const tasks = new Map();
  const targetStates = new WeakMap();

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    const style = document.createElement('style');
    style.id = 'app-loading-styles';
    style.textContent = `
      :root {
        --app-loader-primary: var(--c-primary, hsl(228,52%,29%));
        --app-loader-accent: hsl(211, 92%, 48%);
        --app-loader-border: var(--c-border, hsl(228,15%,88%));
        --app-loader-surface: var(--c-surface, hsl(228,20%,97%));
        --app-loader-muted: var(--c-muted, hsl(228,10%,50%));
      }
      .app-loading-bar {
        position: fixed; top: 0; left: 0; right: 0; height: 2px;
        z-index: 100000; opacity: 0; pointer-events: none;
        background: linear-gradient(90deg, transparent, var(--app-loader-primary), var(--app-loader-accent), transparent);
        background-size: 220% 100%;
        transform: translateY(-2px);
        transition: opacity .18s ease, transform .18s ease;
      }
      .app-loading-bar.active {
        opacity: 1; transform: translateY(0);
        animation: appLoadingSweep 1.05s ease-in-out infinite;
      }
      .app-loading-overlay {
        position: fixed; inset: 0; z-index: 100000;
        display: flex; align-items: center; justify-content: center;
        padding: 24px; background: rgba(15, 23, 42, .34);
        backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
        opacity: 0; pointer-events: none;
        transition: opacity .18s ease;
      }
      .app-loading-overlay.active {
        opacity: 1; pointer-events: auto;
      }
      .app-loading-panel {
        width: min(280px, calc(100vw - 48px));
        min-height: 190px;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 10px; padding: 24px 22px 22px;
        border: 1px solid rgba(35,53,113,.12);
        border-radius: 10px;
        background: rgba(255,255,255,.96);
        box-shadow: 0 24px 70px rgba(15,23,42,.24);
        transform: translateY(8px) scale(.98);
        transition: transform .18s ease;
      }
      .app-loading-overlay.active .app-loading-panel {
        transform: translateY(0) scale(1);
      }
      .app-loading-lottie {
        width: 96px; height: 96px; flex: 0 0 auto;
        position: relative;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .app-loading-lottie dotlottie-wc {
        position: absolute; inset: 0;
        width: 96px; height: 96px;
      }
      .app-loading-lottie.has-player .app-loading-fallback { display: none; }
      .app-loading-fallback {
        width: 46px; height: 46px; border-radius: 50%;
        border: 3px solid rgba(35,53,113,.14);
        border-top-color: var(--app-loader-primary);
        animation: appSpin .75s linear infinite;
      }
      .app-loading-title {
        color: var(--app-loader-primary);
        font: 800 14px/1.25 Inter, system-ui, sans-serif;
        text-align: center;
      }
      .app-loading-subtitle {
        color: var(--app-loader-muted);
        font: 500 12px/1.45 Inter, system-ui, sans-serif;
        text-align: center;
      }
      .app-mini-spinner, .loader {
        width: 18px; height: 18px; border-radius: 50%;
        border: 2px solid rgba(35,53,113,.16);
        border-top-color: var(--app-loader-primary);
        display: inline-block;
        animation: appSpin .75s linear infinite;
      }
      .app-inline-loader {
        display: inline-flex; align-items: center; justify-content: center;
        gap: 8px; color: var(--app-loader-muted); font-size: .88rem; padding: 10px 12px;
      }
      .app-loading-target { position: relative; min-height: 42px; }
      .app-loading-target::after {
        content: attr(data-loading-label);
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        padding: 16px; color: var(--app-loader-muted); font-size: .88rem; font-weight: 600;
        background: rgba(255,255,255,.78); backdrop-filter: blur(2px);
        opacity: 0; pointer-events: none; transition: opacity .18s ease;
      }
      .app-loading-target.is-loading::after { opacity: 1; }
      .app-skeleton {
        display: block; min-height: 14px; border-radius: 5px;
        background: linear-gradient(90deg, #edf1f7 0%, #f8fafc 45%, #edf1f7 90%);
        background-size: 220% 100%;
        animation: appSkeleton 1.15s ease-in-out infinite;
      }
      .app-skeleton-row {
        height: 42px; border-radius: 6px; margin: 8px 0; border: 1px solid var(--app-loader-border);
        background: linear-gradient(90deg, #edf1f7 0%, #f8fafc 45%, #edf1f7 90%);
        background-size: 220% 100%;
        animation: appSkeleton 1.15s ease-in-out infinite;
      }
      .app-button-loading { display: inline-flex; align-items: center; gap: 8px; }
      @keyframes appLoadingSweep { from { background-position: 120% 0; } to { background-position: -120% 0; } }
      @keyframes appSpin { to { transform: rotate(360deg); } }
      @keyframes appSkeleton { from { background-position: 120% 0; } to { background-position: -120% 0; } }
      @media (prefers-reduced-motion: reduce) {
        .app-loading-bar.active, .app-mini-spinner, .loader, .app-skeleton, .app-skeleton-row, .app-loading-fallback {
          animation: none !important;
        }
        .app-loading-overlay, .app-loading-panel {
          transition: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureElements(includeOverlay = true) {
    injectStyles();
    if (!topBar) {
      topBar = document.createElement('div');
      topBar.className = 'app-loading-bar';
      topBar.setAttribute('aria-hidden', 'true');
      document.body.appendChild(topBar);
    }
    if (includeOverlay && !overlayEl) {
      if (APP_LOADING_LOTTIE_SRC && /\.(json|lottie)(\?|$)/i.test(APP_LOADING_LOTTIE_SRC) && !document.getElementById('dotlottie-player-script')) {
        const playerScript = document.createElement('script');
        playerScript.id = 'dotlottie-player-script';
        playerScript.type = 'module';
        playerScript.src = 'https://unpkg.com/@lottiefiles/dotlottie-wc@0.6.2/dist/dotlottie-wc.js';
        document.head.appendChild(playerScript);
      }
      overlayEl = document.createElement('div');
      overlayEl.className = 'app-loading-overlay';
      overlayEl.setAttribute('role', 'status');
      overlayEl.setAttribute('aria-live', 'polite');
      overlayEl.setAttribute('aria-modal', 'true');
      overlayEl.innerHTML = `
        <div class="app-loading-panel">
          <span class="app-loading-lottie" aria-hidden="true">
            ${APP_LOADING_LOTTIE_SRC && /\.(json|lottie)(\?|$)/i.test(APP_LOADING_LOTTIE_SRC)
              ? `<dotlottie-wc src="${APP_LOADING_LOTTIE_SRC}" speed="1" mode="forward" loop autoplay></dotlottie-wc><span class="app-loading-fallback"></span>`
              : '<span class="app-loading-fallback"></span>'}
          </span>
          <span class="app-loading-title" data-loading-status-text>Loading</span>
          <span class="app-loading-subtitle">Please wait while the hostel portal finishes this request.</span>
        </div>
      `;
      document.body.appendChild(overlayEl);

      const lottieHolder = overlayEl.querySelector('.app-loading-lottie');
      if (APP_LOADING_LOTTIE_SRC && window.customElements && lottieHolder) {
        window.customElements.whenDefined('dotlottie-wc')
          .then(() => lottieHolder.classList.add('has-player'))
          .catch(() => {});
      }
    }
  }

  function resolveTarget(target) {
    if (!target) return null;
    if (typeof target === 'string') return document.querySelector(target);
    if (target instanceof Element) return target;
    return null;
  }

  function setButtonLoading(button, isLoading, label) {
    if (!button) return;
    if (isLoading) {
      if (!button.dataset.loadingOriginalHtml) button.dataset.loadingOriginalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="app-button-loading"><span class="app-mini-spinner" aria-hidden="true"></span><span>${label || 'Loading'}</span></span>`;
    } else {
      if (button.dataset.loadingOriginalHtml) {
        button.innerHTML = button.dataset.loadingOriginalHtml;
        delete button.dataset.loadingOriginalHtml;
      }
      button.disabled = false;
    }
  }

  function startTarget(target, label, variant) {
    const el = resolveTarget(target);
    if (!el) return null;
    const prev = targetStates.get(el) || { count: 0, html: null };
    if (!prev.count) {
      prev.html = el.innerHTML;
      if (variant === 'button') {
        setButtonLoading(el, true, label);
      } else {
        el.classList.add('app-loading-target');
        el.dataset.loadingLabel = label || 'Loading';
      }
    }
    prev.count += 1;
    targetStates.set(el, prev);
    return el;
  }

  function stopTarget(el, variant) {
    if (!el) return;
    const prev = targetStates.get(el);
    if (!prev) return;
    prev.count -= 1;
    if (prev.count > 0) {
      targetStates.set(el, prev);
      return;
    }
    if (variant === 'button') {
      setButtonLoading(el, false);
    } else {
      el.classList.remove('app-loading-target', 'is-loading');
      delete el.dataset.loadingLabel;
    }
    targetStates.delete(el);
  }

  function refreshTopBar() {
    const activeLabels = Array.from(tasks.values()).filter(task => task.visible).map(task => task.label).filter(Boolean);
    const visible = activeLabels.length > 0;
    const overlayVisible = Array.from(tasks.values()).some(task => task.visible && task.overlay);
    ensureElements(overlayVisible);
    topBar.classList.toggle('active', visible);
    if (overlayEl) overlayEl.classList.toggle('active', overlayVisible);
    const labelEl = overlayEl && overlayEl.querySelector('[data-loading-status-text]');
    if (labelEl) labelEl.textContent = activeLabels[activeLabels.length - 1] || 'Loading';
  }

  const manager = {
    start(label = 'Loading', options = {}) {
      const token = Symbol(label);
      const task = {
        label,
        visible: false,
        overlay: options.overlay !== false,
        target: null,
        targetVariant: options.variant,
        timer: null
      };
      activeCount += 1;
      task.timer = setTimeout(() => {
        task.visible = true;
        if (activeCount > 0) ensureElements(task.overlay);
        if (options.target) {
          task.target = startTarget(options.target, label, options.variant);
          if (task.target && options.variant !== 'button') task.target.classList.add('is-loading');
        }
        refreshTopBar();
      }, options.delay ?? 250);
      tasks.set(token, task);
      return token;
    },
    stop(token) {
      const task = tasks.get(token);
      if (!task) return;
      clearTimeout(task.timer);
      activeCount = Math.max(0, activeCount - 1);
      stopTarget(task.target, task.targetVariant);
      tasks.delete(token);
      refreshTopBar();
    },
    async withTask(label, fnOrPromise, options = {}) {
      const token = manager.start(label, options);
      try {
        const value = typeof fnOrPromise === 'function' ? fnOrPromise() : fnOrPromise;
        return await value;
      } finally {
        manager.stop(token);
      }
    },
    skeletonRows(count = 4) {
      return Array.from({ length: count }, () => '<div class="app-skeleton-row"></div>').join('');
    }
  };

  window.AppLoading = manager;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyles, { once: true });
  } else {
    injectStyles();
  }
  return manager;
}

ensureAppLoading();

// ── Data store for local execution ─────────────────────────
const LOCAL_MOCK_STORE = {
  students: [],
  rooms: [
    { RoomID: 'BH-101', RoomNumber: 'BH-101', HostelName: 'Boys Hostel', HostelType: 'Boys', Capacity: 2, Occupied: 0, VacantBeds: 2, Status: 'Available' },
    { RoomID: 'GH-101', RoomNumber: 'GH-101', HostelName: 'Girls Hostel', HostelType: 'Girls', Capacity: 2, Occupied: 0, VacantBeds: 2, Status: 'Available' }
  ],
  allocations: [],
  grievances: [],
  settings: {
    REGISTRATION_OPEN: 'true',
    REGISTRATION_CLOSE_DATE: '',
    HOSTEL_OFFICE_CONTACT: 'Contact the Warden Office for official hostel support.',
    MESS_FEE_NOTE: 'Mess and hostel fee details will be announced through official notices.'
  },
  notices: [
    { NoticeID: 'NOT-001', Title: 'Hostel Registration Open', Body: 'Submissions are open for new student hostel applications.', PostedBy: 'Chief Warden', Date: new Date().toLocaleDateString(), Active: true, Audience: 'Student' }
  ]
};

// Calculate probability locally for mock fallback
function localCalculateProbability(student) {
  const status = String(student.Status || '').toLowerCase();
  if (status === 'allocated') return null;

  const gender = String(student.Gender || '').toLowerCase();
  const enroll = String(student.EnrollmentNo || '').trim();
  const isGirl = gender.includes('female') || gender.includes('girl') || gender === 'f';

  const students = getLocalStudents();
  const sameGender = students.filter(s => {
    if (String(s.Status || '').toLowerCase() === 'allocated') return false;
    const g = String(s.Gender || '').toLowerCase();
    return isGirl ? (g.includes('female') || g.includes('girl') || g === 'f') : (g.includes('male') || g.includes('boy') || g === 'm');
  });

  sameGender.sort((a, b) => {
    const aPri = Number(a.Priority) || 5;
    const bPri = Number(b.Priority) || 5;
    if (aPri !== bPri) return aPri - bPri;
    if (aPri === 2 || aPri === 3) return (Number(b.TwelfthMarks) || 0) - (Number(a.TwelfthMarks) || 0);
    if (aPri === 4) return (Number(b.DistanceKm) || 0) - (Number(a.DistanceKm) || 0);
    return new Date(a.Timestamp || 0) - new Date(b.Timestamp || 0);
  });

  const rank = sameGender.findIndex(s => String(s.EnrollmentNo).trim() === enroll) + 1;
  const queueRank = rank > 0 ? rank : 1;
  const priority = Number(student.Priority) || 5;
  const marks = Number(student.TwelfthMarks) || 75;
  const dist = Number(student.DistanceKm) || 20;

  let base = 50;
  if (priority === 1) {
    base = 98;
  } else if (priority === 2) {
    base = 82 + Math.min(12, Math.max(0, (marks - 75) * 0.5));
  } else if (priority === 3) {
    base = 72 + Math.min(10, Math.max(0, (marks - 75) * 0.4));
  } else if (priority === 4) {
    base = 45 + Math.min(20, Math.max(0, (dist / 100) * 20));
  } else {
    base = 25 + Math.min(10, Math.max(0, (dist / 100) * 10));
  }

  const rankDeduction = (queueRank - 1) * 3;
  let percent = Math.round(Math.max(10, Math.min(98, base - rankDeduction)));

  return {
    percent,
    seatsLeft: isGirl ? 175 : 260,
    queueRank,
    priority,
    basis: `Priority ${priority}, queue rank #${queueRank}`
  };
}

// ── Core request function ─────────────────────────────────────────────────
const API_READ_CACHE_TTL = {
  getDashboard: 15000,
  getAdminStudentsPage: 15000,
  getAdminStudentDetail: 15000,
  getAdminAllocationsPage: 15000,
  getAdminRoomsOverview: 15000,
  getGrievances: 15000,
  getNotices: 60000,
  getSettingsPublic: 60000,
  getProvenanceVerifierHealth: 15000,
  getHistoricalMarksheetMigrationStatus: 15000,
  getStudentStatus: 15000
};
const API_SESSION_CACHE_ACTIONS = new Set(['getDashboard', 'getNotices', 'getSettingsPublic']);
const API_MEMORY_CACHE = new Map();
const API_INFLIGHT_REQUESTS = new Map();
const API_SESSION_PREFIX = 'hostel_api_cache:';

function stableRequestParams(params) {
  const value = params || {};
  return Object.keys(value).filter(key => key !== 'force').sort().map(key => `${encodeURIComponent(key)}=${encodeURIComponent(value[key] ?? '')}`).join('&');
}

function apiRequestCacheKey(action, params) {
  return `${action}?${stableRequestParams(params)}`;
}

function readApiCache(action, params, allowExpired = false) {
  const key = apiRequestCacheKey(action, params);
  let entry = API_MEMORY_CACHE.get(key) || null;
  if (!entry && API_SESSION_CACHE_ACTIONS.has(action)) {
    try {
      entry = JSON.parse(sessionStorage.getItem(API_SESSION_PREFIX + key) || 'null');
      if (entry) API_MEMORY_CACHE.set(key, entry);
    } catch (error) { entry = null; }
  }
  if (!entry) return null;
  if (!allowExpired && Date.now() > Number(entry.expiresAt || 0)) return null;
  return entry;
}

function writeApiCache(action, params, data) {
  const ttl = API_READ_CACHE_TTL[action];
  if (!ttl) return data;
  const key = apiRequestCacheKey(action, params);
  const entry = { data, storedAt: Date.now(), expiresAt: Date.now() + ttl };
  API_MEMORY_CACHE.set(key, entry);
  if (API_SESSION_CACHE_ACTIONS.has(action)) {
    try { sessionStorage.setItem(API_SESSION_PREFIX + key, JSON.stringify(entry)); } catch (error) {}
  }
  return data;
}

function invalidateApiCache(actions) {
  const targets = Array.isArray(actions) && actions.length ? new Set(actions) : null;
  Array.from(API_MEMORY_CACHE.keys()).forEach(key => {
    const action = key.split('?')[0];
    if (!targets || targets.has(action)) API_MEMORY_CACHE.delete(key);
  });
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (!key || !key.startsWith(API_SESSION_PREFIX)) continue;
      const action = key.slice(API_SESSION_PREFIX.length).split('?')[0];
      if (!targets || targets.has(action)) sessionStorage.removeItem(key);
    }
  } catch (error) {}
}

async function gasRequest(action, method = 'GET', data = null, params = null, requestOptions = {}) {
  const isRead = method === 'GET' && Boolean(API_READ_CACHE_TTL[action]);
  const effectiveParams = Object.assign({}, params || {});
  if (requestOptions.force) effectiveParams.force = 'true';
  const cacheKey = apiRequestCacheKey(action, effectiveParams);
  if (isRead && !requestOptions.force) {
    const cached = readApiCache(action, effectiveParams);
    if (cached) return cached.data;
  }
  if (isRead && API_INFLIGHT_REQUESTS.has(cacheKey)) return API_INFLIGHT_REQUESTS.get(cacheKey);

  const runRequest = async () => {
    if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      const localResult = handleLocalFallback(action, data, effectiveParams);
      return isRead ? writeApiCache(action, effectiveParams, localResult) : localResult;
    }
    let timeoutId = null;
    try {
    let url = GAS_CONFIG.URL;
    let options = { method };
    const timeoutMs = requestOptions.timeoutMs === undefined && method === 'GET' ? 12000 : Number(requestOptions.timeoutMs || 0);
    const controller = timeoutMs ? new AbortController() : null;
    if (controller) {
      options.signal = controller.signal;
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    if (method === 'GET') {
      const searchParams = new URLSearchParams({ action });
      if (effectiveParams) {
        for (const key in effectiveParams) searchParams.append(key, effectiveParams[key]);
      }
      url += '?' + searchParams.toString();
    } else {
      // GAS works best with text/plain to avoid CORS preflight
      options.body = JSON.stringify({ action, data });
      options.headers = { 'Content-Type': 'text/plain' };
    }

    const response = await fetch(url, options);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const result = await response.json();
    if (isRead) writeApiCache(action, effectiveParams, result);
    else if (method !== 'GET') invalidateApiCache();
    return result;

  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    const stale = isRead ? readApiCache(action, effectiveParams, true) : null;
    if (stale) {
      if (Array.isArray(stale.data)) return stale.data;
      return Object.assign({}, stale.data, { _stale: true, _staleAt: stale.storedAt });
    }
    if (!(requestOptions.background && error && error.name === 'AbortError')) console.warn(`[HostelAPI] ${action} API request failed.`, error);
    throw error;
  }
  };

  const requestPromise = runRequest();
  if (isRead) {
    API_INFLIGHT_REQUESTS.set(cacheKey, requestPromise);
    requestPromise.finally(() => API_INFLIGHT_REQUESTS.delete(cacheKey)).catch(() => {});
  }

  if (requestOptions.loading === false || requestOptions.background) {
    return requestPromise;
  }

  return window.AppLoading.withTask(API_LOADING_LABELS[action] || 'Loading', requestPromise, { overlay: method !== 'GET', delay: method === 'GET' ? 400 : 250 });
}

function getLocalStudents() {
  try {
    const stored = localStorage.getItem('ggsipu_hostel_students');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return LOCAL_MOCK_STORE.students;
}

function saveLocalStudents(list) {
  try {
    localStorage.setItem('ggsipu_hostel_students', JSON.stringify(list));
  } catch (e) {}
}

function normalizeDateComparison(val) {
  if (!val) return '';
  let str = String(val).trim();
  if (str.includes('T')) {
    // The backend may return a cached Sheet date as a UTC ISO timestamp.
    // DOBs are Indian calendar dates, so restore the Asia/Kolkata date first.
    if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(str)) {
      const parsed = new Date(str);
      if (!Number.isNaN(parsed.getTime())) {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(parsed).reduce((result, part) => {
          if (part.type !== 'literal') result[part.type] = part.value;
          return result;
        }, {});
        if (parts.year && parts.month && parts.day) return `${parts.year}-${parts.month}-${parts.day}`;
      }
    }
    str = str.split('T')[0];
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
    const p = str.split('-');
    return `${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}`;
  }
  if (str.includes('/')) {
    const p = str.split('/');
    if (p[2] && p[2].length === 4) {
      return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
    }
  }
  return str;
}

function normalizeNoticeAudience(value) {
  const audience = String(value || '').trim().toLowerCase();
  if (['homepage', 'home page', 'home', 'latest', 'latest updates', 'updates'].includes(audience)) return 'Homepage';
  if (audience === 'both' || audience === 'all') return 'Both';
  return 'Student';
}

function localNormalizePersonName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function localNamesAreConsistent(submittedName, extractedName) {
  const submitted = localNormalizePersonName(submittedName);
  const extracted = localNormalizePersonName(extractedName);
  if (!submitted || !extracted) return false;
  if (submitted === extracted || submitted.includes(extracted) || extracted.includes(submitted)) return true;
  const a = submitted.split(' ').filter(token => token.length > 1);
  const b = extracted.split(' ').filter(token => token.length > 1);
  const shared = a.filter(token => b.includes(token)).length;
  return shared >= Math.max(1, Math.min(a.length, b.length) - 1);
}

function localDetectSupportedAiProviders(value) {
  let text = '';
  try { text = typeof value === 'string' ? value : JSON.stringify(value || {}); } catch (error) { text = String(value || ''); }
  const providers = [];
  if (/\b(?:google[\s_-]*ai|gemini|imagen|synthid)\b/i.test(text)) providers.push('Google');
  if (/\b(?:openai|chatgpt|dall[\s.·_-]*e)\b/i.test(text)) providers.push('OpenAI');
  return providers;
}

function localAiExplanation(code, provider) {
  const labels = {
    FILE_INTEGRITY_CONFIRMED: 'The stored and retrieved files have matching checksums.',
    FILE_CHANGED_DURING_TRANSFER: 'The retrieved file checksum does not match the stored upload checksum.',
    NO_SUPPORTED_GENERATOR_METADATA: 'No recognized Google or OpenAI generator metadata was found.',
    GOOGLE_OPENAI_METADATA_DETECTED: `${provider || 'Google/OpenAI'} generator metadata was found in the original file.`,
    C2PA_NOT_PRESENT: 'No C2PA manifest was present in the uploaded file.',
    C2PA_VERIFICATION_COMPLETED: 'Cryptographic C2PA verification completed.',
    NO_GOOGLE_OPENAI_C2PA_FOUND: 'No Google/Gemini or OpenAI C2PA provenance was found.',
    NO_SUPPORTED_C2PA_AI_CLAIM: 'No validated Google or OpenAI C2PA AI-generation claim was found.',
    GOOGLE_OPENAI_C2PA_AI_DETECTED: `Validated ${provider || 'Google/OpenAI'} C2PA provenance indicates AI-generated content.`,
    GOOGLE_OPENAI_C2PA_INVALID: `${provider || 'Google/OpenAI'} C2PA provenance is invalid, untrusted, or appears altered.`,
    C2PA_VERIFIER_UNAVAILABLE: 'Cryptographic C2PA verification is unavailable, so the AI check is inconclusive.',
    METADATA_UNREADABLE: 'The document metadata could not be read reliably.',
    UNSUPPORTED_C2PA_PROVIDER: 'The C2PA provider is outside the supported Google/OpenAI check.'
  };
  return labels[code] || String(code || '').replace(/_/g, ' ').toLowerCase();
}

function localDecideMarksheetVerification(screening) {
  const result = screening || {};
  const metadata = result.metadata || {};
  const c2pa = result.c2pa || {};
  const reasons = [];
  const inconclusive = [];
  const explanations = [result.checksumMatch === false ? 'FILE_CHANGED_DURING_TRANSFER' : 'FILE_INTEGRITY_CONFIRMED'];
  const metadataProviders = Array.isArray(metadata.aiGeneratorProviders) ? metadata.aiGeneratorProviders.map(provider => localDetectSupportedAiProviders(String(provider))[0] || String(provider)).filter(provider => ['Google', 'OpenAI'].includes(provider)) : localDetectSupportedAiProviders(metadata.summary || metadata);
  const c2paProvider = ['Google', 'OpenAI'].includes(c2pa.provider) ? c2pa.provider : (localDetectSupportedAiProviders([c2pa.provider, c2pa.issuer, c2pa.claimGenerator])[0] || '');
  const c2paStatus = ['Valid', 'Absent', 'Invalid', 'Untrusted', 'Unsupported'].includes(c2pa.status) ? c2pa.status : 'Unsupported';
  if (result.checksumMatch === false) reasons.push('FILE_CHANGED_DURING_TRANSFER');
  if (metadataProviders.length) explanations.push('GOOGLE_OPENAI_METADATA_DETECTED'); else explanations.push('NO_SUPPORTED_GENERATOR_METADATA');
  if (result.verifierConfigured !== true || c2paStatus === 'Unsupported') inconclusive.push('C2PA_VERIFIER_UNAVAILABLE');
  if (result.verifierConfigured === true && c2paStatus !== 'Unsupported') explanations.push('C2PA_VERIFICATION_COMPLETED');
  if (c2paStatus === 'Absent') explanations.push('C2PA_NOT_PRESENT', 'NO_GOOGLE_OPENAI_C2PA_FOUND');
  if (c2paStatus === 'Valid' && (!c2paProvider || c2pa.aiGenerated !== true)) explanations.push('NO_GOOGLE_OPENAI_C2PA_FOUND', 'NO_SUPPORTED_C2PA_AI_CLAIM');
  if (['Invalid', 'Untrusted'].includes(c2paStatus) && !c2paProvider) inconclusive.push('UNSUPPORTED_C2PA_PROVIDER');
  if (['Invalid', 'Untrusted'].includes(c2paStatus) && c2paProvider) reasons.push('GOOGLE_OPENAI_C2PA_INVALID');
  if (c2paStatus === 'Valid' && c2paProvider && c2pa.aiGenerated === true) reasons.push('GOOGLE_OPENAI_C2PA_AI_DETECTED');
  const reasonCodes = reasons.filter((reason, index) => reasons.indexOf(reason) === index);
  const inconclusiveCodes = inconclusive.filter((reason, index) => inconclusive.indexOf(reason) === index);
  const explanationCodes = explanations.concat(reasonCodes, inconclusiveCodes).filter((code, index, values) => values.indexOf(code) === index);
  const provider = c2paProvider || metadataProviders[0] || '';
  const status = reasonCodes.length ? 'Offline Verification Required' : inconclusiveCodes.length ? 'AI Check Inconclusive — Manual Approval Required' : 'Verified';
  const approvalSource = status === 'Verified' ? 'Automated C2PA absence check' : '';
  return {
    status,
    aiProvenanceStatus: reasonCodes.length ? 'Detected' : inconclusiveCodes.length ? 'Inconclusive' : 'Passed',
    provider,
    approvalSource,
    remarks: status === 'Offline Verification Required'
      ? 'Supported Google/OpenAI AI-provenance signals require review of the original document. The application has not been rejected.'
      : status === 'AI Check Inconclusive — Manual Approval Required'
        ? 'The Google/OpenAI AI-provenance check could not complete conclusively. Administrator approval is required.'
        : 'No Google/OpenAI C2PA provenance was found after cryptographic verification. The document was automatically approved under the current policy.',
    reasonCodes,
    inconclusiveCodes,
    explanationCodes,
    explanationSummary: explanationCodes.map(code => localAiExplanation(code, provider)),
    provenance: result
  };
}

async function localSha256Base64(base64) {
  const binary = atob(String(base64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 255;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
}

function validateLocalMarksheetPayload(fileData) {
  if (!fileData || !fileData.data) throw new Error('Upload the required 12th marksheet.');
  let binary;
  try { binary = atob(String(fileData.data)); } catch (error) { throw new Error('The marksheet upload is not valid base64 data.'); }
  if (!binary.length) throw new Error('The marksheet file is empty.');
  if (binary.length > 10 * 1024 * 1024) throw new Error('The marksheet must be 10 MB or smaller.');
  const byte = index => binary.charCodeAt(index) & 255;
  const pdf = binary.slice(0, 5) === '%PDF-' && binary.slice(Math.max(0, binary.length - 2048)).includes('%%EOF');
  const jpeg = binary.length >= 3 && byte(0) === 0xff && byte(1) === 0xd8 && byte(2) === 0xff;
  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const png = binary.length >= 8 && pngSig.every((value, index) => byte(index) === value);
  const detected = pdf ? 'application/pdf' : (jpeg ? 'image/jpeg' : (png ? 'image/png' : ''));
  if (!detected) throw new Error('Upload a valid PDF, JPEG, or PNG marksheet.');
  const declared = String(fileData.type || '').toLowerCase();
  if (declared && declared !== detected && !(declared === 'image/jpg' && detected === 'image/jpeg')) {
    throw new Error('The file content does not match its declared type.');
  }
  return { mimeType: detected, size: binary.length };
}

async function runLocalMarksheetScreening(enrollmentNo, suppliedResult) {
  const students = getLocalStudents();
  const student = students.find(item => String(item.EnrollmentNo || '').trim().toLowerCase() === String(enrollmentNo || '').trim().toLowerCase());
  if (!student) throw new Error('Local student record not found for marksheet screening.');
  const localDataUrl = String(student.MarksheetFile || '');
  const localSeparator = localDataUrl.indexOf(',');
  const localBase64 = localSeparator >= 0 ? localDataUrl.slice(localSeparator + 1) : '';
  if (localBase64) {
    const browserChecksum = await localSha256Base64(localBase64);
    student.MarksheetChecksum = student.MarksheetChecksum || browserChecksum;
    student.MarksheetBrowserChecksum = student.MarksheetBrowserChecksum || browserChecksum;
  }
  let screening = suppliedResult;
  if (!screening && typeof window.__HOSTEL_MARKSHEET_SCREENING_MOCK__ === 'function') {
    screening = await window.__HOSTEL_MARKSHEET_SCREENING_MOCK__(student);
  }
  if (!screening && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    const testName = String(student.LocalMarksheetOriginalName || '').toLowerCase();
    if (testName.includes('clean-test-marksheet')) {
      screening = {
        verifierConfigured: true, checksumMatch: true, metadata: { readable: true, summary: {}, aiGeneratorProviders: [], warnings: [] },
        c2pa: { status: 'Absent', provider: '', issuer: '', aiGenerated: false }
      };
    } else if (testName.includes('suspicious-test-marksheet')) {
      screening = {
        verifierConfigured: true, checksumMatch: true, metadata: { readable: true, summary: { Software: 'OpenAI DALL-E' }, aiGeneratorProviders: ['OpenAI'], warnings: [] },
        c2pa: { status: 'Valid', provider: 'OpenAI', issuer: 'OpenAI', aiGenerated: true }
      };
    }
  }
  if (!screening && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    if (!localBase64) throw new Error('The locally stored marksheet data is unavailable.');
    const response = await fetch('/api/verify-marksheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document: {
          name: student.LocalMarksheetOriginalName || '12th-marksheet',
          type: student.MarksheetMimeType || '',
          data: localBase64
        },
        expectedChecksum: student.MarksheetChecksum
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success || !payload.screening) throw new Error(payload.error || `Local verification request failed (${response.status}).`);
    screening = payload.screening;
  }
  if (!screening) return { status: student.DocumentStatus, pending: true };
  screening.retrievedChecksum = screening.retrievedChecksum || student.MarksheetChecksum || '';
  screening.checksumMatch = screening.checksumMatch !== false && (!student.MarksheetChecksum || screening.retrievedChecksum === student.MarksheetChecksum);
  const decision = localDecideMarksheetVerification(screening);
  student.MarksheetStatus = decision.status;
  student.DocumentStatus = decision.status;
  student.MarksheetRemarks = decision.remarks;
  student.DocumentRemarks = decision.remarks;
  student.MarksheetVerificationCheckedAt = new Date().toISOString();
  student.MarksheetVerificationProvider = 'Google/OpenAI metadata and C2PA';
  student.MarksheetVerificationModel = 'google-openai-c2pa-auto-verify-v2';
  student.MarksheetVerificationReasons = JSON.stringify(decision.reasonCodes);
  student.MarksheetVerificationExplanationCodes = JSON.stringify(decision.explanationCodes);
  student.MarksheetVerificationSummary = JSON.stringify(decision.explanationSummary);
  student.MarksheetAiProvenanceStatus = decision.aiProvenanceStatus;
  student.MarksheetAiProvider = decision.provider;
  student.MarksheetRetrievedChecksum = screening.retrievedChecksum || student.MarksheetChecksum || '';
  student.MarksheetMetadataSummary = JSON.stringify(screening.metadata || {});
  student.MarksheetMetadataFindings = JSON.stringify(screening.metadata?.aiGeneratorProviders || []);
  student.MarksheetC2paStatus = screening.c2pa?.status || 'Unsupported';
  student.MarksheetC2paProvider = screening.c2pa?.provider || '';
  student.MarksheetC2paIssuer = screening.c2pa?.issuer || '';
  student.MarksheetC2paSigner = screening.c2pa?.signer || screening.c2pa?.issuer || '';
  student.MarksheetC2paSigningTime = screening.c2pa?.signingTime || '';
  student.MarksheetC2paVerifierVersion = screening.c2pa?.verifierVersion || screening.verifierVersion || '';
  student.MarksheetC2paAiSourceType = screening.c2pa?.aiSourceType || '';
  student.MarksheetC2paValidationErrors = JSON.stringify(screening.c2pa?.validationErrors || []);
  student.MarksheetApprovalSource = decision.approvalSource;
  student.MarksheetScreeningAttempts = Number(student.MarksheetScreeningAttempts || 0) + 1;
  if (decision.status === 'Verified') {
    let audit = [];
    try { audit = JSON.parse(student.DocumentAuditLog || '[]'); } catch (error) { audit = []; }
    if (!Array.isArray(audit)) audit = [];
    audit.push({ at: new Date().toISOString(), reviewer: 'Automated C2PA worker', evidenceSource: decision.approvalSource, previousStatus: 'Screening Pending', newStatus: 'Verified', remarks: decision.remarks });
    student.DocumentAuditLog = JSON.stringify(audit.slice(-50));
  }
  if (decision.status === 'Offline Verification Required' && !student.OfflineVerificationEmailSentAt) {
    student.OfflineVerificationEmailSentAt = new Date().toISOString();
    try {
      const log = JSON.parse(localStorage.getItem('ggsipu_hostel_email_log') || '[]');
      log.push({ type: 'offline-verification', applicationId: student.ApplicationID, enrollmentNo: student.EnrollmentNo, to: student.Email, sentAt: student.OfflineVerificationEmailSentAt });
      localStorage.setItem('ggsipu_hostel_email_log', JSON.stringify(log));
    } catch (e) {}
  }
  saveLocalStudents(students);
  LOCAL_MOCK_STORE.students = students;
  return decision;
}

function recordLocalScreeningFailure(enrollmentNo, error) {
  const students = getLocalStudents();
  const student = students.find(item => String(item.EnrollmentNo || '').trim().toLowerCase() === String(enrollmentNo || '').trim().toLowerCase());
  if (!student || String(student.DocumentStatus) !== 'Screening Pending') return { retry: false };
  const attempts = Number(student.MarksheetScreeningAttempts || 0) + 1;
  const finalAttempt = attempts >= 3;
  student.MarksheetScreeningAttempts = attempts;
  student.MarksheetVerificationLastError = String(error && error.message || error).slice(0, 500);
  student.MarksheetRemarks = finalAttempt
    ? 'The Google/OpenAI AI-provenance check could not complete. Administrator approval is required.'
    : `Automated screening attempt ${attempts} failed and will be retried.`;
  student.DocumentRemarks = student.MarksheetRemarks;
  if (finalAttempt) {
    student.MarksheetStatus = 'AI Check Inconclusive — Manual Approval Required';
    student.DocumentStatus = 'AI Check Inconclusive — Manual Approval Required';
    student.MarksheetAiProvenanceStatus = 'Inconclusive';
    student.MarksheetVerificationCheckedAt = new Date().toISOString();
  }
  saveLocalStudents(students);
  LOCAL_MOCK_STORE.students = students;
  return { retry: !finalAttempt, attempts };
}

async function scheduleLocalMarksheetScreening(enrollmentNo) {
  try {
    return await runLocalMarksheetScreening(enrollmentNo);
  } catch (error) {
    console.warn('Local marksheet screening attempt failed.', error);
    const failure = recordLocalScreeningFailure(enrollmentNo, error);
    if (failure.retry) setTimeout(() => scheduleLocalMarksheetScreening(enrollmentNo), Math.min(2000, failure.attempts * 500));
    return failure;
  }
}

function handleLocalFallback(action, data, params) {
  const students = getLocalStudents();

  switch (action) {
    case 'getStudents':
      return students;
    case 'getAdminStudentsPage': {
      const page = Math.max(1, Number(params?.page) || 1);
      const pageSize = Math.max(1, Math.min(100, Number(params?.pageSize) || 50));
      const query = String(params?.query || '').trim().toLowerCase();
      const documentStatus = String(params?.documentStatus || '').trim().toLowerCase();
      const fields = ['ApplicationID', 'EnrollmentNo', 'Name', 'Gender', 'Programme', 'Branch', 'TwelfthMarks', 'Category', 'DistanceKm', 'PWD', 'Status', 'Priority', 'Timestamp', 'DocumentStatus', 'DocumentPolicyVersion', 'OfflineVerificationEmailSentAt', 'DiscrepancyEmailSentAt'];
      const filtered = students.filter(student => (!query || String(student.Name || '').toLowerCase().includes(query) || String(student.EnrollmentNo || '').toLowerCase().includes(query)) && (!documentStatus || String(student.DocumentStatus || 'Pending').toLowerCase() === documentStatus));
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      const safePage = Math.min(page, totalPages);
      const start = (safePage - 1) * pageSize;
      return { items: filtered.slice(start, start + pageSize).map(student => Object.fromEntries(fields.filter(field => student[field] !== undefined).map(field => [field, student[field]]))), page: safePage, pageSize, total: filtered.length, totalPages, generatedAt: new Date().toISOString() };
    }
    case 'getAdminStudentDetail': {
      const appId = String(params?.applicationId || '').trim().toLowerCase();
      const enrollment = String(params?.enrollmentNo || '').trim().toLowerCase();
      return students.find(student => appId ? String(student.ApplicationID || '').trim().toLowerCase() === appId : String(student.EnrollmentNo || '').trim().toLowerCase() === enrollment) || { error: 'Student not found.' };
    }
    case 'getRooms':
      return LOCAL_MOCK_STORE.rooms;
    case 'getAdminRoomsOverview':
      return { rooms: LOCAL_MOCK_STORE.rooms, occupancy: {}, generatedAt: new Date().toISOString() };
    case 'getAllocations':
      return LOCAL_MOCK_STORE.allocations;
    case 'getAdminAllocationsPage': {
      const page = Math.max(1, Number(params?.page) || 1);
      const pageSize = Math.max(1, Math.min(100, Number(params?.pageSize) || 50));
      const gender = String(params?.gender || '').toLowerCase();
      const status = String(params?.status || '').toLowerCase();
      const priority = String(params?.priority || '');
      const priorityByEnrollment = Object.fromEntries(students.map(student => [String(student.EnrollmentNo || '').trim().toLowerCase(), String(student.Priority || '')]));
      const studentByEnrollment = Object.fromEntries(students.map(student => [String(student.EnrollmentNo || '').trim().toLowerCase(), student]));
      const filtered = LOCAL_MOCK_STORE.allocations.filter(allocation => (!gender || String(allocation.Gender || '').toLowerCase().includes(gender)) && (!status || String(allocation.Status || '').toLowerCase().includes(status)) && (!priority || priorityByEnrollment[String(allocation.EnrollmentNo || '').trim().toLowerCase()] === priority)).map(allocation => Object.assign({}, allocation, studentByEnrollment[String(allocation.EnrollmentNo || '').trim().toLowerCase()] || {})).slice().reverse();
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      const safePage = Math.min(page, totalPages);
      const start = (safePage - 1) * pageSize;
      return { items: filtered.slice(start, start + pageSize), page: safePage, pageSize, total: filtered.length, totalPages, generatedAt: new Date().toISOString() };
    }
    case 'getGrievances':
      return LOCAL_MOCK_STORE.grievances;
    case 'getNotices':
      return LOCAL_MOCK_STORE.notices;
    case 'getSettingsPublic':
      return {
        registrationOpen: String(LOCAL_MOCK_STORE.settings.REGISTRATION_OPEN || 'true').toLowerCase() !== 'false',
        registrationCloseDate: LOCAL_MOCK_STORE.settings.REGISTRATION_CLOSE_DATE || '',
        hostelOfficeContact: LOCAL_MOCK_STORE.settings.HOSTEL_OFFICE_CONTACT || 'Contact the Warden Office for official hostel support.',
        messFeeNote: LOCAL_MOCK_STORE.settings.MESS_FEE_NOTE || 'Mess and hostel fee details will be announced through official notices.'
      };
    case 'getProvenanceVerifierHealth':
      return { ready: true, version: 'local-test-verifier', dependency: 'available', checkedAt: new Date().toISOString(), message: 'Local verifier is ready.' };
    case 'getHistoricalMarksheetMigrationStatus':
      return {
        eligible: students.filter(student => String(student.DocumentPolicyVersion || '') !== 'google-openai-c2pa-auto-verify-v2' && (String(student.DocumentStatus || '') === 'Offline Verification Required' || String(student.DocumentStatus || '').includes('Inconclusive')) && student.MarksheetFileId && !student.DocumentManualReviewedAt && !student.DocumentManualEvidenceSource).length,
        screeningPending: students.filter(student => String(student.DocumentPolicyVersion || '') === 'google-openai-c2pa-auto-verify-v2' && String(student.DocumentStatus || '') === 'Screening Pending').length,
        policyVersion: 'google-openai-c2pa-auto-verify-v2',
        generatedAt: new Date().toISOString()
      };
    case 'updateSetting': {
      const key = data.Key || data.key;
      if (key) LOCAL_MOCK_STORE.settings[key] = data.Value !== undefined ? data.Value : data.value;
      return { success: true };
    }
    case 'getAllocationPreview': {
      const pending = students.filter(s => {
        const st = String(s.Status || '').toLowerCase();
        return st === 'pending';
      });
      const verifiedPending = pending.filter(s => String(s.DocumentStatus || '').toLowerCase() === 'verified');
      return {
        success: true,
        verifiedPending: verifiedPending.length,
        unverifiedPending: pending.length - verifiedPending.length,
        availableBoysSeats: LOCAL_MOCK_STORE.rooms
          .filter(r => String(r.HostelType || '').toLowerCase().includes('boy'))
          .reduce((sum, r) => sum + (Number(r.VacantBeds) || 0), 0),
        availableGirlsSeats: LOCAL_MOCK_STORE.rooms
          .filter(r => String(r.HostelType || '').toLowerCase().includes('girl'))
          .reduce((sum, r) => sum + (Number(r.VacantBeds) || 0), 0)
      };
    }
    case 'getDashboard': {
      const allocatedBoys = students.filter(s => {
        const st = String(s.Status || '').toLowerCase();
        const g = String(s.Gender || '').toLowerCase();
        return st === 'allocated' && ((g.includes('male') && !g.includes('female')) || g.includes('boy') || g === 'm');
      }).length;
      const allocatedGirls = students.filter(s => {
        const st = String(s.Status || '').toLowerCase();
        const g = String(s.Gender || '').toLowerCase();
        return st === 'allocated' && (g.includes('female') || g.includes('girl') || g === 'f');
      }).length;
      const waitlisted = students.filter(s => String(s.Status).toLowerCase() === 'waitlisted').length;
      const pending = students.filter(s => String(s.Status).toLowerCase() === 'pending').length;

      return {
        totalApplied: students.length,
        allocated: allocatedBoys + allocatedGirls,
        waitlisted: waitlisted,
        pending: pending,
        allocatedBoys: allocatedBoys,
        allocatedGirls: allocatedGirls,
        boyStats: { total: 264, occupied: allocatedBoys, vacant: 264 - allocatedBoys },
        girlStats: { total: 176, occupied: allocatedGirls, vacant: 176 - allocatedGirls },
        priorityBreakdown: [0, 0, 0, 0, 0],
        recentAllocations: LOCAL_MOCK_STORE.allocations.slice(-5).reverse(),
        generatedAt: new Date().toISOString()
      };
    }
    case 'getStudentStatus': {
      const enrollInput = String(params?.enrollmentNo || '').trim().toLowerCase();
      const dobInput = normalizeDateComparison(params?.dob);

      const s = students.find(st => String(st.EnrollmentNo || st.rollNo || '').trim().toLowerCase() === enrollInput);
      if (!s) {
        return { error: `Student with Enrollment No "${params?.enrollmentNo || enrollInput}" not found. Please register first or try demo accounts.` };
      }

      const sDob = normalizeDateComparison(s.DOB || s.dob);
      if (dobInput && sDob && dobInput !== sDob) {
        return { error: 'Incorrect Date of Birth entered. Please check your DOB.' };
      }

      const isAllocated = String(s.Status || '').toLowerCase() === 'allocated';
      const alloc = LOCAL_MOCK_STORE.allocations.find(a => String(a.EnrollmentNo).trim().toLowerCase() === enrollInput);
      const applicationDetails = { ...s };
      ['MarksheetChecksum', 'MarksheetBrowserChecksum', 'MarksheetRetrievedChecksum', 'MarksheetMetadataSummary', 'MarksheetMetadataFindings', 'MarksheetAiProvenanceStatus', 'MarksheetAiProvider', 'MarksheetC2paStatus', 'MarksheetC2paProvider', 'MarksheetC2paIssuer', 'MarksheetC2paSigner', 'MarksheetC2paSigningTime', 'MarksheetC2paVerifierVersion', 'MarksheetApprovalSource', 'MarksheetSynthIdProvider', 'MarksheetSynthIdDetectorVersion', 'MarksheetVerificationReasons', 'MarksheetVerificationExplanationCodes', 'MarksheetVerificationSummary', 'MarksheetVerificationLastError', 'DocumentAuditLog'].forEach(key => { delete applicationDetails[key]; });
      let verificationSummary = [];
      try { verificationSummary = JSON.parse(String(s.MarksheetVerificationSummary || '[]')); } catch (error) { verificationSummary = []; }
      if (!Array.isArray(verificationSummary)) verificationSummary = [];
      return {
        success: true,
        name: s.Name || s.name || 'Student',
        enrollmentNo: s.EnrollmentNo || s.rollNo,
        applicationId: s.ApplicationID || 'GGSIPU-2026',
        status: s.Status || 'Pending',
        priority: s.Priority || 5,
        applicationDetails,
        allocation: alloc || null,
        allocatedRoom: alloc ? alloc.RoomNumber : null,
        allocatedHostel: alloc ? alloc.HostelName : null,
        allotmentProbability: isAllocated ? null : localCalculateProbability(s),
        documentVerification: {
          status: s.DocumentStatus || 'Screening Pending',
          checkedAt: s.MarksheetVerificationCheckedAt || '',
          remarks: s.DocumentRemarks || '',
          aiCheckStatus: s.MarksheetAiProvenanceStatus || (s.DocumentStatus === 'Screening Pending' ? 'Pending' : ''),
          approvalSource: s.MarksheetApprovalSource || '',
          explanation: verificationSummary.map(String).slice(0, 8),
          instructions: String(s.DocumentStatus || '').toLowerCase() === 'offline verification required'
            ? 'Please bring the original 12th marksheet to the hostel office for offline verification.'
            : String(s.DocumentStatus || '').toLowerCase().includes('manual approval required')
              ? 'The Google/OpenAI AI-provenance check is complete. An administrator must review the marksheet before allocation.'
              : ''
        }
      };
    }
    case 'submitApplication': {
      let localFileValidation;
      try {
        localFileValidation = validateLocalMarksheetPayload(data && data.documents && data.documents.marksheet);
      } catch (error) {
        return { success: false, error: error.message };
      }
      const appId = 'GGSIPU-2026-' + Math.random().toString(36).substring(2, 7).toUpperCase();
      const enroll = data.EnrollmentNo || data.rollNo || '00000000000';
      const name = data.Name || data.name || 'Applicant';
      const dob = data.DOB || data.dob || '';
      const pwd = data.PWD || data.pwd || 'No';
      const category = data.Category || data.domicile || 'Delhi';
      let priority = 4;
      if (pwd === 'Yes') priority = 1;
      else if (category === 'Outside Delhi') priority = 2;

      const newStudent = {
        ApplicationID: appId,
        EnrollmentNo: enroll,
        Name: name,
        Gender: data.Gender || data.gender || 'Male',
        DOB: dob,
        Email: data.Email || data.email || '',
        Phone: data.Phone || data.phone || '',
        Programme: data.Programme || data.programme || 'B.Tech',
        Branch: data.Branch || data.branch || 'CSE',
        Year: data.Year || data.year || '1st',
        TwelfthMarks: data.TwelfthMarks || data.marks12 || 85,
        Category: category,
        State: data.State || data.state || 'Delhi',
        DistanceKm: data.DistanceKm || data.distance || 25,
        PWD: pwd,
        Status: 'Pending',
        Priority: priority,
        Timestamp: new Date().toISOString(),
        AadhaarFile: 'Not Applicable',
        PhotoFile: 'Not Applicable',
        MarksheetFile: data.documents?.marksheet ? `data:${data.documents.marksheet.type};base64,${data.documents.marksheet.data}` : '',
        MarksheetFileId: 'local-' + appId,
        MarksheetMimeType: localFileValidation.mimeType,
        MarksheetFileSize: localFileValidation.size,
        MarksheetBrowserChecksum: data.documents?.marksheet?.browserChecksum || '',
        LocalMarksheetOriginalName: data.documents?.marksheet?.name || '',
        PwdCertificateFile: 'Not Applicable',
        AadhaarStatus: 'Not Applicable',
        PhotoStatus: 'Not Applicable',
        MarksheetStatus: 'Screening Pending',
        PwdCertificateStatus: 'Not Applicable',
        AadhaarRemarks: '',
        PhotoRemarks: '',
        MarksheetRemarks: '',
        PwdCertificateRemarks: '',
        DocumentStatus: 'Screening Pending',
        DocumentRemarks: 'Google/OpenAI AI-provenance screening is pending.',
        DiscrepancyEmailSentAt: '',
        OfflineVerificationEmailSentAt: '',
        DocumentPolicyVersion: 'google-openai-c2pa-auto-verify-v2',
        MarksheetScreeningAttempts: 0
      };

      const updatedList = [newStudent, ...students.filter(st => String(st.EnrollmentNo).trim() !== String(enroll).trim())];
      saveLocalStudents(updatedList);
      LOCAL_MOCK_STORE.students = updatedList;
      setTimeout(() => scheduleLocalMarksheetScreening(enroll), 25);
      return { success: true, applicationId: appId, documentStatus: 'Screening Pending', message: 'Application submitted successfully!' };
    }
    case 'updateDocumentVerification': {
      const targetEnroll = String(data.EnrollmentNo || '').trim().toLowerCase();
      const s = students.find(st => String(st.EnrollmentNo || st.rollNo || '').trim().toLowerCase() === targetEnroll);
      if (!s) return { success: false, error: 'Student record not found.' };
      const policyVersion = String(s.DocumentPolicyVersion || '');
      const manualDecision = String(data.ManualDecision || data.manualDecision || '').trim();
      let requestedStatus = data.DocumentStatus || s.DocumentStatus;
      let evidenceSource = String(data.EvidenceSource || data.evidenceSource || '').trim();
      if (policyVersion === 'google-openai-c2pa-auto-verify-v2' && manualDecision) {
        if (!['Approve after document review', 'Require original verification'].includes(manualDecision)) return { success: false, error: 'Select a valid manual verification decision.' };
        requestedStatus = manualDecision === 'Approve after document review' ? 'Verified' : 'Offline Verification Required';
        evidenceSource = 'Administrator Document Review';
      }
      if (requestedStatus === 'Verified' && !['Administrator Document Review', 'Original Document', 'Trusted Issuer Signature', 'DigiLocker', 'Official Board Record'].includes(evidenceSource)) {
        return { success: false, error: 'Verified status requires an approved evidence source.' };
      }
      const previousStatus = s.DocumentStatus || '';
      const docs = data.documents || {};
      const rems = data.remarksByDocument || {};
      if (docs.aadhaar) s.AadhaarStatus = docs.aadhaar;
      if (docs.photo) s.PhotoStatus = docs.photo;
      if (docs.marksheet) s.MarksheetStatus = docs.marksheet;
      if (docs.pwdCertificate) s.PwdCertificateStatus = docs.pwdCertificate;
      if (rems.aadhaar !== undefined) s.AadhaarRemarks = rems.aadhaar;
      if (rems.photo !== undefined) s.PhotoRemarks = rems.photo;
      if (rems.marksheet !== undefined) s.MarksheetRemarks = rems.marksheet;
      if (rems.pwdCertificate !== undefined) s.PwdCertificateRemarks = rems.pwdCertificate;
      s.DocumentStatus = requestedStatus;
      s.MarksheetStatus = requestedStatus;
      s.DocumentRemarks = data.DocumentRemarks !== undefined ? data.DocumentRemarks : s.DocumentRemarks;
      s.DocumentPreviousStatus = previousStatus;
      s.DocumentManualReviewer = data.Reviewer || data.reviewer || 'Administrator';
      s.DocumentManualReviewedAt = new Date().toISOString();
      s.DocumentManualEvidenceSource = evidenceSource;
      s.MarksheetApprovalSource = requestedStatus === 'Verified' ? 'Administrator Document Review' : '';
      let audit = [];
      try { audit = JSON.parse(s.DocumentAuditLog || '[]'); } catch (e) { audit = []; }
      if (!Array.isArray(audit)) audit = [];
      audit.push({ at: s.DocumentManualReviewedAt, reviewer: s.DocumentManualReviewer, evidenceSource, manualDecision, previousStatus, newStatus: s.DocumentStatus, remarks: s.DocumentRemarks || '' });
      s.DocumentAuditLog = JSON.stringify(audit.slice(-50));
      if (s.DocumentStatus === 'Offline Verification Required' && !s.OfflineVerificationEmailSentAt) {
        s.OfflineVerificationEmailSentAt = new Date().toISOString();
        try {
          const log = JSON.parse(localStorage.getItem('ggsipu_hostel_email_log') || '[]');
          log.push({ type: 'offline-verification', applicationId: s.ApplicationID, enrollmentNo: s.EnrollmentNo, to: s.Email, sentAt: s.OfflineVerificationEmailSentAt });
          localStorage.setItem('ggsipu_hostel_email_log', JSON.stringify(log));
        } catch (e) {}
      }
      saveLocalStudents(students);
      return { success: true, message: 'Document verification updated.' };
    }
    case 'sendDiscrepancyEmail': {
      const targetEnroll = String(data.EnrollmentNo || '').trim().toLowerCase();
      const s = students.find(st => String(st.EnrollmentNo || st.rollNo || '').trim().toLowerCase() === targetEnroll);
      if (!s) return { success: false, error: 'Student not found.' };
      if (String(s.Status || '').toLowerCase() === 'allocated') {
        return { success: false, error: 'Discrepancy email is blocked because this student is already allocated.' };
      }
      if (String(s.DocumentStatus || '').toLowerCase() !== 'discrepancy') {
        return { success: false, error: 'Document status is not Discrepancy.' };
      }
      s.DiscrepancyEmailSentAt = new Date().toLocaleString();
      saveLocalStudents(students);
      return { success: true, sent: 1, message: `Discrepancy email sent to ${s.Name} (${s.Email}).` };
    }
    case 'postNotice': {
      const notice = {
        NoticeID: 'NOT-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
        Title: data.Title || data.title || 'Hostel Notice',
        Body: data.Body || data.content || data.body || '',
        PostedBy: data.PostedBy || data.postedBy || 'Hostel Administration',
        PostedAt: new Date().toLocaleDateString(),
        Active: true,
        Audience: normalizeNoticeAudience(data.Audience || data.audience || data.Destination || data.destination)
      };
      LOCAL_MOCK_STORE.notices = [notice, ...LOCAL_MOCK_STORE.notices];
      return { success: true, noticeId: notice.NoticeID };
    }
    case 'fileGrievance': {
      const ticketId = 'GRV-' + Math.random().toString(36).substring(2, 7).toUpperCase();
      const grievance = {
        TicketID: ticketId,
        ApplicationID: data.ApplicationID || data.applicationId || '',
        StudentName: data.StudentName || data.studentName || '',
        StudentEmail: data.StudentEmail || data.studentEmail || '',
        Date: new Date().toLocaleDateString(),
        Category: data.Category || data.category || '',
        Subject: data.Subject || data.subject || '',
        Description: data.Description || data.description || '',
        AttachmentURL: data.AttachmentURL || '',
        Status: 'Open',
        AdminResponse: '',
        ResolvedAt: ''
      };
      LOCAL_MOCK_STORE.grievances = [grievance, ...LOCAL_MOCK_STORE.grievances];
      return { success: true, ticketId };
    }
    case 'resolveGrievance': {
      const ticketId = data.TicketID || data.ticketId || data.id;
      const grievance = LOCAL_MOCK_STORE.grievances.find(g => String(g.TicketID) === String(ticketId));
      if (!grievance) return { success: false, error: 'Grievance not found.' };
      grievance.Status = 'Resolved';
      grievance.AdminResponse = data.AdminResponse || data.adminResponse || 'Resolved by hostel administration.';
      grievance.ResolvedAt = new Date().toLocaleString();
      return { success: true };
    }
    case 'runAllocation': {
      const totalPending = students.filter(s => {
        const st = String(s.Status || '').toLowerCase();
        return st === 'pending';
      });

      const pending = totalPending.filter(s => {
        const docStatus = String(s.DocumentStatus || '').toLowerCase();
        return docStatus === 'verified';
      });

      const unverifiedPendingCount = totalPending.length - pending.length;

      if (pending.length === 0) {
        if (unverifiedPendingCount > 0) {
          return {
            success: true,
            allocated: 0,
            waitlisted: 0,
            totalPending: totalPending.length,
            message: `No allocations processed. There are ${unverifiedPendingCount} pending application(s) in queue, but none have fully verified documents yet.`
          };
        }
        const allocatedTotal = students.filter(s => String(s.Status || '').toLowerCase() === 'allocated').length;
        return {
          success: true,
          allocated: allocatedTotal,
          waitlisted: 0,
          totalPending: 0,
          message: `All ${students.length} student application(s) have already been allocated/processed! No pending applications left in queue.`
        };
      }

      let allocatedCount = 0;
      let waitlistedCount = 0;

      const boys = pending.filter(s => {
        const g = String(s.Gender || '').toLowerCase();
        return (g.includes('male') && !g.includes('female')) || g.includes('boy') || g === 'm';
      });
      const girls = pending.filter(s => {
        const g = String(s.Gender || '').toLowerCase();
        return g.includes('female') || g.includes('girl') || g === 'f';
      });

      const rooms = LOCAL_MOCK_STORE.rooms;

      function allocateLocalGroup(group, hostelType) {
        group.sort((a, b) => {
          const aPri = Number(a.Priority) || 5;
          const bPri = Number(b.Priority) || 5;
          if (aPri !== bPri) return aPri - bPri;
          if (aPri === 2 || aPri === 3) return (Number(b.TwelfthMarks) || 0) - (Number(a.TwelfthMarks) || 0);
          if (aPri === 4) return (Number(b.DistanceKm) || 0) - (Number(a.DistanceKm) || 0);
          return new Date(a.Timestamp || 0) - new Date(b.Timestamp || 0);
        });

        const targetRooms = rooms.filter(r => String(r.HostelType || r.hostelType || '').toLowerCase().includes(hostelType));

        group.forEach(st => {
          let assigned = false;
          for (const rm of targetRooms) {
            if (rm.VacantBeds > 0) {
              rm.VacantBeds--;
              rm.Occupied++;
              st.Status = 'Allocated';
              const allocId = 'ALC-' + Math.random().toString(36).substring(2, 7).toUpperCase();
              LOCAL_MOCK_STORE.allocations.push({
                AllocationID: allocId,
                Timestamp: new Date().toISOString(),
                ApplicationID: st.ApplicationID,
                EnrollmentNo: st.EnrollmentNo,
                StudentName: st.Name,
                Gender: st.Gender,
                RoomID: rm.RoomID,
                RoomNumber: rm.RoomNumber,
                HostelName: rm.HostelName,
                Floor: '1st Floor',
                BedNumber: String(rm.Occupied),
                Status: 'Confirmed',
                LetterSent: 'No',
                LetterSentAt: ''
              });
              allocatedCount++;
              assigned = true;
              break;
            }
          }
          if (!assigned) {
            st.Status = 'Waitlisted';
            waitlistedCount++;
          }
        });
      }

      allocateLocalGroup(boys, 'boy');
      allocateLocalGroup(girls, 'girl');
      saveLocalStudents(students);

      return {
        success: true,
        allocated: allocatedCount,
        waitlisted: waitlistedCount,
        message: `Successfully processed ${pending.length} application(s) (${allocatedCount} allocated, ${waitlistedCount} waitlisted).${unverifiedPendingCount > 0 ? ' (Skipped ' + unverifiedPendingCount + ' pending student(s) due to unverified documents)' : ''}`
      };
    }
    default:
      return { success: true, message: 'Processed ' + action + ' request successfully.' };
  }
}

// ── Toast notification ────────────────────────────────────────────────────
function showAPIToast(message, type = 'info') {
  // Re-use global showToast if available (defined in script.js / page)
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  if (typeof window.showAdminToast === 'function') {
    window.showAdminToast(message, type);
    return;
  }
  // Fallback: create a minimal toast
  let t = document.getElementById('_apiToast');
  if (!t) {
    t = document.createElement('div');
    t.id = '_apiToast';
    t.style.cssText = `
      position:fixed;bottom:1.5rem;right:1.5rem;z-index:99999;
      background:hsl(228,30%,10%);color:#fff;
      padding:.75rem 1.25rem;border-radius:8px;font-size:.875rem;
      font-family:Inter,sans-serif;font-weight:500;
      box-shadow:0 8px 24px rgba(0,0,0,.25);
      opacity:0;transform:translateY(10px);
      transition:all .3s cubic-bezier(.22,1,.36,1);
      max-width:320px;pointer-events:none;
    `;
    document.body.appendChild(t);
  }
  const colors = { success:'hsl(142,70%,40%)', error:'hsl(0,80%,55%)', info:'hsl(41,100%,47%)' };
  t.style.borderLeft = `4px solid ${colors[type] || colors.info}`;
  t.textContent = message;
  requestAnimationFrame(() => { t.style.opacity='1'; t.style.transform='translateY(0)'; });
  clearTimeout(t._tid);
  t._tid = setTimeout(() => { t.style.opacity='0'; t.style.transform='translateY(10px)'; }, 3500);
}

// ── CSV export ────────────────────────────────────────────────────────────
function downloadCSV(data, filename) {
  if (!data || !data.length) { showAPIToast('No data to export.', 'error'); return; }
  const keys = Object.keys(data[0]);
  const rows = data.map(row =>
    keys.map(k => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(',')
  );
  const csv  = [keys.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showAPIToast(`✅ ${filename} downloaded!`, 'success');
}

// ── Chatbot LLM fallback ──────────────────────────────────────────────────
async function askChatbot(message, context = {}) {
  return window.AppLoading.withTask(API_LOADING_LABELS.askChatbot, async () => {
    try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, context })
    });

    let result = {};
    try {
      result = await response.json();
    } catch (e) {}

    if (!response.ok) {
      return {
        success: false,
        error: result.error || 'Chat assistant is temporarily unavailable.'
      };
    }

    return result;
  } catch (error) {
    console.warn('[HostelAPI] Chatbot fallback unavailable.', error);
    return {
      success: false,
      error: 'The smart assistant is unavailable right now. You can still use the portal tabs for status, notices, and grievances.'
    };
  }
  });
}

// ── Public API ────────────────────────────────────────────────────────────
window.HostelAPI = {
  // ── Admin ──────────────────────────────────────────────
  getDashboard:     (options = {}) => gasRequest('getDashboard', 'GET', null, null, options),
  getStudents:      ()         => gasRequest('getStudents',      'GET'),
  getAdminStudentsPage: (params = {}, options = {}) => gasRequest('getAdminStudentsPage', 'GET', null, params, options),
  getAdminStudentDetail: (params = {}, options = {}) => gasRequest('getAdminStudentDetail', 'GET', null, params, options),
  getRooms:         ()         => gasRequest('getRooms',         'GET'),
  getAdminRoomsOverview: (options = {}) => gasRequest('getAdminRoomsOverview', 'GET', null, null, options),
  getAllocations:    ()         => gasRequest('getAllocations',   'GET'),
  getAdminAllocationsPage: (params = {}, options = {}) => gasRequest('getAdminAllocationsPage', 'GET', null, params, options),
  getGrievances:    ()         => gasRequest('getGrievances',    'GET'),
  getNotices:       (options = {}) => gasRequest('getNotices',       'GET', null, null, options),
  getSettingsPublic: ()        => gasRequest('getSettingsPublic', 'GET'),
  getProvenanceVerifierHealth: (options = {}) => gasRequest('getProvenanceVerifierHealth', 'GET', null, null, options),
  getHistoricalMarksheetMigrationStatus: (options = {}) => gasRequest('getHistoricalMarksheetMigrationStatus', 'GET', null, null, options),
  getAllocationPreview: ()     => gasRequest('getAllocationPreview', 'GET', null, null, { loading: false }),
  runAllocation:    ()         => gasRequest('runAllocation',    'GET', null, null, { loading: false }),
  sendLetters:      ()         => gasRequest('sendLetters',      'GET'),
  postNotice:       (data)     => gasRequest('postNotice',       'POST', data),
  resolveGrievance: (data)     => gasRequest('resolveGrievance', 'POST', data),
  updateDocumentVerification: (data) => gasRequest('updateDocumentVerification', 'POST', data),
  sendDiscrepancyEmail: (data) => gasRequest('sendDiscrepancyEmail', 'POST', data),
  sendDiscrepancyEmails: (data = {}) => gasRequest('sendDiscrepancyEmails', 'POST', data),
  updateSetting:    (data)     => gasRequest('updateSetting',    'POST', data),
  adminLogin:       (data, options = {}) => gasRequest('adminLogin',       'POST', data, null, options),
  exportCSV:        (data, fn) => downloadCSV(data, fn),

  // ── Student ─────────────────────────────────────────────
  submitApplication: (data)      => gasRequest('submitApplication', 'POST', data),
  getStudentStatus:  (no, dob)   => gasRequest('getStudentStatus',  'GET',  null, { enrollmentNo: no, dob }),
  fileGrievance:     (data)      => gasRequest('fileGrievance',     'POST', data),
  peekCache: (action, params = {}, allowExpired = true) => readApiCache(action, params, allowExpired),
  invalidateCache: (actions) => invalidateApiCache(actions),
  runLocalMarksheetScreening: (enrollmentNo, result) => runLocalMarksheetScreening(enrollmentNo, result),
  askChatbot:         (message, context) => askChatbot(message, context),
};
