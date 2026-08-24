const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 15 * 1024 * 1024;

function loadLocalEnvironment() {
  if (process.env.SKIP_LOCAL_ENV_FILE === '1') return;
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) return;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  });
}

loadLocalEnvironment();

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (error) { reject(new Error('Invalid JSON request.')); }
    });
    request.on('error', reject);
  });
}

function detectFileType(buffer) {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-' && buffer.subarray(Math.max(0, buffer.length - 2048)).toString('ascii').includes('%%EOF')) return 'application/pdf';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(png)) return 'image/png';
  return '';
}

function validateDocument(document) {
  if (!document || !document.data) throw new Error('The marksheet is required.');
  const buffer = Buffer.from(String(document.data), 'base64');
  if (!buffer.length) throw new Error('The marksheet is empty.');
  if (buffer.length > 10 * 1024 * 1024) throw new Error('The marksheet must be 10 MB or smaller.');
  const detected = detectFileType(buffer);
  if (!detected) throw new Error('Upload a valid PDF, JPEG, or PNG marksheet.');
  const declared = String(document.type || '').toLowerCase();
  if (declared && declared !== detected && !(declared === 'image/jpg' && detected === 'image/jpeg')) throw new Error('The file content does not match its declared type.');
  return { buffer, mimeType: detected, name: path.basename(String(document.name || `marksheet.${detected.split('/')[1]}`)) };
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function decodePdfLiteral(value) {
  return String(value || '').replace(/\\([nrtbf()\\])/g, (_, char) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[char] || char)).trim();
}

function collectPdfMetadata(buffer) {
  const text = buffer.toString('latin1');
  const fields = {};
  ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate'].forEach(key => {
    const match = text.match(new RegExp(`/${key}\\s*\\(([^)]{0,1000})\\)`));
    if (match) fields[key] = decodePdfLiteral(match[1]);
  });
  const xmp = text.match(/<\?xpacket[\s\S]{0,200000}?<\/x:xmpmeta>/i);
  if (xmp) fields.XMP = xmp[0];
  const signaturePresent = /\/Type\s*\/Sig\b|\/ByteRange\s*\[/.test(text);
  const c2paPresent = /c2pa|contentauth|\/jumbf?/i.test(text);
  return { fields, signaturePresent, c2paPresent, pageCount: Math.max(1, (text.match(/\/Type\s*\/Page\b/g) || []).length) };
}

function collectJpegMetadata(buffer) {
  const fields = {};
  const chunks = [];
  let offset = 2;
  while (offset + 4 <= buffer.length && buffer[offset] === 0xff) {
    const marker = buffer[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) break;
    if (marker >= 0xe0 && marker <= 0xef || marker === 0xfe) chunks.push(buffer.subarray(offset + 4, offset + 2 + length));
    offset += 2 + length;
  }
  const text = Buffer.concat(chunks).toString('latin1');
  const xmp = text.match(/<\?xpacket[\s\S]*?<\/x:xmpmeta>/i);
  if (xmp) fields.XMP = xmp[0].slice(0, 20000);
  if (/Exif\u0000\u0000/.test(text)) fields.EXIFPresent = true;
  return { fields, c2paPresent: /c2pa|contentauth|jumb/i.test(text) };
}

function collectPngMetadata(buffer) {
  const fields = {};
  let c2paPresent = false;
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    if (offset + 12 + length > buffer.length) break;
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'tEXt') {
      const zero = data.indexOf(0);
      if (zero > 0) fields[data.subarray(0, zero).toString('latin1')] = data.subarray(zero + 1).toString('utf8').slice(0, 20000);
    } else if (type === 'zTXt') {
      const zero = data.indexOf(0);
      try { if (zero > 0) fields[data.subarray(0, zero).toString('latin1')] = zlib.inflateSync(data.subarray(zero + 2)).toString('utf8').slice(0, 20000); } catch (_) {}
    } else if (type === 'iTXt') {
      fields[`iTXt_${Object.keys(fields).length}`] = data.toString('utf8').slice(0, 20000);
    }
    if (/c2pa|contentauth|jumb/i.test(type + data.toString('latin1'))) c2paPresent = true;
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return { fields, c2paPresent };
}

function parseDate(value) {
  if (!value) return null;
  const normalized = String(value).replace(/^D:/, '').replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2}).*$/, '$1-$2-$3T$4:$5:$6Z');
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : null;
}

function extractXmpValue(serialized, name) {
  const attribute = serialized.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  if (attribute) return attribute[1];
  const element = serialized.match(new RegExp(`<${name}[^>]*>([^<]+)</${name}>`, 'i'));
  return element ? element[1] : '';
}

function detectSupportedAiProviders(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {});
  const providers = [];
  if (/\b(?:google[\s_-]*ai|gemini|imagen|synthid)\b/i.test(text)) providers.push('Google');
  if (/\b(?:openai|chatgpt|dall[\s.·_-]*e)\b/i.test(text)) providers.push('OpenAI');
  return providers;
}

