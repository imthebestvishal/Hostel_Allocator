function getSheetData(sheetName, options) {
  options = options || {};
  if (sheetName === 'Students' && !options.skipEnsure) ensureStudentDocumentColumns();
  const sheet = getSheet(sheetName);
  if (!sheet) return [];
  const range = sheet.getDataRange();
  const displayValues = range.getDisplayValues();
  const rawValues = range.getValues();
  if (displayValues.length <= 1) return [];
  
  const headers = displayValues[0];
  let results = [];
  
  for (let r = 1; r < displayValues.length; r++) {
    let rowDisplay = displayValues[r];
    let rowRaw = rawValues[r];
    
    let hasData = rowDisplay.some(cell => String(cell).trim() !== '');
    if (!hasData) continue;
    let obj = {};
    headers.forEach((header, c) => {
      if (header) {
        let val = rowDisplay[c];
        if (typeof rowRaw[c] === 'number') {
          val = rowRaw[c];
        } else if (typeof rowRaw[c] === 'boolean') {
          val = rowRaw[c];
        }
        obj[header] = val;
      }
    });
    results.push(obj);
  }
  return results;
}

const STUDENT_DOCUMENT_COLUMNS = [
  'AadhaarFile',
  'PhotoFile',
  'MarksheetFile',
  'PwdCertificateFile',
  'AadhaarStatus',
  'PhotoStatus',
  'MarksheetStatus',
  'PwdCertificateStatus',
  'AadhaarRemarks',
  'PhotoRemarks',
  'MarksheetRemarks',
  'PwdCertificateRemarks',
  'DocumentStatus',
  'DocumentRemarks',
  'DiscrepancyEmailSentAt'
];

function ensureStudentDocumentColumns() {
  const sheet = getSheet('Students');
  if (!sheet) return {};
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  let changed = false;

  STUDENT_DOCUMENT_COLUMNS.forEach(header => {
    if (!headers.includes(header)) {
      headers.push(header);
      changed = true;
    }
  });

  if (changed) {
    const maxColumns = sheet.getMaxColumns();
    const diff = headers.length - maxColumns;
    if (diff > 0) {
      sheet.insertColumnsAfter(maxColumns, diff);
    }
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (typeof formatHeaderRow === 'function') formatHeaderRow(sheet);
  }

  const map = {};
  headers.forEach((header, index) => {
    if (header) map[header] = index + 1;
  });
  return map;
}

function calculatePriority(data) {
  if (data.PWD === 'Yes') return 1;
  if (data.Category === 'Outside Delhi') return 2;
  if (data.Category === 'Delhi' && data.ParentsTransferred === 'Yes') return 3;
  if (data.Category === 'Delhi') return 4;
  return 5;
}

function normalizeDateStr(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || "GMT", "yyyy-MM-dd");
  }
  let str = String(val).trim();
  if (str.includes('T')) str = str.split('T')[0];
  
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
    let p = str.split('-');
    return `${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}`;
  }
  if (str.includes('/')) {
    let p = str.split('/');
    if (p[2] && p[2].length === 4) {
      let year = p[2];
      let month = p[1].padStart(2, '0');
      let day = p[0].padStart(2, '0');
      if (parseInt(p[0], 10) <= 12 && parseInt(p[1], 10) > 12) {
        month = p[0].padStart(2, '0');
        day = p[1].padStart(2, '0');
      }
      return `${year}-${month}-${day}`;
    }
  }
  return str;
}

