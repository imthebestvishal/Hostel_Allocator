function getSheetData(sheetName) {
  const sheet = getSheet(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  
  const headers = values[0].map(String);
  let results = [];
  
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    let hasData = row.some(cell => String(cell).trim() !== '');
    if (!hasData) continue;
    let obj = {};
    headers.forEach((header, c) => {
      if (header) {
        const value = row[c];
        obj[header] = value instanceof Date ? value.toISOString() : value;
      }
    });
    results.push(obj);
  }
  return results;
}

const STUDENT_DOCUMENT_COLUMNS = [
  'Hobbies',
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
  'DiscrepancyEmailSentAt',
  'DocumentPolicyVersion',
  'MarksheetFileId',
  'MarksheetMimeType',
  'MarksheetFileSize',
  'MarksheetChecksum',
  'MarksheetBrowserChecksum',
  'MarksheetScreeningAttempts',
  'MarksheetVerificationCheckedAt',
  'MarksheetVerificationProvider',
  'MarksheetVerificationModel',
  'MarksheetVerificationConfidence',
  'MarksheetVerificationReasons',
  'MarksheetVerificationExplanationCodes',
  'MarksheetVerificationSummary',
  'MarksheetExtractedData',
  'MarksheetVerificationLastError',
  'OfflineVerificationEmailSentAt',
  'MarksheetRetrievedChecksum',
  'MarksheetMetadataSummary',
  'MarksheetMetadataFindings',
  'MarksheetAiProvenanceStatus',
  'MarksheetAiProvider',
  'MarksheetC2paStatus',
  'MarksheetC2paProvider',
  'MarksheetC2paIssuer',
  'MarksheetC2paSigner',
  'MarksheetC2paSigningTime',
  'MarksheetC2paVerifierVersion',
  'MarksheetC2paAiSourceType',
  'MarksheetC2paValidationErrors',
  'MarksheetApprovalSource',
  'MarksheetDigitalSignatureStatus',
  'MarksheetSynthIdStatus',
  'MarksheetSynthIdProvider',
  'MarksheetSynthIdDetectorVersion',
  'DocumentManualReviewer',
  'DocumentManualReviewedAt',
  'DocumentManualEvidenceSource',
  'DocumentPreviousStatus',
  'DocumentAuditLog'
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
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function uploadRequiredMarksheet(fileData, applicationId) {
  const validated = validateMarksheetFilePayload(fileData);
  const safeAppId = String(applicationId || 'APPLICATION').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeOriginalName = validated.originalName.replace(/[\\/:*?"<>|]/g, '_');
  const fileName = `${safeAppId}_Marksheet_${safeOriginalName}`;
  const checksum = bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, validated.bytes));
  const browserChecksum = String(fileData.browserChecksum || '').toLowerCase();
  if (browserChecksum && browserChecksum !== checksum) throw new Error('The file changed while it was being prepared for upload.');
  const blob = Utilities.newBlob(validated.bytes, validated.mimeType, fileName);
  const folderName = 'GGSIPU Hostel Application Documents';
  const folders = DriveApp.getFoldersByName(folderName);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  return {
    url: file.getUrl(),
    fileId: file.getId(),
    mimeType: validated.mimeType,
    size: validated.size,
    checksum: checksum,
    browserChecksum: browserChecksum
  };
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
  const marksheet = uploadRequiredMarksheet(data.MarksheetFile || data.marksheetFile || documents.marksheet, applicationId);

  const rowValues = {
    ApplicationID: applicationId,
    EnrollmentNo: enroll,
    Name: name,
    Gender: gender,
    DOB: dob,
    Email: email,
    Phone: phone,
    Aadhaar: aadhaar,
    Programme: programme,
    Branch: branch,
    Year: year,
    TwelfthMarks: twelfthMarks,
    Category: category,
    State: state,
    ParentsTransferred: parentsTransferred,
    DistanceKm: distanceKm,
    PWD: pwd,
    HostelPref: hostelPref,
    RoommatePreference: roommatePref,
    Status: 'Pending',
    Priority: priority,
    Timestamp: timestamp,
    Hobbies: hobbies,
    AadhaarFile: 'Not Applicable',
    PhotoFile: 'Not Applicable',
    MarksheetFile: marksheet.url,
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
    DocumentPolicyVersion: MARKSHEET_POLICY_VERSION,
    MarksheetFileId: marksheet.fileId,
    MarksheetMimeType: marksheet.mimeType,
    MarksheetFileSize: marksheet.size,
    MarksheetChecksum: marksheet.checksum,
    MarksheetBrowserChecksum: marksheet.browserChecksum,
    MarksheetScreeningAttempts: 0,
    OfflineVerificationEmailSentAt: ''
  };

  const row = new Array(sheet.getLastColumn()).fill('');
  Object.keys(rowValues).forEach(key => {
    const col = columnMap[key];
    if (col) row[col - 1] = rowValues[key];
  });

  sheet.appendRow(row);
  
  try {
    sendApplicationConfirmation({ Name: name, Email: email, EnrollmentNo: enroll }, applicationId);
  } catch(e) {
    Logger.log('Confirmation email error: ' + e);
  }
  return { success: true, applicationId: applicationId, documentStatus: 'Screening Pending' };
}

function getAllStudents() {
  return getSheetData('Students');
}

const ADMIN_CACHE_SECONDS = 15;
const PUBLIC_CACHE_SECONDS = 60;

function getPortalCache() {
  return typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null;
}

function getPortalCacheVersion(domain) {
  const cache = getPortalCache();
  if (!cache) return '0';
  try { return cache.get(`portal-version:${domain}`) || '0'; } catch (error) { return '0'; }
}

function invalidatePortalCaches(domains) {
  const cache = getPortalCache();
  if (!cache) return;
  const targets = Array.isArray(domains) && domains.length ? domains : ['dashboard', 'students', 'allocations', 'rooms', 'grievances', 'notices', 'settings'];
  targets.forEach(domain => { try { cache.put(`portal-version:${domain}`, String(Date.now()), 21600); } catch (error) {} });
}

function readPortalCache(domain, key, seconds, force, producer) {
  const cache = getPortalCache();
  const cacheKey = `portal:${domain}:${getPortalCacheVersion(domain)}:${key}`;
  if (cache && String(force || '').toLowerCase() !== 'true') {
    let cached = null;
    try { cached = cache.get(cacheKey); } catch (error) {}
    if (cached) {
      try { return JSON.parse(cached); } catch (error) {}
    }
  }
  const value = producer();
  if (cache) {
    const serialized = JSON.stringify(value);
    if (serialized.length < 90000) {
      try { cache.put(cacheKey, serialized, seconds); } catch (error) {}
    }
  }
  return value;
}

function clampAdminPage(value) {
  return Math.max(1, parseInt(value, 10) || 1);
}

function clampAdminPageSize(value) {
  return Math.max(1, Math.min(100, parseInt(value, 10) || 50));
}

function createPageResult(items, page, pageSize, total) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { items, page, pageSize, total, totalPages, generatedAt: new Date().toISOString() };
}

