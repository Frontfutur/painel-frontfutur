-- ============================================================
--  PAINEL FRONTFUTUR — estrutura do banco (Supabase)
--  Cole tudo de uma vez no SQL Editor e rode. Roda uma vez só;
--  rodar de novo não quebra nada.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. QUEM ENTRA, E EM QUAIS MÓDULOS
--    Só e-mails desta tabela leem ou escrevem qualquer coisa.
--    TROQUE pelos e-mails de verdade antes de rodar.
--    `modulos` decide quais páginas do painel a pessoa abre.
-- ------------------------------------------------------------
create table if not exists public.pessoas (
  email   text primary key,
  nome    text not null,
  modulos text[] not null default '{}'
);

insert into public.pessoas (email, nome, modulos) values
  ('troque@pelo-seu-email.com', 'Nome', '{juridico,prestadores,propostas}')
on conflict (email) do update
  set nome = excluded.nome, modulos = excluded.modulos;

-- As outras pessoas entram pelo sql/03-pessoas.sql.

-- "quem está pedindo tem acesso a este módulo?"
create or replace function public.pode(modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pessoas p
    where p.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and modulo = any(p.modulos)
  );
$$;

-- ------------------------------------------------------------
-- 2. MÓDULO JURÍDICO — tarefas, anotações e anexos
-- ------------------------------------------------------------
create table if not exists public.tarefas (
  id          text primary key,
  titulo      text not null default 'Nova tarefa',
  contexto    text not null default '',
  frente      text not null default 'f1',    -- f1 | f2 | f3 | f4
  status      text not null default 'todo',  -- todo | doing | waiting | done
  responsavel text not null default '',
  depende_de  text not null default '',
  prioridade  text not null default 'media', -- alta | media | baixa
  prazo       date,
  ordem       double precision not null default 0,
  criado_em   timestamptz not null default now(),
  alterado_em timestamptz not null default now()
);

create table if not exists public.anotacoes (
  id        uuid primary key default gen_random_uuid(),
  tarefa_id text not null references public.tarefas(id) on delete cascade,
  autor     text not null default '',
  texto     text not null,
  criado_em timestamptz not null default now()
);
create index if not exists anotacoes_tarefa_idx on public.anotacoes(tarefa_id);

create table if not exists public.anexos (
  id        uuid primary key default gen_random_uuid(),
  tarefa_id text not null references public.tarefas(id) on delete cascade,
  tipo      text not null check (tipo in ('arquivo','link')),
  nome      text not null,
  url       text,     -- quando tipo = 'link'
  caminho   text,     -- quando tipo = 'arquivo' (chave no bucket)
  tamanho   bigint,
  autor     text not null default '',
  criado_em timestamptz not null default now()
);
create index if not exists anexos_tarefa_idx on public.anexos(tarefa_id);

-- ------------------------------------------------------------
-- 3. TRAVA DE ACESSO (RLS)
--    Sem isto, qualquer um com o endereço do projeto lê tudo.
-- ------------------------------------------------------------
alter table public.pessoas   enable row level security;
alter table public.tarefas   enable row level security;
alter table public.anotacoes enable row level security;
alter table public.anexos    enable row level security;

drop policy if exists pessoas_eu       on public.pessoas;
drop policy if exists tarefas_acesso   on public.tarefas;
drop policy if exists anotacoes_acesso on public.anotacoes;
drop policy if exists anexos_acesso    on public.anexos;

-- cada pessoa lê só a própria linha (é como a página descobre nome e módulos)
create policy pessoas_eu on public.pessoas
  for select to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy tarefas_acesso on public.tarefas
  for all to authenticated using (public.pode('juridico')) with check (public.pode('juridico'));
create policy anotacoes_acesso on public.anotacoes
  for all to authenticated using (public.pode('juridico')) with check (public.pode('juridico'));
create policy anexos_acesso on public.anexos
  for all to authenticated using (public.pode('juridico')) with check (public.pode('juridico'));

-- ------------------------------------------------------------
-- 4. TEMPO REAL — faz a tela dos outros atualizar sozinha
-- ------------------------------------------------------------
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.tarefas';   exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.anotacoes'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.anexos';    exception when others then null; end;
end $$;

-- ------------------------------------------------------------
-- 5. BUCKET DOS ARQUIVOS
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('anexos', 'anexos', false)
on conflict (id) do nothing;

drop policy if exists anexos_ver    on storage.objects;
drop policy if exists anexos_subir  on storage.objects;
drop policy if exists anexos_apagar on storage.objects;

create policy anexos_ver on storage.objects
  for select to authenticated using (bucket_id = 'anexos' and public.pode('juridico'));
create policy anexos_subir on storage.objects
  for insert to authenticated with check (bucket_id = 'anexos' and public.pode('juridico'));
create policy anexos_apagar on storage.objects
  for delete to authenticated using (bucket_id = 'anexos' and public.pode('juridico'));

-- ------------------------------------------------------------
--  PRONTO. Agora:
--  1) rode o 02-dados.sql para carregar as 34 tarefas;
--  2) vá em Authentication > Users > Add user e crie um usuário
--     (e-mail + senha, marcando "Auto Confirm User") para cada
--     e-mail que você colocou na tabela `pessoas`.
-- ------------------------------------------------------------
