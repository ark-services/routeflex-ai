/**
 * FADV (First Advantage) submission logic.
 *
 * Validates both company-level config (CSP ID, Company ID) and
 * applicant-level fields (package, location, facility_id, position_type)
 * before proceeding to create a subject/order in FADV.
 *
 * Logs distinct activity events for missing-config vs missing-applicant-fields.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";
import { logActivityEvent } from "@/lib/activity/logActivityEvent";
import { performFadvLogin } from "./login";

// ── types ─────────────────────────────────────────────────────────────────────

export interface FadvApplicantFields {
  package: string;
  location: string;
  facility_id: string;
  position_type: string;
}

export interface FadvSubmissionResult {
  success: boolean;
  error?: string;
  /** FADV Subject ID returned on success */
  subjectId?: string;
}

// ── loadFadvConfig ────────────────────────────────────────────────────────────

export async function loadFadvConfig(
  supabase: SupabaseClient,
  companyId: string
): Promise<
  | {
      ok: true;
      cspId: string;
      companyIdValue: string;
      clientId: string;
      username: string | null;
      encryptedPassword: string | null;
      encryptedSecurityAnswer: string | null;
    }
  | { ok: false; reason: string }
> {
  const { data, error } = await supabase
    .from("fadv_connections")
    .select(
      "csp_id, company_id_value, client_id, username, encrypted_password, encrypted_security_answer, is_enabled"
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    console.error("[loadFadvConfig] DB error:", error);
    return { ok: false, reason: "Failed to load FADV configuration" };
  }

  if (!data) {
    return { ok: false, reason: "First Advantage integration is not configured" };
  }

  if (!data.is_enabled) {
    return { ok: false, reason: "First Advantage integration is disabled" };
  }

  if (!data.csp_id?.trim() || !data.company_id_value?.trim()) {
    return {
      ok: false,
      reason: "First Advantage integration not configured (CSP ID / Company ID missing)",
    };
  }

  return {
    ok: true,
    cspId: data.csp_id.trim(),
    companyIdValue: data.company_id_value.trim(),
    clientId: (data.client_id ?? "").trim(),
    username: data.username ?? null,
    encryptedPassword: data.encrypted_password ?? null,
    encryptedSecurityAnswer: data.encrypted_security_answer ?? null,
  };
}

// ── loadApplicantFadvFields ───────────────────────────────────────────────────

export async function loadApplicantFadvFields(
  supabase: SupabaseClient,
  applicantId: string
): Promise<
  | { ok: true; fields: FadvApplicantFields }
  | { ok: false; missing: string[] }
> {
  const { data, error } = await supabase
    .from("applicant_integration_fields")
    .select("fields")
    .eq("applicant_id", applicantId)
    .eq("provider", "fadv")
    .maybeSingle();

  if (error) {
    console.error("[loadApplicantFadvFields] DB error:", error);
    return { ok: false, missing: ["package", "location", "facility_id", "position_type"] };
  }

  const fields = (data?.fields ?? {}) as Record<string, string>;

  const required: Array<keyof FadvApplicantFields> = [
    "package",
    "location",
    "facility_id",
    "position_type",
  ];

  const missing = required.filter(
    (k) => !fields[k] || String(fields[k]).trim() === ""
  );

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return {
    ok: true,
    fields: {
      package:       fields.package.trim(),
      location:      fields.location.trim(),
      facility_id:   fields.facility_id.trim(),
      position_type: fields.position_type.trim(),
    },
  };
}

// ── submitToFadv ──────────────────────────────────────────────────────────────

