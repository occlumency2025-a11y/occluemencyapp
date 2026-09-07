import type { ReactNode } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-clay-500" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="card px-6 py-10 text-center">
      <h3 className="text-lg">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-clay-500">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-5">
      <h1 className="text-[26px] leading-tight">{title}</h1>
      {subtitle ? <p className="mt-1 text-[15px] text-clay-500">{subtitle}</p> : null}
    </header>
  );
}

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-amber-100 text-amber-800',
  matched: 'bg-sage-100 text-sage-800',
  completed: 'bg-sage-600 text-white',
  cancelled: 'bg-clay-200 text-clay-600',
  no_show: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'Requested',
  matched: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'Missed',
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`chip ${STATUS_STYLES[status] ?? 'bg-clay-200 text-clay-700'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** ₹ with no decimals — every price in the pilot is a whole rupee amount. */
export function formatRupees(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
