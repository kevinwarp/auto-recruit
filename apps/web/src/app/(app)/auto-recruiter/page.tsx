'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Plus,
  Play,
  Pause,
  RotateCcw,
  Users,
  Mail,
  MessageSquare,
  Zap,
  ArrowRight,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
  /** Search criteria summary */
  searchCriteria: {
    companyListName: string;
    jobTitles: string[];
    locations: string[];
  };
  /** Pipeline stats */
  stats: {
    candidatesFound: number;
    candidatesEnriched: number;
    emailsSent: number;
    replies: number;
    bounces: number;
  };
  templateName: string | null;
  senderEmail: string | null;
}

type CampaignStatus = 'draft' | 'running' | 'paused' | 'completed' | 'failed';

// ── Status helpers ───────────────────────────────────────────────────────────

const statusConfig: Record<CampaignStatus, { label: string; color: string }> = {
  draft:     { label: 'Draft',     color: 'bg-gray-100 text-gray-700' },
  running:   { label: 'Running',   color: 'bg-green-100 text-green-700 animate-pulse' },
  paused:    { label: 'Paused',    color: 'bg-yellow-100 text-yellow-700' },
  completed: { label: 'Completed', color: 'bg-blue-100 text-blue-700' },
  failed:    { label: 'Failed',    color: 'bg-red-100 text-red-700' },
};

// ── Component ────────────────────────────────────────────────────────────────

export default function AutoRecruiterPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ data: Campaign[] }>('/campaigns')
      .then((r) => setCampaigns(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function toggleStatus(id: string, current: CampaignStatus) {
    const next = current === 'running' ? 'paused' : 'running';
    try {
      await api.patch(`/campaigns/${id}`, { status: next });
      setCampaigns((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: next } : c)),
      );
    } catch (err) {
      console.error(err);
    }
  }

  const active = campaigns.filter((c) => c.status === 'running' || c.status === 'paused');
  const past = campaigns.filter((c) => c.status === 'completed' || c.status === 'failed');
  const drafts = campaigns.filter((c) => c.status === 'draft');

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Auto Recruiter</h1>
          <p className="text-sm text-gray-500 mt-1">
            Automated recruiting campaigns — search, enrich &amp; outreach on autopilot
          </p>
        </div>
        <Link
          href="/auto-recruiter/new"
          className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          New Campaign
        </Link>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Loading campaigns…</div>
      ) : campaigns.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {/* Active campaigns */}
          {active.length > 0 && (
            <Section title="Active Campaigns" count={active.length}>
              {active.map((c) => (
                <CampaignCard key={c.id} campaign={c} onToggle={toggleStatus} />
              ))}
            </Section>
          )}

          {/* Drafts */}
          {drafts.length > 0 && (
            <Section title="Drafts" count={drafts.length}>
              {drafts.map((c) => (
                <CampaignCard key={c.id} campaign={c} onToggle={toggleStatus} />
              ))}
            </Section>
          )}

          {/* Past campaigns */}
          {past.length > 0 && (
            <Section title="Past Campaigns" count={past.length}>
              {past.map((c) => (
                <CampaignCard key={c.id} campaign={c} onToggle={toggleStatus} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h2>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// ── Campaign card ────────────────────────────────────────────────────────────

function CampaignCard({
  campaign: c,
  onToggle,
}: {
  campaign: Campaign;
  onToggle: (id: string, current: CampaignStatus) => void;
}) {
  const cfg = statusConfig[c.status];
  const replyRate =
    c.stats.emailsSent > 0
      ? ((c.stats.replies / c.stats.emailsSent) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between p-5">
        {/* Left: name + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Link href={`/auto-recruiter/${c.id}`} className="text-base font-semibold text-gray-900 hover:text-brand-600 truncate">
              {c.name}
            </Link>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', cfg.color)}>
              {cfg.label}
            </span>
          </div>

          {/* Criteria pills */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs text-gray-500">
            {c.searchCriteria.companyListName && (
              <span className="rounded bg-gray-100 px-2 py-0.5">{c.searchCriteria.companyListName}</span>
            )}
            {c.searchCriteria.jobTitles.slice(0, 3).map((t) => (
              <span key={t} className="rounded bg-purple-50 text-purple-700 px-2 py-0.5">{t}</span>
            ))}
            {c.searchCriteria.locations.slice(0, 2).map((l) => (
              <span key={l} className="rounded bg-blue-50 text-blue-700 px-2 py-0.5">{l}</span>
            ))}
          </div>

          {/* Template + sender line */}
          {(c.templateName || c.senderEmail) && (
            <p className="text-xs text-gray-400 mt-2">
              {c.templateName && <span>Template: <span className="text-gray-600">{c.templateName}</span></span>}
              {c.templateName && c.senderEmail && <span className="mx-1">·</span>}
              {c.senderEmail && <span>Sender: <span className="text-gray-600">{c.senderEmail}</span></span>}
            </p>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 ml-4 shrink-0">
          {(c.status === 'running' || c.status === 'paused') && (
            <button
              onClick={(e) => { e.preventDefault(); onToggle(c.id, c.status); }}
              className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {c.status === 'running' ? (
                <><Pause className="h-3 w-3" /> Pause</>
              ) : (
                <><Play className="h-3 w-3" /> Resume</>
              )}
            </button>
          )}
          {(c.status === 'completed' || c.status === 'failed') && (
            <button
              onClick={(e) => { e.preventDefault(); onToggle(c.id, c.status); }}
              className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <RotateCcw className="h-3 w-3" /> Rerun
            </button>
          )}
          <Link
            href={`/auto-recruiter/${c.id}`}
            className="flex items-center gap-1 rounded-md bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
          >
            View <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-5 gap-px border-t border-gray-100 bg-gray-100 rounded-b-lg overflow-hidden">
        <Stat icon={Users} label="Found" value={c.stats.candidatesFound} />
        <Stat icon={Zap} label="Enriched" value={c.stats.candidatesEnriched} />
        <Stat icon={Mail} label="Sent" value={c.stats.emailsSent} />
        <Stat icon={MessageSquare} label="Replies" value={c.stats.replies} />
        <Stat label="Reply Rate" value={`${replyRate}%`} />
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex flex-col items-center bg-white py-3 px-2">
      <div className="flex items-center gap-1 text-xs text-gray-400 mb-0.5">
        {Icon && <Icon className="h-3 w-3" />}
        <span>{label}</span>
      </div>
      <span className="text-sm font-bold text-gray-900">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="rounded-lg border-2 border-dashed border-gray-200 px-6 py-16 text-center">
      <div className="mx-auto h-14 w-14 rounded-full bg-brand-50 flex items-center justify-center mb-4">
        <Zap className="h-7 w-7 text-brand-600" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">No campaigns yet</h3>
      <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
        Auto Recruiter runs your entire pipeline — candidate search, enrichment, and email outreach — automatically. Create a campaign to get started.
      </p>
      <Link
        href="/auto-recruiter/new"
        className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
      >
        <Plus className="h-4 w-4" />
        Create Your First Campaign
      </Link>
    </div>
  );
}
