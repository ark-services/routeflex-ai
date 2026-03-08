import { SupabaseClient } from '@supabase/supabase-js';
import { ActionResult } from './types';
import { logActivityEvent } from '@/lib/activity/logActivityEvent';
import { defaultTokenExpiresAt } from '@/lib/helpers/tokenExpiry';

/**
 * Action: lms.send_training_link
 *
 * Creates an LMS enrollment for the applicant (idempotent — skips if already enrolled)
 * and sends them an email containing their unique magic-link training URL via the
 * company's connected Gmail account.
 *
 * Config:
 *   course_id        — UUID of the lms_courses row (must be published)
 *   output_column_id — text column where status messages are written (optional)
 *
 * The learner portal URL is: /learn/[token]
 */
export async function executeLmsSendTrainingLink(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const {
    course_id,
    output_column_id,
    status_column_id,
    link_sent_label_id,
    in_progress_label_id,
    passed_label_id,
    failed_label_id,
    custom_subject,
    custom_message,
  } = config;
  const applicantId: string | undefined = payload.applicant_id || payload.subject_id;

  console.log('[executeLmsSendTrainingLink] Starting:', { course_id, output_column_id, applicantId, companyId });

  if (!course_id) {
    return { success: false, error: 'lms.send_training_link: course_id is required in config' };
  }
  if (!applicantId) {
    return { success: false, error: 'lms.send_training_link: missing applicant_id in payload' };
  }

  async function writeOutput(message: string) {
    if (!output_column_id) return;
    try {
      await supabase.from('board_cells').upsert(
        {
          applicant_id:          applicantId,
          column_id:             output_column_id,
          value_text:            message,
          value_number:          null,
          value_date:            null,
          value_status_label_id: null,
          value_file_path:       null,
        },
        { onConflict: 'applicant_id,column_id' }
      );
    } catch (err) {
      console.error('[executeLmsSendTrainingLink] writeOutput error (non-fatal):', err);
    }
  }

  // ── Verify course exists and is published ───────────────────────────────────
  const { data: course, error: courseError } = await supabase
    .from('lms_courses')
    .select('id, name, company_id')
    .eq('id', course_id)
    .eq('is_published', true)
    .maybeSingle();

  if (courseError || !course) {
    const msg = 'Training link not sent: course not found or not published';
    await writeOutput(msg);
    return { success: false, error: msg };
  }

  if (course.company_id !== companyId) {
    return { success: false, error: 'lms.send_training_link: course does not belong to this company' };
  }

  // ── Fetch applicant info (name + email + portal_token) ──────────────────────
  const { data: applicant, error: applicantError } = await supabase
    .from('applicants')
    .select('id, full_name, email, portal_token')
    .eq('id', applicantId)
    .maybeSingle();

  if (applicantError || !applicant) {
    return { success: false, error: `lms.send_training_link: applicant not found (${applicantId})` };
  }

  // Resolve email: applicants.email → configured email_column_id → auto-detect any email-type board cell
  let resolvedEmail = applicant.email ?? null;
  if (!resolvedEmail && config.email_column_id) {
    // Use the explicitly configured column
    const { data: configuredCell } = await supabase
      .from('board_cells')
      .select('value_text')
      .eq('applicant_id', applicantId)
      .eq('column_id', config.email_column_id)
      .maybeSingle();
    resolvedEmail = configuredCell?.value_text ?? null;
    if (resolvedEmail) {
      console.log('[executeLmsSendTrainingLink] Resolved email from configured column:', config.email_column_id);
    }
  }
  if (!resolvedEmail) {
    // Auto-detect: first board cell with an email-type column on this job
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
    if (resolvedEmail) {
      console.log('[executeLmsSendTrainingLink] Resolved email via auto-detect board cell');
    }
  }

  if (!resolvedEmail) {
    const msg = `Training link not sent: ${applicant.full_name ?? 'Applicant'} has no email address on file`;
    console.warn('[executeLmsSendTrainingLink] Applicant has no email:', applicantId);
    await writeOutput(msg);
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorType: 'automation',
      eventType: 'automation.run.warning',
      entityType: 'applicant',
      entityId: applicantId,
      summary: msg,
      data: { applicant_id: applicantId, applicant_name: applicant.full_name, course_id, error: 'No email address' },
    });
    return { success: false, error: msg };
  }

  // ── Idempotency: skip if already enrolled ───────────────────────────────────
  const { data: existing } = await supabase
    .from('lms_enrollments')
    .select('id, token')
    .eq('applicant_id', applicantId)
    .eq('course_id', course_id)
    .maybeSingle();

  let token: string;

  if (existing) {
    console.log('[executeLmsSendTrainingLink] Already enrolled:', existing.id, '— resending link');
    token = existing.token;
    // Update board refs in case the automation config changed
    if (output_column_id || status_column_id) {
      await supabase.from('lms_enrollments').update({
        ...(output_column_id   && { output_column_id }),
        ...(status_column_id   && { status_column_id }),
        ...(link_sent_label_id && { link_sent_label_id }),
        ...(in_progress_label_id && { in_progress_label_id }),
        ...(passed_label_id    && { passed_label_id }),
        ...(failed_label_id    && { failed_label_id }),
      }).eq('id', existing.id);
    }
  } else {
    // ── Create enrollment with board column refs ─────────────────────────────
    const { data: enrollment, error: enrollError } = await supabase
      .from('lms_enrollments')
      .insert({
        applicant_id: applicantId,
        course_id,
        status: 'enrolled',
        token_expires_at: defaultTokenExpiresAt(),
        ...(output_column_id     && { output_column_id }),
        ...(status_column_id     && { status_column_id }),
        ...(link_sent_label_id   && { link_sent_label_id }),
        ...(in_progress_label_id && { in_progress_label_id }),
        ...(passed_label_id      && { passed_label_id }),
        ...(failed_label_id      && { failed_label_id }),
      })
      .select('id, token')
      .single();

    if (enrollError || !enrollment) {
      console.error('[executeLmsSendTrainingLink] Failed to create enrollment:', enrollError);
      return { success: false, error: `Failed to create LMS enrollment: ${enrollError?.message}` };
    }

    token = enrollment.token;
    console.log('[executeLmsSendTrainingLink] Created enrollment:', enrollment.id, 'token:', token);
  }

  // ── Set "Link Sent" status label on the board immediately ───────────────────
  if (status_column_id && link_sent_label_id) {
    try {
      await supabase.from('board_cells').upsert(
        { applicant_id: applicantId, column_id: status_column_id, value_status_label_id: link_sent_label_id,
          value_text: null, value_number: null, value_date: null, value_file_path: null },
        { onConflict: 'applicant_id,column_id' }
      );
    } catch (err) {
      console.error('[executeLmsSendTrainingLink] Failed to set link_sent status label (non-fatal):', err);
    }
  }

  // ── Send email via company Gmail ────────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.routeflex.com';
  const trainingUrl = `${appUrl}/learn/${token}`;

  const { getGmailClientForCompany, sendEmail, buildTrainingLinkEmail } = await import('@/lib/gmail-send');
  const gmail = await getGmailClientForCompany(supabase, companyId);

  if (!gmail) {
    const msg = `Training link not sent: no Gmail account connected. Go to Settings → Integrations to connect Gmail.`;
    console.warn('[executeLmsSendTrainingLink] No Gmail connection — cannot send email');
    await writeOutput(msg);
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorType: 'automation',
      eventType: 'automation.run.warning',
      entityType: 'applicant',
      entityId: applicantId,
      summary: `Training link not sent for ${applicant.full_name ?? applicantId}: no Gmail account connected`,
      data: { applicant_id: applicantId, applicant_name: applicant.full_name, course_id, training_url: trainingUrl, error: 'Gmail not connected' },
    });
    return { success: false, error: msg };
  }

  const { data: company } = await supabase
    .from('companies')
    .select('name, logo_url')
    .eq('id', companyId)
    .maybeSingle();

  const companyName = company?.name ?? 'Your employer';

  // Prefer board_cells First Name / Last Name over applicants.full_name.
  const { data: applicantNameCells } = await supabase
    .from('board_cells')
    .select('value_text, board_columns!inner(name)')
    .eq('applicant_id', applicantId);

  let cellFirstName = '';
  let cellLastName  = '';
  for (const cell of applicantNameCells ?? []) {
    const cn = (cell as any).board_columns?.name?.toLowerCase().trim() ?? '';
    if (cn === 'first name' || cn === 'firstname') cellFirstName = (cell as any).value_text ?? '';
    if (cn === 'last name'  || cn === 'lastname')  cellLastName  = (cell as any).value_text ?? '';
  }

  const firstName = cellFirstName || applicant.full_name?.split(' ')[0] || 'there';
  const fullName  = [cellFirstName, cellLastName].filter(Boolean).join(' ')
                    || applicant.full_name
                    || 'there';

  const lmsPortalUrl = applicant.portal_token
    ? `${appUrl}/status/${applicant.portal_token}`
    : '';

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

  // Substitute {{variables}} in custom subject/message if provided
  function substituteVars(template: string): string {
    let result = template
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{full_name\}\}/g, fullName)
      .replace(/\{\{company_name\}\}/g, companyName)
      .replace(/\{\{training_link\}\}/g, trainingUrl)
      .replace(/\{\{portal_link\}\}/g, lmsPortalUrl);
    for (const [slug, value] of colSlugValueMap) {
      result = result.replace(new RegExp(`\\{\\{col:${slug}\\}\\}`, 'g'), value);
    }
    return result;
  }

  const { subject, body: emailBody } = buildTrainingLinkEmail({
    firstName,
    companyName,
    logoUrl: company?.logo_url,
    trainingUrl,
    customSubject: custom_subject ? substituteVars(custom_subject) : undefined,
    customMessage: custom_message ? substituteVars(custom_message) : undefined,
  });

  const emailResult = await sendEmail(gmail.gmail, {
    to: resolvedEmail,
    subject,
    body: emailBody,
  });

  if (!emailResult.success) {
    const msg = `Training link created but email failed: ${emailResult.error}`;
    console.error('[executeLmsSendTrainingLink] Email send failed:', emailResult.error);
    await writeOutput(msg);
    return { success: false, error: msg };
  }

  const sentMsg = `Training link sent ${new Date().toLocaleDateString()}`;
  await writeOutput(sentMsg);

  await logActivityEvent(supabase, {
    companyId,
    jobId,
    actorType: 'automation',
    eventType: 'lms.training_link.sent',
    entityType: 'applicant',
    entityId: applicantId,
    summary: `Training link emailed to ${resolvedEmail} for course "${course.name}"`,
    data: {
      applicant_id:  applicantId,
      course_id,
      course_name:   course.name,
      email:         resolvedEmail,
      training_url:  trainingUrl,
      message_id:    emailResult.messageId,
    },
  });

  console.log('[executeLmsSendTrainingLink] Training link sent to:', resolvedEmail, 'url:', trainingUrl);
  return { success: true };
}

