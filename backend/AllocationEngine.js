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

function runAllocationEngine() {
  const settingsSheet = getSheet('Settings');
  const settingsData = settingsSheet.getDataRange().getValues();
  let runningRow = -1;
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

  try {
    const allStudents = getAllStudents();
    const pendingStudents = allStudents.filter(s => {
      const st = String(getStudentValue(s, 'Status')).toLowerCase();
      return st === 'pending' || st === '' || st === 'undefined';
    });

    if (pendingStudents.length === 0) {
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

    const boys = pendingStudents.filter(s => {
      const g = String(getStudentValue(s, 'Gender')).toLowerCase();
      return g.includes('male') || g.includes('boy') || g === 'm';
    });
    const girls = pendingStudents.filter(s => {
      const g = String(getStudentValue(s, 'Gender')).toLowerCase();
      return g.includes('female') || g.includes('girl') || g === 'f';
    });

    const boyRooms = rooms.filter(r => String(getStudentValue(r, 'HostelType')).toLowerCase().includes('boy'));
    const girlRooms = rooms.filter(r => String(getStudentValue(r, 'HostelType')).toLowerCase().includes('girl'));

    const allocResultBoys = allocateGroup(boys, boyRooms);
    const allocResultGirls = allocateGroup(girls, girlRooms);
    
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
    message: `Allocation completed successfully! Allocated: ${allocatedCount}, Waitlisted: ${waitlistedCount}` 
  };
}

function allocateGroup(students, rooms) {
  let allocated = 0;
  let waitlisted = 0;

  students.sort((a, b) => {
    if (a.Priority !== b.Priority) return a.Priority - b.Priority;
    if (a.Priority === 2 || a.Priority === 3) return b.TwelfthMarks - a.TwelfthMarks;
    if (a.Priority === 4) return b.DistanceKm - a.DistanceKm;
    return new Date(a.Timestamp) - new Date(b.Timestamp);
  });

  const roomsMap = new Map();
  rooms.forEach(r => roomsMap.set(r.RoomID, {...r}));
  const availableRooms = Array.from(roomsMap.values());

  const waitingListSheet = getSheet('WaitingList');
  const currentWaitlistCount = waitingListSheet.getLastRow() - 1;
  let nextPosition = currentWaitlistCount < 0 ? 1 : currentWaitlistCount + 1;

  for (const student of students) {
    let assigned = false;
    for (const room of availableRooms) {
      if (room.VacantBeds > 0) {
        room.VacantBeds--;
        room.Occupied++;
        
        const bedLetters = ['A', 'B', 'C', 'D', 'E'];
        const bedNum = bedLetters[room.Capacity - room.VacantBeds - 1] || 'A';
        
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
        if (studentsData[i][1] == student.EnrollmentNo) {
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
