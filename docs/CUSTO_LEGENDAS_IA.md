# Análise de custo — legendas com IA
# Decisão: OpenAI whisper-1 (timestamps por segmento)

## Comparativo (batch / pré-gravado, 2026)

| Provedor | Modelo | US$/min | 1 min de clip | 100 h/mês | Melhor para |
|---|---|---:|---:|---:|---|
| AssemblyAI | Universal-2 slim | ~0,002–0,0025 | ~US$ 0,0025 | ~US$ 15 | Preço mínimo |
| OpenAI | gpt-4o-mini-transcribe | 0,003 | US$ 0,003 | US$ 18 | Texto barato (menos ideal p/ VTT) |
| Deepgram | Nova-3 batch | ~0,0043 | US$ 0,0043 | ~US$ 26 | Streaming / baixa latência |
| **OpenAI** | **whisper-1** | **0,006** | **US$ 0,006** | **US$ 36** | **Legendas com timestamps** |
| OpenAI | gpt-4o-transcribe | 0,006 | US$ 0,006 | US$ 36 | Máxima acurácia |
| Google Chirp | batch dinâmico | ~0,004 | US$ 0,004 | US$ 24 | Ecossistema GCP |
| AWS Transcribe | standard | ~0,024 | US$ 0,024 | US$ 144 | Já está no AWS |

## Por que whisper-1 neste produto

1. **Timestamps por segmento** — gera VTT/overlay sincronizado no player.
2. **Português sólido** — bom para lives, reels e cortes.
3. **Custo ainda irrelevante em clip curto** — 30s ≈ US$ 0,003.
4. **Uma Edge Function** — sem GPU, sem fila, sem infra extra.
5. **API estável** — `verbose_json` + `timestamp_granularities=segment`.

> `gpt-4o-mini-transcribe` é mais barato, mas o foco do Clipe Aqui é legenda sincronizada.
> Se no futuro só precisar do texto corrido, dá para trocar o model na Edge Function.

## Estimativa prática (Clipe Aqui)

| Uso mensal | Minutos legendados | Custo whisper-1 |
|---|---:|---:|
| Solo / teste | 30 min | ~US$ 0,18 |
| Criador ativo | 300 min (5 h) | ~US$ 1,80 |
| SaaS pequeno (50 users × 20 min) | 1.000 min | ~US$ 6,00 |
| Escala média | 6.000 min (100 h) | ~US$ 36 |

## Custos adjacentes (não são a IA)

- **S3 storage**: ~US$ 0,023/GB-mês + egress.
- **Supabase**: plano free/pro conforme auth + DB.
- **ffmpeg.wasm**: grátis no browser (CPU do usuário).

## Alternativa se o volume explodir

- AssemblyAI / Deepgram com word timestamps.
- Self-host Whisper só acima de ~1.000 h/mês.
