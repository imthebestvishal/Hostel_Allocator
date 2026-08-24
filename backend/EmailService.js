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

function sendAllotmentLetters() {
  try {
    const allocations = getAllAllocations();
    if (!allocations || allocations.length === 0) {
      return { 
        success: false, 
        sent: 0, 
        error: 'No allocations found. Please click "Run Allocation Engine" first before generating letters.' 
      };
    }

    const pendingAllocations = allocations.filter(a => {
      const sent = String(getStudentValue(a, 'LetterSent')).toLowerCase();
      return sent !== 'yes' && sent !== 'true';
    });

    if (pendingAllocations.length === 0) {
      return { 
        success: true, 
        sent: 0, 
        message: 'All allotment letters have already been sent! (Total allocations: ' + allocations.length + ')' 
      };
    }

    const students = getAllStudents();
    let count = 0;
    let errors = [];
    
    const allocSheet = getSheet('Allocations');
    const allocData = allocSheet.getDataRange().getValues();
    
    for (const alloc of pendingAllocations) {
      const allocEnroll = String(getStudentValue(alloc, 'EnrollmentNo')).trim();
      const studentName = getStudentValue(alloc, 'StudentName') || 'Student';
      
      const student = students.find(s => String(getStudentValue(s, 'EnrollmentNo')).trim() === allocEnroll);
      let studentEmail = student ? getStudentValue(student, 'Email') : getStudentValue(alloc, 'Email');
      studentEmail = String(studentEmail || '').trim();
      
      if (!studentEmail) {
        errors.push(`No email address found for ${studentName} (${allocEnroll}).`);
        continue;
      }
      
      const hostelName = getStudentValue(alloc, 'HostelName') || 'East Delhi Campus Hostel';
      const roomNumber = getStudentValue(alloc, 'RoomNumber') || 'Assigned Room';
      const floor = getStudentValue(alloc, 'Floor') || '1st Floor';
      const bedNumber = getStudentValue(alloc, 'BedNumber') || '1';

      const subject = `Hostel Allotment Letter - ${studentName} - GGSIPU ${new Date().getFullYear()}`;
      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #2B3467; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #2B3467; color: white; text-align: center; padding: 20px;">
            <h2 style="margin: 0; font-size: 20px;">Guru Gobind Singh Indraprastha University</h2>
            <p style="margin: 5px 0 0; opacity: 0.9; font-size: 13px;">East Delhi Campus Hostel Administration</p>
          </div>
          
          <div style="padding: 25px; color: #1a1a2e; font-size: 14px; line-height: 1.6;">
            <p style="text-align: right; color: #666; margin-bottom: 20px;"><strong>Date:</strong> ${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</p>
            
            <p><strong>To,</strong><br>
            <strong style="font-size: 16px; color: #2B3467;">${studentName}</strong><br>
            Enrollment No: ${allocEnroll}</p>
            
            <p>Dear ${studentName},</p>
            <p>We are pleased to inform you that you have been provisionally allotted accommodation at GGSIPU East Delhi Campus Hostel for the upcoming academic session.</p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
              <tr style="background-color: #f8fafc;">
                <th style="border: 1px solid #cbd5e1; padding: 10px; text-align: left; width: 40%; color: #475569;">Hostel Name</th>
                <td style="border: 1px solid #cbd5e1; padding: 10px; font-weight: bold; color: #1e293b;">${hostelName}</td>
              </tr>
              <tr>
                <th style="border: 1px solid #cbd5e1; padding: 10px; text-align: left; color: #475569;">Room Number</th>
                <td style="border: 1px solid #cbd5e1; padding: 10px; font-weight: bold; color: #1e293b;">${roomNumber}</td>
              </tr>
              <tr style="background-color: #f8fafc;">
                <th style="border: 1px solid #cbd5e1; padding: 10px; text-align: left; color: #475569;">Floor</th>
                <td style="border: 1px solid #cbd5e1; padding: 10px; color: #1e293b;">${floor}</td>
              </tr>
              <tr>
                <th style="border: 1px solid #cbd5e1; padding: 10px; text-align: left; color: #475569;">Bed Number</th>
                <td style="border: 1px solid #cbd5e1; padding: 10px; color: #1e293b;">${bedNumber}</td>
              </tr>
            </table>
            
            <p><strong>Reporting Instructions:</strong></p>
            <ul style="padding-left: 20px; color: #334155;">
              <li>Please report to the Chief Warden Office within 7 working days.</li>
              <li>Carry original Aadhaar Card, 12th Marksheet, and Fee Payment Receipt for document verification.</li>
            </ul>
            
            <br>
            <p style="text-align: right; margin-top: 30px;"><strong>Chief Warden</strong><br>GGSIPU Hostels</p>
          </div>
        </div>
      `;
      
      const plainText = `Dear ${studentName},\n\nWe are pleased to inform you that you have been provisionally allotted accommodation at GGSIPU East Delhi Campus Hostel.\n\nHostel: ${hostelName}\nRoom: ${roomNumber}\nFloor: ${floor}\nBed: ${bedNumber}\n\nPlease report to the Chief Warden Office within 7 working days with original documents.\n\nRegards,\nChief Warden, GGSIPU Hostels`;

      try {
        if (typeof MailApp !== 'undefined') {
          MailApp.sendEmail({
            to: studentEmail,
            subject: subject,
            body: plainText,
            htmlBody: htmlBody,
            name: 'GGSIPU Hostel Administration'
          });
        } else {
          GmailApp.sendEmail(studentEmail, subject, plainText, { htmlBody: htmlBody, name: 'GGSIPU Hostel Administration' });
        }
        
        const targetAllocId = String(getStudentValue(alloc, 'AllocationID')).trim();
        for (let i = 1; i < allocData.length; i++) {
          const rowAllocId = String(allocData[i][0]).trim();
          const rowEnroll = String(allocData[i][3]).trim();
          if (rowAllocId === targetAllocId || rowEnroll === allocEnroll) {
            allocSheet.getRange(i + 1, 13).setValue('Yes'); // LetterSent
            allocSheet.getRange(i + 1, 14).setValue(new Date().toISOString()); // LetterSentAt
            break;
          }
        }
        count++;
      } catch(err) {
        Logger.log('Email send error for ' + studentEmail + ': ' + err);
        errors.push(`Failed for ${studentEmail}: ${err.message}`);
      }
    }
    
    if (count > 0) {
      return { success: true, sent: count, message: `Successfully sent ${count} allotment letter(s) via Email!` };
    } else {
      return { success: false, sent: 0, error: errors.join(' | ') || 'Could not send emails. Please run sendAllotmentLetters once in Apps Script Editor to authorize Gmail permissions.' };
    }

  } catch(globalErr) {
    Logger.log('Global sendAllotmentLetters Error: ' + globalErr);
    return { success: false, error: globalErr.message };
  }
}

function sendApplicationConfirmation(studentData, applicationId) {
  if (!studentData.Email) return;
  const subject = `Hostel Application Received - ${applicationId}`;
  const htmlBody = `<p>Dear ${studentData.Name},</p><p>We have successfully received your hostel application. Your Application ID is <strong>${applicationId}</strong>.</p><p>Regards,<br>Hostel Administration</p>`;
  try {
    GmailApp.sendEmail(studentData.Email, subject, '', { htmlBody: htmlBody });
  } catch(e) {}
}

function sendOfflineVerificationRequiredEmail(studentData, decision) {
  const applicationId = getStudentValue(studentData, 'ApplicationID') || studentData.ApplicationID || '';
  const enrollmentNo = getStudentValue(studentData, 'EnrollmentNo') || studentData.EnrollmentNo || '';
  const name = getStudentValue(studentData, 'Name') || studentData.Name || 'Student';
  const email = String(getStudentValue(studentData, 'Email') || studentData.Email || '').trim();
  if (!email) return { success: false, sent: 0, error: 'No student email is available.' };

  const sheet = getSheet('Students');
  const map = ensureStudentDocumentColumns();
  const rows = sheet.getDataRange().getValues();
  let rowNumber = 0;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() === String(applicationId).trim()) {
      rowNumber = i + 1;
      if (map.OfflineVerificationEmailSentAt && rows[i][map.OfflineVerificationEmailSentAt - 1]) {
        return { success: true, sent: 0, message: 'Offline-verification email was already sent.' };
      }
      break;
    }
  }

  const remarks = String(decision && decision.remarks || 'The provenance check requires review of the original marksheet.');
  const subject = `Offline Marksheet Verification Required - ${applicationId}`;
  const plainText = `Dear ${name},\n\nYour hostel application has been submitted successfully. The automated provenance check requires review of the original document.\n\nApplication ID: ${applicationId}\nEnrollment No: ${enrollmentNo}\n\n${remarks}\n\nPlease bring the original 12th marksheet to the hostel office for offline verification. Your application has not been rejected.\n\nRegards,\nGGSIPU Hostel Administration`;
  const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#1f2937;line-height:1.6"><h2 style="color:#2B3467">Offline Marksheet Verification Required</h2><p>Dear <strong>${name}</strong>,</p><p>Your hostel application has been submitted successfully. The automated provenance check requires review of the original document.</p><p><strong>Application ID:</strong> ${applicationId}<br><strong>Enrollment No:</strong> ${enrollmentNo}</p><p>${remarks}</p><p>Please bring the <strong>original 12th marksheet</strong> to the hostel office for offline verification. Your application has not been rejected.</p><p>Regards,<br><strong>GGSIPU Hostel Administration</strong></p></div>`;
  try {
    if (typeof MailApp !== 'undefined') MailApp.sendEmail({ to: email, subject: subject, body: plainText, htmlBody: htmlBody, name: 'GGSIPU Hostel Administration' });
    else GmailApp.sendEmail(email, subject, plainText, { htmlBody: htmlBody, name: 'GGSIPU Hostel Administration' });
    if (rowNumber && map.OfflineVerificationEmailSentAt) sheet.getRange(rowNumber, map.OfflineVerificationEmailSentAt).setValue(new Date());
    return { success: true, sent: 1, message: `Offline-verification email sent to ${name}.` };
  } catch (error) {
    Logger.log('Offline verification email error: ' + error);
    return { success: false, sent: 0, error: error.message };
  }
}

function sendWaitlistNotification(studentData, position) {
  if (!studentData.Email) return;
  const subject = `Hostel Allocation Update - Waiting List Position ${position}`;
  const htmlBody = `<p>Dear ${studentData.Name},</p><p>Based on the current allocation round, you have been placed on the waiting list at position <strong>${position}</strong>.</p><p>Regards,<br>Hostel Administration</p>`;
  try {
    GmailApp.sendEmail(studentData.Email, subject, '', { htmlBody: htmlBody });
  } catch(e) {}
}

function sendDiscrepancyEmail(data) {
  const targetEnroll = String(data.EnrollmentNo || data.enrollmentNo || '').trim();
  const targetAppId = String(data.ApplicationID || data.applicationId || '').trim();
  const students = getAllStudents();
  const student = students.find(s => {
    const enroll = String(getStudentValue(s, 'EnrollmentNo')).trim();
    const appId = String(getStudentValue(s, 'ApplicationID')).trim();
    return (targetEnroll && enroll === targetEnroll) || (targetAppId && appId === targetAppId);
  });

  if (!student) return { success: false, error: 'Student not found.' };

  const status = String(getStudentValue(student, 'Status') || '').toLowerCase();
  if (status === 'allocated') {
    return { success: false, error: 'Discrepancy email is blocked because this student is already allocated.' };
  }

  const documentStatus = String(getStudentValue(student, 'DocumentStatus') || '').toLowerCase();
  if (documentStatus !== 'discrepancy') {
    return { success: false, error: 'Document status is not Discrepancy.' };
  }

  const email = String(getStudentValue(student, 'Email') || '').trim();
  if (!email) return { success: false, error: 'No email address found for this student.' };

  const name = getStudentValue(student, 'Name') || 'Student';
  const enroll = getStudentValue(student, 'EnrollmentNo') || targetEnroll;
  const applicationId = getStudentValue(student, 'ApplicationID') || targetAppId;
  const overallRemarks = getStudentValue(student, 'DocumentRemarks') || 'Please review and resubmit the required documents.';
  const docs = [
    { label: 'Aadhaar Document', status: getStudentValue(student, 'AadhaarStatus'), remarks: getStudentValue(student, 'AadhaarRemarks') },
    { label: 'Profile Photo', status: getStudentValue(student, 'PhotoStatus'), remarks: getStudentValue(student, 'PhotoRemarks') },
    { label: '12th Marksheet', status: getStudentValue(student, 'MarksheetStatus'), remarks: getStudentValue(student, 'MarksheetRemarks') },
    { label: 'PWD Certificate', status: getStudentValue(student, 'PwdCertificateStatus'), remarks: getStudentValue(student, 'PwdCertificateRemarks') }
  ].filter(d => {
    const s = String(d.status || '').toLowerCase();
    return s === 'discrepancy' || s === 'missing';
  });

  const issueRows = docs.length ? docs.map(d => `
    <tr>
      <td style="border:1px solid #cbd5e1;padding:10px;font-weight:600;">${d.label}</td>
      <td style="border:1px solid #cbd5e1;padding:10px;color:#b42318;">${d.status || 'Discrepancy'}</td>
      <td style="border:1px solid #cbd5e1;padding:10px;">${d.remarks || 'Please upload a valid document.'}</td>
    </tr>
  `).join('') : `
    <tr><td colspan="3" style="border:1px solid #cbd5e1;padding:10px;">Please review the remarks below.</td></tr>
  `;

  const subject = `Document Discrepancy - Hostel Application ${applicationId}`;
  const plainText = `Dear ${name},\n\nWe found a discrepancy in your hostel application documents.\n\nApplication ID: ${applicationId}\nEnrollment No: ${enroll}\n\nRemarks: ${overallRemarks}\n\nPlease contact the hostel administration or resubmit corrected documents as instructed.\n\nRegards,\nGGSIPU Hostel Administration`;
  const htmlBody = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;border:1px solid #2B3467;border-radius:8px;overflow:hidden;">
      <div style="background:#2B3467;color:#fff;padding:20px;text-align:center;">
        <h2 style="margin:0;font-size:20px;">GGSIPU Hostel Administration</h2>
        <p style="margin:6px 0 0;font-size:13px;opacity:.9;">Document Verification Update</p>
      </div>
      <div style="padding:24px;color:#1f2937;font-size:14px;line-height:1.6;">
        <p>Dear <strong>${name}</strong>,</p>
        <p>Your hostel application documents require correction before further processing.</p>
        <p><strong>Application ID:</strong> ${applicationId}<br><strong>Enrollment No:</strong> ${enroll}</p>
        <table style="width:100%;border-collapse:collapse;margin:18px 0;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="border:1px solid #cbd5e1;padding:10px;text-align:left;">Document</th>
              <th style="border:1px solid #cbd5e1;padding:10px;text-align:left;">Status</th>
              <th style="border:1px solid #cbd5e1;padding:10px;text-align:left;">Remarks</th>
            </tr>
          </thead>
          <tbody>${issueRows}</tbody>
        </table>
        <p><strong>Overall remarks:</strong> ${overallRemarks}</p>
        <p>Please contact the hostel administration or resubmit corrected documents as instructed.</p>
        <p style="margin-top:28px;">Regards,<br><strong>GGSIPU Hostel Administration</strong></p>
      </div>
    </div>
  `;

  try {
    if (typeof MailApp !== 'undefined') {
      MailApp.sendEmail({ to: email, subject, body: plainText, htmlBody, name: 'GGSIPU Hostel Administration' });
    } else {
      GmailApp.sendEmail(email, subject, plainText, { htmlBody, name: 'GGSIPU Hostel Administration' });
    }

    const sheet = getSheet('Students');
    const columnMap = ensureStudentDocumentColumns();
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const rowEnroll = String(rows[i][1] || '').trim();
      const rowAppId = String(rows[i][0] || '').trim();
      if ((targetEnroll && rowEnroll === targetEnroll) || (targetAppId && rowAppId === targetAppId)) {
        if (columnMap.DiscrepancyEmailSentAt) sheet.getRange(i + 1, columnMap.DiscrepancyEmailSentAt).setValue(new Date());
        break;
      }
    }

    return { success: true, sent: 1, message: `Discrepancy email sent to ${name}.` };
  } catch (err) {
    Logger.log('Discrepancy email error for ' + email + ': ' + err);
    return { success: false, error: err.message };
  }
}

function sendDiscrepancyEmails() {
  const students = getAllStudents();
  let sent = 0;
  const errors = [];

  students.forEach(student => {
    const status = String(getStudentValue(student, 'Status') || '').toLowerCase();
    const documentStatus = String(getStudentValue(student, 'DocumentStatus') || '').toLowerCase();
    if (status !== 'allocated' && documentStatus === 'discrepancy') {
      const result = sendDiscrepancyEmail({ ApplicationID: getStudentValue(student, 'ApplicationID') });
      if (result && result.success) sent += 1;
      else errors.push(result && result.error ? result.error : 'Unknown email error');
    }
  });

  return {
    success: sent > 0 || errors.length === 0,
    sent,
    message: sent > 0 ? `Sent ${sent} discrepancy email(s).` : 'No eligible discrepancy emails to send.',
    errors
  };
}

function sendGrievanceAcknowledgement(grievanceData) {
  if (!grievanceData.StudentEmail) return;
  const subject = `Grievance Received - Ticket ${grievanceData.TicketID}`;
  const htmlBody = `<p>Dear ${grievanceData.StudentName},</p><p>We have received your grievance (Ticket ID: <strong>${grievanceData.TicketID}</strong>). Our administration will review and respond shortly.</p><p>Regards,<br>Hostel Administration</p>`;
  try {
    GmailApp.sendEmail(grievanceData.StudentEmail, subject, '', { htmlBody: htmlBody });
  } catch(e) {}
}
