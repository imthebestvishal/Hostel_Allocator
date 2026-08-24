const MARKSHEET_POLICY_VERSION = 'marksheet-provenance-v1';
const MARKSHEET_MAX_BYTES = 10 * 1024 * 1024;
const MARKSHEET_SCREENING_BATCH_SIZE = 5;
const MARKSHEET_MAX_ATTEMPTS = 3;

function normalizeMarksheetMimeType(value) {
  const mime = String(value || '').toLowerCase().split(';')[0].trim();
  return mime === 'image/jpg' ? 'image/jpeg' : mime;
}

function detectMarksheetFileType(bytes) {
  if (!bytes || !bytes.length) return '';
  if (bytes.length >= 5 && String.fromCharCode.apply(null, bytes.slice(0, 5)) === '%PDF-') return 'application/pdf';
  if (bytes.length >= 3 && (bytes[0] & 255) === 0xff && (bytes[1] & 255) === 0xd8 && (bytes[2] & 255) === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((value, index) => (bytes[index] & 255) === value)) return 'image/png';
  return '';
}

function validateMarksheetBytes(bytes, declaredMimeType) {
  if (!bytes || !bytes.length) throw new Error('The marksheet file is empty.');
  if (bytes.length > MARKSHEET_MAX_BYTES) throw new Error('The marksheet must be 10 MB or smaller.');
  const detectedMimeType = detectMarksheetFileType(bytes);
  if (!detectedMimeType) throw new Error('Upload a valid PDF, JPEG, or PNG marksheet.');
  const declared = normalizeMarksheetMimeType(declaredMimeType);
  if (declared && declared !== 'application/octet-stream' && declared !== detectedMimeType) throw new Error('The file content does not match its declared type.');
  if (detectedMimeType === 'application/pdf') {
    const tail = bytes.slice(Math.max(0, bytes.length - 2048));
    if (String.fromCharCode.apply(null, tail).indexOf('%%EOF') === -1) throw new Error('The PDF appears incomplete or corrupt.');
  }
  return { mimeType: detectedMimeType, size: bytes.length };
}

function validateMarksheetFilePayload(fileData) {
  if (!fileData || typeof fileData !== 'object') throw new Error('Upload the required 12th marksheet.');
  const base64 = String(fileData.data || fileData.base64 || '').trim();
  if (!base64) throw new Error('Upload the required 12th marksheet.');
  const bytes = Utilities.base64Decode(base64);
  const validation = validateMarksheetBytes(bytes, fileData.type || fileData.mimeType);
  return { bytes, mimeType: validation.mimeType, size: validation.size, originalName: String(fileData.name || '12th-marksheet').trim() || '12th-marksheet' };
}

function bytesToHex(bytes) {
  return bytes.map(value => ((value & 255) + 256).toString(16).slice(-2)).join('');
}

function sha256Hex(bytes) {
  if (typeof Utilities !== 'undefined') return bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes));
  if (typeof require !== 'undefined') return require('node:crypto').createHash('sha256').update(Buffer.from(bytes)).digest('hex');
  throw new Error('SHA-256 is unavailable.');
}

function normalizeStatus(value, allowed, fallback) {
  const text = String(value || '').trim().toLowerCase();
  const found = allowed.find(item => item.toLowerCase() === text);
  return found || fallback;
}

function normalizeProvenanceResult(result) {
  const value = result || {};
  const metadata = value.metadata && typeof value.metadata === 'object' ? value.metadata : {};
  const c2pa = value.c2pa && typeof value.c2pa === 'object' ? value.c2pa : {};
  const signature = value.digitalSignature && typeof value.digitalSignature === 'object' ? value.digitalSignature : {};
  const synth = value.synthId && typeof value.synthId === 'object' ? value.synthId : {};
  return {
    verifierConfigured: value.verifierConfigured !== false,
    checksumMatch: value.checksumMatch !== false,
    retrievedChecksum: String(value.retrievedChecksum || ''),
    metadata: {
      summary: metadata.summary && typeof metadata.summary === 'object' ? metadata.summary : metadata,
      editingSoftware: Array.isArray(metadata.editingSoftware) ? metadata.editingSoftware.map(String) : [],
      timestampContradiction: metadata.timestampContradiction === true,
      warnings: Array.isArray(metadata.warnings) ? metadata.warnings.map(String) : []
    },
    c2pa: {
      status: normalizeStatus(c2pa.status, ['Valid', 'Absent', 'Invalid', 'Untrusted', 'Unsupported'], 'Unsupported'),
      issuer: String(c2pa.issuer || ''),
      signingTime: String(c2pa.signingTime || ''),
      aiGenerated: c2pa.aiGenerated === true,
      trustedIssuer: c2pa.trustedIssuer === true,
      manifest: c2pa.manifest && typeof c2pa.manifest === 'object' ? c2pa.manifest : null
    },
    digitalSignature: {
      status: normalizeStatus(signature.status, ['Valid', 'Absent', 'Invalid', 'Untrusted', 'Unsupported'], 'Unsupported'),
      issuer: String(signature.issuer || ''),
      trustedIssuer: signature.trustedIssuer === true
    },
    synthId: {
      status: normalizeStatus(synth.status, ['Detected', 'Not Detected', 'Inconclusive', 'Unsupported', 'Not Checked'], 'Not Checked'),
      provider: String(synth.provider || ''),
      detectorVersion: String(synth.detectorVersion || ''),
      officialDetector: synth.officialDetector === true
    },
    pageImages: Array.isArray(value.pageImages) ? value.pageImages : [],
    warnings: Array.isArray(value.warnings) ? value.warnings.map(String) : []
  };
}

