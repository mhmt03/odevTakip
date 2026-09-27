import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Colors, Shadows } from '../theme/colors';
import { Card } from '../components/Card';
import { getClasses } from '../database/operations/classOperations';
import { getStudentsByClass } from '../database/operations/studentOperations';
import { getAssignments, getAssignmentStudents } from '../database/operations/assignmentOperations';
import { getAllNotes } from '../database/operations/noteOperations';
import { getLessonSlots, getWeeklySchedule } from '../database/operations/scheduleOperations';
import {
  generateStudentTemplateExcel,
  exportStudentNotesToExcel,
  exportScheduleToExcel,
  pickAndParseStudentsExcel,
  validateBulkStudentImport,
} from '../utils/excelService';
import { bulkCreateStudentsMultipleClasses } from '../database/operations/studentOperations';
import { formatDateToTR, DAYS_OF_WEEK } from '../utils/dateUtils';

export const ReportsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);

  // 1. Export all classes and their students in a multi-sheet workbook
  const handleExportAllClasses = async () => {
    try {
      setLoading(true);
      const classes = await getClasses();
      if (classes.length === 0) {
        Alert.alert('Bilgi', 'Kayıtlı şube bulunmuyor.');
        return;
      }

      const workbook = XLSX.utils.book_new();

      // Summary sheet
      const summaryRows: (string | number)[][] = [
        ['OKUL ŞUBELERİ VE ÖĞRENCİ ÖZETİ'],
        [`Rapor Tarihi: ${formatDateToTR(new Date().toISOString().split('T')[0])}`],
        [],
        ['Sıra', 'Şube Adı', 'Açıklama', 'Öğrenci Sayısı'],
      ];
      classes.forEach((c, idx) => {
        summaryRows.push([idx + 1, c.name, c.description || '-', c.student_count || 0]);
      });
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Şube Özeti');

      // Individual class sheets
      for (const c of classes) {
        const studs = await getStudentsByClass(c.id);
        const rows: (string | number)[][] = [
          [`Şube: ${c.name}`],
          [],
          ['Sıra', 'Öğrenci No', 'Adı', 'Soyadı', 'Notlar'],
        ];
        studs.forEach((s, idx) => {
          rows.push([idx + 1, s.student_number || '-', s.first_name, s.last_name || '', s.notes || '']);
        });
        const sheet = XLSX.utils.aoa_to_sheet(rows);
        const safeSheetName = c.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 31);
        XLSX.utils.book_append_sheet(workbook, sheet, safeSheetName);
      }

      const excelBuffer = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      const filePath = `${dir}Tum_Subeler_Ogrenci_Listeleri.xlsx`;
      await FileSystem.writeAsStringAsync(filePath, excelBuffer, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Sharing.shareAsync(filePath, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Şubeler Raporunu Paylaş',
      });
    } catch (e) {
      Alert.alert('Hata', 'Rapor oluşturulamadı.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Export All Homeworks
  const handleExportAllAssignments = async () => {
    try {
      setLoading(true);
      const assignments = await getAssignments();
      if (assignments.length === 0) {
        Alert.alert('Bilgi', 'Kayıtlı ödev bulunmuyor.');
        return;
      }

      const workbook = XLSX.utils.book_new();

      // Summary sheet
      const summaryRows: (string | number)[][] = [
        ['GENEL ÖDEV TAKİP RAPORU'],
        [`Rapor Tarihi: ${formatDateToTR(new Date().toISOString().split('T')[0])}`],
        [],
        ['Sıra', 'Şube', 'Ödev Konusu', 'Verilme', 'Teslim', 'Toplam', 'Yapıldı', 'Yapılmadı', 'Bekliyor'],
      ];

      assignments.forEach((a, idx) => {
        summaryRows.push([
          idx + 1,
          a.class_name || '-',
          a.title,
          formatDateToTR(a.assigned_date),
          formatDateToTR(a.due_date),
          a.total_students || 0,
          a.completed_count || 0,
          a.missing_count || 0,
          a.pending_count || 0,
        ]);
      });

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ödev Özeti');

      const excelBuffer = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      const filePath = `${dir}Genel_Odev_Takip_Raporu.xlsx`;
      await FileSystem.writeAsStringAsync(filePath, excelBuffer, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Sharing.shareAsync(filePath, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Ödev Raporunu Paylaş',
      });
    } catch (e) {
      Alert.alert('Hata', 'Ödev raporu oluşturulamadı.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Export all student observations
  const handleExportAllNotes = async () => {
    try {
      setLoading(true);
      const notes = await getAllNotes();
      if (notes.length === 0) {
        Alert.alert('Bilgi', 'Kayıtlı öğrenci görüşü bulunmuyor.');
        return;
      }
      await exportStudentNotesToExcel(notes);
    } catch (e) {
      Alert.alert('Hata', 'Görüş raporu oluşturulamadı.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Export Weekly Schedule
  const handleExportSchedule = async () => {
    try {
      setLoading(true);
      const slots = await getLessonSlots();
      const schedule = await getWeeklySchedule();
      await exportScheduleToExcel(slots, schedule);
    } catch (e) {
      Alert.alert('Hata', 'Ders programı oluşturulamadı.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Download Sample Template (Multi-sheet with registered classes)
  const handleDownloadTemplate = async () => {
    try {
      setLoading(true);
      await generateStudentTemplateExcel();
    } catch (e: any) {
      Alert.alert('Hata', 'Şablon dosyası oluşturulamadı: ' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  // 6. Bulk Import Students to All Classes
  const handleBulkImportStudents = async () => {
    try {
      setLoading(true);
      const parsed = await pickAndParseStudentsExcel();
      if (parsed.length === 0) {
        setLoading(false);
        return;
      }

      const classes = await getClasses();
      if (classes.length === 0) {
        setLoading(false);
        Alert.alert(
          'Kayıtlı Şube Yok',
          'Sistemde henüz kayıtlı şube bulunmamaktadır. Lütfen önce "Şubeler" ekranından şubelerinizi oluşturunuz.'
        );
        return;
      }

      const val = validateBulkStudentImport(parsed, classes);

      if (val.validCount === 0) {
        setLoading(false);
        let errorMsg = 'Excel dosyasındaki şube adları sistemdeki şubelerle eşleşmedi.';
        if (val.unmatchedClasses.length > 0) {
          errorMsg += '\n\nBulunamayan Şubeler:\n' + val.unmatchedClasses.map((u) => `• ${u.rawClassName}`).join('\n');
        }
        errorMsg += '\n\nLütfen şablondaki "Kayıtlı Şubeler" sayfasındaki isimleri birebir aynı şekilde kullanınız.';
        Alert.alert('Geçersiz Şube Girişi', errorMsg);
        return;
      }

      let message = `Toplam ${val.totalStudents} öğrenci tespit edildi.\n\nEşleşen Şubeler:\n` +
        val.validPayloads.map((p) => `• ${p.className}: ${p.students.length} öğrenci`).join('\n');

      if (val.unmatchedClasses.length > 0) {
        message += '\n\n⚠️ Bulunamayan ve Atlanacak Şubeler:\n' +
          val.unmatchedClasses.map((u) => `• ${u.rawClassName}: ${u.count} öğrenci`).join('\n');
      }

      Alert.alert(
        'Toplu Öğrenci Yükleme',
        message + `\n\n${val.validCount} öğrenci sisteme kaydedilsin mi?`,
        [
          { text: 'Vazgeç', style: 'cancel', onPress: () => setLoading(false) },
          {
            text: 'Onayla ve Yükle',
            onPress: async () => {
              try {
                const res = await bulkCreateStudentsMultipleClasses(val.validPayloads);
                Alert.alert(
                  'Başarılı',
                  `Toplam ${res.totalAdded} öğrenci şubelerine başarıyla eklendi!`
                );
              } catch (e: any) {
                Alert.alert('Hata', 'Yükleme sırasında hata oluştu: ' + (e?.message || e));
              } finally {
                setLoading(false);
              }
            },
          },
        ]
      );
    } catch (e: any) {
      setLoading(false);
      Alert.alert('Hata', e?.message || 'Excel dosyası okunamadı.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Raporlama ve Excel Merkezi</Text>
        <Text style={styles.headerSub}>
          Tüm verilerinizi tek tıkla Excel (.xlsx) formatında dışa aktarın ve paylaşın
        </Text>
      </View>

      {loading && (
        <View style={styles.loadingBanner}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.loadingText}>Excel dosyası hazırlanıyor...</Text>
        </View>
      )}

      {/* Report Cards Grid */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleExportAllClasses}
        disabled={loading}
      >
        <Card style={styles.reportCard}>
          <View style={styles.cardRow}>
            <View style={[styles.iconWrap, { backgroundColor: Colors.primaryLight }]}>
              <Ionicons name="people" size={26} color={Colors.primary} />
            </View>
            <View style={styles.cardTextWrap}>
              <Text style={styles.reportTitle}>Tüm Şubeler & Öğrenci Listeleri</Text>
              <Text style={styles.reportDesc}>
                Her şubenin ayrı sayfada yer aldığı kapsamlı öğrenci listesi Excel kitabı.
              </Text>
            </View>
            <Ionicons name="download-outline" size={22} color={Colors.primary} />
          </View>
        </Card>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleExportAllAssignments}
        disabled={loading}
      >
        <Card style={styles.reportCard}>
          <View style={styles.cardRow}>
            <View style={[styles.iconWrap, { backgroundColor: Colors.warningLight }]}>
              <Ionicons name="document-text" size={26} color={Colors.warningDark} />
            </View>
            <View style={styles.cardTextWrap}>
              <Text style={styles.reportTitle}>Ödev Takip & Sonuç Raporu</Text>
              <Text style={styles.reportDesc}>
                Verilen tüm ödevlerin teslim oranları, yapıldı/yapılmadı istatistikleri.
              </Text>
            </View>
            <Ionicons name="download-outline" size={22} color={Colors.warningDark} />
          </View>
        </Card>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleExportAllNotes}
        disabled={loading}
      >
        <Card style={styles.reportCard}>
          <View style={styles.cardRow}>
            <View style={[styles.iconWrap, { backgroundColor: Colors.secondaryLight }]}>
              <Ionicons name="chatbubbles" size={26} color={Colors.secondary} />
            </View>
            <View style={styles.cardTextWrap}>
              <Text style={styles.reportTitle}>Öğrenci Görüş & Değerlendirme Raporu</Text>
              <Text style={styles.reportDesc}>
                Öğrenciler hakkında tarih ve saat bilgisiyle tutulan tüm gözlem notları.
              </Text>
            </View>
            <Ionicons name="download-outline" size={22} color={Colors.secondary} />
          </View>
        </Card>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleExportSchedule}
        disabled={loading}
      >
        <Card style={styles.reportCard}>
          <View style={styles.cardRow}>
            <View style={[styles.iconWrap, { backgroundColor: Colors.successLight }]}>
              <Ionicons name="calendar" size={26} color={Colors.successDark} />
            </View>
            <View style={styles.cardTextWrap}>
              <Text style={styles.reportTitle}>Haftalık Ders Programı Çizelgesi</Text>
              <Text style={styles.reportDesc}>
                Pazartesi-Cuma haftalık ders saatleri ve şube dağılım matrisi.
              </Text>
            </View>
            <Ionicons name="download-outline" size={22} color={Colors.successDark} />
          </View>
        </Card>
      </TouchableOpacity>

      {/* Excel Import & Template Section */}
      <View style={styles.templateSection}>
        <Text style={styles.sectionHeader}>Excel İçe Aktarma Araçları</Text>

        {/* Bulk Student Import Card */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleBulkImportStudents}
          disabled={loading}
        >
          <Card style={[styles.reportCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', borderWidth: 1 }]}>
            <View style={styles.cardRow}>
              <View style={[styles.iconWrap, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="cloud-upload" size={26} color="#16A34A" />
              </View>
              <View style={styles.cardTextWrap}>
                <Text style={[styles.reportTitle, { color: '#15803D' }]}>Tüm Şubelere Toplu Öğrenci Yükle</Text>
                <Text style={styles.reportDesc}>
                  Excel dosyasındaki şube bilgisine göre tüm sınıfların öğrencilerini tek tıkla sisteme aktarın.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#16A34A" />
            </View>
          </Card>
        </TouchableOpacity>

        {/* Template Download Card */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleDownloadTemplate}
          disabled={loading}
          style={{ marginTop: 10 }}
        >
          <Card style={[styles.reportCard, styles.templateCard]}>
            <View style={styles.cardRow}>
              <View style={[styles.iconWrap, { backgroundColor: '#EDE9FE' }]}>
                <Ionicons name="document-attach" size={26} color="#7C3AED" />
              </View>
              <View style={styles.cardTextWrap}>
                <Text style={styles.reportTitle}>Örnek Öğrenci Excel Şablonu İndir</Text>
                <Text style={styles.reportDesc}>
                  Tüm şubeler için 2 sayfalı şablon. 2. sayfada sistemde kayıtlı şubeleriniz yer alır.
                </Text>
              </View>
              <Ionicons name="share-social-outline" size={22} color="#7C3AED" />
            </View>
          </Card>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primaryDark,
  },
  reportCard: {
    padding: 16,
    marginBottom: 12,
  },
  templateCard: {
    borderColor: '#DDD6FE',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  reportDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 3,
    lineHeight: 16,
  },
  templateSection: {
    marginTop: 16,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
});