/**
 * Action: portal.send_link
 *
 * Emails the applicant a link to their personal status portal (/status/[token]).
 * The portal_token is persistent and already exists on the applicant row —
 * no enrollment or record creation is needed.
 *
 * Config:
 *   email_column_id — UUID of a board column to use as email source (optional)
 */
export async function executePortalSendLink(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const applicantId: string | undefined = payload.applicant_id || payload.subject_id;

  console.log('[executePortalSendLink] Starting:', { applicantId, companyId });

  if (!applicantId) {
    return { success: false, error: 'portal.send_link: missing applicant_id in payload' };
  }

  // ── Fetch applicant (name, email, portal_token) ─────────────────────────────
  const { data: applicant, error: applicantError } = await supabase
    .from('applicants')
    .select('id, full_name, email, portal_token, token_expires_at')
    .eq('id', applicantId)
    .maybeSingle();

  if (applicantError || !applicant) {
    return { success: false, error: `portal.send_link: applicant not found (${applicantId})` };
  }

  if (!applicant.portal_token) {
    return { success: false, error: 'portal.send_link: applicant has no portal_token' };
  }

  // Set token expiry on first send (existing tokens with NULL expiry are left as-is until sent)
  if (!applicant.token_expires_at) {
    await supabase
      .from('applicants')
      .update({ token_expires_at: defaultTokenExpiresAt() })
      .eq('id', applicantId);
  }

  // ── Resolve email ───────────────────────────────────────────────────────────
  let resolvedEmail = applicant.email ?? null;
  if (!resolvedEmail && config.email_column_id) {
    const { data: configuredCell } = await supabase
      .from('board_cells')
      .select('value_text')
      .eq('applicant_id', applicantId)
      .eq('column_id', config.email_column_id)
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
    const msg = `Status portal link not sent: ${applicant.full_name ?? 'Applicant'} has no email address on file`;
    console.warn('[executePortalSendLink] Applicant has no email:', applicantId);
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

  // ── Build portal URL ────────────────────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.routeflex.com';
  const portalUrl = `${appUrl}/status/${applicant.portal_token}`;

  // ── Send email via company Gmail ────────────────────────────────────────────
  const { getGmailClientForCompany, sendEmail, buildPortalLinkEmail } = await import('@/lib/gmail-send');
  const gmail = await getGmailClientForCompany(supabase, companyId);

  if (!gmail) {
    const msg = 'Status portal link not sent: no Gmail account connected. Go to Settings → Integrations to connect Gmail.';
    console.warn('[executePortalSendLink] No Gmail connection — cannot send email');
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorType: 'automation',
      eventType: 'automation.run.warning',
      entityType: 'applicant',
      entityId: applicantId,
      summary: `Status portal link not sent for ${applicant.full_name ?? applicantId}: no Gmail account connected`,
      data: { applicant_id: applicantId, applicant_name: applicant.full_name, portal_url: portalUrl, error: 'Gmail not connected' },
    });
    return { success: false, error: msg };
  }

  const { data: company } = await supabase
    .from('companies')
    .select('name, logo_url')
    .eq('id', companyId)
    .maybeSingle();

  const companyName = company?.name ?? 'Your employer';

  // Prefer board_cells First Name / Last Name over applicants.full_name
  const { data: portalNameCells } = await supabase
    .from('board_cells')
    .select('value_text, board_columns!inner(name)')
    .eq('applicant_id', applicantId);

  let portalCellFirstName = '';
  let portalCellLastName  = '';
  for (const cell of portalNameCells ?? []) {
    const cn = (cell as any).board_columns?.name?.toLowerCase().trim() ?? '';
    if (cn === 'first name' || cn === 'firstname') portalCellFirstName = (cell as any).value_text ?? '';
    if (cn === 'last name'  || cn === 'lastname')  portalCellLastName  = (cell as any).value_text ?? '';
  }

  const firstName = portalCellFirstName || applicant.full_name?.split(' ')[0] || 'there';
  const fullName  = [portalCellFirstName, portalCellLastName].filter(Boolean).join(' ')
                    || applicant.full_name
                    || 'there';

  const { custom_subject, custom_message } = config as { custom_subject?: string; custom_message?: string };

  // Slugify helper — must match the UI's slugifyColName function
  function slugifyPortalColName(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  // Pre-fetch board column cell values for {{col:slug}} tokens in custom templates
  let portalColSlugValueMap = new Map<string, string>();
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
      const slugToColId = new Map(boardCols.map((c) => [slugifyPortalColName(c.name), c.id]));

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
          portalColSlugValueMap.set(slug, colId ? (colIdValueMap.get(colId) ?? '') : '');
        }
      }
    }
  }

  function substitutePortalVars(template: string): string {
    let result = template
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{full_name\}\}/g, fullName)
      .replace(/\{\{company_name\}\}/g, companyName)
      .replace(/\{\{portal_link\}\}/g, portalUrl);
    for (const [slug, value] of portalColSlugValueMap) {
      result = result.replace(new RegExp(`\\{\\{col:${slug}\\}\\}`, 'g'), value);
    }
    return result;
  }

  const { subject, body: emailBody } = buildPortalLinkEmail({
    firstName,
    companyName,
    logoUrl: company?.logo_url,
    portalUrl,
    customSubject: custom_subject ? substitutePortalVars(custom_subject) : undefined,
    customMessage: custom_message ? substitutePortalVars(custom_message) : undefined,
  });

  const emailResult = await sendEmail(gmail.gmail, {
    to: resolvedEmail,
    subject,
    body: emailBody,
  });

  if (!emailResult.success) {
    const msg = `Status portal link email failed: ${emailResult.error}`;
    console.error('[executePortalSendLink] Email send failed:', emailResult.error);
    return { success: false, error: msg };
  }

  await logActivityEvent(supabase, {
    companyId,
    jobId,
    actorType: 'automation',
    eventType: 'portal.link_sent',
    entityType: 'applicant',
    entityId: applicantId,
    summary: `Status portal link emailed to ${resolvedEmail}`,
    data: {
      applicant_id: applicantId,
      email: resolvedEmail,
      portal_url: portalUrl,
      message_id: emailResult.messageId,
    },
  });

  console.log('[executePortalSendLink] Portal link sent to:', resolvedEmail, 'url:', portalUrl);
  return { success: true };
}
