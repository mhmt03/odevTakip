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

export interface AnalysisResponse {
  success: boolean;
  lessons: AnalyzedLessonItem[];
  modelUsed: string;
  notes?: string;
  rawResponse?: string;
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
4. Hücrelerdeki şube adlarını (örn. 11-A, 11/A, 12-D, 9-B) ve ders adlarını/kodlarını (örn. S.FZK, Fizik, HDTE2, REH, Kimya, MAT vb.) tespit et.
5. Şube isimlerini "11-A", "12-D" gibi araya tire koyarak standartlaştır.
6. Eğer dersin kodu (örn: S.FZK) ve adı (örn: Seçmeli Fizik) varsa her ikisini de doldur. Sadece biri biliniyorsa ikisine de aynı değeri koyabilirsin.
7. Eğer bir saatte ders yoksa, boşluk veya öğle arası ise o saati kesinlikle LİSTEYE DAHİL ETME. Sadece aktif dersleri ekle.
8. Yanıtını SADECE geçerli bir JSON array olarak döndür. Başka hiçbir açıklama, markdown veya metin ekleme.

JSON Şeması:
[
  {
    "day": 1,
    "slotNumber": 1,
    "className": "12-D",
    "courseCode": "HDTE2",
    "courseName": "Hedef Temelli Destek Eğitimi 2",
    "classroom": "Derslik" // Varsa opsiyonel
  }
]`;

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
      const rawList: any[] = Array.isArray(parsed) ? parsed : parsed.lessons || [];

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
