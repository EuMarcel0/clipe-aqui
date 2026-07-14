import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_IDS = 50;

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

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Sessão inválida" }, 401);

    const body = await req.json().catch(() => ({}));
    const rawIds = Array.isArray(body.clipIds)
      ? body.clipIds
      : body.clipId
      ? [body.clipId]
      : [];
    const clipIds = [
      ...new Set(
        rawIds
          .map((id: unknown) => String(id ?? "").trim())
          .filter((id: string) => id.length > 0),
      ),
    ].slice(0, MAX_IDS);

    if (clipIds.length === 0) {
      return json({ error: "clipIds é obrigatório" }, 400);
    }

    // Só os clips do usuário autenticado
    const { data: rows, error: listError } = await userClient
      .from("clips")
      .select("id, s3_key")
      .eq("user_id", user.id)
      .in("id", clipIds);

    if (listError) return json({ error: listError.message }, 500);

    const owned = (rows ?? []) as Array<{ id: string; s3_key: string | null }>;
    if (owned.length === 0) {
      return json({ error: "Nenhum clip encontrado" }, 404);
    }

    const ownedIds = owned.map((r) => r.id);
    const keys = owned
      .map((r) => r.s3_key)
      .filter((k): k is string => Boolean(k && k.trim()));

    const r2Errors: string[] = [];
    if (keys.length > 0) {
      const deletedR2 = await deleteR2Objects(keys);
      r2Errors.push(...deletedR2.errors);
    }

    const { error: deleteError } = await userClient
      .from("clips")
      .delete()
      .eq("user_id", user.id)
      .in("id", ownedIds);

    if (deleteError) {
      return json(
        {
          error: deleteError.message,
          r2Deleted: keys.length - r2Errors.length,
          r2Errors,
        },
        500,
      );
    }

    return json({
      deleted: ownedIds,
      r2Deleted: keys.length - r2Errors.length,
      r2Errors: r2Errors.length ? r2Errors : undefined,
    });
  } catch (error) {
    console.error("delete-clips error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      500,
    );
  }
});

async function deleteR2Objects(keys: string[]) {
  const r2AccessKey = Deno.env.get("R2_ACCESS_KEY_ID");
  const r2SecretKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const r2AccountId = Deno.env.get("R2_ACCOUNT_ID");
  const r2Bucket = Deno.env.get("R2_BUCKET") ?? "clipe-aqui-clips";
  const r2Endpoint =
    Deno.env.get("R2_ENDPOINT")?.replace(/\/$/, "") ??
    (r2AccountId
      ? `https://${r2AccountId}.r2.cloudflarestorage.com`
      : "");

  const errors: string[] = [];

  if (!r2AccessKey || !r2SecretKey || !r2Endpoint) {
    errors.push("R2 não configurado — objetos não removidos do storage");
    return { errors };
  }

  const aws = new AwsClient({
    accessKeyId: r2AccessKey,
    secretAccessKey: r2SecretKey,
    service: "s3",
    region: "auto",
  });

  for (const key of keys) {
    try {
      const pathKey = key
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");
      const url = `${r2Endpoint}/${r2Bucket}/${pathKey}`;
      const signed = await aws.sign(url, { method: "DELETE" });
      const res = await fetch(signed.url, {
        method: "DELETE",
        headers: signed.headers,
      });
      // 404 = já não existe — ok
      if (!res.ok && res.status !== 404) {
        const body = await res.text().catch(() => "");
        errors.push(
          `${key}: HTTP ${res.status}${body ? ` ${body.slice(0, 120)}` : ""}`,
        );
      }
    } catch (err) {
      errors.push(
        `${key}: ${err instanceof Error ? err.message : "falha ao apagar"}`,
      );
    }
  }

  return { errors };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
