"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUpCircle,
  CheckCircle2,
  ChevronDown,
  Cloud,
  CloudOff,
  Crown,
  Database,
  FileUp,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { calculateMaxTaxSavingGoal, formatRM } from "@/lib/calculator";
import { RECURRING_BILL_BM } from "@/lib/language-context";
import {
  getGoogleDriveToken,
  saveGoogleDriveToken,
  syncYearIndexToGoogleDrive,
} from "@/lib/google-drive";
import { getStatusReliefAmounts } from "@/lib/lhdn-rules";
import {
  parseMalaysianPayslipText,
  PayslipExtraction,
} from "@/lib/payslip-parser";
import { renderPdfFirstPageToJpeg } from "@/lib/pdf-to-image";
import { getCloudSyncStatus, syncLocalDataToCloud } from "@/lib/storage";
import {
  getUiCopy,
  LIFE_STAGE_PRESETS,
  LifeStagePresetId,
  RecurringBillTemplate,
  UserPersonalization,
} from "@/lib/personalization";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { TaxExpense, TaxProfile, UserSubscription } from "@/lib/types";
import { InfoHint } from "./InfoHint";

interface SettingsTabProps {
  profile: TaxProfile;
  subscription: UserSubscription;
  expenses: TaxExpense[];
  userEmail: string | null;
  driveConnected: boolean;
  onDriveConnected?: () => void;
  personalization: UserPersonalization;
  recurringBills: RecurringBillTemplate[];
  onUpdatePersonalization: (next: UserPersonalization) => void;
  onApplyLifeStage: (presetId: LifeStagePresetId) => void;
  onSaveRecurringBills: (bills: RecurringBillTemplate[]) => void;
  onUpdateProfile: (next: TaxProfile) => Promise<void>;
  onOpenUpgrade: (reason?: string) => void;
  onLogPayslipReliefs: (
    epfAmount: number,
    socsoAmount: number,
    payslipFile: File | null
  ) => Promise<void>;
  onLoadSampleData: () => void;
  onClearLocalData: () => void;
}

