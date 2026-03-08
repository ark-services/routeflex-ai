import { SupabaseClient } from '@supabase/supabase-js';
import dns from 'dns/promises';
import { ActionResult } from './types';

const WEBHOOK_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_024 * 1_024; // 1 MB
const ALLOWED_METHODS = ['POST', 'PUT'];
const BLOCKED_HEADERS = ['host', 'transfer-encoding', 'via', 'forwarded', 'x-forwarded-for', 'x-forwarded-host'];

/**
 * Check whether a single IP address is private/internal.
 */
function isPrivateIp(ip: string): boolean {
  // IPv4-mapped IPv6 (::ffff:x.x.x.x) — extract the IPv4 part
  const v4Mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const addr = v4Mapped ? v4Mapped[1] : ip;

  // IPv6 loopback / unspecified
  if (addr === '::1' || addr === '::') return true;

  // IPv6 unique-local (fc00::/7)
  if (/^f[cd]/i.test(addr)) return true;

  // IPv6 link-local (fe80::/10)
  if (/^fe[89ab]/i.test(addr)) return true;

  // IPv4 checks
  const parts = addr.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p))) return false; // Not valid IPv4 — allow (IPv6 public)

  const [a, b] = parts;
  return (
    a === 0 ||                                          // 0.0.0.0/8
    a === 10 ||                                         // 10.0.0.0/8
    a === 127 ||                                        // 127.0.0.0/8
    (a === 169 && b === 254) ||                         // 169.254.0.0/16 (link-local + cloud metadata)
    (a === 172 && b >= 16 && b <= 31) ||                // 172.16.0.0/12
    (a === 192 && b === 168) ||                         // 192.168.0.0/16
    (a === 100 && b >= 64 && b <= 127) ||               // 100.64.0.0/10 (CGNAT)
    (a === 198 && (b === 18 || b === 19)) ||            // 198.18.0.0/15 (benchmarking)
    a === 255                                           // 255.255.255.255 (broadcast)
  );
}

/**
 * Validate that a webhook URL is safe (not targeting internal infrastructure).
 * Performs DNS resolution to catch DNS rebinding attacks.
 */
export async function isAllowedWebhookUrl(raw: string): Promise<boolean> {
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    const host = parsed.hostname.toLowerCase();

    // Block obvious private hostnames
    if (['localhost', '0.0.0.0'].includes(host)) return false;
    if (host.endsWith('.local') || host.endsWith('.internal')) return false;

    // Cloud metadata hostnames
    if (host === 'metadata.google.internal') return false;

    // If host is an IP literal, check directly
    if (/^[\d.]+$/.test(host) || host.startsWith('[') || host.includes(':')) {
      const cleanIp = host.replace(/^\[|\]$/g, '');
      if (isPrivateIp(cleanIp)) return false;
    }

    // DNS resolution: resolve all IPs and verify they're all public
    try {
      const [v4results, v6results] = await Promise.allSettled([
        dns.resolve4(host),
        dns.resolve6(host),
      ]);

      const ips: string[] = [];
      if (v4results.status === 'fulfilled') ips.push(...v4results.value);
      if (v6results.status === 'fulfilled') ips.push(...v6results.value);

      // If no IPs resolved, block (could be a non-existent domain)
      if (ips.length === 0) return false;

      // All resolved IPs must be public
      for (const ip of ips) {
        if (isPrivateIp(ip)) return false;
      }
    } catch {
      // DNS resolution failed — block
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Strip headers that should not be overridden by user config.
 */
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!BLOCKED_HEADERS.includes(key.toLowerCase())) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Action: webhook
 * Config: { url: text, method?: 'POST'|'PUT', headers?: object }
 */
export async function executeWebhook(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { url, method = 'POST', headers = {} } = config;

  if (!url) {
    return { success: false, error: 'Missing url in config' };
  }

  // Restrict HTTP methods
  const normalizedMethod = String(method).toUpperCase();
  if (!ALLOWED_METHODS.includes(normalizedMethod)) {
    return { success: false, error: `HTTP method "${normalizedMethod}" not allowed. Use POST or PUT.` };
  }

  // SSRF check with DNS resolution
  if (!(await isAllowedWebhookUrl(url))) {
    return { success: false, error: 'Webhook URL targets a blocked address (localhost, private network, or unresolvable host)' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: normalizedMethod,
      headers: {
        'Content-Type': 'application/json',
        ...sanitizeHeaders(headers),
      },
      body: JSON.stringify({
        ...payload,
        automation_metadata: {
          company_id: companyId,
          job_id: jobId,
        },
      }),
      signal: controller.signal,
      redirect: 'manual', // Block redirects that could target internal IPs
    });

    // Read response with size cap to prevent memory exhaustion
    if (response.body) {
      let bytesRead = 0;
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytesRead += value?.byteLength ?? 0;
          if (bytesRead > MAX_RESPONSE_BYTES) {
            reader.cancel();
            break;
          }
        }
      } catch {
        // Ignore read errors — we only care about the status code
      }
    }

    if (!response.ok) {
      return {
        success: false,
        error: `Webhook failed with status ${response.status}`
      };
    }

    return { success: true };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: `Webhook timed out after ${WEBHOOK_TIMEOUT_MS / 1000}s` };
    }
    return { success: false, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}
