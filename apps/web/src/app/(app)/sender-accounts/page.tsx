'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Trash2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface SenderAccount {
  id: string;
  email: string;
  provider: string;
  isActive: boolean;
  dailyLimit: number;
  sentToday: number;
  lastSyncAt: string | null;
  createdAt: string;
}

export default function SenderAccountsPage() {
  const [accounts, setAccounts] = useState<SenderAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  async function fetchAccounts() {
    const r = await api.get<{ data: SenderAccount[] }>('/sender-accounts');
    setAccounts(r.data);
  }

  useEffect(() => {
    fetchAccounts().catch(console.error).finally(() => setLoading(false));
  }, []);

  async function handleConnect() {
    setConnecting(true);
    try {
      // Redirect to OAuth flow — the API returns the OAuth URL
      const r = await api.get<{ url: string }>('/sender-accounts/oauth/start?provider=google');
      window.location.href = r.url;
    } catch (err) {
      console.error(err);
      setConnecting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Disconnect this sender account? Any pending outreach using it will be paused.')) return;
    try {
      await api.delete(`/sender-accounts/${id}`);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error(err);
    }
  }

  async function handleToggle(id: string, currentlyActive: boolean) {
    try {
      await api.patch(`/sender-accounts/${id}`, { isActive: !currentlyActive });
      setAccounts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, isActive: !currentlyActive } : a)),
      );
    } catch (err) {
      console.error(err);
    }
  }

  const usagePercent = (account: SenderAccount) =>
    account.dailyLimit > 0 ? Math.round((account.sentToday / account.dailyLimit) * 100) : 0;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Sender Accounts</h1>
          <p className="text-sm text-gray-500 mt-1">Gmail accounts used to send outreach emails</p>
        </div>
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {connecting ? 'Redirecting…' : 'Connect Gmail Account'}
        </button>
      </div>

      {/* Info banner */}
      <div className="mb-6 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Daily limits:</strong> Each account can send up to the configured daily limit.
        Limits reset at midnight UTC. The platform automatically rotates between active accounts.
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
          No sender accounts connected yet.{' '}
          <button onClick={handleConnect} className="text-brand-600 hover:underline">
            Connect a Gmail account
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {/* Provider icon placeholder */}
                  <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600">
                    {account.email[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{account.email}</p>
                      {account.isActive ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          account.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {account.isActive ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {account.provider} ·{' '}
                      Last synced: {account.lastSyncAt
                        ? new Date(account.lastSyncAt).toLocaleString()
                        : 'Never'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(account.id, account.isActive)}
                    className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {account.isActive ? 'Pause' : 'Activate'}
                  </button>
                  <button
                    onClick={() => handleDelete(account.id)}
                    className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    title="Disconnect"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Daily usage bar */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Daily usage</span>
                  <span>
                    {account.sentToday} / {account.dailyLimit} emails ({usagePercent(account)}%)
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      usagePercent(account) >= 90
                        ? 'bg-red-500'
                        : usagePercent(account) >= 70
                        ? 'bg-yellow-400'
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(usagePercent(account), 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
