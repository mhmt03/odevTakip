import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Linking,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '../theme/colors';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import {
  getDatabaseStats,
  exportDatabaseBackup,
  restoreDatabaseBackup,
  DatabaseStats,
} from '../utils/backupService';
import {
  getQuickNotes,
  addQuickNote,
  updateQuickNote,
  deleteQuickNote,
  resetDefaultQuickNotes,
  QuickNoteItem,
} from '../database/operations/noteOperations';

export const OperationsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 20
  );

  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // Database stats
  const [stats, setStats] = useState<DatabaseStats>({
    classCount: 0,
    studentCount: 0,
    assignmentCount: 0,
    noteCount: 0,
    scheduleCount: 0,
    yearlyPlanCount: 0,
    quickNoteCount: 0,
  });

  // Quick notes state
  const [quickNotes, setQuickNotes] = useState<QuickNoteItem[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [editingNote, setEditingNote] = useState<QuickNoteItem | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);

  const loadData = async () => {
    try {
      const [dbStats, notes] = await Promise.all([
        getDatabaseStats(),
        getQuickNotes(),
      ]);
      setStats(dbStats);
      setQuickNotes(notes);
    } catch (e) {
      console.error('Error loading operations data:', e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  // --- DATABASE BACKUP HANDLERS ---
  const handleBackupPrompt = () => {
    Alert.alert(
      'Veritabanı Yedekle',
      'Yedek dosyasını (.db) cihazınıza indirmek mi yoksa paylaşmak mı istersiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Cihaza İndir / Kaydet',
          onPress: () => performBackup('download'),
        },
        {
          text: 'Paylaş (Drive / WhatsApp)',
          onPress: () => performBackup('share'),
        },
      ]
    );
  };

  const performBackup = async (action: 'download' | 'share') => {
    try {
      setLoading(true);
      setLoadingMessage(
        action === 'download'
          ? 'Yedek dosyası hazırlanıyor ve klasör seçimi bekleniyor...'
          : 'Yedek dosyası hazırlanıyor ve paylaşım menüsü açılıyor...'
      );
      const res = await exportDatabaseBackup(action);
      if (res.success) {
        if (res.message) {
          Alert.alert('İşlem Başarılı', res.message);
        }
      } else {
        if (res.error) {
          Alert.alert('Hata', res.error);
        }
      }
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Yedekleme sırasında beklenmedik bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestorePrompt = () => {
    Alert.alert(
      '⚠️ Veritabanı Geri Yükle',
      'DİKKAT: Seçilen .db yedek dosyası mevcut veritabanınızın üzerine yazılacaktır. Mevcut verilerinizi kaybetmemek için önce yedek almanızı öneririz.\n\nDevam etmek istiyor musunuz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Dosya Seç ve Yükle',
          style: 'destructive',
          onPress: performRestore,
        },
      ]
    );
  };

  const performRestore = async () => {
    try {
      setLoading(true);
      setLoadingMessage('Veritabanı geri yükleniyor, lütfen bekleyin...');
      const res = await restoreDatabaseBackup();
      if (res.success) {
        Alert.alert(
          'Geri Yükleme Başarılı 🎉',
          res.message || 'Veritabanı başarıyla geri yüklendi.',
          [
            {
              text: 'Tamam',
              onPress: () => {
                loadData();
              },
            },
          ]
        );
      } else {
        if (res.error) {
          Alert.alert('Geri Yükleme Başarısız', res.error);
        }
      }
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Geri yükleme işlemi başarısız oldu.');
    } finally {
      setLoading(false);
    }
  };

  // --- QUICK NOTES HANDLERS ---
  const handleAddQuickNote = async () => {
    if (!newNoteText.trim()) {
      Alert.alert('Uyarı', 'Lütfen eklenecek hazır görüş metnini yazın.');
      return;
    }
    try {
      await addQuickNote(newNoteText.trim());
      setNewNoteText('');
      const updated = await getQuickNotes();
      setQuickNotes(updated);
    } catch (e) {
      console.error(e);
      Alert.alert('Hata', 'Görüş metni eklenemedi.');
    }
  };

  const handleOpenEditModal = (item: QuickNoteItem) => {
    setEditingNote(item);
    setEditingText(item.text);
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editingNote) return;
    if (!editingText.trim()) {
      Alert.alert('Uyarı', 'Görüş metni boş bırakılamaz.');
      return;
    }
    try {
      await updateQuickNote(editingNote.id, editingText.trim());
      setEditModalVisible(false);
      setEditingNote(null);
      const updated = await getQuickNotes();
      setQuickNotes(updated);
    } catch (e) {
      console.error(e);
      Alert.alert('Hata', 'Görüş metni güncellenemedi.');
    }
  };

  const handleDeleteQuickNote = (item: QuickNoteItem) => {
    Alert.alert(
      'Görüş Metnini Sil',
      `"${item.text}" metnini listeden silmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteQuickNote(item.id);
              const updated = await getQuickNotes();
              setQuickNotes(updated);
            } catch (e) {
              console.error(e);
              Alert.alert('Hata', 'Silme işlemi gerçekleştirilemedi.');
            }
          },
        },
      ]
    );
  };

  const handleResetDefaults = () => {
    Alert.alert(
      'Varsayılanlara Sıfırla',
      'Tüm hazır görüş metinleri silinecek ve başlangıç varsayılanlarına döndürülecektir. Onaylıyor musunuz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sıfırla',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetDefaultQuickNotes();
              const updated = await getQuickNotes();
              setQuickNotes(updated);
            } catch (e) {
              console.error(e);
            }
          },
        },
      ]
    );
  };

  const handleSendEmail = () => {
    Linking.openURL('mailto:gundoner@yahoo.com?subject=Sinif%20Takip%20ve%20Ajanda%20Uygulamasi');
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>İşlemler & Ayarlar</Text>
          <Text style={styles.headerSub}>Veritabanı, Hazır Görüşler & Versiyon</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* SECTION 1: VERİTABANI YEDEKLEME & GERİ YÜKLEME */}
        <View style={styles.sectionHeaderRow}>
          <Ionicons name="server-outline" size={20} color={Colors.primary} />
          <Text style={styles.sectionHeader}>Veritabanı Yedekleme & Geri Yükleme</Text>
        </View>

        <Card style={styles.dbCard}>
          <Text style={styles.cardInfoTitle}>Veritabanı Durumu & İstatistikler</Text>
          <Text style={styles.cardInfoDesc}>
            Uygulamanızdaki tüm şubeler, öğrenciler, ödevler, görüşler ve ders programı yerel SQLite veritabanında güvenle saklanır.
          </Text>

          <View style={styles.statsGrid}>
            <View style={styles.statMiniBox}>
              <Text style={styles.statMiniVal}>{stats.classCount}</Text>
              <Text style={styles.statMiniLabel}>Şube</Text>
            </View>
            <View style={styles.statMiniBox}>
              <Text style={styles.statMiniVal}>{stats.studentCount}</Text>
              <Text style={styles.statMiniLabel}>Öğrenci</Text>
            </View>
            <View style={styles.statMiniBox}>
              <Text style={styles.statMiniVal}>{stats.assignmentCount}</Text>
              <Text style={styles.statMiniLabel}>Ödev</Text>
            </View>
            <View style={styles.statMiniBox}>
              <Text style={styles.statMiniVal}>{stats.noteCount}</Text>
              <Text style={styles.statMiniLabel}>Görüş/Not</Text>
            </View>
            <View style={styles.statMiniBox}>
              <Text style={styles.statMiniVal}>{stats.scheduleCount}</Text>
              <Text style={styles.statMiniLabel}>Ders Saati</Text>
            </View>
            <View style={styles.statMiniBox}>
              <Text style={styles.statMiniVal}>{stats.yearlyPlanCount}</Text>
              <Text style={styles.statMiniLabel}>Yıllık Plan</Text>
            </View>
          </View>

          <View style={styles.dbActionsRow}>
            <TouchableOpacity
              style={styles.backupBtn}
              onPress={handleBackupPrompt}
              activeOpacity={0.8}
            >
              <View style={styles.actionIconCircle}>
                <Ionicons name="cloud-upload-outline" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.actionBtnTextWrap}>
                <Text style={styles.actionBtnTitle}>Veritabanını Yedekle</Text>
                <Text style={styles.actionBtnSub}>Cihaza kaydet veya paylaş (.db)</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.restoreBtn}
              onPress={handleRestorePrompt}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: '#EF4444' }]}>
                <Ionicons name="cloud-download-outline" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.actionBtnTextWrap}>
                <Text style={styles.actionBtnTitle}>Yedekten Geri Yükle</Text>
                <Text style={styles.actionBtnSub}>Mevcut .db yedeğini içe aktar</Text>
              </View>
            </TouchableOpacity>
          </View>
        </Card>

        {/* SECTION 2: HAZIR GÖRÜŞLERİN METİNLERİ */}
        <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
          <Ionicons name="chatbubbles-outline" size={20} color={Colors.warningDark} />
          <Text style={styles.sectionHeader}>Hazır Görüşlerin Metinleri</Text>
        </View>

        <Card style={styles.quickNotesCard}>
          <Text style={styles.cardInfoDesc}>
            Öğrenci Görüşü eklerken tek dokunuşla seçebileceğiniz hazır görüş kalıplarını buradan ekleyebilir, düzenleyebilir veya silebilirsiniz.
          </Text>

          {/* New text input row */}
          <View style={styles.addInputRow}>
            <TextInput
              style={styles.textInput}
              placeholder="Yeni hazır görüş metni (örn: Derse hazırlıklı geldi 👍)"
              placeholderTextColor={Colors.textMuted}
              value={newNoteText}
              onChangeText={setNewNoteText}
            />
            <TouchableOpacity
              style={styles.addBtn}
              onPress={handleAddQuickNote}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={22} color="#FFFFFF" />
              <Text style={styles.addBtnText}>Ekle</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Notes List */}
          <View style={styles.quickNotesList}>
            {quickNotes.map((item, index) => (
              <View key={item.id} style={styles.quickNoteRow}>
                <View style={styles.quickNoteIndexBadge}>
                  <Text style={styles.quickNoteIndexText}>{index + 1}</Text>
                </View>
                <Text style={styles.quickNoteText}>{item.text}</Text>
                <View style={styles.quickNoteActions}>
                  <TouchableOpacity
                    style={styles.iconActionBtn}
                    onPress={() => handleOpenEditModal(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="pencil" size={17} color={Colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconActionBtn}
                    onPress={() => handleDeleteQuickNote(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={17} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.resetDefaultsBtn}
            onPress={handleResetDefaults}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.resetDefaultsText}>Varsayılan Şablonlara Sıfırla</Text>
          </TouchableOpacity>
        </Card>

        {/* SECTION 3: VERSİYON VE GELİŞTİRİCİ BİLGİSİ */}
        <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.secondary} />
          <Text style={styles.sectionHeader}>Uygulama & Versiyon Bilgisi</Text>
        </View>

        <Card style={styles.versionCard}>
          <View style={styles.versionHeaderRow}>
            <View style={styles.appLogoWrap}>
              <Ionicons name="school" size={28} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.appTitle}>Sınıf Takip & Ajanda</Text>
              <Text style={styles.appVersionBadge}>Sürüm 1.0.0 (Expo SDK 57)</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.authorSection}>
            <View style={styles.authorBadge}>
              <Ionicons name="code-slash" size={18} color={Colors.primary} />
              <Text style={styles.authorText}>created by M.G.</Text>
            </View>

            <TouchableOpacity
              style={styles.emailRow}
              onPress={handleSendEmail}
              activeOpacity={0.7}
            >
              <Ionicons name="mail" size={18} color={Colors.primary} />
              <Text style={styles.emailText}>gundoner@yahoo.com</Text>
              <Ionicons name="open-outline" size={14} color={Colors.textMuted} />
            </TouchableOpacity>

            <Text style={styles.copyrightText}>
              Öğretmenler için geliştirilmiş çevrimdışı sınıf, ödev ve ajanda takip sistemi. Tüm hakları saklıdır.
            </Text>
          </View>
        </Card>
      </ScrollView>

      {/* Edit Quick Note Modal */}
      <Modal
        visible={editModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Hazır Görüşü Düzenle</Text>
            <TextInput
              style={styles.modalInput}
              value={editingText}
              onChangeText={setEditingText}
              placeholder="Görüş metni"
              placeholderTextColor={Colors.textMuted}
              autoFocus={true}
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalSaveBtn]}
                onPress={handleSaveEdit}
              >
                <Text style={styles.modalSaveText}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>{loadingMessage || 'Lütfen bekleyin...'}</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    ...Shadows.small,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  dbCard: {
    padding: 16,
  },
  cardInfoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  cardInfoDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  statMiniBox: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statMiniVal: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.primary,
  },
  statMiniLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  dbActionsRow: {
    gap: 10,
  },
  backupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    ...Shadows.small,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    ...Shadows.small,
  },
  actionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnTextWrap: {
    flex: 1,
  },
  actionBtnTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionBtnSub: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  quickNotesCard: {
    padding: 16,
  },
  addInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 4,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  quickNotesList: {
    gap: 8,
  },
  quickNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickNoteIndexBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  quickNoteIndexText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  quickNoteText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  quickNoteActions: {
    flexDirection: 'row',
    gap: 12,
    marginLeft: 8,
  },
  iconActionBtn: {
    padding: 4,
  },
  resetDefaultsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 8,
    gap: 6,
  },
  resetDefaultsText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  versionCard: {
    padding: 16,
  },
  versionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  appLogoWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  appVersionBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 14,
  },
  authorSection: {
    alignItems: 'flex-start',
    gap: 10,
  },
  authorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 6,
  },
  authorText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  emailText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
  copyrightText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    ...Shadows.medium,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 14,
  },
  modalInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  modalCancelBtn: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  modalSaveBtn: {
    backgroundColor: Colors.primary,
  },
  modalSaveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingBox: {
    backgroundColor: Colors.card,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    gap: 14,
    maxWidth: 320,
    width: '100%',
    ...Shadows.medium,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
});
