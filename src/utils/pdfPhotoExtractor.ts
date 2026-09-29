import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { Student } from '../types';

export interface PdfExtractedStudentPhoto {
  id: string;
  index: number;
  tempUri: string;
  fileSize: number;
  matchedStudent: Student | null;
  detectedNumber?: string;
  detectedName?: string;
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
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    if (b64) return base64ToUint8Array(b64);
  } catch (e) {
    console.warn('readAsStringAsync failed:', e);
  }
  try {
    const tmp = `${FileSystem.cacheDirectory}tmp_pdf_${Date.now()}.pdf`;
    await FileSystem.copyAsync({ from: uri, to: tmp });
    const b64 = await FileSystem.readAsStringAsync(tmp, { encoding: 'base64' });
    await FileSystem.deleteAsync(tmp, { idempotent: true });
    if (b64) return base64ToUint8Array(b64);
  } catch (e) {
    console.warn('copyAsync failed:', e);
  }
  // fetch fallback
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

function extractInfoFromContent(content: string): StudentInfo[] {
  const results: StudentInfo[] = [];
  const doRe = /\/img(\d+)\s+Do/g;
  let m: RegExpExecArray | null;
  while ((m = doRe.exec(content)) !== null) {
    const idx = parseInt(m[1], 10);
    const ctx = content.substring(Math.max(0, m.index - 900), m.index);
    const parts: string[] = [];
    const tj = /\(([^)]*)\)\s*Tj/g;
    let tm: RegExpExecArray | null;
    while ((tm = tj.exec(ctx)) !== null) {
      const s = tm[1].trim();
      if (s) parts.push(s);
    }
    const numStr = [...parts].reverse().find(p => /^\d{4,6}$/.test(p)) || '';
    const nameParts = parts.filter(p => /[A-Za-zÇĞİÖŞÜçğışöşü]/.test(p) && !/^\d+$/.test(p));
    const name = nameParts.slice(-3).join(' ').trim();
    results.push({ imgName: 'img' + idx, number: numStr, name });
  }
  return results;
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

    // 1. Parse image objects
    const allImgs = parsePdfImageObjs(text, buf);
    const photoObjs = allImgs.filter(img => img.height >= 50 && img.width >= 40 && img.height / img.width >= 0.8);

    if (!photoObjs.length) {
      return {
        success: false, totalImages: 0, extractedPhotos: [],
        error: 'PDF dosyasında öğrenci fotoğrafı bulunamadı. Okul tarafından sağlanan orijinal fotoğraf listesi PDF\'ini seçin.',
      };
    }

    // 2. Extract student info from page content streams
    const allInfo: StudentInfo[] = [];
    const pageRe = /\/Type\s*\/Page\b/g;
    let pm: RegExpExecArray | null;
    while ((pm = pageRe.exec(text)) !== null) {
      const ctx = text.substring(pm.index, pm.index + 500);
      const cm = /\/Contents\s+\[\s*(\d+)\s+0\s+R/.exec(ctx);
      if (!cm) continue;
      const stream = getObjRawStream(parseInt(cm[1], 10), text, buf);
      if (!stream) continue;
      try {
        const decoded = await inflateAsync(stream);
        const content = Array.from(decoded).map(b => String.fromCharCode(b)).join('');
        allInfo.push(...extractInfoFromContent(content));
      } catch (_) { /* skip */ }
    }
    const infoMap: Record<string, StudentInfo> = {};
    for (const info of allInfo) infoMap[info.imgName] = info;

    // 3. Ensure cache dir
    const cacheDir = `${FileSystem.cacheDirectory}pdf_photos/`;
    if (!(await FileSystem.getInfoAsync(cacheDir)).exists) {
      await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
    }

    // 4. Convert images to files
    const numSet = new Set(students.map(s => s.student_number));
    const sorted = [...students].sort((a, b) => parseInt(a.student_number || '0', 10) - parseInt(b.student_number || '0', 10));
    const extractedPhotos: PdfExtractedStudentPhoto[] = [];

    for (let i = 0; i < photoObjs.length; i++) {
      const img = photoObjs[i];
      const imgKey = 'img' + i;
      try {
        const rawStream = buf.subarray(img.streamStart, img.streamEnd);
        let tempPath: string | null = null;
        let fileSize = 0;

        if (img.filter === 'DCTDecode') {
          // JPEG – save directly
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
            // Convert grayscale to RGB
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

        const info = infoMap[imgKey];
        let matched: Student | null = null;
        const detNum = info?.number;
        if (detNum && numSet.has(detNum)) matched = students.find(s => s.student_number === detNum) || null;
        if (!matched && i < sorted.length) matched = sorted[i];

        extractedPhotos.push({
          id: `pdf-${i}-${Date.now()}`,
          index: i,
          tempUri: tempPath,
          fileSize,
          matchedStudent: matched,
          detectedNumber: detNum || matched?.student_number,
          detectedName: info?.name,
        });
      } catch (e) {
        console.warn(`Photo ${i} error:`, e);
      }
    }

    if (!extractedPhotos.length) {
      return {
        success: false, totalImages: photoObjs.length, extractedPhotos: [],
        error: `PDF'de ${photoObjs.length} fotoğraf algılandı ancak hiçbiri dönüştürülemedi. Farklı bir PDF deneyin.`,
      };
    }

    return { success: true, totalImages: extractedPhotos.length, extractedPhotos };
  } catch (err: any) {
    console.error('extractPhotosFromPdf error:', err);
    return { success: false, totalImages: 0, extractedPhotos: [], error: err?.message || 'PDF işlenirken bir hata oluştu.' };
  }
};