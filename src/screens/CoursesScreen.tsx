import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, PlayCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { readableError } from '@/lib/supabase';
import {
  COURSE_TOPIC_LABELS,
  formatCourseLength,
  listCourses,
  listMyCourseProgress,
  setCourseProgress,
} from '@/lib/pilot';
import type { CourseProgress, CoursePublic } from '@/types/database';
import { EmptyState, ErrorNote, PageHeader, Spinner } from '@/components/ui';

export default function CoursesScreen() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<CoursePublic[]>([]);
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const [c, p] = await Promise.all([listCourses(), listMyCourseProgress(user.id)]);
      setCourses(c);
      setProgress(p);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(courseId: string, status: 'in_progress' | 'completed') {
    if (!user || busyId) return;
    setBusyId(courseId);
    setError(null);

    // Optimistic — tapped in the moment, should never feel laggy.
    const previous = progress;
    const nowIso = new Date().toISOString();
    setProgress((prev) => {
      const existing = prev.find((p) => p.course_id === courseId);
      if (existing) {
        return prev.map((p) =>
          p.course_id === courseId
            ? { ...p, status, completed_at: status === 'completed' ? nowIso : null }
            : p
        );
      }
      return [
        ...prev,
        {
          id: `pending-${courseId}`,
          user_id: user.id,
          course_id: courseId,
          status,
          started_at: nowIso,
          completed_at: status === 'completed' ? nowIso : null,
          created_at: nowIso,
        },
      ];
    });

    try {
      const updated = await setCourseProgress(user.id, courseId, status);
      setProgress((prev) => [...prev.filter((p) => p.course_id !== courseId), updated]);
    } catch (err) {
      setProgress(previous);
      setError(readableError(err));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Spinner label="Loading courses" />;

  const byCourse = new Map(progress.map((p) => [p.course_id, p]));
  const startedCount = progress.length;
  const completedCount = progress.filter((p) => p.status === 'completed').length;

  return (
    <div>
      <PageHeader
        title="Free courses"
        subtitle={
          courses.length
            ? `${courses.length} free courses on brain health, picked for the pilot.`
            : undefined
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {courses.length > 0 && (
        <div className="card mb-4 flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-semibold text-clay-800">Your progress</p>
            <p className="text-sm text-clay-500">
              {startedCount === 0
                ? 'Not started yet'
                : `${startedCount} started · ${completedCount} completed`}
            </p>
          </div>
          <div className="font-display text-2xl text-sage-700">
            {completedCount} / {courses.length}
          </div>
        </div>
      )}

      {!error && courses.length === 0 && (
        <EmptyState
          title="No courses listed yet"
          body="We are adding free courses on brain health to the pilot this week."
        />
      )}

      <ul className="flex flex-col gap-3">
        {courses.map((c) => {
          const p = byCourse.get(c.id);
          const busy = busyId === c.id;
          return (
            <li key={c.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-clay-900">{c.title}</p>
                  <p className="mt-0.5 text-sm text-clay-500">
                    {c.provider} &middot; {COURSE_TOPIC_LABELS[c.topic]}
                    {c.estimated_minutes ? ` · ${formatCourseLength(c.estimated_minutes)}` : ''}
                  </p>
                  {c.description && (
                    <p className="mt-2 text-sm leading-relaxed text-clay-600">{c.description}</p>
                  )}
                </div>
                {p?.status === 'completed' && (
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sage-600"
                  >
                    <Check className="h-4 w-4 text-white" strokeWidth={3} />
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost text-[13px]"
                >
                  Open course
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>

                {!p && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-pressed={false}
                    onClick={() => void updateStatus(c.id, 'in_progress')}
                    className="btn-primary text-[13px]"
                  >
                    <PlayCircle className="h-4 w-4" aria-hidden="true" />
                    Mark as started
                  </button>
                )}

                {p?.status === 'in_progress' && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-pressed={false}
                    onClick={() => void updateStatus(c.id, 'completed')}
                    className="btn-primary text-[13px]"
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Mark complete
                  </button>
                )}

                {p?.status === 'completed' && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-pressed={true}
                    onClick={() => void updateStatus(c.id, 'in_progress')}
                    className="btn-ghost text-[13px]"
                  >
                    Reopen
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
