import { useEffect, useLayoutEffect, useRef, type ButtonHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import type { Outcome, Priority, Status } from '../types';
import { OUTCOME_LABEL, PRIORITY_LABEL, STATUS_LABEL } from '../types';
import { describeRate, type OutcomeStats } from '../lib/stats';

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({
  variant = 'secondary', size = 'md', className = '', ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' }) {
  const v = {
    primary: 'bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white',
    secondary: 'border border-stone-200 bg-white text-stone-800 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800',
    ghost: 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800',
    danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:bg-stone-900 dark:text-red-400 dark:hover:bg-red-950/40',
  }[variant];
  const s = { sm: 'px-3 py-1.5 text-[13px]', md: 'px-4 py-2.5 text-sm', lg: 'px-5 py-3 text-[15px]' }[size];
  return (
    <button
      type="button"
      {...p}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-40 ${v} ${s} ${className}`}
    />
  );
}

export function TextArea({ minRows = 2, className = '', ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Grow to fit content. Only ever grow while editing: shrinking the box
    // first (the usual trick) makes the page and on-screen keyboard jump on
    // every keystroke, which on phones can lock up typing.
    const min = minRows * 24 + 20;
    if (!el.style.height) el.style.height = min + 'px';
    if (el.scrollHeight > el.clientHeight) el.style.height = el.scrollHeight + 2 + 'px';
  }, [p.value, minRows]);
  return <textarea ref={ref} rows={minRows} dir="auto" {...p} className={`input resize-none leading-6 ${className}`} />;
}

export function Field({ label, hint, children, htmlFor, optional }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string; optional?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label} {optional && <span className="font-normal text-stone-400">· optional</span>}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  observed: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  investigating: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  experimenting: 'bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
  monitoring: 'bg-violet-50 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300',
  resolved: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
};
const STATUS_DOT: Record<Status, string> = {
  observed: 'bg-stone-400', investigating: 'bg-amber-500', experimenting: 'bg-sky-500', monitoring: 'bg-violet-500', resolved: 'bg-emerald-500',
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityMark({ priority }: { priority: Priority }) {
  const bars = priority === 'high' ? 3 : priority === 'medium' ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400" title={`${PRIORITY_LABEL[priority]} priority`}>
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={`w-[3px] rounded-sm ${i <= bars ? (priority === 'high' ? 'bg-rose-500' : 'bg-stone-500 dark:bg-stone-400') : 'bg-stone-200 dark:bg-stone-700'}`} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

const OUTCOME_STYLE: Record<Outcome, string> = {
  successful: 'text-emerald-700 dark:text-emerald-400',
  partial: 'text-amber-700 dark:text-amber-400',
  unsuccessful: 'text-rose-700 dark:text-rose-400',
  not_applicable: 'text-stone-500',
  not_assessed: 'text-stone-400',
};
export const OUTCOME_COLOR: Record<'successful' | 'partial' | 'unsuccessful' | 'other', string> = {
  successful: '#059669', partial: '#d97706', unsuccessful: '#e11d48', other: '#a8a29e',
};

export function OutcomeTag({ outcome }: { outcome: Outcome }) {
  return <span className={`text-xs font-medium ${OUTCOME_STYLE[outcome]}`}>{OUTCOME_LABEL[outcome]}</span>;
}

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`card block w-full text-left ${onClick ? 'transition hover:border-stone-300 hover:shadow-sm dark:hover:border-stone-700' : ''} ${className}`}>
      {children}
    </Tag>
  );
}

export function Empty({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-400 dark:bg-stone-800">
        <Icon name="spark" />
      </div>
      <p className="font-medium">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, onBack }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; onBack?: () => void }) {
  return (
    <header className="mb-5 flex items-start gap-3">
      {onBack && (
        <button onClick={onBack} aria-label="Back" className="-ml-2 mt-0.5 rounded-lg p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800">
          <Icon name="back" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-semibold tracking-tight" dir="auto">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Success rate shown with its denominator; no % for tiny samples. */
export function RateDisplay({ s, compact }: { s: OutcomeStats; compact?: boolean }) {
  const pct = s.rate !== null && s.reliability !== 'insufficient' ? Math.round(s.rate * 100) : null;
  const w = (n: number) => (s.applicable ? (n / s.applicable) * 100 : 0);
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className={`${compact ? 'text-lg' : 'text-2xl'} font-semibold tabular-nums`}>{pct !== null ? `${pct}%` : '—'}</span>
        <span className="text-xs text-stone-500 dark:text-stone-400">
          {s.evaluated ? `${s.successful} of ${s.evaluated} evaluated` : 'no evaluated events'}
          {s.reliability === 'low' && ' · small sample'}
          {s.reliability === 'insufficient' && ' · too few for a rate'}
        </span>
      </div>
      {s.applicable > 0 && (
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800" aria-label={describeRate(s)}>
          <div style={{ width: `${w(s.successful)}%`, background: OUTCOME_COLOR.successful }} />
          <div style={{ width: `${w(s.partial)}%`, background: OUTCOME_COLOR.partial }} />
          <div style={{ width: `${w(s.unsuccessful)}%`, background: OUTCOME_COLOR.unsuccessful }} />
        </div>
      )}
      {!compact && s.applicable > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
          <Legend color={OUTCOME_COLOR.successful} label={`${s.successful} success`} />
          <Legend color={OUTCOME_COLOR.partial} label={`${s.partial} partial`} />
          <Legend color={OUTCOME_COLOR.unsuccessful} label={`${s.unsuccessful} unsuccessful`} />
          {s.notApplicable + s.notAssessed > 0 && <span>{s.notApplicable + s.notAssessed} excluded (n/a or not assessed)</span>}
        </div>
      )}
    </div>
  );
}

export function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-xl bg-stone-100 p-1 dark:bg-stone-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-lg font-medium transition ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]'} ${value === o.value ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-950 dark:text-stone-100' : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  // Keep the latest onClose in a ref so the effect below runs only when the
  // sheet opens or closes — not on every keystroke inside it.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', on);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', on); document.body.style.overflow = prevOverflow; };
  }, [open]);
  if (!open) return null;
  return (
    <div className="anim-fade fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => closeRef.current()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="anim-up flex max-h-[92vh] max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl dark:bg-stone-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3.5 dark:border-stone-800">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={() => closeRef.current()} aria-label="Close" className="-mr-2 rounded-lg p-2 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"><Icon name="x" /></button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-stone-100 px-5 py-3 safe-bottom dark:border-stone-800">{footer}</div>}
      </div>
    </div>
  );
}

const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  plus: 'M12 5v14M5 12h14',
  calendar: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  x: 'M6 6l12 12M18 6 6 18',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  archive: 'M3 5h18v4H3zM5 9v10h14V9M10 13h4',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  check: 'M5 12l5 5L20 7',
  filter: 'M4 5h16l-6 8v6l-4-2v-4L4 5Z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  flask: 'M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
};

export function Icon({ name, className = 'h-5 w-5' }: { name: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
