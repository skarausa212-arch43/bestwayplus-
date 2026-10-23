/**
 * Render the systemd env drop-in from the instance env files.
 *
 *   node deploy/render-env-dropin.js [dir]        # dir defaults to this folder
 *
 * Why this is not three lines of shell: systemd's `Environment=` is NOT a raw
 * copy of the line. It splits on whitespace and applies shell-like quoting, so
 *
 *     Environment=LUMI_SMTP_PASS=my p@ss word
 *
 * sets LUMI_SMTP_PASS=my and then tries to parse `p@ss` and `word` as further
 * assignments — systemd rejects them, logs "Ignoring invalid environment
 * assignment", and the service comes up with a truncated password. The symptom
 * is a 535 that looks exactly like a wrong password, or, when the whole line is
 * dropped, mail silently disabled. Same story for a value containing a quote,
 * and for a trailing CR left by an editor that writes CRLF — the CR travels
 * into the password and the login fails for a reason nothing on screen shows.
 *
 * So: one assignment per line, whole thing quoted, backslashes and quotes
 * escaped, CR stripped, and anything that is not KEY=VALUE skipped rather than
 * allowed to invalidate the file.
 *
 * Sources, later wins: instance.env (tracked) then instance.local.env (secrets).
 */
'use strict';
const fs = require('fs');
const path = require('path');

// systemd unit files understand C-style escapes inside double quotes.
function quote(v) { return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }

function parseEnvFile(file) {
  const out = [];
  let txt;
  try { txt = fs.readFileSync(file, 'utf8'); } catch { return out; }
  for (const rawLine of txt.split('\n')) {
    const line = rawLine.replace(/\r$/, '');            // CRLF files must not poison values
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!m) continue;                                    // junk line — skip, never emit
    let value = m[2].trim();
    // A value the author quoted themselves ("x y" / 'x y') keeps its inner text.
    if (value.length >= 2 && ((value[0] === '"' && value.endsWith('"')) || (value[0] === "'" && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    out.push([m[1], value]);
  }
  return out;
}

function render(dir) {
  const merged = new Map();
  for (const f of ['instance.env', 'instance.local.env']) {
    for (const [k, v] of parseEnvFile(path.join(dir, f))) merged.set(k, v);   // later file wins
  }
  const lines = ['[Service]'];
  for (const [k, v] of merged) lines.push(`Environment=${quote(`${k}=${v}`)}`);
  return lines.join('\n') + '\n';
}

/**
 * Load the instance env the way the RUNNING SERVICE sees it, for ops scripts.
 *
 * This has to be the same merge as render() or the checks lie: systemd keeps the
 * LAST assignment of a key, so an env file holding both an old test key and a
 * new live one below it hands the service the live key. A loader that stops at
 * the first occurrence reports the test key instead — the check then insists
 * "песочница" about a service that is already live. One merge, one answer.
 *
 * A real process env still wins over the files, as it does for the unit.
 */
function loadInstanceEnv(dirs, env = process.env) {
  const seen = [];
  for (const dir of [].concat(dirs)) {
    let any = false;
    const merged = new Map();
    for (const f of ['instance.env', 'instance.local.env']) {
      const p = path.join(dir, f);
      if (!fs.existsSync(p)) continue;
      any = true; seen.push(p);
      for (const [k, v] of parseEnvFile(p)) merged.set(k, v);      // last assignment wins
    }
    if (!any) continue;
    for (const [k, v] of merged) if (env[k] === undefined) env[k] = v;
  }
  return seen;
}

module.exports = { render, parseEnvFile, quote, loadInstanceEnv };

if (require.main === module) {
  process.stdout.write(render(process.argv[2] || __dirname));
}
