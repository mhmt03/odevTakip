import * as FileSystem from 'expo-file-system/legacy';
import { getDB } from '../database/db';
import type { ParsedYearlyPlanRow } from './excelService';

// Varsayılan API Anahtarı (Kullanıcı dilerse buraya doğrudan tanımlayabilir veya uygulama içinden girebilir)
export const DEFAULT_GEMINI_API_KEY = 'AQ.Ab8RN6Jo0l8xWLJabe72du_7hkSGRYm9miUkzxV0-ISPbqFC';

export interface AnalyzedLessonItem {
  day: number; // 1: Pazartesi .. 7: Pazar
  slotNumber: number; // 1, 2, 3..
  className: string; // Örn: "11-A", "12-C"
  courseName: string; // Örn: "Seçmeli Fizik"
  courseCode?: string; // Örn: "S.FZK"
  classroom?: string; // Örn: "Derslik 3"
}

export interface AnalyzedSlotTime {
  slotNumber: number;
  startTime: string; // Örn: "08:30"
  endTime: string; // Örn: "09:10"
  slotName?: string; // Örn: "1. Ders"
}

export interface AnalysisResponse {
  success: boolean;
  lessons: AnalyzedLessonItem[];
  detectedSlotTimes?: AnalyzedSlotTime[];
  modelUsed: string;
  notes?: string;
  rawResponse?: string;
}

export interface GeminiUsageStats {
  date: string; // YYYY-MM-DD
  requestsToday: number;
  tokensToday: number;
  lastRequestTime: string; // HH:mm
  model: string;
  dailyRequestLimit: number; // 1500 for Flash, 50 for Pro
  remainingRequests: number;
  remainingPercent: number; // 0..100
  lastTokensUsed: number;
}

/**
 * SQLite app_settings tablosundan kaydedilmiş Gemini API anahtarını alır.
 * Kayıtlı yoksa varsayılan anahtara döner.
 */
export const getGeminiApiKey = async (): Promise<string> => {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'gemini_api_key'"
    );
    const key = (row?.value || '').trim();
    if (key) return key;
  } catch (e) {
    console.warn('Gemini API anahtarı veritabanından okunamadı:', e);
  }
  return DEFAULT_GEMINI_API_KEY.trim();
};

/**
 * Gemini API anahtarını SQLite app_settings tablosuna kaydeder.
 */
export const setGeminiApiKey = async (apiKey: string): Promise<void> => {
  const db = await getDB();
  const trimmed = apiKey.trim();
  if (trimmed) {
    await db.runAsync(
      "INSERT INTO app_settings (key, value) VALUES ('gemini_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      trimmed
    );
  } else {
    await db.runAsync("DELETE FROM app_settings WHERE key = 'gemini_api_key'");
  }
};

/**
 * Günlük Gemini API istek ve harcanan token kullanımını kaydeder.
 */
export const recordGeminiApiUsage = async (
  model: string,
  usageMetadata?: { totalTokenCount?: number; promptTokenCount?: number; candidatesTokenCount?: number }
): Promise<void> => {
  try {
    const db = await getDB();
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    const dateRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'gemini_usage_date'"
    );
    const isToday = dateRow?.value === today;

    let reqCount = 0;
    let tokenCount = 0;

    if (isToday) {
      const reqRow = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM app_settings WHERE key = 'gemini_usage_requests'"
      );
      const tokRow = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM app_settings WHERE key = 'gemini_usage_tokens'"
      );
      reqCount = parseInt(reqRow?.value || '0', 10) || 0;
      tokenCount = parseInt(tokRow?.value || '0', 10) || 0;
    }

    reqCount += 1;
    const addedTokens = usageMetadata?.totalTokenCount || 0;
    tokenCount += addedTokens;

    await db.runAsync(
      "INSERT INTO app_settings (key, value) VALUES ('gemini_usage_date', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      today
    );
    await db.runAsync(
      "INSERT INTO app_settings (key, value) VALUES ('gemini_usage_requests', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      String(reqCount)
    );
    await db.runAsync(
      "INSERT INTO app_settings (key, value) VALUES ('gemini_usage_tokens', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      String(tokenCount)
    );
    await db.runAsync(
      "INSERT INTO app_settings (key, value) VALUES ('gemini_usage_last_time', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      nowTime
    );
    await db.runAsync(
      "INSERT INTO app_settings (key, value) VALUES ('gemini_usage_last_tokens', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      String(addedTokens)
    );
    await db.runAsync(
      "INSERT INTO app_settings (key, value) VALUES ('gemini_usage_last_model', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      model
    );
  } catch (err) {
    console.warn('API kullanım istatistiği kaydedilemedi:', err);
  }
};

