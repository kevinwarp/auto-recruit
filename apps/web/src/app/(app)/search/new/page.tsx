'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { X, Plus } from 'lucide-react';

interface CompanyList {
  id: string;
  name: string;
  _count: { companies: number };
}

export default function NewSearchPage() {
  const router = useRouter();
  const [companyLists, setCompanyLists] = useState<CompanyList[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [companyListId, setCompanyListId] = useState('');
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [jobTitleInput, setJobTitleInput] = useState('');
  const [requiredKeywords, setRequiredKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
  const [excludeInput, setExcludeInput] = useState('');
  const [minScore, setMinScore] = useState(50);
  const [maxResults, setMaxResults] = useState(100);

  useEffect(() => {
    api.get<{ data: CompanyList[] }>('/company-lists')
      .then((r) => setCompanyLists(r.data))
      .catch(console.error);
  }, []);

  function addTag(value: string, setter: React.Dispatch<React.SetStateAction<string[]>>, inputSetter: React.Dispatch<React.SetStateAction<string>>) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setter((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    inputSetter('');
  }

  function removeTag(value: string, setter: React.Dispatch<React.SetStateAction<string[]>>) {
    setter((prev) => prev.filter((v) => v !== value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !companyListId) {
      setError('Title and company list are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const body = {
        title,
        companyListId,
        filters: {
          jobTitles,
          requiredKeywords,
          excludedKeywords,
          minScore,
          maxResults,
        },
      };
      const result = await api.post<{ id: string }>('/search-jobs', body);
      router.push(`/search/${result.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create search job');
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">New Search Job</h1>
        <p className="text-sm text-gray-500 mt-1">Configure your candidate search parameters</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Job Title / Search Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Senior Frontend Engineer – Q1 2025"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Company List */}
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
              <option key={l.id} value={l.id}>
                {l.name} ({l._count.companies} companies)
              </option>
            ))}
          </select>
        </div>

        {/* Job Titles to Search */}
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

        {/* Required Keywords */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Required Keywords</label>
          <p className="text-xs text-gray-400 mb-1">Candidates must mention these in their profile</p>
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

        {/* Excluded Keywords */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Excluded Keywords</label>
          <p className="text-xs text-gray-400 mb-1">Skip candidates who mention these</p>
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

        {/* Scoring / Volume */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Min Score (0–100)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Results
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? 'Creating…' : (
              <>
                <Plus className="h-4 w-4" />
                Create & Run Search
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

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