function projectRecord(record, fields) {
  const projected = {};
  fields.forEach(field => { if (record[field] !== undefined) projected[field] = record[field]; });
  return projected;
}

const ADMIN_STUDENT_LIST_FIELDS = [
  'ApplicationID', 'EnrollmentNo', 'Name', 'Gender', 'Programme', 'Branch', 'TwelfthMarks', 'Category',
  'DistanceKm', 'PWD', 'Status', 'Priority', 'Timestamp', 'DocumentStatus', 'DocumentPolicyVersion',
  'OfflineVerificationEmailSentAt', 'DiscrepancyEmailSentAt'
];

function getAdminStudentsPage(params) {
  const input = params || {};
  const page = clampAdminPage(input.page);
  const pageSize = clampAdminPageSize(input.pageSize);
  const query = String(input.query || '').trim().toLowerCase();
  const documentStatus = String(input.documentStatus || '').trim().toLowerCase();
  const key = [page, pageSize, query, documentStatus].map(encodeURIComponent).join(':');
  return readPortalCache('students', key, ADMIN_CACHE_SECONDS, input.force, function() {
    const filtered = getAllStudents().filter(student => {
      const name = String(student.Name || '').toLowerCase();
      const enrollment = String(student.EnrollmentNo || '').toLowerCase();
      const status = String(student.DocumentStatus || 'Pending').toLowerCase();
      return (!query || name.includes(query) || enrollment.includes(query)) && (!documentStatus || status === documentStatus);
    });
    const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
    const start = (safePage - 1) * pageSize;
    return createPageResult(filtered.slice(start, start + pageSize).map(student => projectRecord(student, ADMIN_STUDENT_LIST_FIELDS)), safePage, pageSize, filtered.length);
  });
}

