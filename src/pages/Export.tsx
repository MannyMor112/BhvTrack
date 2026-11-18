import { useMemo, useState } from 'react';
import { useData, useUi } from '../state';
import { buildReport, rangeFromPreset, reportFilename, toMarkdown, type Block, type RangePreset } from '../lib/report';
import { copyText, saveFile, SaveDeclined, shareContent } from '../lib/platform';
import { fmtISODate, DAY } from '../lib/util';
import { Button, Card, Empty, Icon, PageHeader, Segmented, StatusBadge } from '../components/ui';

export function Export() {
  const { issues, events, reviews } = useData();
  const { toast } = useUi();
  const [preset, setPreset] = useState<RangePreset>('30');
  const today = fmtISODate(Date.now());
  const [custom, setCustom] = useState({ from: fmtISODate(Date.now() - 29 * DAY), to: today });
  const [selected, setSelected] = useState<string[] | null>(null);
  const [includeEvents, setIncludeEvents] = useState(false);
  const [includeReflections, setIncludeReflections] = useState(false);
  const [includeUnlinked, setIncludeUnlinked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const defaultSel = issues.filter((i) => !i.archived && i.status !== 'resolved').map((i) => i.id);
  const sel = selected ?? defaultSel;
  const range = rangeFromPreset(preset, Date.now(), custom);
  const opts = { ...range, issueIds: sel, includeEvents, includeReflections, includeUnlinkedEvents: includeUnlinked };
  const blocks = useMemo(() => buildReport({ issues, events, reviews }, opts), [issues, events, reviews, JSON.stringify(opts)]); // eslint-disable-line react-hooks/exhaustive-deps
  const md = useMemo(() => toMarkdown(blocks), [blocks]);

  const toggle = (id: string) => setSelected(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);

  const run = async (kind: string, fn: () => Promise<void>) => {
    setBusy(kind);
    try { await fn(); }
    catch (e) { if (!(e instanceof SaveDeclined)) toast((e as Error).message || 'Export failed', 'err'); }
    finally { setBusy(null); }
  };

  const pdfBytes = async () => {
    const { renderPdf } = await import('../lib/pdf');
    return renderPdf(blocks);
  };

  const doPdf = () => run('pdf', async () => { await saveFile(reportFilename(opts, 'pdf'), await pdfBytes(), 'application/pdf'); toast('PDF ready'); });
  const doMd = () => run('md', async () => { await saveFile(reportFilename(opts, 'md'), md, 'text/markdown'); toast('Markdown ready'); });
  const doCopy = () => run('copy', async () => {
    const ok = await copyText(md);
    toast(ok ? 'Summary copied as Markdown' : 'Copy failed — select the preview text instead', ok ? 'ok' : 'err');
  });
  const doShare = () =>
    run('share', async () => {
      let file: File | undefined;
      try { file = new File([await pdfBytes()], reportFilename(opts, 'pdf'), { type: 'application/pdf' }); } catch { /* text share only */ }
      const r = await shareContent({ title: 'Behavioral Pattern Summary', text: md, file });
      if (r === 'shared' || r === 'cancelled') return;
      // Fallback: copy + offer download.
      const copied = await copyText(md);
      toast(copied ? 'Sharing isn\'t available here — summary copied instead' : 'Sharing isn\'t available here', copied ? 'ok' : 'err');
    });

  if (!issues.length) return (<><PageHeader title="Export summary" /><Empty title="Nothing to export yet" body="Add a behavior and log a few events first." /></>);

  return (
    <>
      <PageHeader title="Export summary" subtitle="A structured report for a therapist, coach, or AI assistant" />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card className="space-y-3 p-4">
            <h2 className="section-title">Date range</h2>
            <Segmented value={preset} onChange={setPreset} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'custom', label: 'Custom' }]} />
            {preset === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-stone-500">From<input type="date" className="input mt-1" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
                <label className="text-xs text-stone-500">To<input type="date" className="input mt-1" value={custom.to} min={custom.from} max={today} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">Behaviors</h2>
              <div className="flex gap-1 text-xs">
                <button className="rounded px-1.5 py-0.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" onClick={() => setSelected(issues.map((i) => i.id))}>All</button>
                <button className="rounded px-1.5 py-0.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" onClick={() => setSelected([])}>None</button>
              </div>
            </div>
            <ul className="space-y-1">
              {issues.map((i) => (
                <li key={i.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-stone-50 dark:hover:bg-stone-800/50">
                    <input type="checkbox" className="h-4 w-4 accent-stone-900 dark:accent-stone-100" checked={sel.includes(i.id)} onChange={() => toggle(i.id)} />
                    <span className="min-w-0 flex-1 truncate text-sm" dir="auto">{i.title}</span>
                    <StatusBadge status={i.status} />
                  </label>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="space-y-1 p-4">
            <h2 className="section-title mb-2">Include</h2>
            <Toggle checked={includeEvents} onChange={setIncludeEvents} label="Individual event details" hint="Situations, thoughts, reactions. Off by default — these are the most sensitive." />
            <Toggle checked={includeReflections} onChange={setIncludeReflections} label="Weekly review reflections" hint="Your free-text notes from weekly reviews." />
            <Toggle checked={includeUnlinked} onChange={setIncludeUnlinked} label="Events not linked to a behavior" />
          </Card>

          <Card className="space-y-2 p-4">
            <Button variant="primary" className="w-full" disabled={!!busy || !sel.length} onClick={doPdf}><Icon name="download" className="h-4 w-4" />{busy === 'pdf' ? 'Preparing…' : 'Export PDF'}</Button>
            <div className="grid grid-cols-3 gap-2">
              <Button size="sm" disabled={!!busy || !sel.length} onClick={doMd}>Markdown</Button>
              <Button size="sm" disabled={!!busy || !sel.length} onClick={doCopy}><Icon name="copy" className="h-4 w-4" />Copy</Button>
              <Button size="sm" disabled={!!busy || !sel.length} onClick={doShare}><Icon name="share" className="h-4 w-4" />Share</Button>
            </div>
            <p className="pt-1 text-xs text-stone-500 dark:text-stone-400">
              Nothing leaves your device until you download, copy or share. Markdown works well pasted into an AI assistant.
            </p>
          </Card>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="section-title">Preview — exactly what will be exported</h2>
            <button className="text-xs text-stone-500 hover:underline lg:hidden" onClick={() => setShowPreview(!showPreview)}>{showPreview ? 'Hide' : 'Show'}</button>
          </div>
          {showPreview && (
            <Card className="max-h-[80vh] overflow-auto p-5 sm:p-7">
              {sel.length ? <Preview blocks={blocks} /> : <p className="text-sm text-stone-500">Select at least one behavior.</p>}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-2">
      <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="absolute inset-0 rounded-full bg-stone-200 transition peer-checked:bg-stone-900 peer-focus-visible:ring-2 peer-focus-visible:ring-stone-400 dark:bg-stone-700 dark:peer-checked:bg-stone-100" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4 dark:peer-checked:bg-stone-900" />
      </span>
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-stone-500 dark:text-stone-400">{hint}</span>}
      </span>
    </label>
  );
}

function Preview({ blocks }: { blocks: Block[] }) {
  return (
    <article className="space-y-3 text-sm leading-relaxed">
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h1': return <h1 key={i} className="text-xl font-semibold">{b.text}</h1>;
          case 'h2': return <h2 key={i} className="border-b border-stone-200 pb-1 pt-3 text-base font-semibold dark:border-stone-700">{b.text}</h2>;
          case 'h3': return <h3 key={i} className="pt-2 font-semibold" dir="auto">{b.text}</h3>;
          case 'p': return <p key={i} dir="auto">{b.text}</p>;
          case 'note': return <p key={i} className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">{b.text}</p>;
          case 'kv': return (
            <div key={i}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{b.label}</p>
              <p className="whitespace-pre-wrap" dir="auto">{b.value}</p>
            </div>
          );
          case 'bullets': return <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((x, k) => <li key={k} dir="auto">{x}</li>)}</ul>;
          case 'table': return (
            <div key={i} className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead><tr>{b.head.map((h, k) => <th key={k} className="border-b border-stone-200 bg-stone-50 px-2 py-1.5 text-left font-semibold dark:border-stone-700 dark:bg-stone-800">{h}</th>)}</tr></thead>
                <tbody>{b.rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className="border-b border-stone-100 px-2 py-1.5 align-top dark:border-stone-800" dir="auto">{c}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
          case 'hr': return <hr key={i} />;
        }
      })}
    </article>
  );
}
