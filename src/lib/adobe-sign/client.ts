/**
 * Adobe Sign (Acrobat Sign) API client utilities.
 *
 * Handles token management (auto-refresh) and provides a typed fetch helper
 * for calling the Adobe Sign REST API v6.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { encrypt, decrypt } from '@/lib/encryption';
import { createServiceClient } from '@/lib/supabase/service';

export interface AdobeSignClient {
  accessToken: string;
  apiAccessPoint: string;
}

/**
 * Get an authenticated Adobe Sign client for a company.
 * Auto-refreshes the access token if it's expired.
 * Returns null if the company has no active connection.
 */
export async function getAdobeSignClient(
  supabase: SupabaseClient,
  companyId: string
): Promise<AdobeSignClient | null> {
  const { data: conn, error } = await supabase
    .from('adobe_sign_connections')
    .select('id, access_token_encrypted, refresh_token_encrypted, token_expiry, api_access_point, client_id_encrypted, client_secret_encrypted')
    .eq('company_id', companyId)
    .is('revoked_at', null)
    .eq('is_enabled', true)
    .not('access_token_encrypted', 'is', null)
    .maybeSingle();

  if (error || !conn) {
    if (error) console.error('[AdobeSign] Failed to fetch connection:', error.message);
    return null;
  }

  let accessToken: string;
  try {
    accessToken = decrypt(conn.access_token_encrypted);
  } catch (err) {
    console.error('[AdobeSign] Failed to decrypt access token:', err);
    return null;
  }

  // Check if token is expired (with 5-minute buffer)
  const isExpired = conn.token_expiry && new Date(conn.token_expiry).getTime() < Date.now() + 5 * 60 * 1000;

  if (isExpired && conn.refresh_token_encrypted) {
    console.log('[AdobeSign] Access token expired, refreshing...');
    const refreshed = await refreshAccessToken(conn);
    if (refreshed) {
      return { accessToken: refreshed, apiAccessPoint: conn.api_access_point };
    }
    // If refresh failed, try the existing token anyway (it might still work briefly)
    console.warn('[AdobeSign] Token refresh failed, attempting with existing token');
  }

  return { accessToken, apiAccessPoint: conn.api_access_point };
}

/**
 * Refresh the access token using the refresh token.
 * Updates the DB with the new encrypted token.
 * Returns the new access token or null on failure.
 */
async function refreshAccessToken(conn: any): Promise<string | null> {
  // Read client credentials from the DB row (stored encrypted per company)
  if (!conn.client_id_encrypted || !conn.client_secret_encrypted) {
    console.error('[AdobeSign] Cannot refresh: company has no saved client credentials');
    return null;
  }

  let clientId: string;
  let clientSecret: string;
  try {
    clientId = decrypt(conn.client_id_encrypted);
    clientSecret = decrypt(conn.client_secret_encrypted);
  } catch (err) {
    console.error('[AdobeSign] Failed to decrypt client credentials:', err);
    return null;
  }

  let refreshToken: string;
  try {
    refreshToken = decrypt(conn.refresh_token_encrypted);
  } catch (err) {
    console.error('[AdobeSign] Failed to decrypt refresh token:', err);
    return null;
  }

  // Use the company's api_access_point for token refresh (required by Adobe Sign)
  const tokenEndpoint = conn.api_access_point
    ? `${conn.api_access_point}oauth/v2/refresh`
    : 'https://api.adobesign.com/oauth/v2/refresh';

  try {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[AdobeSign] Token refresh failed (${response.status}):`, body);
      return null;
    }

    const tokens = await response.json();
    const newAccessToken = tokens.access_token;

    // Calculate new expiry
    const tokenExpiry = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    // Update DB with new encrypted token (service role to bypass RLS)
    const serviceClient = createServiceClient();
    await serviceClient
      .from('adobe_sign_connections')
      .update({
        access_token_encrypted: encrypt(newAccessToken),
        token_expiry: tokenExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conn.id);

    console.log('[AdobeSign] Token refreshed successfully');
    return newAccessToken;
  } catch (err) {
    console.error('[AdobeSign] Token refresh error:', err);
    return null;
  }
}

/**
 * Make an authenticated fetch to the Adobe Sign REST API v6.
 */
export async function adobeSignFetch(
  client: AdobeSignClient,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${client.apiAccessPoint}api/rest/v6${path}`;
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${client.accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

/**
 * List library documents (templates) from Adobe Sign.
 */
export async function listLibraryDocuments(client: AdobeSignClient) {
  const res = await adobeSignFetch(client, '/libraryDocuments');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to list library documents (${res.status}): ${body}`);
  }
  const data = await res.json();
  return data.libraryDocumentList || [];
}

/**
 * Get form fields for a library document.
 */
export async function getLibraryDocumentFields(client: AdobeSignClient, libraryDocumentId: string) {
  const res = await adobeSignFetch(client, `/libraryDocuments/${libraryDocumentId}/formFields`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get form fields (${res.status}): ${body}`);
  }
  return res.json();
}

/**
 * Create an agreement from a library document with merge fields and participant sets.
 */
export async function createAgreement(
  client: AdobeSignClient,
  opts: {
    name: string;
    libraryDocumentId: string;
    participantSetsInfo: Array<{
      memberInfos: Array<{ email: string }>;
      order: number;
      role: 'SIGNER' | 'APPROVER';
    }>;
    mergeFieldInfo?: Array<{ fieldName: string; defaultValue: string }>;
    externalId?: string;
  }
) {
  const body: any = {
    fileInfos: [{ libraryDocumentId: opts.libraryDocumentId }],
    name: opts.name,
    participantSetsInfo: opts.participantSetsInfo,
    signatureType: 'ESIGN',
    state: 'IN_PROCESS',
  };

  if (opts.mergeFieldInfo?.length) {
    body.mergeFieldInfo = opts.mergeFieldInfo;
  }

  if (opts.externalId) {
    body.externalId = { id: opts.externalId };
  }

  const res = await adobeSignFetch(client, '/agreements', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Failed to create agreement (${res.status}): ${errBody}`);
  }

  return res.json();
}

/**
 * Download the combined signed document for an agreement.
 * Returns the PDF as a Buffer.
 */
export async function downloadSignedDocument(
  client: AdobeSignClient,
  agreementId: string
): Promise<Buffer> {
  const res = await adobeSignFetch(client, `/agreements/${agreementId}/combinedDocument`, {
    headers: { 'Accept': 'application/pdf' },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to download signed document (${res.status}): ${body}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Register a webhook with Adobe Sign.
 */
export async function registerWebhook(
  client: AdobeSignClient,
  webhookUrl: string
): Promise<string> {
  const res = await adobeSignFetch(client, '/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      name: 'RouteFlex eSign Webhook',
      scope: 'ACCOUNT',
      state: 'ACTIVE',
      webhookSubscriptionEvents: [
        'AGREEMENT_ACTION_COMPLETED',
        'AGREEMENT_WORKFLOW_COMPLETED',
        'AGREEMENT_EXPIRED',
        'AGREEMENT_RECALLED',
      ],
      webhookUrlInfo: { url: webhookUrl },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to register webhook (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.id;
}
