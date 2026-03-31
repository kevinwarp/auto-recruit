'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { X, Plus, ArrowLeft, ArrowRight, Check, Search, Zap, Mail, Clock } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface CompanyList {
  id: string;
  name: string;
  _count: { companies: number };
}

interface Template {
  id: string;
  name: string;
}

interface SenderAccount {
  id: string;
  email: string;
  isActive: boolean;
}

// ── Steps ────────────────────────────────────────────────────────────────────

const STEPS = [
  { key: 'search',     label: 'Search Criteria', icon: Search },
  { key: 'enrichment', label: 'Enrichment',      icon: Zap },
  { key: 'outreach',   label: 'Outreach',        icon: Mail },
  { key: 'schedule',   label: 'Schedule',         icon: Clock },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

// ── Component ────────────────────────────────────────────────────────────────

export default function NewCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>('search');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ── Reference data ──
  const [companyLists, setCompanyLists] = useState<CompanyList[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [senders, setSenders] = useState<SenderAccount[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<{ data: CompanyList[] }>('/company-lists').then((r) => setCompanyLists(r.data)),
      api.get<{ data: Template[] }>('/templates').then((r) => setTemplates(r.data)),
      api.get<{ data: SenderAccount[] }>('/sender-accounts').then((r) => setSenders(r.data)),
    ]).catch(console.error);
  }, []);

  // ── Form state ──
  const [name, setName] = useState('');
  const [companyListId, setCompanyListId] = useState('');
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [jobTitleInput, setJobTitleInput] = useState('');
  const [locations, setLocations] = useState<string[]>([]);
  const [locationInput, setLocationInput] = useState('');
  const [requiredKeywords, setRequiredKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
  const [excludeInput, setExcludeInput] = useState('');
  const [minScore, setMinScore] = useState(50);
  const [maxResults, setMaxResults] = useState(200);

  // Enrichment
  const [autoEnrich, setAutoEnrich] = useState(true);
  const [enrichMinScore, setEnrichMinScore] = useState(60);

  // Outreach
  const [autoOutreach, setAutoOutreach] = useState(true);
  const [templateId, setTemplateId] = useState('');
  const [senderAccountId, setSenderAccountId] = useState('');
  const [dailyLimit, setDailyLimit] = useState(50);

  // Schedule
  const [startImmediately, setStartImmediately] = useState(true);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');

  // ── Helpers ──
  function addTag(value: string, setter: React.Dispatch<React.SetStateAction<string[]>>, inputSetter: React.Dispatch<React.SetStateAction<string>>) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setter((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    inputSetter('');
  }

  function removeTag(value: string, setter: React.Dispatch<React.SetStateAction<string[]>>) {
    setter((prev) => prev.filter((v) => v !== value));
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  function goNext() {
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1].key);
  }

  function goBack() {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1].key);
  }

  function validate(): string | null {
    if (!name.trim()) return 'Campaign name is required.';
    if (!companyListId) return 'Select a company list.';
    if (autoOutreach && !templateId) return 'Select an email template for outreach.';
    if (autoOutreach && !senderAccountId) return 'Select a sender account for outreach.';
    return null;
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setSubmitting(true);
    setError('');
    try {
      const body = {
        name,
        companyListId,
        search: {
          jobTitles,
          locations,
          requiredKeywords,
          excludedKeywords,
          minScore,
          maxResults,
        },
        enrichment: {
          enabled: autoEnrich,
          minScore: enrichMinScore,
        },
        outreach: {
          enabled: autoOutreach,
          templateId: autoOutreach ? templateId : null,
          senderAccountId: autoOutreach ? senderAccountId : null,
          dailyLimit,
        },
        schedule: {
          startImmediately,
          scheduledAt: startImmediately
            ? null
            : `${scheduleDate}T${scheduleTime}:00Z`,
        },
      };

      const result = await api.post<{ id: string }>('/campaigns', body);
      router.push(`/auto-recruiter/${result.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign');
      setSubmitting(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <h1 className="text-2xl font-semibold text-gray-900">New Auto Recruiter Campaign</h1>
        <p className="text-sm text-gray-500 mt-1">Configure your automated recruiting pipeline</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-8">
        {STEPS.map((s, i) => {
          const isCurrent = s.key === step;
          const isDone = i < stepIndex;
          const Icon = s.icon;
          return (
            <div key={s.key} className="flex items-center flex-1">
              <button
                onClick={() => setStep(s.key)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full',
                  isCurrent
                    ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                    : isDone
                    ? 'bg-green-50 text-green-700'
                    : 'bg-gray-50 text-gray-400',
                )}
              >
                {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={cn('h-px w-4 shrink-0', isDone ? 'bg-green-300' : 'bg-gray-200')} />
              )}
            </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Form container */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        {/* Step 1: Search Criteria */}
        {step === 'search' && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Campaign Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Senior Engineers — March 2026"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company List <span className="text-red-500">*</span>
              </label>
              <select
                value={companyListId}
                onChange={(e) => setCompanyListId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Select a company list…</option>
                {companyLists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} ({l._count.companies} companies)</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Job Titles</label>
              <TagInput
                value={jobTitleInput}
                onChange={setJobTitleInput}
                onAdd={() => addTag(jobTitleInput, setJobTitles, setJobTitleInput)}
                tags={jobTitles}
                onRemove={(t) => removeTag(t, setJobTitles)}
                placeholder="Add title and press Enter…"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Locations</label>
              <TagInput
                value={locationInput}
                onChange={setLocationInput}
                onAdd={() => addTag(locationInput, setLocations, setLocationInput)}
                tags={locations}
                onRemove={(t) => removeTag(t, setLocations)}
                placeholder="Add location and press Enter…"
                color="blue"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Required Keywords</label>
              <TagInput
                value={keywordInput}
                onChange={setKeywordInput}
                onAdd={() => addTag(keywordInput, setRequiredKeywords, setKeywordInput)}
                tags={requiredKeywords}
                onRemove={(t) => removeTag(t, setRequiredKeywords)}
                placeholder="Add keyword and press Enter…"
                color="blue"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Excluded Keywords</label>
              <TagInput
                value={excludeInput}
                onChange={setExcludeInput}
                onAdd={() => addTag(excludeInput, setExcludedKeywords, setExcludeInput)}
                tags={excludedKeywords}
                onRemove={(t) => removeTag(t, setExcludedKeywords)}
                placeholder="Add keyword and press Enter…"
                color="red"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Score (0–100)</label>
                <input type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Results</label>
                <input type="number" min={1} max={1000} value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none" />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Enrichment */}
        {step === 'enrichment' && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-lg border border-gray-200 p-4">
              <input
                type="checkbox"
                checked={autoEnrich}
                onChange={(e) => setAutoEnrich(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Auto-enrich candidates</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Automatically find personal emails for candidates that meet your score threshold using PDL, Apollo, and ContactOut.
                </p>
              </div>
            </div>

            {autoEnrich && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Score to Enrich
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  Only candidates with a score ≥ this threshold will be enriched (saves vendor credits)
                </p>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={enrichMinScore}
                  onChange={(e) => setEnrichMinScore(Number(e.target.value))}
                  className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
            )}

            {!autoEnrich && (
              <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800">
                Enrichment is disabled. Candidates will be found but not enriched — you can enrich them manually later from the search results.
              </div>
            )}
          </div>
        )}

        {/* Step 3: Outreach */}
        {step === 'outreach' && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-lg border border-gray-200 p-4">
              <input
                type="checkbox"
                checked={autoOutreach}
                onChange={(e) => setAutoOutreach(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Auto-send outreach emails</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Automatically draft and send personalized emails to enriched candidates with a verified email address.
                </p>
              </div>
            </div>

            {autoOutreach && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Template <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                  >
                    <option value="">Select template…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  {templates.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      No templates found.{' '}
                      <a href="/templates" className="text-brand-600 hover:underline">Create one</a>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sender Account <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={senderAccountId}
                    onChange={(e) => setSenderAccountId(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                  >
                    <option value="">Select sender…</option>
                    {senders.filter((s) => s.isActive).map((s) => (
                      <option key={s.id} value={s.id}>{s.email}</option>
                    ))}
                  </select>
                  {senders.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      No sender accounts connected.{' '}
                      <a href="/sender-accounts" className="text-brand-600 hover:underline">Connect one</a>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Daily Send Limit</label>
                  <p className="text-xs text-gray-400 mb-2">
                    Max emails sent per day for this campaign (helps maintain deliverability)
                  </p>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(Number(e.target.value))}
                    className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </>
            )}

            {!autoOutreach && (
              <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800">
                Outreach is disabled. Candidates will be found and enriched but no emails will be sent automatically.
              </div>
            )}
          </div>
        )}

        {/* Step 4: Schedule */}
        {step === 'schedule' && (
          <div className="space-y-5">
            <div className="space-y-3">
              <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 cursor-pointer">
                <input
                  type="radio"
                  name="schedule"
                  checked={startImmediately}
                  onChange={() => setStartImmediately(true)}
                  className="mt-0.5 h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Start immediately</p>
                  <p className="text-xs text-gray-500 mt-0.5">Begin searching and processing candidates right away</p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 cursor-pointer">
                <input
                  type="radio"
                  name="schedule"
                  checked={!startImmediately}
                  onChange={() => setStartImmediately(false)}
                  className="mt-0.5 h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Schedule for later</p>
                  <p className="text-xs text-gray-500 mt-0.5">Set a specific date and time to start the campaign</p>
                </div>
              </label>
            </div>

            {!startImmediately && (
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div className="w-32">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time (UTC)</label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-2">
              <p className="text-sm font-semibold text-gray-700">Campaign Summary</p>
              <div className="grid grid-cols-2 gap-y-1.5 text-xs text-gray-600">
                <span className="text-gray-400">Name</span>
                <span className="font-medium">{name || '—'}</span>
                <span className="text-gray-400">Job Titles</span>
                <span className="font-medium">{jobTitles.length > 0 ? jobTitles.join(', ') : '—'}</span>
                <span className="text-gray-400">Locations</span>
                <span className="font-medium">{locations.length > 0 ? locations.join(', ') : 'Any'}</span>
                <span className="text-gray-400">Auto-Enrich</span>
                <span className="font-medium">{autoEnrich ? `Yes (score ≥ ${enrichMinScore})` : 'No'}</span>
                <span className="text-gray-400">Auto-Outreach</span>
                <span className="font-medium">{autoOutreach ? `Yes (${dailyLimit}/day)` : 'No'}</span>
                <span className="text-gray-400">Start</span>
                <span className="font-medium">{startImmediately ? 'Immediately' : `${scheduleDate} at ${scheduleTime} UTC`}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between mt-6">
        <button
          type="button"
          onClick={stepIndex === 0 ? () => router.back() : goBack}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {stepIndex === 0 ? 'Cancel' : 'Back'}
        </button>

        {stepIndex < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={goNext}
            className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? 'Creating…' : (
              <>
                <Zap className="h-4 w-4" />
                Launch Campaign
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Reusable tag input ───────────────────────────────────────────────────────

function TagInput({
  value,
  onChange,
  onAdd,
  tags,
  onRemove,
  placeholder,
  color = 'gray',
}: {
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  tags: string[];
  onRemove: (t: string) => void;
  placeholder: string;
  color?: 'gray' | 'blue' | 'red';
}) {
  const colorMap = {
    gray: 'bg-gray-100 text-gray-700',
    blue: 'bg-blue-100 text-blue-700',
    red: 'bg-red-100 text-red-700',
  };

  return (
    <div className="rounded-md border border-gray-300 p-2 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${colorMap[color]}`}
          >
            {tag}
            <button type="button" onClick={() => onRemove(tag)}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onAdd(); }
        }}
        placeholder={placeholder}
        className="w-full text-sm outline-none placeholder-gray-400"
      />
    </div>
  );
}
