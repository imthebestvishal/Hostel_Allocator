const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { MARKSHEET_POLICY_VERSION, detectMarksheetFileType, validateMarksheetBytes, sha256Hex, detectSupportedAiProviders, decideProvenanceVerification, resolveMarksheetScreeningAttempt, processPendingMarksheetScreenings, processHistoricalMarksheetMigration, createVerifierRequestSignature, createVerifierCallbackSignature, downloadMarksheetForVerifier } = require('../backend/DocumentVerificationService.js');

const bytes = value => Array.from(Buffer.from(value));
const base = {
  verifierConfigured: true,
  checksumMatch: true,
  metadata: { readable: true, summary: {}, aiGeneratorProviders: [], aiGeneratorMatches: [], c2paPresent: false, warnings: [] },
  c2pa: { status: 'Absent', provider: '', issuer: '', signer: '', claimGenerator: '', aiGenerated: false }
};

assert.equal(MARKSHEET_POLICY_VERSION, 'google-openai-c2pa-auto-verify-v2');
assert.equal(detectMarksheetFileType(bytes('%PDF-1.4')), 'application/pdf');
assert.equal(detectMarksheetFileType([0xff, 0xd8, 0xff, 0xdb]), 'image/jpeg');
assert.equal(detectMarksheetFileType([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png');
assert.throws(() => validateMarksheetBytes([], 'application/pdf'), /empty/i);
assert.throws(() => validateMarksheetBytes(bytes('plain text'), 'application/pdf'), /valid PDF/i);
assert.throws(() => validateMarksheetBytes(bytes('%PDF-1.4\n%%EOF'), 'image/png'), /does not match/i);
assert.equal(validateMarksheetBytes(bytes('%PDF-1.4\n%%EOF'), 'application/pdf').mimeType, 'application/pdf');
assert.equal(sha256Hex(bytes('unchanged')), require('node:crypto').createHash('sha256').update('unchanged').digest('hex'));

global.Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  newBlob: value => ({ getBytes: () => Array.from(Buffer.from(value, 'utf8')) }),
  computeDigest: (_algorithm, value) => Array.from(crypto.createHash('sha256').update(Buffer.from(value)).digest()),
  computeHmacSha256Signature: (value, key) => Array.from(crypto.createHmac('sha256', key).update(value).digest())
};
global.Utilities.base64Encode = value => Buffer.from(value).toString('base64');
const signedPayload = JSON.stringify({ document: { name: 'marksheet.png' } });
const signedTimestamp = '1787600000000';
const signedNonce = 'request-nonce';
const signedBodyHash = crypto.createHash('sha256').update(signedPayload).digest('hex');
assert.equal(createVerifierRequestSignature('shared-secret', signedTimestamp, signedNonce, signedPayload), crypto.createHmac('sha256', 'shared-secret').update(`${signedTimestamp}.${signedNonce}.${signedBodyHash}`).digest('hex'));

const callbackData = { timestamp: String(Date.now()), nonce: 'callback-nonce', fileId: 'file-1', expectedChecksum: sha256Hex(bytes('callback document')), applicationId: 'APP-1' };
callbackData.signature = createVerifierCallbackSignature('shared-secret', callbackData);
const callbackResult = downloadMarksheetForVerifier(callbackData, {
  secret: 'shared-secret', skipReplayCheck: true, skipStudentCheck: true,
  getBlob: () => ({ getBytes: () => bytes('callback document'), getName: () => 'marksheet.pdf', getContentType: () => 'application/pdf' })
});
assert.equal(callbackResult.success, true);
assert.equal(Buffer.from(callbackResult.document.data, 'base64').toString(), 'callback document');
assert.throws(() => downloadMarksheetForVerifier({ ...callbackData, signature: '00'.repeat(32) }, { secret: 'shared-secret', skipReplayCheck: true, skipStudentCheck: true }), /signature is invalid/i);

assert.deepEqual(detectSupportedAiProviders('Gemini and DALL-E'), ['Google', 'OpenAI']);
assert.deepEqual(detectSupportedAiProviders('Adobe Photoshop'), []);

const passed = decideProvenanceVerification(base);
assert.equal(passed.status, 'Verified');
assert.equal(passed.aiProvenanceStatus, 'Passed');
assert.equal(passed.approvalSource, 'Automated C2PA absence check');
assert.ok(passed.explanationCodes.includes('NO_SUPPORTED_GENERATOR_METADATA'));
assert.ok(passed.explanationCodes.includes('C2PA_VERIFICATION_COMPLETED'));
assert.ok(passed.explanationCodes.includes('NO_GOOGLE_OPENAI_C2PA_FOUND'));

for (const provider of ['Google', 'OpenAI']) {
  const metadataDetected = decideProvenanceVerification({ ...base, metadata: { ...base.metadata, aiGeneratorProviders: [provider], summary: { Software: provider } } });
  assert.equal(metadataDetected.status, 'Verified');
  assert.equal(metadataDetected.provider, provider);
  assert.equal(metadataDetected.reasonCodes.includes('GOOGLE_OPENAI_METADATA_DETECTED'), false);
  assert.ok(metadataDetected.explanationCodes.includes('GOOGLE_OPENAI_METADATA_DETECTED'));

  const c2paDetected = decideProvenanceVerification({ ...base, c2pa: { status: 'Valid', provider, issuer: provider, aiGenerated: true } });
  assert.equal(c2paDetected.status, 'Offline Verification Required');
  assert.ok(c2paDetected.reasonCodes.includes('GOOGLE_OPENAI_C2PA_AI_DETECTED'));

  const invalidC2pa = decideProvenanceVerification({ ...base, c2pa: { status: 'Invalid', provider, issuer: provider, aiGenerated: false } });
  assert.equal(invalidC2pa.status, 'Offline Verification Required');
  assert.ok(invalidC2pa.reasonCodes.includes('GOOGLE_OPENAI_C2PA_INVALID'));
}

for (const identity of ['Google AI', 'Gemini', 'Imagen', 'OpenAI', 'ChatGPT', 'DALL-E']) {
  const attributedC2pa = decideProvenanceVerification({ ...base, c2pa: { status: 'Valid', provider: '', issuer: identity, claimGenerator: identity, aiGenerated: true } });
  assert.equal(attributedC2pa.status, 'Offline Verification Required', `${identity} C2PA should require offline verification`);
}
assert.equal(decideProvenanceVerification({ ...base, c2pa: { status: 'Valid', provider: 'Google', issuer: 'Google', aiGenerated: false } }).status, 'Verified');

assert.equal(decideProvenanceVerification({ ...base, verifierConfigured: false, c2pa: { status: 'Unsupported' } }).status, 'AI Check Inconclusive — Manual Approval Required');
assert.equal(decideProvenanceVerification({ ...base, metadata: { ...base.metadata, readable: false } }).status, 'Verified');
assert.equal(decideProvenanceVerification({ ...base, c2pa: { status: 'Valid', provider: '', issuer: 'Other Vendor', aiGenerated: true } }).status, 'Verified');
assert.equal(decideProvenanceVerification({ ...base, c2pa: { status: 'Invalid', provider: '', issuer: 'Other Vendor', aiGenerated: true } }).status, 'AI Check Inconclusive — Manual Approval Required');
assert.equal(decideProvenanceVerification({ ...base, checksumMatch: false }).status, 'Offline Verification Required');
const rawC2paText = decideProvenanceVerification({ ...base, verifierConfigured: false, metadata: { ...base.metadata, c2paPresent: true }, c2pa: { status: 'Unsupported', issuer: 'OpenAI text only', aiGenerated: true } });
assert.ok(!rawC2paText.reasonCodes.includes('GOOGLE_OPENAI_C2PA_AI_DETECTED'));
assert.equal(rawC2paText.status, 'AI Check Inconclusive — Manual Approval Required');

assert.deepEqual([1, 2, 3].map(attempt => resolveMarksheetScreeningAttempt(attempt, null, 'timeout').status), ['Screening Pending', 'Screening Pending', 'AI Check Inconclusive — Manual Approval Required']);
assert.equal(resolveMarksheetScreeningAttempt(2, null, 'timeout').retry, true);
assert.equal(resolveMarksheetScreeningAttempt(3, null, 'malformed result').retry, false);

const workerBytes = bytes('preserved marksheet bytes');
const workerChecksum = sha256Hex(workerBytes);
const workerHeaders = ['ApplicationID', 'EnrollmentNo', 'DocumentStatus', 'DocumentAuditLog', 'MarksheetFileId', 'MarksheetChecksum', 'MarksheetScreeningAttempts', 'MarksheetStatus', 'MarksheetRemarks', 'DocumentRemarks', 'MarksheetVerificationCheckedAt', 'MarksheetVerificationProvider', 'MarksheetVerificationModel', 'MarksheetVerificationReasons', 'MarksheetVerificationExplanationCodes', 'MarksheetVerificationSummary', 'MarksheetAiProvenanceStatus', 'MarksheetAiProvider', 'MarksheetRetrievedChecksum', 'MarksheetMetadataSummary', 'MarksheetMetadataFindings', 'MarksheetC2paStatus', 'MarksheetC2paIssuer', 'MarksheetC2paSigner', 'MarksheetC2paSigningTime', 'MarksheetC2paVerifierVersion', 'MarksheetApprovalSource', 'MarksheetVerificationLastError'];
const workerRows = [workerHeaders, workerHeaders.map(header => ({ ApplicationID: 'APP-1', EnrollmentNo: '1', DocumentStatus: 'Screening Pending', DocumentAuditLog: '[]', MarksheetFileId: 'file-1', MarksheetChecksum: workerChecksum, MarksheetScreeningAttempts: 0 }[header] ?? ''))];
const workerSheet = {
  getLastColumn: () => workerHeaders.length,
  getRange: (row, column) => ({
    getDisplayValues: () => row === 1 ? [workerHeaders] : [[workerRows[row - 1][column - 1]]],
    setValue: value => { workerRows[row - 1][column - 1] = value; }
  }),
  getDataRange: () => ({ getValues: () => workerRows })
};
let offlineNotifications = 0;
const workerResult = processPendingMarksheetScreenings({
  sheet: workerSheet,
  lock: { tryLock: () => true, releaseLock: () => {} },
  getBlob: () => ({ getBytes: () => workerBytes }),
  provenance: () => ({ ...base, c2pa: { ...base.c2pa, verifierVersion: 'test-verifier-1' } }),
  notifyOffline: () => { offlineNotifications += 1; }
});
const workerRecord = Object.fromEntries(workerHeaders.map((header, index) => [header, workerRows[1][index]]));
assert.equal(workerResult.processed, 1);
assert.equal(workerRecord.DocumentStatus, 'Verified');
assert.equal(workerRecord.MarksheetApprovalSource, 'Automated C2PA absence check');
assert.equal(workerRecord.MarksheetC2paVerifierVersion, 'test-verifier-1');
assert.equal(JSON.parse(workerRecord.DocumentAuditLog).at(-1).evidenceSource, 'Automated C2PA absence check');
assert.equal(offlineNotifications, 0);
assert.equal(processPendingMarksheetScreenings({ sheet: workerSheet, lock: { tryLock: () => true, releaseLock: () => {} } }).processed, 0);

const migrationHeaders = ['ApplicationID', 'EnrollmentNo', 'DocumentPolicyVersion', 'DocumentStatus', 'DocumentAuditLog', 'DocumentManualReviewedAt', 'DocumentManualEvidenceSource', 'MarksheetFileId', 'MarksheetStatus', 'MarksheetRemarks', 'DocumentRemarks', 'MarksheetScreeningAttempts', 'MarksheetVerificationCheckedAt', 'MarksheetVerificationLastError', 'MarksheetAiProvenanceStatus', 'MarksheetApprovalSource', 'MarksheetVerificationReasons', 'OfflineVerificationEmailSentAt'];
const migrationRecords = [
  { ApplicationID: 'OLD-1', EnrollmentNo: '119051625', DocumentPolicyVersion: 'marksheet-provenance-v1', DocumentStatus: 'Offline Verification Required', DocumentAuditLog: '[]', MarksheetFileId: 'file-old', MarksheetVerificationReasons: '["PROVENANCE_VERIFIER_UNAVAILABLE"]', OfflineVerificationEmailSentAt: 'already-sent' },
  { ApplicationID: 'MANUAL-1', EnrollmentNo: '2', DocumentPolicyVersion: 'marksheet-provenance-v1', DocumentStatus: 'Offline Verification Required', DocumentAuditLog: '[]', MarksheetFileId: 'file-manual', DocumentManualReviewedAt: '2026-08-25' },
  { ApplicationID: 'VERIFIED-1', EnrollmentNo: '3', DocumentPolicyVersion: MARKSHEET_POLICY_VERSION, DocumentStatus: 'Verified', DocumentAuditLog: '[]', MarksheetFileId: 'file-verified' }
];
const migrationRows = [migrationHeaders, ...migrationRecords.map(record => migrationHeaders.map(header => record[header] ?? ''))];
const migrationSheet = {
  getLastColumn: () => migrationHeaders.length,
  getRange: (row, column) => ({
    getDisplayValues: () => row === 1 ? [migrationHeaders] : [[migrationRows[row - 1][column - 1]]],
    setValue: value => { migrationRows[row - 1][column - 1] = value; }
  }),
  getDataRange: () => ({ getValues: () => migrationRows })
};
const migrationResult = processHistoricalMarksheetMigration({ sheet: migrationSheet, lock: { tryLock: () => true, releaseLock: () => {} }, health: () => ({ ready: true, version: 'test-verifier-1' }) });
const migrated = Object.fromEntries(migrationHeaders.map((header, index) => [header, migrationRows[1][index]]));
assert.equal(migrationResult.processed, 1);
assert.equal(migrated.DocumentPolicyVersion, MARKSHEET_POLICY_VERSION);
assert.equal(migrated.DocumentStatus, 'Screening Pending');
assert.equal(migrated.OfflineVerificationEmailSentAt, 'already-sent');
assert.equal(JSON.parse(migrated.DocumentAuditLog).at(-1).previousStatus, 'Offline Verification Required');
assert.equal(processHistoricalMarksheetMigration({ sheet: migrationSheet, lock: { tryLock: () => true, releaseLock: () => {} }, health: () => ({ ready: true }) }).processed, 0);
assert.equal(migrationRows[2][migrationHeaders.indexOf('DocumentStatus')], 'Offline Verification Required', 'manual decisions must not be migrated');
assert.equal(processHistoricalMarksheetMigration({ sheet: migrationSheet, lock: { tryLock: () => true, releaseLock: () => {} }, health: () => ({ ready: false }) }).success, false);

const root = path.join(__dirname, '..');
const registration = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
assert.equal((registration.match(/type="file"/g) || []).length, 1);
assert.match(registration, /id="marksheet"[^>]*required/);
const allocation = fs.readFileSync(path.join(root, 'backend', 'AllocationEngine.js'), 'utf8');
assert.match(allocation, /documentStatus\)\.toLowerCase\(\) === 'verified'|documentStatus !== 'verified'/i);
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
assert.match(admin, /Google\/OpenAI AI Provenance Check/);
assert.match(admin, /Approve after document review/);
assert.match(admin, /Technical details/);
assert.match(admin, /Historical result — AI provenance not checked/);
assert.match(admin, /Cryptographic C2PA verifier ready/);
assert.match(admin, /getHistoricalMarksheetMigrationStatus/);
assert.match(admin, /studentScreeningRefreshTimer/);
assert.doesNotMatch(admin, /currentDocumentStatus === 'Offline Verification Required' \? 'Detected'/);
assert.doesNotMatch(admin, /Official watermark check/);
const student = fs.readFileSync(path.join(root, 'student.html'), 'utf8');
assert.match(student, /does not confirm that an academic board issued/i);
const dataService = fs.readFileSync(path.join(root, 'backend', 'DataService.js'), 'utf8');
assert.match(dataService, /Administrator Document Review/);
assert.match(dataService, /MarksheetApprovalSource/);
assert.match(dataService, /DocumentAuditLog/);
const verificationService = fs.readFileSync(path.join(root, 'backend', 'DocumentVerificationService.js'), 'utf8');
assert.doesNotMatch(verificationService, /GEMINI_API_KEY|invokeGemini|synthId\s*:|digitalSignature\s*:/);
assert.match(verificationService, /GOOGLE_OPENAI_C2PA_AI_DETECTED/);
assert.match(verificationService, /processHistoricalMarksheetMigration/);
assert.match(verificationService, /X-Verifier-Signature/);

console.log('Google/OpenAI C2PA automatic approval tests passed.');
