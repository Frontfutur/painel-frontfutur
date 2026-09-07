# Painel Frontfutur

Painel interno da Frontfutur. Um login só; cada módulo é uma página.
Hoje tem o módulo **Jurídico** — o quadro de trabalho com a assessoria.

- Página estática, hospedada no **GitHub Pages**.
- Dados, login e arquivos no **Supabase** (plano gratuito).
- Quem pode entrar é definido na tabela `pessoas`. Quem não está lá não lê nada.

---

## Estado atual (07/09/2026)

Projeto Supabase **`painel-frontfutur`** já criado (org *Frontfutur's Org*, plano Free, São Paulo).
Ref do projeto: `wvnagofjhkqgenzukprc`.

- [x] Tabelas, travas de acesso (RLS), tempo real e bucket `anexos` — criados
- [x] 34 tarefas carregadas em `tarefas`
- [x] `config.js` preenchido com a URL e a chave publishable
- [ ] `sql/03-pessoas.sql` — falta preencher os e-mails e rodar
- [ ] Usuários em **Authentication → Users** — falta criar (um por e-mail, com senha, *Auto Confirm User*)
- [ ] Publicar no GitHub Pages

Enquanto não existir usuário em *Authentication*, ninguém consegue entrar — nem você.

---

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | Página inicial — lista os módulos que a pessoa pode abrir |
| `juridico.html` + `juridico.js` | O quadro jurídico (lista geral, kanban, frentes) |
| `auth.js` | Login e permissão. Compartilhado por todas as páginas |
| `config.js` | **As duas chaves do Supabase.** É o único arquivo que você edita |
| `estilo.css` | Todo o visual |
| `estrutura.sql` | Cria as tabelas, as travas de acesso e o bucket de arquivos |
| `sql/02-dados.sql` | Carrega as 34 tarefas iniciais — **fora do repositório**, cita pessoas do time |

---

## Montar do zero

### 1. Criar o projeto no Supabase

1. `supabase.com` → **New project**, plano Free, região **South America (São Paulo)**.
2. Guarde a senha do banco que ele pedir (você não vai usar no dia a dia, mas não dá pra recuperar).

### 2. Criar as tabelas

1. No projeto, abra **SQL Editor** → **New query**.
2. Antes de rodar, abra `estrutura.sql` e **troque os três e-mails** do bloco `insert into public.pessoas`.
3. Cole o arquivo inteiro e clique em **Run**.
4. Abra uma query nova, cole `sql/02-dados.sql` e rode também.

### 3. Criar os usuários

**Authentication → Users → Add user**, uma vez para cada e-mail que você colocou em `pessoas`:

- e-mail exatamente igual ao que está na tabela;
- defina uma senha;
- marque **Auto Confirm User** (senão a pessoa precisa confirmar por e-mail).

Mande a senha para cada um por onde vocês já conversam. Cada um troca a própria depois, se quiser.

### 4. Ligar a página no banco

**Project Settings → API**, copie:

- **Project URL** → cole em `config.js`, campo `url`
- **anon public** → cole em `config.js`, campo `anon`

> A chave **`service_role`**, que fica logo abaixo, **não entra em lugar nenhum aqui**.
> Ela ignora todas as travas de acesso. Se ela vazar, qualquer pessoa lê e apaga tudo.
> A `anon` é feita para ficar visível no código — é o comportamento esperado.

### 5. Publicar no GitHub Pages

```bash
git init
git add .
git commit -m "Painel Frontfutur"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/frontfutur-painel.git
git push -u origin main
```

No repositório: **Settings → Pages → Source: Deploy from a branch → main / (root)**.
Em um ou dois minutos o painel está em `https://SEU-USUARIO.github.io/frontfutur-painel/`.

Para usar domínio próprio (`juridico.frontfutur.com`), em **Settings → Pages → Custom domain**
e um registro `CNAME` apontando para `SEU-USUARIO.github.io` no DNS.

---

## Adicionar um módulo novo

1. Escolha um nome curto, ex.: `prestadores`.
2. Adicione o nome no `modulos` de quem pode abrir:
   ```sql
   update public.pessoas
      set modulos = array_append(modulos, 'prestadores')
    where email = 'jonas@exemplo.com';
   ```
3. Crie a tabela e a política de acesso do módulo:
   ```sql
   alter table public.suatabela enable row level security;
   create policy suatabela_acesso on public.suatabela
     for all to authenticated
     using (public.pode('prestadores')) with check (public.pode('prestadores'));
   ```
4. Crie `prestadores.html` copiando a estrutura do `juridico.html` (mesma `<div class="gate">`,
   mesmos `<script>` no fim) e, no seu JS, envolva tudo em:
   ```js
   FF.start("prestadores", function(){ /* seu código */ });
   ```
5. Em `index.html`, acrescente o módulo na lista `MODULOS`.

---

## Limites do plano gratuito

- 500 MB de banco e 1 GB de arquivos.
- Arquivo até 45 MB por anexo (acima disso, use link).
- O projeto **hiberna após 7 dias sem ninguém abrir**. Volta com um clique no painel do Supabase.
