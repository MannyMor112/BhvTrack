import { useEffect, useState } from 'react';
import { Button, Card } from './ui';

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: PromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as PromptEvent; });
}

const standalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** Shows how to install the app; hidden when already installed or in the single-file build. */
export function InstallCard() {
  const [canPrompt, setCanPrompt] = useState(!!deferred);
  const [installed, setInstalled] = useState(standalone());
  useEffect(() => {
    const on = () => setCanPrompt(true);
    const done = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', on);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', on); window.removeEventListener('appinstalled', done); };
  }, []);
  if (__SINGLE_FILE__ || installed) return null;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-medium">Install on your phone</h2>
      {canPrompt ? (
        <Button variant="primary" onClick={async () => { await deferred?.prompt(); deferred = null; setCanPrompt(false); }}>Install app</Button>
      ) : ios ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">In Safari, tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</p>
      ) : (
        <p className="text-sm text-stone-500 dark:text-stone-400">In Chrome, open the <b>⋮</b> menu and tap <b>Install app</b> or <b>Add to Home screen</b>.</p>
      )}
      <p className="text-xs text-stone-400">Once installed it opens full-screen and works offline. Your data stays on this phone.</p>
    </Card>
  );
}
