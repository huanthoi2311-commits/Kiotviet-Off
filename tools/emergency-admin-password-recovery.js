/**
 * emergency-admin-password-recovery.js
 *
 * ARCHITECT-AUTHORIZED, ONE-TIME, AUDITED emergency recovery for the Customer #1 first-admin
 * account, whose password became unknown to everyone after a leak-safe rotation (see
 * PROJECT_HANDOFF.md). The normal reset-password API requires an authenticated session, which
 * nobody can obtain anymore -- confirmed dead this engagement -- so this script performs a direct,
 * narrowly-scoped, audited database update instead, matching exactly what the app's own
 * reset-password service does (hash + persist + revoke sessions + audit log), using the app's own
 * hashing algorithm, verified against the real Prisma schema and repository implementations:
 *   - Argon2PasswordHasher.hash(): argon2.hash(plain, { type: argon2.argon2id }) -- matched exactly.
 *   - User.updatedAt is @updatedAt (Prisma-client-side only, no DB default) -- explicitly set here.
 *   - PrismaSessionRepository.revokeAllForUser(): UPDATE sessions SET "revokedAt" = now() WHERE
 *     "userId" = ? AND "revokedAt" IS NULL -- replicated here, in the same transaction.
 *   - organizations.slug is globally @unique and users has @@unique([organizationId, email]) --
 *     the lookup below is therefore provably deterministic, not just "usually" unique.
 *
 * MUST be run directly by the real account owner, in their own terminal, on the deployment
 * machine, OUTSIDE any AI tool session -- the whole point is that the plaintext password never
 * leaves this one process's memory and never appears in any transcript, log, command history, or
 * argv.
 *
 * Safety properties:
 *  - Displays only non-secret identifying metadata (email/username/org slug/status/platform-admin
 *    flag) and requires an explicit typed confirmation before any mutation.
 *  - Password is entered via local masked input (never echoed, never passed as a CLI argument).
 *  - Hashed with the exact same call the application itself uses (argon2id, backend's own
 *    installed `argon2` package). Defensively verifies the resulting hash contains no character
 *    that could break out of the SQL string literal it's interpolated into, before ever using it.
 *  - The hash (not the plaintext) is piped to `docker compose exec` via stdin -- never appears in
 *    a command line or shell history.
 *  - Scoped to exactly ONE row, matched by both organization slug AND email (both structurally
 *    unique per the schema), and only proceeds if exactly one row is found beforehand.
 *  - The UPDATE, its own affected-row-count check, the session revocation, and the audit insert
 *    all happen in ONE transaction: if any part fails, everything rolls back together -- this
 *    session deliberately couples the audit write to the mutation (stricter than the app's own
 *    normal best-effort audit logging) because an unaudited emergency credential change is worse
 *    than a failed recovery attempt that can simply be retried.
 *  - Writes a real audit_logs row honestly describing this as an emergency/operator recovery, not
 *    disguised as a normal authenticated user.reset_password action.
 *  - Verifies the new password with a real login call before declaring success -- if that check
 *    fails, the account may be left with a password nobody can currently prove works; the script
 *    reports this precisely rather than claiming success.
 *  - Prints ONLY PASS/FAIL status lines. Never the password, never the hash, never a token.
 *
 * Usage: node tools/emergency-admin-password-recovery.js
 */

const path = require('path');
const http = require('http');
const readline = require('readline');
const { spawnSync } = require('child_process');

const argon2 = require(path.join(__dirname, '..', 'backend', 'node_modules', 'argon2'));

const ORG_SLUG = 'cua-hang-cua-toi';
const EMAIL = 'admin@pos-erp.local';
const MIN_PASSWORD_LENGTH = 8;
const KNOWN_WEAK_ADMIN_PASSWORDS = new Set([
  'Admin@123',
  'password',
  'Password123',
  'admin123',
  'changeme',
  'change-me-strong-admin-password',
]);

// Control-code constants (avoids embedding literal escape sequences that can get mangled).
const CODE_ENTER_LF = 10;
const CODE_ENTER_CR = 13;
const CODE_EOF_CTRL_D = 4;
const CODE_INTERRUPT_CTRL_C = 3;
const CODE_BACKSPACE_DEL = 127;
const CODE_BACKSPACE_BS = 8;