function uploadStudentDocument(fileData, applicationId, label) {
  if (!fileData) return '';
  if (typeof fileData === 'string') return fileData;

  const base64 = fileData.data || fileData.base64 || '';
  if (!base64) return '';

  const mimeType = fileData.type || fileData.mimeType || 'application/octet-stream';
  const originalName = fileData.name || `${label || 'Document'}.bin`;
  const safeAppId = String(applicationId || 'APPLICATION').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeLabel = String(label || 'Document').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${safeAppId}_${safeLabel}_${originalName}`.replace(/[\\/:*?"<>|]/g, '_');

  const decoded = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(decoded, mimeType, fileName);
  const folderName = 'GGSIPU Hostel Application Documents';
  const folders = DriveApp.getFoldersByName(folderName);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function submitApplication(data) {
  const sheet = getSheet('Students');
  const columnMap = ensureStudentDocumentColumns();
  const applicationId = 'GGSIPU-' + new Date().getFullYear() + '-' + Utilities.getUuid().substring(0, 5).toUpperCase();
  
  const enroll = data.EnrollmentNo || data.rollNo || '';
  const name = data.Name || data.name || '';
  const dob = normalizeDateStr(data.DOB || data.dob || '');
  const gender = data.Gender || data.gender || '';
  const email = data.Email || data.email || '';
  const phone = data.Phone || data.phone || data.mobile || '';
  const aadhaar = data.Aadhaar || data.aadhaar || '';
  const programme = data.Programme || data.programme || '';
  const branch = data.Branch || data.branch || '';
  const year = data.Year || data.year || '';
  const twelfthMarks = data.TwelfthMarks || data.marks12 || 0;
  const category = data.Category || data.domicile || '';
  const state = data.State || data.state || '';
  const parentsTransferred = data.ParentsTransferred || data.govtEmp || 'No';
  const distanceKm = data.DistanceKm || data.distance || 0;
  const pwd = data.PWD || data.pwd || 'No';
  const hostelPref = data.HostelPref || data.hostelPref || '';
  const roommatePref = data.RoommatePreference || data.roommatePref || '';
  const hobbies =
    data.Hobbies ||
    data.hobbies ||
    '';
  const normalizedData = { PWD: pwd, Category: category, ParentsTransferred: parentsTransferred };
  const priority = calculatePriority(normalizedData);
  const timestamp = new Date();
  const documents = data.documents || {};
  const aadhaarFile = uploadStudentDocument(data.AadhaarFile || data.aadhaarFile || documents.aadhaar, applicationId, 'Aadhaar');
  const photoFile = uploadStudentDocument(data.PhotoFile || data.photoFile || documents.photo, applicationId, 'Photo');
  const marksheetFile = uploadStudentDocument(data.MarksheetFile || data.marksheetFile || documents.marksheet, applicationId, 'Marksheet');
  const pwdCertificateFile = pwd === 'Yes'
    ? uploadStudentDocument(data.PwdCertificateFile || data.pwdCertificateFile || documents.pwdCertificate, applicationId, 'PwdCertificate')
    : 'Not Applicable';

  const row = [
    applicationId, enroll, name, gender, dob, email, phone, aadhaar,
    programme, branch, year, twelfthMarks, category, state, parentsTransferred,
    distanceKm, pwd, hostelPref, roommatePref, 'Pending', priority, timestamp,hobbies
  ];

  const docDefaults = {
    AadhaarFile: aadhaarFile,
    PhotoFile: photoFile,
    MarksheetFile: marksheetFile,
    PwdCertificateFile: pwdCertificateFile,
    AadhaarStatus: aadhaarFile ? 'Pending' : 'Missing',
    PhotoStatus: photoFile ? 'Pending' : 'Missing',
    MarksheetStatus: marksheetFile ? 'Pending' : 'Missing',
    PwdCertificateStatus: pwd === 'Yes' ? (pwdCertificateFile ? 'Pending' : 'Missing') : 'Not Applicable',
    AadhaarRemarks: '',
    PhotoRemarks: '',
    MarksheetRemarks: '',
    PwdCertificateRemarks: '',
    DocumentStatus: 'Pending',
    DocumentRemarks: '',
    DiscrepancyEmailSentAt: ''
  };

  Object.keys(docDefaults).forEach(key => {
    const col = columnMap[key];
    if (col) row[col - 1] = docDefaults[key];
  });

  sheet.appendRow(row);
  
  try {
    sendApplicationConfirmation({ Name: name, Email: email, EnrollmentNo: enroll }, applicationId);
  } catch(e) {
    Logger.log('Confirmation email error: ' + e);
  }
  return { success: true, applicationId: applicationId };
}

function getAllStudents() {
  return getSheetData('Students');
}

function getStudentStatus(enrollmentNo, dob) {
  const students = getAllStudents();
  const targetEnroll = String(enrollmentNo || '').trim().toLowerCase();
  const targetDob = normalizeDateStr(dob);
  
  const student = students.find(s => {
    const sEnroll = String(s.EnrollmentNo || s.rollNo || '').trim().toLowerCase();
    return sEnroll === targetEnroll;
  });
  
  if (!student) {
    return { error: `Student with Enrollment No "${enrollmentNo}" not found. Please submit your application first.` };
  }
  
  const sDob = normalizeDateStr(student.DOB || student.dob);
  if (targetDob && sDob && targetDob !== sDob) {
    return { error: 'Incorrect Date of Birth entered for this Enrollment No. Please check your DOB.' };
  }
  
  const studentName = student.Name || student.name || 'Student';
  
  let result = { 
    success: true,
    name: studentName,
    enrollmentNo: student.EnrollmentNo,
    applicationId: student.ApplicationID,
    status: student.Status || 'Pending',
    priority: student.Priority,
    applicationDetails: student
  };
  
  if (student.Status === 'Allocated') {
    const allocations = getAllAllocations();
    const alloc = allocations.find(a => String(a.EnrollmentNo).trim().toLowerCase() === targetEnroll);
    if (alloc) {
      result.allocation = alloc;
      result.allocatedRoom = alloc.RoomNumber;
      result.allocatedHostel = alloc.HostelName;
    }
  } else if (student.Status === 'Waitlisted') {
    const waitlist = getSheetData('WaitingList');
    const entry = waitlist.find(w => String(w.EnrollmentNo).trim().toLowerCase() === targetEnroll);
    if (entry) result.waitlistPosition = entry.Position;
  }
  
  if (String(student.Status || '').toLowerCase() !== 'allocated') {
    result.allotmentProbability = calculateAllotmentProbability(student);
  }
  
  return result;
}

function calculateAllotmentProbability(student) {
  const status = String(getStudentValue(student, 'Status')).toLowerCase();
  if (status === 'allocated') return null;

  const gender = String(getStudentValue(student, 'Gender')).toLowerCase();
  const targetEnroll = String(getStudentValue(student, 'EnrollmentNo')).trim();

  const sameGenderApplicants = getAllStudents().filter(s => {
    const sStatus = String(getStudentValue(s, 'Status')).toLowerCase();
    if (sStatus === 'allocated') return false;
    const sGender = String(getStudentValue(s, 'Gender')).toLowerCase();
    if (gender.includes('female') || gender.includes('girl') || gender === 'f') {
      return sGender.includes('female') || sGender.includes('girl') || sGender === 'f';
    }
    return sGender.includes('male') || sGender.includes('boy') || sGender === 'm';
  });

  sameGenderApplicants.sort((a, b) => {
    const aPriority = parseInt(getStudentValue(a, 'Priority'), 10) || 5;
    const bPriority = parseInt(getStudentValue(b, 'Priority'), 10) || 5;
    if (aPriority !== bPriority) return aPriority - bPriority;
    if (aPriority === 2 || aPriority === 3) return (parseFloat(getStudentValue(b, 'TwelfthMarks')) || 0) - (parseFloat(getStudentValue(a, 'TwelfthMarks')) || 0);
    if (aPriority === 4) return (parseFloat(getStudentValue(b, 'DistanceKm')) || 0) - (parseFloat(getStudentValue(a, 'DistanceKm')) || 0);
    return new Date(getStudentValue(a, 'Timestamp')) - new Date(getStudentValue(b, 'Timestamp'));
  });

  const rank = sameGenderApplicants.findIndex(s => String(getStudentValue(s, 'EnrollmentNo')).trim() === targetEnroll) + 1;
  const effectiveRank = rank || sameGenderApplicants.length + 1;
  const priority = parseInt(getStudentValue(student, 'Priority'), 10) || 5;
  const marks = parseFloat(getStudentValue(student, 'TwelfthMarks')) || 75;
  const dist = parseFloat(getStudentValue(student, 'DistanceKm')) || 20;

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

  const rankDeduction = (effectiveRank - 1) * 3;
  let percent = Math.round(Math.max(10, Math.min(98, base - rankDeduction)));

  return {
    percent,
    seatsLeft: 0,
    queueRank: effectiveRank,
    priority,
    basis: `Priority ${priority}, queue rank #${effectiveRank}`
  };
}

