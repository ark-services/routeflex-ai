import { describe, expect, it } from 'vitest';
import { fireJobTrigger } from './fireJobAutomation';

type QueryResult = { data?: any; error?: any };
type QueryMap = Partial<Record<string, QueryResult[]>>;

class SupabaseMock {
  public inserts: Array<{ table: string; values: any }> = [];
  public rpcCalls: Array<{ fn: string; args: any }> = [];
  private readonly queries: QueryMap;

  constructor(queries: QueryMap = {}) {
    this.queries = queries;
  }

  from(table: string) {
    return new QueryBuilder(this, table);
  }

  async rpc(fn: string, args: any) {
    this.rpcCalls.push({ fn, args });
    return { error: null };
  }

  dequeue(key: string): QueryResult {
    const queue = this.queries[key] ?? [];
    if (queue.length > 0) return queue.shift() as QueryResult;
    return { data: null, error: null };
  }
}

class QueryBuilder {
  private readonly filters: Record<string, any> = {};

  constructor(
    private readonly supabase: SupabaseMock,
    private readonly table: string
  ) {}

  select(_value: string) {
    return this;
  }

  eq(key: string, value: any) {
    this.filters[key] = value;
    return this;
  }

  order(_column: string, _opts?: any) {
    return this;
  }

  limit(_n: number) {
    return this;
  }

  async insert(values: any) {
    this.supabase.inserts.push({ table: this.table, values });
    return { error: null };
  }

  async single() {
    return this.supabase.dequeue(`${this.table}.single`);
  }

  async maybeSingle() {
    return this.supabase.dequeue(`${this.table}.maybeSingle`);
  }

  then(resolve: (value: QueryResult) => void) {
    resolve(this.supabase.dequeue(`${this.table}.query`));
  }
}

const baseInput = {
  companyId: 'company-1',
  jobId: 'job-1',
  trigger_key: 'board.status_changes_to',
  subject_type: 'applicant',
  subject_id: 'app-1',
  payload: {
    applicant_id: 'app-1',
    column_id: 'status-col',
    new_value: 'status-b',
  },
};

describe('fireJobTrigger', () => {
  it('returns early when no automations are configured', async () => {
    const supabase = new SupabaseMock({
      'automations.query': [{ data: [], error: null }],
    });

    await fireJobTrigger(supabase as any, baseInput);

    expect(supabase.inserts.filter((x) => x.table === 'automation_runs')).toHaveLength(0);
  });

  it('marks automation as skipped when chain depth is too high', async () => {
    const supabase = new SupabaseMock({
      'automations.query': [{
        data: [{ id: 'a1', name: 'Depth Guard', filter: {}, automation_actions: [] }],
        error: null,
      }],
      'companies.single': [{ data: { account_id: 'acct-1' }, error: null }],
    });

    await fireJobTrigger(supabase as any, {
      ...baseInput,
      payload: { ...baseInput.payload, _chain_depth: 2 },
    });

    const runInsert = supabase.inserts.find((x) => x.table === 'automation_runs');
    expect(runInsert?.values.status).toBe('skipped');
    expect(runInsert?.values.skip_reason).toContain('chain limit');
  });

  it('marks automation as skipped when filters do not match', async () => {
    const supabase = new SupabaseMock({
      'automations.query': [{
        data: [{
          id: 'a2',
          name: 'Filter Check',
          filter: { column_id: 'status-col', changes_to: 'status-a' },
          automation_actions: [],
        }],
        error: null,
      }],
      'companies.single': [{ data: { account_id: 'acct-1' }, error: null }],
    });

    await fireJobTrigger(supabase as any, baseInput);

    const runInsert = supabase.inserts.find((x) => x.table === 'automation_runs');
    expect(runInsert?.values.status).toBe('skipped');
    expect(runInsert?.values.skip_reason).toContain('Filter did not match');
  });

  it('fails the run and stops on the first failed action', async () => {
    const supabase = new SupabaseMock({
      'automations.query': [{
        data: [{
          id: 'a3',
          name: 'Failure Path',
          filter: {},
          automation_actions: [
            { id: 'act-1', type: 'unknown.action', config: {}, sort_order: 1 },
            { id: 'act-2', type: 'unknown.action', config: {}, sort_order: 2 },
          ],
        }],
        error: null,
      }],
      'companies.single': [{ data: { account_id: 'acct-1' }, error: null }],
      'automation_runs.maybeSingle': [{ data: { id: 'run-1' }, error: null }],
    });

    await fireJobTrigger(supabase as any, baseInput);

    const runInsert = supabase.inserts.find((x) => x.table === 'automation_runs');
    expect(runInsert?.values.status).toBe('failed');
    expect(runInsert?.values.actions_attempted).toBe(1);
    expect(runInsert?.values.actions_succeeded).toBe(0);
    expect(runInsert?.values.actions_failed).toBe(1);
    expect(runInsert?.values.action_results).toHaveLength(1);

    const activityInsert = supabase.inserts.find((x) => x.table === 'activity_events');
    expect(activityInsert?.values.event_type).toBe('automation.run.failed');
  });

  it('evaluates DB-backed conditions and records a successful run', async () => {
    const supabase = new SupabaseMock({
      'automations.query': [{
        data: [{
          id: 'a4',
          name: 'Condition Pass',
          filter: {
            conditions: [{ type: 'number_gt', column_id: 'score-col', value: 5 }],
          },
          automation_actions: [],
        }],
        error: null,
      }],
      'companies.single': [{ data: { account_id: 'acct-1' }, error: null }],
      'board_cells.maybeSingle': [{
        data: {
          value_text: null,
          value_number: 8,
          value_date: null,
          value_status_label_id: null,
        },
        error: null,
      }],
      'automation_runs.maybeSingle': [{ data: { id: 'run-2' }, error: null }],
    });

    await fireJobTrigger(supabase as any, baseInput);

    const runInsert = supabase.inserts.find((x) => x.table === 'automation_runs');
    expect(runInsert?.values.status).toBe('success');
    expect(runInsert?.values.actions_attempted).toBe(0);
    expect(runInsert?.values.actions_failed).toBe(0);

    const activityInsert = supabase.inserts.find((x) => x.table === 'activity_events');
    expect(activityInsert?.values.event_type).toBe('automation.run.completed');
  });
});
