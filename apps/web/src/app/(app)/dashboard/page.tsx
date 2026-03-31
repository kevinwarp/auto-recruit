'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { SearchJobStatus } from '@auto-recruit/types';
import { cn } from '@/lib/utils';
import { Briefcase, Users, Mail, TrendingUp, Plus, ArrowRight } from 'lucide-react';

interface DashboardStats {
  totalSearchJobs: number;
  totalCandidates: number;
  totalOutreachSent: number;
  totalReplied: number;
  recentSearchJobs: {
    id: string;
    title: string;
    status: SearchJobStatus;
    createdAt: string;
    _count: { candidates: number };
  }[];
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  running: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  paused: 'bg-gray-100 text-gray-700',
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<DashboardStats>('/dashboard/stats')
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    {
      label: 'Search Jobs',
      value: stats?.totalSearchJobs ?? 0,
      icon: Briefcase,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'Candidates Found',
      value: stats?.totalCandidates ?? 0,
      icon: Users,
      color: 'text-purple-600 bg-purple-50',
    },
    {
      label: 'Emails Sent',
      value: stats?.totalOutreachSent ?? 0,
      icon: Mail,
      color: 'text-green-600 bg-green-50',
    },
    {
      label: 'Replies',
      value: stats?.totalReplied ?? 0,
      icon: TrendingUp,
      color: 'text-orange-600 bg-orange-50',
    },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Overview of your recruiting activity</p>
        </div>
        <Link
          href="/search/new"
          className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          New Search
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">{card.label}</p>
              <span className={cn('rounded-full p-2', card.color)}>
                <card.icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {loading ? '—' : card.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Recent Search Jobs */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Recent Search Jobs</h2>
          <Link href="/search" className="flex items-center gap-1 text-sm text-brand-600 hover:underline">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">Loading…</div>
        ) : !stats?.recentSearchJobs?.length ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            No search jobs yet.{' '}
            <Link href="/search/new" className="text-brand-600 hover:underline">
              Create one
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {stats.recentSearchJobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/search/${job.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{job.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(job.createdAt).toLocaleDateString()} ·{' '}
                      {job._count.candidates} candidates
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                      statusColors[job.status] ?? 'bg-gray-100 text-gray-700',
                    )}
                  >
                    {job.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
