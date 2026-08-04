-- Additive upgrade for Navi's role-specific plans, history, and editable memories.

alter table public.learning_plans
  add column if not exists archived_at timestamptz,
  add column if not exists template_version text not null default 'v1';

alter table public.learning_plans
  drop constraint if exists learning_plans_status_check;

alter table public.learning_plans
  add constraint learning_plans_status_check check (status in ('draft', 'active', 'paused', 'completed', 'archived'));

alter table public.plan_milestones
  add column if not exists template_key text;

alter table public.plan_tasks
  add column if not exists template_key text,
  add column if not exists task_type text not null default 'practice';

alter table public.memory_facts
  add column if not exists category text not null default 'note';

update public.memory_facts
set category = 'profile'
where label in ('Target', 'Waktu tersedia', 'Cara belajar') and category = 'note';

create unique index if not exists plan_milestones_template_key_idx
  on public.plan_milestones(plan_id, template_key)
  where template_key is not null;

create unique index if not exists plan_tasks_template_key_idx
  on public.plan_tasks(milestone_id, template_key)
  where template_key is not null;

create index if not exists learning_plans_user_status_idx
  on public.learning_plans(user_id, status, created_at desc);

create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages(conversation_id, created_at);