export async function submitToFadv(
  supabase: SupabaseClient,
  {
    companyId,
    jobId,
    applicantId,
    actorUserId,
  }: {
    companyId: string;
    jobId: string;
    applicantId: string;
    actorUserId?: string | null;
  }
): Promise<FadvSubmissionResult> {
  // ── 1. Load company-level FADV config ──────────────────────────────────────
  const configResult = await loadFadvConfig(supabase, companyId);

  if (!configResult.ok) {
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorUserId: actorUserId ?? null,
      actorType: actorUserId ? "user" : "system",
      eventType: "fadv.submission.missing_company_config",
      entityType: "applicant",
      entityId: applicantId,
      summary: `FADV submission blocked: ${configResult.reason}`,
      data: { applicant_id: applicantId, reason: configResult.reason },
    });

    return { success: false, error: configResult.reason };
  }

  // ── 2. Load applicant row (name, email, phone) ─────────────────────────────
  const { data: applicant, error: appError } = await supabase
    .from("applicants")
    .select("full_name, email, phone")
    .eq("id", applicantId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (appError || !applicant) {
    return {
      success: false,
      error: "Applicant not found or access denied",
    };
  }

  // ── 3. Load applicant-level FADV fields ────────────────────────────────────
  const fieldsResult = await loadApplicantFadvFields(supabase, applicantId);

  if (!fieldsResult.ok) {
    const missingLabels = fieldsResult.missing.map((k) =>
      k === "facility_id"
        ? "Facility ID"
        : k === "position_type"
        ? "Position Type"
        : k.charAt(0).toUpperCase() + k.slice(1)
    );

    const errorMsg = `Missing required applicant fields: ${missingLabels.join(", ")}`;

    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorUserId: actorUserId ?? null,
      actorType: actorUserId ? "user" : "system",
      eventType: "fadv.submission.missing_applicant_fields",
      entityType: "applicant",
      entityId: applicantId,
      summary: `FADV submission blocked: ${errorMsg}`,
      data: {
        applicant_id: applicantId,
        missing_fields: fieldsResult.missing,
      },
    });

    return { success: false, error: errorMsg };
  }

  // ── 4. All required data present — proceed to create subject in FADV ───────
  const { cspId, companyIdValue } = configResult;
  const { fields } = fieldsResult;

  // Parse name
  const nameParts = (applicant.full_name ?? "").trim().split(/\s+/);
  const firstName = nameParts[0] ?? "";
  const lastName = (nameParts.slice(1).join(" ") || nameParts[0]) ?? "";

  console.log("[submitToFadv] Submitting to FADV:", {
    cspId,
    companyIdValue,
    firstName,
    lastName,
    email: applicant.email,
    phone: applicant.phone,
    package: fields.package,
    location: fields.location,
    facilityId: fields.facility_id,
    positionType: fields.position_type,
  });

  // ── 4a. Decrypt login credentials ─────────────────────────────────────────
  let password: string | null = null;
  if (configResult.encryptedPassword) {
    try {
      password = decrypt(configResult.encryptedPassword);
    } catch {
      return { success: false, error: "Failed to decrypt FADV password" };
    }
  }

  let securityAnswer: string | null = null;
  if (configResult.encryptedSecurityAnswer) {
    try {
      securityAnswer = decrypt(configResult.encryptedSecurityAnswer);
    } catch {
      return { success: false, error: "Failed to decrypt FADV security answer" };
    }
  }

  // TODO: Replace with actual FADV API call when credentials are finalized.
  // The FADV "Create Subject" API endpoint and auth mechanism are external
  // and will be wired up separately. The validation and field gathering above
  // is production-ready.
  const fadvResult = await callFadvCreateSubject({
    cspId,
    companyIdValue,
    clientId: configResult.clientId,
    firstName,
    lastName,
    email: applicant.email ?? "",
    phone: applicant.phone ?? "",
    packageCode: fields.package,
    location: fields.location,
    facilityId: fields.facility_id,
    positionType: fields.position_type,
    username: configResult.username,
    password,
    securityAnswer,
  });

  if (!fadvResult.success) {
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorUserId: actorUserId ?? null,
      actorType: actorUserId ? "user" : "system",
      eventType: "fadv.submission.failed",
      entityType: "applicant",
      entityId: applicantId,
      summary: `FADV submission failed: ${fadvResult.error}`,
      data: {
        applicant_id: applicantId,
        error: fadvResult.error,
        csp_id: cspId,
        company_id_value: companyIdValue,
      },
    });

    return { success: false, error: fadvResult.error };
  }

  await logActivityEvent(supabase, {
    companyId,
    jobId,
    actorUserId: actorUserId ?? null,
    actorType: actorUserId ? "user" : "system",
    eventType: "fadv.submission.success",
    entityType: "applicant",
    entityId: applicantId,
    summary: `Applicant sent to First Advantage${fadvResult.subjectId ? ` (Subject ID: ${fadvResult.subjectId})` : ""}`,
    data: {
      applicant_id: applicantId,
      subject_id: fadvResult.subjectId ?? null,
      csp_id: cspId,
      company_id_value: companyIdValue,
      package: fields.package,
      location: fields.location,
      facility_id: fields.facility_id,
      position_type: fields.position_type,
    },
  });

  return { success: true, subjectId: fadvResult.subjectId };
}

// ── callFadvCreateSubject ─────────────────────────────────────────────────────
// Stub for the actual FADV API call. Replace with real implementation
// when the FADV API endpoint and auth scheme are confirmed.

async function callFadvCreateSubject(params: {
  cspId: string;
  companyIdValue: string;
  clientId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  packageCode: string;
  location: string;
  facilityId: string;
  positionType: string;
  username: string | null;
  /** Decrypted password — NEVER log this value */
  password: string | null;
  /** Decrypted security answer — NEVER log this value */
  securityAnswer: string | null;
}): Promise<{ success: boolean; subjectId?: string; error?: string }> {
  // ── Step 1: Login via two-step flow ────────────────────────────────────────
  if (params.clientId && params.username && params.password && params.securityAnswer) {
    const loginResult = await performFadvLogin({
      clientId:       params.clientId,
      username:       params.username,
      password:       params.password,
      securityAnswer: params.securityAnswer,
    });

    if (!loginResult.success) {
      return { success: false, error: `FADV login failed: ${loginResult.message}` };
    }
  }

  // ── Step 2: Submit Create Subject request ──────────────────────────────────
  // TODO: implement real FADV Create Subject API call using the session from login.
  // Example structure (FADV XML/SOAP or REST — confirm with FADV):
  //
  //   const response = await fetch(FADV_API_URL, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/xml', Cookie: loginResult.sessionCookie },
  //     body: buildFadvXml(params),
  //   });
  //   if (!response.ok) return { success: false, error: await response.text() };
  //   const subjectId = parseSubjectIdFromResponse(await response.text());
  //   return { success: true, subjectId };

  console.warn(
    "[callFadvCreateSubject] FADV Create Subject API not yet implemented. Would have submitted:",
    {
      cspId: params.cspId,
      companyIdValue: params.companyIdValue,
      clientId: params.clientId,
      username: params.username,
      // password + securityAnswer intentionally NOT logged
      applicant: `${params.firstName} ${params.lastName}`,
      package: params.packageCode,
      location: params.location,
      facilityId: params.facilityId,
      positionType: params.positionType,
    }
  );

  // Return a mock success so the validation + logging pipeline is exercisable
  return {
    success: true,
    subjectId: `FADV-STUB-${Date.now()}`,
  };
}
