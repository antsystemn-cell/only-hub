// Mongolian Cyrillic → Latin transliteration (basic)
const map: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z",
  и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", ө: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ү: "u", ф: "f", х: "h", ц: "ts", ч: "ch",
  ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
};

export function slugify(input: string): string {
  if (!input) return "";
  const lower = input.toLowerCase().trim();
  let out = "";
  for (const ch of lower) {
    if (map[ch] !== undefined) out += map[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (/\s|-|_/.test(ch)) out += "-";
  }
  return out.replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function fmtMnt(n: number | null | undefined): string {
  if (n == null) return "0₮";
  return new Intl.NumberFormat("mn-MN").format(Math.round(n)) + "₮";
}

export const STATUS_LABELS: Record<string, string> = {
  pending: "Хүлээгдэж буй",
  phone_confirmed: "Утсаар баталгаажсан",
  confirmed: "Баталгаажсан",
  preparing: "Бэлдэж буй",
  delivering: "Хүргэлтэнд",
  completed: "Дууссан",
  cancelled: "Цуцлагдсан",
};

export const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  phone_confirmed: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  confirmed: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  preparing: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  delivering: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  completed: "bg-green-500/15 text-green-600 border-green-500/30",
  cancelled: "bg-red-500/15 text-red-600 border-red-500/30",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Төлөгдөөгүй",
  confirmed: "Төлөгдсөн",
};
