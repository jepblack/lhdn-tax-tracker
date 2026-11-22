"use client";

import { createContext, useContext } from "react";
import { AppLanguage, getUiCopy } from "./personalization";
import { ReliefCategory, ReliefSubCategory } from "./types";

export const SUBCATEGORY_BM: Record<string, string> = {
  lifestyle_internet: "Langganan Internet Bulanan",
  lifestyle_tech: "Komputer, Telefon Pintar & Tablet",
  lifestyle_books: "Buku, Jurnal & Majalah",
  lifestyle_skills: "Kursus Peningkatan Kemahiran / Hobi",
  sports_equipment: "Peralatan Sukan",
  sports_gym: "Keahlian Gimnasium / Latihan Sukan",
  sports_facility: "Sewa Kemudahan & Yuran Pertandingan",
  med_serious: "Penyakit Serius & Rawatan Kesuburan",
  med_dental: "Pemeriksaan & Rawatan Pergigian",
  med_vaccination: "Vaksinasi",
  med_checkup: "Pemeriksaan Kesihatan Penuh & Mental",
  med_child_disability: "Rawatan / Pemulihan Anak OKU",
  parents_treatment: "Rawatan Perubatan, Pergigian & Penjagaan",
  parents_checkup: "Pemeriksaan Kesihatan Penuh Ibu Bapa",
  epf_mandatory: "Caruman Wajib / Sukarela KWSP",
  life_insurance: "Insurans Nyawa / Takaful Keluarga",
  edu_tertiary: "Pengajian Tinggi (Sijil / Diploma / Ijazah / PhD)",
  edu_upskilling: "Kursus Peningkatan Kemahiran",
  home_under_500k: "Rumah Kediaman <= RM 500k (Maks RM 7,000)",
  home_500k_750k: "Rumah Kediaman RM 500k–750k (Maks RM 5,000)",
};

export const SUBCATEGORY_DESC_BM: Record<string, string> = {
  lifestyle_internet: "Langganan internet rumah bulanan berdaftar atas nama sendiri.",
  lifestyle_tech: "Kegunaan peribadi sahaja (bukan perniagaan) untuk diri, pasangan atau anak.",
  lifestyle_books: "Bahan bacaan fizikal atau elektronik (tidak termasuk penerbitan terlarang).",
  lifestyle_skills: "Kursus peningkatan diri (bahasa, masakan, fotografi, pengaturcaraan, dll.).",
  sports_equipment: "Peralatan sukan di bawah Akta Pembangunan Sukan 1997 (tidak termasuk basikal bermotor/peranti boleh pakai).",
  sports_gym: "Yuran keahlian gimnasium dan yuran latihan sukan oleh jurulatih bertauliah.",
  sports_facility: "Sewaan/yuran masuk kemudahan sukan dan pendaftaran pertandingan diluluskan.",
  med_serious: "Kemasukan hospital/rawatan penyakit serius atau rawatan kesuburan untuk diri/pasangan.",
  med_dental: "Sub-had RM1,000 — penskaleran, tampalan, cabutan, pemeriksaan pergigian (doktor gigi berdaftar).",
  med_vaccination: "Sub-had RM1,000 — Pneumokokal, HPV, Influenza, Rotavirus, Varicella, dll.",
  med_checkup: "Sub-had RM1,000 — Pemeriksaan kesihatan lengkap, konsultasi kesihatan mental, kit ujian kendiri, glukometer/oksimeter/pemantau tekanan darah.",
  med_child_disability: "Sub-had RM6,000 — Diagnosis, intervensi awal dan pemulihan untuk anak bawah 18 tahun (Autisme, ADHD, Disleksia, dll.).",
  parents_treatment: "Rawatan hospital/klinik, penjagaan pergigian, rumah penjagaan atau penjaga bertauliah.",
  parents_checkup: "Sub-had RM1,000 — Pemeriksaan kesihatan penuh dan vaksinasi untuk ibu bapa/datuk nenek.",
  epf_mandatory: "Sub-had RM4,000 — Caruman KWSP pekerja seperti tertera pada Borang EA anda.",
  life_insurance: "Sub-had RM3,000 — Premium insurans nyawa/takaful atau caruman KWSP sukarela tambahan.",
  edu_tertiary: "Institusi diluluskan di Malaysia (atau sebarang bidang untuk Sarjana/PhD).",
  edu_upskilling: "Sub-had RM2,000 — Kursus peningkatan kemahiran yang diiktiraf oleh JPK.",
  home_under_500k: "Sehingga RM7,000 setahun bagi 3 tahun taksiran berturut-turut.",
  home_500k_750k: "Sehingga RM5,000 setahun bagi 3 tahun taksiran berturut-turut.",
};

