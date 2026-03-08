"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { encrypt, decrypt } from "@/lib/encryption";
import { logActivityEvent } from "@/lib/activity/logActivityEvent";

// ── helpers ───────────────────────────────────────────────────────────────────


function maskSid(sid: string): string {
  if (sid.length <= 8) return "AC••••••••";
  return sid.slice(0, 6) + "••••" + sid.slice(-4);
}

const E164_RE = /^\+[1-9]\d{1,14}$/;

// ── public types ──────────────────────────────────────────────────────────────

export interface TwilioConnectionData {
  id: string;
  companyId: string;
  accountSidMasked: string;
  fromNumber: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── getTwilioConnection ───────────────────────────────────────────────────────

export async function getTwilioConnection(
  companyId: string
): Promise<TwilioConnectionData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("twilio_connections")
    .select(
      "id, company_id, account_sid, from_number, is_enabled, created_at, updated_at"
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    companyId: data.company_id,
    accountSidMasked: maskSid(data.account_sid),
    fromNumber: data.from_number,
    isEnabled: data.is_enabled,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// ── upsertTwilioConnection ────────────────────────────────────────────────────

export async function upsertTwilioConnection(
  companyId: string,
  accountId: string,
  accountSid: string,
  authToken: string,
  fromNumber: string,
  isEnabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    // Verify admin membership
    const { data: membership } = await supabase
      .from("account_memberships")
      .select("role")
      .eq("account_id", accountId)
      .eq("user_id", user.id)
      .single();

    if (!membership || membership.role !== "admin") {
      return { success: false, error: "Forbidden" };
    }

    // Validate phone numbers
    if (!E164_RE.test(fromNumber)) {
      return {
        success: false,
        error: "From number must be in E.164 format (e.g. +15551234567)",
      };
    }
    if (!accountSid.trim()) {
      return { success: false, error: "Account SID is required" };
    }
    if (!authToken.trim()) {
      return { success: false, error: "Auth Token is required" };
    }

    // Validate credentials against Twilio API
    const { validateTwilioCredentials } = await import("@/lib/twilio");
    const valid = await validateTwilioCredentials(accountSid, authToken);
    if (!valid) {
      return {
        success: false,
        error:
          "Invalid Twilio credentials. Please verify your Account SID and Auth Token.",
      };
    }

    const svcClient = createServiceClient();

    // Check for existing row to determine event type
    const { data: existing } = await svcClient
      .from("twilio_connections")
      .select("id, is_enabled")
      .eq("company_id", companyId)
      .maybeSingle();

    const isNew = !existing;

    // Encrypt auth token
    const authTokenEncrypted = encrypt(authToken);

    // Upsert via service role (bypasses RLS — all writes are admin-only)
    const { error: upsertError } = await svcClient
      .from("twilio_connections")
      .upsert(
        {
          company_id: companyId,
          account_sid: accountSid,
          auth_token_encrypted: authTokenEncrypted,
          from_number: fromNumber,
          is_enabled: isEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" }
      );

    if (upsertError) {
      console.error("[upsertTwilioConnection]", upsertError);
      return { success: false, error: "Failed to save Twilio connection" };
    }

    // Determine activity event type
    let eventType: string;
    let summary: string;
    if (isNew) {
      eventType = "integration.twilio.connected";
      summary = "Twilio integration connected";
    } else if (!isEnabled && existing.is_enabled) {
      eventType = "integration.twilio.disabled";
      summary = "Twilio integration disabled";
    } else if (isEnabled && !existing.is_enabled) {
      eventType = "integration.twilio.enabled";
      summary = "Twilio integration enabled";
    } else {
      eventType = "integration.twilio.updated";
      summary = "Twilio integration updated";
    }

    await logActivityEvent(svcClient, {
      companyId,
      actorUserId: user.id,
      actorType: "user",
      eventType,
      entityType: "integration",
      summary,
      data: { from_number: fromNumber, is_enabled: isEnabled },
    });

    revalidatePath(`/admin/${accountId}/integrations`);
    return { success: true };
  } catch (err: any) {
    console.error("[upsertTwilioConnection] Error:", err);
    return { success: false, error: err.message ?? "Unknown error" };
  }
}

// ── updateTwilioEnabled ───────────────────────────────────────────────────────
// Lightweight toggle — does not require re-entering credentials.

export async function updateTwilioEnabled(
  companyId: string,
  accountId: string,
  isEnabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const { data: membership } = await supabase
      .from("account_memberships")
      .select("role")
      .eq("account_id", accountId)
      .eq("user_id", user.id)
      .single();

    if (!membership || membership.role !== "admin") {
      return { success: false, error: "Forbidden" };
    }

    const svcClient = createServiceClient();

    const { error } = await svcClient
      .from("twilio_connections")
      .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
      .eq("company_id", companyId);

    if (error) {
      console.error("[updateTwilioEnabled]", error);
      return { success: false, error: "Failed to update Twilio status" };
    }

    await logActivityEvent(svcClient, {
      companyId,
      actorUserId: user.id,
      actorType: "user",
      eventType: isEnabled
        ? "integration.twilio.enabled"
        : "integration.twilio.disabled",
      entityType: "integration",
      summary: `Twilio integration ${isEnabled ? "enabled" : "disabled"}`,
      data: { is_enabled: isEnabled },
    });

    revalidatePath(`/admin/${accountId}/integrations`);
    return { success: true };
  } catch (err: any) {
    console.error("[updateTwilioEnabled] Error:", err);
    return { success: false, error: err.message ?? "Unknown error" };
  }
}

// ── deleteTwilioConnection ────────────────────────────────────────────────────

export async function deleteTwilioConnection(
  companyId: string,
  accountId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const { data: membership } = await supabase
      .from("account_memberships")
      .select("role")
      .eq("account_id", accountId)
      .eq("user_id", user.id)
      .single();

    if (!membership || membership.role !== "admin") {
      return { success: false, error: "Forbidden" };
    }

    const svcClient = createServiceClient();

    const { error } = await svcClient
      .from("twilio_connections")
      .delete()
      .eq("company_id", companyId);

    if (error) {
      console.error("[deleteTwilioConnection]", error);
      return { success: false, error: "Failed to disconnect Twilio" };
    }

    await logActivityEvent(svcClient, {
      companyId,
      actorUserId: user.id,
      actorType: "user",
      eventType: "integration.twilio.disconnected",
      entityType: "integration",
      summary: "Twilio integration disconnected",
      data: {},
    });

    revalidatePath(`/admin/${accountId}/integrations`);
    return { success: true };
  } catch (err: any) {
    console.error("[deleteTwilioConnection] Error:", err);
    return { success: false, error: err.message ?? "Unknown error" };
  }
}