/**
 * Günlük ücretsiz kota ve token kalan durumunu hesaplar.
 */
export const getGeminiUsageStats = async (): Promise<GeminiUsageStats> => {
  const today = new Date().toISOString().split('T')[0];
  const model = await getGeminiModel();
  const isPro = model.toLowerCase().includes('pro');
  // Google AI Studio Free Tier limitleri: Flash: 1,500 RPD, Pro: 50 RPD
  const dailyRequestLimit = isPro ? 50 : 1500;

  try {
    const db = await getDB();
    const dateRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'gemini_usage_date'"
    );
    const isToday = dateRow?.value === today;

    if (!isToday) {
      return {
        date: today,
        requestsToday: 0,
        tokensToday: 0,
        lastRequestTime: '-',
        model,
        dailyRequestLimit,
        remainingRequests: dailyRequestLimit,
        remainingPercent: 100,
        lastTokensUsed: 0,
      };
    }

    const [reqRow, tokRow, timeRow, lastTokRow] = await Promise.all([
      db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'gemini_usage_requests'"),
      db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'gemini_usage_tokens'"),
      db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'gemini_usage_last_time'"),
      db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'gemini_usage_last_tokens'"),
    ]);

    const requestsToday = parseInt(reqRow?.value || '0', 10) || 0;
    const tokensToday = parseInt(tokRow?.value || '0', 10) || 0;
    const lastRequestTime = timeRow?.value || '-';
    const lastTokensUsed = parseInt(lastTokRow?.value || '0', 10) || 0;

    const remainingRequests = Math.max(0, dailyRequestLimit - requestsToday);
    const remainingPercent = Math.max(
      0,
      Math.min(100, Math.round(((dailyRequestLimit - requestsToday) / dailyRequestLimit) * 1000) / 10)
    );

    return {
      date: today,
      requestsToday,
      tokensToday,
      lastRequestTime,
      model,
      dailyRequestLimit,
      remainingRequests,
      remainingPercent,
      lastTokensUsed,
    };
  } catch (err) {
    console.warn('Gemini kullanım verisi okunamadı:', err);
    return {
      date: today,
      requestsToday: 0,
      tokensToday: 0,
      lastRequestTime: '-',
      model,
      dailyRequestLimit,
      remainingRequests: dailyRequestLimit,
      remainingPercent: 100,
      lastTokensUsed: 0,
    };
  }
};

/**
 * Gemini kullanım sayacını sıfırlar.
 */
export const resetGeminiUsageStats = async (): Promise<void> => {
  const db = await getDB();
  await db.runAsync("DELETE FROM app_settings WHERE key LIKE 'gemini_usage_%'");
};

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export interface GeminiModelInfo {
  id: string;
  name: string;
  description: string;
  isRecommended?: boolean;
}

export const PRESET_GEMINI_MODELS: GeminiModelInfo[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'En hızlı, güncel ve Google tarafından önerilen model (Ücretsiz kota)',
    isRecommended: true,
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    description: 'Yeni nesil yüksek performanslı multimodal model',
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    description: 'En son çıkan Flash modeli',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'Karmaşık el yazısı ve yoğun tablolar için gelişmiş model',
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    description: 'Klasik hafif model',
  },
];

