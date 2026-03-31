'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Search,
  Users,
  Mail,
  FileText,
  Settings,
  LogOut,
  Bot,
} from 'lucide-react';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/auto-recruiter', label: 'Auto Recruiter', icon: Bot },
  { href: '/search/new', label: 'New Search', icon: Search },
  { href: '/candidates', label: 'Candidates', icon: Users },
  { href: '/templates', label: 'Templates', icon: FileText },
  { href: '/sender-accounts', label: 'Sender Accounts', icon: Mail },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col bg-white border-r border-gray-200">
        <div className="px-4 py-5 border-b border-gray-200">
          <span className="text-lg font-bold text-brand-600">Auto Recruiter</span>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                pathname.startsWith(href)
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-100',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-sm font-medium">
              {user.email?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">{user.displayName ?? user.email}</p>
            </div>
          </div>
          <button
            onClick={() => void signOut()}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 w-full"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
