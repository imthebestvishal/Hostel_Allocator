(function () {
  const DAILY_LIMIT = 10;
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  const FAQ = {
    fees: 'Hostel fee and mess fee instructions are published through the Notice Board. Check the latest notices first, then contact the hostel office if your fee receipt or payment status is unclear.',
    curfew: 'Hostel timings and late-entry rules are controlled by the Warden Office and may change by notice. Please follow the latest notice shown in the portal.',
    reporting: 'For reporting after allotment, carry your application details, original documents, fee receipt, identity proof, and any document requested in the latest hostel notice.',
    contact: 'For official help, use the Grievance tab in this portal or contact the hostel office/Warden Office through the numbers shared in official notices.',
    deadline: 'Registration, document verification, allocation, reporting, and fee deadlines are announced through the Notice Board. Always treat the latest notice as final.'
  };

  const state = {
    ready: false,
    open: false,
    statusData: null,
    notices: [],
    root: null,
    messages: null,
    input: null,
    sendButton: null,
    chips: null
  };

  function normalize(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function field(obj, keys, fallback = '') {
    for (const key of keys) {
      if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
    }
    return fallback;
  }

  function getApp() {
    return state.statusData?.applicationDetails || {};
  }

  function getAlloc() {
    return state.statusData?.allocation || {};
  }

  function getStudentName() {
    return state.statusData?.name || field(getApp(), ['Name', 'name'], 'Student');
  }

  function getStatus() {
    return state.statusData?.status || field(getApp(), ['Status'], 'Pending');
  }

  function isAllocated() {
    return normalize(getStatus()) === 'allocated';
  }

  function getRoomText() {
    const alloc = getAlloc();
    const hostel = state.statusData?.allocatedHostel || field(alloc, ['HostelName'], '');
    const room = state.statusData?.allocatedRoom || field(alloc, ['RoomNumber'], '');
    const floor = field(alloc, ['Floor'], '');
    const bed = field(alloc, ['BedNumber'], '');

    if (!isAllocated() || !room) {
      return 'Your room is not allocated yet. Keep checking the Overview tab and Notice Board after the allocation engine is run.';
    }

    return `You are allotted ${hostel || 'the hostel'}, room ${room}${floor ? ', ' + floor : ''}${bed ? ', bed ' + bed : ''}. Carry your original documents and fee receipt when reporting.`;
  }

  function getStatusText() {
    const data = state.statusData || {};
    const app = getApp();
    const status = getStatus();
    const priority = data.priority || field(app, ['Priority'], 'N/A');
    const appId = data.applicationId || field(app, ['ApplicationID'], 'N/A');

    let nextStep = 'Watch the Notice Board for the next hostel administration update.';
    if (normalize(status) === 'pending') nextStep = 'Your application is still pending. Document verification and allocation must be completed before a room can be confirmed.';
    if (normalize(status) === 'waitlisted') nextStep = `You are waitlisted${data.waitlistPosition ? ' at position #' + data.waitlistPosition : ''}. Keep checking notices for movement or further rounds.`;
    if (normalize(status) === 'allocated') nextStep = 'Your room is allotted. Check the Room and Allotment Letter sections for reporting details.';

    return `Application ${appId} is currently ${status}. Your priority is ${priority}. ${nextStep}`;
  }

  function getProbabilityText() {
    const probability = state.statusData?.allotmentProbability;
    if (isAllocated()) return 'You are already allocated, so allotment probability is no longer needed.';
    if (!probability) return 'I do not have enough queue data to calculate allotment probability right now. Please check the Overview tab after your application data refreshes.';

    return `Your estimated allotment chance is ${probability.percent || 0}%. Queue rank: ${probability.queueRank || 'N/A'}, priority: ${probability.priority || 'N/A'}. Basis: ${probability.basis || 'priority and applicant queue position'}.`;
  }

  function getDocumentText() {
    const app = getApp();
    const rows = [
      ['Aadhaar', field(app, ['AadhaarStatus'], 'Not available'), field(app, ['AadhaarRemarks'], '')],
      ['Photo', field(app, ['PhotoStatus'], 'Not available'), field(app, ['PhotoRemarks'], '')],
      ['Marksheet', field(app, ['MarksheetStatus'], 'Not available'), field(app, ['MarksheetRemarks'], '')],
      ['PWD Certificate', field(app, ['PwdCertificateStatus'], 'Not Applicable'), field(app, ['PwdCertificateRemarks'], '')]
    ];
    const overall = field(app, ['DocumentStatus'], 'Pending');
    const summary = rows
      .filter(row => normalize(row[1]) !== 'not applicable')
      .map(row => `${row[0]}: ${row[1]}${row[2] ? ' (' + row[2] + ')' : ''}`)
      .join('; ');

    return `Overall document status: ${overall}. ${summary || 'Document-wise status is not available yet.'}`;
  }

  function getNoticeText() {
    if (!state.notices.length) return 'No live notices are loaded yet. Open the Notices tab to refresh the Notice Board.';
    const latest = state.notices.slice(0, 3).map(n => {
      const title = field(n, ['Title', 'title'], 'Hostel notice');
      const body = field(n, ['Body', 'body', 'content'], '');
      const date = field(n, ['Date', 'date', 'PostedAt'], '');
      return `${title}${date ? ' (' + date + ')' : ''}${body ? ': ' + body : ''}`;
    });
    return 'Latest notices: ' + latest.join(' | ');
  }

  function getGrievanceText() {
    return 'Use the Grievance tab to file a hostel issue. Choose the category, add a short subject, describe the issue clearly, and submit. I can take you there now.';
  }

  function localAnswer(message) {
    const text = normalize(message);

    if (!text) return null;
    if (/\b(other|another|someone|friend|classmate)\b/.test(text) && /\b(room|status|application|allocation|document|enrollment)\b/.test(text)) {
      return {
        text: 'I can only help with the logged-in student account. For another student, ask them to log in with their own enrollment number and date of birth.',
        action: null
      };
    }
    if (/\b(room|bed|hostel|allot|allotted|allocated)\b/.test(text) && !/\bchance|probability|possible|likely\b/.test(text)) return { text: getRoomText() };
    if (/\b(status|application|progress|stage|pending|waitlist|waitlisted)\b/.test(text) && !/\bdocument|doc\b/.test(text)) return { text: getStatusText() };
    if (/\b(chance|probability|likely|possibility|queue|rank)\b/.test(text)) return { text: getProbabilityText() };
    if (/\b(document|doc|aadhaar|photo|marksheet|certificate|verification|verified|discrepancy)\b/.test(text)) return { text: getDocumentText() };
    if (/\b(grievance|complaint|issue|problem|ticket|help)\b/.test(text)) return { text: getGrievanceText(), action: 'grievance' };
    if (/\b(notice|announcement|news|latest|update)\b/.test(text)) return { text: getNoticeText(), action: 'notices' };
    if (/\b(fee|payment|mess|receipt|dues)\b/.test(text)) return { text: FAQ.fees, action: 'notices' };
    if (/\b(curfew|gate|late|entry|timing|time)\b/.test(text)) return { text: FAQ.curfew, action: 'notices' };
    if (/\b(report|reporting|check ?in|joining|arrive)\b/.test(text)) return { text: FAQ.reporting, action: isAllocated() ? 'room' : 'notices' };
    if (/\b(contact|phone|warden|office|email)\b/.test(text)) return { text: FAQ.contact, action: 'grievance' };
    if (/\b(deadline|date|schedule|last date)\b/.test(text)) return { text: FAQ.deadline, action: 'notices' };

    return null;
  }

  function isHostelRelated(message) {
    return /\b(hostel|room|allocation|allotment|student|application|document|notice|grievance|warden|mess|fee|curfew|reporting|campus|priority|waitlist|bed)\b/i.test(message);
  }

  function cacheKey(message) {
    const enroll = state.statusData?.enrollmentNo || field(getApp(), ['EnrollmentNo'], 'student');
    return 'hostel_chat_cache_' + btoa(unescape(encodeURIComponent(enroll + ':' + normalize(message)))).slice(0, 80);
  }

  function getCachedAnswer(message) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey(message)) || 'null');
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.text;
    } catch (e) {}
    return null;
  }

  function setCachedAnswer(message, text) {
    try {
      localStorage.setItem(cacheKey(message), JSON.stringify({ at: Date.now(), text }));
    } catch (e) {}
  }

  function dailyKey() {
    const today = new Date().toISOString().slice(0, 10);
    return 'hostel_chat_llm_count_' + today;
  }

  function getDailyCount() {
    return Number(localStorage.getItem(dailyKey()) || 0);
  }

  function incrementDailyCount() {
    try {
      localStorage.setItem(dailyKey(), String(getDailyCount() + 1));
    } catch (e) {}
  }

  function safeContext() {
    const data = state.statusData || {};
    const app = getApp();
    const alloc = getAlloc();
    const probability = data.allotmentProbability || null;

    return {
      applicationId: data.applicationId || field(app, ['ApplicationID'], ''),
      status: getStatus(),
      priority: data.priority || field(app, ['Priority'], ''),
      category: field(app, ['Category'], ''),
      hostel: data.allocatedHostel || field(alloc, ['HostelName'], ''),
      room: data.allocatedRoom || field(alloc, ['RoomNumber'], ''),
      floor: field(alloc, ['Floor'], ''),
      bed: field(alloc, ['BedNumber'], ''),
      documentStatus: field(app, ['DocumentStatus'], ''),
      aadhaarStatus: field(app, ['AadhaarStatus'], ''),
      photoStatus: field(app, ['PhotoStatus'], ''),
      marksheetStatus: field(app, ['MarksheetStatus'], ''),
      pwdCertificateStatus: field(app, ['PwdCertificateStatus'], ''),
      probability: probability ? {
        percent: probability.percent,
        queueRank: probability.queueRank,
        priority: probability.priority,
        basis: probability.basis
      } : null,
      notices: state.notices.slice(0, 3).map(n => ({
        title: field(n, ['Title', 'title'], ''),
        body: field(n, ['Body', 'body', 'content'], ''),
        date: field(n, ['Date', 'date', 'PostedAt'], '')
      }))
    };
  }

  function injectStyles() {
    if (document.getElementById('hostel-chatbot-styles')) return;
    const style = document.createElement('style');
    style.id = 'hostel-chatbot-styles';
    style.textContent = `
      .hostel-chatbot { position: fixed; right: 24px; bottom: 24px; z-index: 1900; font-family: Inter, sans-serif; }
      .hostel-chatbot__button { width: 54px; height: 54px; border: none; border-radius: 50%; background: var(--c-primary); color: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.22); cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 20px; }
      .hostel-chatbot__panel { position: absolute; right: 0; bottom: 68px; width: min(380px, calc(100vw - 32px)); height: 540px; max-height: calc(100vh - 120px); background: #fff; border: 1px solid var(--c-border); border-radius: 8px; box-shadow: 0 18px 50px rgba(0,0,0,.22); display: none; overflow: hidden; }
      .hostel-chatbot.open .hostel-chatbot__panel { display: flex; flex-direction: column; }
      .hostel-chatbot__head { padding: 14px 16px; background: var(--c-primary); color: #fff; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .hostel-chatbot__title { font-size: 14px; font-weight: 700; }
      .hostel-chatbot__subtitle { font-size: 12px; opacity: .82; margin-top: 2px; }
      .hostel-chatbot__close { background: transparent; border: 0; color: #fff; cursor: pointer; font-size: 22px; line-height: 1; }
      .hostel-chatbot__messages { flex: 1; overflow-y: auto; padding: 14px; background: #f8fafc; display: flex; flex-direction: column; gap: 10px; }
      .hostel-chatbot__msg { max-width: 88%; padding: 10px 12px; border-radius: 8px; font-size: 13px; line-height: 1.45; white-space: pre-wrap; }
      .hostel-chatbot__msg.bot { align-self: flex-start; background: #fff; border: 1px solid var(--c-border); color: var(--c-text); }
      .hostel-chatbot__msg.user { align-self: flex-end; background: var(--c-primary); color: #fff; }
      .hostel-chatbot__chips { padding: 10px 12px 0; display: flex; gap: 8px; flex-wrap: wrap; background: #fff; border-top: 1px solid var(--c-border); }
      .hostel-chatbot__chip { border: 1px solid var(--c-border); background: #fff; border-radius: 999px; color: var(--c-primary); padding: 6px 10px; font-size: 12px; cursor: pointer; }
      .hostel-chatbot__action { margin-top: 8px; border: 1px solid var(--c-primary); background: #fff; color: var(--c-primary); border-radius: 6px; padding: 7px 10px; font-size: 12px; cursor: pointer; }
      .hostel-chatbot__form { padding: 12px; display: flex; gap: 8px; background: #fff; }
      .hostel-chatbot__input { flex: 1; border: 1px solid var(--c-border); border-radius: 6px; padding: 10px 11px; font-size: 13px; outline: none; min-width: 0; }
      .hostel-chatbot__send { border: 0; border-radius: 6px; background: var(--c-primary); color: #fff; padding: 0 14px; font-weight: 700; cursor: pointer; }
      .hostel-chatbot__send:disabled { opacity: .55; cursor: not-allowed; }
      @media (max-width: 640px) {
        .hostel-chatbot { right: 16px; bottom: 16px; }
        .hostel-chatbot__panel { position: fixed; left: 12px; right: 12px; bottom: 84px; width: auto; height: min(560px, calc(100vh - 120px)); }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureWidget() {
    if (state.root) return;
    injectStyles();

    const root = document.createElement('div');
    root.className = 'hostel-chatbot hidden';
    root.innerHTML = `
      <button class="hostel-chatbot__button" type="button" aria-label="Open hostel assistant">?</button>
      <section class="hostel-chatbot__panel" aria-label="Hostel assistant">
        <div class="hostel-chatbot__head">
          <div>
            <div class="hostel-chatbot__title">Hostel Assistant</div>
            <div class="hostel-chatbot__subtitle">Status, room, documents, notices</div>
          </div>
          <button class="hostel-chatbot__close" type="button" aria-label="Close hostel assistant">&times;</button>
        </div>
        <div class="hostel-chatbot__messages"></div>
        <div class="hostel-chatbot__chips"></div>
        <form class="hostel-chatbot__form">
          <input class="hostel-chatbot__input" type="text" maxlength="280" autocomplete="off" placeholder="Ask about your hostel application">
          <button class="hostel-chatbot__send" type="submit">Send</button>
        </form>
      </section>
    `;

    document.body.appendChild(root);
    state.root = root;
    state.messages = root.querySelector('.hostel-chatbot__messages');
    state.input = root.querySelector('.hostel-chatbot__input');
    state.sendButton = root.querySelector('.hostel-chatbot__send');
    state.chips = root.querySelector('.hostel-chatbot__chips');

    root.querySelector('.hostel-chatbot__button').addEventListener('click', toggle);
    root.querySelector('.hostel-chatbot__close').addEventListener('click', close);
    root.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      submit();
    });
  }

  function renderChips() {
    const chips = [
      'My status',
      'My room',
      'Documents',
      'Allocation chance',
      'Latest notices',
      'File grievance'
    ];
    state.chips.innerHTML = chips.map(chip => `<button class="hostel-chatbot__chip" type="button">${escapeHTML(chip)}</button>`).join('');
    state.chips.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => {
        state.input.value = button.textContent;
        submit();
      });
    });
  }

  function addMessage(text, role = 'bot', action = null) {
    const msg = document.createElement('div');
    msg.className = 'hostel-chatbot__msg ' + role;
    msg.textContent = text;
    if (action && role === 'bot') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hostel-chatbot__action';
      button.textContent = action === 'grievance' ? 'Open Grievance Tab' : action === 'notices' ? 'Open Notices Tab' : 'Open Related Tab';
      button.addEventListener('click', () => {
        if (typeof window.switchTab === 'function') {
          window.switchTab(action);
          close();
        }
      });
      msg.appendChild(document.createElement('br'));
      msg.appendChild(button);
    }
    state.messages.appendChild(msg);
    state.messages.scrollTop = state.messages.scrollHeight;
  }

  function setBusy(isBusy) {
    state.sendButton.disabled = isBusy;
    state.input.disabled = isBusy;
  }

  async function submit() {
    const message = state.input.value.trim();
    if (!message) return;
    state.input.value = '';
    addMessage(message, 'user');

    const local = localAnswer(message);
    if (local) {
      addMessage(local.text, 'bot', local.action);
      return;
    }

    if (!isHostelRelated(message)) {
      addMessage('I can help with hostel application, room, documents, notices, fees, reporting, and grievances. Please ask a hostel-related question.', 'bot');
      return;
    }

    const cached = getCachedAnswer(message);
    if (cached) {
      addMessage(cached, 'bot');
      return;
    }

    if (getDailyCount() >= DAILY_LIMIT) {
      addMessage('The smart fallback limit for today has been reached on this browser. You can still use the portal tabs, latest notices, or file a grievance for official help.', 'bot', 'grievance');
      return;
    }

    setBusy(true);
    addMessage('Let me check that carefully...', 'bot');
    try {
      incrementDailyCount();
      const result = await window.HostelAPI.askChatbot(message, safeContext());
      const reply = result.success && result.answer
        ? result.answer
        : (result.error || 'I could not answer that through the smart assistant right now. Please check Notices or file a grievance for official help.');
      setCachedAnswer(message, reply);
      addMessage(reply, 'bot', result.action || null);
    } catch (e) {
      addMessage('The smart assistant is unavailable right now. Deterministic portal answers still work, and the Grievance tab is available for official help.', 'bot', 'grievance');
    } finally {
      setBusy(false);
      state.input.focus();
    }
  }

  function open() {
    state.open = true;
    state.root.classList.add('open');
    setTimeout(() => state.input.focus(), 80);
  }

  function close() {
    state.open = false;
    state.root.classList.remove('open');
  }

  function toggle() {
    state.open ? close() : open();
  }

  async function loadNoticesForChat() {
    try {
      const notices = await window.HostelAPI.getNotices();
      state.notices = Array.isArray(notices) ? notices : [];
    } catch (e) {
      state.notices = [];
    }
  }

  async function init(statusData) {
    ensureWidget();
    state.statusData = statusData;
    state.ready = true;
    state.root.classList.remove('hidden');
    state.messages.innerHTML = '';
    renderChips();
    await loadNoticesForChat();
    addMessage(`Hi ${getStudentName().split(' ')[0] || 'there'}, I can help with your hostel status, room, documents, notices, and grievances.`);
  }

  function reset() {
    if (!state.root) return;
    close();
    state.root.classList.add('hidden');
    state.statusData = null;
    state.notices = [];
    state.messages.innerHTML = '';
  }

  window.HostelChatbot = { init, reset };
})();

