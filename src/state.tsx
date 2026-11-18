import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import { listEvents, listIssues, listReviews } from './db/repo';
import type { BehaviorEvent, Issue, WeeklyReview } from './types';
import { storage } from './lib/platform';

/* ---------------- Data ---------------- */

interface DataCtx {
  issues: Issue[];
  events: BehaviorEvent[];
  reviews: WeeklyReview[];
  loading: boolean;
  storageError: string | null;
}

const DataContext = createContext<DataCtx>({ issues: [], events: [], reviews: [], loading: true, storageError: null });

export function DataProvider({ children }: { children: ReactNode }) {
  const [storageError, setStorageError] = useState<string | null>(null);
  useEffect(() => {
    db.open().catch((e: Error) =>
      setStorageError(
        e?.name === 'VersionError'
          ? 'Stored data was created by a newer version of this app.'
          : 'Browser storage is unavailable here (private mode or blocked storage). Changes will not be saved.',
      ),
    );
  }, []);
  const safe = <T,>(p: () => Promise<T[]>) => () => p().catch(() => [] as T[]);
  const issues = useLiveQuery(safe(listIssues), []);
  const events = useLiveQuery(safe(listEvents), []);
  const reviews = useLiveQuery(safe(listReviews), []);
  const value = useMemo(
    () => ({
      issues: issues ?? [],
      events: events ?? [],
      reviews: reviews ?? [],
      loading: issues === undefined || events === undefined || reviews === undefined,
      storageError,
    }),
    [issues, events, reviews, storageError],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);

/* ---------------- Navigation ---------------- */

export type Route =
  | { name: 'dashboard' }
  | { name: 'behaviors' }
  | { name: 'issue'; id: string }
  | { name: 'log'; issueId?: string; eventId?: string; back?: Route }
  | { name: 'review' }
  | { name: 'export' }
  | { name: 'data' };

const HASH_ROUTES = ['dashboard', 'behaviors', 'log', 'review', 'export', 'data'] as const;

interface NavCtx { route: Route; go: (r: Route) => void; back: () => void }
const NavContext = createContext<NavCtx>({ route: { name: 'dashboard' }, go: () => {}, back: () => {} });

/** Only plain top-level names go in the URL hash — never IDs or content. */
function routeFromHash(): Route {
  const h = location.hash.replace(/^#/, '');
  return (HASH_ROUTES as readonly string[]).includes(h) ? ({ name: h } as Route) : { name: 'dashboard' };
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const stack = useRef<Route[]>([]);
  useEffect(() => {
    const on = () => {
      const r = routeFromHash();
      if (r.name !== cur.current.name) { cur.current = r; setRoute(r); }
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const cur = useRef<Route>(route);
  const show = useCallback((r: Route) => {
    cur.current = r;
    setRoute(r);
    const name = r.name === 'issue' ? 'behaviors' : r.name;
    try {
      if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    } catch { /* sandboxed */ }
    window.scrollTo({ top: 0 });
  }, []);
  const go = useCallback((r: Route) => {
    stack.current.push(cur.current);
    if (stack.current.length > 30) stack.current.shift();
    show(r);
  }, [show]);
  const back = useCallback(() => show(stack.current.pop() ?? { name: 'dashboard' }), [show]);
  return <NavContext.Provider value={{ route, go, back }}>{children}</NavContext.Provider>;
}

export const useNav = () => useContext(NavContext);

/* ---------------- Toasts & confirm dialogs ---------------- */

interface ConfirmOpts {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Require typing this word to enable the button. */
  typeToConfirm?: string;
}
interface UiCtx {
  toast: (msg: string, kind?: 'ok' | 'err') => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
}
const UiContext = createContext<UiCtx>({ toast: () => {}, confirm: async () => false });

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Array<{ id: number; msg: string; kind: 'ok' | 'err' }>>([]);
  const [dlg, setDlg] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');
  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => { setTyped(''); setDlg({ ...o, resolve }); }), []);
  const close = (v: boolean) => { dlg?.resolve(v); setDlg(null); };
  const blocked = !!dlg?.typeToConfirm && typed.trim() !== dlg.typeToConfirm;

  useEffect(() => {
    if (!dlg) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && close(false);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  return (
    <UiContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 safe-top" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`anim-up pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${t.kind === 'err' ? 'bg-red-600 text-white' : 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'}`}>
            {t.msg}
          </div>
        ))}
      </div>
      {dlg && (
        <div className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => close(false)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" className="anim-up card w-full max-w-sm p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 id="dlg-title" className="text-base font-semibold">{dlg.title}</h2>
            {dlg.body && <div className="mt-2 text-sm text-stone-600 dark:text-stone-400">{dlg.body}</div>}
            {dlg.typeToConfirm && (
              <div className="mt-3">
                <label className="label">Type <span className="font-mono">{dlg.typeToConfirm}</span> to confirm</label>
                <input className="input" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} />
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-xl px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800" onClick={() => close(false)}>Cancel</button>
              <button
                disabled={blocked}
                autoFocus={!dlg.typeToConfirm}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 ${dlg.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900'}`}
                onClick={() => close(true)}
              >
                {dlg.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </UiContext.Provider>
  );
}

export const useUi = () => useContext(UiContext);

/* ---------------- Theme ---------------- */

export type ThemePref = 'system' | 'light' | 'dark';

export function useTheme(): [ThemePref, (t: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(() => (storage.get('theme') as ThemePref) || 'system');
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0c0a09' : '#fafaf9');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);
  useEffect(() => {
    const on = () => setPref((storage.get('theme') as ThemePref) || 'system');
    window.addEventListener('pattern-theme', on);
    return () => window.removeEventListener('pattern-theme', on);
  }, []);
  return [pref, (t) => { storage.set('theme', t); setPref(t); window.dispatchEvent(new Event('pattern-theme')); }];
}
