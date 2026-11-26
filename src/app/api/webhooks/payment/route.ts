import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/api-security";
import { FAMILY_AI_SCAN_LIMIT, PRO_AI_SCAN_LIMIT } from "@/lib/monetization";
import { PaymentGatewayId, PlanTier } from "@/lib/types";

export const runtime = "nodejs";

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length || bufA.length === 0) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

async function activatePaidSubscription(params: {
  userId: string;
  planTier: PlanTier;
  gateway: PaymentGatewayId;
  paymentRef: string;
}): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin || !params.userId) return false;

  const limit =
    params.planTier === "family" ? FAMILY_AI_SCAN_LIMIT : PRO_AI_SCAN_LIMIT;
  const expiresAt = new Date(
    Date.now() + 365 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error } = await admin.from("user_subscriptions").upsert(
    {
      user_id: params.userId,
      plan_tier: params.planTier,
      ai_scans_limit: limit,
      gateway: params.gateway,
      payment_ref: params.paymentRef,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  return !error;
}

/**
 * Signed server-to-server Payment Webhook handler (Stripe, Billplz FPX, CHIP Malaysia).
 * Only verified cryptographic signatures can upgrade public.user_subscriptions.
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const url = new URL(request.url);
    const gatewayParam = url.searchParams.get("gateway");

    // 1. Stripe Webhook (Stripe-Signature HMAC-SHA256)
    const stripeSig = request.headers.get("stripe-signature");
    const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (stripeSig && stripeWebhookSecret) {
      const parts = Object.fromEntries(
        stripeSig.split(",").map((kv) => {
          const [k, v] = kv.split("=");
          return [k?.trim(), v?.trim()];
        })
      );
      const timestamp = parts.t;
      const v1 = parts.v1;
      if (!timestamp || !v1) {
        return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
      }
      // Reject replay attacks older than 5 minutes
      if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
        return NextResponse.json({ error: "EXPIRED_TIMESTAMP" }, { status: 400 });
      }

      const expected = crypto
        .createHmac("sha256", stripeWebhookSecret)
        .update(`${timestamp}.${rawBody}`, "utf8")
        .digest("hex");

      if (!timingSafeEqualHex(expected, v1)) {
        return NextResponse.json({ error: "BAD_SIGNATURE" }, { status: 401 });
      }

      const event = JSON.parse(rawBody);
      if (event.type === "checkout.session.completed") {
        const session = event.data?.object;
        const userId =
          session?.metadata?.userId || session?.client_reference_id || "";
        const planTier: PlanTier =
          session?.metadata?.planTier === "family" ? "family" : "pro";
        if (userId && session?.payment_status === "paid") {
          await activatePaidSubscription({
            userId,
            planTier,
            gateway: "stripe",
            paymentRef: String(session.id || ""),
          });
        }
      }
      return NextResponse.json({ received: true });
    }

    // 2. Billplz Callback (Billplz X-Signature HMAC-SHA256)
    const billplzXSigKey = process.env.BILLPLZ_X_SIGNATURE_KEY?.trim();
    if (gatewayParam === "billplz" && billplzXSigKey) {
      const params = new URLSearchParams(rawBody);
      const providedSig = params.get("x_signature") || "";
      const pairs: string[] = [];
      params.forEach((val, key) => {
        if (key !== "x_signature") {
          pairs.push(`${key}${val}`);
        }
      });
      pairs.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      const expected = crypto
        .createHmac("sha256", billplzXSigKey)
        .update(pairs.join("|"), "utf8")
        .digest("hex");

      if (!timingSafeEqualHex(expected, providedSig)) {
        return NextResponse.json({ error: "BAD_BILLPLZ_SIG" }, { status: 401 });
      }

      const paid = params.get("paid") === "true";
      const userId = params.get("reference_1") || "";
      const planTier: PlanTier =
        params.get("reference_2") === "family" ? "family" : "pro";
      const billId = params.get("id") || "";

      if (paid && userId) {
        await activatePaidSubscription({
          userId,
          planTier,
          gateway: "billplz",
          paymentRef: billId,
        });
      }
      return NextResponse.json({ received: true });
    }

    // 3. CHIP In Asia Callback (verified via CHIP API lookup using CHIP_SECRET_KEY)
    const chipSecret = process.env.CHIP_SECRET_KEY?.trim();
    if (gatewayParam === "chip" && chipSecret) {
      const payload = JSON.parse(rawBody);
      const purchaseId = String(payload?.id || "");
      if (!purchaseId) {
        return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });
      }
      const verifyRes = await fetch(
        `https://gate.chip-in.asia/api/v1/purchases/${encodeURIComponent(
          purchaseId
        )}/`,
        {
          headers: { Authorization: `Bearer ${chipSecret}` },
        }
      );
      if (!verifyRes.ok) {
        return NextResponse.json({ error: "CHIP_VERIFY_FAILED" }, { status: 401 });
      }
      const verified = await verifyRes.json();
      if (verified?.status === "paid" && verified?.reference) {
        const [userId, rawPlan] = String(verified.reference).split(":");
        const planTier: PlanTier = rawPlan === "family" ? "family" : "pro";
        if (userId) {
          await activatePaidSubscription({
            userId,
            planTier,
            gateway: "chip",
            paymentRef: purchaseId,
          });
        }
      }
      return NextResponse.json({ received: true });
    }

    return NextResponse.json(
      { error: "WEBHOOK_NOT_CONFIGURED" },
      { status: 400 }
    );
  } catch {
    return NextResponse.json({ error: "WEBHOOK_ERROR" }, { status: 500 });
  }
}
