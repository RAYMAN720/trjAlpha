import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-white/[0.03] p-8 text-center">
      <Icon className="mx-auto h-10 w-10 text-stone-500" />
      <h3 className="mt-4 text-lg font-semibold text-stone-100">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-stone-400">{description}</p>
    </div>
  );
}