export function SettingsTab({
  profile,
  subscription,
  expenses,
  userEmail,
  driveConnected,
  onDriveConnected,
  personalization,
  recurringBills,
  onUpdatePersonalization,
  onApplyLifeStage,
  onSaveRecurringBills,
  onUpdateProfile,
  onOpenUpgrade,
  onLogPayslipReliefs,
  onLoadSampleData,
  onClearLocalData,
}: SettingsTabProps) {
  const amounts = getStatusReliefAmounts(profile.taxYear);
  const lang = personalization.language;
  const copy = getUiCopy(lang);
  const payslipInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [gisReady, setGisReady] = useState(false);
  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const [newBillMerchant, setNewBillMerchant] = useState("");
  const [newBillAmount, setNewBillAmount] = useState("");
  const [newBillCategory, setNewBillCategory] = useState("lifestyle");

  // Payslip upload state
  const [payslipFile, setPayslipFile] = useState<File | null>(null);
  const [payslipScanning, setPayslipScanning] = useState(false);
  const [payslipProgress, setPayslipProgress] = useState("");
  const [payslipError, setPayslipError] = useState<string | null>(null);
  const [payslipData, setPayslipData] = useState<PayslipExtraction | null>(
    null
  );
  const [showPayslipText, setShowPayslipText] = useState(false);
  const [appliedBanner, setAppliedBanner] = useState<string | null>(null);
  const [driveSyncing, setDriveSyncing] = useState(false);
  const [driveSyncMsg, setDriveSyncMsg] = useState<string | null>(null);
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null);
  const [migratingLocal, setMigratingLocal] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState<string | null>(null);

  async function handlePayslipUpload(file: File | undefined) {
    if (!file) return;
    setPayslipFile(file);
    setPayslipError(null);
    setPayslipData(null);
    setAppliedBanner(null);
    setShowPayslipText(false);
    setPayslipScanning(true);

    try {
      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");

      setPayslipProgress(
        isPdf
          ? personalization.language === "bm"
            ? "Membaca slip gaji / Borang EA PDF..."
            : "Reading PDF payslip / EA Form..."
          : personalization.language === "bm"
          ? "Menganalisis imej slip gaji / Borang EA..."
          : "Analyzing payslip / EA Form image..."
      );

      const formData = new FormData();
      formData.append("file", file);

      if (isPdf) {
        const renderedJpeg = await renderPdfFirstPageToJpeg(file, 1600);
        if (renderedJpeg) {
          formData.append("renderedImage", renderedJpeg);
        }
      }

      const res = await fetch("/api/parse-payslip", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (
        res.ok &&
        data &&
        !data.useClientOcr &&
        (data.estimatedAnnualIncome > 0 ||
          data.ytdPcb > 0 ||
          data.monthlyGross > 0 ||
          data.monthlyPcb > 0)
      ) {
        setPayslipData(data as PayslipExtraction);
        return;
      }

      if (!isPdf && (!res.ok || data.useClientOcr)) {
        // Fallback to local on-device OCR for images if offline or API unavailable
        setPayslipProgress(
          personalization.language === "bm"
            ? "Memuatkan OCR pada peranti..."
            : "Loading on-device OCR..."
        );
        const Tesseract = await import("tesseract.js");
        const { data: ocrData } = await Tesseract.recognize(file, "eng", {
          logger: (m) => {
            if (
              m.status === "recognizing text" &&
              typeof m.progress === "number"
            ) {
              setPayslipProgress(
                personalization.language === "bm"
                  ? `Membaca teks... ${Math.round(m.progress * 100)}%`
                  : `Reading payslip... ${Math.round(m.progress * 100)}%`
              );
            }
          },
        });
        const parsed = parseMalaysianPayslipText(ocrData.text || "");
        setPayslipData(parsed);
        return;
      }

      if (!res.ok) {
        setPayslipError(
          data.message ||
            (personalization.language === "bm"
              ? "Gagal membaca fail. Sila masukkan nilai secara manual."
              : "Could not read payslip / EA Form. Please enter the values manually below.")
        );
        return;
      }
      setPayslipData(data as PayslipExtraction);
    } catch {
      setPayslipError(
        personalization.language === "bm"
          ? "Gagal membaca dokumen. Sila muat naik imej/PDF yang lebih jelas atau masukkan nilai secara manual."
          : "Failed to read payslip / EA Form. Try a clearer screenshot or enter the values manually below."
      );
    } finally {
      setPayslipScanning(false);
      setPayslipProgress("");
    }
  }

  function deriveChildrenFromEaForm(
    childrenRelief: number | null | undefined,
    eligibleCount: number | null | undefined
  ): { childrenUnder18: number; childrenHigherEd: number } | null {
    const hasRelief = childrenRelief !== null && childrenRelief !== undefined;
    const hasCount = eligibleCount !== null && eligibleCount !== undefined;
    if (!hasRelief && !hasCount) return null;

    const relief = hasRelief ? Math.max(0, Number(childrenRelief) || 0) : 0;
    const count = hasCount ? Math.max(0, Math.round(Number(eligibleCount) || 0)) : null;

    if (hasRelief && count !== null) {
      if (relief === 0 && count === 0) {
        return { childrenUnder18: 0, childrenHigherEd: 0 };
      }
      if (relief >= count * 2000) {
        const extra = relief - count * 2000;
        const higherEd = Math.min(count, Math.round(extra / 6000));
        return {
          childrenUnder18: Math.max(0, count - higherEd),
          childrenHigherEd: higherEd,
        };
      }
      return { childrenUnder18: count, childrenHigherEd: 0 };
    }

    if (hasRelief) {
      if (relief === 0) return { childrenUnder18: 0, childrenHigherEd: 0 };
      return {
        childrenUnder18: Math.max(0, Math.round(relief / 2000)),
        childrenHigherEd: 0,
      };
    }

    return { childrenUnder18: count ?? 0, childrenHigherEd: 0 };
  }

  async function handleApplyPayslip(includeReliefs: boolean) {
    if (!payslipData) return;

    const derivedChildren = deriveChildrenFromEaForm(
      payslipData.eaForm?.children_relief,
      payslipData.eaForm?.eligible_children_for_tax_relief
    );

    const nextProfile: TaxProfile = {
      ...profile,
      annualIncome:
        payslipData.estimatedAnnualIncome > 0
          ? payslipData.estimatedAnnualIncome
          : profile.annualIncome,
      pcbPaid:
        payslipData.ytdPcb > 0
          ? payslipData.ytdPcb
          : payslipData.monthlyPcb > 0
          ? payslipData.monthlyPcb
          : profile.pcbPaid,
      zakatPaid:
        payslipData.ytdZakat > 0
          ? payslipData.ytdZakat
          : payslipData.monthlyZakat > 0
          ? payslipData.monthlyZakat
          : profile.zakatPaid,
      statusReliefs: derivedChildren
        ? {
            ...profile.statusReliefs,
            childrenUnder18: derivedChildren.childrenUnder18,
            childrenHigherEd: derivedChildren.childrenHigherEd,
          }
        : profile.statusReliefs,
    };

    await onUpdateProfile(nextProfile);

    if (includeReliefs) {
      const epf = payslipData.ytdEpf || payslipData.employeeEpf;
      const socsoTotal =
        (payslipData.ytdSocso || payslipData.employeeSocso) +
        (payslipData.ytdEis || payslipData.employeeEis);
      if (epf > 0 || socsoTotal > 0) {
        await onLogPayslipReliefs(epf, socsoTotal, payslipFile);
      }
    }

    setAppliedBanner(
      includeReliefs
        ? personalization.language === "bm"
          ? "Pendapatan, PCB/Zakat & pelepasan KWSP/PERKESO telah dikemaskini!"
          : "Applied income, PCB/Zakat & updated EPF/SOCSO reliefs in-place (no duplicates)!"
        : personalization.language === "bm"
        ? `Pendapatan, PCB & Zakat telah dikemaskini ke profil TT ${profile.taxYear} anda!`
        : "Applied income, PCB & Zakat to your YA " + profile.taxYear + " profile!"
    );
    setPayslipData(null);
  }

  async function handleAuth(mode: "signin" | "signup") {
    const supabase = getSupabaseClient();
    if (!supabase || !email || !password) return;
    setAuthLoading(true);
    setAuthStatus(null);
    try {
      const { error } =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      if (error) {
        setAuthStatus(error.message);
      } else {
        setAuthStatus(
          mode === "signup"
            ? "Account created! Check your email if confirmation is enabled."
            : "Signed in! Syncing your cloud receipts..."
        );
      }
    } finally {
      setAuthLoading(false);
    }
  }

  const googleClientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    "457212954630-0drpqsr9nfbidp9k921d6sk09skjivph.apps.googleusercontent.com";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const interval = setInterval(() => {
      const g = (window as any).google?.accounts?.id;
      if (g) {
        clearInterval(interval);
        try {
          g.initialize({
            client_id: googleClientId,
            callback: async (response: { credential?: string }) => {
              if (!response?.credential) return;
              const supabase = getSupabaseClient();
              if (!supabase) return;
              setAuthLoading(true);
              setAuthStatus(null);
              try {
                const { error } = await supabase.auth.signInWithIdToken({
                  provider: "google",
                  token: response.credential,
                });
                if (error) {
                  setAuthStatus(error.message);
                } else {
                  setAuthStatus("Signed in successfully with Google!");
                }
              } catch (err) {
                setAuthStatus(
                  err instanceof Error ? err.message : "Google sign-in error"
                );
              } finally {
                setAuthLoading(false);
              }
            },
            auto_select: false,
          });

          const container = document.getElementById("google-signin-btn-container");
          if (container && container.children.length === 0) {
            g.renderButton(container, {
              theme: "outline",
              size: "large",
              width: 340,
              text: "continue_with",
              shape: "rectangular",
              logo_alignment: "left",
            });
            setGisReady(true);
          }
        } catch {
          // ignore initialization failure
        }
      }
    }, 300);

    return () => clearInterval(interval);
  }, [googleClientId]);

  async function handleGoogleSignIn() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setAuthLoading(true);
    setAuthStatus(null);

    const g = (window as any).google?.accounts?.id;
    if (g) {
      try {
        g.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            const btn = document.querySelector(
              "#google-signin-btn-container div[role=button]"
            ) as HTMLElement;
            if (btn) btn.click();
          }
        });
        setAuthLoading(false);
        return;
      } catch {
        // fallback
      }
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
          redirectTo:
            typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      if (error) {
        setAuthStatus(
          `${error.message} (Enable Google under Supabase → Authentication → Providers, or use Email + Password below.)`
        );
      }
    } finally {
      setAuthLoading(false);
    }
  }

  function handleConnectGoogleDrive() {
    const oauth2 = (window as any).google?.accounts?.oauth2;
    if (oauth2) {
      const client = oauth2.initTokenClient({
        client_id: googleClientId,
        scope: "https://www.googleapis.com/auth/drive.file",
        callback: (resp: any) => {
          if (resp?.access_token) {
            saveGoogleDriveToken(resp.access_token);
            onDriveConnected?.();
            setDriveSyncMsg(
              lang === "bm"
                ? `Google Drive berjaya disambungkan! Ketik 'Sandar TT ${profile.taxYear} ke Drive'.`
                : `Google Drive connected successfully! Tap 'Back Up YA ${profile.taxYear} to Drive'.`
            );
          }
        },
      });
      client.requestAccessToken();
      return;
    }
    handleGoogleSignIn();
  }

  async function handleSyncDriveIndex() {
    const token = getGoogleDriveToken();
    if (!token) {
      setDriveSyncMsg(
        "Google Drive session expired — tap 'Reconnect Google Drive' below."
      );
      return;
    }
    setDriveSyncing(true);
    setDriveSyncMsg(null);
    try {
      const res = await syncYearIndexToGoogleDrive(
        token,
        profile.taxYear,
        expenses
      );
      setDriveFolderUrl(res.folderUrl);
      setDriveSyncMsg(
        `Backed up YA ${profile.taxYear} CSV Index + JSON (${res.syncedCount} records) to Google Drive!`
      );
    } catch (err) {
      if (err instanceof Error && err.message === "DRIVE_TOKEN_EXPIRED") {
        saveGoogleDriveToken(null);
        setDriveSyncMsg(
          "Google Drive session expired — tap 'Reconnect Google Drive' to refresh access."
        );
      } else {
        setDriveSyncMsg(
          err instanceof Error
            ? err.message
            : "Could not sync to Google Drive. Check that Google Drive API is enabled."
        );
      }
    } finally {
      setDriveSyncing(false);
    }
  }

  async function handleSignOut() {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
  }

  async function handlePushLocalToCloud() {
    const supabase = getSupabaseClient();
    const session = (await supabase?.auth.getSession())?.data.session;
    if (!session?.user?.id) return;
    setMigratingLocal(true);
    setMigrateMsg(null);
    try {
      const res = await syncLocalDataToCloud(session.user.id);
      const status = await getCloudSyncStatus(session.user.id);
      const errNote = res.error || status.error;
      if (errNote) {
        setMigrateMsg(`Cloud sync error: ${errNote} (Cloud: ${status.cloudExpensesCount} expenses, Local: ${status.localExpensesCount})`);
      } else if (res.syncedExpenses > 0) {
        setMigrateMsg(`Pushed ${res.syncedExpenses} local receipt(s) to cloud! Total in cloud: ${status.cloudExpensesCount} expenses, ${status.cloudProfilesCount} profiles.`);
      } else {
        setMigrateMsg(`Cloud is up to date (${status.cloudExpensesCount} expenses, ${status.cloudProfilesCount} profiles in cloud; ${status.localExpensesCount} in local cache). User ID: ${session.user.id.slice(0, 8)}...`);
      }
    } catch (err) {
      setMigrateMsg(err instanceof Error ? err.message : "Failed to push local records to cloud.");
    } finally {
      setMigratingLocal(false);
    }
  }

  function updateField<K extends keyof TaxProfile>(key: K, value: TaxProfile[K]) {
    onUpdateProfile({ ...profile, [key]: value });
  }

  function updateStatus<K extends keyof TaxProfile["statusReliefs"]>(
    key: K,
    value: TaxProfile["statusReliefs"][K]
  ) {
    onUpdateProfile({
      ...profile,
      statusReliefs: { ...profile.statusReliefs, [key]: value },
    });
  }

  return (
    <div className="space-y-4 pb-6">
      {/* CukaiKu Subscription & AI Quota Card */}
      <section className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 p-4 text-white shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="rounded-xl bg-amber-400/20 p-2 text-amber-300 ring-1 ring-amber-300/40">
              <Crown className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold">
                  CukaiKu{" "}
                  {subscription.planTier === "family"
                    ? copy.familyPassLabel
                    : subscription.planTier === "pro"
                    ? copy.proPassLabel
                    : copy.freeStarterLabel}
                </h2>
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-100">
                  {lang === "bm"
                    ? subscription.planTier === "free"
                      ? "PERCUMA"
                      : subscription.planTier === "family"
                      ? "KELUARGA"
                      : "PRO"
                    : subscription.planTier}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-emerald-100/85">
                {subscription.aiScansUsed} / {subscription.aiScansLimit}{" "}
                {lang === "bm"
                  ? "Imbasan AI digunakan • OCR Tempatan Percuma Tanpa Had"
                  : "AI Vision Scans used • Unlimited Free On-Device OCR"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenUpgrade()}
            className="shrink-0 rounded-xl bg-amber-400 px-3 py-2 text-xs font-extrabold text-slate-950 shadow-xs hover:bg-amber-300 active:scale-95"
          >
            {subscription.planTier === "free" ? copy.upgradeBtn : copy.managePassBtn}
          </button>
        </div>
      </section>

      {/* Salaried (e-BE) vs. Freelancer / Sole Prop (e-B) Filing Mode */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-2.5">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            {copy.filingModeTitle.replace("{year}", String(profile.taxYear))}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {copy.filingModeSub}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => updateField("taxpayerMode", "e-BE")}
            className={`rounded-xl border p-3 text-left transition ${
              (profile.taxpayerMode || "e-BE") === "e-BE"
                ? "border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <p className="text-xs font-bold text-slate-900">
              {personalization.language === "bm"
                ? "Individu Makan Gaji (Borang e-BE)"
                : "Salaried Individual (Form e-BE)"}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {personalization.language === "bm"
                ? `Pendapatan penggajian sahaja • Akhir e-Filing 30 April ${profile.taxYear + 1}`
                : `Employment income only • e-Filing deadline 30 April ${profile.taxYear + 1}`}
            </p>
          </button>
          <button
            type="button"
            onClick={() => updateField("taxpayerMode", "e-B")}
            className={`rounded-xl border p-3 text-left transition ${
              profile.taxpayerMode === "e-B"
                ? "border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <p className="text-xs font-bold text-slate-900">
              {personalization.language === "bm"
                ? "Pekerja Bebas / Perniagaan (Borang e-B)"
                : "Freelancer / Sole Prop / Mixed (Form e-B)"}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {personalization.language === "bm"
                ? `Pelepasan perniagaan + peribadi • Akhir 30 Jun ${profile.taxYear + 1} • Ansuran CP500`
                : `Business + personal reliefs • Deadline 30 June ${profile.taxYear + 1} • CP500 instalments`}
            </p>
          </button>
        </div>
      </section>

      {/* Personalization: Life-Stage Presets, Language, Tax Goal & Payday */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">
              {copy.personalizationTitle}
            </h2>
            <InfoHint
              title={lang === "bm" ? "Sesuaikan CukaiKu untuk Anda" : "Tailor CukaiKu to You"}
              text={
                lang === "bm"
                  ? "Pilih praset peringkat kehidupan, tukar bahasa EN/BM, tetapkan sasaran penjimatan cukai, dan tambah pintasan hari gaji atau bil bulanan berulang."
                  : "Choose a life-stage preset, switch EN/BM language, set a tax-saving goal, and add payday or monthly recurring bill shortcuts."
              }
            />
          </div>
          <div className="inline-flex rounded-xl bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() =>
                onUpdatePersonalization({ ...personalization, language: "en" })
              }
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                personalization.language === "en"
                  ? "bg-white text-emerald-700 shadow-2xs"
                  : "text-slate-500"
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdatePersonalization({ ...personalization, language: "bm" })
              }
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                personalization.language === "bm"
                  ? "bg-white text-emerald-700 shadow-2xs"
                  : "text-slate-500"
              }`}
            >
              BM
            </button>
          </div>
        </div>

        {/* Life-Stage Presets */}
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">
            <span>{copy.lifeStagePresetLabel}</span>
            <InfoHint
              align="left"
              title={lang === "bm" ? "Konfigurasi Automatik Aplikasi" : "Auto-Configures Your App"}
              text={
                lang === "bm"
                  ? "Memilih praset mengemas kini mod e-BE/e-B, pelepasan status, dan menyematkan kategori LHDN terbaik ke Utama."
                  : "Selecting a preset updates your e-BE/e-B mode, status reliefs, and pins the best LHDN categories to your Dashboard."
              }
            />
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {LIFE_STAGE_PRESETS.map((preset) => {
              const active = personalization.lifeStage === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onApplyLifeStage(preset.id)}
                  className={`rounded-xl border p-2.5 text-left transition ${
                    active
                      ? "border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600"
                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-slate-900">
                      {personalization.language === "bm"
                        ? preset.titleBm
                        : preset.titleEn}
                    </span>
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                      {lang === "bm" && preset.badge === "Family"
                        ? "Keluarga"
                        : preset.badge}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {personalization.language === "bm"
                      ? preset.subtitleBm
                      : preset.subtitleEn}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tax-Saving Goal & Payday */}
        {(() => {
          const maxTaxGoal = calculateMaxTaxSavingGoal(profile);
          const effectiveGoal = Math.min(personalization.taxSavingGoal, maxTaxGoal);
          return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-700">
              <span>{copy.taxSavingGoalLabel}</span>
              <InfoHint
                align="left"
                title={lang === "bm" ? "Sasaran Peribadi" : "Personal Target"}
                text={
                  lang === "bm"
                    ? "Memaparkan bar kemajuan di Utama untuk menjejak sejauh mana anda menghampiri sasaran penjimatan cukai tahunan anda (dihadkan mengikut pendapatan)."
                    : "Shows a progress bar on your Dashboard tracking how close you are to your yearly tax-saving target (capped based on your income)."
                }
              />
            </label>
            <input
              type="number"
              min="0"
              max={maxTaxGoal}
              step="100"
              value={effectiveGoal}
              onChange={(e) => {
                const raw = Math.max(0, Number(e.target.value) || 0);
                onUpdatePersonalization({
                  ...personalization,
                  taxSavingGoal: Math.min(maxTaxGoal, raw),
                });
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
            />
            <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-500">
              <span>
                {lang === "bm"
                  ? `Had maksima pendapatan: ${formatRM(maxTaxGoal)}`
                  : `Max based on income: ${formatRM(maxTaxGoal)}`}
              </span>
              {maxTaxGoal > 0 && effectiveGoal < maxTaxGoal && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePersonalization({
                      ...personalization,
                      taxSavingGoal: maxTaxGoal,
                    })
                  }
                  className="font-semibold text-emerald-700 hover:underline"
                >
                  {lang === "bm" ? "Tetapkan Maks" : "Set Max"}
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-700">
              <span>{copy.paydayReminderLabel}</span>
              <InfoHint
                align="right"
                title={lang === "bm" ? "Peringatan Hari Gaji" : "Payday Nudge"}
                text={
                  lang === "bm"
                    ? "Memaparkan sepanduk lembut di Utama sekitar hari gaji anda untuk mengingatkan anda merekod slip gaji terkini & bil bulanan."
                    : "Displays a gentle banner on your Dashboard around your payday reminding you to log your latest payslip & monthly bills."
                }
              />
            </label>
            <input
              type="number"
              min="1"
              max="31"
              placeholder={
                personalization.language === "bm"
                  ? "cth. 25 (pilihan)"
                  : "e.g. 25 (optional)"
              }
              value={personalization.paydayDay ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                const parsed = raw ? Math.min(31, Math.max(1, Number(raw))) : null;
                onUpdatePersonalization({
                  ...personalization,
                  paydayDay: parsed,
                });
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
            />
          </div>
        </div>
          );
        })()}

        {/* Monthly Recurring Bills Manager */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-xs font-bold text-slate-800">
              <span>{copy.recurringBillsMgrTitle}</span>
              <InfoHint
                align="left"
                title={lang === "bm" ? "Rekod Bulanan Pantas" : "Quick Monthly Logging"}
                text={
                  lang === "bm"
                    ? "Bil yang disimpan di sini dipaparkan di Utama supaya anda boleh merekodnya dalam 1 ketik sebulan sekali tanpa menaip semula."
                    : "Bills saved here appear on your Dashboard so you can log them in 1 tap once a month without re-typing."
                }
              />
            </span>
            <span className="text-[10px] font-semibold text-slate-500">
              {recurringBills.length} {copy.savedCount}
            </span>
          </div>

          <div className="space-y-1.5">
            {recurringBills.map((bill) => (
              <div
                key={bill.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs border border-slate-200/70"
              >
                <span className="truncate font-medium text-slate-800">
                  {lang === "bm" && RECURRING_BILL_BM[bill.id]
                    ? RECURRING_BILL_BM[bill.id].merchant
                    : bill.merchant}{" "}
                  — <strong>{formatRM(bill.amount)}</strong>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onSaveRecurringBills(
                      recurringBills.filter((b) => b.id !== bill.id)
                    )
                  }
                  className="text-[11px] font-semibold text-rose-600 hover:underline"
                >
                  {copy.removeBtn}
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-4">
            <input
              type="text"
              placeholder={
                personalization.language === "bm"
                  ? "Kedai (cth. Taska)"
                  : "Merchant (e.g. Taska)"
              }
              value={newBillMerchant}
              onChange={(e) => setNewBillMerchant(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs sm:col-span-2"
            />
            <input
              type="number"
              min="1"
              placeholder={
                personalization.language === "bm" ? "RM / bulan" : "RM / month"
              }
              value={newBillAmount}
              onChange={(e) => setNewBillAmount(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
            />
            <select
              value={newBillCategory}
              onChange={(e) => setNewBillCategory(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
            >
              <option value="lifestyle">
                {personalization.language === "bm" ? "Gaya Hidup" : "Lifestyle"}
              </option>
              <option value="sports">
                {personalization.language === "bm" ? "Sukan / Gim" : "Sports / Gym"}
              </option>
              <option value="edu_med_insurance">
                {personalization.language === "bm"
                  ? "Insurans Perubatan"
                  : "Med Insurance"}
              </option>
              <option value="childcare">
                {personalization.language === "bm" ? "Taska / Tadika" : "Childcare"}
              </option>
              <option value="sspn">SSPN</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
              const amt = Number(newBillAmount);
              if (!newBillMerchant.trim() || !amt || amt <= 0) return;
              onSaveRecurringBills([
                ...recurringBills,
                {
                  id: `tpl-${Date.now()}`,
                  merchant: newBillMerchant.trim(),
                  categoryId: newBillCategory,
                  subCategoryId: null,
                  amount: amt,
                  description:
                    personalization.language === "bm"
                      ? "Bil bulanan berulang"
                      : "Monthly recurring bill",
                },
              ]);
              setNewBillMerchant("");
              setNewBillAmount("");
            }}
            className="w-full rounded-lg border border-emerald-300 bg-emerald-50 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
          >
            {copy.addRecurringBtn}
          </button>
        </div>
      </section>

      {/* Income, PCB & Zakat + Payslip Extractor */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {copy.incomeEstimateTitle.replace("{year}", String(profile.taxYear))}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {copy.incomeEstimateSub}
            </p>
          </div>
          <input
            ref={payslipInputRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              handlePayslipUpload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={payslipScanning}
            onClick={() => payslipInputRef.current?.click()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-xs transition active:scale-95 disabled:opacity-60"
          >
            {payslipScanning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileUp className="h-3.5 w-3.5" />
            )}
            {copy.uploadPayslipBtn}
          </button>
        </div>

        {/* Payslip Scanning State */}
        {payslipScanning && (
          <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
            <span>{payslipProgress || "Extracting payslip figures..."}</span>
          </div>
        )}

        {/* Payslip Error */}
        {payslipError && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>{payslipError}</span>
          </div>
        )}

        {/* Applied Confirmation */}
        {appliedBanner && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{appliedBanner}</span>
          </div>
        )}

        {/* Extracted Payslip Preview Card */}
        {payslipData && (
          <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <span>
                  {personalization.language === "bm" ? "Diekstrak daripada " : "Extracted from "}
                  {payslipData.sourceType === "ea-form"
                    ? `${personalization.language === "bm" ? "Borang EA" : "EA Form"}${payslipData.formVersion ? ` (${payslipData.formVersion})` : ""}`
                    : payslipData.monthDetected || (personalization.language === "bm" ? "Slip Gaji" : "Payslip")}
                </span>
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                {payslipData.confidence === "high"
                  ? (personalization.language === "bm" ? "ketepatan tinggi" : "high confidence")
                  : payslipData.confidence === "medium"
                  ? (personalization.language === "bm" ? "ketepatan sederhana" : "medium confidence")
                  : (personalization.language === "bm" ? "ketepatan rendah" : "low confidence")}
              </span>
            </div>

            {payslipData.yearDetected && payslipData.yearDetected !== profile.taxYear && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-[11px] text-amber-900">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span>
                  {personalization.language === "bm"
                    ? `Nota: Dokumen ini adalah untuk TT ${payslipData.yearDetected}, tetapi anda sedang melihat profil TT ${profile.taxYear}. Tukar tahun di bahagian atas kepada TT ${payslipData.yearDetected} jika anda mahu menyimpan rekod ke tahun tersebut.`
                    : `Note: This document is for YA ${payslipData.yearDetected}, while you are currently viewing YA ${profile.taxYear}. Switch the top year selector to YA ${payslipData.yearDetected} if you want to save it to that year.`}
                </span>
              </div>
            )}

            {(payslipData.employeeName || payslipData.employerName) && (
              <div className="grid grid-cols-1 gap-2 rounded-xl bg-white/80 p-2.5 text-[11px] sm:grid-cols-2">
                {payslipData.employeeName && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {personalization.language === "bm" ? "Butiran Pekerja" : "Employee Details"}
                    </p>
                    <p className="font-bold text-slate-900">{payslipData.employeeName}</p>
                    <p className="text-slate-600">
                      {[
                        payslipData.employeeIc ? `KP: ${payslipData.employeeIc}` : null,
                        payslipData.employeePosition || null,
                        payslipData.employeeEpfNo ? `KWSP: ${payslipData.employeeEpfNo}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                )}
                {payslipData.employerName && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {personalization.language === "bm" ? "Majikan" : "Employer"}
                    </p>
                    <p className="font-bold text-slate-900">{payslipData.employerName}</p>
                    {payslipData.employerNo && (
                      <p className="text-slate-600">
                        {personalization.language === "bm" ? "No. Majikan: " : "Employer No: "}
                        {payslipData.employerNo}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white p-2.5">
                <p className="text-[10px] text-slate-500">
                  {personalization.language === "bm" ? "Jumlah Pendapatan (B + C)" : "Est. Annual Income"}
                </p>
                <p className="font-bold text-slate-900">
                  {payslipData.estimatedAnnualIncome > 0
                    ? formatRM(payslipData.estimatedAnnualIncome, true)
                    : (personalization.language === "bm" ? "Tidak dikesan" : "Not detected")}
                </p>
                {payslipData.sourceType === "ea-form" &&
                  ((payslipData.grossSalaryB1a ?? 0) > 0 || (payslipData.allowancesB1c ?? 0) > 0) && (
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      B1(a): {formatRM(payslipData.grossSalaryB1a ?? 0, true)}
                      {(payslipData.allowancesB1c ?? 0) > 0
                        ? ` · B1(c): ${formatRM(payslipData.allowancesB1c ?? 0, true)}`
                        : ""}
                    </p>
                  )}
              </div>
              <div className="rounded-xl bg-white p-2.5">
                <p className="text-[10px] text-slate-500">
                  {personalization.language === "bm" ? "PCB / MTD (Terkumpul)" : "PCB / MTD (YTD)"}
                </p>
                <p className="font-bold text-slate-900">
                  {payslipData.ytdPcb > 0 || payslipData.sourceType === "ea-form"
                    ? formatRM(payslipData.ytdPcb, true)
                    : (personalization.language === "bm" ? "Tidak dikesan" : "Not detected")}
                </p>
              </div>
              {(payslipData.ytdEpf > 0 || payslipData.employeeEpf > 0 || payslipData.sourceType === "ea-form") && (
                <div className="rounded-xl bg-white p-2.5">
                  <p className="text-[10px] text-slate-500">
                    {personalization.language === "bm" ? "KWSP Pekerja (Terkumpul)" : "Employee EPF (YTD)"}
                  </p>
                  <p className="font-bold text-emerald-700">
                    {formatRM(payslipData.ytdEpf || payslipData.employeeEpf, true)}
                  </p>
                </div>
              )}
              {(payslipData.ytdSocso > 0 ||
                payslipData.employeeSocso > 0 ||
                payslipData.ytdEis > 0 ||
                payslipData.sourceType === "ea-form") && (
                <div className="rounded-xl bg-white p-2.5">
                  <p className="text-[10px] text-slate-500">
                    {personalization.language === "bm" ? "PERKESO + SIP (Terkumpul)" : "SOCSO + EIS (YTD)"}
                  </p>
                  <p className="font-bold text-emerald-700">
                    {formatRM(
                      (payslipData.ytdSocso || payslipData.employeeSocso) +
                        (payslipData.ytdEis || payslipData.employeeEis),
                      true
                    )}
                  </p>
                </div>
              )}
              {(payslipData.ytdZakat > 0 ||
                payslipData.monthlyZakat > 0 ||
                payslipData.sourceType === "ea-form") && (
                <div className="rounded-xl bg-white p-2.5">
                  <p className="text-[10px] text-slate-500">
                    {personalization.language === "bm" ? "Zakat (Potongan Gaji)" : "Zakat (Salary Deduction)"}
                  </p>
                  <p className="font-bold text-slate-900">
                    {formatRM(payslipData.ytdZakat || payslipData.monthlyZakat, true)}
                  </p>
                </div>
              )}
              {payslipData.eaForm?.tax_exempt_benefits !== null &&
                payslipData.eaForm?.tax_exempt_benefits !== undefined && (
                  <div className="rounded-xl bg-white p-2.5">
                    <p className="text-[10px] text-slate-500">
                      {personalization.language === "bm"
                        ? "Elaun Dikecualikan Cukai (Bhg. F)"
                        : "Tax-Exempt Allowances (Sec. F)"}
                    </p>
                    <p className="font-bold text-slate-700">
                      {formatRM(payslipData.eaForm.tax_exempt_benefits, true)}
                    </p>
                  </div>
                )}
              {(() => {
                const derived = deriveChildrenFromEaForm(
                  payslipData.eaForm?.children_relief,
                  payslipData.eaForm?.eligible_children_for_tax_relief
                );
                if (!derived) return null;
                const totalChildren = derived.childrenUnder18 + derived.childrenHigherEd;
                return (
                  <div className="col-span-2 rounded-xl bg-white p-2.5">
                    <p className="text-[10px] text-slate-500">
                      {personalization.language === "bm"
                        ? "Bilangan Anak Layak (D5: Pelepasan Anak)"
                        : "Eligible Children (D5: Child Relief)"}
                    </p>
                    <p className="font-bold text-slate-900">
                      {totalChildren}{" "}
                      {personalization.language === "bm" ? "orang anak" : totalChildren === 1 ? "child" : "children"}
                      {payslipData.eaForm?.children_relief !== null &&
                        payslipData.eaForm?.children_relief !== undefined && (
                          <span className="ml-1.5 text-[11px] font-medium text-slate-500">
                            ({formatRM(payslipData.eaForm.children_relief, true)})
                          </span>
                        )}
                    </p>
                  </div>
                );
              })()}
            </div>

            {payslipData.eaForm?.warnings && payslipData.eaForm.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
                <p className="font-bold">
                  {personalization.language === "bm" ? "Amaran Semakan:" : "Extraction Warnings:"}
                </p>
                <ul className="mt-1 list-disc pl-4">
                  {payslipData.eaForm.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {payslipData.notes.length > 0 && (
              <p className="text-[11px] text-emerald-900">
                {payslipData.notes.join(" ")}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleApplyPayslip(false)}
                className="flex flex-1 flex-col items-center justify-center rounded-xl bg-emerald-600 px-3 py-2 text-white active:scale-[0.99]"
              >
                <span className="text-xs font-bold">
                  {personalization.language === "bm" ? "Guna Pendapatan & PCB" : "Apply Income & PCB"}
                </span>
                <span className="text-[10px] font-medium text-emerald-100">
                  {personalization.language === "bm" ? "Nilai profil sahaja" : "Profile numbers only"}
                </span>
              </button>
              {(payslipData.ytdEpf > 0 ||
                payslipData.employeeEpf > 0 ||
                payslipData.ytdSocso > 0 ||
                payslipData.employeeSocso > 0) && (
                <button
                  type="button"
                  onClick={() => handleApplyPayslip(true)}
                  className="flex flex-1 flex-col items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-white active:scale-[0.99]"
                >
                  <span className="text-xs font-bold">
                    {personalization.language === "bm" ? "Guna + Rekod KWSP & PERKESO" : "Apply + Log EPF & SOCSO"}
                  </span>
                  <span className="text-[10px] font-medium text-slate-300">
                    {personalization.language === "bm" ? "Kemas kini pelepasan terkumpul" : "Updates YTD reliefs (no duplicates)"}
                  </span>
                </button>
              )}
            </div>

            {payslipData.rawText && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowPayslipText((v) => !v)}
                  className="text-[11px] font-semibold text-emerald-800 underline underline-offset-2"
                >
                  {showPayslipText
                    ? (personalization.language === "bm" ? "Sembunyi teks diekstrak" : "Hide extracted text")
                    : (personalization.language === "bm" ? "Lihat teks diekstrak" : "View extracted payslip text")}
                </button>
                {showPayslipText && (
                  <pre className="mt-1.5 max-h-32 overflow-auto rounded-xl bg-white p-2.5 text-[10px] text-slate-700 whitespace-pre-wrap">
                    {payslipData.rawText}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-700">
              <span>{copy.annualIncomeLabel}</span>
              <InfoHint
                title={lang === "bm" ? "Pendapatan Kasar Tahunan" : "Annual Gross Income"}
                align="left"
                text={
                  lang === "bm"
                    ? "Jumlah gaji tahunan, bonus atau hasil kerja bebas sebelum potongan KWSP & cukai (daripada Borang EA atau slip gaji anda)."
                    : "Total yearly salary, bonus, or freelance revenue before EPF & tax deductions (from your EA Form or payslip)."
                }
              />
            </label>
            <input
              type="number"
              min="0"
              step="1000"
              value={profile.annualIncome}
              onChange={(e) =>
                updateField("annualIncome", Number(e.target.value) || 0)
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
            />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-700">
              <span>{copy.pcbPaidLabel}</span>
              <InfoHint
                title={lang === "bm" ? "Potongan Cukai Berjadual (PCB)" : "Monthly Tax Deduction (PCB)"}
                text={
                  lang === "bm"
                    ? "Potongan Cukai Berjadual — cukai pendapatan yang telah dipotong daripada gaji bulanan anda. Meningkatkan lebihan LHDN atau mengurangkan baki perlu dibayar."
                    : "Potongan Cukai Berjadual — income tax already deducted from your monthly salary. Increases your LHDN refund or lowers balance due."
                }
              />
            </label>
            <input
              type="number"
              min="0"
              step="100"
              value={profile.pcbPaid}
              onChange={(e) =>
                updateField("pcbPaid", Number(e.target.value) || 0)
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
            />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-700">
              <span>{copy.zakatPaidLabel}</span>
              <InfoHint
                title={lang === "bm" ? "Rebat Cukai 100%" : "100% Tax Rebate"}
                align="right"
                text={
                  lang === "bm"
                    ? "Resit rasmi Zakat / Fitrah memberi rebat RM-untuk-RM secara langsung daripada cukai LHDN akhir anda (bukan sekadar potongan pelepasan)."
                    : "Official Zakat / Fitrah receipts give a direct RM-for-RM rebate off your final LHDN tax payable (not just a relief deduction)."
                }
              />
            </label>
            <input
              type="number"
              min="0"
              step="50"
              value={profile.zakatPaid}
              onChange={(e) =>
                updateField("zakatPaid", Number(e.target.value) || 0)
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
            />
          </div>
        </div>
      </section>

      {/* Automatic & Family Status Reliefs */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-900">
            {copy.statusReliefsTitle}
          </h2>
          <InfoHint
            title={lang === "bm" ? "Pelepasan LHDN Automatik" : "Automatic LHDN Reliefs"}
            text={
              lang === "bm"
                ? "Pelepasan Individu (RM 9,000), Pasangan (RM 4,000), dan Anak ialah kelayakan berkanun — cuma tandakan yang berkenaan, tiada resit pembelian diperlukan."
                : "Personal (RM 9,000), Spouse (RM 4,000), and Child reliefs are statutory entitlements — just toggle what applies to you, no purchase receipts required."
            }
          />
        </div>

        <div className="divide-y divide-slate-100">
          <ToggleRow
            label={copy.statusIndividual}
            amount={amounts.individual}
            checked={profile.statusReliefs.individual}
            onChange={(v) => updateStatus("individual", v)}
          />
          <ToggleRow
            label={copy.statusDisabledIndividual}
            amount={amounts.disabledIndividual}
            checked={profile.statusReliefs.disabledIndividual}
            onChange={(v) => updateStatus("disabledIndividual", v)}
          />
          <ToggleRow
            label={copy.statusSpouse}
            amount={amounts.spouse}
            checked={profile.statusReliefs.spouse}
            onChange={(v) => updateStatus("spouse", v)}
          />
          <ToggleRow
            label={copy.statusDisabledSpouse}
            amount={amounts.disabledSpouse}
            checked={profile.statusReliefs.disabledSpouse}
            onChange={(v) => updateStatus("disabledSpouse", v)}
          />
          <CounterRow
            label={copy.statusChildUnder18}
            unitAmount={amounts.childUnder18}
            eachLabel={lang === "bm" ? "seorang" : "each"}
            value={profile.statusReliefs.childrenUnder18}
            onChange={(v) => updateStatus("childrenUnder18", v)}
          />
          <CounterRow
            label={copy.statusChildHigherEd}
            unitAmount={amounts.childHigherEd}
            eachLabel={lang === "bm" ? "seorang" : "each"}
            value={profile.statusReliefs.childrenHigherEd}
            onChange={(v) => updateStatus("childrenHigherEd", v)}
          />
          <CounterRow
            label={copy.statusDisabledChild}
            unitAmount={amounts.disabledChild}
            eachLabel={lang === "bm" ? "seorang" : "each"}
            value={profile.statusReliefs.disabledChildren}
            onChange={(v) => updateStatus("disabledChildren", v)}
          />
        </div>
      </section>

      {/* Cloud Sync (Supabase) & 7-Year Google Drive Archive */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isSupabaseConfigured ? (
              <Cloud className="h-4 w-4 text-emerald-600" />
            ) : (
              <CloudOff className="h-4 w-4 text-slate-400" />
            )}
            <h2 className="text-sm font-bold text-slate-900">
              {copy.cloudVaultTitle}
            </h2>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
              userEmail
                ? "bg-emerald-100 text-emerald-800"
                : isSupabaseConfigured
                ? "bg-amber-100 text-amber-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {userEmail
              ? driveConnected
                ? lang === "bm"
                  ? "Awan + Drive Disegerak"
                  : "Cloud + Drive Synced"
                : lang === "bm"
                  ? "Segerak Awan Aktif"
                  : "Cloud Synced Active"
              : isSupabaseConfigured
              ? lang === "bm"
                ? "Perlu Log Masuk"
                : "Sign In Needed"
              : lang === "bm"
                ? "Mod Tempatan"
                : "Local Mode"}
          </span>
        </div>

        {isSupabaseConfigured ? (
          userEmail ? (
            <div className="space-y-3">
              {/* Account Status Card */}
              <div className="flex items-center justify-between rounded-xl bg-emerald-50/90 border border-emerald-200/60 p-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-950">
                      {copy.cloudActiveTitle}
                    </p>
                    <p className="text-[11px] text-emerald-800">
                      {userEmail}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 active:scale-95"
                >
                  <LogOut className="h-3.5 w-3.5" /> {copy.signOutBtn}
                </button>
              </div>

              {/* Optional 7-Year Google Drive Vault Card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Database className="h-3.5 w-3.5 text-slate-600" />
                      {lang === "bm"
                        ? "Arkib Google Drive 7-Tahun LHDN (Pilihan)"
                        : "7-Year LHDN Drive Archive (Optional)"}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      {driveConnected
                        ? lang === "bm"
                          ? `Disambungkan! Sandaran PDF asal & helaian Borang BE terus ke My Drive / CukaiKu / Receipts / ${profile.taxYear}`
                          : `Connected! Backs up raw PDFs & Form BE worksheets directly to My Drive / CukaiKu / Receipts / ${profile.taxYear}`
                        : lang === "bm"
                          ? "Pilihan: Simpan sandaran automatik semua resit dan helaian kerja terus ke Google Drive peribadi anda untuk ketenangan audit 7 tahun."
                          : "Optional: Automatically deposit an independent backup of all receipts and worksheets directly into your personal Google Drive for 7-year audit peace of mind."}
                    </p>
                  </div>
                  {driveConnected && (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      {lang === "bm" ? "Disambungkan" : "Connected"}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {driveConnected ? (
                    <>
                      <button
                        type="button"
                        disabled={driveSyncing}
                        onClick={handleSyncDriveIndex}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white active:scale-[0.99] disabled:opacity-60"
                      >
                        {driveSyncing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Cloud className="h-3.5 w-3.5" />
                        )}
                        {lang === "bm"
                          ? `Sandar TT ${profile.taxYear} ke Drive`
                          : `Back Up YA ${profile.taxYear} to Drive`}
                      </button>
                      {driveFolderUrl && (
                        <a
                          href={driveFolderUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                        >
                          {lang === "bm" ? "Buka Folder Drive" : "Open Drive Folder"}
                        </a>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={authLoading}
                      onClick={handleConnectGoogleDrive}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-xs hover:bg-slate-50 active:scale-[0.99]"
                    >
                      <Cloud className="h-3.5 w-3.5 text-blue-600" />
                      {copy.enableDriveBtn}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={migratingLocal}
                    onClick={handlePushLocalToCloud}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60"
                    title="Upload any receipts or profile numbers entered locally on this browser into your cloud database"
                  >
                    {migratingLocal ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                    {copy.pushLocalBtn}
                  </button>
                </div>
              </div>

              {migrateMsg && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900">
                  {migrateMsg}
                </div>
              )}

              {driveSyncMsg && (
                <p className="text-xs font-medium text-emerald-800">
                  {driveSyncMsg}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center gap-3 pb-1">
                <img
                  src="/icon.png"
                  alt="CukaiKu"
                  className="h-10 w-10 shrink-0 rounded-xl object-contain shadow-xs border border-slate-200"
                />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {lang === "bm" ? "Arkib Awan CukaiKu" : "CukaiKu Cloud Vault"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {lang === "bm"
                      ? "Segerakkan resit dengan selamat antara telefon dan PC anda"
                      : "Sync receipts securely across your phone and PC"}
                  </p>
                </div>
              </div>
              <div className="rounded-xl bg-amber-50/90 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <CloudOff className="h-3.5 w-3.5 text-amber-600" />
                  {copy.localBrowserMode}
                </p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  {copy.localBrowserDesc}
                </p>
              </div>
              <p className="text-xs text-slate-500">
                {lang === "bm"
                  ? "Log masuk ke akaun CukaiKu peribadi anda (atau daftar di bawah) untuk menyandar dan menyegerakkan resit secara peribadi antara telefon dan komputer."
                  : "Sign in to your personal CukaiKu account (or create one below) to privately back up and sync receipts between your phone and computer."}
              </p>
              {/* Google Identity Services 1-Click Container */}
              <div className="flex w-full justify-center">
                <div
                  id="google-signin-btn-container"
                  className={`flex w-full justify-center min-h-[44px] ${
                    !gisReady ? "hidden" : ""
                  }`}
                />
                {!gisReady && (
                  <button
                    type="button"
                    id="google-signin-fallback-btn"
                    disabled={authLoading}
                    onClick={handleGoogleSignIn}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-800 shadow-xs hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    {authLoading ? "Connecting to Google..." : "Continue with Google"}
                  </button>
                )}
              </div>
              {/* Collapsed Email & Password Fallback */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowEmailAuth((prev) => !prev)}
                  className="flex w-full items-center justify-center gap-1.5 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition"
                >
                  <span>
                    {lang === "bm"
                      ? "Guna emel & kata laluan"
                      : "Use email & password instead"}
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${
                      showEmailAuth ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {showEmailAuth && (
                  <div className="mt-2.5 space-y-2.5 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <input
                      type="email"
                      placeholder={lang === "bm" ? "Alamat emel" : "Email address"}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                    <input
                      type="password"
                      placeholder={lang === "bm" ? "Kata laluan" : "Password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={authLoading}
                        onClick={() => handleAuth("signin")}
                        className="flex-1 rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 active:scale-95"
                      >
                        {lang === "bm" ? "Log Masuk" : "Sign In"}
                      </button>
                      <button
                        type="button"
                        disabled={authLoading}
                        onClick={() => handleAuth("signup")}
                        className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-95"
                      >
                        {lang === "bm" ? "Daftar Akaun" : "Create Account"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {authStatus && (
                <p className="text-xs text-emerald-700">{authStatus}</p>
              )}
            </div>
          )
        ) : (
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 space-y-1.5">
            <p className="font-semibold text-slate-800">
              Currently running in Local Browser Mode
            </p>
            <p>
              To sync across your phone & PC with encrypted cloud receipt
              backup, add{" "}
              <code className="rounded bg-slate-200/70 px-1 py-0.5 text-[11px]">
                NEXT_PUBLIC_SUPABASE_URL
              </code>{" "}
              and{" "}
              <code className="rounded bg-slate-200/70 px-1 py-0.5 text-[11px]">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>{" "}
              to{" "}
              <code className="rounded bg-slate-200/70 px-1 py-0.5 text-[11px]">
                .env.local
              </code>{" "}
              and run{" "}
              <code className="rounded bg-slate-200/70 px-1 py-0.5 text-[11px]">
                supabase/schema.sql
              </code>
              .
            </p>
          </div>
        )}
      </section>

      {/* Demo & Data Controls */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-2.5">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-bold text-slate-900">{copy.dataToolsTitle}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onLoadSampleData}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {lang === "bm"
              ? `Muat Data Contoh TT ${profile.taxYear}`
              : `Load Sample YA ${profile.taxYear} Data`}
          </button>
          <button
            type="button"
            onClick={onClearLocalData}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {copy.clearYearBtn.replace("{year}", String(profile.taxYear))}
          </button>
        </div>
      </section>
    </div>
  );
}

function ToggleRow({
  label,
  amount,
  checked,
  onChange,
}: {
  label: string;
  amount: number;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-2.5">
      <div>
        <p className="text-xs font-medium text-slate-800">{label}</p>
        <p className="text-[11px] text-emerald-700 font-semibold">
          {formatRM(amount)}
        </p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-emerald-600"
      />
    </label>
  );
}

function CounterRow({
  label,
  unitAmount,
  eachLabel = "each",
  value,
  onChange,
}: {
  label: string;
  unitAmount: number;
  eachLabel?: string;
  value: number;
  onChange: (val: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div>
        <p className="text-xs font-medium text-slate-800">{label}</p>
        <p className="text-[11px] text-emerald-700 font-semibold">
          {formatRM(unitAmount)} {eachLabel}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700"
        >
          -
        </button>
        <span className="w-5 text-center text-xs font-bold text-slate-900">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700"
        >
          +
        </button>
      </div>
    </div>
  );
}
