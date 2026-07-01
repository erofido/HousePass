import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Eray's Summer Action Plan 2026, encoded. Seeded into the database on the
 * first successful login; safe to call again (skips if a profile exists).
 *
 * Sources: 00LVI Summer Action Plan doc + the brief:
 *  - Holiday 26 Jun → school 7 Sep (birthday 3 Sep), 2–3 weeks of it vacation
 *  - 31 points now (predicted 35), needs 42 → grind Chem (3) + Maths AI (4)
 *  - Languages need no revision; all IAs + EE must be finished
 *  - 3–4 h/day target → default daily goal 210 min
 */

export const KEY_DATES = {
  holidayStart: "2026-06-26",
  birthday: "2026-09-03",
  schoolStart: "2026-09-07",
};

export const POINTS = { current: 31, predicted: 35, target: 42 };

interface SubjectSeed {
  key: string;
  name: string;
  short_name: string;
  level: string;
  current_grade: number | null;
  target_grade: number | null;
  priority: 1 | 2 | 3;
  color: string;
  sort: number;
}

const SUBJECTS: SubjectSeed[] = [
  { key: "chem", name: "Chemistry", short_name: "Chem", level: "SL", current_grade: 3, target_grade: 6, priority: 1, color: "#f97316", sort: 0 },
  { key: "math", name: "Maths AI", short_name: "Maths", level: "HL", current_grade: 4, target_grade: 6, priority: 1, color: "#38bdf8", sort: 1 },
  { key: "econ", name: "Economics", short_name: "Econ", level: "HL", current_grade: 6, target_grade: 7, priority: 2, color: "#a3e635", sort: 2 },
  { key: "gp", name: "Global Politics", short_name: "GloPo", level: "HL", current_grade: 6, target_grade: 7, priority: 2, color: "#c084fc", sort: 3 },
  { key: "eng", name: "English B", short_name: "Eng B", level: "HL", current_grade: 6, target_grade: 7, priority: 3, color: "#f472b6", sort: 4 },
  { key: "ger", name: "German A", short_name: "German", level: "SL", current_grade: 6, target_grade: 7, priority: 3, color: "#fbbf24", sort: 5 },
  { key: "ee", name: "Extended Essay", short_name: "EE", level: "Core", current_grade: null, target_grade: null, priority: 1, color: "#2dd4bf", sort: 6 },
];

interface TaskSeed {
  subject: string | null; // key into SUBJECTS
  category: "subject" | "coursework" | "ee" | "supercurricular" | "university";
  title: string;
  details?: string;
  week_hint?: string;
  xp: number;
}

