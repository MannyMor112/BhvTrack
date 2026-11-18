/*
 * Browser-integration helpers that degrade gracefully: inside a sandboxed
 * frame (e.g. a hosted artifact) downloads, sharing and some clipboard calls
 * are blocked, so each helper tries the best available path.
 */

type DownloadsApi = { save(req: { filename: string; data: Blob | string | ArrayBuffer }): Promise<unknown> };
type ClaudeHost = { use(name: string): Promise<unknown> };

let hostDownloads: Promise<DownloadsApi | null> | null = null;

/** Start resolving the host download capability early (it can take a moment). */
export function initHost() {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (host?.use && !hostDownloads) {
    hostDownloads = host.use('downloads').then((x) => (x as DownloadsApi) ?? null).catch(() => null);
  }
}

export class SaveDeclined extends Error {}

export async function saveFile(filename: string, data: Blob | string | ArrayBuffer, mime: string): Promise<void> {
  initHost();
  const dl = hostDownloads ? await hostDownloads : null;
  if (dl) {
    try {
      await dl.save({ filename, data: data instanceof ArrayBuffer ? data.slice(0) : data });
      return;
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'declined') throw new SaveDeclined('Download cancelled.');
      if (code && code !== 'unavailable' && code !== 'not_granted') throw new Error((e as Error).message || 'Download failed.');
      // fall through to a regular download
    }
  }
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Native share sheet; returns 'shared' | 'cancelled' | 'unsupported'. */
export async function shareContent(opts: { title: string; text: string; file?: File }): Promise<'shared' | 'cancelled' | 'unsupported'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share !== 'function') return 'unsupported';
  try {
    if (opts.file && nav.canShare?.({ files: [opts.file] })) {
      await nav.share({ title: opts.title, files: [opts.file] });
    } else {
      await nav.share({ title: opts.title, text: opts.text });
    }
    return 'shared';
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}

export const storage = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, v: string) {
    try { localStorage.setItem(key, v); } catch { /* ignore */ }
  },
};

export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function isPersisted(): Promise<boolean | null> {
  try {
    return navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  } catch {
    return null;
  }
}
