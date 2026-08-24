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

function metadataPng(software) {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('tEXt', Buffer.from(`Software\0${software}`)), pngChunk('IEND', Buffer.alloc(0))]);
}

async function main() {
  const openAiPng = metadataPng('OpenAI DALL-E');
  const metadata = inspectMetadata({ buffer: openAiPng, mimeType: 'image/png', name: 'metadata.png' });
  assert.deepEqual(metadata.aiGeneratorProviders, ['OpenAI']);

  const cleanPng = metadataPng('Scanner');
  const clean = await screenProvenance({ buffer: cleanPng, mimeType: 'image/png', name: 'clean.png' }, crypto.createHash('sha256').update(cleanPng).digest('hex'), {
    c2pa: () => ({ status: 'Absent', provider: '', issuer: '', aiGenerated: false })
  });
  assert.equal(clean.checksumMatch, true);
  assert.equal(clean.verifierConfigured, true);
  assert.deepEqual(clean.metadata.aiGeneratorProviders, []);

  const aiC2pa = await screenProvenance({ buffer: cleanPng, mimeType: 'image/png', name: 'ai.png' }, '', {
    c2pa: () => ({ status: 'Valid', provider: 'Google', issuer: 'Google AI', claimGenerator: 'Imagen', aiGenerated: true })
  });
  assert.equal(aiC2pa.c2pa.status, 'Valid');
  assert.equal(aiC2pa.c2pa.provider, 'Google');

  const port = 3217;
  const child = spawn(process.execPath, [path.join(__dirname, 'devServer.js')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), C2PATOOL_PATH: '', SKIP_LOCAL_ENV_FILE: '1' },
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
    assert.equal(result.provider, 'google-openai-c2pa-auto-verify-v2');
    assert.equal(result.screening.checksumMatch, true);
    assert.equal(result.screening.retrievedChecksum, expectedChecksum);
    assert.equal(result.screening.c2pa.status, 'Absent');
    assert.equal(result.screening.verifierConfigured, false);
    assert.equal('synthId' in result.screening, false);
    assert.equal('digitalSignature' in result.screening, false);

    const mismatchResponse = await fetch(`http://127.0.0.1:${port}/api/verify-marksheet`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: { name: 'test.pdf', type: 'application/pdf', data: pdf.toString('base64') }, expectedChecksum: '0'.repeat(64) })
    });
    const mismatch = await mismatchResponse.json();
    assert.equal(mismatch.screening.checksumMatch, false);
    console.log('Local Google/OpenAI metadata and C2PA server tests passed.');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
  }
  if (stderr) throw new Error(stderr);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
