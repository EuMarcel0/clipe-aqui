# Clipe Aqui

SaaS mobile-first para **cortar**, **legendar com IA** e **salvar clips no S3**, com link de compartilhamento.

Stack: **Vite + React + TypeScript + Tailwind + Supabase + AWS S3 + OpenAI**.

## Setup rápido

### 1. Variáveis do frontend

Copie `.env.example` → `.env` (já há um `.env` no projeto):

```env
VITE_SUPABASE_URL=https://egupwrwzcuqazlshhfoq.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua_publishable_key
```

> No Vite o prefixo é `VITE_` (não `NEXT_PUBLIC_`). Use a mesma URL/key do Supabase.

### 2. Banco (SQL)

No **SQL Editor** do Supabase, rode:

`supabase/migrations/001_clips.sql`

Isso cria só a tabela `clips` + RLS. Não mexe nas tabelas que você já tem.

### 3. Auth

Em Authentication → Providers, deixe **Email** ativo.  
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