const TASKS: TaskSeed[] = [
  // ---- Chemistry SL — from a 3 to a 6. Weeks per the subject plan. ----
  { subject: "chem", category: "subject", title: "Stoichiometry — rebuild from scratch", details: "MSJ Chem + Richard Thornley videos, mole-calculation drills daily, Save My Exams topic questions, start the error log.", week_hint: "Weeks 1–2", xp: 60 },
  { subject: "chem", category: "subject", title: "Atomic structure", details: "Electron configurations until automatic; flashcards; PMT multiple choice.", week_hint: "Weeks 1–2", xp: 60 },
  { subject: "chem", category: "subject", title: "Periodicity", details: "Periodic trends flashcards; Save My Exams questions self-marked.", week_hint: "Weeks 1–2", xp: 60 },
  { subject: "chem", category: "subject", title: "Bonding", details: "Lewis structures + VSEPR shapes from memory; PMT MCQs.", week_hint: "Weeks 3–4", xp: 60 },
  { subject: "chem", category: "subject", title: "Energetics", details: "Enthalpy formulas, Hess's Law calculations; log every calculation error.", week_hint: "Weeks 3–4", xp: 60 },
  { subject: "chem", category: "subject", title: "Kinetics", details: "Collision theory, Maxwell-Boltzmann curves drawn from memory.", week_hint: "Weeks 3–4", xp: 60 },
  { subject: "chem", category: "subject", title: "Exam skills — mixed questions, command terms", details: "State / explain / deduce / compare / suggest. Mark schemes after every question.", week_hint: "Week 5", xp: 70 },
  { subject: "chem", category: "subject", title: "Full past papers P1 + P2, timed, scores logged", details: "Compare against grade boundaries; review the error log before each paper.", week_hint: "Week 6", xp: 90 },

  // ---- Maths AI HL — from a 4 to a 6. ----
  { subject: "math", category: "subject", title: "Vectors (PRIORITY)", details: "Revision Village topic drills, timed P1/P2 questions, recurring errors into OneNote.", week_hint: "Priority", xp: 60 },
  { subject: "math", category: "subject", title: "Distributions (PRIORITY)", details: "Distribution conditions flashcards, GDC drills, timed past-paper questions.", week_hint: "Priority", xp: 60 },
  { subject: "math", category: "subject", title: "Matrices (PRIORITY)", details: "Eigenvalues, Markov chains, transformations — Save My Exams + RV drills.", week_hint: "Priority", xp: 60 },
  { subject: "math", category: "subject", title: "Differentiation (PRIORITY)", details: "Chain/product/quotient drills, kinematics and optimisation problems.", week_hint: "Priority", xp: 60 },
  { subject: "math", category: "subject", title: "Remaining topics sweep", details: "Functions, sequences, statistics, trigonometry, complex numbers — RV question sets, fill gaps with Save My Exams notes.", xp: 80 },
  { subject: "math", category: "subject", title: "Full past papers ×3 years, timed, scores logged", details: "P1 (no GDC) + P2 (GDC) weekly rotation: sit, mark, revise weak areas, repeat.", xp: 90 },
  { subject: "math", category: "coursework", title: "Maths IA — exploration draft", details: "Pick topic, collect data, full draft before September.", xp: 150 },

  // ---- Economics HL — 6 → 7. ----
  { subject: "econ", category: "subject", title: "Micro: market failure", details: "Definitions + diagrams from memory, Anki, 10-mark Paper 2 essay.", xp: 45 },
  { subject: "econ", category: "subject", title: "Micro: elasticity (PED/YED/XED)", details: "Formula flashcards + calculation questions, self-marked.", xp: 45 },
  { subject: "econ", category: "subject", title: "Macro: demand- vs supply-side policy", details: "Mind map, evaluation tables, practice conclusions, 15-mark Paper 3 question.", xp: 45 },
  { subject: "econ", category: "subject", title: "Macro: monetary & fiscal policy", details: "Transmission mechanism flashcards, policy evaluation paragraphs.", xp: 45 },
  { subject: "econ", category: "coursework", title: "Micro IA — review Mr Spencer Burton's feedback", details: "Annotate the feedback, list the fixes.", xp: 60 },
  { subject: "econ", category: "coursework", title: "Macro IA — write and FINISH", details: "Draft, self-assess against IB criteria, redraft, send to Mr Spencer Burton.", xp: 200 },

  // ---- Global Politics HL — 6 → 7. ----
  { subject: "gp", category: "subject", title: "Core concepts: power, sovereignty, legitimacy", details: "Flashcards with thinkers + one contemporary example per concept; timed paragraphs.", xp: 45 },
  { subject: "gp", category: "subject", title: "Human rights: 1st / 2nd / 3rd generation", details: "Comparison table, UDHR/ICESCR links, timed 15-mark paragraphs.", xp: 45 },
  { subject: "gp", category: "subject", title: "Paper 3 case study — re-read and rework", details: "Annotate, extract concepts, timed Paper 3 responses against the mark scheme.", xp: 45 },
  { subject: "gp", category: "coursework", title: "EA interview 2 — prep questions for Bradley Thomas MP", details: "During the Parliament internship. Interview 1 (Neil Laurenson) is done.", xp: 60 },
  { subject: "gp", category: "coursework", title: "Engagement Activity — write and FINISH", details: "Outline first, embed core concepts + HR frameworks, self-assess against criteria, send to Dr Jewkes.", xp: 200 },

  // ---- English B HL — no revision needed; coursework prep only. ----
  { subject: "eng", category: "subject", title: "Quote bank: Curious Incident + The Hate U Give", details: "Key quotes ↔ themes flashcards. Light touch — you're already on a 6.", xp: 30 },
  { subject: "eng", category: "subject", title: "IO practice run with an extract", details: "One timed 10-minute oral, self-assessed against IO criteria.", xp: 40 },

  // ---- German A SL — no revision needed; IO + new text only. ----
  { subject: "ger", category: "subject", title: "IO — rework script, drill fluency", details: "Learn it without notes, anticipate Mrs Aust's follow-up questions, record yourself.", xp: 40 },
  { subject: "ger", category: "subject", title: "Read Der Besuch der alten Dame (NEW text)", details: "First read with annotations + chapter summaries in German.", xp: 60 },

  // ---- Extended Essay — the big rock. ----
  { subject: "ee", category: "ee", title: "EE full draft — submission-ready for September", details: "This is the single biggest deliverable of the summer. Block real sessions for it.", xp: 250 },
  { subject: "ee", category: "ee", title: "EE reflection 2 of 3", details: "Draft it while the writing decisions are fresh.", xp: 60 },

  // ---- University applications. ----
  { subject: null, category: "university", title: "Finalise course choice: PPE / Economics & Politics", xp: 40 },
  { subject: null, category: "university", title: "Finalise the realistic uni list", details: "UCL (39, 7 in HL Maths), LSE (39/38, 766 incl. Maths), Warwick (38), KCL (38), Durham (37, 666 HL) + Bocconi, IE. Highest +1, insurance −2.", xp: 50 },
  { subject: null, category: "university", title: "Personal statement — draft 3", details: "Fold in the summer's supercurriculars and internship.", xp: 120 },
  { subject: null, category: "university", title: "Non-UK deadlines list + motivation letter draft 1", details: "Bocconi test + IE GAT/SAT dates on one page.", xp: 50 },

  // ---- Supercurriculars. ----
  { subject: null, category: "supercurricular", title: "Read: What Money Can't Buy — Sandel", xp: 60 },
  { subject: null, category: "supercurricular", title: "Read: Thinking, Fast and Slow — Kahneman", xp: 80 },
  { subject: null, category: "supercurricular", title: "Read: Economics: The User's Guide — Chang", xp: 60 },
  { subject: null, category: "supercurricular", title: "MOOC: How the Global Economy Works (Illinois)", xp: 70 },
  { subject: null, category: "supercurricular", title: "MOOC: Behavioural Economics in Action", xp: 70 },
  { subject: null, category: "supercurricular", title: "MOOC: Game Theory (Stanford)", xp: 70 },
  { subject: null, category: "supercurricular", title: "MOOC: Justice (HarvardX)", xp: 70 },
  { subject: null, category: "supercurricular", title: "John Locke essay — write and submit", details: "Econ Q2 (personalised pricing) or Philosophy Q1 (right thing, wrong reasons).", xp: 150 },
  { subject: null, category: "supercurricular", title: "Watch/listen list", details: "Dalio's Economic Machine, Ariely / Mazzucato / Schwartz TED talks, Masters of Money (Keynes).", xp: 40 },
  { subject: null, category: "supercurricular", title: "Parliament internship with Bradley Thomas MP", details: "Doubles as EA interview 2 — prep GloPo questions beforehand.", xp: 120 },
];

