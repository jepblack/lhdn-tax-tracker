"use client";

import { createContext, useContext } from "react";
import { AppLanguage, getUiCopy } from "./personalization";
import { ReliefCategory } from "./types";

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
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  copy: getUiCopy("en"),
  tCategory: (cat) => ({
    name: cat.name,
    shortName: cat.shortName,
    description: cat.description,
  }),
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
  return (
    <LanguageContext.Provider value={{ lang, copy, tCategory }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