function getAllRooms() {
  return getSheetData('Rooms');
}

function updateRoomStatus(data) {
  const sheet = getSheet('Rooms');
  const rooms = sheet.getDataRange().getValues();
  for (let i = 1; i < rooms.length; i++) {
    if (rooms[i][0] === data.RoomID) {
      sheet.getRange(i + 1, 8).setValue(data.VacantBeds); // Assuming VacantBeds is col 8
      sheet.getRange(i + 1, 9).setValue(data.Status);     // Assuming Status is col 9
      return { success: true };
    }
  }
  return { error: 'Room not found' };
}

function getRoomSummary() {
  const rooms = getAllRooms();
  return getRoomSummaryFromRooms(rooms);
}

function getRoomSummaryFromRooms(rooms) {
  let summary = {
    boys: { total: 0, occupied: 0, vacant: 0 },
    girls: { total: 0, occupied: 0, vacant: 0 }
  };
  
  rooms.forEach(r => {
    const typeRaw = String(getStudentValue(r, 'HostelType') || getStudentValue(r, 'HostelName') || '').toLowerCase();
    const type = typeRaw.includes('girl') ? 'girls' : 'boys';
    if (summary[type]) {
      summary[type].total += Number(getStudentValue(r, 'Capacity')) || 0;
      summary[type].occupied += Number(getStudentValue(r, 'Occupied')) || 0;
      summary[type].vacant += Number(getStudentValue(r, 'VacantBeds')) || 0;
    }
  });
  return summary;
}

