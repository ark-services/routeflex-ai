create table public.activity_events (
  id             uuid        primary key default gen_random_uuid(),
  company_id     uuid        not null references public.companies(id) on delete cascade,
  job_id         uuid        not null references public.jobs(id) on delete cascade,
  actor_user_id  uuid        null,
  actor_type     text        not null check (actor_type in ('user', 'system', 'automation')),
  event_type     text        not null,
  entity_type    text        not null,
  entity_id      uuid        null,
  summary        text        not null,
  data           jsonb       not null default '{}',
  created_at     timestamptz not null default now()
);

create index activity_events_company_job_created_idx
  on public.activity_events(company_id, job_id, created_at desc);
create index activity_events_job_created_idx
  on public.activity_events(job_id, created_at desc);
create index activity_events_event_type_idx
  on public.activity_events(event_type, created_at desc);

alter table public.activity_events enable row level security;

create policy "Members can view activity events"
  on public.activity_events for select
  using (public.is_company_member(company_id));

create policy "Members can insert activity events"
  on public.activity_events for insert
  with check (public.is_company_member(company_id));
