import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors } from '../theme/colors';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { getClasses } from '../database/operations/classOperations';
import { getStudentsByClass } from '../database/operations/studentOperations';
import { createAssignment } from '../database/operations/assignmentOperations';
import { formatDateToTR, getTodayDateString } from '../utils/dateUtils';
import { ClassItem, Student } from '../types';

export const AssignmentCreateScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Dates
  const [assignedDate, setAssignedDate] = useState<Date>(new Date());
  const [dueDate, setDueDate] = useState<Date>(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 1 week later
  );
  const [showDatePicker, setShowDatePicker] = useState<'assigned' | 'due' | null>(null);

  // Students and their checkbox selections
  const [students, setStudents] = useState<Student[]>([]);
  // map studentId -> boolean (true = checked/not exempt, false = unchecked/exempt)
  const [selections, setSelections] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadClasses();
  }, []);

  const loadClasses = async () => {
    try {
      const data = await getClasses();
      setClasses(data);
      if (data.length > 0) {
        handleSelectClass(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectClass = async (classId: number) => {
    setSelectedClassId(classId);
    try {
      const studs = await getStudentsByClass(classId);
      setStudents(studs);
      // Requirement: "şubeyi seçince öğrencilerin isimleri ve yanlarında işaretli olarak checkboxlar gelir. bu sayede ödevden muaf öğrencilerin işareti kaldırılabilir."
      const initialMap: Record<number, boolean> = {};
      studs.forEach((s) => {
        initialMap[s.id] = true; // default all checked
      });
      setSelections(initialMap);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleStudent = (studentId: number) => {
    setSelections((prev) => ({
      ...prev,
      [studentId]: !prev[studentId],
    }));
  };

  const selectAll = () => {
    const map: Record<number, boolean> = {};
    students.forEach((s) => (map[s.id] = true));
    setSelections(map);
  };

  const unselectAll = () => {
    const map: Record<number, boolean> = {};
    students.forEach((s) => (map[s.id] = false));
    setSelections(map);
  };

  const handleSave = async () => {
    if (!selectedClassId) {
      Alert.alert('Uyarı', 'Lütfen bir şube seçiniz.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Uyarı', 'Lütfen ödev konusunu giriniz.');
      return;
    }

    const assignedDateStr = assignedDate.toISOString().split('T')[0];
    const dueDateStr = dueDate.toISOString().split('T')[0];

    const studentSelections = students.map((s) => ({
      studentId: s.id,
      isSelected: !!selections[s.id],
    }));

    try {
      setLoading(true);
      await createAssignment({
        classId: selectedClassId,
        title: title.trim(),
        description: description.trim(),
        assignedDate: assignedDateStr,
        dueDate: dueDateStr,
        studentSelections,
      });

      const exemptCount = studentSelections.filter((s) => !s.isSelected).length;
      Alert.alert(
        'Başarılı',
        `Ödev oluşturuldu. ${studentSelections.length - exemptCount} öğrenciye atandı${exemptCount > 0 ? `, ${exemptCount} öğrenci muaf tutuldu` : ''}.`,
        [{ text: 'Tamam', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert('Hata', 'Ödev kaydedilirken bir hata meydana geldi.');
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = Object.values(selections).filter(Boolean).length;
  const exemptCount = students.length - selectedCount;

  return (
    <View style={styles.container}>
      <Header
        title="Yeni Ödev Ver"
        subtitle="Şube seçimi ve ödevlendirme"
        showBack
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Class Selection Chips */}
        <Text style={styles.sectionTitle}>1. Şube Seçimi</Text>
        {classes.length === 0 ? (
          <Card style={styles.noClassCard}>
            <Text style={styles.noClassText}>Ödev vermek için önce şube eklemelisiniz.</Text>
          </Card>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
            {classes.map((c) => {
              const isSelected = selectedClassId === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chip, isSelected && styles.chipActive]}
                  onPress={() => handleSelectClass(c.id)}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                    {c.name}
                  </Text>
                  <Text style={[styles.chipCount, isSelected && styles.chipCountActive]}>
                    ({c.student_count || 0})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Assignment Info Inputs */}
        <Text style={styles.sectionTitle}>2. Ödev Detayları</Text>
        <Input
          label="Ödev Konusu *"
          placeholder="Örn: Newton Hareket Yasaları Soru Çözümü"
          value={title}
          onChangeText={setTitle}
        />

        <Input
          label="Açıklama / Sayfalar (Opsiyonel)"
          placeholder="Örn: Ders kitabı sayfa 45-48 arası tüm sorular"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          style={{ minHeight: 70 }}
        />

        {/* Dates */}
        <View style={styles.datesRow}>
          <View style={styles.dateCol}>
            <Text style={styles.inputLabel}>Verilme Tarihi</Text>
            <TouchableOpacity
              style={styles.datePickerBtn}
              onPress={() => setShowDatePicker('assigned')}
            >
              <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
              <Text style={styles.datePickerText}>
                {formatDateToTR(assignedDate.toISOString().split('T')[0])}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dateCol}>
            <Text style={styles.inputLabel}>Teslim Tarihi</Text>
            <TouchableOpacity
              style={styles.datePickerBtn}
              onPress={() => setShowDatePicker('due')}
            >
              <Ionicons name="calendar-outline" size={18} color={Colors.danger} />
              <Text style={styles.datePickerText}>
                {formatDateToTR(dueDate.toISOString().split('T')[0])}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={showDatePicker === 'assigned' ? assignedDate : dueDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, selectedDate) => {
              const currentPicker = showDatePicker;
              setShowDatePicker(null);
              if (selectedDate) {
                if (currentPicker === 'assigned') setAssignedDate(selectedDate);
                else setDueDate(selectedDate);
              }
            }}
          />
        )}

        {/* Student Checklist */}
        <View style={styles.studentHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>3. Öğrenci Listesi</Text>
            <Text style={styles.studentSub}>
              {selectedCount} Seçili, {exemptCount} Muaf
            </Text>
          </View>
          <View style={styles.toggleBtnGroup}>
            <TouchableOpacity style={styles.toggleBtn} onPress={selectAll}>
              <Text style={styles.toggleBtnText}>Tümü</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.toggleBtn} onPress={unselectAll}>
              <Text style={styles.toggleBtnText}>Kaldır</Text>
            </TouchableOpacity>
          </View>
        </View>

        {students.length === 0 ? (
          <Card style={styles.noStudentsCard}>
            <Text style={styles.noClassText}>Seçilen şubede kayıtlı öğrenci bulunmuyor.</Text>
          </Card>
        ) : (
          students.map((student) => {
            const isChecked = !!selections[student.id];
            return (
              <TouchableOpacity
                key={student.id}
                style={[styles.studentCheckRow, !isChecked && styles.studentRowExempt]}
                onPress={() => toggleStudent(student.id)}
                activeOpacity={0.7}
              >
                <View style={styles.checkbox}>
                  <Ionicons
                    name={isChecked ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={isChecked ? Colors.primary : Colors.textMuted}
                  />
                </View>

                <View style={styles.studentNoBox}>
                  <Text style={styles.studentNoText}>{student.student_number || '-'}</Text>
                </View>

                <View style={styles.studentTextWrapper}>
                  <Text style={[styles.studentFullName, !isChecked && styles.textMutedStyle]}>
                    {student.first_name} {student.last_name}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusIndicator,
                    isChecked ? styles.statusIncluded : styles.statusExempt,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusIndicatorText,
                      isChecked ? styles.statusIncludedText : styles.statusExemptText,
                    ]}
                  >
                    {isChecked ? 'Ödevlendirildi' : 'Muaf'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <View style={styles.bottomSpace} />
      </ScrollView>

      {/* Save Button */}
      <View style={styles.bottomBar}>
        <Button
          title={`Ödevi Kaydet (${selectedCount} Öğrenci)`}
          icon="checkmark-circle"
          loading={loading}
          disabled={students.length === 0 || !title.trim()}
          onPress={handleSave}
          size="lg"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
    marginTop: 6,
  },
  chipsScroll: {
    marginBottom: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
    gap: 6,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  chipTextActive: {
    color: Colors.textInverse,
  },
  chipCount: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  chipCountActive: {
    color: Colors.primaryLight,
  },
  noClassCard: {
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  noStudentsCard: {
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  noClassText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  datesRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  dateCol: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
  },
  datePickerText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  studentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  studentSub: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  toggleBtnGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  studentCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    marginBottom: 6,
  },
  studentRowExempt: {
    backgroundColor: Colors.cardSubtle,
    borderColor: '#E2E8F0',
    opacity: 0.85,
  },
  checkbox: {
    marginRight: 10,
  },
  studentNoBox: {
    minWidth: 36,
    height: 28,
    borderRadius: 6,
    backgroundColor: Colors.cardSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  studentNoText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  studentTextWrapper: {
    flex: 1,
  },
  studentFullName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  textMutedStyle: {
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  statusIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusIncluded: {
    backgroundColor: Colors.primaryLight,
  },
  statusExempt: {
    backgroundColor: '#E2E8F0',
  },
  statusIndicatorText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusIncludedText: {
    color: Colors.primary,
  },
  statusExemptText: {
    color: Colors.textSecondary,
  },
  bottomSpace: {
    height: 40,
  },
  bottomBar: {
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 14,
    marginBottom:50,
  },
});
