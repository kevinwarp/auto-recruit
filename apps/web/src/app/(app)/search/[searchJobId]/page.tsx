'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { api } from '@/lib/api';
import { CandidateTable, OutreachStatusBadge } from '@/components/tables/CandidateTable';
import { ArrowLeft, RefreshCw, Zap } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface SearchJob {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  filters: Record<string, unknown>;
  _count: { candidates: number };
}

interface SearchCandidate {
  id: string;
  candidateId: string;
  score: number;
  linkedinUrl: string | null;
  fullName: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  email: string | null;
  location: string | null;
  outreachStatus: string;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  running: 'bg-blue-100 text-blue-800 animate-pulse',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  paused: 'bg-gray-100 text-gray-700',
};

export default function SearchJobPage() {
  const { searchJobId } = useParams<{ searchJobId: string }>();
  const router = useRouter();
  const [job, setJob] = useState<SearchJob | null>(null);
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);

  const fetchJob = useCallback(async () => {
    const [j, c] = await Promise.all([
      api.get<SearchJob>(`/search-jobs/${searchJobId}`),
      api.get<{ data: SearchCandidate[]; total: number }>(`/search-jobs/${searchJobId}/candidates?page=${page}&pageSize=50`),
    ]);
    setJob(j);
    setCandidates(c.data);
    setTotal(c.total);
  }, [searchJobId, page]);

  useEffect(() => {
    setLoading(true);
    fetchJob().catch(console.error).finally(() => setLoading(false));
  }, [fetchJob]);

  // Poll while running
  useEffect(() => {
    if (job?.status !== 'running') return;
    const interval = setInterval(() => fetchJob().catch(console.error), 5000);
    return () => clearInterval(interval);
  }, [job?.status, fetchJob]);

  async function handleEnrich(selectedIds: string[]) {
    if (!selectedIds.length) { alert('Select at least one candidate to enrich.'); return; }
    setEnriching(true);
    try {
      await api.post(`/enrichment/batch`, { candidateIds: selectedIds, searchJobId });
      router.push(`/enriched/${searchJobId}`);
    } catch (err) {
      console.error(err);
    } finally {
      setEnriching(false);
    }
  }

  async function handleExport(selectedIds: string[]) {
    const ids = selectedIds.length ? selectedIds : candidates.map((c) => c.candidateId);
    const blob = await api.download(`/candidates/export`, {
      method: 'POST',
      body: JSON.stringify({ candidateIds: ids, searchJobId }),
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job?.title ?? 'candidates'}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: ColumnDef<SearchCandidate>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
          className="h-4 w-4 rounded border-gray-300"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          className="h-4 w-4 rounded border-gray-300"
        />
      ),
      size: 40,
    },
    {
      accessorKey: 'score',
      header: 'Score',
      cell: (info) => (
        <span className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold',
          info.getValue<number>() >= 80 ? 'bg-green-100 text-green-800' :
          info.getValue<number>() >= 60 ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-600'
        )}>
          {info.getValue<number>()}
        </span>
      ),
    },
    {
      accessorKey: 'fullName',
      header: 'Name',
      cell: (info) => (
        <span className="font-medium text-gray-900">{info.getValue<string>() ?? '—'}</span>
      ),
    },
    { accessorKey: 'currentTitle', header: 'Title', cell: (i) => i.getValue<string>() ?? '—' },
    { accessorKey: 'currentCompany', header: 'Company', cell: (i) => i.getValue<string>() ?? '—' },
    { accessorKey: 'location', header: 'Location', cell: (i) => i.getValue<string>() ?? '—' },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: (i) => i.getValue<string>()
        ? <span className="text-brand-600">{i.getValue<string>()}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      accessorKey: 'linkedinUrl',
      header: 'LinkedIn',
      cell: (i) => i.getValue<string>()
        ? <a href={i.getValue<string>()!} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline text-xs">View</a>
        : '—',
    },
    {
      accessorKey: 'outreachStatus',
      header: 'Status',
      cell: (info) => <OutreachStatusBadge status={info.getValue<string>()} />,
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/dashboard" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">{job?.title ?? 'Search Job'}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', statusColors[job?.status ?? ''] ?? 'bg-gray-100')}>
              {job?.status ?? '—'}
            </span>
            <span className="text-xs text-gray-400">
              {job?._count.candidates ?? 0} candidates · Created {job ? new Date(job.createdAt).toLocaleDateString() : ''}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchJob().catch(console.error)}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            onClick={() => handleEnrich(candidates.map((c) => c.candidateId))}
            disabled={enriching || !candidates.length}
            className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Zap className="h-3.5 w-3.5" />
            {enriching ? 'Enriching…' : 'Enrich All'}
          </button>
        </div>
      </div>

      <CandidateTable
        data={candidates}
        columns={columns}
        getRowId={(row) => row.candidateId}
        onExport={handleExport}
        isLoading={loading}
        total={total}
        page={page}
        pageSize={50}
        onPageChange={setPage}
        extraActions={
          <button
            onClick={() => handleEnrich([])}
            disabled={enriching}
            className="flex items-center gap-1.5 rounded-md border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
          >
            <Zap className="h-3.5 w-3.5" />
            Enrich Selected
          </button>
        }
      />
    </div>
  );
}
