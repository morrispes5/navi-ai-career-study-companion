-- Navi core data model. All user data lives behind RLS policies.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  target_role text not null,
  current_level text not null,
  weekly_hours smallint not null check (weekly_hours > 0 and weekly_hours <= 168),
  target_months smallint check (target_months > 0 and target_months <= 60),
  learning_preference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.learning_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  target_role text not null,
  weekly_hours smallint not null check (weekly_hours > 0 and weekly_hours <= 168),
  target_months smallint check (target_months > 0 and target_months <= 60),
  status text not null default 'active' check (status in ('draft', 'active', 'paused', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plan_milestones (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.learning_plans(id) on delete cascade,
  position smallint not null check (position >= 0),
  range_label text not null,
  title text not null,
  description text not null,
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (plan_id, position)
);

create table public.plan_tasks (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.plan_milestones(id) on delete cascade,
  position smallint not null check (position >= 0),
  title text not null,
  description text,
  estimated_minutes smallint check (estimated_minutes > 0 and estimated_minutes <= 1440),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (milestone_id, position)
);

create table public.memory_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  value text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 10000),
  created_at timestamptz not null default now()
);

create index learning_plans_user_id_idx on public.learning_plans(user_id);
create index plan_milestones_plan_id_idx on public.plan_milestones(plan_id);
create index plan_tasks_milestone_id_idx on public.plan_tasks(milestone_id);
create index memory_facts_user_id_idx on public.memory_facts(user_id);
create index conversations_user_id_idx on public.conversations(user_id);
create index chat_messages_conversation_id_idx on public.chat_messages(conversation_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_learning_plans_updated_at
before update on public.learning_plans
for each row execute function public.set_updated_at();

create trigger set_memory_facts_updated_at
before update on public.memory_facts
for each row execute function public.set_updated_at();

create trigger set_conversations_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

alter table public.profiles enable row level security;
alter table public.learning_plans enable row level security;
alter table public.plan_milestones enable row level security;
alter table public.plan_tasks enable row level security;
alter table public.memory_facts enable row level security;
alter table public.conversations enable row level security;
alter table public.chat_messages enable row level security;

create policy "Users manage their own profile"
on public.profiles for all to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Users manage their own learning plans"
on public.learning_plans for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage milestones in their own plans"
on public.plan_milestones for all to authenticated
using (exists (
  select 1 from public.learning_plans
  where learning_plans.id = plan_milestones.plan_id
    and learning_plans.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.learning_plans
  where learning_plans.id = plan_milestones.plan_id
    and learning_plans.user_id = (select auth.uid())
));

create policy "Users manage tasks in their own plans"
on public.plan_tasks for all to authenticated
using (exists (
  select 1
  from public.plan_milestones
  join public.learning_plans on learning_plans.id = plan_milestones.plan_id
  where plan_milestones.id = plan_tasks.milestone_id
    and learning_plans.user_id = (select auth.uid())
))
with check (exists (
  select 1
  from public.plan_milestones
  join public.learning_plans on learning_plans.id = plan_milestones.plan_id
  where plan_milestones.id = plan_tasks.milestone_id
    and learning_plans.user_id = (select auth.uid())
));

create policy "Users manage their own memory facts"
on public.memory_facts for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage their own conversations"
on public.conversations for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage messages in their own conversations"
on public.chat_messages for all to authenticated
using (exists (
  select 1 from public.conversations
  where conversations.id = chat_messages.conversation_id
    and conversations.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.conversations
  where conversations.id = chat_messages.conversation_id
    and conversations.user_id = (select auth.uid())
));

revoke execute on function public.set_updated_at() from public;
