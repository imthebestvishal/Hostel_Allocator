function getStudentValue(obj, keyName) {
  if (!obj) return '';
  const targetKey = String(keyName).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (let k in obj) {
    const cleanK = String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanK === targetKey) {
      return obj[k];
    }
  }
  return '';
}

const BOYS_ALLOCATION_BATCH_LIMIT = 40;
const GIRLS_ALLOCATION_BATCH_LIMIT = 40;

function isBoyStudent(student) {
  const g = String(getStudentValue(student, 'Gender')).toLowerCase();
  return (g.includes('male') && !g.includes('female')) || g.includes('boy') || g === 'm';
}

function isGirlStudent(student) {
  const g = String(getStudentValue(student, 'Gender')).toLowerCase();
  return g.includes('female') || g.includes('girl') || g === 'f';
}

function compareStudentsByAllocationRank(a, b) {
  const aPriority = parseInt(getStudentValue(a, 'Priority'), 10) || 5;
  const bPriority = parseInt(getStudentValue(b, 'Priority'), 10) || 5;
  if (aPriority !== bPriority) return aPriority - bPriority;
  if (aPriority === 2 || aPriority === 3) return (parseFloat(getStudentValue(b, 'TwelfthMarks')) || 0) - (parseFloat(getStudentValue(a, 'TwelfthMarks')) || 0);
  if (aPriority === 4) return (parseFloat(getStudentValue(b, 'DistanceKm')) || 0) - (parseFloat(getStudentValue(a, 'DistanceKm')) || 0);
  return new Date(getStudentValue(a, 'Timestamp')) - new Date(getStudentValue(b, 'Timestamp'));
}

function getSortedAllocationBatch(students, limit) {
  return [...(students || [])].sort(compareStudentsByAllocationRank).slice(0, limit);
}

function getAllocationEnrollmentNo(allocation) {
  const direct = getStudentValue(allocation, 'EnrollmentNo');
  if (direct) return direct;
  const values = Object.values(allocation || {});
  if (values.length >= 4 && /^ALC-/i.test(String(values[1] || '').trim()) && /^GGSIPU-/i.test(String(values[3] || '').trim())) {
    return values[0];
  }
  return '';
}