export const CATEGORY_TIPS_BM: Record<string, string> = {
  lifestyle: "Simpan semua 12 bil bulanan Unifi/TIME/Maxis — bil internet sahaja sering mengisi RM1,200–RM2,400 daripada had ini.",
  sports: "Tuntut resit sukan & gim di sini dan bukannya di Gaya Hidup supaya had RM2,500 Gaya Hidup anda kekal terpelihara!",
  medical_self: "Perhatikan sub-had tersarang: Pergigian (RM1,000), Vaksinasi (RM1,000), dan Pemeriksaan/Kesihatan Mental (RM1,000) semuanya dikira ke dalam had keseluruhan RM10,000.",
  parents_medical: "Memerlukan resit yang disahkan oleh pengamal perubatan atau pusat penjagaan berdaftar.",
  epf_life_insurance: "Kebanyakan pekerja bergaji mencapai had RM4,000 KWSP secara automatik melalui slip gaji. Gunakan Takaful Nyawa atau caruman sukarela KWSP untuk mengisi baki RM3,000!",
  edu_med_insurance: "Muat turun Penyata Cukai Pendapatan tahunan daripada portal syarikat insurans anda pada bulan Februari/Mac.",
  prs_annuity: "Salah satu pemaksimum cukai hujung tahun yang paling mudah — wang kekal dalam dana persaraan anda sambil menjimatkan sehingga RM750+ cukai.",
  sspn: "Hanya deposit bersih positif dalam tahun kalendar layak. Sangat berbaloi untuk ibu bapa dengan kadar cukai marginal yang tinggi.",
  education_self: "Kursus peningkatan kemahiran / pembangunan diri yang diiktiraf oleh Jabatan Pembangunan Kemahiran dihadkan pada RM2,000 dalam had RM7,000.",
  first_home_interest: "Minta penyata faedah pinjaman perumahan tahunan daripada bank anda dan simpan Perjanjian Jual Beli (SPA) bercop hasil.",
  socso: "Semak Borang EA tahunan anda — hampir semua pekerja makan gaji boleh menuntut sehingga RM350 di sini.",
  childcare: "Boleh dituntut oleh salah seorang sama ada suami atau isteri (bukan kedua-duanya untuk anak yang sama). Pastikan pusat berdaftar dengan JKM/KPM.",
  breastfeeding: "Termasuk set pam susu, beg penyejuk, dan bekas/beg simpanan susu.",
  ev_charging: "Simpan invois pemasangan rasmi atau resit langganan pengecasan EV (cth., Gentari, JomCharge, ChargEV).",
  supporting_equipment: "Contoh: kerusi roda, alat bantuan pendengaran, mesin dialisis, anggota palsu.",
  approved_donations: "Resit rasmi MESTI menyatakan 'Dikecualikan Cukai di bawah Seksyen 44(6)' beserta nombor rujukan LHDN. Berasingan daripada rebat Zakat!",
};

export const PARTNER_OFFER_BM: Record<
  string,
  { partnerName?: string; headline: string; description: string; ctaLabel: string }
> = {
  "prs-versa": {
    headline: "Tokok PRS dalam talian sebelum 31 Dis",
    description:
      "Labur dalam dana Skim Persaraan Swasta patuh Syariah atau konvensional daripada RM 100 dengan caj jualan 0%.",
    ctaLabel: "Tuntut Bonus PRS",
  },
  "sspn-ptptn": {
    headline: "Deposit bersih ke akaun SSPN anak",
    description:
      "Simpanan dijamin kerajaan dengan dividen kompetitif + pelepasan cukai deposit bersih sehingga RM 8,000.",
    ctaLabel: "Tokok SSPN Dalam Talian",
  },
  "med-checkup-bookdoc": {
    partnerName: "Saringan Pathlab & BookDoc",
    headline: "Pakej saringan darah & kesihatan lengkap",
    description:
      "Gunakan sub-had RM 1,000 pemeriksaan kesihatan, pergigian atau konsultasi kesihatan mental sebelum hujung tahun.",
    ctaLabel: "Lihat Pakej Kesihatan",
  },
  "life-takaful-filife": {
    headline: "Insurans nyawa bertempoh & Takaful keluarga dalam talian",
    description:
      "Penuhkan baki RM 3,000 Insurans Nyawa / Takaful & KWSP Sukarela anda dengan perlindungan tanpa komisen.",
    ctaLabel: "Kira Sebut Harga Segera",
  },
  "med-card-fwd": {
    headline: "Perlindungan Takaful Perubatan & Pendidikan",
    description:
      "Kad perubatan kendiri atau polisi pendidikan anak layak mendapat pelepasan tahunan sehingga RM 4,000.",
    ctaLabel: "Semak Kelayakan",
  },
  "lifestyle-popular": {
    partnerName: "Kindle / MPH / Fibre Rumah",
    headline: "Buku, tablet, telefon pintar atau bil fibre rumah",
    description:
      "Jangan biarkan had gaya hidup RM 2,500 anda tidak digunakan — rekod bil jalur lebar TIME/Unifi bulanan atau pembelian buku anda.",
    ctaLabel: "Rekod Jalur Lebar / Peranti",
  },
  "sports-decathlon": {
    partnerName: "Decathlon / Gim & Gelanggang Sukan",
    headline: "Kasut lari, raket, keahlian gim atau tempahan gelanggang",
    description:
      "Pelepasan berasingan RM 1,000 untuk peralatan sukan, sewaan kemudahan dan yuran pendaftaran kejohanan (di luar Gaya Hidup).",
    ctaLabel: "Rekod Resit Sukan",
  },
};

