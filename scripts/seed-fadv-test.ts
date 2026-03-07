/**
 * Seed a test FADV submission into the dev database.
 *
 * Usage:
 *   npx tsx scripts/seed-fadv-test.ts \
 *     <companyId> <applicantId> \
 *     <fadvClientId> <fadvUsername> <fadvPassword> "<fadvSecurityAnswer>" \
 *     <packageCode> <facilityId> "<positionType>"
 *
 * Example:
 *   npx tsx scripts/seed-fadv-test.ts \
 *     e45f... a1b2... \
 *     "12345" "jsmith" "mypassword" "maiden name" \
 *     "2536" "300 - ISP Pickup & Delivery" "Driver"
 *
 * After running this script, trigger the queue processor:
 *   curl -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d'"' -f2)" \
 *        http://localhost:3000/api/fadv/process-queue
 *
 * The dev server must be running (npm run dev) with FADV_HEADED=true in .env.local.
 * A Chrome window will open and you can watch the automation run.
 */

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { createClient } from "@supabase/supabase-js";
import { encrypt } from "../src/lib/encryption";

async function main() {
  const [
    companyId,
    applicantId,
    clientId,
    username,
    password,
    securityAnswer,
    packageCode,
    facilityId,
    positionType,
  ] = process.argv.slice(2);

  if (!companyId || !applicantId || !clientId || !username || !password || !securityAnswer || !packageCode || !facilityId || !positionType) {
    console.error(`Usage:
  npx tsx scripts/seed-fadv-test.ts \\
    <companyId> <applicantId> \\
    <fadvClientId> <fadvUsername> <fadvPassword> "<fadvSecurityAnswer>" \\
    <packageCode> <facilityId> "<positionType>"
`);
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── 1. Look up the applicant so we know who we're submitting ───────────────
  const { data: applicant, error: appError } = await supabase
    .from("applicants")
    .select("full_name, email, phone")
    .eq("id", applicantId)
    .single();

  if (appError || !applicant) {
    console.error("Applicant not found:", applicantId, appError);
    process.exit(1);
  }

  const nameParts = (applicant.full_name ?? "Test Applicant").split(" ");
  const firstName = nameParts[0] ?? "Test";
  const lastName = nameParts.slice(1).join(" ") || "Applicant";

  console.log("Applicant:", { full_name: applicant.full_name, email: applicant.email, phone: applicant.phone });

  // ── 2. Upsert FADV connection for this company with encrypted credentials ──
  const { error: connError } = await supabase
    .from("fadv_connections")
    .upsert({
      company_id:                  companyId,
      csp_id:                      clientId,      // Using clientId as CSP ID placeholder
      company_id_value:            clientId,      // Using clientId as Company ID placeholder
      client_id:                   clientId,
      username,
      encrypted_password:          encrypt(password),
      encrypted_security_answer:   encrypt(securityAnswer),
      is_enabled:                  true,
      updated_at:                  new Date().toISOString(),
    }, { onConflict: "company_id" });

  if (connError) {
    console.error("Failed to upsert fadv_connections:", connError);
    process.exit(1);
  }
  console.log("\n✅ fadv_connections upserted for company:", companyId);

  // ── 3. Insert a queued submission ─────────────────────────────────────────
  const { data: submission, error: subError } = await supabase
    .from("integration_submissions")
    .insert({
      company_id:     companyId,
      applicant_id:   applicantId,
      provider:       "fadv",
      status:         "queued",
      input_snapshot: {
        package:       packageCode,
        facility_id:   facilityId,
        position_type: positionType,
        first_name:    firstName,
        last_name:     lastName,
        email:         applicant.email ?? "",
      },
    })
    .select("id")
    .single();

  if (subError || !submission) {
    console.error("Failed to insert integration_submissions:", subError);
    process.exit(1);
  }

  console.log("✅ integration_submissions row inserted:", submission.id);
  console.log("\nSubmission details:");
  console.log("  company_id:    ", companyId);
  console.log("  applicant_id:  ", applicantId);
  console.log("  applicant:     ", applicant.full_name, "/", applicant.email);
  console.log("  package:       ", packageCode);
  console.log("  facility_id:   ", facilityId);
  console.log("  position_type: ", positionType);

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Next step — trigger the queue processor (dev server must be running):

  curl -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d'"' -f2)" \\
       http://localhost:3000/api/fadv/process-queue

A Chrome window will open (FADV_HEADED=true) and you can watch the automation.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
