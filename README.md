# CukaiKu — Personal LHDN Tax Relief & Receipt Manager

A mobile-first Progressive Web App (PWA) for Malaysian taxpayers to track **LHDN YA 2025 / YA 2026** tax reliefs, enforce nested sub-limits, maximize tax savings, scan receipts with **Gemini AI**, and maintain a **7-year audit vault** backed by **Supabase**.

## Features
- **YA 2025 & YA 2026 LHDN Relief Rules:** Covers all 15 major expense reliefs plus status/family reliefs, with exact parent caps and nested sub-limits (e.g., Medical RM10,000 with Dental/Vaccination/Check-up RM1,000 sub-caps; EPF RM4,000 + Life Insurance RM3,000; Separate Sports RM1,000; First-Home Loan Interest).
- **Real Ringgit Saved & Marginal Tax Bracket:** Uses Malaysia's resident progressive tax brackets to show tax saved per receipt, Zakat rebate, and estimated LHDN refund vs. PCB.
- **Gemini AI Receipt Scanner (`/api/scan-receipt`):** Snap a photo on your phone or upload a PDF; Gemini 2.5 Flash extracts merchant, date, amount, invoice number, and maps it to the right LHDN relief & sub-category.
- **7-Year Receipt Vault:** Tracks missing receipts, displays the LHDN 7-year retention expiry year (`YA + 8`), previews images/PDFs, and exports a Form BE CSV summary.
- **Dual Mode:** Works immediately in **Local Browser Mode** (with 1-click sample data), and seamlessly upgrades to **Supabase Cloud Sync** when configured.

## Quick Start
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

## Cloud Sync (Supabase) & AI Scanner (Gemini) Setup
1. Copy `.env.example` to `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   GEMINI_API_KEY=your-gemini-api-key
   ```
2. In your Supabase Dashboard → **SQL Editor**, run the contents of `supabase/schema.sql`. This creates `tax_profiles`, `tax_expenses`, Row Level Security (RLS) policies, and the private `receipts` storage bucket.
3. Deploy to **Vercel** (free tier) and add the same 3 environment variables.
4. On your phone, open your deployed URL in Safari (iOS) or Chrome (Android) and tap **Add to Home Screen** to run it like a native app.
