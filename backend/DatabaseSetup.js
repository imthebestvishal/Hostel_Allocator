const SHEET_ID = '1b4L0xvbXijBS6iDhxJ4ir86bsxWE7t6-7ZFppLZqjQI';

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  return ss.getSheetByName(name);
}

function setupDatabase() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  
  const sheetsConfig = [
    {
      name: 'Students',
      headers: ['ApplicationID', 'EnrollmentNo', 'Name', 'Gender', 'DOB', 'Email', 'Phone', 'Aadhaar', 'Programme', 'Branch', 'Year', 'TwelfthMarks', 'Category', 'State', 'ParentsTransferred', 'DistanceKm', 'PWD', 'HostelPref', 'RoommatePreference', 'Status', 'Priority', 'Timestamp', 'AadhaarFile', 'PhotoFile', 'MarksheetFile', 'PwdCertificateFile', 'AadhaarStatus', 'PhotoStatus', 'MarksheetStatus', 'PwdCertificateStatus', 'AadhaarRemarks', 'PhotoRemarks', 'MarksheetRemarks', 'PwdCertificateRemarks', 'DocumentStatus', 'DocumentRemarks', 'DiscrepancyEmailSentAt']
    },
    {
      name: 'Rooms',
      headers: ['RoomID', 'HostelName', 'HostelType', 'Floor', 'RoomNumber', 'Capacity', 'Occupied', 'VacantBeds', 'Status']
    },
    {
      name: 'Allocations',
      headers: ['AllocationID', 'Timestamp', 'ApplicationID', 'EnrollmentNo', 'StudentName', 'Gender', 'RoomID', 'RoomNumber', 'HostelName', 'Floor', 'BedNumber', 'Status', 'LetterSent', 'LetterSentAt']
    },
    {
      name: 'Grievances',
      headers: ['TicketID', 'ApplicationID', 'StudentName', 'StudentEmail', 'Date', 'Category', 'Subject', 'Description', 'AttachmentURL', 'Status', 'AdminResponse', 'ResolvedAt']
    },
    {
      name: 'Notices',
      headers: ['NoticeID', 'Title', 'Body', 'PostedBy', 'PostedAt', 'Active', 'Audience']
    },
    {
      name: 'Settings',
      headers: ['Key', 'Value', 'Description']
    },
    {
      name: 'WaitingList',
      headers: ['Position', 'ApplicationID', 'EnrollmentNo', 'StudentName', 'Gender', 'Priority', 'TwelfthMarks', 'DistanceKm', 'AddedAt', 'Status']
    }
  ];

  sheetsConfig.forEach(config => {
    let sheet = ss.getSheetByName(config.name);
    if (!sheet) {
      sheet = ss.insertSheet(config.name);
      sheet.appendRow(config.headers);
      formatHeaderRow(sheet);
    }
  });

  seedData(ss);

  return { status: 'success', message: 'Database setup complete' };
}

function formatHeaderRow(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#2B3467');
  headerRange.setFontColor('white');
  sheet.setFrozenRows(1);
}

function seedData(ss) {
  const roomsSheet = ss.getSheetByName('Rooms');
  if (roomsSheet.getLastRow() <= 1) {
    populateOfficialRooms(roomsSheet);
  }

  const settingsSheet = ss.getSheetByName('Settings');
  const settings = [
    ['ADMIN_PASSWORD', 'admin123', 'Password for admin login'],
    ['ALLOCATION_RUNNING', 'false', 'Flag to prevent concurrent runs'],
    ['LAST_ALLOCATION_DATE', '', 'Date of last allocation'],
    ['SMTP_FROM_NAME', 'GGSIPU Hostel Administration', 'Sender name for emails'],
    ['REGISTRATION_OPEN', 'true', 'Whether hostel applications are currently accepted'],
    ['REGISTRATION_CLOSE_DATE', '', 'Registration close date in YYYY-MM-DD format'],
    ['HOSTEL_OFFICE_CONTACT', 'Contact the Warden Office for official hostel support.', 'Public hostel office contact/help text'],
    ['MESS_FEE_NOTE', 'Mess and hostel fee details will be announced through official notices.', 'Public mess/fee note for students']
  ];
  const existingKeys = settingsSheet.getLastRow() > 1
    ? settingsSheet.getRange(2, 1, settingsSheet.getLastRow() - 1, 1).getDisplayValues().flat()
    : [];
  const missing = settings.filter(row => !existingKeys.includes(row[0]));
  if (missing.length) {
    settingsSheet.getRange(settingsSheet.getLastRow() + 1, 1, missing.length, missing[0].length).setValues(missing);
  }
}

