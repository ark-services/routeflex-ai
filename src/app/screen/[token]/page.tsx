import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import ScreeningForm from "./ScreeningForm";

export default async function ScreeningPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const svc = createServiceClient();

  const { data: submission } = await svc
    .from("screening_submissions")
    .select(`
      id,
      status,
      expires_at,
      config_id,
      screening_configs (
        id,
        screening_questions (
          id,
          sort_order,
          text,
          type,
          options,
          is_dealbreaker
        )
      )
    `)
    .eq("token", token)
    .single();

  if (!submission) notFound();

  // Show a friendly message for terminal states
  if (submission.status === "completed") {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">✓</div>
        <h1 className="text-2xl font-bold text-rf-text-primary mb-2">
          You&apos;re all set!
        </h1>
        <p className="text-rf-text-secondary">
          Your screening questionnaire has been submitted. We&apos;ll be in
          touch soon.
        </p>
      </div>
    );
  }

  if (submission.status === "auto_rejected") {
    return (
      <div className="text-center py-16">
        <h1 className="text-xl font-bold text-rf-text-primary mb-2">
          Thank you for your interest
        </h1>
        <p className="text-rf-text-secondary">
          After reviewing your responses, we&apos;ve decided not to move
          forward at this time.
        </p>
      </div>
    );
  }

  if (submission.status === "expired") {
    return (
      <div className="text-center py-16">
        <h1 className="text-xl font-bold text-rf-text-primary mb-2">
          This link has expired
        </h1>
        <p className="text-rf-text-secondary">
          The deadline for completing this questionnaire has passed. Please
          contact us if you have any questions.
        </p>
      </div>
    );
  }

  // Check if submission is past its deadline (but not yet marked expired by cron)
  if (submission.expires_at && new Date(submission.expires_at) < new Date()) {
    // Mark it expired via service role
    await svc
      .from("screening_submissions")
      .update({ status: "expired" })
      .eq("id", submission.id);

    return (
      <div className="text-center py-16">
        <h1 className="text-xl font-bold text-rf-text-primary mb-2">
          This link has expired
        </h1>
        <p className="text-rf-text-secondary">
          The deadline for completing this questionnaire has passed.
        </p>
      </div>
    );
  }

  // Mark as started on first visit
  if (submission.status === "sent") {
    await svc
      .from("screening_submissions")
      .update({ status: "started" })
      .eq("id", submission.id);
  }

  const config = (submission as any).screening_configs;
  const questions = ((config?.screening_questions ?? []) as any[]).sort(
    (a, b) => a.sort_order - b.sort_order
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-rf-text-primary mb-2">
          Screening Questionnaire
        </h1>
        <p className="text-rf-text-secondary">
          Please answer all questions honestly. Your responses help us learn more about you.
        </p>
      </div>

      <ScreeningForm
        submissionId={submission.id}
        token={token}
        questions={questions}
      />
    </div>
  );
}
