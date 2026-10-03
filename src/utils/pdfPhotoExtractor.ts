import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { Student } from '../types';

export interface PdfExtractedStudentPhoto {
  id: string;
  index: number;
  tempUri: string;
  fileSize: number;
  matchedStudent: Student | null;
  detectedNumber?: string;
  detectedName?: string;
  pageNumber?: number;
}

export interface PdfPhotoExtractResult {
  success: boolean;
  totalImages: number;
  extractedPhotos: PdfExtractedStudentPhoto[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Binary helpers
// ---------------------------------------------------------------------------

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.byteLength)) as any);
  }
  return btoa(bin);
}

// ---------------------------------------------------------------------------
// Read PDF bytes with Android Scoped Storage fallbacks
// ---------------------------------------------------------------------------

async function readPdfBytes(asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> {
  const uri = asset.uri;

  // On Android, DocumentPicker URIs in the Expo cache are not directly accessible
  // via expo-file-system due to Scoped Storage restrictions.
  // Skip straight to fetch which works reliably on all platforms.
  if (Platform.OS !== 'android') {
    try {
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      if (b64) return base64ToUint8Array(b64);
    } catch (e) {
      console.warn('readAsStringAsync failed, trying fetch fallback:', e);
    }
  }

  // Fetch with ArrayBuffer — avoids the slow base64 blob round-trip
  try {
    const res = await fetch(uri);
    const arrayBuffer = await res.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (e) {
    console.warn('fetch arrayBuffer failed, trying blob fallback:', e);
  }

  // Final fallback: blob (slower, but most compatible)
  const res = await fetch(uri);
  const blob = await res.blob();
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        if (reader.result instanceof ArrayBuffer) return resolve(new Uint8Array(reader.result));
        const str = reader.result as string;
        const clean = str.includes(',') ? str.split(',')[1] : str;
        resolve(base64ToUint8Array(clean));
      } catch (e) { reject(e); }
    };
    reader.onerror = reject;
    typeof reader.readAsArrayBuffer === 'function'
      ? reader.readAsArrayBuffer(blob)
      : reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Inflate (FlateDecode / zlib)
// Use DecompressionStream when available (Expo/Hermes), otherwise pure-JS.
// ---------------------------------------------------------------------------

async function inflateAsync(compressed: Uint8Array): Promise<Uint8Array> {
  // Try zlib wrapper first with DecompressionStream
  const tryStream = async (mode: string, data: Uint8Array): Promise<Uint8Array | null> => {
    try {
      if (typeof DecompressionStream === 'undefined') return null;
      const ds = new DecompressionStream(mode as any);
      const writer = ds.writable.getWriter();
      // Copy to a plain ArrayBuffer to satisfy strict TypeScript types
      const copy = new Uint8Array(new ArrayBuffer(data.byteLength));
      copy.set(data);
      writer.write(copy);
      writer.close();
      const reader = ds.readable.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const total = chunks.reduce((a, c) => a + c.length, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { out.set(c, off); off += c.length; }
      return out;
    } catch { return null; }
  };

  // 1. Try 'deflate' (handles zlib-wrapped streams)
  const r1 = await tryStream('deflate', compressed);
  if (r1) return r1;

  // 2. Try stripping zlib 2-byte header and retry as raw deflate
  if (compressed.length > 6 && (compressed[0] & 0x0f) === 8) {
    const raw = compressed.subarray(2, compressed.length - 4);
    const r2 = await tryStream('deflate-raw', raw);
    if (r2) return r2;
  }

  // 3. Pure-JS fallback
  return inflatePureJS(compressed);
}

function inflatePureJS(data: Uint8Array): Uint8Array {
  // strip zlib header
  let buf = data;
  if (data.length > 6 && (data[0] & 0x0f) === 8) {
    buf = data.subarray(2, data.length - 4);
  }
  return deflateRawDecode(buf);
}

function deflateRawDecode(data: Uint8Array): Uint8Array {
  let pos = 0;
  const out: number[] = [];

  function readBits(n: number): number {
    let val = 0;
    for (let i = 0; i < n; i++) {
      val |= ((data[(pos / 8) | 0] >> (pos % 8)) & 1) << i;
      pos++;
    }
    return val;
  }

  function readByte(): number {
    if (pos % 8 !== 0) pos += 8 - (pos % 8);
    const v = data[pos >> 3];
    pos += 8;
    return v;
  }

  type HuffDecode = () => number;

  function buildHuffman(lengths: number[]): HuffDecode {
    const maxLen = Math.max(...lengths, 0);
    const blCount = new Uint32Array(maxLen + 1);
    for (const l of lengths) if (l > 0) blCount[l]++;
    let code = 0;
    const nextCode = new Uint32Array(maxLen + 1);
    for (let bits = 1; bits <= maxLen; bits++) {
      code = (code + blCount[bits - 1]) << 1;
      nextCode[bits] = code;
    }
    const symCode = new Uint32Array(lengths.length);
    const symsPerLen: number[][] = Array.from({ length: maxLen + 1 }, () => []);
    for (let n = 0; n < lengths.length; n++) {
      const l = lengths[n];
      if (l !== 0) {
        symCode[n] = nextCode[l];
        nextCode[l]++;
        symsPerLen[l].push(n);
      }
    }
    const codeOfSym: number[] = new Array(lengths.length);
    for (let n = 0; n < lengths.length; n++) codeOfSym[n] = symCode[n];

    return function decode(): number {
      let val = 0;
      for (let b = 1; b <= maxLen; b++) {
        val = (val << 1) | readBits(1);
        for (const sym of symsPerLen[b]) {
          if (codeOfSym[sym] === val) return sym;
        }
      }
      return -1;
    };
  }

  const fixedLitLens: number[] = [];
  for (let i = 0; i <= 287; i++) {
    if (i <= 143) fixedLitLens.push(8);
    else if (i <= 255) fixedLitLens.push(9);
    else if (i <= 279) fixedLitLens.push(7);
    else fixedLitLens.push(8);
  }
  const fixedDistLens = new Array(32).fill(5);

  const lenExtra = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const lenBase  = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const distExtra= [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  const distBase = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];

  function decodeBlock(litDec: HuffDecode, distDec: HuffDecode) {
    while (true) {
      const sym = litDec();
      if (sym < 256) { out.push(sym); }
      else if (sym === 256) { break; }
      else {
        const li = sym - 257;
        const length = lenBase[li] + readBits(lenExtra[li]);
        const di = distDec();
        const dist = distBase[di] + readBits(distExtra[di]);
        const sp = out.length - dist;
        for (let k = 0; k < length; k++) out.push(out[sp + k]);
      }
    }
  }

  let bfinal = 0;
  while (!bfinal) {
    bfinal = readBits(1);
    const btype = readBits(2);
    if (btype === 0) {
      if (pos % 8 !== 0) pos += 8 - (pos % 8);
      const len = readByte() | (readByte() << 8);
      readByte(); readByte();
      for (let i = 0; i < len; i++) out.push(readByte());
    } else if (btype === 1) {
      decodeBlock(buildHuffman(fixedLitLens), buildHuffman(fixedDistLens));
    } else {
      const hlit = readBits(5) + 257;
      const hdist = readBits(5) + 1;
      const hclen = readBits(4) + 4;
      const clOrder = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
      const clLens = new Array(19).fill(0);
      for (let i = 0; i < hclen; i++) clLens[clOrder[i]] = readBits(3);
      const clDec = buildHuffman(clLens);
      const all: number[] = [];
      while (all.length < hlit + hdist) {
        const sym = clDec();
        if (sym < 16) { all.push(sym); }
        else if (sym === 16) { const rep = readBits(2) + 3; for (let r = 0; r < rep; r++) all.push(all[all.length - 1]); }
        else if (sym === 17) { const rep = readBits(3) + 3; for (let r = 0; r < rep; r++) all.push(0); }
        else { const rep = readBits(7) + 11; for (let r = 0; r < rep; r++) all.push(0); }
      }
      decodeBlock(buildHuffman(all.slice(0, hlit)), buildHuffman(all.slice(hlit)));
    }
  }
  return new Uint8Array(out);
}

// ---------------------------------------------------------------------------
// PNG builder
// ---------------------------------------------------------------------------

function crc32(buf: Uint8Array): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = (crc >>> 8) ^ table[(crc ^ b) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length;
  const chunk = new Uint8Array(12 + len);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, len, false);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  dv.setUint32(8 + len, crc32(chunk.subarray(4, 8 + len)), false);
  return chunk;
}

/** Minimal zlib wrap using stored (uncompressed) blocks — always valid */
function zlibStore(raw: Uint8Array): Uint8Array {
  const BS = 65535;
  const blocks = Math.ceil(raw.length / BS) || 1;
  const out = new Uint8Array(2 + blocks * 5 + raw.length + 4);
  out[0] = 0x78; out[1] = 0x01;
  let pos = 2, remaining = raw.length, inOff = 0;
  for (let b = 0; b < blocks; b++) {
    const len = Math.min(remaining, BS);
    out[pos++] = b === blocks - 1 ? 1 : 0;
    out[pos++] = len & 0xff; out[pos++] = (len >> 8) & 0xff;
    out[pos++] = (~len) & 0xff; out[pos++] = ((~len) >> 8) & 0xff;
    out.set(raw.subarray(inOff, inOff + len), pos);
    pos += len; inOff += len; remaining -= len;
  }
  let s1 = 1, s2 = 0;
  for (const b of raw) { s1 = (s1 + b) % 65521; s2 = (s2 + s1) % 65521; }
  const adler = (s2 << 16) | s1;
  out[pos++] = (adler >> 24) & 0xff; out[pos++] = (adler >> 16) & 0xff;
  out[pos++] = (adler >> 8) & 0xff;  out[pos++] = adler & 0xff;
  return out.subarray(0, pos);
}

const PNG_SIG = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);

