# Clipe Aqui

SaaS mobile-first para **cortar**, **legendar com IA** e **salvar clips no S3**, com link de compartilhamento.

Stack: **Vite + React + TypeScript + Tailwind + Supabase + AWS S3 + OpenAI**.

## Setup rápido

### 1. Variáveis do frontend

Copie `.env.example` → `.env` (já há um `.env` no projeto):

```env
VITE_SUPABASE_URL=https://egupwrwzcuqazlshhfoq.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua_publishable_key
VITE_APP_URL=http://localhost:5173
```

> No Vite o prefixo é `VITE_` (não `NEXT_PUBLIC_`). Use a mesma URL/key do Supabase.

### 2. Banco (SQL)

No **SQL Editor** do Supabase, rode nesta ordem:

1. `supabase/migrations/001_clips.sql` — tabela `clips` + RLS  
2. `supabase/migrations/002_users.sql` — tabela `users` + trigger ao cadastrar no Auth  

O trigger `on_auth_user_created` cria a linha em `public.users` com nome, e-mail e WhatsApp vindos do metadata do signup.

### 3. Auth (e-mail + Google)

Em Authentication → Providers:
- **Email** ativo  
- **Google** ativo, com Client ID / Secret do Google Cloud  

Console Google (criar projeto + OAuth):  
https://console.cloud.google.com/projectcreate  

Credenciais OAuth:  
https://console.cloud.google.com/apis/credentials  

**Redirect URI no Google** (Authorized redirect URIs):  
`https://egupwrwzcuqazlshhfoq.supabase.co/auth/v1/callback`

**Redirect URLs no Supabase** (URL Configuration):  
`http://localhost:5173/**` e `https://clipe-aqui.vercel.app/**` (inclua `/auth/callback`).

Para desenvolvimento, pode desativar “Confirm email”.

### 4. Secrets das Edge Functions

| Secret | Obrigatório | Uso |
|---|---|---|
| `OPENAI_API_KEY` | sim | Legendas |
| `AWS_S3_BUCKET` | sim | ex.: `clips` |
| `AWS_S3_PUBLIC_BASE_URL` | sim | `https://<ref>.supabase.co/storage/v1/object/public/clips` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já vêm no runtime.

`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` **não são mais usados** por `get-upload-url` (upload via signed URL nativa do Storage).

Deploy:

```bash
npx supabase login
npx supabase link --project-ref egupwrwzcuqazlshhfoq
npx supabase functions deploy transcribe
npx supabase functions deploy get-upload-url
```

### 5. Bucket Storage

Crie o bucket público `clips` (MIME de vídeo + limite de tamanho). CORS do S3 AWS não é necessário.

### 6. Rodar

```bash
npm install
npm run dev
```

## Features

1. **Cortar clip** — trim start/end + export com ffmpeg.wasm no browser  
2. **Legendas IA** — OpenAI `whisper-1` via Edge Function (timestamps + VTT)  
3. **Salvar no S3** — URL assinada + metadata no Supabase  
4. **Compartilhar** — link público `/s/:token` (Web Share API + copiar)

## Custo das legendas

Escolhemos **OpenAI whisper-1** (~**US$ 0,006/min**) pela qualidade dos timestamps.

Análise completa: [`docs/CUSTO_LEGENDAS_IA.md`](docs/CUSTO_LEGENDAS_IA.md)

| Clip | Custo aprox. |
|---|---:|
| 15 s | US$ 0,0015 |
| 60 s | US$ 0,006 |
| 5 min | US$ 0,030 |

## Fluxo do produto

```
Upload → Corte → Legenda (opcional) → S3 → Biblioteca / Share
```
