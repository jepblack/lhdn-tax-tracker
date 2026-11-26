"use client";

import { useState } from "react";
import { CheckCircle2, Scale, ShieldCheck, X } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

const PDPA_CONSENT_KEY = "cukaiku_pdpa_consent_v1";

export function hasStoredPdpaConsent(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return Boolean(window.localStorage.getItem(PDPA_CONSENT_KEY));
  } catch {
    return false;
  }
}

export async function savePdpaConsent(): Promise<void> {
  const ts = new Date().toISOString();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PDPA_CONSENT_KEY, ts);
    } catch {
      // ignore
    }
  }
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.rpc("record_pdpa_consent");
    } catch {
      // Non-fatal if RPC not yet migrated
    }
  }
}

interface LegalPrivacyModalProps {
  isOpen: boolean;
  initialLang: "en" | "bm";
  initialSection?: "pdpa" | "terms";
  onClose: () => void;
  onAcceptConsent?: () => void;
}

export function LegalPrivacyModal({
  isOpen,
  initialLang,
  initialSection = "pdpa",
  onClose,
  onAcceptConsent,
}: LegalPrivacyModalProps) {
  const [docLang, setDocLang] = useState<"en" | "bm">(initialLang);
  const [tab, setTab] = useState<"pdpa" | "terms">(initialSection);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              {tab === "pdpa" ? (
                <ShieldCheck className="h-5 w-5" />
              ) : (
                <Scale className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {docLang === "bm"
                  ? "Notis Privasi PDPA & Terma Undang-Undang Malaysia"
                  : "PDPA Privacy Notice & Malaysian Legal Terms"}
              </h2>
              <p className="text-[11px] text-slate-500">
                {docLang === "bm"
                  ? "Akta Perlindungan Data Peribadi 2010 (Pindaan 2024) & Akta Cukai Pendapatan 1967"
                  : "Personal Data Protection Act 2010 (2024 Amendment) & Income Tax Act 1967"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setDocLang("en")}
                className={`rounded-lg px-2.5 py-1 ${
                  docLang === "en"
                    ? "bg-white text-emerald-700 shadow-2xs"
                    : "text-slate-600"
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setDocLang("bm")}
                className={`rounded-lg px-2.5 py-1 ${
                  docLang === "bm"
                    ? "bg-white text-emerald-700 shadow-2xs"
                    : "text-slate-600"
                }`}
              >
                BM
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex gap-2 border-b border-slate-100 px-5 py-2.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTab("pdpa")}
            className={`rounded-xl px-3 py-1.5 transition ${
              tab === "pdpa"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {docLang === "bm"
              ? "Notis Privasi PDPA (EN/BM)"
              : "PDPA Privacy Notice (EN/BM)"}
          </button>
          <button
            type="button"
            onClick={() => setTab("terms")}
            className={`rounded-xl px-3 py-1.5 transition ${
              tab === "terms"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {docLang === "bm"
              ? "Penafian LHDN (Sek. 153) & E-Dagang"
              : "LHDN Disclaimer (s.153) & E-Commerce"}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3.5 overflow-y-auto px-5 py-4 text-xs leading-relaxed text-slate-700">
          {tab === "pdpa" ? (
            docLang === "bm" ? (
              <>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-emerald-950">
                  <strong>Ringkasan Privasi PDPA:</strong> CukaiKu mematuhi{" "}
                  <strong>Akta Perlindungan Data Peribadi 2010 (Akta 709)</strong>{" "}
                  dan <strong>Akta Pindaan 2024</strong>. Anda mempunyai kawalan
                  penuh untuk mengeksport atau memadam semua data anda pada
                  bila-bila masa.
                </div>
                <p>
                  <strong>1. Data Yang Dikumpul & Diminimumkan:</strong> Kami
                  memproses alamat e-mel akaun, anggaran pendapatan/PCB/Zakat,
                  status pelepasan keluarga, dan resit/dokumen cukai yang anda
                  muat naik. Nombor kad kredit penuh dan nombor MyKad 12-digit
                  anak <strong>tidak disimpan</strong> — sebarang input MyKad
                  ditukar serta-merta kepada Tahun & Bulan Lahir (YYYY-MM) sahaja.
                </p>
                <p>
                  <strong>2. Data Peribadi Sensitif (Seksyen 40 PDPA):</strong>{" "}
                  Resit perubatan/pergigian, status OKU, dan rekod Zakat
                  diklasifikasikan sebagai data peribadi sensitif dan hanya
                  diproses dengan persetujuan eksplisit anda semata-mata untuk
                  pengiraan & pengarkiban pelepasan cukai LHDN anda sendiri.
                </p>
                <p>
                  <strong>
                    3. Pemproses Pihak Ketiga & Pemindahan Merentas Sempadan
                    (Seksyen 129 PDPA):
                  </strong>{" "}
                  Apabila anda mengaktifkan Segerak Awan atau Imbasan AI Vision,
                  fail dihantar melalui sambungan TLS tersulit kepada:
                  <br />• <strong>Supabase</strong> (pangkalan data & storan
                  peribadi dengan keselamatan aras baris / RLS mengikut pengguna),
                  <br />• <strong>Google Gemini API / Groq Vision API</strong>{" "}
                  (pengekstrakan teks/angka resit & Borang EA secara masa nyata),
                  <br />• <strong>Google Drive</strong> (hanya jika anda memilih
                  untuk menyambungkan Drive peribadi anda), dan
                  <br />• <strong>Stripe / Billplz / CHIP</strong> (pemprosesan
                  pembayaran FPX/DuitNow/Kad — CukaiKu tidak pernah menyimpan
                  butiran kad bank anda).
                </p>
                <p>
                  <strong>4. Tempoh Penyimpanan (Seksyen 82A ACP 1967):</strong>{" "}
                  Selaras dengan keperluan audit 7 tahun LHDN, rekod disimpan
                  sehingga anda memadamkannya. Anda boleh memadam mana-mana Tahun
                  Taksiran atau memadam keseluruhan akaun & fail awan anda serta-merta
                  di bawah <em>Tetapan → Privasi & Padam Akaun</em>.
                </p>
                <p>
                  <strong>
                    5. Hak Akses, Pembetulan, Mudah Alih Data & Notifikasi
                    Ketirisan (Pindaan 2024):
                  </strong>{" "}
                  Anda boleh memuat turun semua data anda dalam format CSV/JSON/ZIP
                  pada bila-bila masa. Sekiranya berlaku ketirisan data yang
                  ketara, kami akan memaklumkan Pesuruhjaya Perlindungan Data
                  Peribadi (JPDP) dalam tempoh 72 jam dan pengguna yang terjejas
                  mengikut undang-undang. Hubungi Pegawai Privasi kami di{" "}
                  <strong>privacy@cukaiku.my</strong>.
                </p>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-emerald-950">
                  <strong>PDPA Privacy Summary:</strong> CukaiKu complies with
                  Malaysia&apos;s{" "}
                  <strong>Personal Data Protection Act 2010 (Act 709)</strong>{" "}
                  and the <strong>2024 PDPA Amendments</strong>. You retain full
                  ownership to export or permanently erase your data anytime.
                </div>
                <p>
                  <strong>1. Data Collected & Minimization:</strong> We process
                  your account email, annual income/PCB/Zakat estimates, family
                  relief flags, and uploaded tax receipts/documents. Full payment
                  card numbers and raw 12-digit child MyKad numbers are{" "}
                  <strong>never stored</strong> — any MyKad entered for age
                  checks is immediately converted to Birth Year & Month
                  (`YYYY-MM`) only and redacted in receipt metadata.
                </p>
                <p>
                  <strong>2. Sensitive Personal Data (PDPA s.40):</strong>{" "}
                  Medical/dental receipts, OKU disability status, and Zakat
                  deductions constitute sensitive personal data and are processed
                  solely with your explicit consent to calculate and archive your
                  own LHDN tax reliefs.
                </p>
                <p>
                  <strong>
                    3. Third-Party Processors & Cross-Border Transfer (PDPA
                    s.129):
                  </strong>{" "}
                  When you use Cloud Sync or AI Vision Scanning, data is
                  transmitted over encrypted TLS to:
                  <br />• <strong>Supabase</strong> (row-level-security isolated
                  database & private receipt bucket),
                  <br />• <strong>Google Gemini API / Groq Vision API</strong>{" "}
                  (real-time OCR & structured receipt/EA extraction; you can also
                  use 100% on-device OCR),
                  <br />• <strong>Google Drive</strong> (only if you explicitly
                  connect your own Drive), and
                  <br />• <strong>Stripe / Billplz / CHIP</strong> (PCI-DSS / BNM
                  regulated FPX, DuitNow & card checkout — CukaiKu never sees or
                  stores your bank/card credentials).
                </p>
                <p>
                  <strong>4. Retention & Erasure (ITA 1967 s.82A):</strong> To
                  support LHDN&apos;s 7-year audit retention rule, cloud records
                  remain stored until you delete them. You may wipe any Year of
                  Assessment or permanently delete your entire account and all
                  cloud files in 1 click under{" "}
                  <em>Settings → Privacy & Account Erasure</em>.
                </p>
                <p>
                  <strong>
                    5. Access, Data Portability & 72-Hour Breach Notification
                    (2024 Amendment):
                  </strong>{" "}
                  You can export all structured records (CSV, JSON, and PDF Audit
                  ZIP) at any time. In the event of a qualifying personal data
                  breach, we notify the Personal Data Protection Commissioner
                  (JPDP) within 72 hours and affected users as required by law.
                  Privacy & DPO inquiries: <strong>privacy@cukaiku.my</strong>.
                </p>
              </>
            )
          ) : docLang === "bm" ? (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
                <strong>
                  Penafian Penting — Bukan Ejen Cukai Berlesen (Seksyen 153 Akta
                  Cukai Pendapatan 1967):
                </strong>{" "}
                CukaiKu ialah aplikasi penyusun resit dan penganggar cukai
                layan diri. CukaiKu <strong>bukan</strong> ejen cukai berlesen di
                bawah Seksyen 153 ACP 1967 dan tidak memberikan nasihat cukai,
                perundangan, atau perakaunan profesional.
              </div>
              <p>
                <strong>1. Tanggungjawab Taksiran Sendiri LHDN:</strong> Semua
                angka pelepasan, kadar cukai, dan anggaran bayaran balik dijana
                berdasarkan garis panduan awam LHDNM semata-mata untuk rujukan
                anda. Di bawah sistem taksiran sendiri Malaysia, anda
                bertanggungjawab sepenuhnya untuk menyemak kelayakan resit asal
                dan mengesahkan angka akhir semasa memfailkan e-BE / e-B di portal
                rasmi MyTax (<strong>ez.hasil.gov.my</strong>).
              </p>
              <p>
                <strong>
                  2. Penyimpanan Rekod 7 Tahun (Seksyen 82 & 82A ACP 1967):
                </strong>{" "}
                Pembayar cukai wajib menyimpan resit asal yang jelas dan boleh
                dibaca selama 7 tahun dari akhir tahun taksiran pemfailan. Sila
                pastikan imej/PDF yang dimuat naik jelas dan simpan salinan asal
                jika resit kertas pudar.
              </p>
              <p>
                <strong>
                  3. Pendedahan Peraturan E-Dagang (Peraturan Perlindungan
                  Pengguna [Urus Niaga Perdagangan Elektronik] 2024):
                </strong>
                <br />• Perkhidmatan: CukaiKu Digital Tax Organizer (`cukaiku.my`)
                <br />• Harga: Semua harga dipaparkan dalam Ringgit Malaysia
                (MYR) — Pas Pro RM 29 / Tahun Taksiran; Pas Keluarga RM 59 /
                Tahun Taksiran (tiada caj tersembunyi atau langganan auto-potong).
                <br />• Polisi Bayaran Balik: Jika anda menghadapi isu teknikal
                yang tidak dapat diselesaikan dalam tempoh 7 hari pembelian dan
                belum menggunakan melebihi 10 imbasan AI, hubungi{" "}
                <strong>support@cukaiku.my</strong> untuk bayaran balik penuh.
              </p>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
                <strong>
                  Important Disclaimer — Not a Licensed Tax Agent (Section 153
                  Income Tax Act 1967):
                </strong>{" "}
                CukaiKu is a self-service receipt archiving and tax estimation
                software tool. CukaiKu is <strong>not</strong> a licensed tax
                agent under Section 153 of the Malaysian Income Tax Act 1967 and
                does not provide formal tax, legal, or accounting advice.
              </div>
              <p>
                <strong>1. LHDN Self-Assessment Responsibility:</strong> Relief
                caps, progressive tax brackets, and AI classifications are
                provided as helpful estimates based on published LHDNM rules.
                Under Malaysia&apos;s self-assessment regime, you remain solely
                responsible for verifying original supporting documents and
                confirming final figures on LHDN MyTax (
                <strong>ez.hasil.gov.my</strong>) or consulting a licensed
                Section 153 tax agent for complex tax positions.
              </p>
              <p>
                <strong>
                  2. 7-Year Record Retention (Sections 82 & 82A ITA 1967):
                </strong>{" "}
                Taxpayers must retain legible supporting receipts and statements
                for 7 years from the end of the year in which the return is
                furnished. Always ensure uploaded scans are legible before
                discarding thermal paper receipts.
              </p>
              <p>
                <strong>
                  3. Electronic Trade Transactions Disclosures (Consumer
                  Protection [ETT] Regulations 2024):
                </strong>
                <br />• Service Operator: CukaiKu Digital Tax Organizer (
                `cukaiku.my`) — Contact: <strong>support@cukaiku.my</strong> /{" "}
                <strong>privacy@cukaiku.my</strong>
                <br />• Pricing: Displayed transparently in Ringgit Malaysia
                (MYR) — Pro Pass RM 29 / Year of Assessment; Family Pass RM 59 /
                Year of Assessment (one-time pass, no hidden recurring
                auto-debit).
                <br />• Refund & Cancellation Policy: Full refund available
                within 7 days of purchase if fewer than 10 AI Vision scans have
                been used — email <strong>support@cukaiku.my</strong> with your
                payment reference.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3.5">
          <span className="text-[11px] text-slate-500">
            {docLang === "bm"
              ? "Pertanyaan PDPA: privacy@cukaiku.my"
              : "PDPA Inquiries: privacy@cukaiku.my"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {docLang === "bm" ? "Tutup" : "Close"}
            </button>
            {onAcceptConsent && (
              <button
                type="button"
                onClick={async () => {
                  await savePdpaConsent();
                  onAcceptConsent();
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {docLang === "bm"
                  ? "Saya Faham & Setuju (PDPA)"
                  : "I Understand & Consent (PDPA)"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