function getAdminStudentDetail(params) {
  const input = params || {};
  const applicationId = String(input.applicationId || '').trim().toLowerCase();
  const enrollmentNo = String(input.enrollmentNo || '').trim().toLowerCase();
  const lookup = applicationId || enrollmentNo;
  if (!lookup) return { error: 'Application ID or enrollment number is required.' };
  return readPortalCache('students', `detail:${applicationId ? 'application' : 'enrollment'}:${encodeURIComponent(lookup)}`, ADMIN_CACHE_SECONDS, input.force, function() {
    const sheet = getSheet('Students');
    if (!sheet || sheet.getLastRow() <= 1) return { error: 'Student not found.' };
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    const lookupHeader = applicationId ? 'ApplicationID' : 'EnrollmentNo';
    const lookupColumn = headers.indexOf(lookupHeader) + 1;
    if (!lookupColumn) return { error: 'Student lookup column is unavailable.' };
    const lookupValues = sheet.getRange(2, lookupColumn, sheet.getLastRow() - 1, 1).getValues();
    const matchIndex = lookupValues.findIndex(row => String(row[0] || '').trim().toLowerCase() === lookup);
    if (matchIndex === -1) return { error: 'Student not found.' };
    const row = sheet.getRange(matchIndex + 2, 1, 1, headers.length).getValues()[0];
    const student = {};
    headers.forEach((header, index) => { if (header) student[header] = row[index] instanceof Date ? row[index].toISOString() : row[index]; });
    return student;
  });
}

function getAdminAllocationsPage(params) {
  const input = params || {};
  const page = clampAdminPage(input.page);
  const pageSize = clampAdminPageSize(input.pageSize);
  const gender = String(input.gender || '').trim().toLowerCase();
  const status = String(input.status || '').trim().toLowerCase();
  const priority = String(input.priority || '').trim();
  const key = [page, pageSize, gender, status, priority].map(encodeURIComponent).join(':');
  return readPortalCache('allocations', key, ADMIN_CACHE_SECONDS, input.force, function() {
    const students = getAllStudents();
    const studentByEnrollment = {};
    students.forEach(student => { studentByEnrollment[String(student.EnrollmentNo || '').trim().toLowerCase()] = student; });
    const filtered = getAllAllocations().filter(allocation => {
      const allocationGender = String(allocation.Gender || '').toLowerCase();
      const allocationStatus = String(allocation.Status || '').toLowerCase();
      const enrollment = String(allocation.EnrollmentNo || '').trim().toLowerCase();
      return (!gender || allocationGender.includes(gender)) && (!status || allocationStatus.includes(status)) && (!priority || String(studentByEnrollment[enrollment] && studentByEnrollment[enrollment].Priority || '') === priority);
    }).map(allocation => {
      const student = studentByEnrollment[String(allocation.EnrollmentNo || '').trim().toLowerCase()] || {};
      return Object.assign({}, allocation, projectRecord(student, ['Category', 'Priority', 'Programme', 'Branch', 'DistanceKm', 'TwelfthMarks', 'Email', 'Phone']));
    }).reverse();
    const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
    const start = (safePage - 1) * pageSize;
    return createPageResult(filtered.slice(start, start + pageSize), safePage, pageSize, filtered.length);
  });
}