function getAllAllocations() {
  return getSheetData('Allocations');
}

function saveAllocation(a) {
  const sheet = getSheet('Allocations');
  sheet.appendRow([
    a.AllocationID, a.Timestamp, a.ApplicationID, a.EnrollmentNo, a.StudentName, a.Gender,
    a.RoomID, a.RoomNumber, a.HostelName, a.Floor, a.BedNumber, a.Status, a.LetterSent, a.LetterSentAt
  ]);
  
  // Update student status
  const studentSheet = getSheet('Students');
  const students = studentSheet.getDataRange().getValues();
  for (let i = 1; i < students.length; i++) {
    if (students[i][1] == a.EnrollmentNo) {
      studentSheet.getRange(i + 1, 20).setValue('Allocated'); // col 20 is Status
      break;
    }
  }
}

function ensureNoticeColumns() {
  const sheet = getSheet('Notices');
  if (!sheet) return {};
  const requiredHeaders = ['NoticeID', 'Title', 'Body', 'PostedBy', 'PostedAt', 'Active', 'Audience'];
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  let changed = false;

  requiredHeaders.forEach(header => {
    if (!headers.includes(header)) {
      headers.push(header);
      changed = true;
    }
  });

  if (changed) {
    const maxColumns = sheet.getMaxColumns();
    const diff = headers.length - maxColumns;
    if (diff > 0) sheet.insertColumnsAfter(maxColumns, diff);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (typeof formatHeaderRow === 'function') formatHeaderRow(sheet);
  }

  const map = {};
  headers.forEach((header, index) => {
    if (header) map[header] = index + 1;
  });
  return map;
}

function normalizeNoticeAudience(value) {
  const audience = String(value || '').trim().toLowerCase();
  if (['homepage', 'home page', 'home', 'latest', 'latest updates', 'updates'].indexOf(audience) !== -1) return 'Homepage';
  if (audience === 'both' || audience === 'all') return 'Both';
  return 'Student';
}

function getNotices() {
  ensureNoticeColumns();
  return getSheetData('Notices').filter(n => n.Active === true || n.Active === 'TRUE').reverse();
}

