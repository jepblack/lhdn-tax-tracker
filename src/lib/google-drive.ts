import { buildJsonMetadataFile } from "./receipt-archiver";
import { TaxExpense, TaxYear } from "./types";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

const DRIVE_TOKEN_STORAGE_KEY = "cukaiku_google_drive_token_v1";

export function saveGoogleDriveToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    window.sessionStorage.setItem(DRIVE_TOKEN_STORAGE_KEY, token);
  } else {
    window.sessionStorage.removeItem(DRIVE_TOKEN_STORAGE_KEY);
  }
}

export function getGoogleDriveToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(DRIVE_TOKEN_STORAGE_KEY);
}

/**
 * Finds or creates a folder in Google Drive under an optional parent folder ID.
 */
async function findOrCreateFolder(
  token: string,
  folderName: string,
  parentId?: string
): Promise<string> {
  const escaped = folderName.replace(/'/g, "\\'");
  const parentClause = parentId
    ? ` and '${parentId}' in parents`
    : " and 'root' in parents";
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${escaped}' and trashed=false${parentClause}`
  );

  const searchRes = await fetch(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name)&spaces=drive`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (searchRes.status === 401) {
    throw new Error("DRIVE_TOKEN_EXPIRED");
  }
  if (!searchRes.ok) {
    const errText = await searchRes.text();
    throw new Error(`Drive folder lookup failed: ${errText.slice(0, 140)}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id as string;
  }

  // Create folder
  const createRes = await fetch(`${DRIVE_API}/files?fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Drive folder create failed: ${errText.slice(0, 140)}`);
  }

  const created = await createRes.json();
  return created.id as string;
}

/**
 * Ensures /CukaiKu/Receipts/{YYYY}/ exists in the user's Google Drive and returns the year folder ID.
 */
export async function ensureYearFolderInDrive(
  token: string,
  taxYear: TaxYear
): Promise<string> {
  const rootId = await findOrCreateFolder(token, "CukaiKu");
  const receiptsId = await findOrCreateFolder(token, "Receipts", rootId);
  const yearId = await findOrCreateFolder(token, String(taxYear), receiptsId);
  return yearId;
}

/**
 * Uploads (or updates) a file into a Google Drive folder using multipart upload.
 */
async function uploadFileToDriveFolder(
  token: string,
  folderId: string,
  file: File
): Promise<{ id: string; webViewLink: string }> {
  // Check if file with same name already exists in this folder
  const escaped = file.name.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `name='${escaped}' and '${folderId}' in parents and trashed=false`
  );
  const lookupRes = await fetch(
    `${DRIVE_API}/files?q=${q}&fields=files(id,webViewLink)`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  let existingId: string | null = null;
  if (lookupRes.ok) {
    const lookupData = await lookupRes.json();
    if (lookupData.files && lookupData.files.length > 0) {
      existingId = lookupData.files[0].id;
    }
  }

  const boundary = `cukaiku_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const metadata = existingId
    ? { name: file.name, mimeType: file.type || "application/octet-stream" }
    : {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        parents: [folderId],
      };

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const encoder = new TextEncoder();

  const part1 = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
      metadata
    )}\r\n--${boundary}\r\nContent-Type: ${
      file.type || "application/octet-stream"
    }\r\n\r\n`
  );
  const part3 = encoder.encode(`\r\n--${boundary}--`);

  const body = new Uint8Array(part1.length + fileBytes.length + part3.length);
  body.set(part1, 0);
  body.set(fileBytes, part1.length);
  body.set(part3, part1.length + fileBytes.length);

  const url = existingId
    ? `${DRIVE_UPLOAD_API}/files/${existingId}?uploadType=multipart&fields=id,webViewLink`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink`;

  const uploadRes = await fetch(url, {
    method: existingId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (uploadRes.status === 401) {
    throw new Error("DRIVE_TOKEN_EXPIRED");
  }
  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Drive upload failed: ${errText.slice(0, 140)}`);
  }

  const uploaded = await uploadRes.json();
  return {
    id: uploaded.id as string,
    webViewLink:
      (uploaded.webViewLink as string) ||
      `https://drive.google.com/file/d/${uploaded.id}/view`,
  };
}

