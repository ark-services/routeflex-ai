import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Invalid Link</h1>
          <p className="text-gray-600">
            This application form link is invalid or the job is no longer accepting applications.
          </p>
        </div>
      </div>
    );
  }

  const form = formData[0];

  // If the form has a logo in the private "logos" bucket, generate a signed URL
  // so applicants can view it. We use the service-role client because anonymous
  // (unauthenticated) users cannot call createSignedUrl on a private bucket.
  const logoPath = (form.settings as Record<string, any> | null)?.design
    ?.logoPath as string | undefined;
  let logoSignedUrl = "";
  if (logoPath) {
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-600">Failed to load form fields.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Company logo (shown above the blue banner when a logo is set) */}
          {logoSignedUrl && (
            <div className="bg-white px-8 pt-6 pb-4 flex items-center border-b border-gray-100">
              <img
                src={logoSignedUrl}
                alt={`${form.company_name} logo`}
                className="max-h-10 object-contain"
              />
            </div>
          )}

          {/* Header */}
          <div className="bg-blue-600 text-white p-8">
            <h1 className="text-3xl font-bold mb-2">{form.job_title}</h1>
            <p className="text-blue-100">{form.company_name}</p>
          </div>

          {/* Form */}
          <div className="p-8">
            <PublicApplicationForm
              jobId={jobId}
              token={token}
              form={form}
              fields={fieldsData}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm mt-6">
          Powered by ArkRecruit
        </div>
      </div>
    </div>
  );
}