function inspectMetadata(file) {
  const raw = file.mimeType === 'application/pdf' ? collectPdfMetadata(file.buffer) : file.mimeType === 'image/jpeg' ? collectJpegMetadata(file.buffer) : collectPngMetadata(file.buffer);
  const serialized = JSON.stringify(raw.fields || {});
  if (raw.fields && !raw.fields.CreatorTool) raw.fields.CreatorTool = extractXmpValue(serialized, 'xmp:CreatorTool');
  if (raw.fields && !raw.fields.CreateDate) raw.fields.CreateDate = extractXmpValue(serialized, 'xmp:CreateDate');
  if (raw.fields && !raw.fields.ModifyDate) raw.fields.ModifyDate = extractXmpValue(serialized, 'xmp:ModifyDate');
  const generatorPattern = /\b(?:google[\s_-]*ai|gemini|imagen|synthid|openai|chatgpt|dall[\s.·_-]*e)\b/ig;
  const aiGeneratorMatches = Array.from(new Set(serialized.match(generatorPattern) || [])).slice(0, 20);
  const aiGeneratorProviders = detectSupportedAiProviders(serialized);
  const warnings = [];
  if (aiGeneratorProviders.length) warnings.push('GOOGLE_OPENAI_GENERATOR_METADATA_DETECTED');
  return { summary: raw.fields || {}, readable: true, aiGeneratorProviders, aiGeneratorMatches, warnings, c2paPresent: raw.c2paPresent === true };
}

function inspectC2pa(file, metadata, adapters = {}) {
  if (typeof adapters.c2pa === 'function') return adapters.c2pa(file, metadata);
  const tool = process.env.C2PATOOL_PATH;
  if (!tool) return { status: metadata.c2paPresent ? 'Unsupported' : 'Absent', provider: '', issuer: '', signer: '', claimGenerator: '', signingTime: '', aiGenerated: false };
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hostel-c2pa-'));
  const target = path.join(tempDir, file.name);
  try {
    fs.writeFileSync(target, file.buffer);
    const run = spawnSync(tool, [target, '--detailed'], { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
    const output = `${run.stdout || ''}\n${run.stderr || ''}`;
    if (run.error) throw run.error;
    if (/No claim found|manifest.*not found/i.test(output)) return { status: 'Absent', provider: '', issuer: '', signer: '', claimGenerator: '', signingTime: '', aiGenerated: false };
    let parsed;
    try { parsed = JSON.parse(run.stdout); } catch (_) { parsed = null; }
    const validationText = JSON.stringify(parsed || output);
    const invalid = /validation[_ -]?(error|failure)|invalid|mismatch/i.test(validationText);
    const untrusted = /untrusted|unknown certificate/i.test(validationText);
    const aiGenerated = /trainedAlgorithmicMedia|generative-ai|ai_generated|digitalSourceType.*algorithm/i.test(validationText);
    const issuer = String(parsed?.signature_info?.issuer || parsed?.issuer || '');
    const claimGenerator = String(parsed?.claim_generator || parsed?.active_manifest?.claim_generator || '');
    const provider = detectSupportedAiProviders(`${issuer} ${claimGenerator} ${invalid || untrusted ? output : ''}`)[0] || '';
    return { status: invalid ? 'Invalid' : untrusted ? 'Untrusted' : 'Valid', provider, issuer, signer: issuer, claimGenerator, signingTime: String(parsed?.signature_info?.time || ''), aiGenerated, manifest: parsed };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function screenProvenance(file, expectedChecksum, adapters = {}) {
  const retrievedChecksum = sha256(file.buffer);
  const metadata = inspectMetadata(file);
  const c2pa = inspectC2pa(file, metadata, adapters);
  const warnings = [];
  if (c2pa.status === 'Unsupported') warnings.push('C2PA_CRYPTOGRAPHIC_VERIFIER_UNAVAILABLE');
  return {
    verifierConfigured: Boolean(process.env.C2PATOOL_PATH || adapters.c2pa),
    retrievedChecksum,
    checksumMatch: !expectedChecksum || expectedChecksum === retrievedChecksum,
    metadata,
    c2pa,
    warnings
  };
}

async function verifyMarksheet(request, response) {
  try {
    const body = await readJsonBody(request);
    const file = validateDocument(body.document);
    const screening = await screenProvenance(file, String(body.expectedChecksum || ''));
    return sendJson(response, 200, { success: true, provider: 'google-openai-metadata-c2pa-v1', screening });
  } catch (error) {
    return sendJson(response, 400, { success: false, error: String(error && error.message || error) });
  }
}

const MIME_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.lottie': 'application/json' };

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  if (!path.extname(pathname)) pathname += '.html';
  const target = path.resolve(ROOT, '.' + pathname);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return sendJson(response, 403, { error: 'Forbidden.' });
  fs.readFile(target, (error, data) => {
    if (error) return sendJson(response, error.code === 'ENOENT' ? 404 : 500, { error: 'Not found.' });
    response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream' });
    response.end(data);
  });
}

function createServer() {
  return http.createServer((request, response) => {
    if (request.method === 'POST' && request.url.split('?')[0] === '/api/verify-marksheet') return verifyMarksheet(request, response);
    if (request.method === 'GET' || request.method === 'HEAD') return serveStatic(request, response);
    return sendJson(response, 405, { error: 'Method not allowed.' });
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`Hostel portal running at http://localhost:${PORT}`);
    console.log(`Google/OpenAI metadata and C2PA screening enabled. C2PA: ${process.env.C2PATOOL_PATH ? 'configured' : 'unsupported'}.`);
  });
}

module.exports = { detectFileType, validateDocument, sha256, detectSupportedAiProviders, inspectMetadata, inspectC2pa, screenProvenance, createServer };
