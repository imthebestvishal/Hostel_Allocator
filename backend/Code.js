// GAS Web App entry point
// Handles all GET and POST requests from the frontend

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function doGet(e) {
  if (typeof resetSpreadsheetContext === 'function') resetSpreadsheetContext();
  const action = e.parameter.action || '';
  
  try {
    let result;
    switch(action) {
      case 'getDashboard':    result = getDashboardData(e.parameter); break;
      case 'getStudents':     result = getAllStudents(); break;
      case 'getAdminStudentsPage': result = getAdminStudentsPage(e.parameter); break;
      case 'getAdminStudentDetail': result = getAdminStudentDetail(e.parameter); break;
      case 'getRooms':        result = getAllRooms(); break;
      case 'getAllocations':  result = getAllAllocations(); break;
      case 'getAdminAllocationsPage': result = getAdminAllocationsPage(e.parameter); break;
      case 'getAdminRoomsOverview': result = getAdminRoomsOverview(e.parameter); break;
      case 'getGrievances':   result = getAllGrievances(); break;
      case 'getNotices':      result = getNotices(e.parameter); break;
      case 'getStudentStatus': result = getStudentStatus(e.parameter.enrollmentNo, e.parameter.dob); break;
      case 'runAllocation':   result = runAllocationEngine(); invalidatePortalCaches(); break;
      case 'getAllocationPreview': result = getAllocationPreview(); break;
      case 'resetVerifiedTestStudentsForReallocation': result = resetVerifiedTestStudentsForReallocation(); invalidatePortalCaches(); break;
      case 'sendLetters':     result = sendAllotmentLetters(); invalidatePortalCaches(['allocations']); break;
      case 'reseedRooms':     result = resetAndSeedRooms(); invalidatePortalCaches(['dashboard', 'rooms']); break;
      case 'getSettingsPublic': result = getSettingsPublic(e.parameter); break;
      default: result = { status: 'ok', message: 'GGSIPU Hostel Allocator API', version: '1.0' };
    }
    return buildResponse(result);
  } catch(err) {
    return buildResponse({ error: err.message }, 500);
  }
}

function doPost(e) {
  if (typeof resetSpreadsheetContext === 'function') resetSpreadsheetContext();
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch(err) {
    return buildResponse({ error: 'Invalid JSON body' }, 400);
  }
  
  const action = body.action || '';
  try {
    let result;
    switch(action) {
      case 'submitApplication': result = submitApplication(body.data); break;
      case 'fileGrievance':     result = fileGrievance(body.data); break;
      case 'postNotice':        result = postNotice(body.data); break;
      case 'updateRoomStatus':  result = updateRoomStatus(body.data); break;
      case 'updateDocumentVerification': result = updateDocumentVerification(body.data); break;
      case 'sendDiscrepancyEmail': result = sendDiscrepancyEmail(body.data); break;
      case 'sendDiscrepancyEmails': result = sendDiscrepancyEmails(body.data); break;
      case 'resolveGrievance':  result = resolveGrievance(body.data); break;
      case 'adminLogin':        result = adminLogin(body.data); break;
      case 'updateSetting':     result = updateSetting(body.data); break;
      case 'resetVerifiedTestStudentsForReallocation': result = resetVerifiedTestStudentsForReallocation(); break;
      default: result = { error: 'Unknown action' };
    }
    if (result && !result.error && result.success !== false && ['submitApplication', 'fileGrievance', 'postNotice', 'updateRoomStatus', 'updateDocumentVerification', 'sendDiscrepancyEmail', 'sendDiscrepancyEmails', 'resolveGrievance', 'updateSetting', 'resetVerifiedTestStudentsForReallocation'].indexOf(action) !== -1) {
      invalidatePortalCaches();
    }
    return buildResponse(result);
  } catch(err) {
    return buildResponse({ error: err.message }, 500);
  }
}

function buildResponse(data, code = 200) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
function triggerAuth() {
  DriveApp.getRootFolder();
  Logger.log("Drive authorized!");
}
