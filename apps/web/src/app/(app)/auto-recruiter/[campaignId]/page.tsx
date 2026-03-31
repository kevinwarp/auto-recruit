'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { type ColumnDef } from '@tanstack/react-table';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { CandidateTable, OutreachStatusBadge } from '@/components/tables/CandidateTable';
import {
  ArrowLeft,
  Play,
  Pause,
  RefreshCw,
  Search,
  Zap,
  Mail,
  Users,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type CampaignStatus = 'draft' | 'running' | 'paused' | 'completed' | 'failed';

type PipelineStage = 'search' | 'enrichment' | 'outreach';
type StageStatus = 'pending' | 'running' | 'completed' | 'failed';

interface CampaignDetail {
  id: string;
  name: string;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
  searchCriteria: {
    companyListName: string;
    jobTitles: string[];
    locations: string[];
    requiredKeywords: string[];
    excludedKeywords: string[];
    minScore: number;
    maxResults: number;
  };
  enrichment: {
    enabled: boolean;
    minScore: number;
  };
  outreach: {
    enabled: boolean;
    templateName: string | null;
    senderEmail: string | null;
    dailyLimit: number;
  };
  pipeline: {
    search:     { status: StageStatus; progress: number; total: number; startedAt: string | null; completedAt: string | null };
    enrichment: { status: StageStatus; progress: number; total: number; startedAt: string | null; completedAt: string | null };
    outreach:   { status: StageStatus; progress: number; total: number; startedAt: string | null; completedAt: string | null };
  };
  stats: {
    candidatesFound: number;
    candidatesEnriched: number;
    emailsSent: number;
    replies: number;
    bounces: number;
  };
}

interface CampaignCandidate {
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
  sentAt: string | null;
}

// ── Status config ────────────────────────────────────────────────────────────

const statusColors: Record<CampaignStatus, string> = {
  draft:     'bg-gray-100 text-gray-700',
  running:   'bg-green-100 text-green-700 animate-pulse',
  paused:    'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  failed:    'bg-red-100 text-red-700',
};

const stageIcons: Record<PipelineStage, React.ComponentType<{ className?: string }>> = {
  search:     Search,
  enrichment: Zap,
  outreach:   Mail,
};

const stageStatusIcon: Record<StageStatus, React.ComponentType<{ className?: string }>> = {
  pending:   Clock,
  running:   RefreshCw,
  completed: CheckCircle2,
  failed:    AlertTriangle,
};

const stageStatusColor: Record<StageStatus, string> = {
  pending:   'text-gray-400',
  running:   'text-blue-500 animate-spin',
  completed: 'text-green-500',
  failed:    'text-red-500',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [candidates, setCandidates] = useState<CampaignCandidate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchCampaign = useCallback(async () => {
    const [c, cands] = await Promise.all([
      api.get<CampaignDetail>(`/campaigns/${campaignId}`),
      api.get<{ data: CampaignCandidate[]; total: number }>(
        `/campaigns/${campaignId}/candidates?page=${page}&pageSize=50`,
      ),
    ]);
    setCampaign(c);
    setCandidates(cands.data);
    setTotal(cands.total);
  }, [campaignId, page]);

  useEffect(() => {
    setLoading(true);
    fetchCampaign().catch(console.error).finally(() => setLoading(false));
  }, [fetchCampaign]);

  // Poll while running
  useEffect(() => {
    if (campaign?.status !== 'running') return;
    const interval = setInterval(() => fetchCampaign().catch(console.error), 5000);
    return () => clearInterval(interval);
  }, [campaign?.status, fetchCampaign]);

  async function toggleStatus() {
    if (!campaign) return;
    const next = campaign.status === 'running' ? 'paused' : 'running';
    try {
      await api.patch(`/campaigns/${campaignId}`, { status: next });
      setCampaign((prev) => prev ? { ...prev, status: next } : prev);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleExport(selectedIds: string[]) {
    const ids = selectedIds.length ? selectedIds : candidates.map((c) => c.candidateId);
    const blob = await api.download('/candidates/export', {
      method: 'POST',
      body: JSON.stringify({ candidateIds: ids }),
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-${campaign?.name ?? campaignId}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: ColumnDef<CampaignCandidate>[] = [
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
          'bg-gray-100 text-gray-600',
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
        : <span className="text-gray-300">—</span>,
    },
    { accessorKey: 'location', header: 'Location', cell: (i) => i.getValue<string>() ?? '—' },
    {
      accessorKey: 'outreachStatus',
      header: 'Status',
      cell: (info) => <OutreachStatusBadge status={info.getValue<string>()} />,
    },
    {
      accessorKey: 'sentAt',
      header: 'Sent',
      cell: (i) => i.getValue<string>()
        ? <span className="text-xs text-gray-500">{formatDateTime(i.getValue<string>())}</span>
        : '—',
    },
  ];

  if (loading || !campaign) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  const replyRate =
    campaign.stats.emailsSent > 0
      ? ((campaign.stats.replies / campaign.stats.emailsSent) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/auto-recruiter" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> All Campaigns
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">{campaign.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', statusColors[campaign.status])}>
              {campaign.status}
            </span>
            <span className="text-xs text-gray-400">
              Created {new Date(campaign.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchCampaign().catch(console.error)}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          {(campaign.status === 'running' || campaign.status === 'paused' || campaign.status === 'draft') && (
            <button
              onClick={toggleStatus}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
                campaign.status === 'running'
                  ? 'border border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                  : 'bg-brand-600 text-white hover:bg-brand-700',
              )}
            >
              {campaign.status === 'running' ? (
                <><Pause className="h-3.5 w-3.5" /> Pause</>
              ) : (
                <><Play className="h-3.5 w-3.5" /> {campaign.status === 'draft' ? 'Start' : 'Resume'}</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
        <StatCard icon={Users} label="Found" value={campaign.stats.candidatesFound} color="text-blue-600 bg-blue-50" />
        <StatCard icon={Zap} label="Enriched" value={campaign.stats.candidatesEnriched} color="text-purple-600 bg-purple-50" />
        <StatCard icon={Mail} label="Sent" value={campaign.stats.emailsSent} color="text-green-600 bg-green-50" />
        <StatCard icon={MessageSquare} label="Replies" value={campaign.stats.replies} color="text-orange-600 bg-orange-50" />
        <StatCard label="Reply Rate" value={`${replyRate}%`} color="text-brand-600 bg-brand-50" />
      </div>

      {/* Pipeline visualization */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Pipeline</h2>
        <div className="flex items-stretch gap-2">
          {(['search', 'enrichment', 'outreach'] as PipelineStage[]).map((stage, i) => {
            const data = campaign.pipeline[stage];
            const StageIcon = stageIcons[stage];
            const StatusIcon = stageStatusIcon[data.status];
            const pct = data.total > 0 ? Math.round((data.progress / data.total) * 100) : 0;

            return (
              <div key={stage} className="flex items-center flex-1">
                <div className={cn(
                  'flex-1 rounded-lg border p-4',
                  data.status === 'running' ? 'border-blue-200 bg-blue-50/50' :
                  data.status === 'completed' ? 'border-green-200 bg-green-50/30' :
                  data.status === 'failed' ? 'border-red-200 bg-red-50/30' :
                  'border-gray-200',
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <StageIcon className="h-4 w-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-900 capitalize">{stage}</span>
                    </div>
                    <StatusIcon className={cn('h-4 w-4', stageStatusColor[data.status])} />
                  </div>
                  <div className="text-xs text-gray-500 mb-2">
                    {data.progress} / {data.total} processed
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-gray-100">
                    <div
                      className={cn(
                        'h-1.5 rounded-full transition-all',
                        data.status === 'failed' ? 'bg-red-400' :
                        data.status === 'completed' ? 'bg-green-400' :
                        'bg-blue-400',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {data.startedAt && (
                    <p className="text-xs text-gray-400 mt-2">
                      Started {formatDateTime(data.startedAt)}
                      {data.completedAt && ` · Done ${formatDateTime(data.completedAt)}`}
                    </p>
                  )}
                </div>
                {i < 2 && (
                  <ChevronRight className="h-5 w-5 text-gray-300 mx-1 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Configuration summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <ConfigCard title="Search Criteria">
          <ConfigRow label="Company List" value={campaign.searchCriteria.companyListName} />
          <ConfigRow label="Job Titles" value={campaign.searchCriteria.jobTitles.join(', ') || 'Any'} />
          <ConfigRow label="Locations" value={campaign.searchCriteria.locations.join(', ') || 'Any'} />
          <ConfigRow label="Min Score" value={String(campaign.searchCriteria.minScore)} />
          <ConfigRow label="Max Results" value={String(campaign.searchCriteria.maxResults)} />
        </ConfigCard>
        <ConfigCard title="Enrichment">
          <ConfigRow label="Auto-Enrich" value={campaign.enrichment.enabled ? 'Yes' : 'No'} />
          {campaign.enrichment.enabled && (
            <ConfigRow label="Min Score" value={String(campaign.enrichment.minScore)} />
          )}
        </ConfigCard>
        <ConfigCard title="Outreach">
          <ConfigRow label="Auto-Send" value={campaign.outreach.enabled ? 'Yes' : 'No'} />
          {campaign.outreach.enabled && (
            <>
              <ConfigRow label="Template" value={campaign.outreach.templateName ?? '—'} />
              <ConfigRow label="Sender" value={campaign.outreach.senderEmail ?? '—'} />
              <ConfigRow label="Daily Limit" value={String(campaign.outreach.dailyLimit)} />
            </>
          )}
        </ConfigCard>
      </div>

      {/* Candidates table */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Candidates ({total})
        </h2>
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
        />
      </div>
    </div>
  );
}

// ── Small components ─────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        {Icon && (
          <span className={cn('rounded-full p-1.5', color)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-bold text-gray-900">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function ConfigCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4">
      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-700 font-medium text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}
