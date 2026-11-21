"use client";

import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  CreditCard,
  Crown,
  Loader2,
  QrCode,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { formatRM } from "@/lib/calculator";
import {
  FREE_AI_SCAN_LIMIT,
  PRICING_PLANS,
} from "@/lib/monetization";
import {
  PaymentGatewayId,
  PlanTier,
  TaxYear,
  UserSubscription,
} from "@/lib/types";

interface PricingModalProps {
  isOpen: boolean;
  taxYear: TaxYear;
  subscription: UserSubscription;
  userEmail: string | null;
  userId: string | null;
  triggerReason?: string | null;
  onClose: () => void;
  onUpgradeSuccess: (
    nextTier: PlanTier,
    gateway: PaymentGatewayId,
    message?: string
  ) => Promise<void>;
}

const GATEWAY_OPTIONS: Array<{
  id: PaymentGatewayId;
  name: string;
  subtitle: string;
  icon: typeof CreditCard;
}> = [
  {
    id: "stripe",
    name: "Stripe (FPX / Card / GrabPay)",
    subtitle: "Malaysian Online Banking, Visa, Mastercard",
    icon: CreditCard,
  },
  {
    id: "chip",
    name: "CHIP Malaysia (DuitNow QR & FPX)",
    subtitle: "Instant DuitNow QR, MAE, Touch 'n Go eWallet",
    icon: QrCode,
  },
  {
    id: "billplz",
    name: "Billplz FPX",
    subtitle: "Maybank2u, CIMB Clicks, Public Bank, RHB, Bank Islam",
    icon: Building2,
  },
  {
    id: "demo",
    name: "Instant Sandbox Activation",
    subtitle: "Test Pro / Family features immediately without payment keys",
    icon: Zap,
  },
];

export function PricingModal({
  isOpen,
  taxYear,
  subscription,
  userEmail,
  userId,
  triggerReason,
  onClose,
  onUpgradeSuccess,
}: PricingModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>(
    subscription.planTier === "pro" ? "family" : "pro"
  );
  const [selectedGateway, setSelectedGateway] =
    useState<PaymentGatewayId>("stripe");
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleCheckout(targetPlan: PlanTier) {
    if (targetPlan === "free") {
      await onUpgradeSuccess(
        "free",
        "demo",
        "Switched back to Free Starter plan."
      );
      onClose();
      return;
    }

    setProcessing(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planTier: targetPlan,
          gateway: selectedGateway,
          email: userEmail,
          userId,
          taxYear,
        }),
      });
      const data = await res.json();

      if (data.mode === "redirect" && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      // Instant demo or sandbox fallback when live keys aren't set yet
      await onUpgradeSuccess(
        targetPlan,
        selectedGateway,
        data.message || `Upgraded to CukaiKu ${targetPlan.toUpperCase()}!`
      );
      setStatusMessage(
        data.message || `Activated CukaiKu ${targetPlan.toUpperCase()} Pass!`
      );
      setTimeout(() => {
        onClose();
      }, 1100);
    } catch {
      setStatusMessage("Could not complete checkout. Please try again.");
    } finally {
      setProcessing(false);
    }
  }

  const scansPct = Math.min(
    100,
    Math.round(
      (subscription.aiScansUsed / Math.max(1, subscription.aiScansLimit)) * 100
    )
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/65 backdrop-blur-xs sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 px-5 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-white/20">
              <img
                src="/icon.png"
                alt="CukaiKu Logo"
                className="h-full w-full object-contain p-0.5"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">
                  Upgrade to CukaiKu Pro
                </h2>
                <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold uppercase text-slate-950">
                  YA {taxYear} Pass
                </span>
              </div>
              <p className="text-xs text-emerald-100/85">
                Unlimited AI Receipt Vision + 7-Year LHDN Audit Pack
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-emerald-100 hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {triggerReason && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-bold">Unlock Pro Tax & Audit Features</p>
                <p className="mt-0.5 text-[11px] text-amber-800">
                  {triggerReason}
                </p>
              </div>
            </div>
          )}

          {/* Current AI Quota Meter */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">
                Current Plan:{" "}
                <strong className="uppercase text-emerald-700">
                  {subscription.planTier}
                </strong>
              </span>
              <span className="font-bold text-slate-900">
                {subscription.aiScansUsed} / {subscription.aiScansLimit} AI
                Vision Scans Used
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full transition-all ${
                  scansPct >= 100 ? "bg-amber-500" : "bg-emerald-600"
                }`}
                style={{ width: `${scansPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              {subscription.planTier === "free"
                ? `Free plan includes ${FREE_AI_SCAN_LIMIT} cloud AI Vision scans + unlimited on-device Free OCR.`
                : `Your ${subscription.planTier.toUpperCase()} pass is active with full 7-year LHDN Audit ZIP export.`}
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PRICING_PLANS.filter((p) => p.id !== "free").map((plan) => {
              const isSelected = selectedPlan === plan.id;
              const isCurrent = subscription.planTier === plan.id;
              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`cursor-pointer rounded-2xl border-2 p-4 transition ${
                    isSelected
                      ? "border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-500/20"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                      {plan.name}
                    </span>
                    {plan.badge && (
                      <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        {plan.badge}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-slate-900">
                      {formatRM(plan.priceRm)}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {plan.periodLabel}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    {plan.tagline}
                  </p>

                  <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                    {plan.features.map((feat, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-1.5 text-[11px] text-slate-700"
                      >
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  {isCurrent && (
                    <div className="mt-3 rounded-xl bg-emerald-100 py-1.5 text-center text-[11px] font-bold text-emerald-800">
                      Current Active Plan
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Payment Method / Gateway Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              Select Payment Method (Malaysia FPX / DuitNow / Card)
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {GATEWAY_OPTIONS.map((gw) => {
                const Icon = gw.icon;
                const active = selectedGateway === gw.id;
                return (
                  <button
                    key={gw.id}
                    type="button"
                    onClick={() => setSelectedGateway(gw.id)}
                    className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${
                      active
                        ? "border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div
                      className={`mt-0.5 rounded-lg p-1.5 ${
                        active
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900">
                        {gw.name}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {gw.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {statusMessage && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              disabled={processing}
              onClick={() => handleCheckout(selectedPlan)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition active:scale-[0.99] disabled:opacity-60"
            >
              {processing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Crown className="h-4 w-4" />
              )}
              <span>
                {processing
                  ? "Initializing Checkout..."
                  : `Unlock ${
                      selectedPlan === "family"
                        ? "Family & Joint Pass (RM 59)"
                        : "CukaiKu Pro Pass (RM 29)"
                    }`}
              </span>
            </button>

            <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                One-time YA pass • No auto-renewal lock-in
              </span>
              {subscription.planTier !== "free" && (
                <button
                  type="button"
                  onClick={() => handleCheckout("free")}
                  className="font-semibold text-slate-500 underline hover:text-slate-800"
                >
                  Reset to Free Tier (Test Paywall)
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
