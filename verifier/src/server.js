import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { screenDocument, verifyRequestSignature, VERIFIER_VERSION } from './provenance.js';

const MAX_REQUEST_BYTES = 16 * 1024 * 1024;

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw Object.assign(new Error('Request payload is too large.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createVerifierServer(options = {}) {
  const secret = options.secret || process.env.VERIFIER_HMAC_SECRET || '';
  const readerFactory = options.readerFactory;
  const replayCache = new Map();
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/healthz') {
      let ready = Boolean(secret);
      let dependency = 'not-checked';
      try {
        if (options.skipDependencyCheck !== true) await import('@contentauth/c2pa-node');
        dependency = 'available';
      } catch (_) {
        ready = false;
        dependency = 'unavailable';
      }
      return sendJson(response, ready ? 200 : 503, { ready, version: VERIFIER_VERSION, dependency });
    }
    if (request.method !== 'POST' || url.pathname !== '/v1/verify') return sendJson(response, 404, { success: false, error: 'Not found.' });
    try {
      const rawBody = await readBody(request);
      const auth = verifyRequestSignature({
        secret,
        timestamp: request.headers['x-verifier-timestamp'],
        nonce: request.headers['x-verifier-nonce'],
        signature: request.headers['x-verifier-signature'],
        rawBody,
        replayCache
      });
      if (!auth.valid) return sendJson(response, 401, { success: false, error: auth.error });
      const input = JSON.parse(rawBody);
      const screening = await screenDocument(input, { readerFactory });
      return sendJson(response, 200, { success: true, provider: 'google-openai-c2pa-auto-verify-v2', screening });
    } catch (error) {
      return sendJson(response, error.statusCode || 400, { success: false, error: String(error && error.message || error).slice(0, 500) });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8080);
  createVerifierServer().listen(port, '0.0.0.0');
}
