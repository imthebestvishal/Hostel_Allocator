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

function sendWaitlistNotification(studentData, position) {
  if (!studentData.Email) return;
  const subject = `Hostel Allocation Update - Waiting List Position ${position}`;
  const htmlBody = `<p>Dear ${studentData.Name},</p><p>Based on the current allocation round, you have been placed on the waiting list at position <strong>${position}</strong>.</p><p>Regards,<br>Hostel Administration</p>`;
  try {
    GmailApp.sendEmail(studentData.Email, subject, '', { htmlBody: htmlBody });
  } catch(e) {}
}

function sendGrievanceAcknowledgement(grievanceData) {
  if (!grievanceData.StudentEmail) return;
  const subject = `Grievance Received - Ticket ${grievanceData.TicketID}`;
  const htmlBody = `<p>Dear ${grievanceData.StudentName},</p><p>We have received your grievance (Ticket ID: <strong>${grievanceData.TicketID}</strong>). Our administration will review and respond shortly.</p><p>Regards,<br>Hostel Administration</p>`;
  try {
    GmailApp.sendEmail(grievanceData.StudentEmail, subject, '', { htmlBody: htmlBody });
  } catch(e) {}
}
