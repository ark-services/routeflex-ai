"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { encrypt, decrypt } from "@/lib/encryption";
import { logActivityEvent } from "@/lib/activity/logActivityEvent";

// ── helpers ───────────────────────────────────────────────────────────────────

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAdminMembership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string
): Promise<{ userId: string } | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "admin") {
    return { error: "Forbidden" };
  }

  return { userId: user.id };
}

// ── public types ──────────────────────────────────────────────────────────────

export interface SafetyTrainerConnectionData {
  id: string;
  companyId: string;
  trainerName: string;
  trainerEmail: string;
  trainerFedexId: string;
  companyEntityId: string;
  companyName: string;
  /** Never returns the actual base64 data — only presence flag */
  hasSignature: boolean;
  /** Never expose the actual password — only presence flag */
  hasPassword: boolean;
  isEnabled: boolean;
  /** True when all required text fields + signature + password are present */
  isConfigComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── getSafetyTrainerConnection ────────────────────────────────────────────────

export async function getSafetyTrainerConnection(
  companyId: string
): Promise<SafetyTrainerConnectionData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("safety_trainer_connections")
    .select(
      "id, company_id, trainer_name, trainer_email, trainer_fedex_id, company_entity_id, company_name, signature_data_url, encrypted_trainer_password, is_enabled, created_at, updated_at"
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (!data) return null;

  const hasSignature = !!data.signature_data_url;
  const hasPassword  = !!data.encrypted_trainer_password;

  return {
    id: data.id,
    companyId: data.company_id,
    trainerName: data.trainer_name ?? "",
    trainerEmail: data.trainer_email ?? "",
    trainerFedexId: data.trainer_fedex_id ?? "",
    companyEntityId: data.company_entity_id ?? "",
    companyName: data.company_name ?? "",
    hasSignature,
    hasPassword,
    isEnabled: data.is_enabled,
    isConfigComplete:
      !!(data.trainer_name?.trim()) &&
      !!(data.trainer_email?.trim()) &&
      !!(data.trainer_fedex_id?.trim()) &&
      !!(data.company_entity_id?.trim()) &&
      !!(data.company_name?.trim()) &&
      hasSignature &&
      hasPassword,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// ── upsertSafetyTrainerConnection ─────────────────────────────────────────────

export async function upsertSafetyTrainerConnection(
  companyId: string,
  accountId: string,
  fields: {
    trainerName: string;
    trainerEmail: string;
    trainerFedexId: string;
    companyEntityId: string;
    companyName: string;
    /** Pass null to keep the existing signature unchanged; pass a data URL to update it */
    signatureDataUrl: string | null;
    /** Empty string = keep existing password; non-empty = replace */
    trainerPassword: string;
    isEnabled: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const authResult = await requireAdminMembership(supabase, accountId);
    if ("error" in authResult) return { success: false, error: authResult.error };
    const { userId } = authResult;

    const {
      trainerName,
      trainerEmail,
      trainerFedexId,
      companyEntityId,
      companyName,
      signatureDataUrl,
      trainerPassword,
      isEnabled,
    } = fields;

    // Validate required fields
    if (!trainerName.trim())      return { success: false, error: "Trainer Name is required" };
    if (!trainerEmail.trim())     return { success: false, error: "Trainer Email is required" };
    if (!trainerFedexId.trim())   return { success: false, error: "Trainer FedEx ID is required" };
    if (!companyEntityId.trim())  return { success: false, error: "Company Entity ID is required" };
    if (!companyName.trim())      return { success: false, error: "Company Name is required" };

    const svcClient = getServiceClient();

    // Fetch existing row to know what's already stored
    const { data: existing } = await svcClient
      .from("safety_trainer_connections")
      .select("id, is_enabled, signature_data_url, encrypted_trainer_password")
      .eq("company_id", companyId)
      .maybeSingle();

    const isNew = !existing;
    const hasExistingSignature = !!existing?.signature_data_url;
    const hasExistingPassword  = !!existing?.encrypted_trainer_password;

    // Validation when enabling
    if (isEnabled) {
      if (!signatureDataUrl && !hasExistingSignature) {
        return { success: false, error: "A signature is required before enabling the integration" };
      }
      if (!trainerPassword.trim() && !hasExistingPassword) {
        return { success: false, error: "Login password is required before enabling the integration" };
      }
    }

    // Build upsert payload
    const upsertData: Record<string, unknown> = {
      company_id:        companyId,
      trainer_name:      trainerName.trim(),
      trainer_email:     trainerEmail.trim(),
      trainer_fedex_id:  trainerFedexId.trim(),
      company_entity_id: companyEntityId.trim(),
      company_name:      companyName.trim(),
      is_enabled:        isEnabled,
      updated_at:        new Date().toISOString(),
    };

    // Only update signature if a new one was provided
    if (signatureDataUrl !== null) {
      upsertData.signature_data_url = signatureDataUrl;
    }

    // Only update password if a new one was provided
    if (trainerPassword.trim()) {
      upsertData.encrypted_trainer_password = encrypt(trainerPassword.trim());
    }

    const { error: upsertError } = await svcClient
      .from("safety_trainer_connections")
      .upsert(upsertData, { onConflict: "company_id" });

    if (upsertError) {
      console.error("[upsertSafetyTrainerConnection]", upsertError);
      return { success: false, error: "Failed to save Safety Trainer configuration" };
    }

    // Activity log
    let eventType: string;
    let summary: string;
    if (isNew) {
      eventType = "integration.safety_trainer.connected";
      summary = "Safety Trainer Hub integration configured";
    } else if (!isEnabled && existing?.is_enabled) {
      eventType = "integration.safety_trainer.disabled";
      summary = "Safety Trainer Hub integration disabled";
    } else if (isEnabled && !existing?.is_enabled) {
      eventType = "integration.safety_trainer.enabled";
      summary = "Safety Trainer Hub integration enabled";
    } else {
      eventType = "integration.safety_trainer.updated";
      summary = "Safety Trainer Hub integration updated";
    }

    await logActivityEvent(svcClient, {
      companyId,
      actorUserId: userId,
      actorType: "user",
      eventType,
      entityType: "integration",
      summary,
      data: {
        is_enabled:       isEnabled,
        has_trainer_name: !!(trainerName.trim()),
        has_signature:    signatureDataUrl !== null || hasExistingSignature,
        has_password:     !!(trainerPassword.trim()) || hasExistingPassword,
      },
    });

    revalidatePath(`/admin/${accountId}/companies/${companyId}/integrations`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[upsertSafetyTrainerConnection] Error:", err);
    return { success: false, error: msg };
  }
}

// ── updateSafetyTrainerEnabled ────────────────────────────────────────────────

export async function updateSafetyTrainerEnabled(
  companyId: string,
  accountId: string,
  isEnabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const authResult = await requireAdminMembership(supabase, accountId);
    if ("error" in authResult) return { success: false, error: authResult.error };
    const { userId } = authResult;

    const svcClient = getServiceClient();

    if (isEnabled) {
      const { data: row } = await svcClient
        .from("safety_trainer_connections")
        .select(
          "trainer_name, trainer_email, trainer_fedex_id, company_entity_id, company_name, signature_data_url, encrypted_trainer_password"
        )
        .eq("company_id", companyId)
        .maybeSingle();

      if (!row) return { success: false, error: "Safety Trainer connection not found" };

      const missing: string[] = [];
      if (!row.trainer_name?.trim())            missing.push("Trainer Name");
      if (!row.trainer_email?.trim())           missing.push("Trainer Email");
      if (!row.trainer_fedex_id?.trim())        missing.push("Trainer FedEx ID");
      if (!row.company_entity_id?.trim())       missing.push("Company Entity ID");
      if (!row.company_name?.trim())            missing.push("Company Name");
      if (!row.signature_data_url)              missing.push("Signature");
      if (!row.encrypted_trainer_password)      missing.push("Login Password");

      if (missing.length > 0) {
        return {
          success: false,
          error: `Cannot enable: missing — ${missing.join(", ")}. Please edit the configuration first.`,
        };
      }
    }

    const { error } = await svcClient
      .from("safety_trainer_connections")
      .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
      .eq("company_id", companyId);

    if (error) {
      console.error("[updateSafetyTrainerEnabled]", error);
      return { success: false, error: "Failed to update Safety Trainer status" };
    }

    await logActivityEvent(svcClient, {
      companyId,
      actorUserId: userId,
      actorType: "user",
      eventType: isEnabled
        ? "integration.safety_trainer.enabled"
        : "integration.safety_trainer.disabled",
      entityType: "integration",
      summary: `Safety Trainer Hub integration ${isEnabled ? "enabled" : "disabled"}`,
      data: { is_enabled: isEnabled },
    });

    revalidatePath(`/admin/${accountId}/companies/${companyId}/integrations`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[updateSafetyTrainerEnabled] Error:", err);
    return { success: false, error: msg };
  }
}

// ── deleteSafetyTrainerConnection ─────────────────────────────────────────────

export async function deleteSafetyTrainerConnection(
  companyId: string,
  accountId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const authResult = await requireAdminMembership(supabase, accountId);
    if ("error" in authResult) return { success: false, error: authResult.error };
    const { userId } = authResult;

    const svcClient = getServiceClient();

    const { error } = await svcClient
      .from("safety_trainer_connections")
      .delete()
      .eq("company_id", companyId);

    if (error) {
      console.error("[deleteSafetyTrainerConnection]", error);
      return { success: false, error: "Failed to remove Safety Trainer configuration" };
    }

    await logActivityEvent(svcClient, {
      companyId,
      actorUserId: userId,
      actorType: "user",
      eventType: "integration.safety_trainer.disconnected",
      entityType: "integration",
      summary: "Safety Trainer Hub integration disconnected",
      data: {},
    });

    revalidatePath(`/admin/${accountId}/companies/${companyId}/integrations`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[deleteSafetyTrainerConnection] Error:", err);
    return { success: false, error: msg };
  }
}

// ── loadSafetyTrainerConfig (server-side only, for queue processor) ──────────

/**
 * Loads the full config including signature_data_url and decrypted password.
 * Call only from trusted server-side code (cron queue processor).
 * Never expose to the client.
 */
export interface SafetyTrainerConfig {
  trainerName: string;
  trainerEmail: string;
  trainerFedexId: string;
  companyEntityId: string;
  companyName: string;
  signatureDataUrl: string;
  /** Decrypted login password for safetytrainer.kellyandersongroup.com */
  trainerPassword: string;
}

export async function loadSafetyTrainerConfig(
  // Accept any Supabase client (service-role or regular) — type is compatible at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string
): Promise<
  | { ok: true; config: SafetyTrainerConfig }
  | { ok: false; reason: string }
> {
  const { data, error } = await supabase
    .from("safety_trainer_connections")
    .select(
      "trainer_name, trainer_email, trainer_fedex_id, company_entity_id, company_name, signature_data_url, encrypted_trainer_password, is_enabled"
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, reason: "Safety Trainer connection not configured for this company" };
  }
  if (!data.is_enabled) {
    return { ok: false, reason: "Safety Trainer integration is disabled" };
  }

  const missing: string[] = [];
  if (!data.trainer_name?.trim())            missing.push("Trainer Name");
  if (!data.trainer_email?.trim())           missing.push("Trainer Email");
  if (!data.trainer_fedex_id?.trim())        missing.push("Trainer FedEx ID");
  if (!data.company_entity_id?.trim())       missing.push("Company Entity ID");
  if (!data.company_name?.trim())            missing.push("Company Name");
  if (!data.signature_data_url)              missing.push("Signature");
  if (!data.encrypted_trainer_password)      missing.push("Login Password");

  if (missing.length > 0) {
    return { ok: false, reason: `Safety Trainer config incomplete: ${missing.join(", ")}` };
  }

  // Decrypt password
  let trainerPassword: string;
  try {
    trainerPassword = decrypt(data.encrypted_trainer_password!);
  } catch {
    return {
      ok: false,
      reason: "Stored login password could not be decrypted — please re-save the configuration",
    };
  }

  return {
    ok: true,
    config: {
      trainerName:      data.trainer_name!,
      trainerEmail:     data.trainer_email!,
      trainerFedexId:   data.trainer_fedex_id!,
      companyEntityId:  data.company_entity_id!,
      companyName:      data.company_name!,
      signatureDataUrl: data.signature_data_url!,
      trainerPassword,
    },
  };
}
