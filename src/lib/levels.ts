/** XP levels + achievements. XP: 1/study-minute + each task's XP value. */

export const LEVELS = [
  { xp: 0, name: "Bed Rotter" },
  { xp: 200, name: "NPC" },
  { xp: 500, name: "Warm-Up Arc" },
  { xp: 1000, name: "Locked In (Lite)" },
  { xp: 1800, name: "Certified Grinder" },
  { xp: 2800, name: "Scholar" },
  { xp: 4200, name: "Exam Machine" },
  { xp: 6000, name: "42 Material" },
  { xp: 8500, name: "Sigma Scholar" },
  { xp: 12000, name: "UCL Final Boss" },
];

export interface LevelInfo {
  level: number; // 1-based
  name: string;
  xp: number;
  floor: number;
  next: number | null; // xp needed for next level, null at cap
  progress: number; // 0..1 within the current level
}

export function levelFor(xp: number): LevelInfo {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
  const floor = LEVELS[i].xp;
  const next = i + 1 < LEVELS.length ? LEVELS[i + 1].xp : null;
  return {
    level: i + 1,
    name: LEVELS[i].name,
    xp,
    floor,
    next,
    progress: next ? (xp - floor) / (next - floor) : 1,
  };
}

/** Everything achievements are judged on. */
export interface AchievementContext {
  totalMinutes: number;
  totalSessions: number;
  streak: number;
  maxDayMinutes: number;
  todayMinutes: number;
  goalMinutes: number;
  tasksDone: number;
  tasksTotal: number;
  chemDone: number;
  chemTotal: number;
  mathDone: number;
  mathTotal: number;
  courseworkDone: number; // coursework + ee categories
  courseworkTotal: number;
  eeDraftDone: boolean;
  uniDone: number;
  uniTotal: number;
  bestSnake: number;
  /** local hour the most recent session started/ended, when relevant */
  sessionStartHour: number | null;
  sessionEndHour: number | null;
}

export interface AchievementDef {
  code: string;
  name: string;
  desc: string;
  icon: string;
  earned: (c: AchievementContext) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { code: "first_blood", name: "First Blood", desc: "Log your first study session.", icon: "🩸", earned: (c) => c.totalSessions >= 1 },
  { code: "goal_day", name: "Quota Met", desc: "Hit your daily goal once.", icon: "✅", earned: (c) => c.todayMinutes >= c.goalMinutes || c.maxDayMinutes >= c.goalMinutes },
  { code: "marathon", name: "Marathon", desc: "5+ hours in a single day.", icon: "🏃", earned: (c) => c.maxDayMinutes >= 300 },
  { code: "streak_3", name: "Warming Up", desc: "3-day streak.", icon: "🔥", earned: (c) => c.streak >= 3 },
  { code: "streak_7", name: "One Full Week", desc: "7-day streak.", icon: "🔥", earned: (c) => c.streak >= 7 },
  { code: "streak_14", name: "Fortnight of Pain", desc: "14-day streak.", icon: "🔥", earned: (c) => c.streak >= 14 },
  { code: "streak_30", name: "Unstoppable", desc: "30-day streak.", icon: "🌋", earned: (c) => c.streak >= 30 },
  { code: "hours_10", name: "Double Digits", desc: "10 hours total.", icon: "⏱️", earned: (c) => c.totalMinutes >= 600 },
  { code: "hours_25", name: "Quarter Century", desc: "25 hours total.", icon: "⏱️", earned: (c) => c.totalMinutes >= 1500 },
  { code: "hours_50", name: "Half Ton", desc: "50 hours total.", icon: "🏋️", earned: (c) => c.totalMinutes >= 3000 },
  { code: "hours_100", name: "The Hundred", desc: "100 hours total. Legend.", icon: "💯", earned: (c) => c.totalMinutes >= 6000 },
  { code: "early_bird", name: "Early Bird", desc: "Start a session before 8 am.", icon: "🌅", earned: (c) => c.sessionStartHour !== null && c.sessionStartHour < 8 },
  { code: "night_owl", name: "Midnight Oil", desc: "Still studying after 10 pm.", icon: "🦉", earned: (c) => c.sessionEndHour !== null && c.sessionEndHour >= 22 },
  { code: "chem_clear", name: "Chemistry Redemption", desc: "Every chemistry task done. From a 3 to a threat.", icon: "🧪", earned: (c) => c.chemTotal > 0 && c.chemDone >= c.chemTotal },
  { code: "math_clear", name: "Calculated", desc: "Every Maths AI task done.", icon: "📐", earned: (c) => c.mathTotal > 0 && c.mathDone >= c.mathTotal },
  { code: "ia_assassin", name: "IA Assassin", desc: "All IAs + EE coursework finished.", icon: "🗡️", earned: (c) => c.courseworkTotal > 0 && c.courseworkDone >= c.courseworkTotal },
  { code: "ee_slayer", name: "EE Slayer", desc: "Extended Essay full draft done.", icon: "📜", earned: (c) => c.eeDraftDone },
  { code: "uni_ready", name: "Application Loaded", desc: "All university tasks done.", icon: "🎓", earned: (c) => c.uniTotal > 0 && c.uniDone >= c.uniTotal },
  { code: "half_plan", name: "Halfway There", desc: "50% of the whole action plan done.", icon: "⛰️", earned: (c) => c.tasksTotal > 0 && c.tasksDone / c.tasksTotal >= 0.5 },
  { code: "full_plan", name: "42 Incoming", desc: "The entire summer action plan, done.", icon: "👑", earned: (c) => c.tasksTotal > 0 && c.tasksDone >= c.tasksTotal },
  { code: "snake_25", name: "Arcade Champ", desc: "Score 25+ in Snake.", icon: "🐍", earned: (c) => c.bestSnake >= 25 },
];

/** Codes newly earned given what's already unlocked. */
export function newlyEarned(
  ctx: AchievementContext,
  unlocked: Set<string>,
): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.has(a.code) && a.earned(ctx));
}
