// GAS Web App entry point
// Handles all GET and POST requests from the frontend

const SHEET_ID = '1b4L0xvbXijBS6iDhxJ4ir86bsxWE7t6-7ZFppLZqjQI';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function doGet(e) {
  const action = e.parameter.action || '';
  
  try {
    let result;
    switch(action) {
      case 'getDashboard':    result = getDashboardData(); break;
      case 'getStudents':     result = getAllStudents(); break;
      case 'getRooms':        result = getAllRooms(); break;
      case 'getAllocations':  result = getAllAllocations(); break;
      case 'getGrievances':   result = getAllGrievances(); break;
      case 'getNotices':      result = getNotices(); break;
      case 'getStudentStatus': result = getStudentStatus(e.parameter.enrollmentNo, e.parameter.dob); break;
      case 'runAllocation':   result = runAllocationEngine(); break;
      case 'sendLetters':     result = sendAllotmentLetters(); break;
      case 'reseedRooms':     result = resetAndSeedRooms(); break;
      default: result = { status: 'ok', message: 'GGSIPU Hostel Allocator API', version: '1.0' };
    }
    return buildResponse(result);
  } catch(err) {
    return buildResponse({ error: err.message }, 500);
  }
}

function doPost(e) {
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
      default: result = { error: 'Unknown action' };
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
