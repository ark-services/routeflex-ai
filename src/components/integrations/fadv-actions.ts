"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { encrypt, decrypt } from "@/lib/encryption";
import { logActivityEvent } from "@/lib/activity/logActivityEvent";
import { performFadvLogin } from "@/lib/fadv/login";

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

export interface FadvConnectionData {
  id: string;
  companyId: string;
  cspId: string;
  companyIdValue: string;
  clientId: string;
  username: string | null;
  hasPassword: boolean;
  hasSecurityAnswer: boolean;
  isEnabled: boolean;
  /** True when all six required fields are present */
  isConfigComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── getFadvConnection ─────────────────────────────────────────────────────────

export async function getFadvConnection(
  companyId: string
): Promise<FadvConnectionData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("fadv_connections")
    .select(
      "id, company_id, csp_id, company_id_value, client_id, username, encrypted_password, encrypted_security_answer, is_enabled, created_at, updated_at"
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (!data) return null;

  const hasPassword = !!data.encrypted_password;
  const hasSecurityAnswer = !!data.encrypted_security_answer;

  return {
    id: data.id,
    companyId: data.company_id,
    cspId: data.csp_id ?? "",
    companyIdValue: data.company_id_value ?? "",
    clientId: data.client_id ?? "",
    username: data.username ?? null,
    hasPassword,
    hasSecurityAnswer,
    isEnabled: data.is_enabled,
    isConfigComplete:
      !!(data.csp_id?.trim()) &&
      !!(data.company_id_value?.trim()) &&
      !!(data.client_id?.trim()) &&
      !!(data.username?.trim()) &&
      hasPassword &&
      hasSecurityAnswer,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// ── upsertFadvConnection ──────────────────────────────────────────────────────

export async function upsertFadvConnection(
  companyId: string,
  accountId: string,
  cspId: string,
  companyIdValue: string,
  clientId: string,
  username: string,
  /** Empty string = "do not change existing password" */
  password: string,
  /** Empty string = "do not change existing security answer" */
  securityAnswer: string,
  isEnabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const authResult = await requireAdminMembership(supabase, accountId);
    if ("error" in authResult) return { success: false, error: authResult.error };
    const { userId } = authResult;

    // ── Always-required fields ──────────────────────────────────────────────
    if (!cspId.trim()) {
      return { success: false, error: "CSP ID is required" };
    }
    if (!companyIdValue.trim()) {
      return { success: false, error: "Company ID is required" };
    }

    const svcClient = getServiceClient();

    // Fetch existing row to know what's already stored
    const { data: existing } = await svcClient
      .from("fadv_connections")
      .select("id, is_enabled, encrypted_password, encrypted_security_answer")
      .eq("company_id", companyId)
      .maybeSingle();

    const isNew = !existing;
    const hasExistingPassword = !!existing?.encrypted_password;
    const hasExistingSecurityAnswer = !!existing?.encrypted_security_answer;

    // ── Additional required fields when enabling ────────────────────────────
    if (isEnabled) {
      if (!clientId.trim()) {
        return { success: false, error: "Client ID is required when the integration is enabled" };
      }
      if (!username.trim()) {
        return { success: false, error: "User ID is required when the integration is enabled" };
      }
      if (!password.trim() && !hasExistingPassword) {
        return { success: false, error: "Password is required when the integration is enabled" };
      }
      if (!securityAnswer.trim() && !hasExistingSecurityAnswer) {
        return { success: false, error: "Security Answer is required when the integration is enabled" };
      }
    }

    // ── Encrypt secrets only if new values were provided ───────────────────
    let encryptedPassword: string | undefined;
    if (password.trim()) {
      encryptedPassword = encrypt(password.trim());
    }

    let encryptedSecurityAnswer: string | undefined;
    if (securityAnswer.trim()) {
      encryptedSecurityAnswer = encrypt(securityAnswer.trim());
    }

    // ── Build upsert payload ───────────────────────────────────────────────
    const upsertData: Record<string, unknown> = {
      company_id:       companyId,
      csp_id:           cspId.trim(),
      company_id_value: companyIdValue.trim(),
      client_id:        clientId.trim(),
      username:         username.trim() || null,
      is_enabled:       isEnabled,
      updated_at:       new Date().toISOString(),
    };

    if (encryptedPassword !== undefined) {
      upsertData.encrypted_password = encryptedPassword;
    }
    if (encryptedSecurityAnswer !== undefined) {
      upsertData.encrypted_security_answer = encryptedSecurityAnswer;
    }

    const { error: upsertError } = await svcClient
      .from("fadv_connections")
      .upsert(upsertData, { onConflict: "company_id" });

    if (upsertError) {
      console.error("[upsertFadvConnection]", upsertError);
      return { success: false, error: "Failed to save FADV connection" };
    }

    // ── Activity log ───────────────────────────────────────────────────────
    const loginConfigComplete =
      !!(cspId.trim()) &&
      !!(companyIdValue.trim()) &&
      !!(clientId.trim()) &&
      !!(username.trim()) &&
      (encryptedPassword !== undefined || hasExistingPassword) &&
      (encryptedSecurityAnswer !== undefined || hasExistingSecurityAnswer);

    let eventType: string;
    let summary: string;
    if (isNew) {
      eventType = "integration.fadv.connected";
      summary = "First Advantage integration configured";
    } else if (!isEnabled && existing.is_enabled) {
      eventType = "integration.fadv.disabled";
      summary = "First Advantage integration disabled";
    } else if (isEnabled && !existing.is_enabled) {
      eventType = "integration.fadv.enabled";
      summary = "First Advantage integration enabled";
    } else {
      eventType = "integration.fadv.updated";
      summary = "First Advantage integration updated";
    }

    await logActivityEvent(svcClient, {
      companyId,
      actorUserId: userId,
      actorType: "user",
      eventType,
      entityType: "integration",
      summary,
      data: {
        is_enabled:            isEnabled,
        login_config_complete: loginConfigComplete,
        has_csp_id:            !!(cspId.trim()),
        has_company_id:        !!(companyIdValue.trim()),
        has_client_id:         !!(clientId.trim()),
        has_username:          !!(username.trim()),
        has_password:          encryptedPassword !== undefined || hasExistingPassword,
        has_security_answer:   encryptedSecurityAnswer !== undefined || hasExistingSecurityAnswer,
      },
    });

    revalidatePath(`/admin/${accountId}/companies/${companyId}/integrations`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[upsertFadvConnection] Error:", err);
    return { success: false, error: msg };
  }
}

// ── updateFadvEnabled ─────────────────────────────────────────────────────────

export async function updateFadvEnabled(
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

    // Validate all required fields before allowing enable
    if (isEnabled) {
      const { data: row } = await svcClient
        .from("fadv_connections")
        .select(
          "csp_id, company_id_value, client_id, username, encrypted_password, encrypted_security_answer"
        )
        .eq("company_id", companyId)
        .maybeSingle();

      if (!row) {
        return { success: false, error: "FADV connection not found" };
      }

      const missing: string[] = [];
      if (!row.csp_id?.trim())           missing.push("CSP ID");
      if (!row.company_id_value?.trim()) missing.push("Company ID");
      if (!row.client_id?.trim())        missing.push("Client ID");
      if (!row.username?.trim())         missing.push("User ID");
      if (!row.encrypted_password)       missing.push("Password");
      if (!row.encrypted_security_answer) missing.push("Security Answer");

      if (missing.length > 0) {
        return {
          success: false,
          error: `Cannot enable: the following required fields are missing — ${missing.join(", ")}. Please edit the configuration first.`,
        };
      }
    }

    const { error } = await svcClient
      .from("fadv_connections")
      .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
      .eq("company_id", companyId);

    if (error) {
      console.error("[updateFadvEnabled]", error);
      return { success: false, error: "Failed to update FADV status" };
    }

    await logActivityEvent(svcClient, {
      companyId,
      actorUserId: userId,
      actorType: "user",
      eventType: isEnabled ? "integration.fadv.enabled" : "integration.fadv.disabled",
      entityType: "integration",
      summary: `First Advantage integration ${isEnabled ? "enabled" : "disabled"}`,
      data: { is_enabled: isEnabled },
    });

    revalidatePath(`/admin/${accountId}/companies/${companyId}/integrations`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[updateFadvEnabled] Error:", err);
    return { success: false, error: msg };
  }
}

// ── deleteFadvConnection ──────────────────────────────────────────────────────

export async function deleteFadvConnection(
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
      .from("fadv_connections")
      .delete()
      .eq("company_id", companyId);

    if (error) {
      console.error("[deleteFadvConnection]", error);
      return { success: false, error: "Failed to disconnect First Advantage" };
    }

    await logActivityEvent(svcClient, {
      companyId,
      actorUserId: userId,
      actorType: "user",
      eventType: "integration.fadv.disconnected",
      entityType: "integration",
      summary: "First Advantage integration disconnected",
      data: {},
    });

    revalidatePath(`/admin/${accountId}/companies/${companyId}/integrations`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[deleteFadvConnection] Error:", err);
    return { success: false, error: msg };
  }
}

// ── testFadvConnection ────────────────────────────────────────────────────────
// Validates all required fields, decrypts credentials, then attempts the
// two-step FADV login to verify the configuration is working end-to-end.

export async function testFadvConnection(
  companyId: string,
  accountId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const supabase = await createClient();
    const authResult = await requireAdminMembership(supabase, accountId);
    if ("error" in authResult) return { success: false, error: authResult.error };
    const { userId } = authResult;

    const svcClient = getServiceClient();

    const { data: connection } = await svcClient
      .from("fadv_connections")
      .select(
        "csp_id, company_id_value, client_id, username, encrypted_password, encrypted_security_answer, is_enabled"
      )
      .eq("company_id", companyId)
      .maybeSingle();

    if (!connection) {
      return { success: false, error: "First Advantage is not configured" };
    }
    if (!connection.is_enabled) {
      return { success: false, error: "First Advantage integration is disabled" };
    }

    // Validate all required fields are present
    const missing: string[] = [];
    if (!connection.csp_id?.trim())            missing.push("CSP ID");
    if (!connection.company_id_value?.trim())  missing.push("Company ID");
    if (!connection.client_id?.trim())         missing.push("Client ID");
    if (!connection.username?.trim())          missing.push("User ID");
    if (!connection.encrypted_password)        missing.push("Password");
    if (!connection.encrypted_security_answer) missing.push("Security Answer");

    if (missing.length > 0) {
      return {
        success: false,
        error: `Missing required fields — please save your configuration: ${missing.join(", ")}`,
      };
    }

    // Decrypt credentials
    let password: string;
    let securityAnswer: string;
    try {
      password = decrypt(connection.encrypted_password!);
    } catch {
      return {
        success: false,
        error: "Stored password could not be decrypted — please re-save credentials",
      };
    }
    try {
      securityAnswer = decrypt(connection.encrypted_security_answer!);
    } catch {
      return {
        success: false,
        error: "Stored security answer could not be decrypted — please re-save credentials",
      };
    }

    // Attempt the two-step login.
    // Pass companyId so session cookies are loaded from (and saved back to) the DB,
    // giving serverless deployments cold-start resilience.
    const loginResult = await performFadvLogin({
      clientId:       connection.client_id!,
      username:       connection.username!,
      password,
      securityAnswer,
      companyId,
    });

    if (!loginResult.success) {
      const errorMessages: Record<string, string> = {
        invalid_credentials:   "Login failed — check your Client ID, User ID, and Password",
        wrong_security_answer: "Security Answer was rejected by FADV",
        captcha_or_mfa:        "Login was blocked by a CAPTCHA or multi-factor challenge",
        network_error:         "Could not reach FADV — check network connectivity",
        config_missing:        "Required login fields are missing",
      };
      // For layout_change and unknown types, include the diagnostic detail
      // from loginResult.message so the user can see the actual error.
      const friendlyMsg = errorMessages[loginResult.errorType];
      const detail = loginResult.message;
      return {
        success: false,
        error: friendlyMsg
          ? `${friendlyMsg}${detail ? ` (${detail})` : ""}`
          : detail || "Unknown FADV error",
      };
    }

    await logActivityEvent(svcClient, {
      companyId,
      actorUserId: userId,
      actorType: "user",
      eventType: "integration.fadv.test_connection",
      entityType: "integration",
      summary: "First Advantage connection test passed",
      data: {
        has_csp_id:     true,
        has_company_id: true,
        has_client_id:  true,
        login_tested:   true,
      },
    });

    return {
      success: true,
      message: `Configuration looks good. CSP ID: ${connection.csp_id}, Company ID: ${connection.company_id_value}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[testFadvConnection] Error:", err);
    return { success: false, error: msg };
  }
}