function promptMasked(promptText) {
  return new Promise((resolve, reject) => {
    process.stdout.write(promptText);
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error('This script needs an interactive terminal (TTY) to safely mask input.'));
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let input = '';
    const onData = (char) => {
      const code = char.charCodeAt(0);
      if (code === CODE_ENTER_LF || code === CODE_ENTER_CR || code === CODE_EOF_CTRL_D) {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input);
      } else if (code === CODE_INTERRUPT_CTRL_C) {
        process.stdout.write('\n');
        process.exit(1);
      } else if (code === CODE_BACKSPACE_DEL || code === CODE_BACKSPACE_BS) {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        input += char;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

function promptPlain(promptText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
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

function runPsql(sqlText) {
  const result = spawnSync(
    'docker',
    ['compose', '-f', 'docker-compose.yml', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'pos_erp', '-v', 'ON_ERROR_STOP=1', '-t', '-A'],
    { input: sqlText, encoding: 'utf8', cwd: path.join(__dirname, '..') },
  );
  if (result.status !== 0) {
    throw new Error(`psql exited ${result.status}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

/** SQL string literals here only ever carry: UUIDs (hex+dashes), the fixed EMAIL/ORG_SLUG
 * constants above, or an argon2 hash -- validated safe just below. No user-typed value (the
 * password itself) is ever interpolated into SQL. */
function assertSqlSafeLiteral(value, label) {
  if (value.includes("'") || value.includes('\\')) {
    throw new Error(`Refusing to use ${label} in SQL -- contains an unexpected character.`);
  }
}

async function main() {
  console.log(`Looking up exactly one user for organizationSlug=${ORG_SLUG}, email=${EMAIL}...`);
  const lookup = runPsql(
    `SELECT u.id || '|' || u."organizationId" || '|' || u.username || '|' || u."isPlatformAdmin" || '|' || u.status ` +
      `FROM users u JOIN organizations o ON o.id = u."organizationId" ` +
      `WHERE o.slug = '${ORG_SLUG}' AND u.email = '${EMAIL}';`,
  );
  const rows = lookup.split('\n').filter(Boolean);
  if (rows.length !== 1) {
    console.error(`LOOKUP: FAIL (expected exactly 1 matching user, found ${rows.length}) -- aborting, nothing changed.`);
    process.exit(1);
  }
  const [userId, organizationId, username, isPlatformAdmin, status] = rows[0].split('|');
  console.log('LOOKUP: PASS (exactly 1 user matched)');

  console.log('\nTarget account (non-secret identifying metadata only):');
  console.log(`  Organization slug : ${ORG_SLUG}`);
  console.log(`  Email             : ${EMAIL}`);
  console.log(`  Username          : ${username}`);
  console.log(`  Status            : ${status}`);
  console.log(`  Platform Admin    : ${isPlatformAdmin}`);
  const confirmTarget = await promptPlain('\nType YES to confirm this is the correct account to recover: ');
  if (confirmTarget.trim() !== 'YES') {
    console.log('Not confirmed -- aborting, nothing changed.');
    process.exit(1);
  }

  let newPassword;
  let confirmPassword;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    newPassword = await promptMasked(`\nNew password for ${EMAIL} (min ${MIN_PASSWORD_LENGTH} chars): `);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      console.log(`Too short -- needs at least ${MIN_PASSWORD_LENGTH} characters. Try again.`);
      continue;
    }
    if (KNOWN_WEAK_ADMIN_PASSWORDS.has(newPassword)) {
      console.log('That value is a known weak/default password -- choose a different one.');
      continue;
    }
    confirmPassword = await promptMasked('Re-type to confirm: ');
    if (confirmPassword !== newPassword) {
      console.log('Did not match -- try again.');
      continue;
    }
    break;
  }

  console.log("\nHashing locally with the application's own argon2id algorithm...");
  const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
  assertSqlSafeLiteral(passwordHash, 'computed password hash');

  console.log('Writing password hash + revoking sessions + audit record (one transaction)...');
  const auditNewValue = JSON.stringify({
    method: 'emergency_direct_db_recovery',
    reason: 'reset-password API unreachable -- no valid authenticated session existed for this account',
    triggeredVia: 'tools/emergency-admin-password-recovery.js',
  }).replace(/'/g, "''");

  runPsql(`
    BEGIN;

    DO $$
    DECLARE
      affected int;
    BEGIN
      UPDATE users
      SET "passwordHash" = '${passwordHash}', "updatedBy" = '${userId}', "updatedAt" = now()
      WHERE id = '${userId}' AND "organizationId" = '${organizationId}' AND email = '${EMAIL}';
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected != 1 THEN
        RAISE EXCEPTION 'Expected exactly 1 user row updated, got %', affected;
      END IF;
    END $$;

    UPDATE sessions
    SET "revokedAt" = now()
    WHERE "userId" = '${userId}' AND "revokedAt" IS NULL;

    INSERT INTO audit_logs (id, "organizationId", "userId", action, "entityType", "entityId", "newValue", "createdBy", "updatedAt")
    VALUES (gen_random_uuid(), '${organizationId}', '${userId}', 'user.emergency_password_recovery', 'User', '${userId}', '${auditNewValue}'::jsonb, '${userId}', now());

    COMMIT;
  `);
  console.log('DATABASE UPDATE: PASS (password changed, sessions revoked, audit recorded -- atomically)');

  console.log('\nVerifying the new password logs in for real...');
  const loginRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { organizationSlug: ORG_SLUG, email: EMAIL, password: newPassword },
  );

  if (loginRes.statusCode !== 200 && loginRes.statusCode !== 201) {
    console.error(`LOGIN VERIFICATION: FAIL (status ${loginRes.statusCode}) -- the password you chose may not be usable. The database change above already committed; do not assume recovery succeeded until this is resolved.`);
    process.exit(1);
  }
  console.log('LOGIN VERIFICATION: PASS');
  console.log('ADMIN OWNER ACCESS — PASS');
}

main().catch((err) => {
  console.error('EMERGENCY RECOVERY FAILED:', err.message);
  process.exit(1);
});
