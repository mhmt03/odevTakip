import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
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
import Constants from 'expo-constants';
import appConfig from '../../app.json';
import pkg from '../../package.json';
import {
  getQuickNotes,
  addQuickNote,
  updateQuickNote,
  deleteQuickNote,
  resetDefaultQuickNotes,
  QuickNoteItem,
} from '../database/operations/noteOperations';
import {
  School,
  getSchools,
  getDefaultSchoolId,
  setDefaultSchoolId,
  setActiveSchool,
} from '../database/operations/schoolOperations';
import { useSchoolTheme } from '../context/SchoolThemeContext';
import {
  getGeminiApiKey,
  setGeminiApiKey,
  testGeminiApiKey,
} from '../utils/geminiScheduleService';

const APP_VERSION =
  Constants.expoConfig?.version ||
  (appConfig as any)?.expo?.version ||
  (pkg as any)?.version ||
  '1.0.0';

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
    schoolCount: 0,
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

  // Default school state
  const { reloadSchoolTheme } = useSchoolTheme();
  const [schools, setSchools] = useState<School[]>([]);
  const [defaultSchoolId, setDefaultSchoolIdState] = useState<number | null>(null);

  // Gemini AI Settings State
  const [geminiApiKey, setGeminiApiKeyState] = useState('');
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [testingGeminiKey, setTestingGeminiKey] = useState(false);
  const [savingGeminiKey, setSavingGeminiKey] = useState(false);

  const loadData = async () => {
    try {
      const [dbStats, notes, schoolList, defId, gemKey] = await Promise.all([
        getDatabaseStats(),
        getQuickNotes(),
        getSchools(),
        getDefaultSchoolId(),
        getGeminiApiKey(),
      ]);
      setStats(dbStats);
      setQuickNotes(notes);
      setSchools(schoolList);
      setDefaultSchoolIdState(defId);
      setGeminiApiKeyState(gemKey);
      setGeminiKeyInput(gemKey);
    } catch (e) {
      console.error('Error loading operations data:', e);
    }
  };

  const handleSaveGeminiKey = async () => {
    const trimmed = geminiKeyInput.trim();
    try {
      setSavingGeminiKey(true);
      await setGeminiApiKey(trimmed);
      setGeminiApiKeyState(trimmed);
      setSavingGeminiKey(false);
      Alert.alert(
        'Kaydedildi ✅',
        trimmed
          ? 'Google Gemini API anahtarı başarıyla güncellendi.'
          : 'API anahtarı temizlendi.'
      );
    } catch (e: any) {
      setSavingGeminiKey(false);
      Alert.alert('Hata', e?.message || 'API anahtarı kaydedilemedi.');
    }
  };

  const handleTestGeminiKey = async () => {
    const trimmed = geminiKeyInput.trim();
    if (!trimmed) {
      Alert.alert('Uyarı', 'Lütfen önce bir API anahtarı giriniz.');
      return;
    }
    try {
      setTestingGeminiKey(true);
      const res = await testGeminiApiKey(trimmed);
      setTestingGeminiKey(false);
      if (res.success) {
        Alert.alert(
          'Bağlantı Başarılı 🎉',
          'Google Gemini API bağlantısı doğrulandı. Ders programı fotoğraf tarama ve yıllık plan dönüştürme özellikleri kullanıma hazır!'
        );
      } else {
        Alert.alert('Doğrulama Başarısız ❌', res.message);
      }
    } catch (e: any) {
      setTestingGeminiKey(false);
      Alert.alert('Hata', e?.message || 'API anahtarı test edilemedi.');
    }
  };

  const handleClearGeminiKey = () => {
    Alert.alert(
      'API Anahtarını Kaldır',
      'Kayıtlı Gemini API anahtarını silmek istediğinize emin misiniz? (Ders programı görsel tarama ve yıllık plan yapay zeka özellikleri anahtarsız çalışmaz)',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            await setGeminiApiKey('');
            setGeminiApiKeyState('');
            setGeminiKeyInput('');
            Alert.alert('Bilgi', 'API anahtarı başarıyla kaldırıldı.');
          },
        },
      ]
    );
  };

  const handleSelectDefaultSchool = async (school: School) => {
    try {
      if (defaultSchoolId === school.id) {
        Alert.alert(
          'Varsayılan Okulu Kaldır',
          `"${school.name}" varsayılan okul olmaktan çıkarılsın mı? Uygulama son kullanılan okulla açılır.`,
          [
            { text: 'Vazgeç', style: 'cancel' },
            {
              text: 'Kaldır',
              style: 'destructive',
              onPress: async () => {
                await setDefaultSchoolId(null);
                setDefaultSchoolIdState(null);
              },
            },
          ]
        );
        return;
      }
      await setDefaultSchoolId(school.id);
      await setActiveSchool(school.id);
      setDefaultSchoolIdState(school.id);
      await reloadSchoolTheme();
      setSchools(await getSchools());
      Alert.alert(
        'Varsayılan Okul Ayarlandı ✅',
        `Uygulama her açıldığında "${school.name}" otomatik olarak seçilecek.`
      );
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Varsayılan okul ayarlanamadı.');
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
        {/* SECTION 0: VARSAYILAN OKUL SEÇİMİ */}
        <View style={styles.sectionHeaderRow}>
          <Ionicons name="star-outline" size={20} color={Colors.primary} />
          <Text style={styles.sectionHeader}>Varsayılan Okul Seçimi</Text>
        </View>

        <Card style={styles.dbCard}>
          <Text style={styles.cardInfoDesc}>
            Uygulama her açıldığında seçtiğiniz okul otomatik olarak aktif olur ve ajandanız bu okulun programıyla başlar.
          </Text>

          {schools.length === 0 ? (
            <Text style={styles.defaultSchoolEmpty}>Henüz kayıtlı okul yok. Ana sayfadan okul ekleyebilirsiniz.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {schools.map((school) => {
                const isDefault = defaultSchoolId === school.id;
                return (
                  <TouchableOpacity
                    key={school.id}
                    testID={`default-school-${school.id}`}
                    style={[
                      styles.defaultSchoolRow,
                      isDefault && {
                        borderColor: school.color,
                        backgroundColor: `${school.color}14`,
                      },
                    ]}
                    onPress={() => handleSelectDefaultSchool(school)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.defaultSchoolDot, { backgroundColor: school.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.defaultSchoolName} numberOfLines={1}>
                        {school.name}
                      </Text>
                      {school.is_active === 1 && (
                        <Text style={styles.defaultSchoolSub}>Şu an aktif</Text>
                      )}
                    </View>
                    {isDefault && (
                      <View style={[styles.defaultPill, { backgroundColor: school.color }]}>
                        <Text style={styles.defaultPillText}>Varsayılan</Text>
                      </View>
                    )}
                    <Ionicons
                      name={isDefault ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={isDefault ? school.color : Colors.textMuted}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </Card>

        {/* SECTION 1: YAPAY ZEKA (GOOGLE GEMINI AI) AYARLARI */}
        <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
          <Ionicons name="sparkles" size={20} color="#7C3AED" />
          <Text style={styles.sectionHeader}>Yapay Zeka (Google Gemini AI) Ayarları</Text>
        </View>

        <Card style={styles.aiCard}>
          <View style={styles.aiCardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiCardTitle}>Google Gemini API</Text>
              <Text style={styles.aiCardDesc}>
                Haftalık ders programı fotoğraflarını taramak ve karmaşık yıllık plan Excel dosyalarını sınıf defterine dönüştürmek için kullanılır.
              </Text>
            </View>
            <View
              style={[
                styles.aiStatusBadge,
                geminiApiKey ? styles.aiStatusBadgeActive : styles.aiStatusBadgeInactive,
              ]}
            >
              <Text
                style={[
                  styles.aiStatusBadgeText,
                  geminiApiKey ? styles.aiStatusBadgeTextActive : styles.aiStatusBadgeTextInactive,
                ]}
              >
                {geminiApiKey ? '● Aktif' : '● Tanımlanmadı'}
              </Text>
            </View>
          </View>

          {/* API Key Input Row */}
          <View style={styles.aiInputWrap}>
            <Text style={styles.aiInputLabel}>Gemini API Anahtarı:</Text>
            <View style={styles.aiInputFieldRow}>
              <Ionicons name="key-outline" size={18} color={Colors.textMuted} style={{ marginLeft: 10 }} />
              <TextInput
                style={styles.aiTextInput}
                placeholder="AIzaSy... ile başlayan anahtarınızı girin"
                placeholderTextColor={Colors.textMuted}
                value={geminiKeyInput}
                onChangeText={setGeminiKeyInput}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showGeminiKey}
              />
              <TouchableOpacity
                style={styles.aiEyeBtn}
                onPress={() => setShowGeminiKey(!showGeminiKey)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showGeminiKey ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.aiActionBtnsRow}>
            <TouchableOpacity
              style={styles.aiTestBtn}
              onPress={handleTestGeminiKey}
              disabled={testingGeminiKey}
            >
              {testingGeminiKey ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="flash-outline" size={16} color={Colors.primary} />
                  <Text style={styles.aiTestBtnText}>Test Et</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.aiSaveBtn}
              onPress={handleSaveGeminiKey}
              disabled={savingGeminiKey}
            >
              {savingGeminiKey ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={16} color="#FFF" />
                  <Text style={styles.aiSaveBtnText}>Kaydet</Text>
                </>
              )}
            </TouchableOpacity>

            {geminiApiKey ? (
              <TouchableOpacity
                style={styles.aiClearBtn}
                onPress={handleClearGeminiKey}
              >
                <Ionicons name="trash-outline" size={16} color={Colors.danger} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Educational Step-by-Step Box */}
          <View style={styles.aiGuideBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Ionicons name="help-circle" size={18} color="#92400E" />
              <Text style={styles.aiGuideTitle}>Ücretsiz API Anahtarı Nasıl Alınır?</Text>
            </View>

            <Text style={styles.aiGuideStep}>
              <Text style={{ fontWeight: '700' }}>1. Adım: </Text>
              Aşağıdaki butona dokunarak Google AI Studio web sayfasını açın ve Gmail hesabınızla oturum açın.
            </Text>
            <Text style={styles.aiGuideStep}>
              <Text style={{ fontWeight: '700' }}>2. Adım: </Text>
              Açılan sayfada mavi renkteki <Text style={{ fontWeight: '700' }}>"Create API key"</Text> butonuna tıklayın.
            </Text>
            <Text style={styles.aiGuideStep}>
              <Text style={{ fontWeight: '700' }}>3. Adım: </Text>
              Oluşturulan <Text style={{ fontWeight: '700' }}>AIzaSy...</Text> kodunu kopyalayıp yukarıdaki kutucuğa yapıştırın ve <Text style={{ fontWeight: '700' }}>"Kaydet"</Text> butonuna basın.
            </Text>

            <View style={styles.aiFreePillsRow}>
              <View style={styles.aiFreePill}>
                <Ionicons name="checkmark-circle" size={13} color="#15803D" />
                <Text style={styles.aiFreePillText}>Tamamen Ücretsiz</Text>
              </View>
              <View style={styles.aiFreePill}>
                <Ionicons name="card-outline" size={13} color="#15803D" />
                <Text style={styles.aiFreePillText}>Kredi Kartı İstemez</Text>
              </View>
              <View style={styles.aiFreePill}>
                <Ionicons name="infinite" size={13} color="#15803D" />
                <Text style={styles.aiFreePillText}>Günde 1.500 İstek</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.openAiStudioBtn}
              onPress={() => Linking.openURL('https://aistudio.google.com/app/apikey')}
              activeOpacity={0.8}
            >
              <Ionicons name="open-outline" size={17} color="#FFF" />
              <Text style={styles.openAiStudioBtnText}>Google AI Studio'yu Aç (Ücretsiz API Al)</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* SECTION 2: VERİTABANI YEDEKLEME & GERİ YÜKLEME */}
        <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
          <Ionicons name="server-outline" size={20} color={Colors.primary} />
          <Text style={styles.sectionHeader}>Veritabanı Yedekleme & Geri Yükleme</Text>
        </View>

        <Card style={styles.dbCard}>
          <Text style={styles.cardInfoTitle}>Veritabanı Durumu & Genel İstatistikler</Text>
          <Text style={styles.cardInfoDesc}>
            Tüm okullarınıza ait şubeler, öğrenciler, ödevler, görüşler ve ders programı yerel veritabanında güvenle saklanır.
          </Text>

          <View style={styles.statsGrid}>
            <View style={styles.statMiniBox}>
              <Text style={styles.statMiniVal}>{stats.schoolCount || 0}</Text>
              <Text style={styles.statMiniLabel}>Okul</Text>
            </View>
            <View style={styles.statMiniBox}>
              <Text style={styles.statMiniVal}>{stats.classCount}</Text>
              <Text style={styles.statMiniLabel}>Toplam Şube</Text>
            </View>
            <View style={styles.statMiniBox}>
              <Text style={styles.statMiniVal}>{stats.studentCount}</Text>
              <Text style={styles.statMiniLabel}>Toplam Öğrenci</Text>
            </View>
            <View style={styles.statMiniBox}>
              <Text style={styles.statMiniVal}>{stats.assignmentCount}</Text>
              <Text style={styles.statMiniLabel}>Toplam Ödev</Text>
            </View>
            <View style={styles.statMiniBox}>
              <Text style={styles.statMiniVal}>{stats.noteCount}</Text>
              <Text style={styles.statMiniLabel}>Görüş/Not</Text>
            </View>
            <View style={styles.statMiniBox}>
              <Text style={styles.statMiniVal}>{stats.scheduleCount}</Text>
              <Text style={styles.statMiniLabel}>Ders Saati</Text>
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

            <TouchableOpacity
              style={[styles.backupBtn, { backgroundColor: '#0284C7' }]}
              onPress={() => navigation.navigate('Agenda')}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: '#0369A1' }]}>
                <Ionicons name="calendar" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.actionBtnTextWrap}>
                <Text style={styles.actionBtnTitle}>Ajanda & Hatırlatıcılar</Text>
                <Text style={styles.actionBtnSub}>Günün görevleri, alarmlar ve yapılacaklar listesi</Text>
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
              <Image
                source={require('../../assets/app_logo.png')}
                style={styles.appLogoImage}
                resizeMode="cover"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.appTitle}>Sınıf Takip & Ajanda</Text>
              <Text style={styles.appVersionBadge}>Sürüm {APP_VERSION}</Text>
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
  defaultSchoolEmpty: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  defaultSchoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  defaultSchoolDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  defaultSchoolName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  defaultSchoolSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  defaultPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  defaultPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
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
  clearScheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D97706',
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
    width: 54,
    height: 54,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#E0E7FF',
    ...Shadows.small,
  },
  appLogoImage: {
    width: '100%',
    height: '100%',
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
  aiCard: {
    padding: 16,
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  aiCardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  aiCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  aiCardDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 3,
    lineHeight: 16,
  },
  aiStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  aiStatusBadgeActive: {
    backgroundColor: '#DCFCE7',
  },
  aiStatusBadgeInactive: {
    backgroundColor: '#FEF3C7',
  },
  aiStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  aiStatusBadgeTextActive: {
    color: '#15803D',
  },
  aiStatusBadgeTextInactive: {
    color: '#B45309',
  },
  aiInputWrap: {
    marginBottom: 12,
  },
  aiInputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  aiInputFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  aiTextInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  aiEyeBtn: {
    padding: 10,
  },
  aiActionBtnsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  aiTestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  aiTestBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  aiSaveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#7C3AED',
  },
  aiSaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  aiClearBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  aiGuideBox: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  aiGuideTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  aiGuideStep: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 18,
    marginTop: 4,
  },
  aiFreePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 10,
  },
  aiFreePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  aiFreePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  openAiStudioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#D97706',
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 4,
  },
  openAiStudioBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
});