function getAdminRoomsOverview(params) {
  const input = params || {};
  return readPortalCache('rooms', 'overview', ADMIN_CACHE_SECONDS, input.force, function() {
    const occupancy = {};
    getAllAllocations().forEach(allocation => {
      const status = String(allocation.Status || 'Active').toLowerCase();
      if (status && ['active', 'allocated', 'confirmed'].indexOf(status) === -1) return;
      [allocation.RoomID, allocation.RoomNumber].forEach(value => {
        const key = String(value || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[–—]/g, '-');
        if (key) occupancy[key] = (occupancy[key] || 0) + 1;
      });
    });
    return { rooms: getAllRooms(), occupancy, generatedAt: new Date().toISOString() };
  });
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
  const applicationDetails = Object.assign({}, student);
  ['MarksheetChecksum', 'MarksheetBrowserChecksum', 'MarksheetRetrievedChecksum', 'MarksheetMetadataSummary', 'MarksheetMetadataFindings', 'MarksheetAiProvenanceStatus', 'MarksheetAiProvider', 'MarksheetC2paStatus', 'MarksheetC2paProvider', 'MarksheetC2paIssuer', 'MarksheetC2paSigner', 'MarksheetC2paSigningTime', 'MarksheetC2paVerifierVersion', 'MarksheetApprovalSource', 'MarksheetSynthIdProvider', 'MarksheetSynthIdDetectorVersion', 'MarksheetVerificationReasons', 'MarksheetVerificationExplanationCodes', 'MarksheetVerificationSummary', 'MarksheetVerificationLastError', 'DocumentAuditLog'].forEach(key => { delete applicationDetails[key]; });

  let verificationSummary = [];
  try { verificationSummary = JSON.parse(String(student.MarksheetVerificationSummary || '[]')); } catch (error) { verificationSummary = []; }
  if (!Array.isArray(verificationSummary)) verificationSummary = [];
  
  let result = { 
    success: true,
    name: studentName,
    enrollmentNo: student.EnrollmentNo,
    applicationId: student.ApplicationID,
    status: student.Status || 'Pending',
    priority: student.Priority,
    applicationDetails: applicationDetails,
    documentVerification: {
      status: student.DocumentStatus || 'Screening Pending',
      checkedAt: student.MarksheetVerificationCheckedAt || '',
      remarks: student.DocumentRemarks || '',
      aiCheckStatus: student.MarksheetAiProvenanceStatus || (student.DocumentStatus === 'Screening Pending' ? 'Pending' : ''),
      approvalSource: student.MarksheetApprovalSource || '',
      explanation: verificationSummary.map(String).slice(0, 8),
      instructions: String(student.DocumentStatus || '').toLowerCase() === 'offline verification required'
        ? 'Please bring the original 12th marksheet to the hostel office for offline verification.'
        : String(student.DocumentStatus || '').toLowerCase().includes('manual approval required')
          ? 'The Google/OpenAI AI-provenance check is complete. An administrator must review the marksheet before allocation.'
          : ''
    }
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
    result.allotmentProbability = calculateAllotmentProbability(student, students);
  }
  
  return result;
}