function buildIndexedPng(pixels: Uint8Array, palette: Uint8Array, w: number, h: number): Uint8Array {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w, false); dv.setUint32(4, h, false);
  ihdr[8] = 8; ihdr[9] = 3; // 8-bit indexed
  const scanlines = new Uint8Array((w + 1) * h);
  for (let y = 0; y < h; y++) {
    scanlines[y * (w + 1)] = 0; // filter=None
    scanlines.set(pixels.subarray(y * w, (y + 1) * w), y * (w + 1) + 1);
  }
  const chunks = [pngChunk('IHDR', ihdr), pngChunk('PLTE', palette), pngChunk('IDAT', zlibStore(scanlines)), pngChunk('IEND', new Uint8Array(0))];
  const total = PNG_SIG.length + chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  out.set(PNG_SIG);
  let off = PNG_SIG.length;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

function buildRgbPng(pixels: Uint8Array, w: number, h: number): Uint8Array {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w, false); dv.setUint32(4, h, false);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const scanlines = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    scanlines[y * (w * 3 + 1)] = 0;
    scanlines.set(pixels.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  }
  const chunks = [pngChunk('IHDR', ihdr), pngChunk('IDAT', zlibStore(scanlines)), pngChunk('IEND', new Uint8Array(0))];
  const total = PNG_SIG.length + chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  out.set(PNG_SIG);
  let off = PNG_SIG.length;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

