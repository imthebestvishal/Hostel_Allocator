# GGSIPU C2PA Verifier

The production verifier runs in the existing Vercel project at `api/c2pa-verify.js`. It uses the maintained `@contentauth/c2pa-node` package and never makes a marksheet public or stores a second permanent copy.

## Why the document is not uploaded through the Vercel request

Vercel Functions limit request and response bodies to 4.5 MB. JPEG, PNG, and PDF files are already compressed, and recompressing or converting them can destroy their C2PA manifest. Apps Script therefore sends a small HMAC-signed file reference. The Vercel function calls the deployed Apps Script web app with a second short-lived HMAC request, retrieves the original private Drive bytes in memory, verifies them, and returns only normalized evidence.

The Apps Script callback checks all of the following before returning bytes:

- five-minute timestamp;
- one-time nonce;
- HMAC signature;
- matching application ID and Drive file ID;
- matching stored SHA-256 checksum;
- existing 10 MB maximum.

## Vercel deployment

Create a long random secret locally:

```powershell
$secretBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
$secret = [Convert]::ToHexString($secretBytes).ToLowerInvariant()
$secret
```

Add it to the existing Vercel project as the server-only environment variable `VERIFIER_HMAC_SECRET`, then redeploy the site. Never add the value to source control or frontend code.

After Vercel is deployed, set these Apps Script Properties:

- `PROVENANCE_VERIFIER_URL`: `https://YOUR-SITE.vercel.app/api/c2pa-verify`
- `PROVENANCE_VERIFIER_KEY`: the exact same random secret
- `PROVENANCE_SOURCE_URL`: the current Apps Script `/exec` deployment URL (optional; the script normally discovers its own URL)

Replace the changed Apps Script source files, deploy a new web-app version, and run `installMarksheetScreeningTrigger` once. The installer creates both the screening and historical-migration triggers. Do not run database setup, reset, or seed functions.

## Local tests

```powershell
npm install
npm test
```

The standalone server in `src/server.js` remains only as a local test harness. Google Cloud, Docker, public Drive sharing, and document recompression are not used by production.
