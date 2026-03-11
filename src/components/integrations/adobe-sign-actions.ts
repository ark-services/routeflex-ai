"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { encrypt, decrypt } from "@/lib/encryption";
import { revalidatePath } from "next/cache";
import {
  getAdobeSignClient,
  listLibraryDocuments,
  getLibraryDocumentFields,
} from "@/lib/adobe-sign/client";

// ── public types ──────────────────────────────────────────────────────────────

export interface AdobeSignConnectionData {
  id: string;
  companyId: string;
  /** Null when credentials are saved but OAuth hasn't completed yet */
  emailAddress: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  /** First 8 chars of Client ID + "***", so user can confirm which app is configured */
  clientIdMasked: string | null;
  /** True when OAuth has completed and we have an access token */
  isConnected: boolean;
}

export interface EsignTemplateData {
  id: string;
  companyId: string;
  libraryDocumentId: string;
  libraryDocumentName: string;
  displayName: string;
  fieldMappings: FieldMapping[];
  signers: SignerConfig[];
  isEnabled: boolean;
}

export interface FieldMapping {
  adobeFieldName: string;
  source: "column" | "static";
  /** Column name to look up at runtime (resolved per-job) */
  columnName?: string;
  staticValue?: string;
}

export interface SignerConfig {
  order: number;
  role: "SIGNER" | "APPROVER";
  label: string;
  emailSource: "column" | "static" | "applicant_email";
  /** Column name for email lookup (when emailSource="column") */
  columnName?: string;
  staticEmail?: string;
}

// ── getAdobeSignConnection ────────────────────────────────────────────────────

export async function getAdobeSignConnection(
  companyId: string
): Promise<AdobeSignConnectionData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("adobe_sign_connections")
    .select("id, company_id, email_address, is_enabled, created_at, updated_at, client_id_encrypted, access_token_encrypted")
    .eq("company_id", companyId)
    .is("revoked_at", null)
    .maybeSingle();

  if (!data) return null;

  // Mask the client ID: show first 8 chars + ***
  let clientIdMasked: string | null = null;
  if (data.client_id_encrypted) {
    try {
      const clientId = decrypt(data.client_id_encrypted);
      clientIdMasked = clientId.length > 8
        ? `${clientId.slice(0, 8)}***`
        : `${clientId.slice(0, 4)}***`;
    } catch {
      clientIdMasked = "***";
    }
  }

  return {
    id: data.id,
    companyId: data.company_id,
    emailAddress: data.email_address,
    isEnabled: data.is_enabled,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    clientIdMasked,
    isConnected: !!data.access_token_encrypted,
  };
}

// ── saveAdobeSignCredentials ──────────────────────────────────────────────────

/**
 * Save the Adobe Sign OAuth application credentials (Client ID + Secret).
 * Creates or updates the connections row. The OAuth flow must be completed
 * afterward to get an access token.
 */
