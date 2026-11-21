# Branded Supabase Auth & Domain Setup for cukaiku.my

This setup connects **`cukaiku.my`** to Vercel and runs a Cloudflare Worker on **`auth.cukaiku.my`** so Google OAuth displays **cukaiku.my** instead of `pgybpfnhabzgpepxdjp.supabase.co` — completely free.

---

## Step 1: Add `cukaiku.my` to Cloudflare & Update Registrar Nameservers

1. Log in to **[dash.cloudflare.com](https://dash.cloudflare.com/)**.
2. Click **Add a domain** / **Add a Site** → enter `cukaiku.my` → select the **Free** tier.
3. Cloudflare will give you **2 assigned nameservers** (for example: `lex.ns.cloudflare.com` and `olga.ns.cloudflare.com`).
4. Open the registrar dashboard where you bought `cukaiku.my` (e.g. Exabytes, Shinjiru, DomainPlus, MYNIC):
   * Navigate to **Nameservers / DNS Management** for `cukaiku.my`.
   * Change from *Default Nameservers* to **Custom Nameservers**.
   * Paste the 2 Cloudflare nameservers and save.
   *(Propagation usually takes 5 to 30 minutes for .my domains).*

---

## Step 2: Configure Cloudflare DNS Records

In Cloudflare Dashboard → select **cukaiku.my** → **DNS** → **Records**:

| Type | Name | IPv4 address / Target | Proxy Status | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `@` | `76.76.21.21` | ⚪ **DNS only** (Grey cloud) | Vercel Apex root domain & SSL |
| **CNAME** | `www` | `cname.vercel-dns.com` | ⚪ **DNS only** (Grey cloud) | Vercel WWW redirect & SSL |
| **AAAA** | `auth` | `100::` | 🟠 **Proxied** (Orange cloud) | Triggers the Auth Reverse Proxy Worker |

> ⚠️ **Crucial:** Keep `@` and `www` as **DNS only (grey cloud)** so Vercel can automatically issue and renew Let's Encrypt certificates. Keep `auth` **Proxied (orange cloud)** so Cloudflare routes requests into your Worker.

---

## Step 3: Deploy the Cloudflare Worker (`auth.cukaiku.my`)

1. In Cloudflare Dashboard, go to **Compute (Workers) → Workers & Pages → Create → Create Worker**.
2. Set the name to **`cukaiku-auth-proxy`** and click **Deploy**.
3. Click **Edit code**:
   * Replace all contents with the code from [`cloudflare/supabase-proxy-worker.js`](./supabase-proxy-worker.js).
   * Click **Deploy**.
4. Go back to Worker details → **Settings** tab → **Domains & Routes** → click **Add**:
   * Select **Route**.
   * **Route:** `auth.cukaiku.my/*`
   * **Zone:** `cukaiku.my`
   * Click **Save**.

### Verify Worker:
Open your browser and visit:
👉 **`https://auth.cukaiku.my/auth/v1/health`**
When working, you will receive: `{"version":"...","name":"GoTrue"}` or `{"status":"ok"}` with HTTP 200.

---

## Step 4: Add Domain to Vercel

1. Open your project on **[vercel.com](https://vercel.com/)** (`lhdn-tax-tracker`).
2. Go to **Settings → Domains**.
3. Add **`cukaiku.my`** (Vercel will recommend redirecting `www.cukaiku.my` to `cukaiku.my` or vice versa).
4. Once DNS propagates, Vercel will show green checkmarks ✅ and generate your SSL certificate automatically.

---

## Step 5: Update Google Cloud Console (OAuth 2.0)

1. Open **[console.cloud.google.com](https://console.cloud.google.com/)** → **APIs & Services → Credentials**.
2. Click your **Web client** OAuth 2.0 Client ID.
3. Under **Authorized JavaScript origins**, add:
   * `https://cukaiku.my`
   * `https://www.cukaiku.my`
   * `https://auth.cukaiku.my`
4. Under **Authorized redirect URIs**, add:
   * `https://auth.cukaiku.my/auth/v1/callback`
   *(You can keep `https://pgybpfnhabzgpepxdjp.supabase.co/auth/v1/callback` during testing).*
5. Go to **OAuth consent screen → Branding / Audience**:
   * **App name:** `CukaiKu`
   * **Authorized domains:** add `cukaiku.my`
   * Click **Save and Continue**.

---

## Step 6: Update Supabase Dashboard

1. Open **[supabase.com/dashboard](https://supabase.com/dashboard)** → your project (`pgybpfnhabzgpepxdjp`).
2. Go to **Authentication → URL Configuration**:
   * **Site URL:** `https://cukaiku.my`
   * **Redirect URLs** (add both):
     * `https://cukaiku.my/**`
     * `https://www.cukaiku.my/**`
     * `http://localhost:3000/**`

---

## Step 7: Update Environment Variables

In **Vercel Project → Settings → Environment Variables** (and locally in `.env.local`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://auth.cukaiku.my
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-existing-anon-key>
```

Trigger a redeploy in Vercel. Now whenever any user clicks "Sign in with Google", they will see **`cukaiku.my`** instead of an unfamiliar Supabase hash!
