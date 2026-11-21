/**
 * Cloudflare Worker: Supabase Branded Auth & API Reverse Proxy
 *
 * Hides `pgybpfnhabzgpfepxdjp.supabase.co` behind `https://auth.cukaiku.my`
 * on Cloudflare's Free Plan.
 *
 * Route pattern in Cloudflare Workers:
 *   auth.cukaiku.my/*
 */

const SUPABASE_ORIGIN = "https://pgybpfnhabzgpfepxdjp.supabase.co";
const SUPABASE_HOST = "pgybpfnhabzgpfepxdjp.supabase.co";

export default {
  async fetch(request) {
    const incomingUrl = new URL(request.url);
    const proxyHost = incomingUrl.host;

    // Build target Supabase URL preserving path and query string
    const targetUrl = new URL(
      incomingUrl.pathname + incomingUrl.search,
      SUPABASE_ORIGIN
    );

    // Clone headers and set Host to Supabase's origin host
    const headers = new Headers(request.headers);
    headers.set("Host", SUPABASE_HOST);
    headers.set("X-Forwarded-Host", proxyHost);
    headers.set("X-Forwarded-Proto", "https");

    const init = {
      method: request.method,
      headers,
      redirect: "manual",
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
    }

    const response = await fetch(targetUrl.toString(), init);

    // Clone response headers so we can rewrite Location redirects
    const responseHeaders = new Headers(response.headers);
    const location = responseHeaders.get("Location");
    if (location && location.includes(SUPABASE_HOST)) {
      responseHeaders.set(
        "Location",
        location.replaceAll(SUPABASE_ORIGIN, `https://${proxyHost}`)
      );
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  },
};
