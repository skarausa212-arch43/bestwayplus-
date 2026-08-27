import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Chrome's HTTP/2 fingerprint (the "Akamai fingerprint"): the SETTINGS it
 * sends, the order it sends them in, and the connection-level WINDOW_UPDATE
 * that follows. Written as
 *   1:65536,2:0,4:6291456,6:262144|15663105|0|m,a,s,p
 * in the usual notation.
 *
 * This has been stable across Chrome milestones for a long time, but it is
 * transcribed rather than derived, so re-check it against a real device when
 * adding a new milestone — the same rule as the Sec-CH-UA brand table.
 */
const CHROME_HTTP2 = {
  settings: {
    HEADER_TABLE_SIZE: 65536,
    ENABLE_PUSH: 0,
    INITIAL_WINDOW_SIZE: 6291456,
    MAX_HEADER_LIST_SIZE: 262144,
  },
  settingsOrder: [
    'HEADER_TABLE_SIZE',
    'ENABLE_PUSH',
    'INITIAL_WINDOW_SIZE',
    'MAX_HEADER_LIST_SIZE',
  ],
  connectionFlow: 15663105,
  // Chrome stopped sending PRIORITY frames and header priority with the
  // RFC 9218 switch; leaving this null keeps the HEADERS frame unweighted.
  headerPriority: null,
};

/** The JSON contract between the Node side and tools/tlsproxy. */
export function buildNetworkProfile(profile, options = {}) {
  const net = profile.net;
  return {
    deviceId: profile.deviceId,
    userAgent: net.userAgent,
    acceptLanguage: net.acceptLanguage,
    accept: net.accept,
    clientHints: net.clientHints,
    headerOrder: net.headerOrder,
    tls: { utls: net.tls.utls, chromeMajor: net.tls.chromeMajor },
    http2: CHROME_HTTP2,
    upstream: options.upstream || net.proxy || '',
  };
}

export async function writeNetworkProfile(profile, path, options = {}) {
  await mkdir(dirname(path), { recursive: true });
  const data = buildNetworkProfile(profile, options);
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8');
  return path;
}

export { CHROME_HTTP2 };
