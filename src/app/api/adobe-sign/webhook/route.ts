import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdobeSignClient, downloadSignedDocument } from '@/lib/adobe-sign/client';
import { logActivityEvent } from '@/lib/activity/logActivityEvent';

/**
 * Adobe Sign Webhook — GET handler (verification)
 *
 * Adobe Sign sends a GET request to verify the webhook URL.
 * We must echo back the X-AdobeSign-ClientId header.
 */
export async function GET(request: NextRequest) {
  const clientId = request.headers.get('x-adobesign-clientid');
  console.log('[Adobe Sign Webhook] Verification request, clientId:', clientId);

  return new NextResponse(JSON.stringify({ xAdobeSignClientId: clientId }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'xAdobeSignClientId': clientId || '',
    },
  });
}

/**
 * Adobe Sign Webhook — POST handler (agreement events)
 *
 * Handles:
 * - AGREEMENT_ACTION_COMPLETED: individual signer done (progress update)
 * - AGREEMENT_WORKFLOW_COMPLETED: all signers done (full completion)
 * - AGREEMENT_EXPIRED / AGREEMENT_RECALLED: update status
 */
export async function POST(request: NextRequest) {
  try {
    // Verify the request comes from Adobe Sign
    const clientId = request.headers.get('x-adobesign-clientid');
    const expectedClientId = process.env.ADOBE_SIGN_CLIENT_ID;

    if (expectedClientId && clientId !== expectedClientId) {
      console.warn('[Adobe Sign Webhook] Invalid client ID:', clientId);
      // Still return 200 to prevent retries, but log the mismatch
    }

    const body = await request.json();
    const event = body.event;
    const agreementId = body.agreement?.id;
    const agreementStatus = body.agreement?.status;

    console.log('[Adobe Sign Webhook] Event:', event, 'Agreement:', agreementId, 'Status:', agreementStatus);

    if (!agreementId) {
      console.warn('[Adobe Sign Webhook] No agreement ID in payload');
      return NextResponse.json({ ok: true });
    }

    const supabase = createServiceClient();

    // Look up our tracking record
    const { data: agreement, error: lookupErr } = await supabase
      .from('esign_agreements')
      .select('*')
      .eq('adobe_agreement_id', agreementId)
      .maybeSingle();

    if (lookupErr || !agreement) {
      console.warn('[Adobe Sign Webhook] Agreement not found:', agreementId);
      return NextResponse.json({ ok: true });
    }

    // Handle different event types
    switch (event) {
      case 'AGREEMENT_ACTION_COMPLETED': {
        // Individual signer completed — update progress
        const signerEmail = body.participantUserEmail || 'a signer';
        const progressMsg = `eSign: ${signerEmail} signed — awaiting remaining signers`;

        if (agreement.output_column_id && agreement.status === 'sent') {
          await upsertCell(supabase, agreement.applicant_id, agreement.output_column_id, {
            value_text: progressMsg,
          });
        }

        console.log('[Adobe Sign Webhook] Action completed by:', signerEmail);
        break;
      }

      case 'AGREEMENT_WORKFLOW_COMPLETED': {
        // All signers done — full completion
        if (agreement.status === 'signed') {
          console.log('[Adobe Sign Webhook] Already signed, skipping (idempotent)');
          return NextResponse.json({ ok: true });
        }

        const now = new Date();

        // Update agreement status
        await supabase
          .from('esign_agreements')
          .update({
            status: 'signed',
            signed_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq('id', agreement.id);

        // Write completion to output column
        if (agreement.output_column_id) {
          await upsertCell(supabase, agreement.applicant_id, agreement.output_column_id, {
            value_text: `eSign completed ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`,
          });
        }

        // Update status column
        if (agreement.status_column_id && agreement.completed_label_id) {
          await upsertCell(supabase, agreement.applicant_id, agreement.status_column_id, {
            value_status_label_id: agreement.completed_label_id,
          });
        }

        // Download and store signed PDF
        if (agreement.file_column_id) {
          try {
            const client = await getAdobeSignClient(supabase, agreement.company_id);
            if (client) {
              const pdfBuffer = await downloadSignedDocument(client, agreementId);
              const fileName = `esign/${agreement.company_id}/${agreement.id}.pdf`;

              const { error: uploadErr } = await supabase.storage
                .from('files')
                .upload(fileName, pdfBuffer, {
                  contentType: 'application/pdf',
                  upsert: true,
                });

              if (uploadErr) {
                console.error('[Adobe Sign Webhook] PDF upload failed:', uploadErr);
              } else {
                await upsertCell(supabase, agreement.applicant_id, agreement.file_column_id, {
                  value_file_path: fileName,
                });
                console.log('[Adobe Sign Webhook] Signed PDF stored:', fileName);
              }
            }
          } catch (pdfErr: any) {
            // Non-fatal: status is already updated
            console.error('[Adobe Sign Webhook] PDF download failed (non-fatal):', pdfErr.message);
          }
        }

        // Log activity
        await logActivityEvent(supabase, {
          companyId: agreement.company_id,
          jobId: agreement.job_id,
          actorType: 'automation',
          eventType: 'esign.agreement.signed',
          entityType: 'applicant',
          entityId: agreement.applicant_id,
          summary: 'eSign agreement signed via Adobe Sign',
          data: {
            adobe_agreement_id: agreementId,
            template_id: agreement.template_id,
          },
        });

        console.log('[Adobe Sign Webhook] Agreement completed:', agreementId);
        break;
      }

      case 'AGREEMENT_EXPIRED': {
        await supabase
          .from('esign_agreements')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('id', agreement.id);

        if (agreement.output_column_id) {
          await upsertCell(supabase, agreement.applicant_id, agreement.output_column_id, {
            value_text: 'eSign expired — document was not signed in time',
          });
        }

        console.log('[Adobe Sign Webhook] Agreement expired:', agreementId);
        break;
      }

      case 'AGREEMENT_RECALLED': {
        await supabase
          .from('esign_agreements')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', agreement.id);

        if (agreement.output_column_id) {
          await upsertCell(supabase, agreement.applicant_id, agreement.output_column_id, {
            value_text: 'eSign cancelled — agreement was recalled',
          });
        }

        console.log('[Adobe Sign Webhook] Agreement recalled:', agreementId);
        break;
      }

      default:
        console.log('[Adobe Sign Webhook] Unhandled event:', event);
    }

    // Return 200 with client ID (required by Adobe Sign)
    return new NextResponse(JSON.stringify({ xAdobeSignClientId: clientId }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'xAdobeSignClientId': clientId || '',
      },
    });
  } catch (error: any) {
    console.error('[Adobe Sign Webhook] Error:', error);
    // Return 200 to prevent Adobe Sign from retrying
    return NextResponse.json({ ok: true, error: error.message });
  }
}

/**
 * Helper: upsert a board cell value.
 */
async function upsertCell(
  supabase: any,
  applicantId: string,
  columnId: string,
  values: Record<string, any>
) {
  await supabase
    .from('board_cells')
    .upsert(
      {
        applicant_id: applicantId,
        column_id: columnId,
        value_text: null,
        value_number: null,
        value_date: null,
        value_status_label_id: null,
        value_file_path: null,
        ...values,
      },
      { onConflict: 'applicant_id,column_id' }
    );
}
