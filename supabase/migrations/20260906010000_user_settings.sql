-- BUG-05: a tela de Configurações (notificações, tema, idioma) só guardava
-- os valores em useState — "Salvar Configurações" apenas disparava um
-- toast, sem nenhuma persistência real (nem banco, nem localStorage). Ao
-- recarregar a página os valores voltavam sempre ao padrão.

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notify_email boolean not null default true,
  notify_push boolean not null default false,
  notify_deadlines boolean not null default true,
  notify_cases boolean not null default true,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  language text not null default 'pt-BR' check (language in ('pt-BR', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_settings is
  'Preferências pessoais do usuário (notificações, tema, idioma) — uma linha por usuário, criada/atualizada via upsert a partir da tela de Configurações.';

alter table public.user_settings enable row level security;

create policy "Users can view their own settings"
on public.user_settings for select
using (auth.uid() = user_id);

create policy "Users can insert their own settings"
on public.user_settings for insert
with check (auth.uid() = user_id);

create policy "Users can update their own settings"
on public.user_settings for update
using (auth.uid() = user_id);

create trigger update_user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.update_updated_at_column();
