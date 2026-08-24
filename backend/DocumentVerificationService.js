const MARKSHEET_POLICY_VERSION = 'google-openai-c2pa-auto-verify-v2';
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

function detectSupportedAiProviders(value) {
  let serialized = '';
  try { serialized = typeof value === 'string' ? value : JSON.stringify(value || {}); } catch (error) { serialized = String(value || ''); }
  const providers = [];
  if (/\b(?:google[\s_-]*ai|gemini|imagen|synthid)\b/i.test(serialized)) providers.push('Google');
  if (/\b(?:openai|chatgpt|dall[\s.·_-]*e)\b/i.test(serialized)) providers.push('OpenAI');
  return providers;
}

function explanationForCode(code, provider) {
  const labels = {
    FILE_INTEGRITY_CONFIRMED: 'The stored and retrieved files have matching checksums.',
    FILE_CHANGED_DURING_TRANSFER: 'The retrieved file checksum does not match the stored upload checksum.',
    NO_SUPPORTED_GENERATOR_METADATA: 'No recognized Google or OpenAI generator metadata was found.',
    GOOGLE_OPENAI_METADATA_DETECTED: `${provider || 'Google/OpenAI'} generator metadata was found in the original file.`,
    C2PA_NOT_PRESENT: 'No C2PA manifest was present in the uploaded file.',
    C2PA_VERIFICATION_COMPLETED: 'Cryptographic C2PA verification completed.',
    NO_GOOGLE_OPENAI_C2PA_FOUND: 'No Google/Gemini or OpenAI C2PA provenance was found.',
    NO_SUPPORTED_C2PA_AI_CLAIM: 'No validated Google or OpenAI C2PA AI-generation claim was found.',
    GOOGLE_OPENAI_C2PA_AI_DETECTED: `Validated ${provider || 'Google/OpenAI'} C2PA provenance indicates AI-generated content.`,
    GOOGLE_OPENAI_C2PA_INVALID: `${provider || 'Google/OpenAI'} C2PA provenance is invalid, untrusted, or appears altered.`,
    C2PA_VERIFIER_UNAVAILABLE: 'Cryptographic C2PA verification is unavailable, so the AI check is inconclusive.',
    METADATA_UNREADABLE: 'The document metadata could not be read reliably.',
    UNSUPPORTED_C2PA_PROVIDER: 'The C2PA provider is outside the supported Google/OpenAI check.'
  };
  return labels[code] || String(code || '').replace(/_/g, ' ').toLowerCase();
}

function normalizeProvenanceResult(result) {
  const value = result || {};
  const metadata = value.metadata && typeof value.metadata === 'object' ? value.metadata : {};
  const c2pa = value.c2pa && typeof value.c2pa === 'object' ? value.c2pa : {};
  const metadataProviders = Array.isArray(metadata.aiGeneratorProviders)
    ? metadata.aiGeneratorProviders.map(provider => detectSupportedAiProviders(String(provider))[0] || String(provider)).filter(provider => ['Google', 'OpenAI'].includes(provider))
    : detectSupportedAiProviders(metadata.summary && typeof metadata.summary === 'object' ? metadata.summary : metadata);
  const c2paProvider = String(['Google', 'OpenAI'].includes(c2pa.provider) ? c2pa.provider : (detectSupportedAiProviders([c2pa.provider, c2pa.issuer, c2pa.claimGenerator])[0] || ''));
  return {
    verifierConfigured: value.verifierConfigured === true,
    checksumMatch: value.checksumMatch !== false,
    retrievedChecksum: String(value.retrievedChecksum || ''),
    metadata: {
      summary: metadata.summary && typeof metadata.summary === 'object' ? metadata.summary : metadata,
      readable: metadata.readable !== false,
      aiGeneratorProviders: metadataProviders.filter((provider, index) => metadataProviders.indexOf(provider) === index),
      aiGeneratorMatches: Array.isArray(metadata.aiGeneratorMatches) ? metadata.aiGeneratorMatches.map(String) : [],
      c2paPresent: metadata.c2paPresent === true,
      warnings: Array.isArray(metadata.warnings) ? metadata.warnings.map(String) : []
    },
    c2pa: {
      status: normalizeStatus(c2pa.status, ['Valid', 'Absent', 'Invalid', 'Untrusted', 'Unsupported'], 'Unsupported'),
      provider: ['Google', 'OpenAI'].includes(c2paProvider) ? c2paProvider : '',
      issuer: String(c2pa.issuer || ''),
      signer: String(c2pa.signer || c2pa.issuer || ''),
      claimGenerator: String(c2pa.claimGenerator || ''),
      signingTime: String(c2pa.signingTime || ''),
      verifierVersion: String(c2pa.verifierVersion || value.verifierVersion || ''),
      aiGenerated: c2pa.aiGenerated === true,
      manifest: c2pa.manifest && typeof c2pa.manifest === 'object' ? c2pa.manifest : null
    },
    warnings: Array.isArray(value.warnings) ? value.warnings.map(String) : []
  };
}

