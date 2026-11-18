import { useEffect, useRef, useState } from 'react';
import { useData, useTheme, useUi, type ThemePref } from '../state';
import { buildBackup, restoreBackup, wipeAll } from '../db/repo';
import { validateBackup } from '../lib/validate';
import { isPersisted, requestPersistence, saveFile, SaveDeclined } from '../lib/platform';
import { fmtISODate } from '../lib/util';
import { Button, Card, Icon, PageHeader, Segmented } from '../components/ui';
import { seedDemo } from '../lib/demo';
import { InstallCard } from '../components/InstallCard';

export function DataPage() {
  const { issues, events, reviews } = useData();
  const { toast, confirm } = useUi();
  const [theme, setTheme] = useTheme();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { isPersisted().then(setPersisted); }, []);

  const backup = async () => {
    try {
      const b = await buildBackup();
      await saveFile(`pattern-backup_${fmtISODate(Date.now())}.json`, JSON.stringify(b, null, 2), 'application/json');
      toast('Backup ready');
    } catch (e) {
      if (!(e instanceof SaveDeclined)) toast((e as Error).message || 'Backup failed', 'err');
    }
  };

  const onFile = async (file: File) => {
    let text: string;
    try { text = await file.text(); } catch { return toast('Could not read file', 'err'); }
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return toast('That file is not valid JSON', 'err'); }
    const rep = validateBackup(parsed);
    if (!rep.ok) return toast(rep.error ?? 'Invalid backup', 'err');
    const ok = await confirm({
      title: 'Restore this backup?',
      body: (
        <div className="space-y-2">
          <p>It contains <b>{rep.counts.issues}</b> behaviors, <b>{rep.counts.events}</b> events and <b>{rep.counts.reviews}</b> weekly reviews{rep.data?.exportedAt ? ` (exported ${new Date(rep.data.exportedAt).toLocaleString()})` : ''}.</p>
          {rep.warnings.length > 0 && <ul className="list-disc pl-5 text-amber-700 dark:text-amber-400">{rep.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
          <p className="font-medium text-red-600">All current data on this device ({issues.length} behaviors, {events.length} events) will be replaced.</p>
        </div>
      ),
      confirmLabel: 'Replace and restore',
      danger: true,
    });
    if (!ok) return;
    const res = await restoreBackup(text);
    toast(res.ok ? 'Backup restored' : res.error, res.ok ? 'ok' : 'err');
  };

  const wipe = async () => {
    const ok = await confirm({
      title: 'Delete all data?',
      body: `This permanently removes ${issues.length} behaviors, ${events.length} events and ${reviews.length} reviews from this browser. Download a backup first if you might want them.`,
      confirmLabel: 'Delete everything',
      danger: true,
      typeToConfirm: 'DELETE',
    });
    if (!ok) return;
    await wipeAll();
    toast('All data deleted');
  };

  const persist = async () => {
    const r = await requestPersistence();
    setPersisted(r);
    toast(r ? 'Storage marked as persistent' : 'The browser declined — keep regular backups', r ? 'ok' : 'err');
  };

  const demo = async () => {
    if (issues.length || events.length) {
      if (!(await confirm({ title: 'Add sample data?', body: 'Two example behaviors with a few weeks of events will be added alongside your data. You can delete them afterwards.', confirmLabel: 'Add samples' }))) return;
    }
    await seedDemo();
    toast('Sample data added');
  };

  return (
    <>
      <PageHeader title="Data & privacy" subtitle="Everything stays in this browser" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <InstallCard />
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2"><Icon name="lock" className="h-4 w-4 text-stone-500" /><h2 className="font-medium">Where your data lives</h2></div>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-stone-600 dark:text-stone-300">
              <li>Stored only in this browser's IndexedDB on this device. No account, no server, no analytics.</li>
              <li>Nothing is transmitted unless you export, copy or share it yourself.</li>
              <li><b>It can be lost</b> if you clear site data, use private browsing, uninstall the browser, or the browser evicts storage when the disk is full.</li>
              <li>Data does not sync between devices or browsers. Use backups to move it.</li>
            </ul>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2.5 text-sm dark:bg-stone-800/60">
              <span>Persistent storage: <b>{persisted === null ? 'unknown' : persisted ? 'on' : 'off'}</b></span>
              {!persisted && <Button size="sm" onClick={persist}>Request</Button>}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-1 font-medium">Appearance</h2>
            <Segmented<ThemePref> value={theme} onChange={setTheme} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="space-y-3 p-4">
            <h2 className="font-medium">Backup & restore</h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">A full JSON copy of every behavior, intervention, event and review. Keep it somewhere safe — it contains everything you've written.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={backup}><Icon name="download" className="h-4 w-4" />Download backup</Button>
              <Button onClick={() => fileRef.current?.click()}>Restore from file…</Button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
            </div>
            <p className="text-xs text-stone-400">Restoring validates the file first and shows what it contains before replacing anything.</p>
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="font-medium">Try it out</h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">Add sample behaviors and events to explore the dashboard and exports.</p>
            <Button onClick={demo}>Add sample data</Button>
          </Card>

          <Card className="space-y-3 border-red-200 p-4 dark:border-red-900/50">
            <h2 className="font-medium text-red-700 dark:text-red-400">Delete all data</h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">Permanently erase everything stored by this app in this browser.</p>
            <Button variant="danger" onClick={wipe}><Icon name="trash" className="h-4 w-4" />Delete all data…</Button>
          </Card>

          <p className="px-1 text-xs text-stone-400">Counts: {issues.length} behaviors · {events.length} events · {reviews.length} reviews</p>
        </div>
      </div>
    </>
  );
}