/**
 * Seçili Gemini model adını SQLite app_settings tablosundan okur.
 */
export const getGeminiModel = async (): Promise<string> => {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'gemini_model'"
    );
    const model = (row?.value || '').trim();
    if (model) return model;
  } catch (e) {
    console.warn('Gemini model veritabanından okunamadı:', e);
  }
  return DEFAULT_GEMINI_MODEL;
};

/**
 * Gemini model tercihini SQLite app_settings tablosuna kaydeder.
 */
export const setGeminiModel = async (model: string): Promise<void> => {
  const db = await getDB();
  const trimmed = model.trim();
  if (trimmed) {
    await db.runAsync(
      "INSERT INTO app_settings (key, value) VALUES ('gemini_model', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      trimmed
    );
  } else {
    await db.runAsync("DELETE FROM app_settings WHERE key = 'gemini_model'");
  }
};

/**
 * Google Gemini API'sindeki aktif modelleri kullanıcının API anahtarıyla dinamik olarak çeker.
 */
export const fetchAvailableGeminiModels = async (
  apiKey: string
): Promise<string[]> => {
  const key = apiKey.trim();
  if (!key) return [];

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
    );
    if (!res.ok) {
      throw new Error(`Modeller alınamadı: HTTP ${res.status}`);
    }
    const data = await res.json();
    const modelsList: any[] = data?.models || [];
    const valid = modelsList
      .filter((m) => {
        const methods: string[] = m.supportedGenerationMethods || [];
        return (
          methods.includes('generateContent') &&
          typeof m.name === 'string' &&
          m.name.includes('gemini')
        );
      })
      .map((m) => m.name.replace(/^models\//, ''));

    return valid;
  } catch (err) {
    console.warn('Modeller listelenemedi:', err);
    return [];
  }
};

/**
 * Verilen API anahtarının geçerli olup olmadığını küçük bir ping isteğiyle test eder.
 */
export const testGeminiApiKey = async (
  apiKey: string,
  modelToTest?: string
): Promise<{ success: boolean; message: string; modelUsed?: string }> => {
  const key = apiKey.trim();
  if (!key) {
    return { success: false, message: 'API anahtarı boş olamaz.' };
  }

  const model = (modelToTest || (await getGeminiModel())).trim() || DEFAULT_GEMINI_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Ping. Sadece "OK" yanıtı ver.' }] }],
        generationConfig: { maxOutputTokens: 10 },
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const errMsg = errJson?.error?.message || `HTTP ${res.status} ${res.statusText}`;
      return { success: false, message: `${model} bağlantı hatası: ${errMsg}` };
    }

    const resJson = await res.json().catch(() => null);
    if (resJson?.usageMetadata) {
      await recordGeminiApiUsage(model, resJson.usageMetadata);
    }

    return {
      success: true,
      message: `Google Gemini (${model}) bağlantısı başarılı! ✅`,
      modelUsed: model,
    };
  } catch (err: any) {
    return { success: false, message: `Ağ hatası: ${err?.message || err}` };
  }
};

/**
 * Şube adını normalize eder (örn: "11/A" -> "11-A", "11A" -> "11-A")
 */
export const normalizeClassName = (raw: string): string => {
  let name = (raw || '').trim().toUpperCase();
  // "11/A" -> "11-A"
  name = name.replace(/[\/\.]/g, '-');
  // "11A" -> "11-A"
  const match = name.match(/^(\d{1,2})\s*([A-ZÇĞİÖŞÜ])$/);
  if (match) {
    name = `${match[1]}-${match[2]}`;
  }
  return name;
};

/**
 * Görsel dosyasının base64 verisini okur ve mime tipini belirler.
 */
