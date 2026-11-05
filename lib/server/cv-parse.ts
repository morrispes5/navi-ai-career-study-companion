import "server-only";

export const CV_MAX_BYTES = 5 * 1024 * 1024;
/** Whole multipart body cap: file + form overhead. */
export const CV_MAX_BODY_BYTES = CV_MAX_BYTES + 64 * 1024;
export const CV_MAX_CHARS = 20_000;
export const CV_MIN_CHARS = 200;
export const CV_MAX_PDF_PAGES = 20;
export const CV_MAX_DOCX_UNCOMPRESSED = 25 * 1024 * 1024;
export const CV_MAX_DOCX_ENTRIES = 2_000;
export const CV_PARSE_TIMEOUT_MS = 10_000;

/** User-facing input error carrying its own HTTP status (no message matching). */
export class CvInputError extends Error {
  constructor(message: string, readonly status: 400 | 413 | 422 = 400) { super(message); }
}
export const tooLarge = () => new CvInputError("File CV maksimal 5MB.", 413);

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Normalise CV text: strip control chars, collapse whitespace, cap length. */
export function normaliseCvText(raw: string) {
  return raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, CV_MAX_CHARS);
}

/** Read a request body with a hard byte cap enforced while streaming (works for chunked bodies without Content-Length). */
export async function readBodyLimited(request: Request, maxBytes = CV_MAX_BODY_BYTES): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw tooLarge();
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel().catch(() => {}); throw tooLarge(); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

/**
 * Zip-bomb guard: walk the ZIP central directory and sum declared uncompressed sizes.
 * Rejects archives with too many entries, ZIP64 markers, or a total over the cap.
 */
export function assertZipWithinLimits(buf: Uint8Array, maxUncompressed = CV_MAX_DOCX_UNCOMPRESSED, maxEntries = CV_MAX_DOCX_ENTRIES) {
  const bad = () => new CvInputError("File DOCX terlalu besar atau tidak valid.", 422);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw bad();
  const entries = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (entries > maxEntries || cdOffset === 0xffffffff) throw bad();
  let p = cdOffset, total = 0;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > buf.length || view.getUint32(p, true) !== 0x02014b50) throw bad();
    const size = view.getUint32(p + 24, true);
    if (size === 0xffffffff) throw bad();
    total += size;
    if (total > maxUncompressed) throw bad();
    p += 46 + view.getUint16(p + 28, true) + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
}

export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new CvInputError("File CV terlalu lama diproses. Coba tempel teksnya langsung.", 422)), ms); });
  return Promise.race([work, timeout]).finally(() => clearTimeout(t));
}

/** Server-side extraction for PDF/DOCX uploads (max 5MB). Validates by magic bytes, not just the client MIME type. */
export async function extractCvText(file: File, opts: { timeoutMs?: number; maxPages?: number } = {}): Promise<string> {
  if (file.size > CV_MAX_BYTES) throw tooLarge();
  const buf = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const isPdf = buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46; // %PDF
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b; // PK (docx)
  const timeoutMs = opts.timeoutMs ?? CV_PARSE_TIMEOUT_MS;
  const maxPages = opts.maxPages ?? CV_MAX_PDF_PAGES;
  try {
    if (isPdf && (file.type === PDF || name.endsWith(".pdf") || !file.type)) {
      return await withTimeout((async () => {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(buf);
        if (pdf.numPages > maxPages) throw new CvInputError(`PDF maksimal ${maxPages} halaman.`, 422);
        const { text } = await extractText(pdf, { mergePages: true });
        return normaliseCvText(text);
      })(), timeoutMs);
    }
    if (isZip && (file.type === DOCX || name.endsWith(".docx"))) {
      assertZipWithinLimits(buf);
      return await withTimeout((async () => {
        const mammoth = await import("mammoth");
        const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
        return normaliseCvText(value);
      })(), timeoutMs);
    }
  } catch (e) {
    if (e instanceof CvInputError) throw e;
    throw new CvInputError("File CV tidak bisa dibaca. Coba tempel teksnya langsung.", 422);
  }
  throw new CvInputError("Format file harus PDF atau DOCX.");
}