export async function saveAdobeSignCredentials(
  companyId: string,
  clientId: string,
  clientSecret: string
): Promise<void> {
  if (!clientId.trim() || !clientSecret.trim()) {
    throw new Error("Client ID and Client Secret are required");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const serviceClient = createServiceClient();

  const encryptedClientId = encrypt(clientId.trim());
  const encryptedClientSecret = encrypt(clientSecret.trim());

  // Check if a row already exists (including revoked ones — UNIQUE on company_id)
  const { data: existing } = await serviceClient
    .from("adobe_sign_connections")
    .select("id")
    .eq("company_id", companyId)
    .maybeSingle();

  if (existing) {
    const { error } = await serviceClient
      .from("adobe_sign_connections")
      .update({
        client_id_encrypted: encryptedClientId,
        client_secret_encrypted: encryptedClientSecret,
        revoked_at: null, // un-revoke if previously disconnected
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId);

    if (error) throw new Error(`Failed to save credentials: ${error.message}`);
  } else {
    const { error } = await serviceClient
      .from("adobe_sign_connections")
      .insert({
        company_id: companyId,
        client_id_encrypted: encryptedClientId,
        client_secret_encrypted: encryptedClientSecret,
      });

    if (error) throw new Error(`Failed to save credentials: ${error.message}`);
  }
}

// ── disconnectAdobeSign ───────────────────────────────────────────────────────

export async function disconnectAdobeSign(companyId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const serviceClient = createServiceClient();
  const { error } = await serviceClient
    .from("adobe_sign_connections")
    .update({ revoked_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .is("revoked_at", null);

  if (error) throw new Error(`Disconnect failed: ${error.message}`);
}

// ── updateAdobeSignEnabled ────────────────────────────────────────────────────

export async function updateAdobeSignEnabled(
  companyId: string,
  enabled: boolean
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const serviceClient = createServiceClient();
  const { error } = await serviceClient
    .from("adobe_sign_connections")
    .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .is("revoked_at", null);

  if (error) throw new Error(`Update failed: ${error.message}`);
}

// ── listAdobeSignLibraryDocs ──────────────────────────────────────────────────

export async function listAdobeSignLibraryDocs(companyId: string) {
  const supabase = await createClient();
  const client = await getAdobeSignClient(supabase, companyId);
  if (!client) throw new Error("Adobe Sign not connected");

  const docs = await listLibraryDocuments(client);
  return docs.map((d: any) => ({
    id: d.id,
    name: d.name,
    modifiedDate: d.modifiedDate,
    sharingMode: d.sharingMode,
  }));
}

// ── getLibraryDocFieldsList ───────────────────────────────────────────────────

export async function getLibraryDocFieldsList(
  companyId: string,
  libraryDocumentId: string
) {
  const supabase = await createClient();
  const client = await getAdobeSignClient(supabase, companyId);
  if (!client) throw new Error("Adobe Sign not connected");

  const result = await getLibraryDocumentFields(client, libraryDocumentId);
  // Return simplified field list
  const fields = result.fields || [];
  return fields.map((f: any) => ({
    name: f.name,
    displayLabel: f.displayLabel || f.name,
    inputType: f.inputType,
    required: f.required || false,
  }));
}

// ── getEsignTemplates ─────────────────────────────────────────────────────────

export async function getEsignTemplates(
  companyId: string
): Promise<EsignTemplateData[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("esign_templates")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (!data) return [];

  return data.map((t) => ({
    id: t.id,
    companyId: t.company_id,
    libraryDocumentId: t.library_document_id,
    libraryDocumentName: t.library_document_name,
    displayName: t.display_name,
    fieldMappings: (t.field_mappings || []) as FieldMapping[],
    signers: (t.signers || []) as SignerConfig[],
    isEnabled: t.is_enabled,
  }));
}

// ── saveEsignTemplate ─────────────────────────────────────────────────────────

export async function saveEsignTemplate(
  companyId: string,
  data: {
    id?: string;
    libraryDocumentId: string;
    libraryDocumentName: string;
    displayName: string;
    fieldMappings: FieldMapping[];
    signers: SignerConfig[];
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const serviceClient = createServiceClient();

  if (data.id) {
    // Update existing template
    const { error } = await serviceClient
      .from("esign_templates")
      .update({
        library_document_id: data.libraryDocumentId,
        library_document_name: data.libraryDocumentName,
        display_name: data.displayName,
        field_mappings: data.fieldMappings,
        signers: data.signers,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("company_id", companyId);

    if (error) throw new Error(`Update failed: ${error.message}`);
  } else {
    // Insert new template
    const { error } = await serviceClient.from("esign_templates").insert({
      company_id: companyId,
      library_document_id: data.libraryDocumentId,
      library_document_name: data.libraryDocumentName,
      display_name: data.displayName,
      field_mappings: data.fieldMappings,
      signers: data.signers,
    });

    if (error) throw new Error(`Insert failed: ${error.message}`);
  }

  revalidatePath(`/admin`);
}

// ── deleteEsignTemplate ───────────────────────────────────────────────────────

export async function deleteEsignTemplate(
  companyId: string,
  templateId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const serviceClient = createServiceClient();
  const { error } = await serviceClient
    .from("esign_templates")
    .delete()
    .eq("id", templateId)
    .eq("company_id", companyId);

  if (error) throw new Error(`Delete failed: ${error.message}`);

  revalidatePath(`/admin`);
}