function decideProvenanceVerification(screening) {
  const result = normalizeProvenanceResult(screening);
  const reasons = [];
  const inconclusive = [];
  const explanations = [];
  const detectedProviders = result.metadata.aiGeneratorProviders;
  const c2paProvider = result.c2pa.provider;

  explanations.push(result.checksumMatch ? 'FILE_INTEGRITY_CONFIRMED' : 'FILE_CHANGED_DURING_TRANSFER');
  if (!result.checksumMatch) reasons.push('FILE_CHANGED_DURING_TRANSFER');
  if (detectedProviders.length) explanations.push('GOOGLE_OPENAI_METADATA_DETECTED');
  else explanations.push('NO_SUPPORTED_GENERATOR_METADATA');

  if (!result.verifierConfigured) inconclusive.push('C2PA_VERIFIER_UNAVAILABLE');
  if (result.verifierConfigured && result.c2pa.status !== 'Unsupported') explanations.push('C2PA_VERIFICATION_COMPLETED');
  if (result.c2pa.status === 'Absent') explanations.push('C2PA_NOT_PRESENT', 'NO_GOOGLE_OPENAI_C2PA_FOUND');
  if (result.c2pa.status === 'Unsupported') inconclusive.push('C2PA_VERIFIER_UNAVAILABLE');
  if (result.c2pa.status === 'Valid' && !c2paProvider) explanations.push('NO_GOOGLE_OPENAI_C2PA_FOUND');
  if (['Invalid', 'Untrusted'].includes(result.c2pa.status) && !c2paProvider) inconclusive.push('UNSUPPORTED_C2PA_PROVIDER');
  if (['Invalid', 'Untrusted'].includes(result.c2pa.status) && c2paProvider) reasons.push('GOOGLE_OPENAI_C2PA_INVALID');
  if (result.c2pa.status === 'Valid' && c2paProvider) reasons.push('GOOGLE_OPENAI_C2PA_AI_DETECTED');

  const reasonCodes = reasons.filter((reason, index) => reasons.indexOf(reason) === index);
  const inconclusiveCodes = inconclusive.filter((reason, index) => inconclusive.indexOf(reason) === index);
  const explanationCodes = explanations.concat(reasonCodes, inconclusiveCodes).filter((code, index, values) => values.indexOf(code) === index);
  const provider = c2paProvider || detectedProviders[0] || '';
  const status = reasonCodes.length
    ? 'Offline Verification Required'
    : inconclusiveCodes.length
      ? 'AI Check Inconclusive — Manual Approval Required'
      : 'Verified';
  const aiProvenanceStatus = reasonCodes.length ? 'Detected' : inconclusiveCodes.length ? 'Inconclusive' : 'Passed';
  const approvalSource = status === 'Verified' ? 'Automated C2PA absence check' : '';
  const remarks = status === 'Offline Verification Required'
    ? 'Supported Google/OpenAI AI-provenance signals require review of the original document. The application has not been rejected.'
    : status === 'AI Check Inconclusive — Manual Approval Required'
      ? 'The Google/OpenAI AI-provenance check could not complete conclusively. Administrator approval is required.'
      : 'No Google/OpenAI C2PA provenance was found after cryptographic verification. The document was automatically approved under the current policy.';
  const explanationSummary = explanationCodes.map(code => explanationForCode(code, provider));
  return { status, aiProvenanceStatus, provider, approvalSource, remarks, reasonCodes, inconclusiveCodes, explanationCodes, explanationSummary, warnings: result.metadata.warnings.concat(result.warnings), provenance: result };
}

