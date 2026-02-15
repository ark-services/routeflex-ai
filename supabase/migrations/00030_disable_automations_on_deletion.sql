-- ============================================================================
-- Auto-disable automations when referenced columns/labels are deleted
-- ============================================================================

-- Function to disable automations referencing a deleted board_status_label
create or replace function disable_automations_for_deleted_label()
returns trigger as $$
declare
  affected_count int;
begin
  -- Find automations where filter->>'changes_to' matches the deleted label ID
  -- OR where any action config references this label ID
  update public.automations
  set
    is_enabled = false,
    updated_at = now()
  where
    company_id = (
      select c.company_id
      from public.board_columns c
      where c.id = OLD.column_id
    )
    and (
      -- Check filter for changes_to reference
      (filter->>'changes_to' = OLD.id::text)
      or
      -- Check automation_actions.config for label references
      id in (
        select aa.automation_id
        from public.automation_actions aa
        where aa.automation_id = automations.id
        and (
          -- change_status action with target_label
          (aa.type = 'change_status' and aa.config->>'target_label' = OLD.id::text)
          or
          -- set_status action with status_label_id
          (aa.type = 'set_status' and aa.config->>'status_label_id' = OLD.id::text)
        )
      )
    );

  get diagnostics affected_count = row_count;

  raise notice 'Disabled % automation(s) referencing deleted status label: %', affected_count, OLD.label;

  return OLD;
end;
$$ language plpgsql security definer;

-- Trigger on board_status_labels deletion
create trigger disable_automations_before_label_delete
  before delete on public.board_status_labels
  for each row
  execute function disable_automations_for_deleted_label();

-- Function to disable automations referencing a deleted board_column
create or replace function disable_automations_for_deleted_column()
returns trigger as $$
declare
  affected_count int;
begin
  -- Find automations where filter->>'column_id' matches the deleted column
  -- OR where any action config references this column
  update public.automations
  set
    is_enabled = false,
    updated_at = now()
  where
    company_id = OLD.company_id
    and (
      -- Check filter for column_id reference (board.status_changes_to trigger)
      (filter->>'column_id' = OLD.id::text)
      or
      -- Check automation_actions.config for column references
      id in (
        select aa.automation_id
        from public.automation_actions aa
        where aa.automation_id = automations.id
        and (
          -- Any action type that references column_id
          (aa.config->>'column_id' = OLD.id::text)
        )
      )
    );

  get diagnostics affected_count = row_count;

  raise notice 'Disabled % automation(s) referencing deleted column: %', affected_count, OLD.name;

  return OLD;
end;
$$ language plpgsql security definer;

-- Trigger on board_columns deletion
create trigger disable_automations_before_column_delete
  before delete on public.board_columns
  for each row
  execute function disable_automations_for_deleted_column();

comment on function disable_automations_for_deleted_label is
  'Automatically disables automations that reference a status label before it is deleted';

comment on function disable_automations_for_deleted_column is
  'Automatically disables automations that reference a board column before it is deleted';
