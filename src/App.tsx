import { useEffect, useRef } from 'react';
import { DataProvider, NavProvider, UiProvider, useData, useNav, useTheme, type Route } from './state';
import { Icon } from './components/ui';
import { Dashboard } from './pages/Dashboard';
import { Behaviors } from './pages/Behaviors';
import { IssueDetail } from './pages/IssueDetail';
import { LogEvent } from './pages/LogEvent';
import { WeeklyReview } from './pages/WeeklyReview';
import { Export } from './pages/Export';
import { DataPage } from './pages/DataPage';

const NAV: Array<{ name: Route['name']; label: string; icon: string }> = [
  { name: 'dashboard', label: 'Dashboard', icon: 'home' },
  { name: 'behaviors', label: 'Behaviors', icon: 'list' },
  { name: 'log', label: 'Log Event', icon: 'plus' },
  { name: 'review', label: 'Weekly Review', icon: 'calendar' },
  { name: 'export', label: 'Export', icon: 'share' },
];

export default function App() {
  return (
    <UiProvider>
      <DataProvider>
        <NavProvider>
          <Shell />
        </NavProvider>
      </DataProvider>
    </UiProvider>
  );
}

function Shell() {
  useTheme();
  const { route, go } = useNav();
  const { storageError } = useData();
  const visit = useRef(0);
  const prevRoute = useRef(route);
  if (prevRoute.current !== route) { prevRoute.current = route; visit.current++; }
  const section = route.name === 'issue' ? 'behaviors' : route.name;

  useEffect(() => {
    document.title = `${NAV.find((n) => n.name === section)?.label ?? 'Data'} · Pattern`;
  }, [section]);

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-stone-200 bg-white/60 px-3 py-5 dark:border-stone-800 dark:bg-stone-900/40 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-3">
          <Logo />
          <span className="font-semibold tracking-tight">Pattern</span>
        </div>
        <nav className="space-y-0.5">
          {NAV.map((n) => (
            <NavItem key={n.name} active={section === n.name} onClick={() => go({ name: n.name } as Route)} icon={n.icon} label={n.label} primary={n.name === 'log'} />
          ))}
        </nav>
        <div className="mt-auto">
          <NavItem active={section === 'data'} onClick={() => go({ name: 'data' })} icon="lock" label="Data & privacy" />
          <p className="mt-3 px-3 text-[11px] leading-snug text-stone-400">Stored locally in this browser. No account, no cloud.</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile top bar */}
        <div className="safe-top sticky top-0 z-20 border-b border-stone-200/70 bg-stone-50/90 backdrop-blur dark:border-stone-800/70 dark:bg-stone-950/90 md:hidden">
          <div className="flex h-12 items-center justify-between px-4">
            <button className="flex items-center gap-2" onClick={() => go({ name: 'dashboard' })}><Logo /><span className="font-semibold tracking-tight">Pattern</span></button>
            <button aria-label="Data & privacy" className={`rounded-lg p-2 ${section === 'data' ? 'bg-stone-200 dark:bg-stone-800' : 'text-stone-500'}`} onClick={() => go({ name: 'data' })}><Icon name="lock" /></button>
          </div>
        </div>

        {storageError && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">{storageError}</div>
        )}

        <main className="pb-nav mx-auto max-w-5xl px-4 pt-5 md:px-8 md:pt-8">
          <Page route={route} k={visit.current} />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95 md:hidden">
        <div className="grid h-16 grid-cols-5">
          {NAV.map((n) =>
            n.name === 'log' ? (
              <button key={n.name} onClick={() => go({ name: 'log' })} className="flex flex-col items-center justify-center" aria-label="Log event">
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm transition active:scale-95 ${section === 'log' ? 'bg-stone-700 text-white dark:bg-stone-300 dark:text-stone-900' : 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'}`}>
                  <Icon name="plus" />
                </span>
              </button>
            ) : (
              <button key={n.name} onClick={() => go({ name: n.name } as Route)} className={`flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium ${section === n.name ? 'text-stone-900 dark:text-stone-100' : 'text-stone-400'}`}>
                <Icon name={n.icon} className="h-[22px] w-[22px]" />
                {n.label.replace('Weekly ', '')}
              </button>
            ),
          )}
        </div>
      </nav>
    </div>
  );
}

function Page({ route, k }: { route: Route; k: number }) {
  switch (route.name) {
    case 'dashboard': return <Dashboard />;
    case 'behaviors': return <Behaviors />;
    case 'issue': return <IssueDetail id={route.id} />;
    case 'log': return <LogEvent key={k} issueId={route.issueId} eventId={route.eventId} back={route.back} />;
    case 'review': return <WeeklyReview />;
    case 'export': return <Export />;
    case 'data': return <DataPage />;
  }
}

function NavItem({ active, onClick, icon, label, primary }: { active: boolean; onClick: () => void; icon: string; label: string; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
        active ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : primary ? 'text-stone-900 hover:bg-stone-100 dark:text-stone-100 dark:hover:bg-stone-800' : 'text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800'
      }`}
    >
      <Icon name={icon} className="h-[18px] w-[18px]" />
      {label}
    </button>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden>
      <rect width="64" height="64" rx="16" className="fill-stone-900 dark:fill-stone-100" />
      <path d="M16 40l10-10 8 8 14-16" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" className="stroke-white dark:stroke-stone-900" />
    </svg>
  );
}