function resetAndSeedRooms() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let roomsSheet = ss.getSheetByName('Rooms');
  if (!roomsSheet) {
    roomsSheet = ss.insertSheet('Rooms');
    roomsSheet.appendRow(['RoomID', 'HostelName', 'HostelType', 'Floor', 'RoomNumber', 'Capacity', 'Occupied', 'VacantBeds', 'Status']);
    formatHeaderRow(roomsSheet);
  } else {
    roomsSheet.clear();
    roomsSheet.appendRow(['RoomID', 'HostelName', 'HostelType', 'Floor', 'RoomNumber', 'Capacity', 'Occupied', 'VacantBeds', 'Status']);
    formatHeaderRow(roomsSheet);
  }
  populateOfficialRooms(roomsSheet);
  return { status: 'success', message: 'Re-seeded EDC Boys (264 seats, 108 rooms) and EDC Girls (176 seats, 68 rooms).' };
}

function populateOfficialRooms(roomsSheet) {
  const rooms = [];

  // ── EDC BOYS HOSTEL ──────────────────────────────────────────────────
  // 1. Single Seated (PG & PhD): 38 rooms (Cap 1) -> 38 seats
  for (let i = 1; i <= 38; i++) {
    const floor = Math.floor((i - 1) / 10) + 1;
    const roomNum = `B-1${i < 10 ? '0' + i : i}`;
    rooms.push([`R-B-S-${i}`, 'EDC Boys Hostel', 'Boys', `Floor ${floor}`, roomNum, 1, 0, 1, 'Active']);
  }
  // 2. Triple Seated: 54 rooms (Cap 3) -> 162 seats
  for (let i = 1; i <= 54; i++) {
    const floor = Math.floor((i - 1) / 15) + 2;
    const roomNum = `B-2${i < 10 ? '0' + i : i}`;
    rooms.push([`R-B-T-${i}`, 'EDC Boys Hostel', 'Boys', `Floor ${floor}`, roomNum, 3, 0, 3, 'Active']);
  }
  // 3. Four Seated: 16 rooms (Cap 4) -> 64 seats
  for (let i = 1; i <= 16; i++) {
    const floor = Math.floor((i - 1) / 8) + 4;
    const roomNum = `B-3${i < 10 ? '0' + i : i}`;
    rooms.push([`R-B-F-${i}`, 'EDC Boys Hostel', 'Boys', `Floor ${floor}`, roomNum, 4, 0, 4, 'Active']);
  }
  // Total Boys Seats = 38 + 162 + 64 = 264 seats across 108 rooms

  // ── EDC GIRLS HOSTEL ─────────────────────────────────────────────────
  // 1. Single Seated (PG & PhD): 22 rooms (Cap 1) -> 22 seats
  for (let i = 1; i <= 22; i++) {
    const floor = Math.floor((i - 1) / 10) + 1;
    const roomNum = `G-1${i < 10 ? '0' + i : i}`;
    rooms.push([`R-G-S-${i}`, 'EDC Girls Hostel', 'Girls', `Floor ${floor}`, roomNum, 1, 0, 1, 'Active']);
  }
  // 2. Triple Seated: 30 rooms (Cap 3) -> 90 seats
  for (let i = 1; i <= 30; i++) {
    const floor = Math.floor((i - 1) / 10) + 2;
    const roomNum = `G-2${i < 10 ? '0' + i : i}`;
    rooms.push([`R-G-T-${i}`, 'EDC Girls Hostel', 'Girls', `Floor ${floor}`, roomNum, 3, 0, 3, 'Active']);
  }
  // 3. Four Seated: 16 rooms (Cap 4) -> 64 seats
  for (let i = 1; i <= 16; i++) {
    const floor = Math.floor((i - 1) / 8) + 4;
    const roomNum = `G-3${i < 10 ? '0' + i : i}`;
    rooms.push([`R-G-F-${i}`, 'EDC Girls Hostel', 'Girls', `Floor ${floor}`, roomNum, 4, 0, 4, 'Active']);
  }
  // Total Girls Seats = 22 + 90 + 64 = 176 seats across 68 rooms

  if (rooms.length > 0) {
    const requiredRows = rooms.length + 1;
    const currentMaxRows = roomsSheet.getMaxRows();
    if (currentMaxRows < requiredRows) {
      roomsSheet.insertRowsAfter(currentMaxRows, requiredRows - currentMaxRows);
    }
    roomsSheet.getRange(2, 1, rooms.length, rooms[0].length).setValues(rooms);
  }
}
