"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Circle,
  Cloud,
  FileText,
  HelpCircle,
  ListChecks,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { AppLanguage, getUiCopy } from "@/lib/personalization";

const CHECKLIST_DISMISSED_KEY = "cukaiku_checklist_dismissed_v1";
const RELIEFS_VISITED_KEY = "cukaiku_reliefs_visited_v1";
export const WELCOME_SEEN_KEY = "cukaiku_welcome_seen_v1";

interface QuickStartChecklistProps {
  taxYear: number;
  language?: AppLanguage;
  profileCustomized: boolean;
  hasExpenses: boolean;
  hasCloudSync: boolean;
  onOpenScanner: () => void;
  onNavigateTab: (tab: "reliefs" | "receipts" | "settings") => void;
  onLoadSampleData: () => void;
  onOpenGuideModal: () => void;
}

export function QuickStartChecklist({
  taxYear,
  language = "en",
  profileCustomized,
  hasExpenses,
  hasCloudSync,
  onOpenScanner,
  onNavigateTab,
  onLoadSampleData,
  onOpenGuideModal,
}: QuickStartChecklistProps) {
  const copy = getUiCopy(language);
  const [dismissed, setDismissed] = useState(true);
  const [visitedReliefs, setVisitedReliefs] = useState(false);

  useEffect(() => {
    try {
      const isDismissed =
        window.localStorage.getItem(CHECKLIST_DISMISSED_KEY) === "1";
      const hasReliefs =
        window.localStorage.getItem(RELIEFS_VISITED_KEY) === "1";
      setDismissed(isDismissed);
      setVisitedReliefs(hasReliefs);
    } catch {
      setDismissed(false);
    }
  }, []);

  function handleDismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(CHECKLIST_DISMISSED_KEY, "1");
    } catch {
      // ignore storage errors
    }
  }

  function handleVisitReliefs() {
    setVisitedReliefs(true);
    try {
      window.localStorage.setItem(RELIEFS_VISITED_KEY, "1");
    } catch {
      // ignore
    }
    onNavigateTab("reliefs");
  }

  const steps = [
    {
      id: "profile",
      done: profileCustomized,
      title: copy.step1Title,
      description: copy.step1Desc,
      cta: profileCustomized ? copy.step1CtaEdit : copy.step1CtaSet,
      icon: SlidersHorizontal,
      onClick: () => onNavigateTab("settings"),
    },
    {
      id: "scan",
      done: hasExpenses,
      title: copy.step2Title,
      description: copy.step2Desc,
      cta: hasExpenses ? copy.step2CtaAnother : copy.step2CtaScan,
      icon: Camera,
      onClick: onOpenScanner,
    },
    {
      id: "reliefs",
      done: visitedReliefs || hasExpenses,
      title: copy.step3Title,
      description: copy.step3Desc,
      cta: copy.step3Cta,
      icon: ListChecks,
      onClick: handleVisitReliefs,
    },
    {
      id: "cloud",
      done: hasCloudSync,
      title: copy.step4Title,
      description: copy.step4Desc,
      cta: hasCloudSync ? copy.step4CtaSynced : copy.step4CtaSignIn,
      icon: Cloud,
      onClick: () => onNavigateTab("settings"),
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  if (dismissed || allDone) {
    return null;
  }

  const progressPct = Math.round((completedCount / steps.length) * 100);

  return (
    <section className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 via-white to-slate-50 p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                {copy.quickStartTitle.replace("{year}", String(taxYear))}
              </h2>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                {completedCount}/{steps.length} {copy.doneLabel}
              </span>
            </div>
            <p className="text-[11px] text-slate-600">
              {copy.quickStartSub}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          title="Hide quick setup checklist"
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
        <div
          className="h-full rounded-full bg-emerald-600 transition-all duration-300"
          style={{ width: `${Math.max(8, progressPct)}%` }}
        />
      </div>

      {/* 4 Interactive Steps */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <button
              key={step.id}
              type="button"
              onClick={step.onClick}
              className={`flex items-start justify-between gap-2.5 rounded-xl border p-2.5 text-left transition active:scale-[0.99] ${
                step.done
                  ? "border-emerald-200/70 bg-emerald-50/50 text-slate-500"
                  : "border-slate-200 bg-white hover:border-emerald-300 hover:shadow-2xs"
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                {step.done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                )}
                <div className="min-w-0">
                  <p
                    className={`text-xs font-bold leading-snug ${
                      step.done ? "text-emerald-900 line-through" : "text-slate-900"
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                    {step.description}
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold ${
                  step.done
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-900 text-white"
                }`}
              >
                <Icon className="h-3 w-3" />
                <span className="hidden sm:inline">{step.cta}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer Helpers */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {!hasExpenses && (
            <button
              type="button"
              onClick={onLoadSampleData}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              <Sparkles className="h-3 w-3" />
              {copy.trySampleBtn.replace("{year}", String(taxYear))}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenGuideModal}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
          >
            <HelpCircle className="h-3.5 w-3.5 text-slate-500" />
            {copy.howItWorksBtn}
          </button>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="text-[11px] font-medium text-slate-400 hover:text-slate-600"
        >
          {copy.dismissGuide}
        </button>
      </div>
    </section>
  );
}

interface QuickGuideModalProps {
  open: boolean;
  taxYear: number;
  language?: AppLanguage;
  hasExpenses: boolean;
  onClose: () => void;
  onStartScanning: () => void;
  onGoToSettings: () => void;
  onLoadSampleData: () => void;
}

export function QuickGuideModal({
  open,
  taxYear,
  language = "en",
  hasExpenses,
  onClose,
  onStartScanning,
  onGoToSettings,
  onLoadSampleData,
}: QuickGuideModalProps) {
  if (!open) return null;
  const copy = getUiCopy(language);

  const pillars = [
    {
      step: language === "bm" ? "Langkah 1" : "Step 1",
      title: copy.pillar1Title,
      detail: copy.pillar1Desc,
      icon: SlidersHorizontal,
      accent: "bg-blue-50 text-blue-700 border-blue-200",
    },
    {
      step: language === "bm" ? "Langkah 2" : "Step 2",
      title: copy.pillar2Title,
      detail: copy.pillar2Desc,
      icon: Camera,
      accent: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    {
      step: language === "bm" ? "Langkah 3" : "Step 3",
      title: copy.pillar3Title,
      detail: copy.pillar3Desc,
      icon: FileText,
      accent: "bg-amber-50 text-amber-800 border-amber-200",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-xs sm:items-center sm:p-4">
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <img
              src="/icon.png"
              alt="CukaiKu"
              className="h-9 w-9 rounded-xl object-contain border border-slate-200 p-0.5"
            />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {copy.guideModalTitle}
              </h2>
              <p className="text-xs text-slate-500">
                {copy.guideModalSub}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {pillars.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3.5"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${item.accent}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                    {item.step}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                    {item.detail}
                  </p>
                </div>
              </div>
            );
          })}

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900 space-y-1.5">
            <p className="font-bold">
              {language === "bm"
                ? "✨ Peribadikan CukaiKu dalam Beberapa Saat:"
                : "✨ Personalize CukaiKu in Seconds:"}
            </p>
            <ul className="list-disc pl-4 text-[11px] leading-relaxed text-emerald-800 space-y-0.5">
              {language === "bm" ? (
                <>
                  <li>
                    <strong>Praset Profil Kehidupan (1-Ketik):</strong> Tetapkan pelepasan Bujang, Keluarga, Pekerja Bebas (e-B), atau Rumah Pertama secara automatik.
                  </li>
                  <li>
                    <strong>Semat Had Kegemaran (★):</strong> Tandakan bintang hanya pada kategori LHDN yang anda tuntut dalam tab Pelepasan.
                  </li>
                  <li>
                    <strong>Bil Bulanan 1-Ketik &amp; Peringatan Hari Gaji:</strong> Rekod Unifi/Gim/Insurans sebulan sekali tanpa kiraan berganda.
                  </li>
                  <li>
                    <strong>Penukar EN / BM:</strong> Ketik <strong>EN / BM</strong> di bar atas pada bila-bila masa.
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <strong>1-Tap Life-Stage Preset:</strong> Auto-configures Single, Family, Freelancer (e-B), or First-Home reliefs.
                  </li>
                  <li>
                    <strong>Pin Favorite Caps (★):</strong> Star only the LHDN categories you claim in the Reliefs tab.
                  </li>
                  <li>
                    <strong>1-Tap Monthly Bills &amp; Payday Nudge:</strong> Log Unifi/Gym/Insurance once a month without double-counting.
                  </li>
                  <li>
                    <strong>EN / BM Switcher:</strong> Tap <strong>EN / BM</strong> in the top bar anytime.
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/70 p-4 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              onClose();
              onGoToSettings();
            }}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-800 shadow-xs hover:bg-slate-50"
          >
            {copy.guideSetIncomeFirst}
          </button>

          {!hasExpenses && (
            <button
              type="button"
              onClick={() => {
                onLoadSampleData();
                onClose();
              }}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {language === "bm" ? `Cuba Contoh TT ${taxYear}` : `Try Sample YA ${taxYear}`}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onClose();
              onStartScanning();
            }}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
          >
            {copy.guideStartScanning}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