// ---------------------------------------------------------------------------
// PDF object parser
// ---------------------------------------------------------------------------

interface PdfImageObj {
  objNum: number;
  width: number;
  height: number;
  filter: 'DCTDecode' | 'FlateDecode' | '';
  csType: 'Indexed' | 'DeviceRGB' | 'DeviceGray' | '';
  paletteObjNum?: number;
  streamStart: number;
  streamEnd: number;
}

function parsePdfImageObjs(text: string, buf: Uint8Array): PdfImageObj[] {
  const results: PdfImageObj[] = [];
  const re = /(\d+)\s+0\s+obj\s*\n?<<([\s\S]*?)>>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const hdr = m[2];
    if (!hdr.includes('/Subtype') || !hdr.includes('/Image')) continue;
    const wm = /\/Width\s+(\d+)/.exec(hdr);
    const hm = /\/Height\s+(\d+)/.exec(hdr);
    if (!wm || !hm) continue;
    const width = parseInt(wm[1], 10);
    const height = parseInt(hm[1], 10);
    if (width < 40 || height < 40) continue; // skip tiny icons

    let filter: 'DCTDecode' | 'FlateDecode' | '' = '';
    if (/DCTDecode/.test(hdr)) filter = 'DCTDecode';
    else if (/FlateDecode/.test(hdr)) filter = 'FlateDecode';

    let csType: 'Indexed' | 'DeviceRGB' | 'DeviceGray' | '' = '';
    let paletteObjNum: number | undefined;
    const csRef = /\/ColorSpace\s+(\d+)\s+0\s+R/.exec(hdr);
    if (csRef) {
      const csNum = parseInt(csRef[1], 10);
      const csObjRe = new RegExp(csNum + '\\s+0\\s+obj\\s*\\n?\\[\\s*/Indexed');
      const csM = csObjRe.exec(text);
      if (csM) {
        csType = 'Indexed';
        const palM = /\/Indexed\s+\/\w+\s+\d+\s+(\d+)\s+0\s+R/.exec(text.substring(csM.index, csM.index + 200));
        if (palM) paletteObjNum = parseInt(palM[1], 10);
      }
    } else if (/\/ColorSpace\s*\/DeviceRGB/.test(hdr)) {
      csType = 'DeviceRGB';
    } else if (/\/ColorSpace\s*\/DeviceGray/.test(hdr)) {
      csType = 'DeviceGray';
    }

    const smIdx = text.indexOf('stream', m.index + m[0].length);
    if (smIdx === -1) continue;
    let ss = smIdx + 6;
    if (text[ss] === '\r') ss++;
    if (text[ss] === '\n') ss++;
    const esIdx = text.indexOf('endstream', ss);
    if (esIdx === -1) continue;

    results.push({ objNum: parseInt(m[1], 10), width, height, filter, csType, paletteObjNum, streamStart: ss, streamEnd: esIdx });
  }
  return results;
}

