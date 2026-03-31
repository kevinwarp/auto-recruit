'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Trash2, Edit2, Eye, X } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
}

const PLACEHOLDER_DOCS = [
  '{{firstName}}', '{{lastName}}', '{{fullName}}', '{{currentTitle}}',
  '{{currentCompany}}', '{{linkedinUrl}}', '{{recruiterName}}',
];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [previewing, setPreviewing] = useState<Template | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  function openCreate() {
    setEditing(null);
    setName('');
    setSubject('');
    setBody('');
    setFormError('');
    setShowForm(true);
  }

  function openEdit(t: Template) {
    setEditing(t);
    setName(t.name);
    setSubject(t.subject);
    setBody(t.body);
    setFormError('');
    setShowForm(true);
  }

  async function fetchTemplates() {
    const r = await api.get<{ data: Template[] }>('/templates');
    setTemplates(r.data);
  }

  useEffect(() => {
    fetchTemplates().catch(console.error).finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!name.trim() || !subject.trim() || !body.trim()) {
      setFormError('All fields are required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await api.patch(`/templates/${editing.id}`, { name, subject, body });
      } else {
        await api.post('/templates', { name, subject, body });
      }
      await fetchTemplates();
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this template?')) return;
    try {
      await api.delete(`/templates/${id}`);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Email Templates</h1>
          <p className="text-sm text-gray-500 mt-1">Personalization placeholders are auto-filled per candidate</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          New Template
        </button>
      </div>

      {/* Placeholder docs */}
      <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
        <p className="text-xs font-medium text-blue-700 mb-1.5">Available placeholders</p>
        <div className="flex flex-wrap gap-1.5">
          {PLACEHOLDER_DOCS.map((p) => (
            <code key={p} className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800 font-mono">{p}</code>
          ))}
        </div>
      </div>

      {/* Template list */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
      ) : templates.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
          No templates yet.{' '}
          <button onClick={openCreate} className="text-brand-600 hover:underline">Create one</button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div key={t.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{t.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5 truncate">
                    <span className="font-medium text-gray-600">Subject: </span>{t.subject}
                  </p>
                  <p className="mt-1 text-xs text-gray-400 line-clamp-2 whitespace-pre-wrap">{t.body}</p>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button onClick={() => setPreviewing(t)} title="Preview" className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                    <Eye className="h-4 w-4" />
                  </button>
                  <button onClick={() => openEdit(t)} title="Edit" className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(t.id)} title="Delete" className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <Modal title={editing ? 'Edit Template' : 'New Template'} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            {formError && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{formError}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Initial Outreach – Engineering" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject Line</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Quick question, {{firstName}}" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                placeholder="Hi {{firstName}},&#10;&#10;I came across your profile and was impressed by your work at {{currentCompany}}…"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none resize-y"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Template'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Preview Modal */}
      {previewing && (
        <Modal title="Template Preview" onClose={() => setPreviewing(null)}>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Subject</p>
              <p className="text-sm text-gray-900 bg-gray-50 rounded-md p-3">{previewing.subject}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Body</p>
              <pre className="text-sm text-gray-700 bg-gray-50 rounded-md p-3 whitespace-pre-wrap font-sans">{previewing.body}</pre>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl mx-4 rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
