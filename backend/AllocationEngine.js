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
  const settingsSheet = getSheet('Settings');
  const settingsData = settingsSheet.getDataRange().getValues();
  let runningRow = -1;
  let unverifiedPendingCount = 0;
  for(let i=1; i<settingsData.length; i++){
    if(settingsData[i][0] === 'ALLOCATION_RUNNING'){
      if(settingsData[i][1] === 'true' || settingsData[i][1] === true) {
        return { success: false, message: 'Allocation is already running. Please try again in a moment.' };
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
    const allStudents = getAllStudents();
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
          message: `No allocations processed. There are ${unverifiedPendingCount} pending application(s) in queue, but none have fully verified documents yet.`
        };
      }
      const allocations = getAllAllocations();
      return { 
        success: true, 
        allocated: allocations.length, 
        waitlisted: 0, 
        totalPending: 0,
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

    const allocResultBoys = allocateGroup(boysBatch, boyRooms);
    const allocResultGirls = allocateGroup(girlsBatch, girlRooms);
    
    allocatedCount = allocResultBoys.allocated + allocResultGirls.allocated;
    waitlistedCount = allocResultBoys.waitlisted + allocResultGirls.waitlisted;

    const roomsSheet = getSheet('Rooms');
    const roomsData = roomsSheet.getDataRange().getValues();
    const updatedRooms = [...allocResultBoys.roomsMap.values(), ...allocResultGirls.roomsMap.values()];
    
    updatedRooms.forEach(ur => {
      for(let i=1; i<roomsData.length; i++){
        if(roomsData[i][0] === ur.RoomID){
          roomsSheet.getRange(i+1, 7).setValue(ur.Occupied); // Occupied
          roomsSheet.getRange(i+1, 8).setValue(ur.VacantBeds); // VacantBeds
          break;
        }
      }
    });

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
    message: `Allocation completed successfully! Allocated: ${allocatedCount}, Waitlisted: ${waitlistedCount}.${unverifiedPendingCount > 0 ? ' (Skipped ' + unverifiedPendingCount + ' pending student(s) due to unverified documents)' : ''}`
  };
}

function allocateGroup(students, rooms) {
  let allocated = 0;
  let waitlisted = 0;

  students.sort(compareStudentsByAllocationRank);

  const roomsMap = new Map();
  rooms.forEach(r => roomsMap.set(r.RoomID, {...r}));
  const availableRooms = Array.from(roomsMap.values());

  const waitingListSheet = getSheet('WaitingList');
  const currentWaitlistCount = waitingListSheet.getLastRow() - 1;
  let nextPosition = currentWaitlistCount < 0 ? 1 : currentWaitlistCount + 1;

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

        saveAllocation({
          AllocationID: allocId,
          Timestamp: new Date(),
          ApplicationID: studentAppId,
          EnrollmentNo: studentEnroll,
          StudentName: studentName,
          Gender: studentGender,
          RoomID: getStudentValue(room, 'RoomID'),
          RoomNumber: getStudentValue(room, 'RoomNumber'),
          HostelName: getStudentValue(room, 'HostelName'),
          Floor: getStudentValue(room, 'Floor'),
          BedNumber: bedNum,
          Status: 'Active',
          LetterSent: 'No',
          LetterSentAt: ''
        });
        
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

      waitingListSheet.appendRow([
        nextPosition++, studentAppId, studentEnroll, studentName, studentGender,
        getStudentValue(student, 'Priority'), getStudentValue(student, 'TwelfthMarks'), getStudentValue(student, 'DistanceKm'), new Date(), 'Active'
      ]);
      
      const studentSheet = getSheet('Students');
      const studentsData = studentSheet.getDataRange().getValues();
      for (let i = 1; i < studentsData.length; i++) {
        if (String(studentsData[i][1]).trim() === String(studentEnroll).trim()) {
          studentSheet.getRange(i + 1, 20).setValue('Waitlisted'); // col 20 is Status
          break;
        }
      }
      sendWaitlistNotification(student, nextPosition - 1);
      waitlisted++;
    }
  }

  return { allocated, waitlisted, roomsMap };
}

function promoteFromWaitlist() {
  // Can be called manually or via trigger when a room is marked vacant
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