/**
 * Archives a receipt PDF + paired LHDN JSON metadata file directly to:
 * My Drive / CukaiKu / Receipts / {YYYY} /
 */
export async function archiveReceiptToGoogleDrive(
  token: string,
  taxYear: TaxYear,
  pdfFile: File | null,
  expense: Omit<TaxExpense, "id" | "createdAt">
): Promise<{
  pdfFileId?: string;
  pdfWebViewLink?: string;
  jsonFileId?: string;
}> {
  const yearFolderId = await ensureYearFolderInDrive(token, taxYear);
  const result: {
    pdfFileId?: string;
    pdfWebViewLink?: string;
    jsonFileId?: string;
  } = {};

  if (pdfFile) {
    const uploadedPdf = await uploadFileToDriveFolder(
      token,
      yearFolderId,
      pdfFile
    );
    result.pdfFileId = uploadedPdf.id;
    result.pdfWebViewLink = uploadedPdf.webViewLink;
  }

  if (expense.metadata) {
    const jsonFile = buildJsonMetadataFile(expense.metadata);
    const uploadedJson = await uploadFileToDriveFolder(
      token,
      yearFolderId,
      jsonFile
    );
    result.jsonFileId = uploadedJson.id;
  }

  return result;
}

/**
 * Uploads the annual LHDN Index CSV + full JSON backup for a tax year to:
 * My Drive / CukaiKu / Receipts / {YYYY} / Receipts_{YYYY}_LHDN_Index.csv
 */
export async function syncYearIndexToGoogleDrive(
  token: string,
  taxYear: TaxYear,
  expenses: TaxExpense[]
): Promise<{ folderUrl: string; syncedCount: number }> {
  const yearFolderId = await ensureYearFolderInDrive(token, taxYear);
  const yearExpenses = expenses.filter((e) => e.taxYear === taxYear);

  // 1. Upload annual CSV index
  const headers = [
    "filename",
    "date",
    "merchant",
    "amount",
    "currency",
    "category",
    "payment_method",
    "tax_amount",
    "ocr_confidence",
    "needs_review",
    "receipt_number",
    "retain_until",
  ];
  const rows = yearExpenses.map((e) => {
    const m = e.metadata;
    return [
      m?.file_pdf || e.receiptFileName || "",
      m?.transaction_date || e.expenseDate,
      m?.merchant_name || e.merchant,
      (m?.amount_paid ?? e.amount).toFixed(2),
      m?.currency || "MYR",
      m?.category || e.categoryId,
      m?.payment_method || "",
      (m?.sst_or_tax_amount ?? 0).toFixed(2),
      m?.ocr_confidence || (e.aiExtracted ? "high" : "manual"),
      m?.needs_review ? "true" : "false",
      m?.receipt_number || e.invoiceNumber || "",
      String(e.taxYear + 8),
    ];
  });
  const csvString = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const csvFile = new File(
    [csvString],
    `Receipts_${taxYear}_LHDN_Index.csv`,
    { type: "text/csv" }
  );
  await uploadFileToDriveFolder(token, yearFolderId, csvFile);

  // 2. Upload full JSON backup of all metadata records for that year
  const backupJsonFile = new File(
    [JSON.stringify(yearExpenses, null, 2)],
    `CukaiKu_YA${taxYear}_Backup.json`,
    { type: "application/json" }
  );
  await uploadFileToDriveFolder(token, yearFolderId, backupJsonFile);

  return {
    folderUrl: `https://drive.google.com/drive/folders/${yearFolderId}`,
    syncedCount: yearExpenses.length,
  };
}
