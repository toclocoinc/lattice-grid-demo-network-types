/**
 * A minimal Chrome DevTools Protocol client over Node 22's built-in
 * WebSocket: launch headless Chrome, open a page, send real mouse and key
 * events. No dependencies.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export async function launch({ width = 1440, height = 900, dark = false } = {}) {
  const exe = CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error('No Chrome found; set CHROME_PATH');
  const dir = await mkdtemp(join(tmpdir(), 'lg-chrome-'));
  const proc = spawn(exe, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`,
    '--no-first-run', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not start')), 20000);
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    proc.on('exit', () => reject(new Error('Chrome exited early')));
  });
  const port = new URL(wsUrl).port;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method) listeners.forEach((fn) => fn(msg));
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id; pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  const logs = [];
  listeners.push((m) => {
    if (m.method === 'Runtime.exceptionThrown') logs.push(`exception: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(m.params.type)) logs.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') logs.push(`log: ${m.params.entry.text} ${m.params.entry.url || ''}`);
  });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });

  const api = {
    logs, send,
    async viewport(w, h, mobile = false) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    },
    async goto(url) {
      await send('Page.navigate', { url });
      await api.waitFor(() => document.readyState === 'complete', 15000);
    },
    async eval(fn, ...args) {
      const expr = `(${fn.toString()})(...${JSON.stringify(args)})`;
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(fn, timeout = 10000, ...args) {
      const end = Date.now() + timeout;
      for (;;) {
        let ok = false;
        try { ok = await api.eval(fn, ...args); } catch { /* page still loading */ }
        if (ok) return ok;
        if (Date.now() > end) throw new Error(`Timed out waiting for ${fn}`);
        await new Promise((r) => setTimeout(r, 100));
      }
    },
    /** Viewport centre of the first element matching the selector. */
    async centre(selector) {
      const c = await api.eval((s) => {
        const el = document.querySelector(s);
        if (!el) return null;
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, selector);
      if (!c) throw new Error(`No element for ${selector}`);
      return c;
    },
    async click(selector, clickCount = 1) {
      const { x, y } = await api.centre(selector);
      await api.clickAt(x, y, clickCount);
    },
    async clickAt(x, y, clickCount = 1) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      for (let n = 1; n <= clickCount; n += 1) {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: n });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: n });
      }
    },
    async type(text) {
      for (const ch of text) await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch, unmodifiedText: ch }) && await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    },
    async key(key, code = key, vk = 0) {
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
    },
    async selectAll() {
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 4 /* ctrl */, commands: ['selectAll'] });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 4 });
    },
    async screenshot(path) {
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      const { writeFile } = await import('node:fs/promises');
      await writeFile(path, Buffer.from(data, 'base64'));
    },
    async close() {
      try { ws.close(); } catch { /* already closed */ }
      proc.kill('SIGKILL');
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    },
  };
  return api;
}
