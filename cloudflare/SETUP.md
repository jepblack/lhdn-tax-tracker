# Branded Supabase Auth via Cloudflare Worker (Free Tier)

This setup replaces `pgybpfnhabzgpepxdjp.supabase.co` with your own subdomain (e.g., `auth.yourdomain.com`) on Google's OAuth login screen — without needing Supabase Pro.

---

## Step 1: Point Your Domain to Cloudflare
1. Go to **dash.cloudflare.com** → **Add a domain** → select **Free**.
2. Copy the 2 Cloudflare nameservers into your domain registrar's **Custom Nameservers** settings.
3. In Cloudflare **DNS → Records**, add:
   * **Vercel App (`@` and `www`):**
     * `A` record `@` → `76.76.21.21` (Proxy status: **DNS only** / grey cloud for Vercel SSL)
     * `CNAME` record `www` → `cname.vercel-dns.com` (Proxy status: **DNS only**)
   * **Auth Proxy Subdomain (`auth`):**
     * `AAAA` record `auth` → `100::` (Proxy status: **Proxied** / orange cloud ✅ — required so the Cloudflare Worker intercepts requests!)

---

## Step 2: Deploy the Cloudflare Worker
1. In Cloudflare Dashboard, go to **Compute (Workers) → Workers & Pages → Create → Create Worker**.
2. Name it `cukaiku-auth-proxy` and click **Deploy**.
3. Click **Edit code**, paste the contents of `cloudflare/supabase-proxy-worker.js`, and click **Deploy**.
4. Go to the Worker's **Settings → Domains & Routes → Add → Route**:
   * **Route:** `auth.yourdomain.com/*` *(replace with your actual domain)*
   * **Zone:** `yourdomain.com`

Test it by visiting `https://auth.yourdomain.com/auth/v1/health` in your browser — you should get a `200 OK` JSON response from Supabase Auth.

---

## Step 3: Update Google Cloud Console (OAuth)
1. Open **Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client ID**.
2. Under **Authorized redirect URIs**, add:
   * `https://auth.yourdomain.com/auth/v1/callback`
   *(You can keep or remove the old `pgybpfnhabzgpepxdjp.supabase.co` URI once tested.)*
3. Under **OAuth consent screen → Branding / Audience**:
   * **App name:** `CukaiKu`
   * **Authorized domains:** add `yourdomain.com`

---

## Step 4: Update Supabase & Vercel
1. **Supabase Dashboard → Authentication → URL Configuration:**
   * **Site URL:** `https://yourdomain.com`
   * **Redirect URLs:** add `https://yourdomain.com/**` and `http://localhost:3000/**`
2. **Vercel Project → Settings → Environment Variables** (and your local `.env.local`):
   * Update `NEXT_PUBLIC_SUPABASE_URL` to:
     ```env
     NEXT_PUBLIC_SUPABASE_URL=https://auth.yourdomain.com
     ```
   * Keep `NEXT_PUBLIC_SUPABASE_ANON_KEY` unchanged.
3. Redeploy on Vercel (or restart `npm run dev` locally).