function postNotice(data) {
  const sheet = getSheet('Notices');
  const columnMap = ensureNoticeColumns();
  const noticeId = 'NOT-' + Utilities.getUuid().substring(0, 5).toUpperCase();
  const title = data.Title || data.title || '';
  const body = data.Body || data.content || data.body || '';
  const postedBy = data.PostedBy || data.postedBy || 'Hostel Administration';
  const audience = normalizeNoticeAudience(data.Audience || data.audience || data.Destination || data.destination);
  const row = [];
  row[columnMap.NoticeID - 1] = noticeId;
  row[columnMap.Title - 1] = title;
  row[columnMap.Body - 1] = body;
  row[columnMap.PostedBy - 1] = postedBy;
  row[columnMap.PostedAt - 1] = new Date();
  row[columnMap.Active - 1] = true;
  row[columnMap.Audience - 1] = audience;
  sheet.appendRow(row);
  return { success: true, noticeId: noticeId };
}

function fileGrievance(data) {
  const sheet = getSheet('Grievances');
  const ticketId = 'GRV-' + Utilities.getUuid().substring(0, 5).toUpperCase();
  sheet.appendRow([
    ticketId,
    data.ApplicationID || data.applicationId || '',
    data.StudentName || data.studentName || '',
    data.StudentEmail || data.studentEmail || '',
    new Date(),
    data.Category || data.category || '',
    data.Subject || data.subject || '',
    data.Description || data.description || '',
    data.AttachmentURL || data.attachmentUrl || '',
    'Open',
    '',
    ''
  ]);
  sendGrievanceAcknowledgement({ ...data, TicketID: ticketId });
  return { success: true, ticketId: ticketId };
}

function getAllGrievances() {
  return getSheetData('Grievances');
}

function resolveGrievance(data) {
  const sheet = getSheet('Grievances');
  const grievances = sheet.getDataRange().getValues();
  const ticketId = data.TicketID || data.ticketId || data.id || '';
  for (let i = 1; i < grievances.length; i++) {
    if (grievances[i][0] === ticketId) {
      sheet.getRange(i + 1, 10).setValue('Resolved');
      sheet.getRange(i + 1, 11).setValue(data.AdminResponse || data.adminResponse || 'Resolved by hostel administration.');
      sheet.getRange(i + 1, 12).setValue(new Date());
      return { success: true };
    }
  }
  return { error: 'Grievance not found' };
}

function updateDocumentVerification(data) {
  const sheet = getSheet('Students');
  const columnMap = ensureStudentDocumentColumns();
  const rows = sheet.getDataRange().getValues();
  const targetEnroll = String(data.EnrollmentNo || data.enrollmentNo || '').trim();
  const targetAppId = String(data.ApplicationID || data.applicationId || '').trim();

  for (let i = 1; i < rows.length; i++) {
    const rowEnroll = String(rows[i][1] || '').trim();
    const rowAppId = String(rows[i][0] || '').trim();
    if ((targetEnroll && rowEnroll === targetEnroll) || (targetAppId && rowAppId === targetAppId)) {
      const documents = data.documents || {};
      const remarks = data.remarksByDocument || {};
      const statusMap = {
        AadhaarStatus: documents.aadhaar || data.AadhaarStatus,
        PhotoStatus: documents.photo || data.PhotoStatus,
        MarksheetStatus: documents.marksheet || data.MarksheetStatus,
        PwdCertificateStatus: documents.pwdCertificate || data.PwdCertificateStatus,
        AadhaarRemarks: remarks.aadhaar || data.AadhaarRemarks || '',
        PhotoRemarks: remarks.photo || data.PhotoRemarks || '',
        MarksheetRemarks: remarks.marksheet || data.MarksheetRemarks || '',
        PwdCertificateRemarks: remarks.pwdCertificate || data.PwdCertificateRemarks || '',
        DocumentStatus: data.DocumentStatus || data.documentStatus,
        DocumentRemarks: data.DocumentRemarks || data.remarks || ''
      };

      Object.keys(statusMap).forEach(key => {
        if (columnMap[key] && statusMap[key] !== undefined) {
          sheet.getRange(i + 1, columnMap[key]).setValue(statusMap[key]);
        }
      });

      return { success: true, message: 'Document verification updated.' };
    }
  }

  return { success: false, error: 'Student not found.' };
}

function getDashboardData() {
  const students = getAllStudents();
  const rooms = getAllRooms();
  const allocations = getAllAllocations();
  return buildDashboardData(students, rooms, allocations);
}

