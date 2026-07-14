import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** whisper-1 ≈ US$ 0.006 / minuto — timestamps por segmento confiáveis p/ legendas */
const COST_PER_MINUTE_USD = 0.006;
const FREE_LIFETIME_CLIPS = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return json({ error: "OPENAI_API_KEY não configurada" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Variáveis SUPABASE_* ausentes" }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Sessão inválida" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await admin
      .from("users")
      .select("credits, lifetime_clips_created")
      .eq("id", user.id)
      .maybeSingle();

    const lifetime = Number(profile?.lifetime_clips_created ?? 0);
    const credits = Number(profile?.credits ?? 0);
    const canCreate = lifetime < FREE_LIFETIME_CLIPS || credits > 0;
    if (!canCreate) {
      return json(
        {
          error:
            "QUOTA_EXCEEDED: Limite grátis de 10 clips atingido. Compre créditos para gerar legendas.",
        },
        402,
      );
    }

    const form = await req.formData();
    const audio = form.get("audio");
    const language = String(form.get("language") ?? "pt");
    const durationSeconds = Number(form.get("duration_seconds") ?? 0);

    if (!(audio instanceof File)) {
      return json({ error: "Arquivo de áudio obrigatório" }, 400);
    }

    const body = new FormData();
    body.append("file", audio, audio.name || "clip.webm");
    body.append("model", "whisper-1");
    body.append("response_format", "verbose_json");
    body.append("timestamp_granularities[]", "segment");
    body.append("timestamp_granularities[]", "word");
    if (language) body.append("language", language);

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      return json({ error: "Falha na transcrição", detail: errText }, 502);
    }

    const data = await res.json();
    let rawSegments = (data.segments ?? []).map(
      (s: { start: number; end: number; text: string }) => ({
        start: s.start,
        end: s.end,
        text: String(s.text ?? "").trim(),
      }),
    ).filter((s: { text: string }) => s.text.length > 0);

    if (rawSegments.length === 0 && data.text) {
      rawSegments.push({
        start: 0,
        end: Math.max(durationSeconds, 1),
        text: String(data.text).trim(),
      });
    }

    const words = (data.words ?? [])
      .map((w: { start?: number; end?: number; word?: string }) => ({
        start: Number(w.start) || 0,
        end: Number(w.end) || 0,
        word: String(w.word ?? "").trim(),
      }))
      .filter((w: { word: string }) => w.word.length > 0);

    rawSegments = refineWithWords(rawSegments, words);

    const segments = normalizeSegments(rawSegments, durationSeconds);

    const minutes = Math.max(durationSeconds, 1) / 60;
    const estimatedCostUsd = Number((minutes * COST_PER_MINUTE_USD).toFixed(6));

    const vtt = toVtt(segments);

    return json({
      text: data.text ?? "",
      segments,
      words,
      vtt,
      model: "whisper-1",
      estimated_cost_usd: estimatedCostUsd,
      cost_per_minute_usd: COST_PER_MINUTE_USD,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      500,
    );
  }
});

function refineWithWords(
  segments: Array<{ start: number; end: number; text: string }>,
  words: Array<{ start: number; end: number; word: string }>,
) {
  if (!segments.length || !words.length) return segments;

  return segments.map((seg, index) => {
    const inSeg = words.filter((w) => {
      const mid = (w.start + w.end) / 2;
      return mid >= seg.start - 0.15 && mid <= seg.end + 0.15;
    });

    if (!inSeg.length) {
      if (index === 0 && seg.start <= 0.12 && words[0].start > seg.start + 0.05) {
        return {
          ...seg,
          start: words[0].start,
          end: Math.max(seg.end, words[0].end),
        };
      }
      return seg;
    }

    return {
      ...seg,
      start: inSeg[0].start,
      end: Math.max(inSeg[inSeg.length - 1].end, inSeg[0].start + 0.4),
    };
  });
}

function normalizeSegments(
  segments: Array<{ start: number; end: number; text: string }>,
  clipDuration: number,
) {
  const cleaned = [...segments].sort((a, b) => a.start - b.start);
  if (cleaned.length === 0) return cleaned;

  const MIN_DURATION = 0.4;
  const HOLD_PAD = 0.35;
  const LAST_EXIT_PAD = 0.12;
  const FILL_GAP = 1.35;
  const out: Array<{ start: number; end: number; text: string }> = [];

  for (let i = 0; i < cleaned.length; i++) {
    const cur = cleaned[i];
    const next = cleaned[i + 1];
    const start = Math.max(0, cur.start);
    const isLast = !next;
    let end = Math.max(cur.end, start + MIN_DURATION);

    if (isLast) {
      end += LAST_EXIT_PAD;
    } else {
      end += HOLD_PAD;
      if (end >= next.start) {
        end = Math.max(start + MIN_DURATION, next.start - 0.04);
      } else if (next.start - end <= FILL_GAP) {
        end = next.start;
      }
    }

    if (clipDuration > 0) {
      end = Math.min(end, clipDuration);
    }

    out.push({ start, end: Math.max(end, start + MIN_DURATION), text: cur.text });
  }

  return out;
}

function toVtt(
  segments: Array<{ start: number; end: number; text: string }>,
): string {
  const lines = ["WEBVTT", ""];
  segments.forEach((s, i) => {
    lines.push(String(i + 1));
    lines.push(`${formatTs(s.start)} --> ${formatTs(s.end)}`);
    lines.push(s.text);
    lines.push("");
  });
  return lines.join("\n");
}

function formatTs(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${String(ms).padStart(3, "0")}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
