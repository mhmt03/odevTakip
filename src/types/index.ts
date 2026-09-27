export interface ClassItem {
  id: number;
  name: string; // e.g. "12-A", "10-B", "9-C"
  description?: string;
  created_at?: string;
  student_count?: number;
}

export interface Student {
  id: number;
  class_id: number;
  student_number: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  notes?: string;
  photo_uri?: string | null;
  created_at?: string;
}

export type AssignmentStatus = 'bekliyor' | 'yapildi' | 'yapilmadi' | 'eksik' | 'muaf';

export interface Assignment {
  id: number;
  class_id: number;
  class_name?: string;
  title: string;
  description?: string;
  assigned_date: string; // YYYY-MM-DD
  due_date: string; // YYYY-MM-DD
  created_at?: string;
  total_students?: number;
  completed_count?: number;
  missing_count?: number;
  pending_count?: number;
}

export interface AssignmentStudent {
  id: number;
  assignment_id: number;
  student_id: number;
  student_number: string;
  first_name: string;
  last_name: string;
  photo_uri?: string | null;
  is_exempt: number; // 0 = not exempt (needs to do homework), 1 = exempt
  status: AssignmentStatus;
  note?: string;
  updated_at?: string;
}

export interface StudentNote {
  id: number;
  student_id: number;
  class_id: number;
  student_name?: string;
  student_number?: string;
  class_name?: string;
  photo_uri?: string | null;
  note: string;
  note_date: string; // YYYY-MM-DD HH:mm
  created_at?: string;
}

export interface CourseName {
  id: number;
  name: string; // e.g. "Fizik", "Astronomi", "Matematik"
  code?: string;
  color?: string;
}

export interface LessonSlot {
  id: number;
  slot_number: number; // 1, 2, 3...
  slot_name: string; // "1. Ders", "2. Ders"
  start_time: string; // "10:00"
  end_time: string; // "10:50"
}

export interface DaySlotTime {
  id: number;
  day_of_week: number;
  slot_id: number;
  start_time: string;
  end_time: string;
}

export interface DaySlotInfo extends LessonSlot {
  is_custom_time?: boolean;
}

export interface ScheduleItem {
  id: number;
  day_of_week: number; // 1 = Pazartesi, 2 = Salı, ..., 5 = Cuma, 6 = Cumartesi, 7 = Pazar
  slot_id: number;
  slot_number?: number;
  slot_name?: string;
  start_time?: string;
  end_time?: string;
  is_custom_time?: boolean;
  class_id?: number | null;
  class_name?: string | null;
  course_id?: number | null;
  course_name?: string | null;
  course_code?: string | null;
  course_color?: string | null;
  classroom?: string | null;
}

export interface YearlyPlanItem {
  id: number;
  course_id: number;
  course_name?: string;
  class_id?: number | null;
  class_name?: string | null;
  week_number: number; // 1 to 36
  date_start?: string; // YYYY-MM-DD
  date_end?: string; // YYYY-MM-DD
  subject_topic: string; // Anlatılacak konu
  learning_outcomes?: string; // Kazanımlar / Açıklama
}
