import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const rateWindowMap = new Map<string, number[]>();

export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "anon";
}

/**
 * Blocks cross-site POST requests when Origin header does not match Host / configured app URL.
 */
export function verifySameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null; // Non-browser or same-origin without Origin header

  try {
    const originHost = new URL(origin).host.toLowerCase();
    const hostHeader = (
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      ""
    )
      .split(",")[0]
      .trim()
      .toLowerCase();

    const allowedHosts = new Set<string>();
    if (hostHeader) allowedHosts.add(hostHeader);
    if (process.env.NEXT_PUBLIC_APP_URL) {
      try {
        allowedHosts.add(
          new URL(process.env.NEXT_PUBLIC_APP_URL).host.toLowerCase()
        );
      } catch {
        // ignore invalid env URL
      }
    }
    allowedHosts.add("cukaiku.my");
    allowedHosts.add("www.cukaiku.my");
    allowedHosts.add("localhost:3000");

    if (allowedHosts.size > 0 && !allowedHosts.has(originHost)) {
      return NextResponse.json(
        { error: "FORBIDDEN_ORIGIN", message: "Cross-origin request denied." },
        { status: 403 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "INVALID_ORIGIN", message: "Invalid Origin header." },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Sliding-window per-minute rate limiter (per serverless instance) to protect AI & API quotas.
 */
export function checkRateLimit(
  bucketKey: string,
  maxPerMinute: number
): NextResponse | null {
  const now = Date.now();
  const windowStart = now - 60_000;
  const timestamps = (rateWindowMap.get(bucketKey) || []).filter(
    (t) => t > windowStart
  );
  if (timestamps.length >= maxPerMinute) {
    return NextResponse.json(
      {
        error: "RATE_LIMITED",
        retryable: true,
        message:
          "Too many requests in a short time. Please wait a few seconds and try again.",
      },
      { status: 429 }
    );
  }
  timestamps.push(now);
  rateWindowMap.set(bucketKey, timestamps);

  // Periodic cleanup to avoid unbounded map growth
  if (rateWindowMap.size > 2000) {
    for (const [k, list] of rateWindowMap.entries()) {
      const active = list.filter((t) => t > windowStart);
      if (active.length === 0) rateWindowMap.delete(k);
      else rateWindowMap.set(k, active);
    }
  }
  return null;
}

export function enforceMaxUploadBytes(
  file: File | null,
  maxMb = 15
): NextResponse | null {
  if (!file) return null;
  const maxBytes = maxMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json(
      {
        error: "FILE_TOO_LARGE",
        message: `File size (${(file.size / (1024 * 1024)).toFixed(
          1
        )} MB) exceeds the maximum ${maxMb} MB limit.`,
      },
      { status: 413 }
    );
  }
  return null;
}

/**
 * Server-only Supabase admin client using SUPABASE_SERVICE_ROLE_KEY.
 * Never exposed to client bundles.
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (
    !url ||
    !serviceKey ||
    url.includes("your-project-id") ||
    serviceKey.includes("your-service-role-key")
  ) {
    return null;
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
