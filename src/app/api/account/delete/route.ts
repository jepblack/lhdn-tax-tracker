import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  checkRateLimit,
  getClientIp,
  getSupabaseAdminClient,
  verifySameOrigin,
} from "@/lib/api-security";

export const runtime = "nodejs";

/**
 * PDPA 2010 / 2024 Right to Erasure & Consent Withdrawal Endpoint:
 * Permanently deletes all user receipt files in Supabase Storage, all tax_expenses,
 * tax_profiles, user_subscriptions, and (when SUPABASE_SERVICE_ROLE_KEY is configured)
 * deletes the auth.users record itself.
 */
export async function POST(request: Request) {
  try {
    const originErr = verifySameOrigin(request);
    if (originErr) return originErr;

    const rateErr = checkRateLimit(`delete-account:${getClientIp(request)}`, 5);
    if (rateErr) return rateErr;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("your-project-id")) {
      return NextResponse.json(
        { error: "NOT_CONFIGURED", message: "Cloud database is not configured." },
        { status: 400 }
      );
    }

    const token = (request.headers.get("authorization") || "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    if (!token) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Authentication required." },
        { status: 401 }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: authData, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Invalid or expired session." },
        { status: 401 }
      );
    }

    const uid = authData.user.id;
    const admin = getSupabaseAdminClient();
    const dbClient = admin || userClient;

    // 1. Collect all storage object paths from tax_expenses + list folders under <uid>/
    const pathsToDelete = new Set<string>();
    const { data: expRows } = await dbClient
      .from("tax_expenses")
      .select("receipt_path")
      .eq("user_id", uid);

    if (Array.isArray(expRows)) {
      for (const r of expRows) {
        const p = String(r.receipt_path || "");
        if (p && !p.startsWith("gdrive:")) {
          pathsToDelete.add(p);
          if (p.toLowerCase().endsWith(".pdf")) {
            pathsToDelete.add(p.replace(/\.pdf$/i, ".json"));
          }
        }
      }
    }

    for (const subDir of ["Receipts", "AnnualDocs"]) {
      const { data: years } = await dbClient.storage
        .from("receipts")
        .list(`${uid}/${subDir}`);
      if (Array.isArray(years)) {
        for (const yrFolder of years) {
          if (!yrFolder.name) continue;
          const folderPath = `${uid}/${subDir}/${yrFolder.name}`;
          const { data: files } = await dbClient.storage
            .from("receipts")
            .list(folderPath);
          if (Array.isArray(files)) {
            for (const f of files) {
              if (f.name) pathsToDelete.add(`${folderPath}/${f.name}`);
            }
          }
        }
      }
    }

    if (pathsToDelete.size > 0) {
      await dbClient.storage
        .from("receipts")
        .remove(Array.from(pathsToDelete));
    }

    // 2. Delete user rows from tax_expenses, tax_profiles, user_subscriptions
    await dbClient.from("tax_expenses").delete().eq("user_id", uid);
    await dbClient.from("tax_profiles").delete().eq("user_id", uid);
    if (admin) {
      await admin.from("user_subscriptions").delete().eq("user_id", uid);
      // 3. Delete auth.users account completely via Admin API
      await admin.auth.admin.deleteUser(uid);
    }

    return NextResponse.json({
      deleted: true,
      authUserDeleted: Boolean(admin),
      filesRemoved: pathsToDelete.size,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "DELETE_FAILED",
        message:
          err instanceof Error ? err.message : "Could not complete account erasure.",
      },
      { status: 500 }
    );
  }
}
