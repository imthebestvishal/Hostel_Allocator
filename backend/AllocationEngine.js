const ALLOCATION_METHOD_SORTING = 'SORTING';
const ALLOCATION_METHOD_OPTIMIZED = 'OPTIMIZED';

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

function normalizeAllocationMethod(value) {
  const method = String(value || ALLOCATION_METHOD_SORTING).trim().toUpperCase();
  return method === ALLOCATION_METHOD_OPTIMIZED ? ALLOCATION_METHOD_OPTIMIZED : ALLOCATION_METHOD_SORTING;
}

function getAllocationMethodFromSettings(settingsData) {
  const row = (settingsData || []).find(r => String(r[0] || '').trim() === 'ALLOCATION_METHOD');
  return normalizeAllocationMethod(row ? row[1] : ALLOCATION_METHOD_SORTING);
}

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
  if (aPriority === 2 || aPriority === 3) {
    return (parseFloat(getStudentValue(b, 'TwelfthMarks')) || 0) - (parseFloat(getStudentValue(a, 'TwelfthMarks')) || 0);
  }
  if (aPriority === 4) {
    return (parseFloat(getStudentValue(b, 'DistanceKm')) || 0) - (parseFloat(getStudentValue(a, 'DistanceKm')) || 0);
  }
  const aTime = new Date(getStudentValue(a, 'Timestamp')).getTime() || 0;
  const bTime = new Date(getStudentValue(b, 'Timestamp')).getTime() || 0;
  return aTime - bTime;
}

function createRoomsMap(rooms) {
  const roomsMap = new Map();
  (rooms || []).forEach(room => {
    const roomId = getStudentValue(room, 'RoomID');
    if (roomId) roomsMap.set(roomId, { ...room });
  });
  return roomsMap;
}

function getRoomVacantBeds(room) {
  return parseInt(getStudentValue(room, 'VacantBeds'), 10) || 0;
}

function getRoomOccupied(room) {
  return parseInt(getStudentValue(room, 'Occupied'), 10) || 0;
}

function getRoomCapacity(room) {
  return parseInt(getStudentValue(room, 'Capacity'), 10) || 1;
}

function getNextBedNumber(room) {
  const bedLetters = ['A', 'B', 'C', 'D', 'E'];
  const capacity = getRoomCapacity(room);
  const vacantBeds = getRoomVacantBeds(room);
  return bedLetters[capacity - vacantBeds - 1] || 'A';
}

function buildAllocationRecord(student, room, now) {
  return {
    AllocationID: '',
    Timestamp: now || new Date(),
    ApplicationID: getStudentValue(student, 'ApplicationID'),
    EnrollmentNo: getStudentValue(student, 'EnrollmentNo'),
    StudentName: getStudentValue(student, 'Name'),
    Gender: getStudentValue(student, 'Gender'),
    RoomID: getStudentValue(room, 'RoomID'),
    RoomNumber: getStudentValue(room, 'RoomNumber'),
    HostelName: getStudentValue(room, 'HostelName'),
    Floor: getStudentValue(room, 'Floor'),
    BedNumber: getNextBedNumber(room),
    Status: 'Active',
    LetterSent: 'No',
    LetterSentAt: '',
    _student: student
  };
}

function markRoomSlotUsed(room) {
  room.VacantBeds = getRoomVacantBeds(room) - 1;
  room.Occupied = getRoomOccupied(room) + 1;
}

function buildWaitlistRecord(student) {
  return {
    ApplicationID: getStudentValue(student, 'ApplicationID'),
    EnrollmentNo: getStudentValue(student, 'EnrollmentNo'),
    StudentName: getStudentValue(student, 'Name'),
    Gender: getStudentValue(student, 'Gender'),
    Priority: getStudentValue(student, 'Priority'),
    TwelfthMarks: getStudentValue(student, 'TwelfthMarks'),
    DistanceKm: getStudentValue(student, 'DistanceKm'),
    AddedAt: new Date(),
    Status: 'Active',
    _student: student
  };
}

function buildSortingAllocationPlan(students, rooms) {
  const sortedStudents = [...(students || [])].sort(compareStudentsByAllocationRank);
  const roomsMap = createRoomsMap(rooms);
  const availableRooms = Array.from(roomsMap.values());
  const allocations = [];
  const waitlist = [];

  sortedStudents.forEach(student => {
    let assigned = false;
    for (const room of availableRooms) {
      if (getRoomVacantBeds(room) > 0) {
        allocations.push(buildAllocationRecord(student, room));
        markRoomSlotUsed(room);
        assigned = true;
        break;
      }
    }
    if (!assigned) waitlist.push(buildWaitlistRecord(student));
  });

  return {
    method: ALLOCATION_METHOD_SORTING,
    allocated: allocations.length,
    waitlisted: waitlist.length,
    allocations,
    waitlist,
    roomsMap
  };
}

