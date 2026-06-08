import { Clock } from "lucide-react";
import { formatOrderTime, formatRelativeMinutes } from "@/lib/time";

interface OrderTimeBadgeProps {
  createdAt: string | null | undefined;
  compact?: boolean;
  className?: string;
  showIcon?: boolean;
}

export function OrderTimeBadge({ createdAt, compact = false, className = "", showIcon = true }: OrderTimeBadgeProps) {
  const label = compact ? formatOrderTime(createdAt) : `Feito às ${formatOrderTime(createdAt)}`;
  const relative = formatRelativeMinutes(createdAt);

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 ${className}`}
      title={`Pedido feito às ${formatOrderTime(createdAt)}`}
    >
      {showIcon && <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
      <span>{label}</span>
      <span className="text-slate-400">·</span>
      <span>{relative}</span>
    </span>
  );
}
