import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.7.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type PackId = "pack_10" | "pack_20" | "pack_50" | "pack_100";

const PACK_CREDITS: Record<PackId, number> = {
  pack_10: 10,
  pack_20: 20,
  pack_50: 50,
  pack_100: 100,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "STRIPE_SECRET_KEY ausente" }, 500);

    const priceMap: Record<PackId, string | undefined> = {
      pack_10: Deno.env.get("STRIPE_PRICE_PACK_10") ?? undefined,
      pack_20: Deno.env.get("STRIPE_PRICE_PACK_20") ?? undefined,
      pack_50: Deno.env.get("STRIPE_PRICE_PACK_50") ?? undefined,
      pack_100: Deno.env.get("STRIPE_PRICE_PACK_100") ?? undefined,
    };

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

    const parsed = await req.json();
    // Aceita body direto, string JSON dupla, ou envelope { body: {...} } (dashboard / invoke)
    let body: Record<string, unknown> =
      typeof parsed === "string"
        ? (JSON.parse(parsed) as Record<string, unknown>)
        : (parsed as Record<string, unknown>);
    if (
      body &&
      typeof body.body === "object" &&
      body.body !== null &&
      !("packId" in body) &&
      !("pack_id" in body)
    ) {
      body = body.body as Record<string, unknown>;
    }

    const packId = String(body.packId ?? body.pack_id ?? "").trim() as PackId;
    const successUrl = String(body.successUrl ?? body.success_url ?? "");
    const cancelUrl = String(body.cancelUrl ?? body.cancel_url ?? "");

    if (!(packId in PACK_CREDITS)) {
      return json(
        {
          error: "Pacote inválido",
          received: packId || null,
          allowed: Object.keys(PACK_CREDITS),
        },
        400,
      );
    }
    const priceId = priceMap[packId];
    if (!priceId) {
      return json(
        {
          error:
            `Price do pacote ${packId} não configurado. Defina STRIPE_PRICE_PACK_${packId.replace("pack_", "").toUpperCase()} (ex.: STRIPE_PRICE_PACK_10) nos secrets.`,
        },
        500,
      );
    }
    if (!successUrl || !cancelUrl) {
      return json({ error: "successUrl e cancelUrl são obrigatórios" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await admin
      .from("users")
      .select("stripe_customer_id, email")
      .eq("id", user.id)
      .maybeSingle();

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    let customerId = profile?.stripe_customer_id as string | null | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? profile?.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin
        .from("users")
        .upsert(
          {
            id: user.id,
            email: user.email ?? profile?.email ?? "",
            stripe_customer_id: customerId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
    }

    const credits = PACK_CREDITS[packId];
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      metadata: {
        supabase_user_id: user.id,
        pack_id: packId,
        credits: String(credits),
      },
      payment_intent_data: {
        metadata: {
          supabase_user_id: user.id,
          pack_id: packId,
          credits: String(credits),
        },
      },
    });

    if (!session.url) return json({ error: "Checkout sem URL" }, 502);
    return json({ url: session.url, sessionId: session.id });
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
