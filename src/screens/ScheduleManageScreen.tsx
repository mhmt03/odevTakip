import React, { useState, useCallback } from 'react';
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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
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
} from '../database/operations/scheduleOperations';
import { CourseName, LessonSlot } from '../types';

export const ScheduleManageScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState<'courses' | 'slots'>('courses');

  // Courses state
  const [courses, setCourses] = useState<CourseName[]>([]);
  const [courseModal, setCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseName | null>(null);
  const [courseNameInput, setCourseNameInput] = useState('');
  const [courseCodeInput, setCourseCodeInput] = useState('');

  // Slots state
  const [slots, setSlots] = useState<LessonSlot[]>([]);
  const [slotModal, setSlotModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState<LessonSlot | null>(null);
  const [slotNumInput, setSlotNumInput] = useState('');
  const [slotNameInput, setSlotNameInput] = useState('');
  const [slotStartInput, setSlotStartInput] = useState('');
  const [slotEndInput, setSlotEndInput] = useState('');

  const loadData = async () => {
    try {
      const crs = await getCourses();
      setCourses(crs);
      const slt = await getLessonSlots();
      setSlots(slt);
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

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

  // Slot handlers
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

    try {
      if (editingSlot) {
        await updateLessonSlot(editingSlot.id, num, slotNameInput, slotStartInput, slotEndInput);
      } else {
        await createLessonSlot(num, slotNameInput, slotStartInput, slotEndInput);
      }
      setSlotModal(false);
      loadData();
    } catch (e) {
      Alert.alert('Hata', 'Ders saati kaydedilemedi. Bu sıra numarası zaten mevcut olabilir.');
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

  return (
    <View style={styles.container}>
      <Header
        title="Tanımlamalar"
        subtitle="Ders Adları ve Saat Aralıkları"
        showBack
        onBack={() => navigation.goBack()}
      />

      {/* Tabs */}
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
          <View style={styles.contentHeader}>
            <Text style={styles.sectionTitle}>Haftalık Ders Saatleri</Text>
            <Button title="Saat Ekle" icon="add" size="sm" onPress={handleOpenAddSlot} />
          </View>

          <FlatList
            data={slots}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.listPadding}
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
              placeholder="Örn: Fizik, Astronomi, Kimya"
              value={courseNameInput}
              onChangeText={setCourseNameInput}
            />
            <Input
              label="Kısa Kod (Opsiyonel)"
              placeholder="Örn: FİZ, AST"
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

      {/* Slot Modal */}
      <Modal visible={slotModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>
              {editingSlot ? 'Ders Saatini Düzenle' : 'Yeni Ders Saati Ekle'}
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
  listPadding: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  itemCard: {
    padding: 12,
    marginBottom: 8,
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
  numBadgeText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primary,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  itemSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    padding: 6,
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
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  slotInputsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
});