const prepareImageBase64 = async (
  uri: string
): Promise<{ base64: string; mimeType: string }> => {
  const cleanUri = uri.split('?')[0].toLowerCase();
  let mimeType = 'image/jpeg';
  if (cleanUri.endsWith('.png')) {
    mimeType = 'image/png';
  } else if (cleanUri.endsWith('.webp')) {
    mimeType = 'image/webp';
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });

  return { base64, mimeType };
};

const SYSTEM_PROMPT = `Sen Türkiye Milli Eğitim Bakanlığı (MEB) okulları için uzman bir ders programı analiz asistanısın.
Sana verilen fotoğrafta bir öğretmenin haftalık ders programı veya okul ders dağıtım tablosu bulunmaktadır.

Görevin:
1. Görseldeki tabloyu satır ve sütun bazında dikkatle incele.
2. Günleri tespit et:
   - Pazartesi: 1
   - Salı: 2
   - Çarşamba: 3
   - Perşembe: 4
   - Cuma: 5
   - Cumartesi: 6
   - Pazar: 7
3. Ders saatlerini (slot numaralarını) tespit et: 1, 2, 3, 4, 5, 6, 7, 8 vb. (1. ders = 1, 2. ders = 2...)
   Eğer tabloda veya tablonun başlığında/sol sütununda her bir ders saatinin başlangıç ve bitiş zamanları yazıyorsa (Örn: 08:30 - 09:10, 09:25 - 10:05), bunları "slotTimes" listesi altında saat formatında (HH:mm) topla.
4. Hücrelerdeki şube adlarını (örn. 11-A, 11/A, 12-D, 9-B) ve ders adlarını/kodlarını (örn. S.FZK, Fizik, HDTE2, REH, Kimya, MAT vb.) tespit et.
5. Şube isimlerini "11-A", "12-D" gibi araya tire koyarak standartlaştır.
6. Eğer dersin kodu (örn: S.FZK) ve adı (örn: Seçmeli Fizik) varsa her ikisini de doldur. Sadece biri biliniyorsa ikisine de aynı değeri koyabilirsin.
7. Eğer bir saatte ders yoksa, boşluk veya öğle arası ise o saati kesinlikle LİSTEYE DAHİL ETME. Sadece aktif dersleri ekle.
8. Yanıtını aşağıdaki JSON şemasına uygun tek bir JSON objesi olarak döndür. Başka hiçbir açıklama, markdown veya metin ekleme.

JSON Şeması:
{
  "slotTimes": [
    { "slotNumber": 1, "startTime": "08:30", "endTime": "09:10", "slotName": "1. Ders" },
    { "slotNumber": 2, "startTime": "09:25", "endTime": "10:05", "slotName": "2. Ders" }
  ],
  "lessons": [
    {
      "day": 1,
      "slotNumber": 1,
      "className": "12-D",
      "courseCode": "HDTE2",
      "courseName": "Hedef Temelli Destek Eğitimi 2",
      "classroom": "Derslik"
    }
  ]
}`;

/**
 * Ders programı fotoğrafını Google Gemini Vision modeline göndererek
 * gün, saat, şube ve ders dağılımını ayrıştırır.
 */
