import { NextResponse } from "next/server";
import {
  checkRateLimit,
  getClientIp,
  getSupabaseAdminClient,
  verifySameOrigin,
} from "@/lib/api-security";
import { FAMILY_AI_SCAN_LIMIT, PRO_AI_SCAN_LIMIT } from "@/lib/monetization";
import { PlanTier } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Verifies a Stripe Checkout Session server-side on redirect back to the app,
 * preventing URL query-parameter spoofing (e.g. ?upgraded=family).
 */
export async function POST(request: Request) {
  try {
    const originErr = verifySameOrigin(request);
    if (originErr) return originErr;

    const rateErr = checkRateLimit(`verify-checkout:${getClientIp(request)}`, 10);
    if (rateErr) return rateErr;

    const { sessionId } = (await request.json()) as { sessionId?: string };
    const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (
      !sessionId ||
      !stripeKey ||
      stripeKey === "your-stripe-secret-key" ||
      !/^cs_[a-zA-Z0-9_]+$/.test(sessionId)
    ) {
      return NextResponse.json(
        { verified: false, error: "INVALID_SESSION" },
        { status: 400 }
      );
    }

    const res = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(
        sessionId
      )}`,
      {
        headers: { Authorization: `Bearer ${stripeKey}` },
      }
    );
    if (!res.ok) {
      return NextResponse.json(
        { verified: false, error: "SESSION_LOOKUP_FAILED" },
        { status: 400 }
      );
    }

    const session = await res.json();
    if (session?.payment_status !== "paid") {
      return NextResponse.json(
        { verified: false, error: "NOT_PAID" },
        { status: 402 }
      );
    }

    const planTier: PlanTier =
      session?.metadata?.planTier === "family" ? "family" : "pro";
    const userId =
      session?.metadata?.userId || session?.client_reference_id || "";
    const expiresAt = new Date(
      Date.now() + 365 * 24 * 60 * 60 * 1000
    ).toISOString();
    const limit =
      planTier === "family" ? FAMILY_AI_SCAN_LIMIT : PRO_AI_SCAN_LIMIT;

    const admin = getSupabaseAdminClient();
    if (admin && userId) {
      await admin.from("user_subscriptions").upsert(
        {
          user_id: userId,
          plan_tier: planTier,
          ai_scans_limit: limit,
          gateway: "stripe",
          payment_ref: session.id,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    }

    return NextResponse.json({
      verified: true,
      planTier,
      gateway: "stripe",
      expiresAt,
      aiScansLimit: limit,
    });
  } catch {
    return NextResponse.json(
      { verified: false, error: "VERIFY_ERROR" },
      { status: 500 }
    );
  }
}