function roomMatchesStudentPreference(student, room) {
  const pref = String(getStudentValue(student, 'HostelPref')).trim().toLowerCase();
  if (!pref) return false;
  const hostelName = String(getStudentValue(room, 'HostelName')).toLowerCase();
  const roomNumber = String(getStudentValue(room, 'RoomNumber')).toLowerCase();
  const roomId = String(getStudentValue(room, 'RoomID')).toLowerCase();
  return hostelName.includes(pref) || roomNumber.includes(pref) || roomId.includes(pref);
}

function getOptimizedRoomScore(student, room, originalIndex) {
  let score = 0;
  if (roomMatchesStudentPreference(student, room)) score += 100000;
  if (getRoomOccupied(room) > 0) score += 10000;
  score += Math.max(0, 1000 - originalIndex);
  score += Math.max(0, 100 - getRoomVacantBeds(room));
  return score;
}

function chooseOptimizedRoom(student, availableRooms) {
  let best = null;
  let bestScore = -Infinity;
  availableRooms.forEach((room, index) => {
    if (getRoomVacantBeds(room) <= 0) return;
    const score = getOptimizedRoomScore(student, room, index);
    if (score > bestScore) {
      best = room;
      bestScore = score;
    }
  });
  return best;
}

function buildOptimizedAllocationPlan(students, rooms) {
  const sortedStudents = [...(students || [])].sort(compareStudentsByAllocationRank);
  const roomsMap = createRoomsMap(rooms);
  const availableRooms = Array.from(roomsMap.values());
  const allocations = [];
  const waitlist = [];

  sortedStudents.forEach(student => {
    const room = chooseOptimizedRoom(student, availableRooms);
    if (room) {
      allocations.push(buildAllocationRecord(student, room));
      markRoomSlotUsed(room);
    } else {
      waitlist.push(buildWaitlistRecord(student));
    }
  });

  return {
    method: ALLOCATION_METHOD_OPTIMIZED,
    allocated: allocations.length,
    waitlisted: waitlist.length,
    allocations,
    waitlist,
    roomsMap
  };
}

function buildAllocationPlan(students, rooms, method) {
  const normalizedMethod = normalizeAllocationMethod(method);
  if (normalizedMethod === ALLOCATION_METHOD_OPTIMIZED) {
    return buildOptimizedAllocationPlan(students, rooms);
  }
  return buildSortingAllocationPlan(students, rooms);
}

function assignAllocationIds(plan) {
  plan.allocations.forEach(allocation => {
    if (!allocation.AllocationID) {
      allocation.AllocationID = 'ALC-' + Utilities.getUuid().substring(0, 5).toUpperCase();
    }
  });
}

function persistAllocationPlan(plan, startingWaitlistPosition) {
  assignAllocationIds(plan);
  plan.allocations.forEach(allocation => saveAllocation(allocation));

  const waitingListSheet = getSheet('WaitingList');
  let nextPosition = startingWaitlistPosition;
  plan.waitlist.forEach(waitlistEntry => {
    waitingListSheet.appendRow([
      nextPosition,
      waitlistEntry.ApplicationID,
      waitlistEntry.EnrollmentNo,
      waitlistEntry.StudentName,
      waitlistEntry.Gender,
      waitlistEntry.Priority,
      waitlistEntry.TwelfthMarks,
      waitlistEntry.DistanceKm,
      waitlistEntry.AddedAt,
      waitlistEntry.Status
    ]);
    updateStudentStatusByEnrollment(waitlistEntry.EnrollmentNo, 'Waitlisted');
    sendWaitlistNotification(waitlistEntry._student, nextPosition);
    nextPosition++;
  });
}

function updateStudentStatusByEnrollment(enrollmentNo, status) {
  const studentSheet = getSheet('Students');
  const studentsData = studentSheet.getDataRange().getValues();
  for (let i = 1; i < studentsData.length; i++) {
    if (String(studentsData[i][1]).trim() === String(enrollmentNo).trim()) {
      studentSheet.getRange(i + 1, 20).setValue(status); // col 20 is Status
      break;
    }
  }
}

function updateRoomsFromPlan(plan) {
  const roomsSheet = getSheet('Rooms');
  const roomsData = roomsSheet.getDataRange().getValues();
  const updatedRooms = Array.from(plan.roomsMap.values());

  updatedRooms.forEach(ur => {
    for (let i = 1; i < roomsData.length; i++) {
      if (roomsData[i][0] === ur.RoomID) {
        roomsSheet.getRange(i + 1, 7).setValue(ur.Occupied); // Occupied
        roomsSheet.getRange(i + 1, 8).setValue(ur.VacantBeds); // VacantBeds
        break;
      }
    }
  });
}

