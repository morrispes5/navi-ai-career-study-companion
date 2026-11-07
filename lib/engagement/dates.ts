/** Zona yang ditawarkan di profil. Nilai lain di database tetap dihormati saat menghitung tanggal. */
export const TIMEZONES = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"] as const;
export type NaviTimezone = (typeof TIMEZONES)[number];

export type ZonedParts = { date: string; hour: number; minute: number };

/** Tanggal dan jam kalender di zona pengguna. `date` selalu YYYY-MM-DD. */
export function zonedParts(timeZone: string, now: Date): ZonedParts {
  const zone = timeZone || "Asia/Jakarta";
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const bag = Object.fromEntries(fmt.formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const hour = Number(bag.hour) % 24;
  return { date: `${bag.year}-${bag.month}-${bag.day}`, hour, minute: Number(bag.minute) };
}

/** Hari kalender sebelumnya dari YYYY-MM-DD, tanpa bergantung pada zona proses. */
export function previousDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Streak berikutnya untuk aktivitas di `today`.
 * Hari yang sama tidak menambah. Hari berikutnya menambah 1. Bolos satu hari mengembalikan ke 1.
 */
export function nextStreak(current: number, lastActiveDate: string | null, today: string) {
  if (lastActiveDate === today) return current;
  if (lastActiveDate && lastActiveDate === previousDate(today)) return current + 1;
  return 1;
}

/** Pengingat "HH:MM" jatuh pada jam kalender yang sama. Cron berjalan tiap jam. */
export function reminderDue(reminderTime: string | null, hour: number) {
  if (!reminderTime || !/^\d{2}:\d{2}$/.test(reminderTime)) return false;
  return Number(reminderTime.slice(0, 2)) === hour;
}

export function formatStudyTime(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours <= 0) return `${rest} menit`;
  if (rest === 0) return `${hours} jam`;
  return `${hours} jam ${rest} menit`;
}