function calculateAllotmentProbability(student, loadedStudents) {
  const status = String(getStudentValue(student, 'Status')).toLowerCase();
  if (status === 'allocated') return null;

  const gender = String(getStudentValue(student, 'Gender')).toLowerCase();
  const targetEnroll = String(getStudentValue(student, 'EnrollmentNo')).trim();

  const sameGenderApplicants = (Array.isArray(loadedStudents) ? loadedStudents : getAllStudents()).filter(s => {
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
  let summary = {
    boys: { total: 0, occupied: 0, vacant: 0 },
    girls: { total: 0, occupied: 0, vacant: 0 }
  };
  
  rooms.forEach(r => {
    const type = String(r.HostelType || '').toLowerCase();
    if (summary[type]) {
      summary[type].total += Math.max(0, Number(r.Capacity) || 0);
      summary[type].occupied += Math.max(0, Number(r.Occupied) || 0);
    }
  });
  Object.keys(summary).forEach(type => {
    summary[type].occupied = Math.min(summary[type].occupied, summary[type].total);
    summary[type].vacant = Math.max(0, summary[type].total - summary[type].occupied);
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

function getNotices(params) {
  const input = params || {};
  return readPortalCache('notices', 'active', PUBLIC_CACHE_SECONDS, input.force, function() {
    return getSheetData('Notices').filter(n => n.Active === true || String(n.Active).toUpperCase() === 'TRUE').reverse();
  });
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
      const previousStatus = columnMap.DocumentStatus ? String(rows[i][columnMap.DocumentStatus - 1] || '') : '';
      const policyVersion = columnMap.DocumentPolicyVersion ? String(rows[i][columnMap.DocumentPolicyVersion - 1] || '') : '';
      const manualDecision = String(data.ManualDecision || data.manualDecision || '').trim();
      let requestedStatus = data.DocumentStatus || data.documentStatus;
      const reviewer = String(data.Reviewer || data.reviewer || data.reviewedBy || 'Administrator').trim();
      let evidenceSource = String(data.EvidenceSource || data.evidenceSource || '').trim();
      if (policyVersion === MARKSHEET_POLICY_VERSION && manualDecision) {
        if (!['Approve after document review', 'Require original verification'].includes(manualDecision)) return { success: false, error: 'Select a valid manual verification decision.' };
        requestedStatus = manualDecision === 'Approve after document review' ? 'Verified' : 'Offline Verification Required';
        evidenceSource = 'Administrator Document Review';
      }
      if (requestedStatus === 'Verified' && !['Administrator Document Review', 'Original Document', 'Trusted Issuer Signature', 'DigiLocker', 'Official Board Record'].includes(evidenceSource)) {
        return { success: false, error: 'Verified status requires an approved evidence source.' };
      }
      const documents = data.documents || {};
      const remarks = data.remarksByDocument || {};
      const statusMap = {
        AadhaarStatus: documents.aadhaar || data.AadhaarStatus,
        PhotoStatus: documents.photo || data.PhotoStatus,
        MarksheetStatus: requestedStatus || documents.marksheet || data.MarksheetStatus,
        PwdCertificateStatus: documents.pwdCertificate || data.PwdCertificateStatus,
        AadhaarRemarks: remarks.aadhaar || data.AadhaarRemarks || '',
        PhotoRemarks: remarks.photo || data.PhotoRemarks || '',
        MarksheetRemarks: remarks.marksheet || data.MarksheetRemarks || '',
        PwdCertificateRemarks: remarks.pwdCertificate || data.PwdCertificateRemarks || '',
        DocumentStatus: requestedStatus,
        DocumentRemarks: data.DocumentRemarks || data.remarks || '',
        DocumentManualReviewer: reviewer,
        DocumentManualReviewedAt: new Date(),
        DocumentManualEvidenceSource: evidenceSource,
        MarksheetApprovalSource: requestedStatus === 'Verified' ? 'Administrator Document Review' : '',
        DocumentPreviousStatus: previousStatus
      };
      const auditEntry = {
        at: new Date().toISOString(),
        reviewer: reviewer,
        evidenceSource: evidenceSource,
        manualDecision: manualDecision || '',
        previousStatus: previousStatus,
        newStatus: requestedStatus || previousStatus,
        remarks: data.DocumentRemarks || data.remarks || ''
      };
      let audit = [];
      if (columnMap.DocumentAuditLog) {
        try { audit = JSON.parse(String(rows[i][columnMap.DocumentAuditLog - 1] || '[]')); } catch (e) { audit = []; }
      }
      if (!Array.isArray(audit)) audit = [];
      audit.push(auditEntry);
      statusMap.DocumentAuditLog = JSON.stringify(audit.slice(-50));

      Object.keys(statusMap).forEach(key => {
        if (columnMap[key] && statusMap[key] !== undefined) {
          sheet.getRange(i + 1, columnMap[key]).setValue(statusMap[key]);
        }
      });

      if (requestedStatus === 'Offline Verification Required' && previousStatus !== 'Offline Verification Required') {
        const studentData = {};
        Object.keys(columnMap).forEach(key => { studentData[key] = rows[i][columnMap[key] - 1]; });
        Object.keys(statusMap).forEach(key => { if (statusMap[key] !== undefined) studentData[key] = statusMap[key]; });
        sendOfflineVerificationRequiredEmail(studentData, { remarks: statusMap.DocumentRemarks || 'Please present the original marksheet for verification.' });
      }

      return { success: true, message: 'Document verification updated.' };
    }
  }

  return { success: false, error: 'Student not found.' };
}

function getLastSheetRecords(sheetName, count) {
  const sheet = getSheet(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const available = Math.min(Math.max(0, Number(count) || 0), sheet.getLastRow() - 1);
  if (!available) return [];
  const startRow = sheet.getLastRow() - available + 1;
  return sheet.getRange(startRow, 1, available, headers.length).getValues().map(row => {
    const result = {};
    headers.forEach((header, index) => { if (header) result[header] = row[index] instanceof Date ? row[index].toISOString() : row[index]; });
    return result;
  });
}

function getDashboardData(params) {
  const input = params || {};
  return readPortalCache('dashboard', 'summary', ADMIN_CACHE_SECONDS, input.force, function() {
  const students = getAllStudents();
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

  const roomSummary = getRoomSummary();
  
  let priorityBreakdown = [0, 0, 0, 0, 0];
  students.forEach(s => {
    const p = parseInt(getStudentValue(s, 'Priority'), 10);
    if (p >= 1 && p <= 5) priorityBreakdown[p - 1]++;
  });
  
  const recentAllocations = getLastSheetRecords('Allocations', 5).reverse();
  
  return {
    totalApplied, allocated, waitlisted, pending,
    allocatedBoys, allocatedGirls,
    boyStats: roomSummary.boys,
    girlStats: roomSummary.girls,
    priorityBreakdown,
    recentAllocations,
    generatedAt: new Date().toISOString()
  };
  });
}

function adminLogin(data) {
  const settings = getSheetData('Settings');
  const pwSetting = settings.find(s => String(s.Key || '').trim() === 'ADMIN_PASSWORD');
  const storedPassword = pwSetting ? String(pwSetting.Value ?? '').trim() : '';
  const submittedPassword = String(data && data.password != null ? data.password : '').trim();
  if (storedPassword && storedPassword === submittedPassword) {
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

function getSettingsPublic(params) {
  const input = params || {};
  return readPortalCache('settings', 'public', PUBLIC_CACHE_SECONDS, input.force, function() {
    const settings = getSettingsMap();
    return {
    registrationOpen: String(settings.REGISTRATION_OPEN || 'true').toLowerCase() !== 'false',
    registrationCloseDate: settings.REGISTRATION_CLOSE_DATE || '',
    hostelOfficeContact: settings.HOSTEL_OFFICE_CONTACT || 'Contact the Warden Office for official hostel support.',
    messFeeNote: settings.MESS_FEE_NOTE || 'Mess and hostel fee details will be announced through official notices.'
    };
  });
}

function updateSetting(data) {
  const allowed = ['REGISTRATION_OPEN', 'REGISTRATION_CLOSE_DATE', 'HOSTEL_OFFICE_CONTACT', 'MESS_FEE_NOTE'];
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
