'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { CompleteProfileModal } from '@/components/complete-profile-modal';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HardDrive,
  FolderKanban,
  UploadCloud,
  KeyRound,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    name: 'Projects',
    href: '/dashboard',
    icon: FolderKanban,
    isActive: (p) => p === '/dashboard' || p.startsWith('/dashboard/projects'),
  },
  {
    name: 'Upload Object',
    href: '/dashboard/storage',
    icon: UploadCloud,
    isActive: (p) => p.startsWith('/dashboard/storage'),
  },
  {
    name: 'API Keys',
    href: '/dashboard/api-keys',
    icon: KeyRound,
    isActive: (p) => p.startsWith('/dashboard/api-keys'),
  },
  {
    name: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
    isActive: (p) => p.startsWith('/dashboard/settings'),
  },
];

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 group">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#FF4FD8] to-[#FF2FB3] flex items-center justify-center text-black shadow-md shadow-[#FF4FD8]/25 group-hover:shadow-[#FF4FD8]/45 transition-shadow">
        <HardDrive className="w-4 h-4 stroke-[2.2]" />
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-bold tracking-tight text-white group-hover:text-slate-200 transition-colors">
          ZENTRAGRID
        </span>
        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono uppercase bg-white/[0.05] border border-white/10 text-slate-400">
          CONSOLE
        </span>
      </div>
    </Link>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 px-3">
      <p className="px-3 pb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500">
        Menu
      </p>
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.isActive(pathname);
        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={onNavigate}
            className={`relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 group ${
              active
                ? 'bg-[#FF4FD8]/10 text-white border border-[#FF4FD8]/25 shadow-[0_0_24px_-6px_rgba(255,79,216,0.35)]'
                : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] border border-transparent'
            }`}
          >
            {/* Active indicator bar */}
            <span
              className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-gradient-to-b from-[#FF9BE8] to-[#FF2FB3] transition-opacity ${
                active ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <Icon
              className={`w-4 h-4 transition-colors ${
                active ? 'text-[#FF9BE8]' : 'text-slate-500 group-hover:text-slate-300'
              }`}
            />
            <span>{item.name}</span>
            {active && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#FF4FD8] shadow-[0_0_8px_rgba(255,79,216,0.9)]" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarProfile() {
  const { user, owner, signOut } = useAuth();
  return (
    <div className="px-3 pb-4">
      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-[#FF4FD8]/15 border border-[#FF4FD8]/35 flex items-center justify-center text-xs font-bold text-[#FF9BE8] shrink-0">
            {owner?.name ? owner.name.charAt(0).toUpperCase() : 'O'}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-medium text-white truncate">
              {owner?.name || user?.email || 'Owner'}
            </span>
            <span className="text-[10px] text-slate-500 truncate leading-tight">
              {owner?.company || user?.email || ''}
            </span>
          </div>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#FF4FD8]/15 text-[#FF9BE8] border border-[#FF4FD8]/25 uppercase shrink-0">
            {owner?.plan || 'Free'}
          </span>
        </div>
        <button
          onClick={() => signOut()}
          className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-white/10 text-[11px] font-medium text-slate-400 hover:text-white hover:bg-white/[0.06] hover:border-[#FF4FD8]/30 transition-all"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, requiresProfileCompletion } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Route guard
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    } else if (!loading && user && requiresProfileCompletion) {
      router.push('/complete-profile');
    }
  }, [user, loading, requiresProfileCompletion, router]);

  // Close the mobile drawer whenever the route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#06070B] text-slate-100 flex">
        {/* Sidebar skeleton */}
        <aside className="hidden lg:flex flex-col w-[260px] shrink-0 h-screen sticky top-0 border-r border-white/10 p-4 animate-pulse">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-lg bg-white/10" />
            <div className="h-4 w-28 bg-white/10 rounded" />
          </div>
          <div className="mt-8 space-y-2">
            <div className="h-9 rounded-xl bg-white/5" />
            <div className="h-9 rounded-xl bg-white/5" />
            <div className="h-9 rounded-xl bg-white/5" />
            <div className="h-9 rounded-xl bg-white/5" />
          </div>
        </aside>
        <div className="flex-1 p-6 sm:p-10 animate-pulse">
          <div className="max-w-7xl mx-auto w-full space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
              <div className="h-32 rounded-2xl bg-white/5 border border-white/10" />
              <div className="h-32 rounded-2xl bg-white/5 border border-white/10" />
              <div className="h-32 rounded-2xl bg-white/5 border border-white/10" />
            </div>
            <div className="h-72 rounded-3xl bg-white/5 border border-white/10" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#06070B] text-slate-100 selection:bg-[#FF4FD8]/30 selection:text-white">
      {requiresProfileCompletion && <CompleteProfileModal />}

      {/* ===== Desktop sidebar (fixed left) ===== */}
      <aside className="hidden lg:flex flex-col w-[260px] h-screen fixed top-0 left-0 z-40 border-r border-white/10 bg-[#08090F]/95 backdrop-blur-xl">
        {/* Brand */}
        <div className="px-5 h-16 flex items-center border-b border-white/10">
          <Brand />
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-5">
          <SidebarNav />
        </div>

        {/* Profile / sign out */}
        <div className="border-t border-white/10 pt-4">
          <SidebarProfile />
        </div>
      </aside>

      {/* ===== Mobile top bar (logo + hamburger) ===== */}
      <header className="lg:hidden h-16 px-4 flex items-center justify-between sticky top-0 z-40 bg-[#06070B]/90 backdrop-blur-xl border-b border-white/10">
        <Brand />
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* ===== Mobile drawer ===== */}
      <div
        className={`lg:hidden fixed inset-0 z-50 ${mobileMenuOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!mobileMenuOpen}
      >
        {/* Backdrop */}
        <div
          onClick={() => setMobileMenuOpen(false)}
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
            mobileMenuOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {/* Panel */}
        <aside
          className={`absolute top-0 left-0 h-full w-[280px] max-w-[85vw] flex flex-col bg-[#08090F] border-r border-white/10 shadow-2xl shadow-black/60 transition-transform duration-300 ease-out ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="px-5 h-16 flex items-center justify-between border-b border-white/10">
            <Brand />
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-white transition-colors"
              aria-label="Close navigation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-5">
            <SidebarNav onNavigate={() => setMobileMenuOpen(false)} />
          </div>
          <div className="border-t border-white/10 pt-4">
            <SidebarProfile />
          </div>
        </aside>
      </div>

      {/* ===== Main viewport ===== */}
      <main className="lg:pl-[260px] min-h-screen">
        <div className="max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
