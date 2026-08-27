#!/usr/bin/env node
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

import { listDevices, getDevice } from '../profiles/devices.js';
import { LOCALES } from '../profiles/network.js';
import { deriveProfile } from '../src/profile/derive.js';
import { writeNetworkProfile } from '../src/net/profile.js';
import { fingerprint } from '../src/net/tlsproxy.js';
import { launchDevice } from '../src/session.js';
import { verifyDevice, summarize } from '../src/verify/index.js';

const USAGE = `
android device emulator

  andro devices                       list the device database
  andro locales                       list locale presets
  andro profile   <device> [opts]     print the derived profile as JSON
  andro tls       <device> [opts]     print the JA3/JA4 the profile produces
  andro verify    <device> [opts]     launch and check the emulation against itself
  andro open      <device> <url>      open a URL in the emulated device

options
  --locale <tag>        locale preset (default en-US)
  --seed <string>       session seed; same seed => same fingerprint
  --timezone <tz>       override the locale's timezone
  --upstream <url>      upstream proxy: socks5://... or http://user:pass@host:port
  --public-ip <ip>      egress IP, used to pin WebRTC candidates
  --fonts <dir>         directory of Android font files (see tools/fetch-fonts.mjs)
  --profiles-dir <dir>  where per-device state lives (default ./profiles-data)
  --headed              run with a visible window
  --json                machine-readable output
  --verbose             log proxy traffic and injection errors
`.trim();

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function commonOptions(flags) {
  return {
    locale: flags.locale || 'en-US',
    seed: flags.seed || 'default-seed',
    timezone: flags.timezone,
    upstream: flags.upstream || '',
    publicIp: flags['public-ip'] || null,
    fontsDir: flags.fonts || null,
    profilesDir: flags['profiles-dir'] || './profiles-data',
    headless: !flags.headed,
    verbose: !!flags.verbose,
  };
}

function pad(s, n) {
  return String(s).padEnd(n);
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [command, ...rest] = positional;

  switch (command) {
    case 'devices': {
      const rows = listDevices();
      if (flags.json) {
        console.log(JSON.stringify(rows, null, 2));
        return;
      }
      console.log(`${pad('ID', 20)}${pad('FORM', 9)}${pad('CHROME', 8)}NAME`);
      for (const r of rows) {
        const d = getDevice(r.id);
        console.log(`${pad(r.id, 20)}${pad(r.formFactor, 9)}${pad(d.browser.major, 8)}${r.name}`);
      }
      return;
    }

    case 'locales': {
      for (const [tag, l] of Object.entries(LOCALES)) {
        console.log(`${pad(tag, 8)}${pad(l.timezone, 22)}${l.acceptLanguage}`);
      }
      return;
    }

    case 'profile': {
      const deviceId = rest[0];
      if (!deviceId) throw new Error('usage: andro profile <device>');
      const opts = commonOptions(flags);
      const profile = deriveProfile({ deviceId, ...opts });
      console.log(JSON.stringify(profile, null, 2));
      return;
    }

    case 'tls': {
      const deviceId = rest[0];
      if (!deviceId) throw new Error('usage: andro tls <device>');
      const opts = commonOptions(flags);
      const profile = deriveProfile({ deviceId, ...opts });
      const dir = join(opts.profilesDir, `${profile.deviceId}-${profile.seedId}`);
      await mkdir(dir, { recursive: true });
      const path = join(dir, 'network.json');
      await writeNetworkProfile(profile, path, { upstream: opts.upstream });
      const fp = await fingerprint(path, { host: flags.host || 'www.example.com' });
      if (flags.json) {
        console.log(JSON.stringify(fp, null, 2));
      } else {
        process.stdout.write(fp.raw);
      }
      return;
    }

    case 'verify': {
      const deviceId = rest[0];
      if (!deviceId) throw new Error('usage: andro verify <device>');
      const opts = commonOptions(flags);
      const { checks, profile } = await verifyDevice({ deviceId, ...opts });
      const sum = summarize(checks);

      if (flags.json) {
        console.log(JSON.stringify({ device: profile.deviceId, summary: sum, checks }, null, 2));
      } else {
        console.log(`${profile.deviceName}  [${profile.deviceId}]  seed ${profile.seedId}\n`);
        for (const c of checks) {
          if (c.status === 'pass') {
            console.log(`  ok    ${c.name}`);
          } else {
            const mark = c.status === 'warn' ? 'warn' : 'FAIL';
            console.log(`  ${mark}  ${c.name}`);
            console.log(`          got:      ${JSON.stringify(c.actual)}`);
            if (c.expected !== undefined) {
              console.log(`          expected: ${JSON.stringify(c.expected)}`);
            }
            if (c.note && c.note !== c.expected) console.log(`          note:     ${c.note}`);
          }
        }
        console.log(
          `\n${sum.pass}/${sum.total} passed` +
            (sum.warn ? `, ${sum.warn} warning${sum.warn > 1 ? 's' : ''}` : '') +
            (sum.fail ? `, ${sum.fail} FAILED` : '')
        );
      }
      process.exitCode = sum.fail > 0 ? 1 : 0;
      return;
    }

    case 'open': {
      const [deviceId, url] = rest;
      if (!deviceId || !url) throw new Error('usage: andro open <device> <url>');
      const opts = commonOptions(flags);
      const session = await launchDevice({ deviceId, ...opts });
      const page = session.pages[0] || (await session.newPage());
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      console.log(`${session.profile.deviceName} -> ${url}`);
      console.log('Press Ctrl+C to close.');
      await new Promise((resolve) => process.on('SIGINT', resolve));
      await session.close();
      return;
    }

    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
