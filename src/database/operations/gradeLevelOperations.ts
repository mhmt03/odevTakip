import { getDB } from '../db';
import { GradeLevelItem } from '../../types';

export const DEFAULT_GRADE_LEVELS: GradeLevelItem[] = [
  { level: 9, label: '9. Sınıf' },
  { level: 10, label: '10. Sınıf' },
  { level: 11, label: '11. Sınıf' },
  { level: 12, label: '12. Sınıf' },
];

/**
 * Kayıtlı sınıf düzeylerini getirir. Ayarlarda henüz kayıt yoksa varsayılan olarak 9, 10, 11, 12 döner.
 */
export const getGradeLevels = async (): Promise<GradeLevelItem[]> => {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'grade_levels'"
    );
    if (!row || !row.value) {
      return DEFAULT_GRADE_LEVELS;
    }
    const parsed = JSON.parse(row.value);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.sort((a, b) => a.level - b.level);
    }
  } catch (e) {
    console.error('Error fetching grade levels from app_settings:', e);
  }
  return DEFAULT_GRADE_LEVELS;
};

/**
 * Sınıf düzeyleri listesini veritabanına kaydeder.
 */
export const saveGradeLevels = async (levels: GradeLevelItem[]): Promise<void> => {
  const db = await getDB();
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  await db.runAsync(
    "INSERT INTO app_settings (key, value) VALUES ('grade_levels', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    JSON.stringify(sorted)
  );
};

/**
 * Yeni bir sınıf düzeyi ekler veya var olanı günceller.
 */
export const addGradeLevel = async (level: number, label?: string): Promise<GradeLevelItem[]> => {
  const current = await getGradeLevels();
  const trimmedLabel = label?.trim() || `${level}. Sınıf`;
  const existingIndex = current.findIndex((g) => g.level === level);
  let updated: GradeLevelItem[];
  if (existingIndex >= 0) {
    updated = [...current];
    updated[existingIndex] = { level, label: trimmedLabel };
  } else {
    updated = [...current, { level, label: trimmedLabel }];
  }
  await saveGradeLevels(updated);
  return updated.sort((a, b) => a.level - b.level);
};

/**
 * Mevcut bir sınıf düzeyini günceller (numara veya etiket).
 */
export const updateGradeLevel = async (
  oldLevel: number,
  newLevel: number,
  newLabel?: string
): Promise<GradeLevelItem[]> => {
  const current = await getGradeLevels();
  const trimmedLabel = newLabel?.trim() || `${newLevel}. Sınıf`;
  const updated = current
    .filter((g) => g.level !== oldLevel)
    .concat({ level: newLevel, label: trimmedLabel })
    .sort((a, b) => a.level - b.level);
  await saveGradeLevels(updated);
  return updated;
};

/**
 * Bir sınıf düzeyini siler.
 */
export const deleteGradeLevel = async (level: number): Promise<GradeLevelItem[]> => {
  const current = await getGradeLevels();
  const updated = current.filter((g) => g.level !== level);
  await saveGradeLevels(updated);
  return updated;
};

/**
 * Hızlı şablon yükler (Lise, Ortaokul, İlkokul veya Tümü).
 */
export const setGradeLevelsPreset = async (
  preset: 'high' | 'middle' | 'primary' | 'all'
): Promise<GradeLevelItem[]> => {
  let presetLevels: GradeLevelItem[];
  switch (preset) {
    case 'high':
      presetLevels = [
        { level: 9, label: '9. Sınıf' },
        { level: 10, label: '10. Sınıf' },
        { level: 11, label: '11. Sınıf' },
        { level: 12, label: '12. Sınıf' },
      ];
      break;
    case 'middle':
      presetLevels = [
        { level: 5, label: '5. Sınıf' },
        { level: 6, label: '6. Sınıf' },
        { level: 7, label: '7. Sınıf' },
        { level: 8, label: '8. Sınıf' },
      ];
      break;
    case 'primary':
      presetLevels = [
        { level: 1, label: '1. Sınıf' },
        { level: 2, label: '2. Sınıf' },
        { level: 3, label: '3. Sınıf' },
        { level: 4, label: '4. Sınıf' },
      ];
      break;
    case 'all':
      presetLevels = Array.from({ length: 12 }, (_, i) => ({
        level: i + 1,
        label: `${i + 1}. Sınıf`,
      }));
      break;
  }
  await saveGradeLevels(presetLevels);
  return presetLevels;
};