function getObjRawStream(objNum: number, text: string, buf: Uint8Array): Uint8Array | null {
  const re = new RegExp('(?:^|\\n)' + objNum + '\\s+0\\s+obj');
  const m = re.exec(text);
  if (!m) return null;
  let ss = text.indexOf('stream', m.index) + 6;
  if (text[ss] === '\r') ss++;
  if (text[ss] === '\n') ss++;
  const es = text.indexOf('endstream', ss);
  if (es === -1) return null;
  return buf.subarray(ss, es);
}

// ---------------------------------------------------------------------------
// Student name/number extraction from page content streams
// ---------------------------------------------------------------------------

interface StudentInfo { imgName: string; number: string; name: string; }

function getPdfObjContent(objNum: number, text: string): string | null {
  const re = new RegExp('(?:^|\\r?\\n)' + objNum + '\\s+0\\s+obj([\\s\\S]*?)endobj');
  const m = re.exec(text);
  return m ? m[1] : null;
}

function getPageXObjectMap(pageObjNum: number, pageDictText: string, text: string): Record<string, number> {
  const map: Record<string, number> = {};

  // 1. Find Resources text (direct reference, inline, or inherited from parent)
  let resDictText = '';
  const resRef = /\/Resources\s+(\d+)\s+0\s+R/.exec(pageDictText);
  if (resRef) {
    resDictText = getPdfObjContent(parseInt(resRef[1], 10), text) || '';
  } else {
    const resInline = /\/Resources\s*<<([\s\S]*?)>>/.exec(pageDictText);
    if (resInline) {
      resDictText = resInline[1];
    } else if (pageObjNum > 0) {
      const pageObj = getPdfObjContent(pageObjNum, text);
      if (pageObj) {
        const pResRef = /\/Resources\s+(\d+)\s+0\s+R/.exec(pageObj);
        if (pResRef) {
          resDictText = getPdfObjContent(parseInt(pResRef[1], 10), text) || '';
        } else {
          const parentRef = /\/Parent\s+(\d+)\s+0\s+R/.exec(pageObj);
          if (parentRef) {
            const parentObj = getPdfObjContent(parseInt(parentRef[1], 10), text);
            if (parentObj) {
              const prRef = /\/Resources\s+(\d+)\s+0\s+R/.exec(parentObj);
              if (prRef) {
                resDictText = getPdfObjContent(parseInt(prRef[1], 10), text) || '';
              }
            }
          }
        }
      }
    }
  }

  if (!resDictText) return map;

  // 2. Find XObject dictionary (direct reference or inline)
  let xobjDictText = '';
  const xobjRef = /\/XObject\s+(\d+)\s+0\s+R/.exec(resDictText);
  if (xobjRef) {
    xobjDictText = getPdfObjContent(parseInt(xobjRef[1], 10), text) || '';
  } else {
    const xobjInline = /\/XObject\s*<<([\s\S]*?)>>/.exec(resDictText);
    if (xobjInline) {
      xobjDictText = xobjInline[1];
    }
  }

  if (!xobjDictText) return map;

  // 3. Extract alias -> objNum entries
  const itemRe = /\/([a-zA-Z0-9_\-]+)\s+(\d+)\s+0\s+R/g;
  let im: RegExpExecArray | null;
  while ((im = itemRe.exec(xobjDictText)) !== null) {
    map[im[1]] = parseInt(im[2], 10);
  }

  return map;
}

