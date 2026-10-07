import { Alert } from 'react-native';
import { getGradeLevels } from '../database/operations/gradeLevelOperations';
import { getClasses } from '../database/operations/classOperations';

/**
 * Yıllık plan veya ders programı yüklemeden önce sınıf düzeyi ve şube
 * tanımlarının mevcut olduğunu doğrular. Eksik varsa uyarı gösterir ve
 * false döner; çağıran taraf işlemi iptal etmelidir.
 */
export const ensureGradesAndClassesDefined = async (actionName: string): Promise<boolean> => {
  try {
    const [levels, classes] = await Promise.all([getGradeLevels(), getClasses()]);
    const missing: string[] = [];
    if (levels.length === 0) {
      missing.push('• Sınıf düzeyi (Program > Tanımlamalar > Düzeyler)');
    }
    if (classes.length === 0) {
      missing.push('• Şube (Şubeler sekmesi)');
    }
    if (missing.length === 0) return true;

    Alert.alert(
      'Eksik Tanımlamalar',
      `${actionName} yapılamıyor. Verilerin düzgün kaydedilebilmesi için önce şunları tanımlayınız:\n\n${missing.join('\n')}`,
      [{ text: 'Tamam' }]
    );
    return false;
  } catch (e) {
    Alert.alert('Hata', 'Tanımlamalar kontrol edilemedi, işlem iptal edildi.');
    return false;
  }
};
