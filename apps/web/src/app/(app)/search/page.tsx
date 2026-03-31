'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchJob {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  _count: { candidates: number };
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  running: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  paused: 'bg-gray-100 text-gray-700',
};

export default function SearchJobsListPage() {
  const [jobs, setJobs] = useState<SearchJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ data: SearchJob[] }>('/search-jobs')
      .then((r) => setJobs(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Search Jobs</h1>
          <p className="text-sm text-gray-500 mt-1">All candidate search runs</p>
        </div>
        <Link
          href="/search/new"
          className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          New Search
        </Link>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
      ) : jobs.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
          No search jobs yet.{' '}
          <Link href="/search/new" className="text-brand-600 hover:underline">
            Create one
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={`/search/${job.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{job.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(job.createdAt).toLocaleDateString()} · {job._count.candidates} candidates
                </p>
              </div>
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
                  statusColors[job.status] ?? 'bg-gray-100 text-gray-700',
                )}
              >
                {job.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
