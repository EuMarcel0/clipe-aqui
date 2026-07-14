import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3@3.758.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.758.0";

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

    if (!supabaseUrl || !anonKey) {
      return json({ error: "Variáveis SUPABASE_* ausentes no runtime" }, 500);
    }

    const r2AccessKey = Deno.env.get("R2_ACCESS_KEY_ID");
    const r2SecretKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const r2AccountId = Deno.env.get("R2_ACCOUNT_ID");
    const r2Bucket = Deno.env.get("R2_BUCKET") ?? "clipe-aqui-clips";
    const r2PublicBase = (Deno.env.get("R2_PUBLIC_BASE_URL") ?? "").replace(
      /\/$/,
      "",
    );
    const r2Endpoint =
      Deno.env.get("R2_ENDPOINT")?.replace(/\/$/, "") ??
      (r2AccountId
        ? `https://${r2AccountId}.r2.cloudflarestorage.com`
        : "");

    if (!r2AccessKey || !r2SecretKey || !r2Endpoint || !r2PublicBase) {
      return json(
        {
          error:
            "R2 não configurado. Defina R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT (ou R2_ACCOUNT_ID) e R2_PUBLIC_BASE_URL.",
        },
        500,
      );
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

    const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${user.id}/${clipId}/${Date.now()}-${safeName}`;
    const expiresIn = 900;

    const s3 = new S3Client({
      region: "auto",
      endpoint: r2Endpoint,
      credentials: {
        accessKeyId: r2AccessKey,
        secretAccessKey: r2SecretKey,
      },
      forcePathStyle: true,
    });

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: r2Bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn },
    );

    const publicUrl = `${r2PublicBase}/${key}`;

    return json({
      uploadUrl,
      key,
      bucket: r2Bucket,
      publicUrl,
      contentType,
      expiresIn,
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
