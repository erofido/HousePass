/**
 * The nag engine. Job description, verbatim from the client: "it should piss
 * me off until I want to study." Messages escalate through the day and with
 * how little has been done; `intensity` (settings) controls the tone.
 */

export type Intensity = "mild" | "firm" | "brutal";

export interface NagContext {
  name: string;
  minutes: number;
  goal: number;
  hour: number; // local hour 0-23
  intensity: Intensity;
  daysToSchool: number;
  streak: number;
  /** how many nags already sent today — used to rotate messages */
  nagCount: number;
}

interface Nag {
  title: string;
  body: string;
}

function pick<T>(arr: T[], n: number): T {
  return arr[n % arr.length];
}

export function pickNag(c: NagContext): Nag {
  const left = Math.max(0, c.goal - c.minutes);
  const ratio = c.goal > 0 ? c.minutes / c.goal : 0;
  const t = (title: string, body: string): Nag => ({ title, body });

  // Nothing done yet — the ladder gets meaner as the day burns away.
  if (c.minutes === 0) {
    if (c.hour < 12) {
      const mild = [
        t("Good morning ☀️", `Clean slate. One session before lunch and today is already a win.`),
        t("Morning, Eray", `${c.daysToSchool} days to September. Start with Chemistry while your brain is fresh.`),
      ];
      const firm = [
        t("Still in bed?", `0 minutes on the board. Chemistry is a 3. Coincidence?`),
        t("Morning check", `The Maths 4 wakes up when you do. Get the first session in.`),
      ];
      const brutal = [
        t("Oi. Up.", `0 minutes. Your competition at UCL has done a past paper before breakfast.`),
        t("Bed rotting detected", `It's morning, the board says 0, and your predicted is still 35. Move.`),
      ];
      return pick(c.intensity === "mild" ? mild : c.intensity === "firm" ? firm : brutal, c.nagCount);
    }
    if (c.hour < 15) {
      const mild = [
        t("Lunchtime nudge", `Nothing logged yet — a 45-minute Chemistry block right now keeps the day alive.`),
        t("Midday check-in", `0 minutes so far. Still completely fixable. Start the timer.`),
      ];
      const firm = [
        t("Half the day, 0 minutes", `You need 42. You're on 31. This is not the maths of someone taking Maths AI HL seriously.`),
        t("Study check", `It's afternoon and the timer hasn't moved. ${c.daysToSchool} days left. Start now.`),
      ];
      const brutal = [
        t("Embarrassing.", `It's past noon. 0 minutes. UCL wants 39 points and you're grinding your phone instead.`),
        t("0 minutes. Zero.", `Chemistry: 3. Maths: 4. Phone screen time: undefeated. Fix one of these today.`),
      ];
      return pick(c.intensity === "mild" ? mild : c.intensity === "firm" ? firm : brutal, c.nagCount);
    }
    if (c.hour < 18) {
      const mild = [
        t("Afternoon reminder", `Still 0 today. Even ${Math.min(60, c.goal)} minutes now beats a blank day.`),
      ];
      const firm = [
        t("The day is escaping", `0 minutes at ${c.hour}:00. Tonight's report to your dad writes itself — unless you do.`),
      ];
      const brutal = [
        t("Your dad's report says: nothing", `At 20:30 an email goes out with today's numbers. Right now the number is 0. Your call.`),
        t("31 points behaving like 24", `Whole afternoon gone. The EE isn't drafting itself and Warwick isn't lowering the bar.`),
      ];
      return pick(c.intensity === "mild" ? mild : c.intensity === "firm" ? firm : brutal, c.nagCount);
    }
    if (c.hour < 21) {
      const mild = [
        t("Evening rescue", `0 today so far — one honest evening block and the day still counts.`),
      ];
      const firm = [
        t("Last call", `You can still salvage ${Math.min(120, c.goal)} minutes tonight. Or explain a zero. Your pick.`),
      ];
      const brutal = [
        t("Speedrunning a 31", `A full day, nothing studied, ${c.daysToSchool} days to go. This is how retakes are built.`),
        t("Zero. All day.", `The summary email fires soon and it's ugly. Give it one number to save it.`),
      ];
      return pick(c.intensity === "mild" ? mild : c.intensity === "firm" ? firm : brutal, c.nagCount);
    }
    const late = [
      t("Day's gone", `0 minutes today. Tomorrow you owe double. Set the alarm, start with Chemistry.`),
      t("Tomorrow, then.", `Blank day logged. Streak status: ${c.streak > 0 ? "DEAD" : "still dead"}. Prove tomorrow is different.`),
    ];
    return pick(late, c.nagCount);
  }

  // Streak in danger in the evening beats generic messages.
  if (c.streak >= 3 && ratio < 1 && c.hour >= 19) {
    return t(
      `🔥 ${c.streak}-day streak at risk`,
      `${left} more minutes or the streak dies at midnight. You've come too far.`,
    );
  }

  // Under half.
  if (ratio < 0.5) {
    const mild = [
      t("Keep it moving", `${c.minutes} down, ${left} to go. Next block: whichever of Chem/Maths you've dodged today.`),
    ];
    const firm = [
      t("Not even half", `${c.minutes}/${c.goal} minutes. A 42 doesn't come from half days.`),
      t("Progress check", `${left} minutes left. The IAs and the EE are watching you scroll.`),
    ];
    const brutal = [
      t("That's a warm-up, not a study day", `${c.minutes} minutes? The kids you're competing with call that a break. ${left} to go.`),
      t("Halfway to halfway", `${c.minutes}/${c.goal}. Your dad reads the real number tonight either way.`),
    ];
    return pick(c.intensity === "mild" ? mild : c.intensity === "firm" ? firm : brutal, c.nagCount);
  }

  // Close — flip to carrot: the arcade.
  const close = [
    t("So close 🎮", `${left} minutes and the arcade unlocks. Finish it.`),
    t("Don't stop at ${m}".replace("${m}", String(c.minutes)), `${left} more minutes. Quota, then Snake. In that order.`),
    t("Final stretch", `${left} minutes between you and a guilt-free evening.`),
  ];
  return pick(close, c.nagCount);
}

/** One-off celebration when the daily goal is hit. */
export function goalMetNag(minutes: number, streak: number): Nag {
  return {
    title: "QUOTA DESTROYED ✅",
    body: `${minutes} minutes today. Streak: ${streak} day${streak === 1 ? "" : "s"}. The arcade is open — you earned it. 🐍`,
  };
}

/**
 * Minimum gap between nags, shrinking as the day gets away from you.
 * Brutal mode nags ~25% more often. Returns minutes.
 */
export function nagGapMinutes(hour: number, intensity: Intensity): number {
  const base = hour < 14 ? 150 : hour < 17 ? 120 : hour < 20 ? 90 : 60;
  return intensity === "brutal" ? Math.round(base * 0.75) : base;
}