function runAllocationEngine() {
  const startedAt = Date.now();
  const settingsSheet = getSheet('Settings');
  const settingsData = settingsSheet.getDataRange().getValues();
  let runningRow = -1;
  let unverifiedPendingCount = 0;
  for(let i=1; i<settingsData.length; i++){
    if(settingsData[i][0] === 'ALLOCATION_RUNNING'){
      if(settingsData[i][1] === 'true' || settingsData[i][1] === true) {
        return { success: false, durationMs: Date.now() - startedAt, message: 'Allocation is already running. Please try again in a moment.' };
      }
      runningRow = i + 1;
    }
  }
  if(runningRow > -1) settingsSheet.getRange(runningRow, 2).setValue('true');

  let allocatedCount = 0;
  let waitlistedCount = 0;
  let processedBoys = 0;
  let processedGirls = 0;
  let remainingVerifiedBoys = 0;
  let remainingVerifiedGirls = 0;

  try {
    const studentSheet = getSheet('Students');
    const studentData = studentSheet.getDataRange().getValues();
    const studentHeaders = studentData[0] || [];
    const studentObjects = rowsToObjects(studentHeaders, studentData.slice(1));
    const studentRowByEnrollment = buildStudentRowIndex(studentData);
    const allStudents = studentObjects;
    const existingAllocatedEnrollments = new Set(getAllAllocations().map(a => String(getAllocationEnrollmentNo(a)).trim().toLowerCase()).filter(Boolean));
    const existingWaitlistedEnrollments = new Set(getSheetData('WaitingList').map(w => String(getStudentValue(w, 'EnrollmentNo')).trim().toLowerCase()));
    const totalPendingStudents = allStudents.filter(s => {
      const st = String(getStudentValue(s, 'Status')).toLowerCase();
      const enroll = String(getStudentValue(s, 'EnrollmentNo')).trim().toLowerCase();
      return (st === 'pending' || st === '' || st === 'undefined') &&
        !existingAllocatedEnrollments.has(enroll) &&
        !existingWaitlistedEnrollments.has(enroll);
    });

    const pendingStudents = totalPendingStudents.filter(s => {
      const docStatus = String(getStudentValue(s, 'DocumentStatus')).toLowerCase();
      return docStatus === 'verified';
    });

    unverifiedPendingCount = totalPendingStudents.length - pendingStudents.length;

    if (pendingStudents.length === 0) {
      if (unverifiedPendingCount > 0) {
        return {
          success: true,
          allocated: 0,
          waitlisted: 0,
          totalPending: totalPendingStudents.length,
          durationMs: Date.now() - startedAt,
          message: `No allocations processed. There are ${unverifiedPendingCount} pending application(s) in queue, but none have fully verified documents yet.`
        };
      }
      const allocations = getAllAllocations();
      return { 
        success: true, 
        allocated: allocations.length, 
        waitlisted: 0, 
        totalPending: 0,
        durationMs: Date.now() - startedAt,
        message: `All ${allStudents.length} student application(s) have already been allocated/processed! No pending applications left in queue.` 
      };
    }

    const rooms = getAllRooms().filter(r => {
      const v = parseInt(getStudentValue(r, 'VacantBeds'), 10);
      const st = String(getStudentValue(r, 'Status')).toLowerCase();
      return (v > 0 || isNaN(v)) && (st === 'active' || st === 'available' || st === '');
    });

    const boys = pendingStudents.filter(isBoyStudent);
    const girls = pendingStudents.filter(isGirlStudent);
    const boysBatch = getSortedAllocationBatch(boys, BOYS_ALLOCATION_BATCH_LIMIT);
    const girlsBatch = getSortedAllocationBatch(girls, GIRLS_ALLOCATION_BATCH_LIMIT);
    processedBoys = boysBatch.length;
    processedGirls = girlsBatch.length;
    remainingVerifiedBoys = Math.max(0, boys.length - BOYS_ALLOCATION_BATCH_LIMIT);
    remainingVerifiedGirls = Math.max(0, girls.length - GIRLS_ALLOCATION_BATCH_LIMIT);

    const boyRooms = rooms.filter(r => String(getStudentValue(r, 'HostelType')).toLowerCase().includes('boy'));
    const girlRooms = rooms.filter(r => String(getStudentValue(r, 'HostelType')).toLowerCase().includes('girl'));

    const waitingListSheet = getSheet('WaitingList');
    const currentWaitlistCount = Math.max(0, waitingListSheet.getLastRow() - 1);
    const allocResultBoys = planAllocationGroup(boysBatch, boyRooms, currentWaitlistCount + 1);
    const allocResultGirls = planAllocationGroup(girlsBatch, girlRooms, currentWaitlistCount + allocResultBoys.waitlisted + 1);
    
    allocatedCount = allocResultBoys.allocated + allocResultGirls.allocated;
    waitlistedCount = allocResultBoys.waitlisted + allocResultGirls.waitlisted;

    appendRows('Allocations', allocResultBoys.allocationRows.concat(allocResultGirls.allocationRows));
    appendRows('WaitingList', allocResultBoys.waitlistRows.concat(allocResultGirls.waitlistRows));
    batchUpdateStudentStatuses(studentSheet, studentData, studentRowByEnrollment, allocResultBoys.statusUpdates.concat(allocResultGirls.statusUpdates));

    const roomsSheet = getSheet('Rooms');
    const roomsData = roomsSheet.getDataRange().getValues();
    const updatedRooms = [...allocResultBoys.roomsMap.values(), ...allocResultGirls.roomsMap.values()];
    batchUpdateRooms(roomsSheet, roomsData, updatedRooms);

  } finally {
    if(runningRow > -1) {
      settingsSheet.getRange(runningRow, 2).setValue('false');
    }
    const dateRowIndex = settingsData.findIndex(r => r[0] === 'LAST_ALLOCATION_DATE');
    if(dateRowIndex > -1) {
      settingsSheet.getRange(dateRowIndex + 1, 2).setValue(new Date().toISOString());
    }
  }

  return { 
    success: true, 
    allocated: allocatedCount, 
    waitlisted: waitlistedCount,
    processedBoys: processedBoys,
    processedGirls: processedGirls,
    remainingVerifiedBoys: remainingVerifiedBoys,
    remainingVerifiedGirls: remainingVerifiedGirls,
    durationMs: Date.now() - startedAt,
    message: `Allocation completed successfully! Allocated: ${allocatedCount}, Waitlisted: ${waitlistedCount}.${unverifiedPendingCount > 0 ? ' (Skipped ' + unverifiedPendingCount + ' pending student(s) due to unverified documents)' : ''}`
  };
}

