import { createClient } from "@/lib/supabase/server";
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
