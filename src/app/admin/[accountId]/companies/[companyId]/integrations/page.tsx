import { requireAdmin } from "@/lib/rbac";
import { requireCompanyAccess } from "@/lib/integrations/requireCompanyAccess";
import { createClient } from "@/lib/supabase/server";
import { getGmailConnection } from "@/components/integrations/actions";
import { GmailCard } from "@/components/integrations/GmailCard";
import { getTwilioConnection } from "@/components/integrations/twilio-actions";
import { TwilioCard } from "@/components/integrations/TwilioCard";
import { getFadvConnection } from "@/components/integrations/fadv-actions";
import { FadvCard } from "@/components/integrations/FadvCard";
import { getSafetyTrainerConnection } from "@/components/integrations/safety-trainer-actions";
import { SafetyTrainerCard } from "@/components/integrations/SafetyTrainerCard";
import { IntegrationsClient } from "./IntegrationsClient";

export default async function CompanyIntegrationsPage({
  params,
}: {
  params: Promise<{ accountId: string; companyId: string }>;
}) {
  const { accountId, companyId } = await params;

  // 1. Verify caller is account admin
  await requireAdmin(accountId);

  // 2. Verify the requested company belongs to this account (→ 404 if not)
  const supabase = await createClient();
  const company = await requireCompanyAccess(supabase, accountId, companyId);

  // 3. Fetch integration state
  const [gmailConnection, twilioConnection, fadvConnection, safetyTrainerConnection] =
    await Promise.all([
      getGmailConnection(companyId),
      getTwilioConnection(companyId),
      getFadvConnection(companyId),
      getSafetyTrainerConnection(companyId),
    ]);

  return (
    <IntegrationsClient>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-rf-text-primary">
            Integrations
          </h1>
          <p className="text-sm text-rf-text-secondary mt-0.5">{company.name}</p>
        </div>

        {/* ── Gmail ─────────────────────────────────────────────────────── */}
        <GmailCard
          companyId={companyId}
          accountId={accountId}
          initialConnection={gmailConnection}
        />

        {/* ── Twilio ────────────────────────────────────────────────────── */}
        <TwilioCard
          companyId={companyId}
          accountId={accountId}
          initialConnection={twilioConnection}
        />

        {/* ── First Advantage (FADV) ─────────────────────────────────── */}
        <FadvCard
          companyId={companyId}
          accountId={accountId}
          initialConnection={fadvConnection}
        />

        {/* ── Impact Solutions Safety Trainer Hub ───────────────────── */}
        <SafetyTrainerCard
          companyId={companyId}
          accountId={accountId}
          initialConnection={safetyTrainerConnection}
        />
      </div>
    </IntegrationsClient>
  );
}
