import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Variáveis SUPABASE_* ausentes no runtime" }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return json({ error: "Sessão inválida" }, 401);

    const {
      clipId,
      filename,
      contentType = "video/mp4",
    } = await req.json();

    if (!clipId || !filename) {
      return json({ error: "clipId e filename são obrigatórios" }, 400);
    }

    const bucket = Deno.env.get("AWS_S3_BUCKET") ?? "clips";
    const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${user.id}/${clipId}/${Date.now()}-${safeName}`;

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUploadUrl(key, { upsert: true });

    if (error || !data) {
      return json(
        {
          error: "Falha ao criar URL de upload",
          detail: error?.message ?? "sem dados",
        },
        502,
      );
    }

    // Sempre usar a URL pública oficial do Storage (evita secret apontando para /s3)
    const { data: publicData } = admin.storage.from(bucket).getPublicUrl(key);
    const override = Deno.env.get("AWS_S3_PUBLIC_BASE_URL")?.trim();
    const publicUrl =
      override && override.includes("/object/public/")
        ? `${override.replace(/\/$/, "")}/${key}`
        : publicData.publicUrl;

    return json({
      uploadUrl: data.signedUrl,
      token: data.token,
      key,
      bucket,
      publicUrl,
      contentType,
      expiresIn: 900,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      500,
    );
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
