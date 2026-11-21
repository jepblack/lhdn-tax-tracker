import { NextResponse } from "next/server";
import { PRICING_PLANS } from "@/lib/monetization";
import { PaymentGatewayId, PlanTier } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
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
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
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
        `${origin}/?upgraded=${plan.id}&gateway=stripe`
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
          callback_url: `${origin}/api/checkout`,
          redirect_url: `${origin}/?upgraded=${plan.id}&gateway=billplz`,
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
          success_redirect: `${origin}/?upgraded=${plan.id}&gateway=chip`,
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

    // 4. Instant Simulated / Demo Checkout Fallback (works immediately without live merchant keys)
    return NextResponse.json({
      mode: "instant_demo",
      gateway,
      planTier: plan.id,
      priceRm: plan.priceRm,
      aiScansLimit: plan.aiScansLimit,
      expiresAt: new Date(
        Date.now() + 365 * 24 * 60 * 60 * 1000
      ).toISOString(),
      message: `Activated ${plan.name} (RM ${plan.priceRm}) via ${gateway.toUpperCase()} sandbox! Add live ${gateway.toUpperCase()} keys in .env.local to redirect to live banking.`,
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
