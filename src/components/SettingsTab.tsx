"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudOff,
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
import { getStatusReliefAmounts } from "@/lib/lhdn-rules";
import {
  parseMalaysianPayslipText,
  PayslipExtraction,
} from "@/lib/payslip-parser";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { TaxProfile } from "@/lib/types";

interface SettingsTabProps {
  profile: TaxProfile;
  userEmail: string | null;
  onUpdateProfile: (next: TaxProfile) => Promise<void>;
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
  userEmail,
  onUpdateProfile,
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
        ? "Applied income, PCB/Zakat & logged EPF/SOCSO reliefs!"
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

  async function handleSignOut() {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
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
                className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white active:scale-[0.99]"
              >
                Apply Income & PCB
              </button>
              {(payslipData.ytdEpf > 0 ||
                payslipData.employeeEpf > 0 ||
                payslipData.ytdSocso > 0 ||
                payslipData.employeeSocso > 0) && (
                <button
                  type="button"
                  onClick={() => handleApplyPayslip(true)}
                  className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white active:scale-[0.99]"
                >
                  Apply + Log EPF & SOCSO
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
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Annual Income (RM)
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
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              PCB / MTD Paid YTD (RM)
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
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Zakat / Fitrah Rebate (RM)
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

      {/* Cloud Sync (Supabase) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isSupabaseConfigured ? (
              <Cloud className="h-4 w-4 text-emerald-600" />
            ) : (
              <CloudOff className="h-4 w-4 text-slate-400" />
            )}
            <h2 className="text-sm font-bold text-slate-900">
              Cloud Sync & Receipt Backup
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
              ? "Cloud Connected"
              : isSupabaseConfigured
              ? "Sign In Needed"
              : "Local Mode"}
          </span>
        </div>

        {isSupabaseConfigured ? (
          userEmail ? (
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-3">
              <div>
                <p className="text-xs font-semibold text-emerald-900">
                  Signed in as {userEmail}
                </p>
                <p className="text-[11px] text-emerald-700">
                  Receipts & reliefs sync automatically across phone and desktop.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign Out
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs text-slate-500">
                Sign in with your Supabase account to sync receipts between your
                phone and computer.
              </p>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={authLoading}
                  onClick={() => handleAuth("signin")}
                  className="flex-1 rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  disabled={authLoading}
                  onClick={() => handleAuth("signup")}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700"
                >
                  Create Account
                </button>
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
