import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.7.0";

Deno.serve(async (req) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return new Response("Missing Stripe/Supabase secrets", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("No signature", { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Idempotência
  const { error: insertEventError } = await admin.from("stripe_events").insert({
    id: event.id,
    type: event.type,
  });
  if (insertEventError) {
    // Já processado
    if (insertEventError.code === "23505") {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(insertEventError.message, { status: 500 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId =
        session.metadata?.supabase_user_id ||
        session.client_reference_id ||
        null;
      const credits = Number(session.metadata?.credits || 0);

      if (userId && credits > 0 && session.payment_status === "paid") {
        const { data: profile } = await admin
          .from("users")
          .select("credits, stripe_customer_id, email")
          .eq("id", userId)
          .maybeSingle();

        const nextCredits = Number(profile?.credits ?? 0) + credits;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : profile?.stripe_customer_id ?? null;

        await admin.from("users").upsert(
          {
            id: userId,
            email:
              session.customer_details?.email ||
              profile?.email ||
              "",
            credits: nextCredits,
            stripe_customer_id: customerId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
      }
    }
  } catch (err) {
    // Remove marcação para permitir retry do Stripe
    await admin.from("stripe_events").delete().eq("id", event.id);
    const msg = err instanceof Error ? err.message : "Handler failed";
    return new Response(msg, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
