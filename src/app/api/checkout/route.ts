import { NextResponse } from "next/server";
import {
  checkRateLimit,
  getClientIp,
  verifySameOrigin,
} from "@/lib/api-security";
import { PRICING_PLANS } from "@/lib/monetization";
import { PaymentGatewayId, PlanTier } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const originErr = verifySameOrigin(request);
    if (originErr) return originErr;

    const rateErr = checkRateLimit(`checkout:${getClientIp(request)}`, 10);
    if (rateErr) return rateErr;

    const body = (await request.json()) as {
      planTier?: PlanTier;
      gateway?: PaymentGatewayId;
      email?: string | null;
      userId?: string | null;
      taxYear?: number;
    };

    const planTier: PlanTier =
      body.planTier === "family" ? "family" : "pro";
    const gateway: PaymentGatewayId =
      body.gateway === "stripe" ||
      body.gateway === "billplz" ||
      body.gateway === "chip"
        ? body.gateway
        : "demo";

    const plan = PRICING_PLANS.find((p) => p.id === planTier) || PRICING_PLANS[1];
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get("origin") ||
      "http://localhost:3000";

    // 1. Stripe Checkout (Cards, FPX, GrabPay)
    const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (
      gateway === "stripe" &&
      stripeKey &&
      stripeKey !== "your-stripe-secret-key"
    ) {
      const params = new URLSearchParams();
      params.append("mode", "payment");
      params.append(
        "success_url",
        `${origin}/?checkout_session={CHECKOUT_SESSION_ID}&gateway=stripe`
      );
      params.append("cancel_url", `${origin}/?checkout=cancelled`);
      params.append("payment_method_types[0]", "card");
      params.append("payment_method_types[1]", "fpx");
      params.append("line_items[0][price_data][currency]", "myr");
      params.append(
        "line_items[0][price_data][unit_amount]",
        String(plan.priceRm * 100)
      );
      params.append(
        "line_items[0][price_data][product_data][name]",
        `${plan.name} (YA ${body.taxYear || 2026})`
      );
      params.append(
        "line_items[0][price_data][product_data][description]",
        plan.tagline
      );
      params.append("line_items[0][quantity]", "1");
      if (body.userId) {
        params.append("client_reference_id", body.userId);
        params.append("metadata[userId]", body.userId);
      }
      params.append("metadata[planTier]", plan.id);
      if (body.email) {
        params.append("customer_email", body.email);
      }

      const stripeRes = await fetch(
        "https://api.stripe.com/v1/checkout/sessions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stripeKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        }
      );

      if (stripeRes.ok) {
        const session = await stripeRes.json();
        if (session.url) {
          return NextResponse.json({
            mode: "redirect",
            gateway: "stripe",
            checkoutUrl: session.url,
            planTier: plan.id,
          });
        }
      }
    }

    // 2. Billplz Malaysia (FPX Online Banking)
    const billplzKey = process.env.BILLPLZ_API_KEY?.trim();
    const billplzCollectionId = process.env.BILLPLZ_COLLECTION_ID?.trim();
    if (
      gateway === "billplz" &&
      billplzKey &&
      billplzCollectionId &&
      billplzKey !== "your-billplz-api-key"
    ) {
      const auth = Buffer.from(`${billplzKey}:`).toString("base64");
      const billRes = await fetch("https://www.billplz.com/api/v3/bills", {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          collection_id: billplzCollectionId,
          email: body.email || "taxpayer@cukaiku.my",
          name: body.email ? body.email.split("@")[0] : "CukaiKu Taxpayer",
          amount: plan.priceRm * 100,
          callback_url: `${origin}/api/webhooks/payment?gateway=billplz`,
          redirect_url: `${origin}/?checkout=pending_webhook&gateway=billplz`,
          reference_1_label: "UserId",
          reference_1: body.userId || "",
          reference_2_label: "PlanTier",
          reference_2: plan.id,
          description: `${plan.name} — LHDN Relief & 7-Year Receipt Vault`,
        }),
      });

      if (billRes.ok) {
        const bill = await billRes.json();
        if (bill.url) {
          return NextResponse.json({
            mode: "redirect",
            gateway: "billplz",
            checkoutUrl: bill.url,
            planTier: plan.id,
          });
        }
      }
    }

    // 3. CHIP In Asia (DuitNow QR & FPX Malaysia)
    const chipKey = process.env.CHIP_SECRET_KEY?.trim();
    const chipBrandId = process.env.CHIP_BRAND_ID?.trim();
    if (
      gateway === "chip" &&
      chipKey &&
      chipBrandId &&
      chipKey !== "your-chip-secret-key"
    ) {
      const chipRes = await fetch("https://gate.chip-in.asia/api/v1/purchases/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${chipKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brand_id: chipBrandId,
          reference: `${body.userId || ""}:${plan.id}`,
          client: {
            email: body.email || "taxpayer@cukaiku.my",
          },
          purchase: {
            currency: "MYR",
            products: [
              {
                name: `${plan.name} (YA ${body.taxYear || 2026})`,
                price: plan.priceRm * 100,
                quantity: 1,
              },
            ],
          },
          success_callback: `${origin}/api/webhooks/payment?gateway=chip`,
          success_redirect: `${origin}/?checkout=pending_webhook&gateway=chip`,
          failure_redirect: `${origin}/?checkout=cancelled`,
        }),
      });

      if (chipRes.ok) {
        const purchase = await chipRes.json();
        if (purchase.checkout_url) {
          return NextResponse.json({
            mode: "redirect",
            gateway: "chip",
            checkoutUrl: purchase.checkout_url,
            planTier: plan.id,
          });
        }
      }
    }

    // 4. Block unverified sandbox activation in production unless explicitly enabled
    const isProd = process.env.NODE_ENV === "production";
    const allowSandbox = process.env.ALLOW_SANDBOX_CHECKOUT === "true";
    if (isProd && !allowSandbox) {
      return NextResponse.json(
        {
          error: "GATEWAY_NOT_CONFIGURED",
          message:
            "Online payment gateway is being configured. Please check back shortly or contact support@cukaiku.my.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      mode: "instant_demo",
      gateway,
      planTier: plan.id,
      priceRm: plan.priceRm,
      aiScansLimit: plan.aiScansLimit,
      expiresAt: new Date(
        Date.now() + 365 * 24 * 60 * 60 * 1000
      ).toISOString(),
      message: `Activated ${plan.name} (RM ${plan.priceRm}) via local development sandbox.`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "CHECKOUT_FAILED",
        message:
          err instanceof Error
            ? err.message
            : "Could not initialize checkout session.",
      },
      { status: 500 }
    );
  }
}
