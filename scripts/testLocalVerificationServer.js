const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const { inspectMetadata, screenProvenance } = require('./devServer.js');

async function waitForServer(url) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try { const response = await fetch(url); if (response.ok) return; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Local verification server did not start.');
}

function pngChunk(type, data) {
  const payload = Buffer.from(data);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  return Buffer.concat([length, Buffer.from(type), payload, Buffer.alloc(4)]);
}

function metadataPng() {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('tEXt', Buffer.from('Software\0Adobe Photoshop')), pngChunk('IEND', Buffer.alloc(0))]);
}

async function main() {
  const png = metadataPng();
  const metadata = inspectMetadata({ buffer: png, mimeType: 'image/png', name: 'metadata.png' });
  assert.ok(metadata.editingSoftware.some(value => /photoshop/i.test(value)));

  const trusted = await screenProvenance({ buffer: png, mimeType: 'image/png', name: 'trusted.png' }, crypto.createHash('sha256').update(png).digest('hex'), {
    c2pa: () => ({ status: 'Valid', issuer: 'TEST BOARD', trustedIssuer: true, aiGenerated: false }),
    synthId: async () => ({ status: 'Not Detected', provider: 'Official test detector', detectorVersion: '1', officialDetector: true })
  });
  assert.equal(trusted.checksumMatch, true);
  assert.equal(trusted.c2pa.status, 'Valid');

  const ai = await screenProvenance({ buffer: png, mimeType: 'image/png', name: 'ai.png' }, '', {
    c2pa: () => ({ status: 'Absent', trustedIssuer: false, aiGenerated: false }),
    synthId: async () => ({ status: 'Detected', provider: 'Google SynthID', detectorVersion: '1', officialDetector: true })
  });
  assert.equal(ai.synthId.status, 'Detected');

  const port = 3217;
  const child = spawn(process.execPath, [path.join(__dirname, 'devServer.js')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), C2PATOOL_PATH: '', PDF_RENDERER_PATH: '', SYNTHID_OFFICIAL_VERIFIER_URL: '', SKIP_LOCAL_ENV_FILE: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  try {
    await waitForServer(`http://127.0.0.1:${port}/register.html`);
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Page /Creator (Scanner) >>\nendobj\n%%EOF');
    const expectedChecksum = crypto.createHash('sha256').update(pdf).digest('hex');
    const response = await fetch(`http://127.0.0.1:${port}/api/verify-marksheet`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: { name: 'test.pdf', type: 'application/pdf', data: pdf.toString('base64') }, expectedChecksum })
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.equal(result.screening.checksumMatch, true);
    assert.equal(result.screening.retrievedChecksum, expectedChecksum);
    assert.equal(result.screening.c2pa.status, 'Absent');
    assert.equal(result.screening.synthId.status, 'Not Checked');

    const mismatchResponse = await fetch(`http://127.0.0.1:${port}/api/verify-marksheet`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: { name: 'test.pdf', type: 'application/pdf', data: pdf.toString('base64') }, expectedChecksum: '0'.repeat(64) })
    });
    const mismatch = await mismatchResponse.json();
    assert.equal(mismatch.screening.checksumMatch, false);
    console.log('Local provenance verification server tests passed.');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
  }
  if (stderr) throw new Error(stderr);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
