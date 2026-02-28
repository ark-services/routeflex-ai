import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { executeGmailAction, executeSmsAction, executeSlackAction, executeMoveToGroupAction } from '@/lib/automations/executors';

export async function POST(request: NextRequest) {
  try {
    const { accountId, companyId, applicantId, columnId, oldStatusLabelId, newStatusLabelId, userId } = await request.json();
    const supabase = await createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has membership in the account
    const { data: membership, error: membershipError } = await supabase
      .from('account_memberships')
      .select('role')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify company belongs to the claimed account
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('account_id', accountId)
      .single();

    if (!company) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 1. Create status change event
    const { data: event, error: eventError } = await supabase.from('status_change_events').insert({
      account_id: accountId, company_id: companyId, applicant_id: applicantId, column_id: columnId,
      old_status_label_id: oldStatusLabelId, new_status_label_id: newStatusLabelId,
      triggered_by_user_id: userId,
    }).select().single();

    if (eventError) return NextResponse.json({ error: 'Event creation failed' }, { status: 500 });

    // 2. Find matching automation rules
    const { data: matchingRules } = await supabase.from('automation_rules').select(`
      id, name, account_id, company_id, trigger_from_status_label_id,
      automation_actions (id, action_type, sort_order, config)
    `).eq('company_id', companyId).eq('is_enabled', true).eq('trigger_column_id', columnId)
      .eq('trigger_to_status_label_id', newStatusLabelId)
      .order('automation_actions(sort_order)', { ascending: true });

    const applicableRules = (matchingRules || []).filter((rule: any) =>
      !rule.trigger_from_status_label_id || rule.trigger_from_status_label_id === oldStatusLabelId
    );

    // 3. Check quota
    const { data: period } = await supabase.rpc('get_or_create_action_period', { p_account_id: accountId }).single();
    const periodData = period as any || { used_units: 0, quota_units: 3000, paused_execution: false };
    const quotaExceeded = periodData.used_units >= periodData.quota_units;
    const isPaused = periodData.paused_execution;

    // 4. Execute actions
    for (const rule of applicableRules) {
      for (const action of rule.automation_actions || []) {
        const { data: run, error: runError } = await supabase.from('automation_action_runs').insert({
          event_id: event.id, rule_id: rule.id, action_id: action.id, applicant_id: applicantId,
          account_id: accountId, company_id: companyId,
          status: isPaused || quotaExceeded ? 'paused_quota' : 'pending',
          cost_units: 1,
        }).select().single();

        if (runError?.code === '23505') continue; // Idempotency: skip duplicate

        if (isPaused || quotaExceeded) continue; // Skip execution

        let result;
        switch (action.action_type) {
          case 'send_gmail': result = await executeGmailAction(supabase, accountId, applicantId, action.config); break;
          case 'send_sms': result = await executeSmsAction(supabase, accountId, applicantId, action.config); break;
          case 'send_slack': result = await executeSlackAction(supabase, accountId, applicantId, action.config); break;
          case 'move_to_group': result = await executeMoveToGroupAction(supabase, companyId, applicantId, action.config); break;
          default: result = { success: false, error: 'Unknown action type' };
        }

        await supabase.from('automation_action_runs').update({
          status: result.success ? 'success' : 'failed',
          error_message: result.error || null,
          completed_at: new Date().toISOString(),
        }).eq('id', run.id);

        if (result.success) {
          await supabase.rpc('record_action_usage', {
            p_account_id: accountId, p_units: 1, p_source: 'automation',
            p_rule_id: rule.id, p_action_id: action.id, p_applicant_id: applicantId,
            p_company_id: companyId, p_event_id: event.id,
          });
        }
      }
    }

    return NextResponse.json({ message: 'Automations dispatched', eventId: event.id, rulesMatched: applicableRules.length });
  } catch (error) {
    console.error('Dispatch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