function decideProvenanceVerification(screening) {
  const result = normalizeProvenanceResult(screening);
  const reasons = [];
  const warnings = result.metadata.warnings.concat(result.warnings);
  let status = 'Provenance Check Passed — Original Required';
  let trustedAuthenticity = false;

  if (!result.verifierConfigured) reasons.push('PROVENANCE_VERIFIER_UNAVAILABLE');
  if (!result.checksumMatch) reasons.push('FILE_CHANGED_DURING_TRANSFER');
  if (result.c2pa.status === 'Invalid') reasons.push('C2PA_INVALID');
  if (result.c2pa.status === 'Untrusted') reasons.push('C2PA_UNTRUSTED');
  if (result.digitalSignature.status === 'Invalid') reasons.push('DIGITAL_SIGNATURE_INVALID');
  if (result.digitalSignature.status === 'Untrusted') reasons.push('DIGITAL_SIGNATURE_UNTRUSTED');
  if (result.metadata.timestampContradiction) reasons.push('TIMESTAMP_INCONSISTENCY');
  if (result.c2pa.status === 'Valid' && result.c2pa.aiGenerated) reasons.push('AI_PROVENANCE_DETECTED');
  if (result.synthId.status === 'Detected' && result.synthId.officialDetector) reasons.push('AI_PROVENANCE_DETECTED');
  if (result.synthId.status === 'Detected' && !result.synthId.officialDetector) reasons.push('UNTRUSTED_WATERMARK_RESULT');
  if (result.c2pa.status === 'Valid' && result.c2pa.trustedIssuer && !result.c2pa.aiGenerated) trustedAuthenticity = true;
  if (result.digitalSignature.status === 'Valid' && result.digitalSignature.trustedIssuer) trustedAuthenticity = true;

  const uniqueReasons = reasons.filter((reason, index) => reasons.indexOf(reason) === index);
  if (uniqueReasons.length) status = 'Offline Verification Required';
  else if (trustedAuthenticity) status = 'Verified';
  const remarks = status === 'Verified'
    ? 'Trusted issuer provenance was validated.'
    : status === 'Offline Verification Required'
      ? 'Automated provenance checks require review of the original document.'
      : 'No conclusive provenance risk was detected. Please present the original document for final verification.';
  return { status, remarks, reasonCodes: uniqueReasons, warnings, provenance: result };
}

function resolveMarksheetScreeningAttempt(attemptNumber, screening, errorMessage) {
  const attempt = Math.max(1, Number(attemptNumber) || 1);
  if (!errorMessage) return Object.assign({ attempt, retry: false }, decideProvenanceVerification(screening));
  const finalAttempt = attempt >= MARKSHEET_MAX_ATTEMPTS;
  return {
    attempt,
    retry: !finalAttempt,
    status: finalAttempt ? 'Offline Verification Required' : 'Screening Pending',
    remarks: finalAttempt ? 'Automated provenance screening could not complete. Please bring the original 12th marksheet for verification.' : `Automated provenance screening attempt ${attempt} failed and will be retried.`,
    error: String(errorMessage)
  };
}

function invokeProvenanceVerification(blob, student, expectedChecksum, adapters) {
  if (adapters && typeof adapters.provenance === 'function') return adapters.provenance(blob, student, expectedChecksum);
  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty('PROVENANCE_VERIFIER_URL');
  if (!url) return { verifierConfigured: false, checksumMatch: true, c2pa: { status: 'Unsupported' }, digitalSignature: { status: 'Unsupported' }, synthId: { status: 'Not Checked' } };
  const key = properties.getProperty('PROVENANCE_VERIFIER_KEY');
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: key ? { Authorization: `Bearer ${key}` } : {},
    payload: JSON.stringify({ document: { name: blob.getName(), type: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) }, expectedChecksum, applicationId: student.ApplicationID || '' }),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error(`Provenance verifier failed (${code}).`);
  const parsed = JSON.parse(response.getContentText());
  if (!parsed || parsed.success !== true || !parsed.screening) throw new Error('Provenance verifier returned an invalid response.');
  return parsed.screening;
}

