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
import { formatRM } from "@/lib/calculator";
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
import { getCloudSyncStatus, syncLocalDataToCloud } from "@/lib/storage";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { TaxExpense, TaxProfile, UserSubscription } from "@/lib/types";
import { InfoHint } from "./InfoHint";

interface SettingsTabProps {
  profile: TaxProfile;
  subscription: UserSubscription;
  expenses: TaxExpense[];
  userEmail: string | null;
  driveConnected: boolean;
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
  onUpdateProfile,
  onOpenUpgrade,
  onLogPayslipReliefs,
  onLoadSampleData,
  onClearLocalData,
}: SettingsTabProps) {
  const amounts = getStatusReliefAmounts(profile.taxYear);
  const payslipInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [gisReady, setGisReady] = useState(false);
  const [showEmailAuth, setShowEmailAuth] = useState(false);

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

      if (isPdf) {
        setPayslipProgress("Reading PDF payslip...");
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/parse-payslip", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (!res.ok) {
          setPayslipError(
            data.message ||
              "Could not read PDF payslip. Try uploading a screenshot/photo instead."
          );
          return;
        }
        setPayslipData(data as PayslipExtraction);
      } else {
        // Image / screenshot payslip -> built-in free on-device OCR
        setPayslipProgress("Loading on-device OCR...");
        const Tesseract = await import("tesseract.js");
        const { data } = await Tesseract.recognize(file, "eng", {
          logger: (m) => {
            if (
              m.status === "recognizing text" &&
              typeof m.progress === "number"
            ) {
              setPayslipProgress(
                `Reading payslip... ${Math.round(m.progress * 100)}%`
              );
            }
          },
        });
        const parsed = parseMalaysianPayslipText(data.text || "");
        setPayslipData(parsed);
      }
    } catch {
      setPayslipError(
        "Failed to read payslip. Try a clearer screenshot or enter the values manually below."
      );
    } finally {
      setPayslipScanning(false);
      setPayslipProgress("");
    }
  }

  async function handleApplyPayslip(includeReliefs: boolean) {
    if (!payslipData) return;

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
        ? "Applied income, PCB/Zakat & updated EPF/SOCSO reliefs in-place (no duplicates)!"
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
            setDriveSyncMsg("Google Drive connected successfully! Tap 'Back Up YA " + profile.taxYear + " Index to Drive'.");
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
                    ? "Family & Joint Pass"
                    : subscription.planTier === "pro"
                    ? "Pro Pass"
                    : "Free Starter"}
                </h2>
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-100">
                  {subscription.planTier}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-emerald-100/85">
                {subscription.aiScansUsed} / {subscription.aiScansLimit} AI
                Vision Scans used • Unlimited Free On-Device OCR
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenUpgrade()}
            className="shrink-0 rounded-xl bg-amber-400 px-3 py-2 text-xs font-extrabold text-slate-950 shadow-xs hover:bg-amber-300 active:scale-95"
          >
            {subscription.planTier === "free" ? "Upgrade (RM 29)" : "Manage Pass"}
          </button>
        </div>
      </section>

      {/* Salaried (e-BE) vs. Freelancer / Sole Prop (e-B) Filing Mode */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-2.5">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            LHDN e-Filing Submission Form (YA {profile.taxYear})
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Switch between Salaried (Form e-BE, due 30 April) and Freelancer /
            Sole Proprietor / Mixed Income (Form e-B, due 30 June + CP500).
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
              Salaried Individual (Form e-BE)
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Employment income only • e-Filing deadline 30 April{" "}
              {profile.taxYear + 1}
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
              Freelancer / Sole Prop / Mixed (Form e-B)
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Business + personal reliefs • Deadline 30 June{" "}
              {profile.taxYear + 1} • CP500 instalments
            </p>
          </button>
        </div>
      </section>

      {/* Income, PCB & Zakat + Payslip Extractor */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              YA {profile.taxYear} Income & Tax Estimate
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Upload a payslip / EA Form to auto-fill, or edit figures directly.
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
            Upload Payslip
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
                  Extracted from{" "}
                  {payslipData.sourceType === "ea-form"
                    ? "EA Form"
                    : payslipData.monthDetected || "Payslip"}
                </span>
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                {payslipData.confidence} confidence
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white p-2.5">
                <p className="text-[10px] text-slate-500">Est. Annual Income</p>
                <p className="font-bold text-slate-900">
                  {payslipData.estimatedAnnualIncome > 0
                    ? formatRM(payslipData.estimatedAnnualIncome)
                    : "Not detected"}
                </p>
              </div>
              <div className="rounded-xl bg-white p-2.5">
                <p className="text-[10px] text-slate-500">PCB / MTD (YTD)</p>
                <p className="font-bold text-slate-900">
                  {payslipData.ytdPcb > 0
                    ? formatRM(payslipData.ytdPcb, true)
                    : "Not detected"}
                </p>
              </div>
              {(payslipData.ytdEpf > 0 || payslipData.employeeEpf > 0) && (
                <div className="rounded-xl bg-white p-2.5">
                  <p className="text-[10px] text-slate-500">Employee EPF (YTD)</p>
                  <p className="font-bold text-emerald-700">
                    {formatRM(payslipData.ytdEpf || payslipData.employeeEpf, true)}
                  </p>
                </div>
              )}
              {(payslipData.ytdSocso > 0 ||
                payslipData.employeeSocso > 0 ||
                payslipData.ytdEis > 0) && (
                <div className="rounded-xl bg-white p-2.5">
                  <p className="text-[10px] text-slate-500">SOCSO + EIS (YTD)</p>
                  <p className="font-bold text-emerald-700">
                    {formatRM(
                      (payslipData.ytdSocso || payslipData.employeeSocso) +
                        (payslipData.ytdEis || payslipData.employeeEis),
                      true
                    )}
                  </p>
                </div>
              )}
            </div>

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
                <span className="text-xs font-bold">Apply Income &amp; PCB</span>
                <span className="text-[10px] font-medium text-emerald-100">
                  Profile numbers only
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
                    Apply + Log EPF &amp; SOCSO
                  </span>
                  <span className="text-[10px] font-medium text-slate-300">
                    Updates YTD reliefs (no duplicates)
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
                    ? "Hide extracted text"
                    : "View extracted payslip text"}
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
              <span>Annual Income (RM)</span>
              <InfoHint
                title="Annual Gross Income"
                align="left"
                text="Total yearly salary, bonus, or freelance revenue before EPF & tax deductions (from your EA Form or payslip)."
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
              <span>PCB / MTD Paid YTD (RM)</span>
              <InfoHint
                title="Monthly Tax Deduction (PCB)"
                text="Potongan Cukai Berjadual — income tax already deducted from your monthly salary. Increases your LHDN refund or lowers balance due."
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
              <span>Zakat / Fitrah Rebate (RM)</span>
              <InfoHint
                title="100% Tax Rebate"
                align="right"
                text="Official Zakat / Fitrah receipts give a direct RM-for-RM rebate off your final LHDN tax payable (not just a relief deduction)."
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
            Status & Family Reliefs (No Receipt Needed)
          </h2>
        </div>

        <div className="divide-y divide-slate-100">
          <ToggleRow
            label="Individual & Dependent Relatives"
            amount={amounts.individual}
            checked={profile.statusReliefs.individual}
            onChange={(v) => updateStatus("individual", v)}
          />
          <ToggleRow
            label="Disabled Individual (OKU)"
            amount={amounts.disabledIndividual}
            checked={profile.statusReliefs.disabledIndividual}
            onChange={(v) => updateStatus("disabledIndividual", v)}
          />
          <ToggleRow
            label="Spouse Relief (No Income / Joint)"
            amount={amounts.spouse}
            checked={profile.statusReliefs.spouse}
            onChange={(v) => updateStatus("spouse", v)}
          />
          <ToggleRow
            label="Disabled Spouse (OKU)"
            amount={amounts.disabledSpouse}
            checked={profile.statusReliefs.disabledSpouse}
            onChange={(v) => updateStatus("disabledSpouse", v)}
          />
          <CounterRow
            label="Unmarried Children (Under 18)"
            unitAmount={amounts.childUnder18}
            value={profile.statusReliefs.childrenUnder18}
            onChange={(v) => updateStatus("childrenUnder18", v)}
          />
          <CounterRow
            label="Children 18+ (Diploma / Degree)"
            unitAmount={amounts.childHigherEd}
            value={profile.statusReliefs.childrenHigherEd}
            onChange={(v) => updateStatus("childrenHigherEd", v)}
          />
          <CounterRow
            label="Disabled Child (OKU)"
            unitAmount={amounts.disabledChild}
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
              Cloud Sync &amp; 7-Year LHDN Vault
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
                ? "Cloud + Drive Synced"
                : "Cloud Synced Active"
              : isSupabaseConfigured
              ? "Sign In Needed"
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
                      CukaiKu Cloud Sync: Active
                    </p>
                    <p className="text-[11px] text-emerald-800">
                      Signed in as <strong>{userEmail}</strong> • All receipts &amp; reliefs sync across your devices.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 active:scale-95"
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign Out
                </button>
              </div>

              {/* Optional 7-Year Google Drive Vault Card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Database className="h-3.5 w-3.5 text-slate-600" />
                      7-Year LHDN Drive Archive (Optional)
                    </h3>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      {driveConnected
                        ? `Connected! Backs up raw PDFs & Form BE worksheets directly to My Drive / CukaiKu / Receipts / ${profile.taxYear}`
                        : "Optional: Automatically deposit an independent backup of all receipts and worksheets directly into your personal Google Drive for 7-year audit peace of mind."}
                    </p>
                  </div>
                  {driveConnected && (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      Connected
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
                        Back Up YA {profile.taxYear} to Drive
                      </button>
                      {driveFolderUrl && (
                        <a
                          href={driveFolderUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                        >
                          Open Drive Folder
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
                      Enable Google Drive Archive (Optional)
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
                    Push Local Receipts to Cloud
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
                    CukaiKu Cloud Vault
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Sync receipts securely across your phone and PC
                  </p>
                </div>
              </div>
              <div className="rounded-xl bg-amber-50/90 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <CloudOff className="h-3.5 w-3.5 text-amber-600" />
                  Currently in Local Browser Mode
                </p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Receipts and numbers entered on this device stay in this browser only. To sync across your phone and PC, sign in below with the <strong>same account</strong> on both devices.
                </p>
              </div>
              <p className="text-xs text-slate-500">
                Sign in to your personal CukaiKu account (or create one below)
                to privately back up and sync receipts between your phone and
                computer.
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
                  <span>Use email &amp; password instead</span>
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
                      placeholder="Email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                    <input
                      type="password"
                      placeholder="Password"
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
                        Sign In
                      </button>
                      <button
                        type="button"
                        disabled={authLoading}
                        onClick={() => handleAuth("signup")}
                        className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-95"
                      >
                        Create Account
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
          <h2 className="text-sm font-bold text-slate-900">Data Tools</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onLoadSampleData}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Load Sample YA {profile.taxYear} Data
          </button>
          <button
            type="button"
            onClick={onClearLocalData}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear Local Data
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
  value,
  onChange,
}: {
  label: string;
  unitAmount: number;
  value: number;
  onChange: (val: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div>
        <p className="text-xs font-medium text-slate-800">{label}</p>
        <p className="text-[11px] text-emerald-700 font-semibold">
          {formatRM(unitAmount)} each
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