export const analyzeSchedulePhotoWithGemini = async (
  photoUri: string,
  providedApiKey?: string
): Promise<AnalysisResponse> => {
  const apiKey = (providedApiKey || (await getGeminiApiKey())).trim();

  if (!apiKey) {
    throw new Error(
      'Gemini API anahtarı bulunamadı. Lütfen "Yapay Zeka Ayarları" bölümünden ücretsiz Google Gemini API anahtarınızı giriniz.'
    );
  }

  // 1. Görseli Base64 olarak oku
  const { base64, mimeType } = await prepareImageBase64(photoUri);

  // 2. Modelleri dene (Kullanıcının seçtiği model önce, sonra güncel alternatifler)
  const selectedModel = await getGeminiModel();
  const candidateModels = [
    selectedModel,
    'gemini-2.5-flash',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-1.5-flash',
  ];
  const modelsToTry = Array.from(new Set(candidateModels.filter(Boolean)));
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const requestBody = {
        contents: [
          {
            parts: [
              { text: SYSTEM_PROMPT },
              {
                inlineData: {
                  mimeType,
                  data: base64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errMsg = errorData?.error?.message || `HTTP ${response.status} ${response.statusText}`;
        throw new Error(`${model} API hatası: ${errMsg}`);
      }

      const responseData = await response.json();
      if (responseData?.usageMetadata) {
        await recordGeminiApiUsage(model, responseData.usageMetadata);
      }
      const rawText =
        responseData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!rawText.trim()) {
        throw new Error('Yapay zeka görselden metin/tablo üretemedi.');
      }

      // JSON'ı temizle ve parse et (Markdown codeblock varsa temizle)
      let cleanedJson = rawText.trim();
      if (cleanedJson.startsWith('```')) {
        cleanedJson = cleanedJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleanedJson);
      let rawList: any[] = [];
      let rawSlotTimes: any[] = [];

      if (Array.isArray(parsed)) {
        rawList = parsed;
      } else {
        rawList = Array.isArray(parsed.lessons) ? parsed.lessons : [];
        rawSlotTimes = Array.isArray(parsed.slotTimes)
          ? parsed.slotTimes
          : Array.isArray(parsed.slot_times)
          ? parsed.slot_times
          : [];
      }

      // Slot saat dilimleri ayrıştırma
      const detectedSlotTimes: AnalyzedSlotTime[] = [];
      for (const st of rawSlotTimes) {
        const slotNumber = Number(st.slotNumber || st.slot_number || st.slot);
        let startTime = String(st.startTime || st.start_time || st.start || '').trim();
        let endTime = String(st.endTime || st.end_time || st.end || '').trim();
        const slotName = String(st.slotName || st.slot_name || `${slotNumber}. Ders`).trim();

        // Saat formatı düzenleme ("8:30" -> "08:30", "0830" -> "08:30")
        if (startTime && !startTime.includes(':') && startTime.length === 4) {
          startTime = `${startTime.slice(0, 2)}:${startTime.slice(2)}`;
        }
        if (endTime && !endTime.includes(':') && endTime.length === 4) {
          endTime = `${endTime.slice(0, 2)}:${endTime.slice(2)}`;
        }
        if (startTime.length === 4 && startTime[1] === ':') {
          startTime = `0${startTime}`;
        }
        if (endTime.length === 4 && endTime[1] === ':') {
          endTime = `0${endTime}`;
        }

        if (slotNumber >= 1 && startTime && endTime) {
          detectedSlotTimes.push({
            slotNumber,
            startTime,
            endTime,
            slotName,
          });
        }
      }

      // Validasyon ve filtreleme
      const lessons: AnalyzedLessonItem[] = [];
      for (const item of rawList) {
        const day = Number(item.day);
        const slotNumber = Number(item.slotNumber || item.slot_number || item.slot);
        const className = normalizeClassName(String(item.className || item.class_name || ''));
        const courseCode = String(item.courseCode || item.course_code || '').trim();
        const courseName = String(
          item.courseName || item.course_name || courseCode || 'Ders'
        ).trim();
        const classroom = item.classroom ? String(item.classroom).trim() : undefined;

        if (day >= 1 && day <= 7 && slotNumber >= 1 && className) {
          lessons.push({
            day,
            slotNumber,
            className,
            courseCode: courseCode || courseName,
            courseName: courseName || courseCode,
            classroom,
          });
        }
      }

      if (lessons.length === 0) {
        throw new Error('Görselde herhangi bir ders saati veya şube tablosu tespit edilemedi.');
      }

      // Gün ve slot numarasına göre sırala
      lessons.sort((a, b) => {
        if (a.day !== b.day) return a.day - b.day;
        return a.slotNumber - b.slotNumber;
      });

      return {
        success: true,
        lessons,
        detectedSlotTimes,
        modelUsed: model,
        rawResponse: rawText,
      };
    } catch (err: any) {
      lastError = err;
      console.warn(`${model} denemesi başarısız:`, err?.message || err);
    }
  }

  throw lastError || new Error('Görsel analiz edilemedi.');
};

/**
 * Yıllık plan Excel dosyasındaki ham satırları Google Gemini ile analiz edip
 * uygulamanın yıllık plan formatına (hafta no, başlangıç/bitiş tarihi, ders saati, konu, kazanım) dönüştürür.
 */
export const adaptYearlyPlanExcelWithGemini = async (
  rawRows: any[][],
  weeklyHours: number = 4,
  providedApiKey?: string
): Promise<ParsedYearlyPlanRow[]> => {
  const apiKey = (providedApiKey || (await getGeminiApiKey())).trim();

  if (!apiKey) {
    throw new Error(
      'Gemini API anahtarı bulunamadı. Lütfen "İşlemler > Yapay Zeka Ayarları" menüsünden Google Gemini API anahtarınızı giriniz.'
    );
  }

  // 1. Ham satırları sıkıştır (tamamen boş satırları ve gereksiz uzunlukları temizle)
  const cleanedRows: string[][] = [];
  for (const row of rawRows) {
    if (!row || !Array.isArray(row) || row.length === 0) continue;
    const cleanCells = row
      .map((c) => (c !== null && c !== undefined ? String(c).trim() : ''))
      .filter(Boolean);
    if (cleanCells.length === 0) continue;

    // Satırı string dizisi olarak sakla (fazla uzun hücreleri 250 karakter ile sınırla)
    cleanedRows.push(
      row.map((c) => {
        const str = c !== null && c !== undefined ? String(c).trim() : '';
        return str.length > 250 ? str.substring(0, 250) + '...' : str;
      })
    );
  }

  if (cleanedRows.length < 2) {
    throw new Error('Excel dosyasında analiz edilecek yeterli veri bulunamadı.');
  }

  // Gemini'ye göndermek için satırları kompakt JSON olarak hazırla (ilk 90 satır genellikle tüm yıllık planı kapsar)
  const rowsPayload = JSON.stringify(cleanedRows.slice(0, 90));

  const planPrompt = `Sen Türkiye MEB okulları için yıllık müfredat planı analizi ve dönüştürme uzmanısın.
Ekte bir öğretmenin veya okulun farklı sütun ve hücre düzeninde hazırlanmış yıllık plan Excel tablosunun ham satırları JSON array formatında verilmiştir:

${rowsPayload}

Bu ders için haftalık toplam ders saati: ${weeklyHours} saattir.

GÖREVLERİN:
1. Tablodaki başlık satırını ve sütun anlamlarını tespit et (Örn: Ay/Hafta, Tarih aralığı, Saat, Konu/Ünite/Etkinlik, Kazanımlar/Açıklamalar).
2. Tablodaki her bir eğitim haftasını (1. Hafta, 2. Hafta ... 36 veya 40. Hafta) ve deftere yazılacak konuları çıkar.
3. "Deftere yazılacak konu" alanını (subjectTopic) bürokratik kodlardan (örn: FİZ.10.1.2 gibi), uzun paragraf karmaşasından ve gereksiz satır başlarından temizle; öğretmenin sınıf defterine yazacağı sade, net ve anlaşılır konu başlığı yap.
4. Tarihleri tespit edebiliyorsan YYYY-AA-GG (örneğin 2024-09-09) formatına dönüştür. Tarih yoksa boş string ("") yap.
5. Her bir konunun ders saatini (lessonHours) belirle. Eğer tabloda belirtilmemişse haftalık ders saati olan ${weeklyHours} değerini kullan.
6. Eğer bir haftada birden fazla konu alt alta geliyorsa hepsini aynı hafta numarası (weekNumber) ile ayrı elemanlar olarak ekleyebilirsin.
7. Yanıtını SADECE geçerli bir JSON array olarak döndür. Başka hiçbir açıklama veya markdown ekleme.

JSON Şeması:
[
  {
    "weekNumber": 1,
    "dateStart": "2024-09-09",
    "dateEnd": "2024-09-13",
    "lessonHours": ${weeklyHours},
    "subjectTopic": "Fizik Bilimine Giriş",
    "learningOutcomes": "Fizik biliminin alt alanlarını açıklar."
  }
]`;

  const selectedModel = await getGeminiModel();
  const candidateModels = [
    selectedModel,
    'gemini-2.5-flash',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-1.5-flash',
  ];
  const modelsToTry = Array.from(new Set(candidateModels.filter(Boolean)));
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const requestBody = {
        contents: [
          {
            parts: [{ text: planPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errMsg = errorData?.error?.message || `HTTP ${response.status} ${response.statusText}`;
        throw new Error(`${model} API hatası: ${errMsg}`);
      }

      const responseData = await response.json();
      if (responseData?.usageMetadata) {
        await recordGeminiApiUsage(model, responseData.usageMetadata);
      }
      const rawText =
        responseData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!rawText.trim()) {
        throw new Error('Yapay zeka tablodan veri üretemedi.');
      }

      let cleanedJson = rawText.trim();
      if (cleanedJson.startsWith('```')) {
        cleanedJson = cleanedJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleanedJson);
      const rawList: any[] = Array.isArray(parsed) ? parsed : parsed.plan || parsed.rows || [];

      const result: ParsedYearlyPlanRow[] = [];
      let autoWeek = 1;

      for (const item of rawList) {
        const weekNumber = Number(item.weekNumber || item.week || autoWeek) || autoWeek;
        const subjectTopic = String(item.subjectTopic || item.topic || item.konu || '').trim();
        if (!subjectTopic) continue;

        const dateStart = String(item.dateStart || item.startDate || '').trim();
        const dateEnd = String(item.dateEnd || item.endDate || '').trim();
        const lessonHours = Number(item.lessonHours || item.hours || weeklyHours) || weeklyHours;
        const learningOutcomes = String(item.learningOutcomes || item.outcomes || item.kazanim || '').trim();

        result.push({
          weekNumber,
          dateStart,
          dateEnd,
          lessonHours,
          subjectTopic,
          learningOutcomes,
        });

        autoWeek = Math.max(autoWeek, weekNumber);
      }

      if (result.length === 0) {
        throw new Error('Excel dosyasından herhangi bir haftalık konu veya plan çıkarılamadı.');
      }

      return result;
    } catch (err: any) {
      lastError = err;
      console.warn(`${model} yıllık plan denemesi başarısız:`, err?.message || err);
    }
  }

  throw lastError || new Error('Yıllık plan yapay zeka ile dönüştürülemedi.');
};

export interface DetectedStudentExcelSchema {
  headerRowIndex: number;
  classNameCol: number;
  gradeLevelCol: number;
  studentNumberCol: number;
  firstNameCol: number;
  lastNameCol: number;
  fullNameCol: number;
  notesCol: number;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Excel öğrenci listesinin ilk satırlarını Gemini ile inceleyip
 * şube, numara, ad, soyad vb. sütun indekslerini akıllıca tespit eder.
 */
export const detectStudentExcelSchemaWithGemini = async (
  sampleRows: any[][],
  providedApiKey?: string
): Promise<DetectedStudentExcelSchema | null> => {
  const apiKey = (providedApiKey || (await getGeminiApiKey())).trim();
  if (!apiKey) return null;

  // İlk 15 satırı kompakt JSON'a dönüştür
  const cleaned: string[][] = [];
  for (const r of sampleRows.slice(0, 15)) {
    if (!Array.isArray(r)) continue;
    const cleanCells = r.map((c) => {
      const str = c !== null && c !== undefined ? String(c).trim() : '';
      return str.length > 50 ? str.slice(0, 50) : str;
    });
    if (cleanCells.some(Boolean)) {
      cleaned.push(cleanCells);
    }
  }

  if (cleaned.length < 2) return null;

  const prompt = `Sen MEB okulları ve e-Okul Excel öğrenci listesi analiz uzmanısın.
Aşağıda bir okulun veya öğretmenin öğrenci listesi Excel dosyasından alınmış ilk satırlar JSON dizisi olarak verilmiştir:

${JSON.stringify(cleaned)}

GÖREVLERİN:
1. Başlık satırının indeksini (0 tabanlı: 0, 1, 2...) bul ("headerRowIndex").
2. Öğrencinin şube/sınıf adının (örn: "11-A", "12/B", "10A", "9-C") bulunduğu sütunun indeksini bul ("classNameCol").
3. Sınıf düzeyi (9, 10, 11, 12 vb.) ayrı bir sütundaysa indeksini bul ("gradeLevelCol"), ayrı değilse -1 yap.
4. Okul numarasının (örn: 105, 342, 1284) bulunduğu sütun indeksini bul ("studentNumberCol").
5. Öğrenci ad ve soyadını tespit et:
   - Ad ve soyad ayrı sütunlardaysa "firstNameCol" ve "lastNameCol" indekslerini ver, "fullNameCol" -1 olsun.
   - Adı ve soyadı tek bir sütunda birleşmişse (örn: "Ahmet YILMAZ") "fullNameCol" indeksini ver, "firstNameCol" ve "lastNameCol" -1 olsun.
6. Varsa not/açıklama sütunu indeksini ("notesCol"), yoksa -1 yap.
7. Analiz güven derecesini "high", "medium" veya "low" olarak belirt.
8. Yanıtını YALNIZCA aşağıdaki JSON formatında ver, başka hiçbir metin veya markdown ekleme:

{
  "headerRowIndex": 0,
  "classNameCol": 1,
  "gradeLevelCol": -1,
  "studentNumberCol": 2,
  "firstNameCol": 3,
  "lastNameCol": 4,
  "fullNameCol": -1,
  "notesCol": -1,
  "confidence": "high"
}`;

  const selectedModel = await getGeminiModel();
  const candidateModels = [
    selectedModel,
    'gemini-2.5-flash',
    'gemini-3.5-flash',
    'gemini-1.5-flash',
  ];
  const modelsToTry = Array.from(new Set(candidateModels.filter(Boolean)));

  for (const model of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!res.ok) continue;

      const resData = await res.json();
      if (resData?.usageMetadata) {
        await recordGeminiApiUsage(model, resData.usageMetadata);
      }

      const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      let cleanedJson = rawText.trim();
      if (cleanedJson.startsWith('```')) {
        cleanedJson = cleanedJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleanedJson);
      if (
        typeof parsed.headerRowIndex === 'number' &&
        typeof parsed.classNameCol === 'number' &&
        typeof parsed.studentNumberCol === 'number'
      ) {
        return {
          headerRowIndex: Number(parsed.headerRowIndex),
          classNameCol: Number(parsed.classNameCol),
          gradeLevelCol: Number(parsed.gradeLevelCol ?? -1),
          studentNumberCol: Number(parsed.studentNumberCol),
          firstNameCol: Number(parsed.firstNameCol ?? -1),
          lastNameCol: Number(parsed.lastNameCol ?? -1),
          fullNameCol: Number(parsed.fullNameCol ?? -1),
          notesCol: Number(parsed.notesCol ?? -1),
          confidence: parsed.confidence || 'high',
        };
      }
    } catch (e) {
      console.warn(`detectStudentExcelSchemaWithGemini ${model} hatası:`, e);
    }
  }

  return null;
};
