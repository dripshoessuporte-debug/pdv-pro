export function formatOrderTime(dateString: string | null | undefined): string {
  if (!dateString) return "--:--";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isYesterday(date: Date, now: Date): boolean {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  return isSameDay(date, yesterday);
}

export function formatRelativeMinutes(dateString: string | null | undefined, now = new Date()): string {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";

  if (!isSameDay(date, now)) {
    if (isYesterday(date, now)) return "ontem";
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }

  const diffMinutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (diffMinutes < 1) return "agora";
  if (diffMinutes < 60) return `há ${diffMinutes} min`;

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return minutes > 0 ? `há ${hours}h ${minutes}min` : `há ${hours}h`;
}

export function getOrderDisplayTime(order: { createdAt?: string | null }): string | null {
  return order.createdAt ?? null;
}

export function compareNewestFirst<T extends { createdAt?: string | null }>(a: T, b: T): number {
  return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
}