/** Idempotent: creates profile + subjects + tasks only when no profile exists. */
export async function ensureSeeded(db: SupabaseClient): Promise<void> {
  const { data: existing } = await db.from("profile").select("id").limit(1);
  if (existing && existing.length > 0) return;

  const { error: profileError } = await db.from("profile").insert({
    name: "Eray",
    user_email: "erayfidande@gmail.com",
    parent_email: "mailfidan@gmail.com",
    daily_goal_minutes: 210,
    school_start: KEY_DATES.schoolStart,
    birthday: KEY_DATES.birthday,
    timezone: "Europe/London",
  });
  if (profileError) throw new Error(`seed profile: ${profileError.message}`);

  const { data: subjectRows, error: subjectsError } = await db
    .from("subjects")
    .insert(
      SUBJECTS.map((s) => ({
        name: s.name,
        short_name: s.short_name,
        level: s.level,
        current_grade: s.current_grade,
        target_grade: s.target_grade,
        priority: s.priority,
        color: s.color,
        sort: s.sort,
      })),
    )
    .select("id, short_name");
  if (subjectsError || !subjectRows) {
    throw new Error(`seed subjects: ${subjectsError?.message}`);
  }

  const idByKey = new Map<string, string>();
  for (const seed of SUBJECTS) {
    const row = subjectRows.find((r) => r.short_name === seed.short_name);
    if (row) idByKey.set(seed.key, row.id);
  }

  const { error: tasksError } = await db.from("tasks").insert(
    TASKS.map((t, i) => ({
      subject_id: t.subject ? (idByKey.get(t.subject) ?? null) : null,
      category: t.category,
      title: t.title,
      details: t.details ?? null,
      week_hint: t.week_hint ?? null,
      xp: t.xp,
      sort: i,
    })),
  );
  if (tasksError) throw new Error(`seed tasks: ${tasksError.message}`);
}
