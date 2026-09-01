/**
 * Security scan step of the pipeline (23_DEVOPS_INFRASTRUCTURE.md §"No secrets
 * in code"). Fails the build if a committed source file looks like it embeds a
 * live secret. Deliberately dependency-free so it runs anywhere in CI.
 *
 *   node ops/secret-scan.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'data', '.git']);
const SCAN_EXT = new Set(['.js', '.json', '.yml', '.yaml', '.sh', '.env', '.html']);

// Patterns that indicate a real secret, not a placeholder. Kept conservative to
// avoid false positives on the demo's clearly-fake seed password.
const RULES = [
  { name: 'Stripe live secret key', re: /sk_live_[0-9a-zA-Z]{16,}/ },
  { name: 'Stripe live restricted key', re: /rk_live_[0-9a-zA-Z]{16,}/ },
  { name: 'AWS access key id', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'Google API key', re: /AIza[0-9A-Za-z_\-]{35}/ },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { name: 'Generic bearer token assignment', re: /(secret|token|api[_-]?key|password)\s*[:=]\s*['"][A-Za-z0-9_\-]{24,}['"]/i },
];
// Known-safe demo strings (the seed password is intentionally public in docs).
// Documented non-secrets. These are AWS's OWN published SigV4 test vectors —
// the same two strings appear in their signing documentation — and they are what
// ops/backup.test.js checks our signer against. Treating them as credentials
// would push a real test vector out of the repo and leave the signer unverified.
const ALLOW = [
  /cleango123/, /longpassword|averylongpassword/,
  /AKIAIOSFODNN7EXAMPLE/, /wJalrXUtnFEMI\/K7MDENG\/bPxRfiCYEXAMPLEKEY/,
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out); }
    else if (SCAN_EXT.has(path.extname(entry.name))) out.push(path.join(dir, entry.name));
  }
  return out;
}

const findings = [];
for (const file of walk(ROOT)) {
  if (file === __filename) continue;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (ALLOW.some((a) => a.test(line))) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) findings.push({ file: path.relative(ROOT, file), line: i + 1, rule: rule.name });
    }
  });
}

if (findings.length) {
  console.error('✗ Secret scan found potential secrets:');
  for (const f of findings) console.error(`  ${f.file}:${f.line}  [${f.rule}]`);
  process.exit(1);
}
console.log('✓ Secret scan clean — no committed secrets detected.');
