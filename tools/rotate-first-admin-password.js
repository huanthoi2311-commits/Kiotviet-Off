/**
 * rotate-first-admin-password.js
 *
 * Purpose (Customer #1 — FIRST_ADMIN_PASSWORD exposure recovery, Phase 2):
 * Rotate the REAL, LIVE first-admin login credential via the running application's own
 * login + self-reset-password API — not by editing backend\.env (that file's value only
 * matters for the one-time bootstrap, which has already run; editing it would not change
 * anything about the live account and would just be a stale record).
 *
 * Deliberately does ZERO file writes. It only reads backend\.env (to get the CURRENT
 * credential to log in with) and makes two HTTP calls to the already-running backend on
 * localhost:3000. No file on disk is modified, so this cannot trigger the "file changed on
 * disk since last read" auto-diff exposure this session has already hit twice.
 *
 * Console output is limited to PASS/FAIL status lines and lengths only — never a credential
 * value, token, or full response body.
 *
 * Usage: node tools/rotate-first-admin-password.js
 */

const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const ENV_PATH = 'C:\\pos-erp\\backend\\.env';
const KNOWN_WEAK_ADMIN_PASSWORDS = new Set([
  'Admin@123',
  'password',
  'Password123',
  'admin123',
  'changeme',
  'change-me-strong-admin-password',
]);

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, rawBody: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function readEnvVar(content, key) {
  const line = content.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  if (!line) return undefined;
  return line.substring(key.length + 1).trim();
}

function generateSecurePassword(length) {
  const chars = [];
  for (let i = 48; i <= 57; i++) chars.push(i); // 0-9
  for (let i = 65; i <= 90; i++) chars.push(i); // A-Z
  for (let i = 97; i <= 122; i++) chars.push(i); // a-z
  const charCount = chars.length;
  const maxValid = 256 - (256 % charCount); // rejection sampling, avoids modulo bias
  let result = '';
  while (result.length < length) {
    const b = crypto.randomBytes(1)[0];
    if (b < maxValid) {
      result += String.fromCharCode(chars[b % charCount]);
    }
  }
  return result;
}

async function main() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error('backend\\.env not found -- aborting, no calls made.');
    process.exit(1);
  }

  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const email = readEnvVar(content, 'FIRST_ADMIN_EMAIL');
  const currentPassword = readEnvVar(content, 'FIRST_ADMIN_PASSWORD');
  const orgSlug = readEnvVar(content, 'FIRST_ADMIN_ORG_SLUG') || 'cua-hang-cua-toi';

  if (!email || !currentPassword) {
    console.error('FIRST_ADMIN_EMAIL/FIRST_ADMIN_PASSWORD missing in backend\\.env -- aborting.');
    process.exit(1);
  }

  console.log('Logging in with current admin credential...');
  const loginRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { organizationSlug: orgSlug, email, password: currentPassword },
  );

  if (loginRes.statusCode !== 200 && loginRes.statusCode !== 201) {
    console.error(`LOGIN: FAIL (status ${loginRes.statusCode})`);
    process.exit(1);
  }
  const token = loginRes.body && loginRes.body.data && loginRes.body.data.accessToken;
  const userId = loginRes.body && loginRes.body.data && loginRes.body.data.userInfo && loginRes.body.data.userInfo.id;
  if (!token || !userId) {
    console.error('LOGIN: FAIL (unexpected response shape)');
    process.exit(1);
  }
  console.log('LOGIN: PASS');

  let newPassword = generateSecurePassword(32);
  while (KNOWN_WEAK_ADMIN_PASSWORDS.has(newPassword)) {
    newPassword = generateSecurePassword(32); // astronomically unlikely, kept for rigor
  }

  console.log('Calling self reset-password...');
  const resetRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: `/api/v1/users/${userId}/reset-password`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    },
    { newPassword },
  );

  if (resetRes.statusCode !== 204 && resetRes.statusCode !== 200) {
    console.error(`RESET-PASSWORD API: FAIL (status ${resetRes.statusCode})`);
    process.exit(1);
  }
  console.log('RESET-PASSWORD API: PASS');

  // resetPassword revokes all sessions -- the old token above is now dead. Confirm the new
  // credential genuinely works with a fresh login, proving live rotation actually took effect.
  console.log('Verifying new credential logs in...');
  const verifyRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { organizationSlug: orgSlug, email, password: newPassword },
  );

  if (verifyRes.statusCode !== 200 && verifyRes.statusCode !== 201) {
    console.error(`NEW PASSWORD LOGIN CHECK: FAIL (status ${verifyRes.statusCode})`);
    process.exit(1);
  }
  console.log('NEW PASSWORD LOGIN CHECK: PASS');

  // Confirm the OLD (leaked) credential no longer works, proving the compromised value is dead.
  console.log('Verifying old credential is revoked...');
  const oldStillWorksRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { organizationSlug: orgSlug, email, password: currentPassword },
  );

  if (oldStillWorksRes.statusCode === 200 || oldStillWorksRes.statusCode === 201) {
    console.error('OLD CREDENTIAL REVOKED CHECK: FAIL (old password still works!)');
    process.exit(1);
  }
  console.log('OLD CREDENTIAL REVOKED CHECK: PASS');

  console.log(`FIRST_ADMIN_PASSWORD: ROTATED (new length=${newPassword.length})`);
  console.log(
    'NOTE: backend\\.env still contains the OLD value as a stale record (deliberately not ' +
      'edited by this script to avoid the file-write leak risk). It has no functional effect ' +
      '-- the live credential now lives only in the database. Update the file separately via ' +
      'the operator out-of-session pattern if a consistent record is wanted.',
  );
  console.log('ROTATION COMPLETE');
}

main().catch((err) => {
  console.error('ROTATION FAILED:', err.message);
  process.exit(1);
});
