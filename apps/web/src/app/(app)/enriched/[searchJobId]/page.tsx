'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { api } from '@/lib/api';
import { CandidateTable, OutreachStatusBadge } from '@/components/tables/CandidateTable';
import { ArrowLeft, Send, FileText } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface EnrichedCandidate {
  id: string;
  candidateId: string;
  fullName: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  email: string | null;
  linkedinUrl: string | null;
  location: string | null;
  score: number;
  outreachStatus: string;
  enrichedAt: string | null;
  skills: string[];
}

interface Template {
  id: string;
  name: string;
}

interface SenderAccount {
  id: string;
  email: string;
}

export default function EnrichedCandidatesPage() {
  const { searchJobId } = useParams<{ searchJobId: string }>();
  const [candidates, setCandidates] = useState<EnrichedCandidate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [senders, setSenders] = useState<SenderAccount[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedSender, setSelectedSender] = useState('');
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const fetchCandidates = useCallback(async () => {
    const c = await api.get<{ data: EnrichedCandidate[]; total: number }>(
      `/enrichment/${searchJobId}/candidates?page=${page}&pageSize=50`,
    );
    setCandidates(c.data);
    setTotal(c.total);
  }, [searchJobId, page]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchCandidates(),
      api.get<{ data: Template[] }>('/templates').then((r) => setTemplates(r.data)),
      api.get<{ data: SenderAccount[] }>('/sender-accounts').then((r) => setSenders(r.data)),
    ])
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fetchCandidates]);

  async function handleDraft(selectedIds: string[]) {
    if (!selectedTemplate || !selectedSender) {
      alert('Select a template and sender account first.');
      return;
    }
    const ids = selectedIds.length ? selectedIds : candidates.map((c) => c.candidateId);
    setDrafting(true);
    try {
      await api.post('/outreach/draft', {
        candidateIds: ids,
        searchJobId,
        templateId: selectedTemplate,
        senderAccountId: selectedSender,
      });
      await fetchCandidates();
    } catch (err) {
      console.error(err);
    } finally {
      setDrafting(false);
    }
  }

  async function handleSend(selectedIds: string[]) {
    if (!selectedTemplate || !selectedSender) {
      alert('Select a template and sender account first.');
      return;
    }
    const ids = selectedIds.length ? selectedIds : candidates.map((c) => c.candidateId);
    setSending(true);
    try {
      await api.post('/outreach/send', {
        candidateIds: ids,
        searchJobId,
        templateId: selectedTemplate,
        senderAccountId: selectedSender,
      });
      await fetchCandidates();
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  async function handleExport(selectedIds: string[]) {
    const ids = selectedIds.length ? selectedIds : candidates.map((c) => c.candidateId);
    const blob = await api.download('/candidates/export', {
      method: 'POST',
      body: JSON.stringify({ candidateIds: ids, searchJobId }),
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enriched-${searchJobId}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: ColumnDef<EnrichedCandidate>[] = [
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
      accessorKey: 'score',
      header: 'Score',
      cell: (info) => (
        <span className={cn(
          'inline-flex rounded-full px-2 py-0.5 text-xs font-bold',
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
      cell: (i) => <span className="font-medium text-gray-900">{i.getValue<string>() ?? '—'}</span>,
    },
    { accessorKey: 'currentTitle', header: 'Title', cell: (i) => i.getValue<string>() ?? '—' },
    { accessorKey: 'currentCompany', header: 'Company', cell: (i) => i.getValue<string>() ?? '—' },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: (i) => i.getValue<string>()
        ? <span className="text-brand-600">{i.getValue<string>()}</span>
        : <span className="text-gray-300">no email</span>,
    },
    {
      accessorKey: 'skills',
      header: 'Skills',
      cell: (info) => {
        const skills = info.getValue<string[]>().slice(0, 3);
        return (
          <div className="flex flex-wrap gap-1">
            {skills.map((s) => (
              <span key={s} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{s}</span>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: 'outreachStatus',
      header: 'Status',
      cell: (info) => <OutreachStatusBadge status={info.getValue<string>()} />,
    },
    {
      accessorKey: 'enrichedAt',
      header: 'Enriched',
      cell: (i) => i.getValue<string>() ? new Date(i.getValue<string>()).toLocaleDateString() : '—',
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <Link href={`/search/${searchJobId}`} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Search Results
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">Enriched Candidates</h1>
        <p className="text-sm text-gray-500 mt-1">{total} candidates enriched for this search</p>
      </div>

      {/* Outreach controls */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Template</label>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
          >
            <option value="">Select template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Sender</label>
          <select
            value={selectedSender}
            onChange={(e) => setSelectedSender(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
          >
            <option value="">Select sender…</option>
            {senders.map((s) => (
              <option key={s.id} value={s.id}>{s.email}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 pt-4">
          <button
            onClick={() => handleDraft([])}
            disabled={drafting}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <FileText className="h-3.5 w-3.5" />
            {drafting ? 'Drafting…' : 'Draft All'}
          </button>
          <button
            onClick={() => handleSend([])}
            disabled={sending}
            className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {sending ? 'Sending…' : 'Send All'}
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
          <div className="flex gap-2">
            <button
              onClick={() => handleDraft([])}
              disabled={drafting}
              className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <FileText className="h-3.5 w-3.5" /> Draft Selected
            </button>
            <button
              onClick={() => handleSend([])}
              disabled={sending}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> Send Selected
            </button>
          </div>
        }
      />
    </div>
  );
}
