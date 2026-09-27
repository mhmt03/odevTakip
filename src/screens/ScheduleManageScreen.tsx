import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  FlatList,
} from 'react-native';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import {
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  getLessonSlots,
  createLessonSlot,
  updateLessonSlot,
  deleteLessonSlot,
  clearAllLessonSlots,
  restoreDefaultLessonSlots,
  getSlotsForDay,
  getCustomDaysWithOverrides,
  saveDaySlotTime,
  copyStandardSlotsToDay,
  resetDaySlotTimes,
  loadOfficialWeeklySchedule,
} from '../database/operations/scheduleOperations';
import { CourseName, LessonSlot, DaySlotInfo } from '../types';
import { DAYS_OF_WEEK } from '../utils/dateUtils';

export const ScheduleManageScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const initialTab = route.params?.initialTab || 'courses';
  const initialDay = route.params?.initialDay !== undefined ? route.params.initialDay : 0;

  const [activeTab, setActiveTab] = useState<'courses' | 'slots'>(initialTab);

  // Courses state
  const [courses, setCourses] = useState<CourseName[]>([]);
  const [courseModal, setCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseName | null>(null);
  const [courseNameInput, setCourseNameInput] = useState('');
  const [courseCodeInput, setCourseCodeInput] = useState('');

  // Slots state (Standard)
  const [slots, setSlots] = useState<LessonSlot[]>([]);
  const [slotModal, setSlotModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState<LessonSlot | null>(null);
  const [slotNumInput, setSlotNumInput] = useState('');
  const [slotNameInput, setSlotNameInput] = useState('');
  const [slotStartInput, setSlotStartInput] = useState('');
  const [slotEndInput, setSlotEndInput] = useState('');

  // Day-specific slot timing state
  const [slotDayTab, setSlotDayTab] = useState<number>(initialDay); // 0 = Standart, 1..7 = Günler
  const [customDays, setCustomDays] = useState<number[]>([]);
  const [daySlots, setDaySlots] = useState<DaySlotInfo[]>([]);

  // Day slot edit modal state
  const [daySlotModal, setDaySlotModal] = useState(false);
  const [editingDaySlot, setEditingDaySlot] = useState<DaySlotInfo | null>(null);
  const [daySlotStartInput, setDaySlotStartInput] = useState('');
  const [daySlotEndInput, setDaySlotEndInput] = useState('');

  const loadData = async () => {
    try {
      const crs = await getCourses();
      setCourses(crs);

      const slt = await getLessonSlots();
      setSlots(slt);

      const cDays = await getCustomDaysWithOverrides();
      setCustomDays(cDays);

      if (slotDayTab > 0) {
        const dSlt = await getSlotsForDay(slotDayTab);
        setDaySlots(dSlt);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [slotDayTab])
  );

  useEffect(() => {
    if (slotDayTab > 0) {
      getSlotsForDay(slotDayTab).then(setDaySlots);
    }
  }, [slotDayTab]);

  // Course handlers
  const handleOpenAddCourse = () => {
    setEditingCourse(null);
    setCourseNameInput('');
    setCourseCodeInput('');
    setCourseModal(true);
  };

  const handleOpenEditCourse = (c: CourseName) => {
    setEditingCourse(c);
    setCourseNameInput(c.name);
    setCourseCodeInput(c.code || '');
    setCourseModal(true);
  };

  const handleSaveCourse = async () => {
    if (!courseNameInput.trim()) {
      Alert.alert('Uyarı', 'Lütfen ders adını giriniz.');
      return;
    }
    try {
      if (editingCourse) {
        await updateCourse(editingCourse.id, courseNameInput, courseCodeInput);
      } else {
        await createCourse(courseNameInput, courseCodeInput);
      }
      setCourseModal(false);
      loadData();
    } catch (e) {
      Alert.alert('Hata', 'Ders adı kaydedilemedi.');
    }
  };

  const handleDeleteCourse = (c: CourseName) => {
    Alert.alert('Dersi Sil', `"${c.name}" dersini silmek istediğinize emin misiniz?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCourse(c.id);
            loadData();
          } catch (e) {
            Alert.alert('Hata', 'Ders silinemedi.');
          }
        },
      },
    ]);
  };

  const handleAutoLoadOfficialSchedule = () => {
    Alert.alert(
      'Okul Programını Otomatik Yükle',
      'Kamil Miras Anadolu Lisesi resmi haftalık ders programı (27 Saat) yüklenecektir:\n\n' +
        '• S.FZK (Seçmeli Fizik) - 24 Saat\n' +
        '• HDTE2 (Hedef Temelli Destek Eğitimi 2) - 3 Saat\n' +
        '• Şubeler: 11-A, 11-B, 11-C, 12-C, 12-D, 12-E\n\n' +
        '⚠️ Kural: Önceden tanımladığınız veya düzenlediğiniz ders saatleri (başlangıç/bitiş dakikaları) KORUNACAKTIR, sadece derslerin şube ve kod dağılımı aktarılacaktır.\n\n' +
        'Programı yüklemek istiyor musunuz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Programı Yükle',
          onPress: async () => {
            try {
              const res = await loadOfficialWeeklySchedule();
              await loadData();
              Alert.alert(
                'Başarıyla Yüklendi 🎉',
                `Toplam ${res.totalLessonsLoaded} saatlik resmi okul ders programı yüklendi!\n\n` +
                  `• Ders Kodları: ${res.coursesEnsured.map((c) => `${c.code} (${c.name})`).join(', ')}\n` +
                  `• Şubeler: ${res.classesEnsured.join(', ')}\n\n` +
                  `Ders saatleriniz korunmuştur.`
              );
            } catch (err: any) {
              Alert.alert('Hata', 'Program yüklenirken bir sorun oluştu: ' + (err?.message || err));
            }
          },
        },
      ]
    );
  };

  // Standard Slot handlers
  const handleOpenAddSlot = () => {
    setEditingSlot(null);
    const nextNum = slots.length > 0 ? Math.max(...slots.map((s) => s.slot_number)) + 1 : 1;
    setSlotNumInput(String(nextNum));
    setSlotNameInput(`${nextNum}. Ders`);
    setSlotStartInput('10:00');
    setSlotEndInput('10:45');
    setSlotModal(true);
  };

  const handleOpenEditSlot = (s: LessonSlot) => {
    setEditingSlot(s);
    setSlotNumInput(String(s.slot_number));
    setSlotNameInput(s.slot_name);
    setSlotStartInput(s.start_time);
    setSlotEndInput(s.end_time);
    setSlotModal(true);
  };

  const handleSaveSlot = async () => {
    const num = parseInt(slotNumInput, 10);
    if (isNaN(num)) {
      Alert.alert('Uyarı', 'Geçerli bir ders sıra numarası giriniz.');
      return;
    }
    if (!slotStartInput.trim() || !slotEndInput.trim()) {
      Alert.alert('Uyarı', 'Başlangıç ve bitiş saatlerini giriniz (Örn: 10:00 - 10:50).');
      return;
    }

    // Check if slot with this number already exists
    const existing = slots.find((s) => s.slot_number === num && s.id !== editingSlot?.id);
    if (existing) {
      Alert.alert(
        'Ders Saati Zaten Mevcut',
        `Sıra No ${num} (${existing.slot_name}: ${existing.start_time} - ${existing.end_time}) sistemde hazır olarak bulunmaktadır.\n\nBu ders saatini yeni girdiğiniz saatler (${slotStartInput.trim()} - ${slotEndInput.trim()}) ile güncellemek ister misiniz?`,
        [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'Evet, Güncelle',
            onPress: async () => {
              try {
                await updateLessonSlot(
                  existing.id,
                  num,
                  slotNameInput.trim() || `${num}. Ders`,
                  slotStartInput.trim(),
                  slotEndInput.trim()
                );
                setSlotModal(false);
                loadData();
              } catch (e) {
                Alert.alert('Hata', 'Ders saati güncellenemedi.');
              }
            },
          },
        ]
      );
      return;
    }

    try {
      if (editingSlot) {
        await updateLessonSlot(editingSlot.id, num, slotNameInput, slotStartInput, slotEndInput);
      } else {
        await createLessonSlot(num, slotNameInput, slotStartInput, slotEndInput);
      }
      setSlotModal(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Ders saati kaydedilemedi.');
    }
  };

  const handleClearAllSlots = () => {
    Alert.alert(
      'Tüm Ders Saatlerini Temizle',
      'Kayıtlı tüm standart ders saatleri silinecektir. Kendi saatlerinizi 1. dersten itibaren sıfırdan eklemek ister misiniz?\n\n(Dilediğinizde örnek 8 ders saatini tek tıkla geri yükleyebilirsiniz.)',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Tümünü Temizle',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllLessonSlots();
              loadData();
            } catch (e) {
              Alert.alert('Hata', 'Ders saatleri temizlenemedi.');
            }
          },
        },
      ]
    );
  };

  const handleRestoreDefaultSlots = async () => {
    try {
      await restoreDefaultLessonSlots();
      loadData();
      Alert.alert('Başarılı', 'Örnek 8 ders saati yüklendi.');
    } catch (e) {
      Alert.alert('Hata', 'Varsayılan saatler yüklenemedi.');
    }
  };

  const handleDeleteSlot = (s: LessonSlot) => {
    Alert.alert(
      'Ders Saatini Sil',
      `"${s.slot_name}" saatini silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLessonSlot(s.id);
              loadData();
            } catch (e) {
              Alert.alert('Hata', 'Saat silinemedi.');
            }
          },
        },
      ]
    );
  };

  // Day-Specific Custom Hours handlers
  const handleActivateCustomDay = async (dayOfWeek: number) => {
    const dayName = DAYS_OF_WEEK.find((d) => d.id === dayOfWeek)?.name || 'Bu Gün';
    try {
      await copyStandardSlotsToDay(dayOfWeek);
      await loadData();
      Alert.alert(
        'Özel Saatler Aktif Edildi',
        `Standart saatler ${dayName} gününe kopyalandı. Şimdi kalem simgesine dokunarak istediğiniz ders saatini bu güne özel değiştirebilirsiniz.`
      );
    } catch (e) {
      Alert.alert('Hata', 'Özel saatler uygulanamadı.');
    }
  };

  const handleResetCustomDay = (dayOfWeek: number) => {
    const dayName = DAYS_OF_WEEK.find((d) => d.id === dayOfWeek)?.name || 'Bu Gün';
    Alert.alert(
      'Standart Saatlere Dön',
      `${dayName} günü için yapılan tüm özel saat tanımlamaları silinecek ve genel standart saatler geçerli olacaktır. Onaylıyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Standart Saatlere Dön',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetDaySlotTimes(dayOfWeek);
              await loadData();
            } catch (e) {
              Alert.alert('Hata', 'Standart saatlere dönülemedi.');
            }
          },
        },
      ]
    );
  };

  const handleOpenEditDaySlot = (slot: DaySlotInfo) => {
    setEditingDaySlot(slot);
    setDaySlotStartInput(slot.start_time);
    setDaySlotEndInput(slot.end_time);
    setDaySlotModal(true);
  };

  const handleSaveDaySlot = async () => {
    if (!editingDaySlot) return;
    if (!daySlotStartInput.trim() || !daySlotEndInput.trim()) {
      Alert.alert('Uyarı', 'Başlangıç ve bitiş saatlerini giriniz (Örn: 10:00 - 10:45).');
      return;
    }

    try {
      await saveDaySlotTime(
        slotDayTab,
        editingDaySlot.id,
        daySlotStartInput.trim(),
        daySlotEndInput.trim()
      );
      setDaySlotModal(false);
      loadData();
    } catch (e) {
      Alert.alert('Hata', 'Güne özel saat kaydedilemedi.');
    }
  };

  const currentSelectedDayObj = DAYS_OF_WEEK.find((d) => d.id === slotDayTab);
  const isSelectedDayCustom = customDays.includes(slotDayTab);

  return (
    <View style={styles.container}>
      <Header
        title="Tanımlamalar"
        subtitle="Ders Adları ve Saat Aralıkları"
        showBack
        onBack={() => navigation.goBack()}
      />

      {/* Main Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'courses' && styles.tabBtnActive]}
          onPress={() => setActiveTab('courses')}
        >
          <Ionicons
            name="book-outline"
            size={18}
            color={activeTab === 'courses' ? Colors.primary : Colors.textSecondary}
          />
          <Text style={[styles.tabBtnText, activeTab === 'courses' && styles.tabBtnTextActive]}>
            Ders Adları ({courses.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'slots' && styles.tabBtnActive]}
          onPress={() => setActiveTab('slots')}
        >
          <Ionicons
            name="time-outline"
            size={18}
            color={activeTab === 'slots' ? Colors.primary : Colors.textSecondary}
          />
          <Text style={[styles.tabBtnText, activeTab === 'slots' && styles.tabBtnTextActive]}>
            Ders Saatleri ({slots.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* COURSES TAB */}
      {activeTab === 'courses' && (
        <View style={styles.tabContent}>
          <View style={styles.contentHeader}>
            <Text style={styles.sectionTitle}>Kayıtlı Ders Branşları</Text>
            <Button title="Yeni Ders" icon="add" size="sm" onPress={handleOpenAddCourse} />
          </View>

          <FlatList
            data={courses}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.listPadding}
            ListHeaderComponent={
              <Card style={styles.autoLoadCard}>
                <View style={styles.autoLoadHeader}>
                  <View style={styles.autoLoadIconWrap}>
                    <Ionicons name="sparkles" size={18} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.autoLoadTitle}>Kamil Miras AL Programını Yükle</Text>
                    <Text style={styles.autoLoadSub}>
                      Resimdeki 27 saatlik ders programını, S.FZK ve HDTE2 ders kodlarıyla şubelere otomatik aktarın.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.autoLoadBtn}
                  onPress={handleAutoLoadOfficialSchedule}
                  activeOpacity={0.8}
                >
                  <Ionicons name="cloud-download-outline" size={16} color="#fff" />
                  <Text style={styles.autoLoadBtnText}>Programı ve Kodları Otomatik Yükle (27 Saat)</Text>
                </TouchableOpacity>
              </Card>
            }
            renderItem={({ item }) => (
              <Card style={styles.itemCard}>
                <View style={styles.itemRow}>
                  <View style={[styles.codeBadge, { backgroundColor: item.color || Colors.primaryLight }]}>
                    <Text style={styles.codeText}>{item.code || item.name.substring(0, 3)}</Text>
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.code ? (
                      <Text style={styles.itemSub}>Kod: {item.code}</Text>
                    ) : null}
                  </View>
                  <View style={styles.itemActions}>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => handleOpenEditCourse(item)}
                    >
                      <Ionicons name="pencil" size={16} color={Colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => handleDeleteCourse(item)}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            )}
          />
        </View>
      )}

      {/* SLOTS TAB */}
      {activeTab === 'slots' && (
        <View style={styles.tabContent}>
          {/* Day selection chip bar */}
          <View style={styles.daySelectorBar}>
            <View style={styles.daySelectorHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="time" size={14} color={Colors.primary} />
                <Text style={styles.daySelectorTitle}>Saat Çizelgesi Seçin:</Text>
              </View>
              <Text style={styles.daySelectorHint}>
                {slotDayTab === 0 ? 'Genel Standart Saatler' : `${currentSelectedDayObj?.name} Gününe Özel`}
              </Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daySelectorScroll}>
              <TouchableOpacity
                style={[
                  styles.dayChip,
                  slotDayTab === 0 && styles.dayChipActive,
                ]}
                onPress={() => setSlotDayTab(0)}
              >
                <Ionicons
                  name="calendar"
                  size={14}
                  color={slotDayTab === 0 ? '#fff' : Colors.primary}
                />
                <Text style={[styles.dayChipText, slotDayTab === 0 && styles.dayChipTextActive]}>
                  Genel Standart Saatler
                </Text>
              </TouchableOpacity>

              {DAYS_OF_WEEK.map((d) => {
                const isSelected = slotDayTab === d.id;
                const isCustom = customDays.includes(d.id);
                return (
                  <TouchableOpacity
                    key={d.id}
                    style={[
                      styles.dayChip,
                      isSelected && styles.dayChipActive,
                      isCustom && !isSelected && styles.dayChipHasCustom,
                    ]}
                    onPress={() => setSlotDayTab(d.id)}
                  >
                    <Ionicons
                      name={isCustom ? "flash" : "calendar-outline"}
                      size={13}
                      color={isSelected ? '#fff' : (isCustom ? '#D97706' : Colors.textSecondary)}
                    />
                    <Text
                      style={[
                        styles.dayChipText,
                        isSelected && styles.dayChipTextActive,
                        isCustom && !isSelected && styles.dayChipTextCustom,
                      ]}
                    >
                      {d.name} {isCustom ? '(Özel)' : ''}
                    </Text>
                    {isCustom && (
                      <View style={[styles.customDot, isSelected && { backgroundColor: '#fff' }]} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Sub-tab: Standard slots (slotDayTab === 0) */}
          {slotDayTab === 0 ? (
            <>
              <View style={styles.contentHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Standart Ders Saatleri</Text>
                  <Text style={styles.sectionSub}>Tüm günler için varsayılan zaman çizelgesi</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  {slots.length > 0 && (
                    <TouchableOpacity
                      style={styles.clearSlotsBtn}
                      onPress={handleClearAllSlots}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="trash-outline" size={13} color={Colors.danger} />
                      <Text style={styles.clearSlotsBtnText}>Temizle</Text>
                    </TouchableOpacity>
                  )}
                  <Button title="Saat Ekle" icon="add" size="sm" onPress={handleOpenAddSlot} />
                </View>
              </View>

              <FlatList
                data={slots}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={styles.listPadding}
                ListHeaderComponent={
                  <>
                    {/* Promo card to switch to day-specific hours */}
                    <Card style={styles.customDayPromoCard}>
                      <View style={styles.promoHeader}>
                        <View style={styles.promoIconWrap}>
                          <Ionicons name="flash" size={18} color="#D97706" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.promoTitle}>Güne Özel Farklı Saatler (Örn: Cuma)</Text>
                          <Text style={styles.promoSub}>
                            Cuma namazı veya farklı öğle arası olan günlerin saatlerini bağımsız düzenlemek için günü seçin:
                          </Text>
                        </View>
                      </View>
                      <View style={styles.promoDaysGrid}>
                        {DAYS_OF_WEEK.map((d) => {
                          const isCustom = customDays.includes(d.id);
                          return (
                            <TouchableOpacity
                              key={d.id}
                              style={[styles.promoDayBtn, isCustom && styles.promoDayBtnCustom]}
                              onPress={() => setSlotDayTab(d.id)}
                              activeOpacity={0.7}
                            >
                              <Ionicons
                                name={isCustom ? 'flash' : 'calendar-outline'}
                                size={12}
                                color={isCustom ? '#B45309' : Colors.primary}
                              />
                              <Text
                                style={[
                                  styles.promoDayBtnText,
                                  isCustom && styles.promoDayBtnTextCustom,
                                ]}
                              >
                                {d.name} {isCustom ? '⚡' : ''}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </Card>

                    <View style={styles.infoBanner}>
                      <Ionicons name="bulb-outline" size={18} color="#D97706" />
                      <Text style={styles.infoBannerText}>
                        Aşağıdaki saatler tüm günlerde geçerli standart saatlerdir. Saatleri listedeki ✏️ (Kalem) simgesine dokunarak güncelleyebilir veya &apos;Temizle&apos; ile sıfırdan kendi saatlerinizi girebilirsiniz.
                      </Text>
                    </View>
                  </>
                }
                ListEmptyComponent={
                  <View style={styles.emptySlotsBox}>
                    <Ionicons name="time-outline" size={44} color={Colors.textMuted} />
                    <Text style={styles.emptySlotsTitle}>Tanımlı Ders Saati Yok</Text>
                    <Text style={styles.emptySlotsSub}>
                      Kendi okul saatlerinizi 1. dersten itibaren ekleyebilir veya örnek saatleri tek tıkla yükleyebilirsiniz.
                    </Text>
                    <View style={styles.emptySlotsActions}>
                      <Button
                        title="1. Dersi Ekle"
                        icon="add"
                        onPress={handleOpenAddSlot}
                        style={{ minWidth: 130 }}
                      />
                      <Button
                        title="Örnek Saatleri Yükle"
                        icon="refresh-outline"
                        variant="outline"
                        onPress={handleRestoreDefaultSlots}
                        style={{ minWidth: 150 }}
                      />
                    </View>
                  </View>
                }
                renderItem={({ item }) => (
                  <Card style={styles.itemCard}>
                    <View style={styles.itemRow}>
                      <View style={styles.numBadge}>
                        <Text style={styles.numBadgeText}>{item.slot_number}</Text>
                      </View>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName}>{item.slot_name}</Text>
                        <Text style={styles.itemSub}>
                          {item.start_time} - {item.end_time}
                        </Text>
                      </View>
                      <View style={styles.itemActions}>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => handleOpenEditSlot(item)}
                        >
                          <Ionicons name="pencil" size={16} color={Colors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => handleDeleteSlot(item)}
                        >
                          <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Card>
                )}
              />
            </>
          ) : (
            /* Sub-tab: Day-specific slot timing (slotDayTab > 0) */
            <>
              <View style={styles.dayConfigHeader}>
                <View style={{ flex: 1 }}>
                  <TouchableOpacity
                    style={styles.backToStandardBtn}
                    onPress={() => setSlotDayTab(0)}
                  >
                    <Ionicons name="arrow-back" size={13} color={Colors.primary} />
                    <Text style={styles.backToStandardBtnText}>Genel Standart Saatlere Dön</Text>
                  </TouchableOpacity>

                  <View style={styles.dayTitleRow}>
                    <Text style={styles.sectionTitle}>{currentSelectedDayObj?.name} Ders Saatleri</Text>
                    {isSelectedDayCustom ? (
                      <View style={styles.customBadgeActive}>
                        <Text style={styles.customBadgeActiveText}>Özel Saatler Aktif</Text>
                      </View>
                    ) : (
                      <View style={styles.standardBadge}>
                        <Text style={styles.standardBadgeText}>Standart Saatler</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.sectionSub}>
                    {isSelectedDayCustom
                      ? `${currentSelectedDayObj?.name} gününe özel saat düzeni uygulanıyor.`
                      : `Şu an genel standart saatler uygulanıyor.`}
                  </Text>
                </View>

                {isSelectedDayCustom ? (
                  <TouchableOpacity
                    style={styles.resetBtn}
                    onPress={() => handleResetCustomDay(slotDayTab)}
                  >
                    <Ionicons name="refresh-outline" size={14} color={Colors.danger} />
                    <Text style={styles.resetBtnText}>Standarta Dön</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.activateBtn}
                    onPress={() => handleActivateCustomDay(slotDayTab)}
                  >
                    <Ionicons name="flash" size={14} color="#fff" />
                    <Text style={styles.activateBtnText}>Özel Saat Tanımla</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!isSelectedDayCustom && (
                <View style={[styles.infoBanner, { marginHorizontal: 16, marginBottom: 12 }]}>
                  <Ionicons name="bulb-outline" size={18} color="#D97706" />
                  <Text style={styles.infoBannerText}>
                    {currentSelectedDayObj?.name} gününde Cuma namazı, farklı öğle arası veya özel teneffüs süreleri varsa &apos;Özel Saat Tanımla&apos; butonuna veya aşağıdaki herhangi bir dersin ✏️ kalem simgesine dokunarak saatleri bu güne özel değiştirebilirsiniz.
                  </Text>
                </View>
              )}

              <FlatList
                data={daySlots}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={styles.listPadding}
                renderItem={({ item }) => (
                  <Card style={[styles.itemCard, item.is_custom_time && styles.itemCardCustom]}>
                    <View style={styles.itemRow}>
                      <View style={[styles.numBadge, item.is_custom_time && styles.numBadgeCustom]}>
                        <Text style={[styles.numBadgeText, item.is_custom_time && styles.numBadgeTextCustom]}>
                          {item.slot_number}
                        </Text>
                      </View>
                      <View style={styles.itemInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.itemName}>{item.slot_name}</Text>
                          {item.is_custom_time ? (
                            <View style={styles.slotTagCustom}>
                              <Text style={styles.slotTagCustomText}>Güne Özel</Text>
                            </View>
                          ) : (
                            <View style={styles.slotTagStd}>
                              <Text style={styles.slotTagStdText}>Standart</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.itemSub, item.is_custom_time && { color: Colors.primaryDark, fontWeight: '700' }]}>
                          {item.start_time} - {item.end_time}
                        </Text>
                      </View>
                      <View style={styles.itemActions}>
                        <TouchableOpacity
                          style={[styles.iconBtn, isSelectedDayCustom && { backgroundColor: Colors.primaryLight }]}
                          onPress={async () => {
                            if (!isSelectedDayCustom) {
                              try {
                                await copyStandardSlotsToDay(slotDayTab);
                                await loadData();
                                handleOpenEditDaySlot(item);
                              } catch (e) {
                                Alert.alert('Hata', 'Özel saatler başlatılamadı.');
                              }
                            } else {
                              handleOpenEditDaySlot(item);
                            }
                          }}
                        >
                          <Ionicons
                            name="pencil"
                            size={16}
                            color={Colors.primary}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Card>
                )}
              />
            </>
          )}
        </View>
      )}

      {/* Course Modal */}
      <Modal visible={courseModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>
              {editingCourse ? 'Ders Adını Düzenle' : 'Yeni Ders Tanımla'}
            </Text>
            <Input
              label="Ders Adı *"
              placeholder="Örn: Seçmeli Fizik, Hedef Temelli Destek Eğitimi"
              value={courseNameInput}
              onChangeText={setCourseNameInput}
            />
            <Input
              label="Kısa Kod (Opsiyonel)"
              placeholder="Örn: S.FZK, HDTE2, FİZ"
              value={courseCodeInput}
              onChangeText={setCourseCodeInput}
              autoCapitalize="characters"
            />
            <View style={styles.modalActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setCourseModal(false)}
              />
              <Button title="Kaydet" style={{ flex: 1 }} onPress={handleSaveCourse} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Standard Slot Modal */}
      <Modal visible={slotModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>
              {editingSlot ? 'Standart Ders Saatini Düzenle' : 'Yeni Ders Saati Ekle'}
            </Text>
            <Input
              label="Sıra Numarası *"
              placeholder="Örn: 1, 2, 3"
              value={slotNumInput}
              onChangeText={setSlotNumInput}
              keyboardType="numeric"
            />
            <Input
              label="Etiket / İsim *"
              placeholder="Örn: 1. Ders"
              value={slotNameInput}
              onChangeText={setSlotNameInput}
            />
            <View style={styles.slotInputsRow}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Başlangıç Saati *"
                  placeholder="10:00"
                  value={slotStartInput}
                  onChangeText={setSlotStartInput}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Bitiş Saati *"
                  placeholder="10:50"
                  value={slotEndInput}
                  onChangeText={setSlotEndInput}
                />
              </View>
            </View>
            <View style={styles.modalActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setSlotModal(false)}
              />
              <Button title="Kaydet" style={{ flex: 1 }} onPress={handleSaveSlot} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Day-Specific Slot Edit Modal */}
      <Modal visible={daySlotModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalTitle}>
                  {currentSelectedDayObj?.name} - {editingDaySlot?.slot_name}
                </Text>
                <Text style={styles.modalSubTitle}>Bu güne özel ders saati aralığı</Text>
              </View>
              <TouchableOpacity onPress={() => setDaySlotModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.slotInputsRow}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Başlangıç Saati *"
                  placeholder="Örn: 11:40"
                  value={daySlotStartInput}
                  onChangeText={setDaySlotStartInput}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Bitiş Saati *"
                  placeholder="Örn: 12:20"
                  value={daySlotEndInput}
                  onChangeText={setDaySlotEndInput}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setDaySlotModal(false)}
              />
              <Button title="Saati Kaydet" style={{ flex: 1 }} onPress={handleSaveDaySlot} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: Colors.primary,
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabBtnTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  tabContent: {
    flex: 1,
  },
  contentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sectionSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  daySelectorBar: {
    backgroundColor: Colors.card,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  daySelectorScroll: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  dayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 5,
  },
  dayChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dayChipHasCustom: {
    borderColor: '#F59E0B',
    backgroundColor: '#FEF3C7',
  },
  dayChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  dayChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  dayChipTextCustom: {
    color: '#B45309',
    fontWeight: '700',
  },
  customDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    gap: 10,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    color: Colors.primaryDark,
    lineHeight: 18,
  },
  dayConfigHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  dayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customBadgeActive: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#31C48D',
  },
  customBadgeActiveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#03543F',
  },
  standardBadge: {
    backgroundColor: Colors.cardSubtle,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  standardBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 5,
  },
  activateBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  resetBtnText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  listPadding: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  itemCard: {
    padding: 12,
    marginBottom: 8,
  },
  itemCardCustom: {
    borderColor: '#F59E0B',
    borderWidth: 1,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeBadge: {
    minWidth: 44,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    paddingHorizontal: 6,
  },
  codeText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  numBadge: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  numBadgeCustom: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  numBadgeText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primary,
  },
  numBadgeTextCustom: {
    color: '#B45309',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  itemSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  slotTagCustom: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  slotTagCustomText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  slotTagStd: {
    backgroundColor: Colors.cardSubtle,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  slotTagStdText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    padding: 7,
    borderRadius: 6,
    backgroundColor: Colors.cardSubtle,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  modalSubTitle: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  slotInputsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  clearSlotsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    gap: 3,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  clearSlotsBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.dangerDark,
  },
  emptySlotsBox: {
    alignItems: 'center',
    padding: 28,
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginVertical: 10,
  },
  emptySlotsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 10,
  },
  emptySlotsSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  emptySlotsActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  daySelectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  daySelectorTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  daySelectorHint: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  customDayPromoCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  promoHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  promoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  promoSub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
    lineHeight: 16,
  },
  promoDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
  },
  promoDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  promoDayBtnCustom: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  promoDayBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  promoDayBtnTextCustom: {
    color: '#92400E',
    fontWeight: '700',
  },
  backToStandardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    marginBottom: 6,
  },
  backToStandardBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  autoLoadCard: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  autoLoadHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  autoLoadIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoLoadTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  autoLoadSub: {
    fontSize: 11,
    color: '#4338CA',
    marginTop: 2,
    lineHeight: 16,
  },
  autoLoadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
    marginTop: 4,
  },
  autoLoadBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
