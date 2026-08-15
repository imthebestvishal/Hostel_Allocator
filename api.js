/* ============================================
   api.js — GAS API Layer (Live Mode)
   Connected to: Google Apps Script + Google Sheets
   ============================================ */

const GAS_CONFIG = {
  URL: 'https://script.google.com/macros/s/AKfycbwwkz9T8iuNj35StYWCTZ59CtMtQ0RBvRugNoBkE7Czxkl45YpoUGOBkoEEW74ocATkiw/exec'
};

// ── Core request function ─────────────────────────────────────────────────
async function gasRequest(action, method = 'GET', data = null, params = null) {
  try {
    let url = GAS_CONFIG.URL;
    let options = { method };

    if (method === 'GET') {
      const searchParams = new URLSearchParams({ action });
      if (params) {
        for (const key in params) searchParams.append(key, params[key]);
      }
      url += '?' + searchParams.toString();
    } else {
      // GAS works best with text/plain to avoid CORS preflight
      options.body = JSON.stringify({ action, data });
      options.headers = { 'Content-Type': 'text/plain' };
    }

    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const result = await response.json();
    return result;

  } catch (error) {
    console.error(`[HostelAPI] ${action} failed:`, error);
    showAPIToast('Connection error. Please try again.', 'error');
    throw error;
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

// ── Public API ────────────────────────────────────────────────────────────
window.HostelAPI = {
  // ── Admin ──────────────────────────────────────────────
  getDashboard:     ()         => gasRequest('getDashboard',     'GET'),
  getStudents:      ()         => gasRequest('getStudents',      'GET'),
  getRooms:         ()         => gasRequest('getRooms',         'GET'),
  getAllocations:    ()         => gasRequest('getAllocations',   'GET'),
  getGrievances:    ()         => gasRequest('getGrievances',    'GET'),
  getNotices:       ()         => gasRequest('getNotices',       'GET'),
  runAllocation:    ()         => gasRequest('runAllocation',    'GET'),
  sendLetters:      ()         => gasRequest('sendLetters',      'GET'),
  postNotice:       (data)     => gasRequest('postNotice',       'POST', data),
  resolveGrievance: (data)     => gasRequest('resolveGrievance', 'POST', data),
  adminLogin:       (data)     => gasRequest('adminLogin',       'POST', data),
  exportCSV:        (data, fn) => downloadCSV(data, fn),

  // ── Student ─────────────────────────────────────────────
  submitApplication: (data)      => gasRequest('submitApplication', 'POST', data),
  getStudentStatus:  (no, dob)   => gasRequest('getStudentStatus',  'GET',  null, { enrollmentNo: no, dob }),
  fileGrievance:     (data)      => gasRequest('fileGrievance',     'POST', data),
};
