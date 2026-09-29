import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import {
  getLessonSlots,
  getScheduleByDay,
  saveScheduleSlot,
  getCourses,
  getWeeklySchedule,
  getSlotsForDay,
  getCustomDaysWithOverrides,
  saveDaySlotTime,
  loadOfficialWeeklySchedule,
  clearEntireSchedule,
} from '../database/operations/scheduleOperations';
import { getClasses } from '../database/operations/classOperations';
import { exportScheduleToExcel } from '../utils/excelService';
import { DAYS_OF_WEEK, getDayOfWeekIndex, isTimeBetween, getCurrentTimeString } from '../utils/dateUtils';
import { DaySlotInfo, ScheduleItem, CourseName, ClassItem } from '../types';

export const ScheduleScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const [selectedDay, setSelectedDay] = useState<number>(() => {
    const idx = getDayOfWeekIndex();
    return idx > 5 ? 1 : idx; // default to today (or Monday if weekend)
  });

  const [slots, setSlots] = useState<DaySlotInfo[]>([]);
  const [customDays, setCustomDays] = useState<number[]>([]);
  const [daySchedule, setDaySchedule] = useState<ScheduleItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [courses, setCourses] = useState<CourseName[]>([]);

  // Slot Edit Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [activeSlot, setActiveSlot] = useState<DaySlotInfo | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [classroomInput, setClassroomInput] = useState('');

  // Inline time edit inside modal
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [slotStartInput, setSlotStartInput] = useState('');
  const [slotEndInput, setSlotEndInput] = useState('');

  const loadData = async () => {
    try {
      const [daySlots, cls, crs, cDays, currentDayItems] = await Promise.all([
        getSlotsForDay(selectedDay),
        getClasses(),
        getCourses(),
        getCustomDaysWithOverrides(),
        getScheduleByDay(selectedDay),
      ]);
      setSlots(daySlots);
      setClasses(cls);
      setCourses(crs);
      setCustomDays(cDays);
      setDaySchedule(currentDayItems);
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [selectedDay])
  );

  const handleOpenSlotModal = (slot: DaySlotInfo) => {
    setActiveSlot(slot);
    const existing = daySchedule.find((item) => item.slot_id === slot.id);
    setSelectedClassId(existing?.class_id || null);
    setSelectedCourseId(existing?.course_id || null);
    setClassroomInput(existing?.classroom || '');
    setSlotStartInput(slot.start_time);
    setSlotEndInput(slot.end_time);
    setIsEditingTime(false);
    setModalVisible(true);
  };

  const handleSaveSlot = async () => {
    if (!activeSlot) return;
    try {
      // If user modified time for this day
      if (
        isEditingTime &&
        slotStartInput.trim() &&
        slotEndInput.trim() &&
        (slotStartInput.trim() !== activeSlot.start_time || slotEndInput.trim() !== activeSlot.end_time)
      ) {
        await saveDaySlotTime(
          selectedDay,
          activeSlot.id,
          slotStartInput.trim(),
          slotEndInput.trim()
        );
      }

      await saveScheduleSlot(
        selectedDay,
        activeSlot.id,
        selectedClassId,
        selectedCourseId,
        classroomInput.trim()
      );
      setModalVisible(false);
      loadData();
    } catch (e) {
      Alert.alert('Hata', 'Ders programı kaydedilemedi.');
    }
  };

  const handleClearSlot = async () => {
    if (!activeSlot) return;
    try {
      await saveScheduleSlot(selectedDay, activeSlot.id, null, null);
      setModalVisible(false);
      loadData();
    } catch (e) {
      Alert.alert('Hata', 'Kayıt temizlenemedi.');
    }
  };

  const handleExportSchedule = async () => {
    try {
      const allSlots = await getLessonSlots();
      const allSchedule = await getWeeklySchedule();
      await exportScheduleToExcel(allSlots, allSchedule);
    } catch (e) {
      Alert.alert('Hata', 'Excel programı oluşturulamadı.');
    }
  };

  const handleLoadOfficialSchedule = () => {
    Alert.alert(
      'Okul Programını Otomatik Yükle',
      'Kamil Miras Anadolu Lisesi haftalık ders programı (27 Saat) yüklenecektir:\n\n' +
        '• S.FZK (Seçmeli Fizik) - 24 Saat\n' +
        '• HDTE2 (Hedef Temelli Destek Eğitimi 2) - 3 Saat\n' +
        '• Şubeler: 11-A, 11-B, 11-C, 12-C, 12-D, 12-E\n\n' +
        '⚠️ Kural: Önceden tanımladığınız özel ders saatleriniz (başlangıç/bitiş zamanları) KORUNUR, sadece 27 ders saatinin şube ve ders kodları atanır.\n\n' +
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
                  `• Dersler: ${res.coursesEnsured.map((c) => `${c.code} (${c.name})`).join(', ')}\n` +
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

  const handleClearEntireSchedule = () => {
    Alert.alert(
      'Haftalık Ders Programını Temizle',
      'Haftalık programdaki tüm gün ve saatlere ait şube ve ders atamaları tamamen silinecektir.\n\nBu işlemi onaylıyor musunuz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Programı Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearEntireSchedule();
              await loadData();
              Alert.alert('Başarılı', 'Haftalık ders programı başarıyla sıfırlandı.');
            } catch (err: any) {
              Alert.alert('Hata', 'Program silinirken bir sorun oluştu: ' + (err?.message || err));
            }
          },
        },
      ]
    );
  };

  const currentTime = getCurrentTimeString();
  const currentDayIndex = getDayOfWeekIndex();
  const currentDayObj = DAYS_OF_WEEK.find((d) => d.id === selectedDay);
  const isCurrentDayCustom = customDays.includes(selectedDay);

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.headerTitle}>Haftalık Ders Programı</Text>
          <Text style={styles.headerSub}>Şube ve ders saatleri yönetimi</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.actionBtnIcon, { backgroundColor: '#EEF2FF' }]}
            onPress={handleLoadOfficialSchedule}
            accessibilityLabel="Okul Programını Otomatik Yükle"
          >
            <Ionicons name="cloud-download-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtnIcon}
            onPress={() => navigation.navigate('ScheduleManage', { initialTab: 'slots', initialDay: selectedDay })}
            accessibilityLabel="Saat & Ders Ayarları"
          >
            <Ionicons name="settings-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtnIcon}
            onPress={handleExportSchedule}
            accessibilityLabel="Excel'e Aktar"
          >
            <Ionicons name="share-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtnIcon, { backgroundColor: '#FEE2E2' }]}
            onPress={handleClearEntireSchedule}
            accessibilityLabel="Programı Temizle"
          >
            <Ionicons name="trash-outline" size={20} color={Colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Days Selector */}
      <View style={styles.daysBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysScroll}>
          {DAYS_OF_WEEK.slice(0, 6).map((day) => {
            const isSelected = selectedDay === day.id;
            const isToday = currentDayIndex === day.id;
            const hasCustom = customDays.includes(day.id);
            return (
              <TouchableOpacity
                key={day.id}
                style={[
                  styles.dayTab,
                  isSelected && styles.dayTabActive,
                  hasCustom && !isSelected && styles.dayTabCustom,
                ]}
                onPress={() => setSelectedDay(day.id)}
              >
                <View style={styles.dayTabContent}>
                  <Text style={[styles.dayTabText, isSelected && styles.dayTabTextActive]}>
                    {day.shortName}
                  </Text>
                  {hasCustom && (
                    <View style={[styles.customIndicatorDot, isSelected && { backgroundColor: '#fff' }]} />
                  )}
                </View>
                {isToday && (
                  <View
                    style={[
                      styles.todayIndicator,
                      isSelected ? { backgroundColor: '#fff' } : null,
                    ]}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Custom Day Info Banner */}
      {isCurrentDayCustom && (
        <View style={styles.customBanner}>
          <View style={styles.customBannerTextWrap}>
            <Ionicons name="time" size={16} color="#B45309" />
            <Text style={styles.customBannerText}>
              {currentDayObj?.name} gününe özel ders saatleri uygulanıyor.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.customBannerBtn}
            onPress={() => navigation.navigate('ScheduleManage', { initialTab: 'slots', initialDay: selectedDay })}
          >
            <Text style={styles.customBannerBtnText}>Saatleri Düzenle</Text>
            <Ionicons name="chevron-forward" size={12} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Lesson Slots List for Day */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {slots.length === 0 ? (
          <Card style={styles.emptySlotsCard}>
            <Text style={styles.emptySlotsText}>Ders saati tanımlı değil.</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button
                title="Saatleri Tanımla"
                size="sm"
                onPress={() => navigation.navigate('ScheduleManage', { initialTab: 'slots' })}
              />
              <Button
                title="Okul Programını Yükle (27 Saat)"
                variant="outline"
                size="sm"
                icon="cloud-download-outline"
                onPress={handleLoadOfficialSchedule}
              />
            </View>
          </Card>
        ) : (
          slots.map((slot) => {
            const match = daySchedule.find((item) => item.slot_id === slot.id);
            const hasLesson = match && (match.class_name || match.course_name);
            const isNow =
              selectedDay === currentDayIndex &&
              isTimeBetween(currentTime, slot.start_time, slot.end_time);

            return (
              <TouchableOpacity
                key={slot.id}
                activeOpacity={0.8}
                onPress={() => handleOpenSlotModal(slot)}
              >
                <Card
                  style={[styles.slotCard, isNow && styles.slotCardNow]}
                  highlightBorder={isNow ? Colors.success : hasLesson ? Colors.primary : undefined}
                >
                  <View style={styles.slotRow}>
                    <View style={styles.slotTimeWrap}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.slotNum}>{slot.slot_name}</Text>
                        {slot.is_custom_time && (
                          <View style={styles.customSlotBadge}>
                            <Text style={styles.customSlotBadgeText}>Özel</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.slotTimes, slot.is_custom_time && styles.slotTimesCustom]}>
                        {slot.start_time} - {slot.end_time}
                      </Text>
                    </View>

                    <View style={styles.slotDivider} />

                    <View style={styles.slotContentWrap}>
                      {hasLesson ? (
                        <>
                          <View style={styles.slotTitleRow}>
                            <Text style={styles.slotClass}>{match.class_name || '-'}</Text>
                            {isNow && (
                              <View style={styles.nowBadge}>
                                <Text style={styles.nowBadgeText}>Şu An</Text>
                              </View>
                            )}
                          </View>
                          <View style={styles.courseTagRow}>
                            {match.course_code ? (
                              <View
                                style={[
                                  styles.courseCodeBadge,
                                  { backgroundColor: match.course_color ? `${match.course_color}18` : Colors.primaryLight },
                                  { borderColor: match.course_color || Colors.primary },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.courseCodeBadgeText,
                                    { color: match.course_color || Colors.primaryDark },
                                  ]}
                                >
                                  {match.course_code}
                                </Text>
                              </View>
                            ) : null}
                            <Text style={styles.slotCourse} numberOfLines={1}>
                              {match.course_name || '-'}
                            </Text>
                          </View>
                          {match.classroom && (
                            <Text style={styles.slotRoom}>Derslik: {match.classroom}</Text>
                          )}
                        </>
                      ) : (
                        <View style={styles.emptySlotContent}>
                          <Text style={styles.emptySlotLabel}>Boş Ders</Text>
                          <Text style={styles.emptySlotSub}>Ders atamak için tıklayın</Text>
                        </View>
                      )}
                    </View>

                    <Ionicons name="create-outline" size={18} color={Colors.textMuted} />
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Edit Slot Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{activeSlot?.slot_name} Düzenle</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Text style={styles.modalSub}>
                    {currentDayObj?.name} ({activeSlot?.start_time} - {activeSlot?.end_time})
                  </Text>
                  {activeSlot?.is_custom_time && (
                    <View style={styles.customSlotBadge}>
                      <Text style={styles.customSlotBadgeText}>Güne Özel Saat</Text>
                    </View>
                  )}
                </View>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              {/* Optional inline day-time modifier */}
              <TouchableOpacity
                style={styles.timeEditToggle}
                onPress={() => setIsEditingTime(!isEditingTime)}
              >
                <Ionicons
                  name={isEditingTime ? 'chevron-up' : 'time-outline'}
                  size={15}
                  color={Colors.primary}
                />
                <Text style={styles.timeEditToggleText}>
                  {isEditingTime
                    ? 'Saat düzenlemeyi gizle'
                    : `Bu günün saatini (${activeSlot?.start_time} - ${activeSlot?.end_time}) değiştir`}
                </Text>
              </TouchableOpacity>

              {isEditingTime && (
                <View style={styles.inlineTimeCard}>
                  <Text style={styles.inlineTimeTitle}>
                    {currentDayObj?.name} Günü {activeSlot?.slot_name} Saati:
                  </Text>
                  <View style={styles.inlineTimeInputsRow}>
                    <View style={{ flex: 1 }}>
                      <Input
                        label="Başlangıç"
                        placeholder="Örn: 11:40"
                        value={slotStartInput}
                        onChangeText={setSlotStartInput}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Input
                        label="Bitiş"
                        placeholder="Örn: 12:20"
                        value={slotEndInput}
                        onChangeText={setSlotEndInput}
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* Select Class */}
              <Text style={styles.selectLabel}>Şube Seçin:</Text>
              <View style={styles.selectGrid}>
                {classes.map((c) => {
                  const isSel = selectedClassId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.selOption, isSel && styles.selOptionActive]}
                      onPress={() => setSelectedClassId(isSel ? null : c.id)}
                    >
                      <Text style={[styles.selOptionText, isSel && styles.selOptionTextActive]}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Select Course */}
              <Text style={styles.selectLabel}>Ders Seçin:</Text>
              <View style={styles.selectGrid}>
                {courses.map((crs) => {
                  const isSel = selectedCourseId === crs.id;
                  return (
                    <TouchableOpacity
                      key={crs.id}
                      style={[styles.selOption, isSel && styles.selOptionActive]}
                      onPress={() => setSelectedCourseId(isSel ? null : crs.id)}
                    >
                      <Text style={[styles.selOptionText, isSel && styles.selOptionTextActive]}>
                        {crs.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Optional Classroom input */}
              <Input
                label="Derslik / Sınıf (Opsiyonel)"
                placeholder="Örn: Fizik Lab, 204 vb."
                value={classroomInput}
                onChangeText={setClassroomInput}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title="Boşalt"
                variant="outline"
                style={{ flex: 1 }}
                onPress={handleClearSlot}
              />
              <Button
                title="Kaydet"
                style={{ flex: 2 }}
                onPress={handleSaveSlot}
              />
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtnIcon: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
  },
  daysBar: {
    backgroundColor: Colors.card,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  daysScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  dayTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  dayTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dayTabCustom: {
    borderColor: '#F59E0B',
    backgroundColor: '#FEF3C7',
  },
  dayTabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dayTabText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  dayTabTextActive: {
    color: Colors.textInverse,
  },
  customIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
  },
  todayIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
    marginTop: 4,
  },
  customBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  customBannerTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  customBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
  },
  customBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 2,
    paddingHorizontal: 6,
    backgroundColor: '#fff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  customBannerBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  emptySlotsCard: {
    padding: 24,
    alignItems: 'center',
    marginTop: 20,
  },
  emptySlotsText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  slotCard: {
    marginBottom: 10,
    padding: 12,
  },
  slotCardNow: {
    backgroundColor: '#F0FDF4',
    borderColor: Colors.success,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slotTimeWrap: {
    width: 86,
  },
  slotNum: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  customSlotBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  customSlotBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B45309',
  },
  slotTimes: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  slotTimesCustom: {
    color: '#B45309',
    fontWeight: '700',
  },
  slotDivider: {
    width: 1,
    height: 38,
    backgroundColor: Colors.border,
    marginHorizontal: 12,
  },
  slotContentWrap: {
    flex: 1,
  },
  slotTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  slotClass: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  nowBadge: {
    backgroundColor: Colors.success,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  nowBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  slotCourse: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 1,
  },
  slotRoom: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  emptySlotContent: {
    justifyContent: 'center',
  },
  emptySlotLabel: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  emptySlotSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
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
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalSub: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  timeEditToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.cardSubtle,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timeEditToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  inlineTimeCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inlineTimeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  inlineTimeInputsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  selectLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 8,
    marginTop: 4,
  },
  selectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  selOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  selOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  selOptionTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  courseTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  courseCodeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  courseCodeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