function buildDashboardData(students, rooms, allocations) {
  const totalApplied = students.length;
  
  const allocated = students.filter(s => {
    const st = String(getStudentValue(s, 'Status')).toLowerCase();
    return st === 'allocated';
  }).length;
  
  const waitlisted = students.filter(s => {
    const st = String(getStudentValue(s, 'Status')).toLowerCase();
    return st === 'waitlisted';
  }).length;
  
  const pending = students.filter(s => {
    const st = String(getStudentValue(s, 'Status')).toLowerCase();
    return st === 'pending' || st === '' || st === 'undefined';
  }).length;

  const allocatedBoys = students.filter(s => {
    const st = String(getStudentValue(s, 'Status')).toLowerCase();
    const g = String(getStudentValue(s, 'Gender')).toLowerCase();
    return st === 'allocated' && ((g.includes('male') && !g.includes('female')) || g.includes('boy') || g === 'm');
  }).length;

  const allocatedGirls = students.filter(s => {
    const st = String(getStudentValue(s, 'Status')).toLowerCase();
    const g = String(getStudentValue(s, 'Gender')).toLowerCase();
    return st === 'allocated' && (g.includes('female') || g.includes('girl') || g === 'f');
  }).length;

  const roomSummary = getRoomSummaryFromRooms(rooms || []);
  
  let priorityBreakdown = [0, 0, 0, 0, 0];
  students.forEach(s => {
    const p = parseInt(getStudentValue(s, 'Priority'), 10);
    if (p >= 1 && p <= 5) priorityBreakdown[p - 1]++;
  });
  
  const recentAllocations = (allocations || []).slice(-5).reverse();
  
  return {
    totalApplied, allocated, waitlisted, pending,
    allocatedBoys, allocatedGirls,
    boyStats: roomSummary.boys,
    girlStats: roomSummary.girls,
    priorityBreakdown,
    recentAllocations
  };
}

function getAdminSnapshot() {
  const students = getSheetData('Students', { skipEnsure: true });
  const rooms = getSheetData('Rooms');
  const allocations = getSheetData('Allocations');
  const grievances = getSheetData('Grievances');
  const notices = getSheetData('Notices').filter(n => n.Active === true || n.Active === 'TRUE').reverse();
  const settings = getSettingsPublic();
  return {
    success: true,
    fetchedAt: new Date().toISOString(),
    dashboard: buildDashboardData(students, rooms, allocations),
    students,
    rooms,
    allocations,
    grievances,
    notices,
    settings
  };
}

function adminLogin(data) {
  const settings = getSheetData('Settings');
  const pwSetting = settings.find(s => s.Key === 'ADMIN_PASSWORD');
  if (pwSetting && pwSetting.Value === data.password) {
    return { success: true };
  }
  return { success: false };
}

function getSettingsMap() {
  const settings = getSheetData('Settings');
  const map = {};
  settings.forEach(row => {
    if (row.Key) map[row.Key] = row.Value;
  });
  return map;
}

function getSettingsPublic() {
  const settings = getSettingsMap();
  return {
    registrationOpen: String(settings.REGISTRATION_OPEN || 'true').toLowerCase() !== 'false',
    registrationCloseDate: settings.REGISTRATION_CLOSE_DATE || '',
    hostelOfficeContact: settings.HOSTEL_OFFICE_CONTACT || 'Contact the Warden Office for official hostel support.',
    messFeeNote: settings.MESS_FEE_NOTE || 'Mess and hostel fee details will be announced through official notices.'
  };
}

function updateSetting(data) {
  const allowed = ['REGISTRATION_OPEN', 'REGISTRATION_CLOSE_DATE', 'HOSTEL_OFFICE_CONTACT', 'MESS_FEE_NOTE', 'ALLOCATION_METHOD'];
  const key = data.Key || data.key || '';
  const value = data.Value !== undefined ? data.Value : data.value;
  if (!allowed.includes(key)) return { success: false, error: 'Setting cannot be updated from admin panel.' };

  const sheet = getSheet('Settings');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return { success: true };
    }
  }
  sheet.appendRow([key, value, 'Admin configurable setting']);
  return { success: true };
}