function getStudentHeaderMap(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const map = {};
  headers.forEach((header, index) => { if (header) map[header] = index + 1; });
  return map;
}

function setStudentColumns(sheet, rowNumber, columnMap, values) {
  Object.keys(values).forEach(key => { if (columnMap[key]) sheet.getRange(rowNumber, columnMap[key]).setValue(values[key]); });
}

function processPendingMarksheetScreenings(adapters) {
  const lock = adapters && adapters.lock ? adapters.lock : LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { success: false, processed: 0, message: 'Screening worker is already running.' };
  try {
    const sheet = adapters && adapters.sheet ? adapters.sheet : getSheet('Students');
    if (!(adapters && adapters.sheet)) ensureStudentDocumentColumns();
    const map = getStudentHeaderMap(sheet);
    const rows = sheet.getDataRange().getValues();
    let processed = 0;
    for (let i = 1; i < rows.length && processed < MARKSHEET_SCREENING_BATCH_SIZE; i++) {
      if (String(rows[i][map.DocumentStatus - 1] || '').trim() !== 'Screening Pending') continue;
      const attempts = Number(rows[i][map.MarksheetScreeningAttempts - 1] || 0) + 1;
      const student = {};
      Object.keys(map).forEach(key => { student[key] = rows[i][map[key] - 1]; });
      try {
        const fileId = String(student.MarksheetFileId || '').trim();
        if (!fileId) throw new Error('Stored marksheet file is unavailable.');
        const blob = adapters && typeof adapters.getBlob === 'function' ? adapters.getBlob(fileId) : DriveApp.getFileById(fileId).getBlob();
        const retrievedChecksum = sha256Hex(blob.getBytes());
        const expectedChecksum = String(student.MarksheetChecksum || '');
        const raw = invokeProvenanceVerification(blob, student, expectedChecksum, adapters);
        raw.retrievedChecksum = retrievedChecksum;
        raw.checksumMatch = !expectedChecksum || expectedChecksum === retrievedChecksum;
        const decision = decideProvenanceVerification(raw);
        const provenance = decision.provenance;
        setStudentColumns(sheet, i + 1, map, {
          MarksheetScreeningAttempts: attempts,
          MarksheetStatus: decision.status,
          DocumentStatus: decision.status,
          MarksheetRemarks: decision.remarks,
          DocumentRemarks: decision.remarks,
          MarksheetVerificationCheckedAt: new Date(),
          MarksheetVerificationProvider: 'Provenance',
          MarksheetVerificationModel: 'metadata-c2pa-synthid-v1',
          MarksheetVerificationReasons: JSON.stringify(decision.reasonCodes),
          MarksheetRetrievedChecksum: retrievedChecksum,
          MarksheetMetadataSummary: JSON.stringify(provenance.metadata),
          MarksheetC2paStatus: provenance.c2pa.status,
          MarksheetC2paIssuer: provenance.c2pa.issuer,
          MarksheetC2paSigningTime: provenance.c2pa.signingTime,
          MarksheetDigitalSignatureStatus: provenance.digitalSignature.status,
          MarksheetSynthIdStatus: provenance.synthId.status,
          MarksheetSynthIdProvider: provenance.synthId.provider,
          MarksheetSynthIdDetectorVersion: provenance.synthId.detectorVersion
        });
        if (decision.status === 'Offline Verification Required') {
          if (adapters && typeof adapters.notifyOffline === 'function') adapters.notifyOffline(student, decision);
          else sendOfflineVerificationRequiredEmail(student, decision);
        }
      } catch (error) {
        const failure = resolveMarksheetScreeningAttempt(attempts, null, error && error.message || error);
        setStudentColumns(sheet, i + 1, map, {
          MarksheetScreeningAttempts: attempts,
          MarksheetStatus: failure.status,
          DocumentStatus: failure.status,
          MarksheetRemarks: failure.remarks,
          DocumentRemarks: failure.remarks,
          MarksheetVerificationLastError: String(error && error.message || error).slice(0, 500),
          MarksheetVerificationCheckedAt: failure.retry ? '' : new Date()
        });
        if (!failure.retry) {
          if (adapters && typeof adapters.notifyOffline === 'function') adapters.notifyOffline(student, failure);
          else sendOfflineVerificationRequiredEmail(student, failure);
        }
      }
      processed += 1;
    }
    return { success: true, processed };
  } finally {
    lock.releaseLock();
  }
}

function installMarksheetScreeningTrigger() {
  const handler = 'processPendingMarksheetScreenings';
  ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === handler).forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(handler).timeBased().everyMinutes(1).create();
  return { success: true, message: 'Marksheet provenance screening trigger installed.' };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MARKSHEET_MAX_BYTES, MARKSHEET_POLICY_VERSION, detectMarksheetFileType, validateMarksheetBytes, sha256Hex, normalizeProvenanceResult, decideProvenanceVerification, resolveMarksheetScreeningAttempt };
}
