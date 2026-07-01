/** Shared shapes between API routes and the client. */
import type { VacationRange } from "@/lib/time";
import type { LevelInfo } from "@/lib/levels";

export interface Profile {
  id: string;
  name: string;
  user_email: string | null;
  parent_email: string | null;
  daily_goal_minutes: number;
  school_start: string;
  birthday: string | null;
  timezone: string;
  xp: number;
  nag_intensity: "mild" | "firm" | "brutal";
  vacations: VacationRange[];
  best_snake: number;
}

export interface Subject {
  id: string;
  name: string;
  short_name: string;
  level: string;
  current_grade: number | null;
  target_grade: number | null;
  priority: 1 | 2 | 3;
  color: string;
  sort: number;
}

export interface Task {
  id: string;
  subject_id: string | null;
  category: "subject" | "coursework" | "ee" | "supercurricular" | "university";
  title: string;
  details: string | null;
  week_hint: string | null;
  xp: number;
  done: boolean;
  done_at: string | null;
  sort: number;
}

export interface ActiveSession {
  id: string;
  subject_id: string | null;
  focus: string | null;
  started_at: string;
}

export interface MePayload {
  profile: Profile;
  subjects: Subject[];
  today: string; // local date
  todayMinutes: number;
  todayBySubject: Record<string, number>;
  activeSession: ActiveSession | null;
  streak: number;
  level: LevelInfo;
  daysToSchool: number;
  daysToBirthday: number;
  grindDays: number;
  onVacation: boolean;
  goalMet: boolean;
  nextTasks: (Task & { subjectName: string | null })[];
  tasksDone: number;
  tasksTotal: number;
}

export interface StatsPayload {
  days: { day: string; minutes: number }[]; // last 28, oldest first
  bySubject: { subject: Subject; minutes: number }[];
  totalMinutes: number;
  totalSessions: number;
  avgPerDay: number; // over days since holiday start
  projectedTotal: number; // by school start at current pace
  achievements: {
    code: string;
    name: string;
    desc: string;
    icon: string;
    unlocked_at: string | null;
  }[];
  taskGroups: {
    key: string;
    label: string;
    color: string | null;
    done: number;
    total: number;
    xpDone: number;
    xpTotal: number;
  }[];
}
