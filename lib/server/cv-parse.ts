import "server-only";

export const CV_MAX_BYTES = 5 * 1024 * 1024;
export const CV_MAX_CHARS = 20_000;
export const CV_MIN_CHARS = 200;

export class CvInputError extends Error {}

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Normalise CV text: strip control chars, collapse whitespace, cap length. */
export function normaliseCvText(raw: string) {
  return raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, CV_MAX_CHARS);
}

/** Server-side extraction for PDF/DOCX uploads (max 5MB). Validates by magic bytes, not just the client MIME type. */
export async function extractCvText(file: File): Promise<string> {
  if (file.size > CV_MAX_BYTES) throw new CvInputError("File CV maksimal 5MB.");
  const buf = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const isPdf = buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46; // %PDF
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b; // PK (docx)
  try {
    if (isPdf && (file.type === PDF || name.endsWith(".pdf") || !file.type)) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(buf);
      const { text } = await extractText(pdf, { mergePages: true });
      return normaliseCvText(text);
    }
    if (isZip && (file.type === DOCX || name.endsWith(".docx"))) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
      return normaliseCvText(value);
    }
  } catch { throw new CvInputError("File CV tidak bisa dibaca. Coba tempel teksnya langsung."); }
  throw new CvInputError("Format file harus PDF atau DOCX.");
}