export const RECURRING_BILL_BM: Record<string, { merchant: string; description: string }> = {
  "tpl-unifi": {
    merchant: "Unifi / TIME Fibre",
    description: "Internet jalur lebar rumah bulanan",
  },
  "tpl-gym": {
    merchant: "Keahlian Gim / Kecergasan",
    description: "Yuran keahlian gim bulanan",
  },
  "tpl-insurance": {
    merchant: "Insurans Perubatan / Pendidikan",
    description: "Polisi perubatan / takaful bulanan",
  },
};

interface CategoryBmEntry {
  name: string;
  shortName: string;
  description: string;
}

export const CATEGORY_BM: Record<string, CategoryBmEntry> = {
  lifestyle: {
    name: "Gaya Hidup (Buku, Komputer, Telefon & Internet)",
    shortName: "Gaya Hidup",
    description:
      "Pembelian buku/majalah, komputer/telefon pintar/tablet, langganan internet bulanan & kursus kemahiran.",
  },
  sports: {
    name: "Peralatan & Aktiviti Sukan (Tambahan)",
    shortName: "Sukan & Gim",
    description:
      "Peralatan sukan, sewa/yuran masuk kemudahan sukan, yuran keahlian gimnasium & yuran penyertaan pertandingan.",
  },
  medical_self: {
    name: "Perubatan Diri, Pasangan & Anak",
    shortName: "Perubatan Diri",
    description:
      "Rawatan penyakit serius, rawatan kesuburan, vaksinasi, pemeriksaan kesihatan penuh, pergigian & rawatan anak OKU.",
  },
  parents_medical: {
    name: "Perubatan, Penjagaan & Pergigian Ibu Bapa / Datuk Nenek",
    shortName: "Perubatan Ibu Bapa",
    description:
      "Rawatan perubatan, penjagaan khas, peralatan sokongan, pemeriksaan kesihatan penuh & pergigian untuk ibu bapa.",
  },
  epf_life_insurance: {
    name: "KWSP (EPF) & Insurans Nyawa / Takaful",
    shortName: "KWSP & Nyawa",
    description:
      "Caruman wajib/sukarela KWSP (sehingga RM 4,000) dan premium insurans nyawa/takaful keluarga (sehingga RM 3,000).",
  },
  edu_med_insurance: {
    name: "Insurans Pendidikan & Perubatan",
    shortName: "Insurans Perubatan",
    description:
      "Premium insurans/takaful perubatan dan pendidikan untuk diri sendiri, pasangan atau anak.",
  },
  prs_annuity: {
    name: "Skim Persaraan Swasta (PRS) & Anuiti Tertunda",
    shortName: "PRS & Anuiti",
    description:
      "Caruman ke Skim Persaraan Swasta (PRS) yang diluluskan oleh SC dan anuiti tertunda.",
  },
  sspn: {
    name: "Simpanan Bersih SSPN (Skim Simpanan Pendidikan Nasional)",
    shortName: "SSPN",
    description:
      "Deposit bersih (deposit tolak pengeluaran dalam tahun yang sama) ke akaun Skim Simpanan Pendidikan Nasional (SSPN).",
  },
  education_self: {
    name: "Yuran Pengajian Tinggi & Peningkatan Kemahiran (Diri)",
    shortName: "Pendidikan Diri",
    description:
      "Yuran pengajian peringkat sijil/diploma/ijazah/sarjana/PhD di institusi diiktiraf serta kursus peningkatan kemahiran.",
  },
  first_home_interest: {
    name: "Faedah Pinjaman Perumahan Rumah Pertama (2025–2027)",
    shortName: "Faedah Rumah",
    description:
      "Pelepasan khas Bajet 2025 untuk faedah pinjaman perumahan bagi pembelian rumah kediaman pertama.",
  },
  socso: {
    name: "Caruman PERKESO (SOCSO) & EIS",
    shortName: "PERKESO / SOCSO",
    description:
      "Caruman pekerja kepada Pertubuhan Keselamatan Sosial (PERKESO) dan Sistem Insurans Pekerjaan (SIP/EIS).",
  },
  childcare: {
    name: "Yuran Taska / Tadika Berdaftar (Anak Bawah 6 Tahun)",
    shortName: "Taska / Tadika",
    description:
      "Yuran yang dibayar kepada taman asuhan kanak-kanak (Taska) atau tadika berdaftar bagi anak berumur 6 tahun ke bawah.",
  },
  breastfeeding: {
    name: "Peralatan Penyusuan Ibu (Pembayar Cukai Wanita)",
    shortName: "Penyusuan",
    description:
      "Set pam susu, beg penyejuk dan bekas simpanan untuk ibu menyusu dengan anak berumur 2 tahun ke bawah (sekali setiap 2 tahun).",
  },
  ev_charging: {
    name: "Pengecas Kenderaan Elektrik (EV) & Mesin Kompos Sisa Makanan",
    shortName: "Pengecas EV & Kompos",
    description:
      "Kos pemasangan/pembelian peralatan pengecas EV rumah dan mesin kompos sisa makanan isi rumah.",
  },
  supporting_equipment: {
    name: "Peralatan Sokongan Asas (OKU)",
    shortName: "Peralatan OKU",
    description:
      "Pembelian peralatan sokongan asas untuk kegunaan diri sendiri, pasangan, anak atau ibu bapa yang kurang upaya.",
  },
  approved_donations: {
    name: "Derma & Sumbangan Diluluskan (Seksyen 44(6))",
    shortName: "Derma Diluluskan",
    description:
      "Sumbangan tunai kepada kerajaan, pihak berkuasa tempatan atau institusi/organisasi yang diluluskan LHDN (terhad 10% pendapatan agregat).",
  },
};

