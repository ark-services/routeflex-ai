import { SupabaseClient } from '@supabase/supabase-js';
import { ActionResult } from './types';
import { logActivityEvent } from '@/lib/activity/logActivityEvent';
import { createNotification } from '@/lib/notifications/createNotification';

/**
 * Action: screening.send_link
 *
 * Creates a screening submission for the applicant (idempotent — reuses token if
 * a submission already exists for this job) and sends them an email containing
 * their unique magic-link screening URL via the company's connected Gmail account.
 *
 * Config:
 *   email_column_id  — UUID of a board column to use as email source (optional)
 *   custom_subject   — Custom email subject line (optional)
 *   custom_message   — Custom email message body (optional); supports
 *                      {{first_name}}, {{full_name}}, {{company_name}}, {{screening_link}},
 *                      {{col:slug}}
 *
 * The screening portal URL is: /screen/[token]
 */
export async function executeScreeningSendLink(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { email_column_id, custom_subject, custom_message } = config;
  const applicantId: string | undefined = payload.applicant_id || payload.subject_id;

  console.log('[executeScreeningSendLink] Starting:', { applicantId, companyId, jobId });

  if (!applicantId) {
    return { success: false, error: 'screening.send_link: missing applicant_id in payload' };
  }

  // ── Verify a screening config exists for this job ──────────────────────────
  const { data: screeningConfig, error: configError } = await supabase
    .from('screening_configs')
    .select('id, deadline_hours')
    .eq('job_id', jobId)
    .maybeSingle();

  if (configError || !screeningConfig) {
    return {
      success: false,
      error: 'screening.send_link: no screening config found for this job. Set up screening questions in the job settings first.',
    };
  }

  // ── Fetch applicant info ────────────────────────────────────────────────────
  const { data: applicant, error: applicantError } = await supabase
    .from('applicants')
    .select('id, full_name, email')
    .eq('id', applicantId)
    .maybeSingle();

  if (applicantError || !applicant) {
    return { success: false, error: `screening.send_link: applicant not found (${applicantId})` };
  }

  // ── Resolve email ───────────────────────────────────────────────────────────
  let resolvedEmail = applicant.email ?? null;
  if (!resolvedEmail && email_column_id) {
    const { data: configuredCell } = await supabase
      .from('board_cells')
      .select('value_text')
      .eq('applicant_id', applicantId)
      .eq('column_id', email_column_id)
      .maybeSingle();
    resolvedEmail = configuredCell?.value_text ?? null;
  }
  if (!resolvedEmail) {
    const { data: emailCell } = await supabase
      .from('board_cells')
      .select('value_text, board_columns!inner(type, board_id, boards!inner(job_id))')
      .eq('applicant_id', applicantId)
      .eq('board_columns.type', 'email')
      .eq('board_columns.boards.job_id', jobId)
      .not('value_text', 'is', null)
      .limit(1)
      .maybeSingle();
    resolvedEmail = emailCell?.value_text ?? null;
  }

  if (!resolvedEmail) {
    const msg = `Screening link not sent: ${applicant.full_name ?? 'Applicant'} has no email address on file`;
    console.warn('[executeScreeningSendLink] Applicant has no email:', applicantId);
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorType: 'automation',
      eventType: 'automation.run.warning',
      entityType: 'applicant',
      entityId: applicantId,
      summary: msg,
      data: { applicant_id: applicantId, applicant_name: applicant.full_name, error: 'No email address' },
    });
    return { success: false, error: msg };
  }

  // ── Idempotency: reuse existing submission token if one already exists ──────
  const { data: existing } = await supabase
    .from('screening_submissions')
    .select('id, token')
    .eq('applicant_id', applicantId)
    .eq('job_id', jobId)
    .maybeSingle();

  let token: string;

  if (existing) {
    console.log('[executeScreeningSendLink] Submission already exists:', existing.id, '— resending link');
    token = existing.token;
  } else {
    // ── Create a new submission ───────────────────────────────────────────────
    const expiresAt = screeningConfig.deadline_hours > 0
      ? new Date(Date.now() + screeningConfig.deadline_hours * 60 * 60 * 1000).toISOString()
      : null;

    const { data: submission, error: insertError } = await supabase
      .from('screening_submissions')
      .insert({
        applicant_id: applicantId,
        job_id: jobId,
        config_id: screeningConfig.id,
        status: 'sent',
        ...(expiresAt && { expires_at: expiresAt }),
      })
      .select('id, token')
      .single();

    if (insertError || !submission) {
      console.error('[executeScreeningSendLink] Failed to create submission:', insertError);
      return { success: false, error: `Failed to create screening submission: ${insertError?.message}` };
    }

    token = submission.token;
    console.log('[executeScreeningSendLink] Created submission:', submission.id, 'token:', token);
  }

  // ── Resolve name for personalized email ────────────────────────────────────
  const { data: nameCells } = await supabase
    .from('board_cells')
    .select('value_text, board_columns!inner(name)')
    .eq('applicant_id', applicantId);

  let cellFirstName = '';
  let cellLastName  = '';
  for (const cell of nameCells ?? []) {
    const cn = (cell as any).board_columns?.name?.toLowerCase().trim() ?? '';
    if (cn === 'first name' || cn === 'firstname') cellFirstName = (cell as any).value_text ?? '';
    if (cn === 'last name'  || cn === 'lastname')  cellLastName  = (cell as any).value_text ?? '';
  }

  const firstName = cellFirstName || applicant.full_name?.split(' ')[0] || 'there';
  const fullName  = [cellFirstName, cellLastName].filter(Boolean).join(' ')
                    || applicant.full_name
                    || 'there';

  // ── Build screening URL ─────────────────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.routeflex.com';
  const screeningUrl = `${appUrl}/screen/${token}`;

  // ── Send email via company Gmail ────────────────────────────────────────────
  const { getGmailClientForCompany, sendEmail, buildScreeningLinkEmail } = await import('@/lib/gmail-send');
  const gmail = await getGmailClientForCompany(supabase, companyId);

  if (!gmail) {
    const msg = 'Screening link not sent: no Gmail account connected. Go to Settings → Integrations to connect Gmail.';
    console.warn('[executeScreeningSendLink] No Gmail connection — cannot send email');
    await Promise.all([
      logActivityEvent(supabase, {
        companyId,
        jobId,
        actorType: 'automation',
        eventType: 'automation.run.warning',
        entityType: 'applicant',
        entityId: applicantId,
        summary: `Screening link not sent for ${applicant.full_name ?? applicantId}: no Gmail account connected`,
        data: { applicant_id: applicantId, applicant_name: applicant.full_name, error: 'Gmail not connected' },
      }),
      createNotification(supabase, {
        companyId,
        jobId,
        type: 'error',
        title: 'Screening link not sent — Gmail not connected',
        body: `Could not send screening link to ${applicant.full_name ?? 'applicant'}. Connect Gmail in Settings → Integrations.`,
      }),
    ]);
    return { success: false, error: msg };
  }

  const { data: company } = await supabase
    .from('companies')
    .select('name, logo_url')
    .eq('id', companyId)
    .maybeSingle();

  const companyName = company?.name ?? 'Your employer';

  // Slugify helper — must match the UI's slugifyColName function
  function slugifyColName(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  // Pre-fetch board column cell values for {{col:slug}} tokens in custom templates
  let colSlugValueMap = new Map<string, string>();
  if (custom_subject || custom_message) {
    const templateContent = (custom_subject ?? '') + ' ' + (custom_message ?? '');
    const colTokenMatches = [...templateContent.matchAll(/\{\{col:([a-z0-9_]+)\}\}/g)];
    if (colTokenMatches.length > 0) {
      const slugs = [...new Set(colTokenMatches.map((m) => m[1]))];
      const { data: boardRow } = await supabase
        .from('boards')
        .select('board_columns(id, name)')
        .eq('job_id', jobId)
        .maybeSingle();
      const boardCols = (boardRow?.board_columns ?? []) as { id: string; name: string }[];
      const slugToColId = new Map(boardCols.map((c) => [slugifyColName(c.name), c.id]));

      const colIds = slugs.map((s) => slugToColId.get(s)).filter(Boolean) as string[];
      if (colIds.length > 0) {
        const { data: cells } = await supabase
          .from('board_cells')
          .select('column_id, value_text')
          .eq('applicant_id', applicantId)
          .in('column_id', colIds);
        const colIdValueMap = new Map(
          (cells ?? []).map((c: { column_id: string; value_text: string | null }) => [c.column_id, c.value_text ?? ''])
        );
        for (const slug of slugs) {
          const colId = slugToColId.get(slug);
          colSlugValueMap.set(slug, colId ? (colIdValueMap.get(colId) ?? '') : '');
        }
      }
    }
  }

  function substituteVars(template: string): string {
    let result = template
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{full_name\}\}/g, fullName)
      .replace(/\{\{company_name\}\}/g, companyName)
      .replace(/\{\{screening_link\}\}/g, screeningUrl);
    for (const [slug, value] of colSlugValueMap) {
      result = result.replace(new RegExp(`\\{\\{col:${slug}\\}\\}`, 'g'), value);
    }
    return result;
  }

  const { subject, body: emailBody } = buildScreeningLinkEmail({
    firstName,
    companyName,
    logoUrl: company?.logo_url,
    screeningUrl,
    customSubject: custom_subject ? substituteVars(custom_subject) : undefined,
    customMessage: custom_message ? substituteVars(custom_message) : undefined,
  });

  const emailResult = await sendEmail(gmail.gmail, {
    to: resolvedEmail,
    subject,
    body: emailBody,
  });

  if (!emailResult.success) {
    const msg = `Screening link created but email failed: ${emailResult.error}`;
    console.error('[executeScreeningSendLink] Email send failed:', emailResult.error);
    return { success: false, error: msg };
  }

  await logActivityEvent(supabase, {
    companyId,
    jobId,
    actorType: 'automation',
    eventType: 'screening.link_sent',
    entityType: 'applicant',
    entityId: applicantId,
    summary: `Screening link emailed to ${resolvedEmail}`,
    data: {
      applicant_id:  applicantId,
      job_id:        jobId,
      email:         resolvedEmail,
      screening_url: screeningUrl,
      message_id:    emailResult.messageId,
    },
  });

  console.log('[executeScreeningSendLink] Screening link sent to:', resolvedEmail, 'url:', screeningUrl);
  return { success: true };
}