// ── sendTwilioTestSms ─────────────────────────────────────────────────────────

export async function sendTwilioTestSms(
  companyId: string,
  accountId: string,
  toNumber: string,
  message?: string
): Promise<{ success: boolean; sid?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const { data: membership } = await supabase
      .from("account_memberships")
      .select("role")
      .eq("account_id", accountId)
      .eq("user_id", user.id)
      .single();

    if (!membership || membership.role !== "admin") {
      return { success: false, error: "Forbidden" };
    }

    if (!E164_RE.test(toNumber)) {
      return {
        success: false,
        error: "To number must be in E.164 format (e.g. +15551234567)",
      };
    }

    const svcClient = createServiceClient();

    // Fetch encrypted credentials — never expose to client
    const { data: connection } = await svcClient
      .from("twilio_connections")
      .select("account_sid, auth_token_encrypted, from_number, is_enabled")
      .eq("company_id", companyId)
      .single();

    if (!connection) {
      return { success: false, error: "Twilio is not connected" };
    }
    if (!connection.is_enabled) {
      return { success: false, error: "Twilio integration is disabled" };
    }

    // Decrypt auth token on the server — never leaves the server
    const authToken = decrypt(connection.auth_token_encrypted);

    const { sendSms } = await import("@/lib/twilio");
    const result = await sendSms(
      connection.account_sid,
      authToken,
      connection.from_number,
      toNumber,
      message ?? "RouteFlex test SMS — your Twilio integration is working!"
    );

    // Log result
    if (result.success) {
      await logActivityEvent(svcClient, {
        companyId,
        actorUserId: user.id,
        actorType: "user",
        eventType: "integration.twilio.test_sms.sent",
        entityType: "integration",
        summary: `Twilio test SMS sent to ${toNumber}`,
        data: { to: toNumber, message_sid: result.sid },
      });
    } else {
      await logActivityEvent(svcClient, {
        companyId,
        actorUserId: user.id,
        actorType: "user",
        eventType: "integration.twilio.test_sms.failed",
        entityType: "integration",
        summary: `Twilio test SMS failed: ${result.error}`,
        data: { to: toNumber, error: result.error },
      });
    }

    return result;
  } catch (err: any) {
    console.error("[sendTwilioTestSms] Error:", err);
    return { success: false, error: err.message ?? "Unknown error" };
  }
}