function extractStringsFromContext(ctx: string): string[] {
  const list: string[] = [];
  const parseStr = (s: string) => {
    return s.replace(/\\([()\\])/g, '$1').trim();
  };

  // Match text inside BT ... ET blocks
  const btEtRe = /BT([\s\S]*?)ET/g;
  let bm: RegExpExecArray | null;
  while ((bm = btEtRe.exec(ctx)) !== null) {
    const block = bm[1];
    const strRe = /\(((\\.|[^)])*)\)/g;
    let sm: RegExpExecArray | null;
    while ((sm = strRe.exec(block)) !== null) {
      const s = parseStr(sm[1]);
      if (s) list.push(s);
    }
  }
  // Fallback to literal strings outside BT...ET
  if (list.length === 0) {
    const directRe = /\(((\\.|[^)])*)\)/g;
    let dm: RegExpExecArray | null;
    while ((dm = directRe.exec(ctx)) !== null) {
      const s = parseStr(dm[1]);
      if (s) list.push(s);
    }
  }
  return list;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export const extractPhotosFromPdf = async (
  students: Student[]
): Promise<PdfPhotoExtractResult> => {
  try {
    const pick = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'], copyToCacheDirectory: true });
    if (pick.canceled || !pick.assets?.length) {
      return { success: false, totalImages: 0, extractedPhotos: [], error: 'Dosya seçilmedi.' };
    }

    const buf = await readPdfBytes(pick.assets[0]);
    if (!buf?.length) {
      return { success: false, totalImages: 0, extractedPhotos: [], error: 'PDF dosyası okunamadı.' };
    }

    // Latin-1 string for text scanning (binary-safe)
    const text = Array.from(buf).map(b => String.fromCharCode(b)).join('');

    // 1. Parse image objects (all pages, binary order)
    const allImgs = parsePdfImageObjs(text, buf);
    const photoObjs = allImgs.filter(img => img.height >= 50 && img.width >= 40 && img.height / img.width >= 0.8);

    if (!photoObjs.length) {
      return {
        success: false, totalImages: 0, extractedPhotos: [],
        error: 'PDF dosyasında öğrenci fotoğrafı bulunamadı. Okul tarafından sağlanan orijinal fotoğraf listesi PDF\'ini seçin.',
      };
    }

    // ── Ensure cache dir ────────────────────────────────────────────────────
    const cacheDir = `${FileSystem.cacheDirectory}pdf_photos/`;
    if (!(await FileSystem.getInfoAsync(cacheDir)).exists) {
      await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
    }

    const numSet = new Set(students.map(s => s.student_number));

    // ── Per-page algorithm ──────────────────────────────────────────────────
    interface PagePair {
      photo: PdfImageObj;
      info: StudentInfo;
      pageNumber: number;
    }
    const orderedPairs: PagePair[] = [];
    const usedObjNums = new Set<number>();
    let positionalCursor = 0;

    const pageRe = /\/Type\s*\/Page\b/g;
    let pm: RegExpExecArray | null;
    let pageNumber = 0;

    while ((pm = pageRe.exec(text)) !== null) {
      pageNumber++;

      // ── 1. Decode this page's content stream(s) ──
      const pageWindow = text.substring(Math.max(0, pm.index - 200), pm.index + 3000);
      const textBefore = text.substring(Math.max(0, pm.index - 300), pm.index);
      const objNumM = /(\d+)\s+0\s+obj[\s\S]*?$/i.exec(textBefore);
      const pageObjNum = objNumM ? parseInt(objNumM[1], 10) : 0;

      let pageContent = '';
      const arrayM = /\/Contents\s+\[([\s\S]*?)\]/.exec(pageWindow);
      if (arrayM) {
        const refs: number[] = [];
        const rRe = /(\d+)\s+0\s+R/g;
        let rm: RegExpExecArray | null;
        while ((rm = rRe.exec(arrayM[1])) !== null) {
          refs.push(parseInt(rm[1], 10));
        }
        const chunks: Uint8Array[] = [];
        for (const ref of refs) {
          const s = getObjRawStream(ref, text, buf);
          if (s) {
            try {
              chunks.push(await inflateAsync(s));
            } catch {
              chunks.push(s);
            }
          }
        }
        if (chunks.length > 0) {
          const tot = chunks.reduce((acc, c) => acc + c.length, 0);
          const comb = new Uint8Array(tot);
          let offset = 0;
          for (const c of chunks) { comb.set(c, offset); offset += c.length; }
          pageContent = Array.from(comb).map(b => String.fromCharCode(b)).join('');
        }
      } else {
        const contentsM = /\/Contents\s+(\d+)\s+0\s+R/.exec(pageWindow);
        if (contentsM) {
          const raw = getObjRawStream(parseInt(contentsM[1], 10), text, buf);
          if (raw) {
            try {
              const decoded = await inflateAsync(raw);
              pageContent = Array.from(decoded).map(b => String.fromCharCode(b)).join('');
            } catch {
              pageContent = Array.from(raw).map(b => String.fromCharCode(b)).join('');
            }
          }
        }
      }

      if (!pageContent) continue;

      // ── 2. Build per-page XObject map ──
      const pageXobjMap = getPageXObjectMap(pageObjNum, pageWindow, text);
      const hasAliasMap = Object.keys(pageXobjMap).length > 0;

      // ── 3. Find image placements on this page ──
      const doRe = /\/([a-zA-Z0-9_\-]+)\s+Do/g;
      let dm: RegExpExecArray | null;
      interface PagePlacement {
        alias: string;
        index: number;
        objNum: number;
        photo?: PdfImageObj;
      }
      const pagePlacements: PagePlacement[] = [];
      while ((dm = doRe.exec(pageContent)) !== null) {
        const alias = dm[1];
        const objNum = pageXobjMap[alias] || 0;
        let photo: PdfImageObj | undefined;
        if (objNum > 0) {
          photo = photoObjs.find(p => p.objNum === objNum);
        }
        pagePlacements.push({ alias, index: dm.index, objNum, photo });
      }

      // Filter to student photos (skips logos, headers, stamps not matching photoObjs criteria)
      let photoPlacements: PagePlacement[] = [];
      if (hasAliasMap) {
        photoPlacements = pagePlacements.filter(p => p.photo !== undefined);
      }
      if (photoPlacements.length === 0) {
        const imgDoRe = /\/(img\d+|Im\d+|I\d+)\s+Do/gi;
        let idm: RegExpExecArray | null;
        while ((idm = imgDoRe.exec(pageContent)) !== null) {
          photoPlacements.push({ alias: idm[1], index: idm.index, objNum: 0 });
        }
      }

      if (photoPlacements.length === 0) continue;

      // ── 4. Determine whether text is drawn before or after photo on this page ──
      const firstPhotoIdx = photoPlacements[0].index;
      const region0Text = pageContent.substring(Math.max(0, firstPhotoIdx - 1200), firstPhotoIdx);
      const region0Strings = extractStringsFromContext(region0Text);
      const region0Numbers = region0Strings.filter(s => /^\d{1,6}$/.test(s));

      // Does the region before the first photo contain a student number?
      // (either in numSet, or 3+ digits like 1465)
      const hasStudentNumBeforeFirstPhoto = region0Numbers.some(n => numSet.has(n) || n.length >= 3);
      const textOrder: 'before' | 'after' = hasStudentNumBeforeFirstPhoto ? 'before' : 'after';

      const IGNORE_WORDS = new Set([
        'T.C.', 'TC', 'MİLLİ', 'MILLI', 'EĞİTİM', 'EGITIM', 'BAKANLIĞI', 'BAKANLIGI',
        'ÖĞRENCİ', 'OGRENCI', 'FOTOĞRAF', 'FOTOGRAF', 'LİSTESİ', 'LISTESI', 'SINIF',
        'ŞUBE', 'SUBE', 'SAYFA', 'SIRA', 'NO', 'NUMARASI', 'OKUL', 'DERS', 'TARİH', 'TARIH'
      ]);

      const usedNumbersOnPage = new Set<string>();

      for (let k = 0; k < photoPlacements.length; k++) {
        const cur = photoPlacements[k];
        let ctx = '';

        if (textOrder === 'before') {
          // Context is strictly between previous photo and current photo
          const prevIdx = k > 0 ? photoPlacements[k - 1].index : 0;
          ctx = pageContent.substring(Math.max(prevIdx, cur.index - 1200), cur.index);
        } else {
          // Context is strictly between current photo and next photo
          const nextIdx = k + 1 < photoPlacements.length ? photoPlacements[k + 1].index : pageContent.length;
          ctx = pageContent.substring(cur.index, Math.min(nextIdx, cur.index + 1200));
        }

        let strings = extractStringsFromContext(ctx);
        if (strings.length === 0) {
          if (textOrder === 'before') {
            const nextIdx = k + 1 < photoPlacements.length ? photoPlacements[k + 1].index : pageContent.length;
            ctx = pageContent.substring(cur.index, Math.min(nextIdx, cur.index + 1200));
          } else {
            const prevIdx = k > 0 ? photoPlacements[k - 1].index : 0;
            ctx = pageContent.substring(Math.max(prevIdx, cur.index - 1200), cur.index);
          }
          strings = extractStringsFromContext(ctx);
        }

        const candidateNumbers = strings.filter(s => /^\d{1,6}$/.test(s));
        const candidateNames = strings.filter(
          s => /[A-Za-zÇĞİÖŞÜçğışöşü]/.test(s) &&
               !/^\d+$/.test(s) &&
               !IGNORE_WORDS.has(s.toUpperCase())
        );

        let detNum = '';
        // 1. Look for numbers that actually belong to the students in the class/system
        const matchingKnown = candidateNumbers.filter(n => numSet.has(n) && !usedNumbersOnPage.has(n));
        if (matchingKnown.length > 0) {
          // If multiple match, prefer longer number (e.g. 1465 > 2)
          matchingKnown.sort((a, b) => b.length - a.length);
          detNum = matchingKnown[0];
        } else {
          // 2. If not in known numbers, only accept 3+ digit numbers
          // (eliminates stray page numbers like "2" or row counters)
          const validCandidates = candidateNumbers.filter(n => n.length >= 3 && !usedNumbersOnPage.has(n));
          if (validCandidates.length > 0) {
            validCandidates.sort((a, b) => b.length - a.length);
            detNum = validCandidates[0];
          }
        }

        if (detNum) {
          usedNumbersOnPage.add(detNum);
        }

        const name = candidateNames.slice(-3).join(' ').trim();
        const info: StudentInfo = { imgName: cur.alias, number: detNum, name };

        // ── 5. Resolve image object for this photo ──
        let photo: PdfImageObj | undefined = cur.photo;
        if (photo && !usedObjNums.has(photo.objNum)) {
          orderedPairs.push({ photo, info, pageNumber });
          usedObjNums.add(photo.objNum);
        } else {
          // Positional fallback if direct alias photo was not found or already used
          while (positionalCursor < photoObjs.length && usedObjNums.has(photoObjs[positionalCursor].objNum)) {
            positionalCursor++;
          }
          if (positionalCursor < photoObjs.length) {
            const posPhoto = photoObjs[positionalCursor];
            orderedPairs.push({ photo: posPhoto, info, pageNumber });
            usedObjNums.add(posPhoto.objNum);
            positionalCursor++;
          }
        }
      }
    }

    // ── Convert matched image objects to files and resolve students ─────────
    const extractedPhotos: PdfExtractedStudentPhoto[] = [];
    // Her öğrenci yalnızca bir kez eşleştirilebilir
    const usedStudentIds = new Set<number>();

    for (let i = 0; i < orderedPairs.length; i++) {
      const { photo: img, info, pageNumber } = orderedPairs[i];
      try {
        const rawStream = buf.subarray(img.streamStart, img.streamEnd);
        let tempPath: string | null = null;
        let fileSize = 0;

        if (img.filter === 'DCTDecode') {
          tempPath = `${cacheDir}pdf_${Date.now()}_${i}.jpg`;
          await FileSystem.writeAsStringAsync(tempPath, uint8ArrayToBase64(rawStream), { encoding: 'base64' });
          fileSize = rawStream.length;
        } else if (img.filter === 'FlateDecode') {
          const pixels = await inflateAsync(rawStream);
          let pngBytes: Uint8Array | null = null;

          if (img.csType === 'Indexed' && img.paletteObjNum !== undefined) {
            const palRaw = getObjRawStream(img.paletteObjNum, text, buf);
            if (palRaw) {
              const palette = await inflateAsync(palRaw);
              pngBytes = buildIndexedPng(pixels, palette, img.width, img.height);
            }
          } else if (img.csType === 'DeviceRGB') {
            pngBytes = buildRgbPng(pixels, img.width, img.height);
          } else if (img.csType === 'DeviceGray') {
            const rgb = new Uint8Array(pixels.length * 3);
            for (let j = 0; j < pixels.length; j++) { rgb[j*3]=rgb[j*3+1]=rgb[j*3+2]=pixels[j]; }
            pngBytes = buildRgbPng(rgb, img.width, img.height);
          }

          if (pngBytes) {
            tempPath = `${cacheDir}pdf_${Date.now()}_${i}.png`;
            await FileSystem.writeAsStringAsync(tempPath, uint8ArrayToBase64(pngBytes), { encoding: 'base64' });
            fileSize = pngBytes.length;
          }
        }

        if (!tempPath) continue;

        const detNum = info.number;
        let matched: Student | null = null;

        // ── Öğrenci eşleştirme kuralları ────────────────────────────────────
        // 1. Sadece numara ile eşleştir (isim tahmini yapma).
        //    Numara sistemde yoksa matched = null kalır; kullanıcı manuel atar.
        // 2. Aynı öğrenci birden fazla fotoğrafa atanamaz (usedStudentIds).
        // ────────────────────────────────────────────────────────────────────
        if (detNum && numSet.has(detNum)) {
          const candidate = students.find(s => s.student_number === detNum) || null;
          if (candidate && !usedStudentIds.has(candidate.id)) {
            matched = candidate;
          }
        }

        if (matched) usedStudentIds.add(matched.id);

        extractedPhotos.push({
          id: `pdf-${i}-${Date.now()}`,
          index: i,
          tempUri: tempPath,
          fileSize,
          matchedStudent: matched,
          detectedNumber: detNum,
          detectedName: info.name,
          pageNumber,
        });
      } catch (e) {
        console.warn(`Photo ${i} error:`, e);
      }
    }

    if (!extractedPhotos.length) {
      return {
        success: false,
        totalImages: orderedPairs.length || photoObjs.length,
        extractedPhotos: [],
        error: `PDF'de fotoğraf algılandı ancak hiçbiri işlenemedi. Farklı bir PDF deneyin.`,
      };
    }

    return { success: true, totalImages: extractedPhotos.length, extractedPhotos };
  } catch (err: any) {
    console.error('extractPhotosFromPdf error:', err);
    return { success: false, totalImages: 0, extractedPhotos: [], error: err?.message || 'PDF işlenirken bir hata oluştu.' };
  }
};