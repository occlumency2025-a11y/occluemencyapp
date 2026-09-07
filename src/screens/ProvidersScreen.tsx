import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { CATEGORY_LABELS, listProviders } from '@/lib/pilot';
import { readableError } from '@/lib/supabase';
import type { ProviderPublic } from '@/types/database';
import { EmptyState, ErrorNote, PageHeader, Spinner, formatRupees } from '@/components/ui';

export default function ProvidersScreen() {
  const [providers, setProviders] = useState<ProviderPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProviders()
      .then(setProviders)
      .catch((err) => setError(readableError(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading providers" />;

  return (
    <div>
      <PageHeader
        title="Find someone"
        subtitle={
          providers.length
            ? `${providers.length} professionals in the pilot, all in Bengaluru.`
            : undefined
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {!error && providers.length === 0 && (
        <EmptyState
          title="No providers listed yet"
          body="We are adding professionals to the pilot this week. Check back in a day or two."
        />
      )}

      <ul className="flex flex-col gap-3">
        {providers.map((p) => (
          <li key={p.id}>
            <Link
              to={`/providers/${p.id}`}
              className="card flex items-center gap-4 p-4 transition-colors hover:border-sage-200"
            >
              <Avatar name={p.name} url={p.photo_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-clay-900">{p.name}</p>
                <p className="truncate text-sm text-clay-500">
                  {CATEGORY_LABELS[p.category]}
                  {p.headline ? ` · ${p.headline}` : ''}
                </p>
                <p className="mt-1 text-sm font-semibold text-sage-700">
                  {formatRupees(p.session_fee)}{' '}
                  <span className="font-normal text-clay-400">per session</span>
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-clay-300" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Avatar({
  name,
  url,
  size = 'md',
}: {
  name: string;
  url: string | null;
  size?: 'md' | 'lg';
}) {
  const cls = size === 'lg' ? 'h-20 w-20 text-2xl' : 'h-14 w-14 text-lg';
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={`${cls} shrink-0 rounded-2xl object-cover`}
        loading="lazy"
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`${cls} flex shrink-0 items-center justify-center rounded-2xl bg-sage-100 font-display text-sage-800`}
    >
      {initials || '?'}
    </div>
  );
}