function rowsToObjects(headers, rows) {
  return (rows || []).filter(row => row.some(cell => String(cell).trim() !== '')).map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      if (header) obj[header] = row[index];
    });
    return obj;
  });
}

function buildStudentRowIndex(studentData) {
  const map = {};
  for (let i = 1; i < studentData.length; i++) {
    const enroll = String(studentData[i][1] || '').trim().toLowerCase();
    if (enroll) map[enroll] = i + 1;
  }
  return map;
}

function appendRows(sheetName, rows) {
  if (!rows || rows.length === 0) return;
  const sheet = getSheet(sheetName);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function batchUpdateStudentStatuses(studentSheet, studentData, rowByEnrollment, updates) {
  if (!updates || updates.length === 0 || studentData.length <= 1) return;
  const statusColumnValues = studentData.slice(1).map(row => [row[19] || '']);
  updates.forEach(update => {
    const rowNumber = rowByEnrollment[String(update.enrollmentNo || '').trim().toLowerCase()];
    if (!rowNumber) return;
    statusColumnValues[rowNumber - 2][0] = update.status;
  });
  studentSheet.getRange(2, 20, statusColumnValues.length, 1).setValues(statusColumnValues);
}

function batchUpdateRooms(roomsSheet, roomsData, updatedRooms) {
  if (!updatedRooms || updatedRooms.length === 0 || roomsData.length <= 1) return;
  const updatedById = {};
  updatedRooms.forEach(room => {
    const roomId = String(getStudentValue(room, 'RoomID') || '').trim();
    if (roomId) updatedById[roomId] = room;
  });
  const occupancyValues = [];
  const vacancyValues = [];
  for (let i = 1; i < roomsData.length; i++) {
    const room = updatedById[String(roomsData[i][0] || '').trim()];
    occupancyValues.push([room ? getStudentValue(room, 'Occupied') : roomsData[i][6]]);
    vacancyValues.push([room ? getStudentValue(room, 'VacantBeds') : roomsData[i][7]]);
  }
  roomsSheet.getRange(2, 7, occupancyValues.length, 1).setValues(occupancyValues);
  roomsSheet.getRange(2, 8, vacancyValues.length, 1).setValues(vacancyValues);
}

function shouldSkipWaitlistNotification(student) {
  const enroll = String(getStudentValue(student, 'EnrollmentNo') || '').trim().toUpperCase();
  return enroll.indexOf('LOAD-') === 0;
}

function planAllocationGroup(students, rooms, firstWaitlistPosition) {
  let allocated = 0;
  let waitlisted = 0;
  const allocationRows = [];
  const waitlistRows = [];
  const statusUpdates = [];

  students.sort(compareStudentsByAllocationRank);

  const roomsMap = new Map();
  rooms.forEach(r => roomsMap.set(r.RoomID, {...r}));
  const availableRooms = Array.from(roomsMap.values());

  let nextPosition = firstWaitlistPosition;

  for (const student of students) {
    let assigned = false;
    for (const room of availableRooms) {
      const vacantBeds = parseInt(getStudentValue(room, 'VacantBeds'), 10) || 0;
      if (vacantBeds > 0) {
        room.VacantBeds = vacantBeds - 1;
        room.Occupied = (parseInt(getStudentValue(room, 'Occupied'), 10) || 0) + 1;
        
        const bedLetters = ['A', 'B', 'C', 'D', 'E'];
        const capacity = parseInt(getStudentValue(room, 'Capacity'), 10) || 1;
        const bedNum = bedLetters[capacity - room.VacantBeds - 1] || 'A';
        
        const allocId = 'ALC-' + Utilities.getUuid().substring(0, 5).toUpperCase();
        const studentEnroll = getStudentValue(student, 'EnrollmentNo');
        const studentName = getStudentValue(student, 'Name');
        const studentGender = getStudentValue(student, 'Gender');
        const studentAppId = getStudentValue(student, 'ApplicationID');

        allocationRows.push([
          allocId, new Date(), studentAppId, studentEnroll, studentName, studentGender,
          getStudentValue(room, 'RoomID'), getStudentValue(room, 'RoomNumber'), getStudentValue(room, 'HostelName'),
          getStudentValue(room, 'Floor'), bedNum, 'Active', 'No', ''
        ]);
        statusUpdates.push({ enrollmentNo: studentEnroll, status: 'Allocated' });
        
        allocated++;
        assigned = true;
        break;
      }
    }
    
    if (!assigned) {
      const studentEnroll = getStudentValue(student, 'EnrollmentNo');
      const studentName = getStudentValue(student, 'Name');
      const studentGender = getStudentValue(student, 'Gender');
      const studentAppId = getStudentValue(student, 'ApplicationID');

      waitlistRows.push([
        nextPosition++, studentAppId, studentEnroll, studentName, studentGender,
        getStudentValue(student, 'Priority'), getStudentValue(student, 'TwelfthMarks'), getStudentValue(student, 'DistanceKm'), new Date(), 'Active'
      ]);
      statusUpdates.push({ enrollmentNo: studentEnroll, status: 'Waitlisted' });
      if (!shouldSkipWaitlistNotification(student)) sendWaitlistNotification(student, nextPosition - 1);
      waitlisted++;
    }
  }

  return { allocated, waitlisted, roomsMap, allocationRows, waitlistRows, statusUpdates };
}

function allocateGroup(students, rooms) {
  const waitingListSheet = getSheet('WaitingList');
  const currentWaitlistCount = Math.max(0, waitingListSheet.getLastRow() - 1);
  const result = planAllocationGroup(students, rooms, currentWaitlistCount + 1);
  appendRows('Allocations', result.allocationRows);
  appendRows('WaitingList', result.waitlistRows);
  const studentSheet = getSheet('Students');
  const studentData = studentSheet.getDataRange().getValues();
  batchUpdateStudentStatuses(studentSheet, studentData, buildStudentRowIndex(studentData), result.statusUpdates);
  return result;
}

function promoteFromWaitlist() {
  // Can be called manually or via trigger when a room is marked vacant
}

function resetVerifiedTestStudentsForReallocation() {
  const startedAt = Date.now();
  clearAllocationRunningFlag();
  const studentSheet = getSheet('Students');
  const studentData = studentSheet.getDataRange().getValues();
  if (studentData.length <= 1) {
    return {
      success: true,
      studentsReset: 0,
      allocationsRemoved: 0,
      waitlistRowsRemoved: 0,
      roomsRecomputed: 0,
      durationMs: Date.now() - startedAt
    };
  }

  const headers = studentData[0];
  const statusCol = headers.indexOf('Status');
  const documentStatusCol = headers.indexOf('DocumentStatus');
  const documentRemarksCol = headers.indexOf('DocumentRemarks');
  const testEnrollments = new Set();
  const statusValues = studentData.slice(1).map(row => [row[statusCol] || '']);
  let studentsReset = 0;

  for (let i = 1; i < studentData.length; i++) {
    const row = studentData[i];
    const enrollmentNo = String(row[1] || '').trim();
    const documentStatus = String(documentStatusCol >= 0 ? row[documentStatusCol] : '').trim().toLowerCase();
    const documentRemarks = String(documentRemarksCol >= 0 ? row[documentRemarksCol] : '').toLowerCase();
    const isLoadStudent = enrollmentNo.toUpperCase().indexOf('LOAD-') === 0 || documentRemarks.indexOf('load test seed') !== -1;
    if (!isLoadStudent || documentStatus !== 'verified') continue;

    testEnrollments.add(enrollmentNo.toLowerCase());
    studentsReset++;
    if (statusCol >= 0 && String(row[statusCol] || '').trim() !== 'Pending') {
      statusValues[i - 1][0] = 'Pending';
    }
  }

  if (statusCol >= 0 && testEnrollments.size > 0) {
    studentSheet.getRange(2, statusCol + 1, statusValues.length, 1).setValues(statusValues);
  }

  const allocationsRemoved = removeRowsForEnrollments('Allocations', testEnrollments, {
    canonicalHeaders: ['AllocationID', 'Timestamp', 'ApplicationID', 'EnrollmentNo', 'StudentName', 'Gender', 'RoomID', 'RoomNumber', 'HostelName', 'Floor', 'BedNumber', 'Status', 'LetterSent', 'LetterSentAt'],
    enrollmentIndex: 3,
    keepCanonicalHeaderWhenMissing: true
  });
  const waitlistRowsRemoved = removeRowsForEnrollments('WaitingList', testEnrollments, {
    canonicalHeaders: ['Position', 'ApplicationID', 'EnrollmentNo', 'StudentName', 'Gender', 'Priority', 'TwelfthMarks', 'DistanceKm', 'AddedAt', 'Status'],
    enrollmentIndex: 2,
    keepCanonicalHeaderWhenMissing: false
  });
  const roomsRecomputed = recomputeRoomsFromAllocations();

  return {
    success: true,
    studentsReset: studentsReset,
    matchedTestStudents: testEnrollments.size,
    allocationsRemoved: allocationsRemoved,
    waitlistRowsRemoved: waitlistRowsRemoved,
    roomsRecomputed: roomsRecomputed,
    durationMs: Date.now() - startedAt
  };
}

function clearAllocationRunningFlag() {
  const settingsSheet = getSheet('Settings');
  if (!settingsSheet) return false;
  const settingsData = settingsSheet.getDataRange().getValues();
  for (let i = 1; i < settingsData.length; i++) {
    if (settingsData[i][0] === 'ALLOCATION_RUNNING') {
      settingsSheet.getRange(i + 1, 2).setValue('false');
      return true;
    }
  }
  return false;
}

function removeRowsForEnrollments(sheetName, enrollments, options) {
  if (!enrollments || enrollments.size === 0) return 0;
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return 0;

  const canonicalHeaders = options.canonicalHeaders || [];
  const firstRow = data[0] || [];
  const hasExpectedHeader = canonicalHeaders.length > 0 && canonicalHeaders.some(header => firstRow.indexOf(header) !== -1);
  const header = hasExpectedHeader ? firstRow : canonicalHeaders;
  const dataRows = hasExpectedHeader ? data.slice(1) : data;
  const enrollmentIndex = hasExpectedHeader && firstRow.indexOf('EnrollmentNo') !== -1
    ? firstRow.indexOf('EnrollmentNo')
    : options.enrollmentIndex;
  const keptRows = [];
  let removed = 0;

  dataRows.forEach(row => {
    const enroll = String(row[enrollmentIndex] || '').trim().toLowerCase();
    if (enroll && enrollments.has(enroll)) {
      removed++;
      return;
    }
    keptRows.push(row);
  });

  if (removed === 0) return 0;

  sheet.clearContents();
  const finalRows = [header].concat(keptRows);
  sheet.getRange(1, 1, finalRows.length, header.length).setValues(finalRows.map(row => {
    const fixed = row.slice(0, header.length);
    while (fixed.length < header.length) fixed.push('');
    return fixed;
  }));
  if (typeof formatHeaderRow === 'function') formatHeaderRow(sheet);
  return removed;
}

function recomputeRoomsFromAllocations() {
  const roomsSheet = getSheet('Rooms');
  const roomsData = roomsSheet.getDataRange().getValues();
  if (roomsData.length <= 1) return 0;

  const allocationsSheet = getSheet('Allocations');
  const allocationData = allocationsSheet.getDataRange().getValues();
  const allocationHeaders = allocationData[0] || [];
  const hasAllocationHeader = allocationHeaders.indexOf('RoomID') !== -1;
  const allocationRows = hasAllocationHeader ? allocationData.slice(1) : allocationData;
  const roomIdIndex = hasAllocationHeader ? allocationHeaders.indexOf('RoomID') : 6;
  const statusIndex = hasAllocationHeader ? allocationHeaders.indexOf('Status') : 11;
  const activeByRoomId = {};

  allocationRows.forEach(row => {
    const status = String(row[statusIndex] || 'Active').trim().toLowerCase();
    if (status && status !== 'active' && status !== 'allocated') return;
    const roomId = String(row[roomIdIndex] || '').trim();
    if (!roomId) return;
    activeByRoomId[roomId] = (activeByRoomId[roomId] || 0) + 1;
  });

  const occupancyValues = [];
  const vacancyValues = [];
  for (let i = 1; i < roomsData.length; i++) {
    const roomId = String(roomsData[i][0] || '').trim();
    const capacity = parseInt(roomsData[i][5], 10) || 0;
    const occupied = activeByRoomId[roomId] || 0;
    occupancyValues.push([occupied]);
    vacancyValues.push([Math.max(0, capacity - occupied)]);
  }
  roomsSheet.getRange(2, 7, occupancyValues.length, 1).setValues(occupancyValues);
  roomsSheet.getRange(2, 8, vacancyValues.length, 1).setValues(vacancyValues);
  return occupancyValues.length;
}

function getAllocationPreview() {
  const students = getAllStudents();
  const rooms = getAllRooms();
  const existingAllocatedEnrollments = new Set(getAllAllocations().map(a => String(getAllocationEnrollmentNo(a)).trim().toLowerCase()).filter(Boolean));
  const existingWaitlistedEnrollments = new Set(getSheetData('WaitingList').map(w => String(getStudentValue(w, 'EnrollmentNo')).trim().toLowerCase()));

  const pending = students.filter(s => {
    const st = String(getStudentValue(s, 'Status')).toLowerCase();
    const enroll = String(getStudentValue(s, 'EnrollmentNo')).trim().toLowerCase();
    return (st === 'pending' || st === '' || st === 'undefined') &&
      !existingAllocatedEnrollments.has(enroll) &&
      !existingWaitlistedEnrollments.has(enroll);
  });
  const verifiedPending = pending.filter(s => String(getStudentValue(s, 'DocumentStatus')).toLowerCase() === 'verified');
  const verifiedBoysPending = verifiedPending.filter(isBoyStudent).length;
  const verifiedGirlsPending = verifiedPending.filter(isGirlStudent).length;

  let boysSeats = 0;
  let girlsSeats = 0;
  rooms.forEach(r => {
    const st = String(getStudentValue(r, 'Status')).toLowerCase();
    if (!(st === 'active' || st === 'available' || st === '')) return;
    const seats = parseInt(getStudentValue(r, 'VacantBeds'), 10) || 0;
    const type = String(getStudentValue(r, 'HostelType')).toLowerCase();
    if (type.includes('boy')) boysSeats += seats;
    if (type.includes('girl')) girlsSeats += seats;
  });

  return {
    success: true,
    verifiedPending: verifiedPending.length,
    verifiedBoysPending: verifiedBoysPending,
    verifiedGirlsPending: verifiedGirlsPending,
    batchBoysLimit: BOYS_ALLOCATION_BATCH_LIMIT,
    batchGirlsLimit: GIRLS_ALLOCATION_BATCH_LIMIT,
    processableBoysThisRun: Math.min(BOYS_ALLOCATION_BATCH_LIMIT, verifiedBoysPending),
    processableGirlsThisRun: Math.min(GIRLS_ALLOCATION_BATCH_LIMIT, verifiedGirlsPending),
    remainingVerifiedBoysAfterBatch: Math.max(0, verifiedBoysPending - BOYS_ALLOCATION_BATCH_LIMIT),
    remainingVerifiedGirlsAfterBatch: Math.max(0, verifiedGirlsPending - GIRLS_ALLOCATION_BATCH_LIMIT),
    unverifiedPending: pending.length - verifiedPending.length,
    availableBoysSeats: boysSeats,
    availableGirlsSeats: girlsSeats
  };
}
