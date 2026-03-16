import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import PublicApplicationForm from "./PublicApplicationForm";

export default async function PublicApplicationPage({
  params,
}: {
  params: Promise<{ jobId: string; token: string }>;
}) {
  const { jobId, token } = await params;
  const supabase = await createClient();

  // Use the public helper function to get form details
  const { data: formData, error: formError } = await supabase.rpc(
    "get_public_form_by_token",
    { token }
  );

  if (formError || !formData || formData.length === 0) {
    return (
      <div className="min-h-screen bg-rf-ink-100 flex items-center justify-center p-4">
        <div className="bg-rf-surface-card rounded-2xl shadow-md p-8 max-w-md w-full">
          <h1 className="text-xl font-bold text-rf-danger mb-3">Invalid Link</h1>
          <p className="text-rf-text-secondary text-sm">
            This application form link is invalid or the job is no longer accepting applications.
          </p>
        </div>
      </div>
    );
  }

  const form = formData[0];

  // Extract design settings persisted by the form builder
  const designConfig = (form.settings as Record<string, any> | null)?.design ?? {};
  const backgroundColor = (designConfig.backgroundColor as string | undefined) ?? "#f3f4f6";
  const logoPath = designConfig.logoPath as string | undefined;

  // If the form has a logo in the private "logos" bucket, generate a signed URL
  // so applicants can view it. We use the service-role client because anonymous
  // (unauthenticated) users cannot call createSignedUrl on a private bucket.
  let logoSignedUrl = "";
  if (logoPath) {
    const serviceSupabase = createServiceClient();
    const { data: signed } = await serviceSupabase.storage
      .from("logos")
      .createSignedUrl(logoPath, 3600);
    logoSignedUrl = signed?.signedUrl ?? "";
  }

  // Get form fields
  const { data: fieldsData, error: fieldsError } = await supabase.rpc(
    "get_public_form_fields_by_token",
    { token }
  );

  if (fieldsError || !fieldsData) {
    return (
      <div className="min-h-screen bg-rf-ink-100 flex items-center justify-center p-4">
        <div className="bg-rf-surface-card rounded-2xl shadow-md p-8 max-w-md w-full">
          <h1 className="text-xl font-bold text-rf-danger mb-3">Error</h1>
          <p className="text-rf-text-secondary text-sm">Failed to load form fields.</p>
        </div>
      </div>
    );
  }

  return (
    // Full-page background — reads directly from the designer's color choice
    <div
      className="min-h-screen py-12 px-4"
      style={{ backgroundColor }}
    >
      <div className="max-w-2xl mx-auto">
        <div className="bg-rf-surface-card rounded-2xl overflow-hidden shadow-[0_2px_16px_rgba(0,0,0,0.08)]">

          {/* ── Card header: logo · job title ────────────────────────────── */}
          <div className="px-8 pt-8 pb-6 border-b border-rf-ink-100">
            {logoSignedUrl && (
              <img
                src={logoSignedUrl}
                alt="Company logo"
                className="max-h-10 object-contain mb-5"
              />
            )}
            <h1 className="text-2xl font-bold text-rf-text-primary leading-tight">
              {form.title || form.job_title}
            </h1>
          </div>

          {/* ── Form body: description + fields ──────────────────────────── */}
          <div className="px-8 py-8">
            <PublicApplicationForm
              jobId={jobId}
              token={token}
              form={form}
              fields={fieldsData}
            />
          </div>

        </div>
      </div>
    </div>
  );
}