export function getLocalizedCategory(
  category: ReliefCategory,
  lang: AppLanguage
): { name: string; shortName: string; description: string } {
  if (lang === "bm" && CATEGORY_BM[category.id]) {
    return CATEGORY_BM[category.id];
  }
  return {
    name: category.name,
    shortName: category.shortName,
    description: category.description,
  };
}

interface LanguageContextValue {
  lang: AppLanguage;
  copy: ReturnType<typeof getUiCopy>;
  tCategory: (cat: ReliefCategory) => {
    name: string;
    shortName: string;
    description: string;
  };
  tCategoryTips: (cat: ReliefCategory) => string;
  tSubCategory: (sub: ReliefSubCategory) => string;
  tSubCategoryDesc: (sub: ReliefSubCategory) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  copy: getUiCopy("en"),
  tCategory: (cat) => ({
    name: cat.name,
    shortName: cat.shortName,
    description: cat.description,
  }),
  tCategoryTips: (cat) => cat.tips,
  tSubCategory: (sub) => sub.name,
  tSubCategoryDesc: (sub) => sub.description,
});

export function LanguageProvider({
  lang,
  children,
}: {
  lang: AppLanguage;
  children: React.ReactNode;
}) {
  const copy = getUiCopy(lang);
  const tCategory = (cat: ReliefCategory) => getLocalizedCategory(cat, lang);
  const tCategoryTips = (cat: ReliefCategory) =>
    lang === "bm" && CATEGORY_TIPS_BM[cat.id] ? CATEGORY_TIPS_BM[cat.id] : cat.tips;
  const tSubCategory = (sub: ReliefSubCategory) =>
    lang === "bm" && SUBCATEGORY_BM[sub.id] ? SUBCATEGORY_BM[sub.id] : sub.name;
  const tSubCategoryDesc = (sub: ReliefSubCategory) =>
    lang === "bm" && SUBCATEGORY_DESC_BM[sub.id]
      ? SUBCATEGORY_DESC_BM[sub.id]
      : sub.description;
  return (
    <LanguageContext.Provider
      value={{ lang, copy, tCategory, tCategoryTips, tSubCategory, tSubCategoryDesc }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
