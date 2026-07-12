const NEW_YORK_TIME_ZONE = "America/New_York";

export type MarketClockStatus = {
  open: boolean;
  reason: string;
  tradingDate: string;
  sessionStart: Date;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
};

function partsInTimeZone(date: Date, timeZone = NEW_YORK_TIME_ZONE): DateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: String(parts.weekday)
  };
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addUtcDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function observedDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  if (weekday === 6) return addUtcDays(date, -1);
  if (weekday === 0) return addUtcDays(date, 1);
  return date;
}

function nthWeekday(year: number, month: number, weekday: number, nth: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month - 1, 1 + offset + (nth - 1) * 7));
}

function lastWeekday(year: number, month: number, weekday: number) {
  const last = new Date(Date.UTC(year, month, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month - 1, last.getUTCDate() - offset));
}

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function holidayKeys(year: number) {
  const holidays = [
    observedDate(year, 1, 1),
    nthWeekday(year, 1, 1, 3),
    nthWeekday(year, 2, 1, 3),
    addUtcDays(easterSunday(year), -2),
    lastWeekday(year, 5, 1),
    observedDate(year, 6, 19),
    observedDate(year, 7, 4),
    nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 11, 4, 4),
    observedDate(year, 12, 25)
  ];

  // A New Year's Day observed on Dec 31 belongs to the following calendar year's holiday schedule.
  const nextNewYearObserved = observedDate(year + 1, 1, 1);
  if (nextNewYearObserved.getUTCFullYear() === year) holidays.push(nextNewYearObserved);

  return new Set(holidays.map((date) => date.toISOString().slice(0, 10)));
}

function zonedDateTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone = NEW_YORK_TIME_ZONE) {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = partsInTimeZone(guess, timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    const difference = targetAsUtc - actualAsUtc;
    if (difference === 0) break;
    guess = new Date(guess.getTime() + difference);
  }

  return guess;
}

export function getUsEquityMarketClock(now = new Date()): MarketClockStatus {
  const parts = partsInTimeZone(now);
  const tradingDate = dateKey(parts.year, parts.month, parts.day);
  const sessionStart = zonedDateTimeToUtc(parts.year, parts.month, parts.day, 0, 0);
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  if (weekend) return { open: false, reason: "US equity market is closed for the weekend.", tradingDate, sessionStart };
  if (holidayKeys(parts.year).has(tradingDate)) {
    return { open: false, reason: "US equity market is closed for an exchange holiday.", tradingDate, sessionStart };
  }

  const minuteOfDay = parts.hour * 60 + parts.minute;
  const regularOpen = 9 * 60 + 30;
  const regularClose = 16 * 60;
  const open = minuteOfDay >= regularOpen && minuteOfDay < regularClose;
  return {
    open,
    reason: open ? "US equity regular session is open." : "US equity regular session is closed.",
    tradingDate,
    sessionStart
  };
}

export function getTradingSessionStart(assetType: "stock" | "crypto", now = new Date()) {
  if (assetType === "stock") return getUsEquityMarketClock(now).sessionStart;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function getTradingSessionKey(assetType: "stock" | "crypto", now = new Date()) {
  if (assetType === "stock") return getUsEquityMarketClock(now).tradingDate;
  return now.toISOString().slice(0, 10);
}
