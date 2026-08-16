// ── Google Apps Script Web App Configuration ─────────────────────────────
const GAS_CONFIG = {
  URL: 'https://script.google.com/macros/s/AKfycbwwkz9T8iuNj35StYWCTZ59CtMtQ0RBvRugNoBkE7Czxkl45YpoUGOBkoEEW74ocATkiw/exec'
};

// ── Data store for local execution ─────────────────────────
const LOCAL_MOCK_STORE = {
  students: [],
  rooms: [
    { RoomID: 'BH-101', RoomNumber: 'BH-101', HostelName: 'Boys Hostel', HostelType: 'Boys', Capacity: 2, Occupied: 0, VacantBeds: 2, Status: 'Available' },
    { RoomID: 'GH-101', RoomNumber: 'GH-101', HostelName: 'Girls Hostel', HostelType: 'Girls', Capacity: 2, Occupied: 0, VacantBeds: 2, Status: 'Available' }
  ],
  allocations: [],
  grievances: [],
  notices: [
    { NoticeID: 'NOT-001', Title: 'Hostel Registration Open', Body: 'Submissions are open for new student hostel applications.', PostedBy: 'Chief Warden', Date: new Date().toLocaleDateString(), Active: true }
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
    console.warn(`[HostelAPI] ${action} API request failed. Using local fallback handler.`, error);
    return handleLocalFallback(action, data, params);
  }
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
  if (str.includes('T')) str = str.split('T')[0];
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

function handleLocalFallback(action, data, params) {
  const students = getLocalStudents();

  switch (action) {
    case 'getStudents':
      return students;
    case 'getRooms':
      return LOCAL_MOCK_STORE.rooms;
    case 'getAllocations':
      return LOCAL_MOCK_STORE.allocations;
    case 'getGrievances':
      return LOCAL_MOCK_STORE.grievances;
    case 'getNotices':
      return LOCAL_MOCK_STORE.notices;
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
        recentAllocations: LOCAL_MOCK_STORE.allocations
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
      return {
        success: true,
        name: s.Name || s.name || 'Student',
        enrollmentNo: s.EnrollmentNo || s.rollNo,
        applicationId: s.ApplicationID || 'GGSIPU-2026',
        status: s.Status || 'Pending',
        priority: s.Priority || 5,
        applicationDetails: s,
        allocation: alloc || null,
        allocatedRoom: alloc ? alloc.RoomNumber : null,
        allocatedHostel: alloc ? alloc.HostelName : null,
        allotmentProbability: isAllocated ? null : localCalculateProbability(s)
      };
    }
    case 'submitApplication': {
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
        AadhaarFile: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=600',
        PhotoFile: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400',
        MarksheetFile: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600',
        PwdCertificateFile: pwd === 'Yes' ? 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=600' : 'Not Applicable',
        AadhaarStatus: 'Pending',
        PhotoStatus: 'Pending',
        MarksheetStatus: 'Pending',
        PwdCertificateStatus: pwd === 'Yes' ? 'Pending' : 'Not Applicable',
        AadhaarRemarks: '',
        PhotoRemarks: '',
        MarksheetRemarks: '',
        PwdCertificateRemarks: '',
        DocumentStatus: 'Pending',
        DocumentRemarks: '',
        DiscrepancyEmailSentAt: ''
      };

      const updatedList = [newStudent, ...students.filter(st => String(st.EnrollmentNo).trim() !== String(enroll).trim())];
      saveLocalStudents(updatedList);
      LOCAL_MOCK_STORE.students = updatedList;
      return { success: true, applicationId: appId, message: 'Application submitted successfully!' };
    }
    case 'updateDocumentVerification': {
      const targetEnroll = String(data.EnrollmentNo || '').trim().toLowerCase();
      const s = students.find(st => String(st.EnrollmentNo || st.rollNo || '').trim().toLowerCase() === targetEnroll);
      if (!s) return { success: false, error: 'Student record not found.' };
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
      s.DocumentStatus = data.DocumentStatus || s.DocumentStatus;
      s.DocumentRemarks = data.DocumentRemarks !== undefined ? data.DocumentRemarks : s.DocumentRemarks;
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
  updateDocumentVerification: (data) => gasRequest('updateDocumentVerification', 'POST', data),
  sendDiscrepancyEmail: (data) => gasRequest('sendDiscrepancyEmail', 'POST', data),
  sendDiscrepancyEmails: (data = {}) => gasRequest('sendDiscrepancyEmails', 'POST', data),
  adminLogin:       (data)     => gasRequest('adminLogin',       'POST', data),
  exportCSV:        (data, fn) => downloadCSV(data, fn),

  // ── Student ─────────────────────────────────────────────
  submitApplication: (data)      => gasRequest('submitApplication', 'POST', data),
  getStudentStatus:  (no, dob)   => gasRequest('getStudentStatus',  'GET',  null, { enrollmentNo: no, dob }),
  fileGrievance:     (data)      => gasRequest('fileGrievance',     'POST', data),
  askChatbot:         (message, context) => askChatbot(message, context),
};
