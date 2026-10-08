import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '../theme/colors';
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
  checkOfficialSchedulePrerequisites,
  clearEntireSchedule,
  getSchedulePhotoUri,
  setSchedulePhotoUri,
} from '../database/operations/scheduleOperations';
import { getClasses } from '../database/operations/classOperations';
import { exportScheduleToExcel } from '../utils/excelService';
import { DAYS_OF_WEEK, getDayOfWeekIndex, isTimeBetween, getCurrentTimeString } from '../utils/dateUtils';
import { DaySlotInfo, ScheduleItem, CourseName, ClassItem } from '../types';
import { pickSchedulePhoto } from '../utils/photoService';

import { getActiveSchool, School } from '../database/operations/schoolOperations';

import { ensureGradesAndClassesDefined } from '../utils/setupChecks';
export const ScheduleScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const [selectedDay, setSelectedDay] = useState<number>(() => {
    return getDayOfWeekIndex(); // 1..7 (Pazartesi .. Pazar)
  });

  const [slots, setSlots] = useState<DaySlotInfo[]>([]);
  const [customDays, setCustomDays] = useState<number[]>([]);
  const [daySchedule, setDaySchedule] = useState<ScheduleItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [courses, setCourses] = useState<CourseName[]>([]);
  const [activeSchool, setActiveSchool] = useState<School | null>(null);

  // Schedule Photo State
  const [photoMenuVisible, setPhotoMenuVisible] = useState(false);
  const [photoViewModalVisible, setPhotoViewModalVisible] = useState(false);
  const [schedulePhotoUri, setSchedulePhotoUriState] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);

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
      const [daySlots, cls, crs, cDays, currentDayItems, savedPhoto, activeSch] = await Promise.all([
        getSlotsForDay(selectedDay),
        getClasses(),
        getCourses(),
        getCustomDaysWithOverrides(),
        getScheduleByDay(selectedDay),
        getSchedulePhotoUri(),
        getActiveSchool(),
      ]);
      setSlots(daySlots);
      setClasses(cls);
      setCourses(crs);
      setCustomDays(cDays);
      setDaySchedule(currentDayItems);
      setSchedulePhotoUriState(savedPhoto);
      setActiveSchool(activeSch);
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

  const handleLoadOfficialSchedule = async () => {
    try {
      const check = await checkOfficialSchedulePrerequisites();

      if (!check.isValid) {
        let alertMessage =
          'Ders programını resimden yükleyebilmek için programda yer alan ders kısa isimleri ve şubelerin sistemde tanımlı olması gerekmektedir:\n\n';

        if (check.missingCourseCodes.length > 0) {
          alertMessage += '❌ Sistemde Tanımlı Olmayan Ders Kısa İsimleri:\n';
          check.missingCourseCodes.forEach((c) => {
            alertMessage += `• ${c.code} (${c.defaultName})\n`;
          });
          alertMessage +=
            '👉 Lütfen "Programı Düzenle > Dersler" menüsünden bu dersleri ve kısa adlarını sisteme ekleyiniz.\n\n';
        }

        if (check.missingClasses.length > 0) {
          alertMessage += '❌ Sistemde Kayıtlı Olmayan Şubeler:\n';
          check.missingClasses.forEach((cls) => {
            alertMessage += `• ${cls}\n`;
          });
          alertMessage += '👉 Lütfen "Şubeler" bölümünden bu şubeleri sisteme ekleyiniz.\n';
        }

        const buttons: any[] = [{ text: 'Tamam', style: 'cancel' }];
        if (check.missingCourseCodes.length > 0) {
          buttons.push({
            text: 'Dersleri Ekle',
            onPress: () => navigation.navigate('ScheduleManage', { initialTab: 'courses' }),
          });
        }
        if (check.missingClasses.length > 0) {
          buttons.push({
            text: 'Şubeleri Ekle',
            onPress: () => navigation.navigate('Main', { screen: 'ClassesTab' }),
          });
        }

        Alert.alert('⚠️ Eksik Tanımlama Uyarısı', alertMessage.trim(), buttons);
        return;
      }

      Alert.alert(
        'Resimdeki Programı Otomatik Yükle',
        'Kamil Miras Anadolu Lisesi resmi haftalık ders programı (27 Saat) yüklenecektir:\n\n' +
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
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Ön kontroller yapılırken bir sorun oluştu.');
    }
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

  const handlePickSchedulePhoto = async (source: 'camera' | 'gallery') => {
    try {
      setPhotoMenuVisible(false);
      setLoadingPhoto(true);
      const targetPath = await pickSchedulePhoto(source);
      if (!targetPath) {
        setLoadingPhoto(false);
        return;
      }

      await setSchedulePhotoUri(targetPath);
      setSchedulePhotoUriState(targetPath);
      setLoadingPhoto(false);

      Alert.alert(
        'Ders Programı Fotoğrafı Kaydedildi 📸',
        'Fotoğraf başarıyla yüklendi. Dilediğiniz an "Fotoğrafı İncele" butonuyla ders programı fotoğrafınızı görüntüleyebilirsiniz.'
      );
    } catch (err: any) {
      setLoadingPhoto(false);
      Alert.alert('Hata', err?.message || 'Fotoğraf yüklenemedi.');
    }
  };

  const handleRemoveSchedulePhoto = async () => {
    Alert.alert(
      'Fotoğrafı Kaldır',
      'Kayıtlı ders programı fotoğrafını silmek istediğinize emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            await setSchedulePhotoUri(null);
            setSchedulePhotoUriState(null);
            setPhotoViewModalVisible(false);
            setPhotoMenuVisible(false);
          },
        },
      ]
    );
  };

  const currentTime = getCurrentTimeString();
  const currentDayIndex = getDayOfWeekIndex();
  const currentDayObj = DAYS_OF_WEEK.find((d) => d.id === selectedDay);
  const isCurrentDayCustom = customDays.includes(selectedDay);

  const schoolBgTint = activeSchool?.color ? `${activeSchool.color}0E` : Colors.background;

  return (
    <View style={[styles.container, { backgroundColor: schoolBgTint }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Haftalık Ders Programı</Text>
          <Text style={styles.headerSub}>
            {activeSchool?.name ? `${activeSchool.name} • Ders Programı` : 'Şube ve ders saatleri yönetimi (7 Gün)'}
          </Text>
        </View>

        <View style={styles.headerActionsBar}>
          <TouchableOpacity
            style={styles.photoHeaderBtn}
            onPress={() => setPhotoMenuVisible(true)}
            activeOpacity={0.8}
            accessibilityLabel="Fotoğraftan Yükle"
          >
            {loadingPhoto ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="camera" size={15} color="#FFF" />
                <Text style={styles.photoHeaderBtnText}>Fotoğraftan Yükle</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.headerIconButtonsGroup}>
            <TouchableOpacity
              style={styles.actionBtnIcon}
              onPress={() => navigation.navigate('ScheduleManage', { initialTab: 'slots', initialDay: selectedDay })}
              accessibilityLabel="Saat & Ders Ayarları"
            >
              <Ionicons name="settings-outline" size={19} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtnIcon}
              onPress={handleExportSchedule}
              accessibilityLabel="Excel'e Aktar"
            >
              <Ionicons name="share-outline" size={19} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtnIcon, { backgroundColor: '#FEE2E2' }]}
              onPress={handleClearEntireSchedule}
              accessibilityLabel="Programı Temizle"
            >
              <Ionicons name="trash-outline" size={19} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Saved Schedule Photo Indicator Bar */}
      {schedulePhotoUri ? (
        <View style={styles.photoSavedBanner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Ionicons name="image" size={17} color="#047857" />
            <Text style={styles.photoSavedBannerText}>Kayıtlı Ders Programı Fotoğrafı Mevcut</Text>
          </View>
          <TouchableOpacity
            style={styles.photoViewBtnSmall}
            onPress={() => setPhotoViewModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="eye-outline" size={14} color="#FFF" />
            <Text style={styles.photoViewBtnSmallText}>Fotoğrafı İncele</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Days Selector - 7 GÜN */}
      <View style={styles.daysBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysScroll}>
          {DAYS_OF_WEEK.map((day) => {
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
                  style={[
                    styles.slotCard, 
                    isNow && styles.slotCardNow,
                    hasLesson && activeSchool?.color ? { backgroundColor: '#FFFFFF', borderColor: `${activeSchool.color}40`, borderWidth: 1 } : null
                  ]}
                  highlightBorder={isNow ? Colors.success : hasLesson ? (activeSchool?.color || Colors.primary) : undefined}
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

      {/* Photo Import Action Modal (Camera / Gallery / Official) */}
      <Modal
        visible={photoMenuVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPhotoMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.photoModalOverlay}
          activeOpacity={1}
          onPress={() => setPhotoMenuVisible(false)}
        >
          <View style={styles.photoModalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />

            <View style={styles.photoModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.photoModalTitle}>Ders Programı Yükleme & Yönetim</Text>
                <Text style={styles.photoModalSub}>
                  Fotoğraftan kaydedin, hazır okul programını aktarın veya düzenleyin
                </Text>
              </View>
              <TouchableOpacity
                style={styles.photoModalCloseBtn}
                onPress={() => setPhotoMenuVisible(false)}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.photoModalOptions}>
              {/* Option 1: Kameradan Çek */}
              <TouchableOpacity
                style={styles.photoOptionCard}
                onPress={() => handlePickSchedulePhoto('camera')}
                activeOpacity={0.7}
              >
                <View style={[styles.photoOptionIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="camera" size={24} color="#DC2626" />
                </View>
                <View style={styles.photoOptionTextWrap}>
                  <Text style={styles.photoOptionTitle}>Kameradan Fotoğraf Çek</Text>
                  <Text style={styles.photoOptionDesc}>
                    Masadaki veya panodaki ders programı kağıdının fotoğrafını doğrudan çekin.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* Option 2: Galeriden Seç */}
              <TouchableOpacity
                style={styles.photoOptionCard}
                onPress={() => handlePickSchedulePhoto('gallery')}
                activeOpacity={0.7}
              >
                <View style={[styles.photoOptionIconWrap, { backgroundColor: '#EDE9FE' }]}>
                  <Ionicons name="images" size={24} color="#7C3AED" />
                </View>
                <View style={styles.photoOptionTextWrap}>
                  <Text style={styles.photoOptionTitle}>Galeriden Fotoğraf Seç</Text>
                  <Text style={styles.photoOptionDesc}>
                    Cihazınızdaki ders programı fotoğrafını veya ekran görüntüsünü seçin.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* Option 3: Hazır Okul Programını Yükle (27 Saat) */}
              <TouchableOpacity
                style={styles.photoOptionCard}
                onPress={() => {
                  setPhotoMenuVisible(false);
                  setTimeout(() => handleLoadOfficialSchedule(), 200);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.photoOptionIconWrap, { backgroundColor: '#DCFCE7' }]}>
                  <Ionicons name="cloud-download" size={24} color="#16A34A" />
                </View>
                <View style={styles.photoOptionTextWrap}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.photoOptionTitle}>Resimdeki Okul Programını Yükle</Text>
                    <View style={styles.autoLoadBadge}>
                      <Text style={styles.autoLoadBadgeText}>27 Saat</Text>
                    </View>
                  </View>
                  <Text style={styles.photoOptionDesc}>
                    Fotoğraftaki Kamil Miras AL haftalık ders dağılımını (S.FZK ve HDTE2) programa aktarır.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* Option 4: Ders Programını Düzenle & Saatleri Yönet */}
              <TouchableOpacity
                style={styles.photoOptionCard}
                onPress={() => {
                  setPhotoMenuVisible(false);
                  navigation.navigate('ScheduleManage', { initialTab: 'slots', initialDay: selectedDay });
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.photoOptionIconWrap, { backgroundColor: Colors.primaryLight }]}>
                  <Ionicons name="create-outline" size={24} color={Colors.primary} />
                </View>
                <View style={styles.photoOptionTextWrap}>
                  <Text style={styles.photoOptionTitle}>Ders Programını Düzenle & Saatleri Yönet</Text>
                  <Text style={styles.photoOptionDesc}>
                    Şubeler, ders saatleri ve haftalık ders programını manuel olarak düzenleyin.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* Option 5: Eğer Kayıtlı Fotoğraf Varsa */}
              {schedulePhotoUri ? (
                <TouchableOpacity
                  style={[styles.photoOptionCard, { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' }]}
                  onPress={() => {
                    setPhotoMenuVisible(false);
                    setTimeout(() => setPhotoViewModalVisible(true), 200);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.photoOptionIconWrap, { backgroundColor: '#D1FAE5' }]}>
                    <Ionicons name="eye" size={24} color="#059669" />
                  </View>
                  <View style={styles.photoOptionTextWrap}>
                    <Text style={[styles.photoOptionTitle, { color: '#065F46' }]}>Kayıtlı Fotoğrafı Görüntüle</Text>
                    <Text style={styles.photoOptionDesc}>
                      Daha önce yüklediğiniz ders programı fotoğrafını tam boyutta açıp inceleyin.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#059669" />
                </TouchableOpacity>
              ) : null}

              {/* Option 6: Ders Programını Sıfırla */}
              <TouchableOpacity
                style={[styles.photoOptionCard, { borderColor: '#FECACA' }]}
                onPress={() => {
                  setPhotoMenuVisible(false);
                  setTimeout(() => handleClearEntireSchedule(), 200);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.photoOptionIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="trash-outline" size={24} color={Colors.danger} />
                </View>
                <View style={styles.photoOptionTextWrap}>
                  <Text style={[styles.photoOptionTitle, { color: Colors.danger }]}>Haftalık Ders Programını Sıfırla</Text>
                  <Text style={styles.photoOptionDesc}>
                    Tüm günlerdeki şube ve ders atamalarını temizler.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Schedule Photo Viewer Modal */}
      <Modal
        visible={photoViewModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setPhotoViewModalVisible(false)}
      >
        <View style={styles.viewerModalOverlay}>
          <View style={styles.viewerModalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="image-outline" size={22} color="#FFF" />
              <Text style={styles.viewerModalTitle}>Ders Programı Fotoğrafı</Text>
            </View>
            <TouchableOpacity
              onPress={() => setPhotoViewModalVisible(false)}
              style={styles.viewerCloseBtn}
            >
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          {schedulePhotoUri ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.viewerScrollContent}
              maximumZoomScale={4}
              minimumZoomScale={1}
            >
              <Image
                source={{ uri: schedulePhotoUri }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            </ScrollView>
          ) : (
            <View style={styles.viewerEmptyWrap}>
              <Text style={{ color: '#FFF' }}>Fotoğraf bulunamadı.</Text>
            </View>
          )}

          <View style={styles.viewerBottomBar}>
            <TouchableOpacity
              style={styles.viewerChangeBtn}
              onPress={() => {
                setPhotoViewModalVisible(false);
                setTimeout(() => setPhotoMenuVisible(true), 200);
              }}
            >
              <Ionicons name="camera-reverse-outline" size={18} color="#FFF" />
              <Text style={styles.viewerChangeBtnText}>Fotoğrafı Değiştir</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.viewerDeleteBtn}
              onPress={handleRemoveSchedulePhoto}
            >
              <Ionicons name="trash-outline" size={18} color="#DC2626" />
              <Text style={styles.viewerDeleteBtnText}>Sil</Text>
            </TouchableOpacity>
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTop: {
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  headerActionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerIconButtonsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  actionBtnIcon: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
  },
  daysBar: {
    backgroundColor: Colors.card,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  daysScroll: {
    paddingHorizontal: 12,
    gap: 6,
  },
  dayTab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    minWidth: 42,
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
    justifyContent: 'center',
    gap: 3,
  },
  dayTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  dayTabTextActive: {
    color: Colors.textInverse,
  },
  customIndicatorDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#F59E0B',
  },
  todayIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
    marginTop: 2,
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
  photoHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    ...Shadows.small,
  },
  photoHeaderBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  photoSavedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderBottomWidth: 1,
    borderBottomColor: '#A7F3D0',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  photoSavedBannerText: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '600',
  },
  photoViewBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#059669',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  photoViewBtnSmallText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  photoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  photoModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    ...Shadows.large,
  },
  sheetHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#CBD5E1',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 14,
  },
  photoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  photoModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  photoModalSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  photoModalCloseBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  photoModalOptions: {
    gap: 10,
  },
  photoOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  photoOptionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoOptionTextWrap: {
    flex: 1,
  },
  photoOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  photoOptionDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  autoLoadBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  autoLoadBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  viewerModalOverlay: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  viewerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  viewerModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  viewerCloseBtn: {
    padding: 4,
  },
  viewerScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  viewerImage: {
    width: '100%',
    height: 450,
  },
  viewerEmptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerBottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    gap: 12,
  },
  viewerChangeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: 10,
  },
  viewerChangeBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  viewerDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  viewerDeleteBtnText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },
});
