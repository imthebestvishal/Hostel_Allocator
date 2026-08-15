function getStudentValue(obj, keyName) {
  if (!obj) return '';
  const targetKey = keyName.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (let k in obj) {
    const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanK === targetKey) {
      return obj[k];
    }
  }
  return '';
}

function getSheetData(sheetName) {
  const sheet = getSheet(sheetName);
  if (!sheet) return [];
  const range = sheet.getDataRange();
  const displayValues = range.getDisplayValues();
  const rawValues = range.getValues();
  if (displayValues.length <= 1) return [];
  
  const headers = displayValues[0].map(h => String(h).trim());
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
          if (String(rowRaw[c]).length > 8) {
            val = String(rowDisplay[c]).trim();
          } else {
            val = rowRaw[c];
          }
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

function submitApplication(data) {
  const sheet = getSheet('Students');
  const applicationId = 'GGSIPU-' + new Date().getFullYear() + '-' + Utilities.getUuid().substring(0, 5).toUpperCase();
  
  const enroll = String(data.EnrollmentNo || data.rollNo || '').trim();
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

  const normalizedData = { PWD: pwd, Category: category, ParentsTransferred: parentsTransferred };
  const priority = calculatePriority(normalizedData);
  const timestamp = new Date();
  
  sheet.appendRow([
    applicationId, enroll, name, gender, dob, email, phone, aadhaar,
    programme, branch, year, twelfthMarks, category, state, parentsTransferred,
    distanceKm, pwd, hostelPref, roommatePref, 'Pending', priority, timestamp
  ]);
  
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
  const targetEnroll = String(enrollmentNo || '').trim();
  const targetDob = normalizeDateStr(dob);
  
  const student = students.find(s => {
    const sEnroll = String(getStudentValue(s, 'EnrollmentNo') || getStudentValue(s, 'rollNo') || '').trim();
    const sDob = normalizeDateStr(getStudentValue(s, 'DOB') || getStudentValue(s, 'dateofbirth'));
    
    const enrollMatch = (sEnroll === targetEnroll);
    const dobMatch = (!targetDob || !sDob || sDob === targetDob);
    
    return enrollMatch && dobMatch;
  });
  
  if (!student) {
    return { error: 'Student not found. Checked Enrollment: ' + targetEnroll };
  }
  
  const studentName = getStudentValue(student, 'Name') || 'Student';
  const appStatus = getStudentValue(student, 'Status') || 'Pending';
  
  let result = { 
    success: true,
    name: studentName,
    enrollmentNo: getStudentValue(student, 'EnrollmentNo'),
    applicationId: getStudentValue(student, 'ApplicationID'),
    status: appStatus,
    priority: getStudentValue(student, 'Priority'),
    applicationDetails: student
  };
  
  if (appStatus === 'Allocated') {
    const allocations = getAllAllocations();
    const alloc = allocations.find(a => String(getStudentValue(a, 'EnrollmentNo')).trim() === targetEnroll);
    if (alloc) {
      result.allocation = alloc;
      result.allocatedRoom = getStudentValue(alloc, 'RoomNumber');
      result.allocatedHostel = getStudentValue(alloc, 'HostelName');
    }
  } else if (appStatus === 'Waitlisted') {
    const waitlist = getSheetData('WaitingList');
    const entry = waitlist.find(w => String(getStudentValue(w, 'EnrollmentNo')).trim() === targetEnroll);
    if (entry) result.waitlistPosition = getStudentValue(entry, 'Position');
  }
  
  return result;
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
    const type = r.HostelType.toLowerCase();
    if (summary[type]) {
      summary[type].total += r.Capacity;
      summary[type].occupied += r.Occupied;
      summary[type].vacant += r.VacantBeds;
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
  
  // Update student status in Students sheet
  const studentSheet = getSheet('Students');
  const students = studentSheet.getDataRange().getValues();
  const targetEnroll = String(a.EnrollmentNo).trim();
  const targetAppId = String(a.ApplicationID).trim();
  
  for (let i = 1; i < students.length; i++) {
    const rowAppId = String(students[i][0]).trim();
    const rowEnroll = String(students[i][1]).trim();
    if ((targetEnroll && rowEnroll === targetEnroll) || (targetAppId && rowAppId === targetAppId)) {
      studentSheet.getRange(i + 1, 20).setValue('Allocated'); // col 20 is Status
      break;
    }
  }
}

function getNotices() {
  return getSheetData('Notices').filter(n => n.Active === true || n.Active === 'TRUE').reverse();
}

function postNotice(data) {
  const sheet = getSheet('Notices');
  const noticeId = 'NOT-' + Utilities.getUuid().substring(0, 5).toUpperCase();
  sheet.appendRow([noticeId, data.Title, data.Body, data.PostedBy, new Date(), true]);
  return { success: true, noticeId: noticeId };
}

function fileGrievance(data) {
  const sheet = getSheet('Grievances');
  const ticketId = 'GRV-' + Utilities.getUuid().substring(0, 5).toUpperCase();
  sheet.appendRow([
    ticketId, data.ApplicationID, data.StudentName, data.StudentEmail, new Date(),
    data.Category, data.Subject, data.Description, data.AttachmentURL || '', 'Open', '', ''
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
  for (let i = 1; i < grievances.length; i++) {
    if (grievances[i][0] === data.TicketID) {
      sheet.getRange(i + 1, 10).setValue('Resolved');
      sheet.getRange(i + 1, 11).setValue(data.AdminResponse);
      sheet.getRange(i + 1, 12).setValue(new Date());
      return { success: true };
    }
  }
  return { error: 'Grievance not found' };
}

function getDashboardData() {
  const students = getAllStudents();
  const allocations = getAllAllocations();
  const totalApplied = students.length;

  let allocatedBoys = 0;
  let allocatedGirls = 0;

  allocations.forEach(a => {
    const gender = String(getStudentValue(a, 'Gender')).toLowerCase();
    if (gender.includes('male') || gender.includes('boy') || gender === 'm') {
      allocatedBoys++;
    } else {
      allocatedGirls++;
    }
  });

  const allocated = allocations.length;
  const waitlisted = getSheetData('WaitingList').length;
  const pending = Math.max(0, totalApplied - (allocated + waitlisted));

  const roomSummary = getRoomSummary();
  if (roomSummary.boys) {
    roomSummary.boys.occupied = allocatedBoys;
    roomSummary.boys.vacant = Math.max(0, roomSummary.boys.total - allocatedBoys);
  }
  if (roomSummary.girls) {
    roomSummary.girls.occupied = allocatedGirls;
    roomSummary.girls.vacant = Math.max(0, roomSummary.girls.total - allocatedGirls);
  }

  let priorityBreakdown = [0, 0, 0, 0, 0];
  students.forEach(s => {
    const p = parseInt(getStudentValue(s, 'Priority'), 10);
    if (p >= 1 && p <= 5) priorityBreakdown[p - 1]++;
  });

  const recentAllocations = allocations.slice(-5).reverse();

  return {
    totalApplied, allocated, allocatedBoys, allocatedGirls, waitlisted, pending,
    boyStats: roomSummary.boys,
    girlStats: roomSummary.girls,
    priorityBreakdown,
    recentAllocations
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
