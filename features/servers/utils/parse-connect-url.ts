export interface ConnectParams {
  hostname: string;
  ips: string[];
  port: string;
  qrId: string;
  serverId?: string;
  /** Relay base URL (expert-ai-link's HTTP tunnel) — used as the primary pairing
   *  path whenever present, since it works regardless of network topology. */
  relay?: string;
}

// The desktop enumerates EVERY network interface it has (see pi-server's
// connection.rs) — on a real machine that's often a dozen-plus addresses: several
// IPv6 link-local addresses (fe80::...), Windows APIPA junk (169.254.x.x), VPN/
// virtual-adapter addresses, etc. Trying all of them, even one at a time with a
// short timeout each, adds up: 16 addresses x 4s = up to 64s before ever reaching
// a real candidate or the relay fallback — which is exactly the "waiting for
// approval for a minute" symptom. Most of those addresses can never work from a
// phone in the first place:
//   - IPv6 link-local (fe80::/10) requires a zone/scope ID (e.g. fe80::1%eth0) to
//     be reachable at all, which this QR payload never includes — completely
//     unusable as given, not just unlikely.
//   - IPv4 link-local / APIPA (169.254.0.0/16) is Windows' "no DHCP" fallback
//     address, not a real LAN address a phone would ever route to.
// Filtering those out and trying private IPv4 LAN addresses FIRST (the address a
// phone on the same Wi-Fi actually needs) turns "try 16 addresses" into "try the
// 1-2 that could possibly work," which is what makes pairing fast again.
function isUnreachableAddress(ip: string): boolean {
  const lower = ip.toLowerCase();
  return lower.startsWith('fe80:') || lower.startsWith('169.254.');
}

function isPrivateIpv4(ip: string): boolean {
  return (
    /^192\.168\./.test(ip) ||
    /^10\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

/** Filters out addresses that can never be reached from a phone, then sorts the
 *  rest so the most likely-to-work candidates (private IPv4 LAN addresses) are
 *  tried first — private IPv4 > everything else (global IPv6, hostname-style
 *  entries like "localhost") last, since those are unlikely on a phone but not
 *  impossible. Order among equal-priority entries is preserved (stable sort).
 */
function prioritizeCandidates(ips: string[]): string[] {
  const reachable = ips.filter((ip) => !isUnreachableAddress(ip));
  const privateIpv4: string[] = [];
  const rest: string[] = [];
  for (const ip of reachable) {
    (isPrivateIpv4(ip) ? privateIpv4 : rest).push(ip);
  }
  return [...privateIpv4, ...rest];
}

export function parseConnectUrl(url: string): ConnectParams | null {
  try {
    // Handle pi://connect?... format and browser-safe /connect URLs.
    const normalized = url.replace(/^pi:\/\//, 'https://pi.local/');
    const parsed = new URL(normalized);

    if (!parsed.pathname.endsWith('/connect')) return null;

    const hostname = parsed.searchParams.get('hostname') ?? '';
    const ipsRaw = parsed.searchParams.get('ips') ?? '';
    const port = parsed.searchParams.get('port') ?? '5454';
    const qrId = parsed.searchParams.get('qr_id') ?? '';
    const serverId = parsed.searchParams.get('server_id') ?? '';
    const relay = parsed.searchParams.get('relay') ?? '';

    const rawIps = ipsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    // Need a qr_id, and at least ONE way to reach the desktop — either LAN
    // addresses or a relay URL. A relay-only QR (no `ips`) is the internet-pairing
    // case: the phone never has to be on the same network. The QR scanner's
    // doPair() already falls through an empty LAN list straight to the relay.
    if (!qrId) return null;
    if (rawIps.length === 0 && !relay) return null;
    const ips = prioritizeCandidates(rawIps);
    // Every candidate was filtered out as structurally unreachable (e.g. only
    // link-local addresses were offered) — fall back to the unfiltered list
    // rather than pairing with zero candidates.
    const finalIps = ips.length > 0 ? ips : rawIps;

    return {
      hostname,
      ips: finalIps,
      port,
      qrId,
      serverId: serverId || undefined,
      relay: relay || undefined,
    };
  } catch {
    return null;
  }
}

export function buildServerAddress(host: string, port: string): string {
  const needsIpv6Brackets = host.includes(':') && !host.startsWith('[');
  const normalizedHost = needsIpv6Brackets ? `[${host}]` : host;
  return `http://${normalizedHost}:${port}`;
}
