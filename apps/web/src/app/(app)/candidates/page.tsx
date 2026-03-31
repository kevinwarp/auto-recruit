'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { api } from '@/lib/api';
import { CandidateTable, OutreachStatusBadge } from '@/components/tables/CandidateTable';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DirectoryCandidate {
  id: string;
  fullName: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  email: string | null;
  linkedinUrl: string | null;
  location: string | null;
  latestScore: number | null;
  latestOutreachStatus: string;
  latestBouncedAt: string | null;
  updatedAt: string;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'not_contacted', label: 'Not contacted' },
  { value: 'drafted', label: 'Drafted' },
  { value: 'sent', label: 'Sent' },
  { value: 'responded', label: 'Responded' },
  { value: 'bounced', label: 'Bounced' },
];

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<DirectoryCandidate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  const fetchCandidates = useCallback(async (q: string, status: string, pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pg), pageSize: '50' });
      if (q) params.set('q', q);
      if (status) params.set('status', status);
      const r = await api.get<{ data: DirectoryCandidate[]; total: number }>(
        `/candidates?${params.toString()}`,
      );
      setCandidates(r.data);
      setTotal(r.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      fetchCandidates(query, statusFilter, 1);
    }, 300);
    return () => clearTimeout(searchTimeout.current);
  }, [query, statusFilter, fetchCandidates]);

  useEffect(() => {
    fetchCandidates(query, statusFilter, page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleExport(selectedIds: string[]) {
    const params = new URLSearchParams();
    if (selectedIds.length) selectedIds.forEach((id) => params.append('id', id));
    if (query) params.set('q', query);
    if (statusFilter) params.set('status', statusFilter);
    const blob = await api.download(`/candidates/export?${params.toString()}`, { method: 'GET' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candidates-directory-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: ColumnDef<DirectoryCandidate>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input type="checkbox" checked={table.getIsAllRowsSelected()} onChange={table.getToggleAllRowsSelectedHandler()} className="h-4 w-4 rounded border-gray-300" />
      ),
      cell: ({ row }) => (
        <input type="checkbox" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} className="h-4 w-4 rounded border-gray-300" />
      ),
    },
    {
      accessorKey: 'fullName',
      header: 'Name',
      cell: (i) => <span className="font-medium text-gray-900">{i.getValue<string>() ?? '—'}</span>,
    },
    { accessorKey: 'currentTitle', header: 'Title', cell: (i) => i.getValue<string>() ?? '—' },
    { accessorKey: 'currentCompany', header: 'Company', cell: (i) => i.getValue<string>() ?? '—' },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: (i) => i.getValue<string>()
        ? <span className="text-brand-600">{i.getValue<string>()}</span>
        : <span className="text-gray-300">—</span>,
    },
    { accessorKey: 'location', header: 'Location', cell: (i) => i.getValue<string>() ?? '—' },
    {
      accessorKey: 'latestScore',
      header: 'Score',
      cell: (i) => {
        const v = i.getValue<number | null>();
        return v != null ? (
          <span className={cn(
            'inline-flex rounded-full px-2 py-0.5 text-xs font-bold',
            v >= 80 ? 'bg-green-100 text-green-800' : v >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
          )}>{v}</span>
        ) : '—';
      },
    },
    {
      accessorKey: 'latestOutreachStatus',
      header: 'Status',
      cell: (info) => <OutreachStatusBadge status={info.getValue<string>()} />,
    },
    {
      accessorKey: 'latestBouncedAt',
      header: 'Bounced',
      cell: (i) => i.getValue<string>()
        ? <span className="text-red-500 text-xs">{new Date(i.getValue<string>()).toLocaleDateString()}</span>
        : '—',
    },
    {
      accessorKey: 'linkedinUrl',
      header: 'LinkedIn',
      cell: (i) => i.getValue<string>()
        ? <a href={i.getValue<string>()!} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline text-xs">View</a>
        : '—',
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Candidate Directory</h1>
          <p className="text-sm text-gray-500 mt-1">All candidates across every search job</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, title, company…"
            className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <CandidateTable
        data={candidates}
        columns={columns}
        getRowId={(row) => row.id}
        onExport={handleExport}
        isLoading={loading}
        total={total}
        page={page}
        pageSize={50}
        onPageChange={setPage}
      />
    </div>
  );
}