function resolveMarksheetScreeningAttempt(attemptNumber, screening, errorMessage) {
  const attempt = Math.max(1, Number(attemptNumber) || 1);
  if (!errorMessage) return Object.assign({ attempt, retry: false }, decideProvenanceVerification(screening));
  const finalAttempt = attempt >= MARKSHEET_MAX_ATTEMPTS;
  return {
    attempt,
    retry: !finalAttempt,
    status: finalAttempt ? 'AI Check Inconclusive — Manual Approval Required' : 'Screening Pending',
    aiProvenanceStatus: finalAttempt ? 'Inconclusive' : 'Pending',
    remarks: finalAttempt ? 'The Google/OpenAI AI-provenance check could not complete. Administrator approval is required.' : `AI-provenance screening attempt ${attempt} failed and will be retried.`,
    reasonCodes: [],
    inconclusiveCodes: finalAttempt ? ['VERIFICATION_ATTEMPTS_EXHAUSTED'] : [],
    explanationCodes: finalAttempt ? ['VERIFICATION_ATTEMPTS_EXHAUSTED'] : [],
    explanationSummary: finalAttempt ? ['Automated verification could not complete after three attempts.'] : [],
    approvalSource: '',
    error: String(errorMessage)
  };
}

function invokeProvenanceVerification(blob, student, expectedChecksum, adapters) {
  if (adapters && typeof adapters.provenance === 'function') return adapters.provenance(blob, student, expectedChecksum);
  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty('PROVENANCE_VERIFIER_URL');
  if (!url) return { verifierConfigured: false, checksumMatch: true, metadata: { readable: false, summary: {}, c2paPresent: false }, c2pa: { status: 'Unsupported' } };
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
  if (!parsed.screening.c2pa || !['Valid', 'Absent', 'Invalid', 'Untrusted', 'Unsupported'].includes(String(parsed.screening.c2pa.status || ''))) {
    throw new Error('Provenance verifier returned a malformed C2PA result.');
  }
  parsed.screening.verifierConfigured = true;
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

function appendAutomatedApprovalAudit(student, decision) {
  let audit = [];
  try { audit = JSON.parse(String(student.DocumentAuditLog || '[]')); } catch (error) { audit = []; }
  if (!Array.isArray(audit)) audit = [];
  audit.push({
    at: new Date().toISOString(),
    reviewer: 'Automated C2PA worker',
    evidenceSource: decision.approvalSource,
    previousStatus: String(student.DocumentStatus || ''),
    newStatus: 'Verified',
    remarks: decision.remarks
  });
  return JSON.stringify(audit.slice(-50));
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
          MarksheetVerificationProvider: 'Google/OpenAI metadata and C2PA',
          MarksheetVerificationModel: MARKSHEET_POLICY_VERSION,
          MarksheetVerificationReasons: JSON.stringify(decision.reasonCodes),
          MarksheetVerificationExplanationCodes: JSON.stringify(decision.explanationCodes),
          MarksheetVerificationSummary: JSON.stringify(decision.explanationSummary),
          MarksheetAiProvenanceStatus: decision.aiProvenanceStatus,
          MarksheetAiProvider: decision.provider,
          MarksheetRetrievedChecksum: retrievedChecksum,
          MarksheetMetadataSummary: JSON.stringify(provenance.metadata),
          MarksheetMetadataFindings: JSON.stringify(provenance.metadata.aiGeneratorProviders),
          MarksheetC2paStatus: provenance.c2pa.status,
          MarksheetC2paProvider: provenance.c2pa.provider,
          MarksheetC2paIssuer: provenance.c2pa.issuer,
          MarksheetC2paSigner: provenance.c2pa.signer,
          MarksheetC2paSigningTime: provenance.c2pa.signingTime,
          MarksheetC2paVerifierVersion: provenance.c2pa.verifierVersion,
          MarksheetApprovalSource: decision.approvalSource,
          DocumentAuditLog: decision.status === 'Verified' ? appendAutomatedApprovalAudit(student, decision) : String(student.DocumentAuditLog || ''),
          MarksheetVerificationLastError: ''
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
          MarksheetVerificationCheckedAt: failure.retry ? '' : new Date(),
          MarksheetAiProvenanceStatus: failure.aiProvenanceStatus || 'Pending',
          MarksheetVerificationReasons: JSON.stringify(failure.reasonCodes || []),
          MarksheetVerificationExplanationCodes: JSON.stringify(failure.explanationCodes || []),
          MarksheetVerificationSummary: JSON.stringify(failure.explanationSummary || [])
        });
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
  return { success: true, message: 'Google/OpenAI metadata and C2PA screening trigger installed.' };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MARKSHEET_MAX_BYTES, MARKSHEET_POLICY_VERSION, detectMarksheetFileType, validateMarksheetBytes, sha256Hex, detectSupportedAiProviders, normalizeProvenanceResult, decideProvenanceVerification, resolveMarksheetScreeningAttempt, processPendingMarksheetScreenings };
}