function runAllocationEngine(methodOverride) {
  const settingsSheet = getSheet('Settings');
  const settingsData = settingsSheet.getDataRange().getValues();
  const allocationMethod = normalizeAllocationMethod(methodOverride || getAllocationMethodFromSettings(settingsData));
  let runningRow = -1;
  let unverifiedPendingCount = 0;
  for (let i = 1; i < settingsData.length; i++) {
    if (settingsData[i][0] === 'ALLOCATION_RUNNING') {
      if (settingsData[i][1] === 'true' || settingsData[i][1] === true) {
        return { success: false, message: 'Allocation is already running. Please try again in a moment.' };
      }
      runningRow = i + 1;
    }
  }
  if (runningRow > -1) settingsSheet.getRange(runningRow, 2).setValue('true');

  let allocatedCount = 0;
  let waitlistedCount = 0;

  try {
    const allStudents = getAllStudents();
    const existingAllocatedEnrollments = new Set(getAllAllocations().map(a => String(getStudentValue(a, 'EnrollmentNo')).trim().toLowerCase()));
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
          method: allocationMethod,
          message: `No allocations processed. There are ${unverifiedPendingCount} pending application(s) in queue, but none have fully verified documents yet.`
        };
      }
      const allocations = getAllAllocations();
      return {
        success: true,
        allocated: allocations.length,
        waitlisted: 0,
        totalPending: 0,
        method: allocationMethod,
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
    const boyRooms = rooms.filter(r => String(getStudentValue(r, 'HostelType')).toLowerCase().includes('boy'));
    const girlRooms = rooms.filter(r => String(getStudentValue(r, 'HostelType')).toLowerCase().includes('girl'));

    const allocResultBoys = buildAllocationPlan(boys, boyRooms, allocationMethod);
    const allocResultGirls = buildAllocationPlan(girls, girlRooms, allocationMethod);

    allocatedCount = allocResultBoys.allocated + allocResultGirls.allocated;
    waitlistedCount = allocResultBoys.waitlisted + allocResultGirls.waitlisted;

    const waitingListSheet = getSheet('WaitingList');
    const currentWaitlistCount = waitingListSheet.getLastRow() - 1;
    const nextPosition = currentWaitlistCount < 0 ? 1 : currentWaitlistCount + 1;

    persistAllocationPlan(allocResultBoys, nextPosition);
    persistAllocationPlan(allocResultGirls, nextPosition + allocResultBoys.waitlisted);
    updateRoomsFromPlan(allocResultBoys);
    updateRoomsFromPlan(allocResultGirls);
  } finally {
    if (runningRow > -1) {
      settingsSheet.getRange(runningRow, 2).setValue('false');
    }
    const dateRowIndex = settingsData.findIndex(r => r[0] === 'LAST_ALLOCATION_DATE');
    if (dateRowIndex > -1) {
      settingsSheet.getRange(dateRowIndex + 1, 2).setValue(new Date().toISOString());
    }
  }

  return {
    success: true,
    allocated: allocatedCount,
    waitlisted: waitlistedCount,
    method: allocationMethod,
    message: `Allocation completed successfully using ${allocationMethod}. Allocated: ${allocatedCount}, Waitlisted: ${waitlistedCount}.${unverifiedPendingCount > 0 ? ' (Skipped ' + unverifiedPendingCount + ' pending student(s) due to unverified documents)' : ''}`
  };
}

function allocateGroup(students, rooms) {
  return buildSortingAllocationPlan(students, rooms);
}

function promoteFromWaitlist() {
  // Can be called manually or via trigger when a room is marked vacant
}

function getAllocationPreview() {
  const students = getAllStudents();
  const rooms = getAllRooms();
  const existingAllocatedEnrollments = new Set(getAllAllocations().map(a => String(getStudentValue(a, 'EnrollmentNo')).trim().toLowerCase()));
  const existingWaitlistedEnrollments = new Set(getSheetData('WaitingList').map(w => String(getStudentValue(w, 'EnrollmentNo')).trim().toLowerCase()));
  const settingsSheet = getSheet('Settings');
  const allocationMethod = getAllocationMethodFromSettings(settingsSheet.getDataRange().getValues());

  const pending = students.filter(s => {
    const st = String(getStudentValue(s, 'Status')).toLowerCase();
    const enroll = String(getStudentValue(s, 'EnrollmentNo')).trim().toLowerCase();
    return (st === 'pending' || st === '' || st === 'undefined') &&
      !existingAllocatedEnrollments.has(enroll) &&
      !existingWaitlistedEnrollments.has(enroll);
  });
  const verifiedPending = pending.filter(s => String(getStudentValue(s, 'DocumentStatus')).toLowerCase() === 'verified');

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
    unverifiedPending: pending.length - verifiedPending.length,
    availableBoysSeats: boysSeats,
    availableGirlsSeats: girlsSeats,
    method: allocationMethod
  };
}
