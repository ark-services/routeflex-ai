import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AcceptInviteClient } from "./AcceptInviteClient";
import { Card } from "@/components/ui/card";


export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const svc = createServiceClient();

  // Look up invite link info — SECURITY DEFINER so it works unauthenticated
  const { data: info } = await svc.rpc("get_invite_link_info", { p_token: token });

  if (!info || info.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-rf-surface-page p-4">
        <Card className="max-w-md w-full p-10 text-center">
          <div className="text-4xl mb-4">🔗</div>
          <h1 className="text-xl font-semibold text-rf-text-primary">
            Invalid invite link
          </h1>
          <p className="text-sm text-rf-text-secondary mt-2">
            This invite link has expired or is no longer valid. Ask your admin
            to send you a new one.
          </p>
        </Card>
      </div>
    );
  }

  // Check if the user is authenticated
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=/invite/${token}`);
  }

  return (
    <AcceptInviteClient
      token={token}
      accountName={info.account_name}
      role={info.role as string}
    />
  );
}
