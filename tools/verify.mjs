import { writeFileSync } from "node:fs";

const out = process.argv[2] ?? "verify-report.json";
const url = process.argv[3] ?? "http://localhost:5199";

const report = { steps: [], consoleErrors: [], exceptions: [] };
const check = (name, ok, detail = "") => {
  report.steps.push({ name, ok, detail: String(detail).slice(0, 300) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + String(detail).slice(0, 220) : ""}`);
};

async function main() {
  let list = [];
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9222/json/list");
      const data = await res.json();
      if (Array.isArray(data) && data.some((t) => t.type === "page")) {
        list = data;
        break;
      }
    } catch {
      void 0;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method === "Runtime.consoleAPICalled" && (msg.params.type === "error" || msg.params.type === "warning")) {
      report.consoleErrors.push((msg.params.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(" ").slice(0, 200));
    }
    if (msg.method === "Runtime.exceptionThrown") {
      report.exceptions.push((msg.params.exceptionDetails?.exception?.description ?? "?").slice(0, 300));
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  await new Promise((r) => {
    ws.onopen = r;
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  const evalJs = async (expression) => {
    const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (res.result?.exceptionDetails) {
      return { error: JSON.stringify(res.result.exceptionDetails).slice(0, 300) };
    }
    return { value: res.result?.result?.value };
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // stage 0: clean reset. Block app writes so the outgoing page's pagehide flush
  // cannot overwrite the reset payload.
  await send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 2200));
  await evalJs(`(() => {
    const data = JSON.parse(localStorage.getItem('vellum:v1') ?? '{}');
    const seed = { threads: [], settings: { ...(data.settings ?? {}), userName: 'Iyad' }, layout: data.layout, panel: data.panel, activeThreadId: null };
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v) {
      if (k === 'vellum:v1') return undefined;
      return orig.call(this, k, v);
    };
    orig.call(localStorage, 'vellum:v1', JSON.stringify(seed));
    return true;
  })()`);
  await send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 2500));
  report.consoleErrors.length = 0;
  report.exceptions.length = 0;

  const fresh = await evalJs(`(() => ({ msgs: document.querySelectorAll('.thread-msg-user, .thread-msg-assistant').length, greet: !!document.querySelector('.greet-title') }))()`);
  check("clean start (greeting, no threads)", fresh.value?.msgs === 0 && fresh.value?.greet === true, JSON.stringify(fresh.value));

  const sendMessage = async (text) => {
    await evalJs(`(() => {
      const ta = document.querySelector('.composer-input');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${JSON.stringify(text)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 250));
    await evalJs(`(() => { document.querySelector('.composer-primary:not([disabled])')?.click(); return true; })()`);
  };
  const waitIdle = async (timeoutMs) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await evalJs(`(() => ({ running: !!document.querySelector('.composer-primary[aria-label="Stop run"]') }))()`);
      if (res.value && !res.value.running) return true;
      await new Promise((r) => setTimeout(r, 350));
    }
    return false;
  };

  // 1. three exchanges
  for (const [i, text] of ["add a greeting banner to the home page", "fix the flaky checkout test", "create a pricing page"].entries()) {
    await sendMessage(text);
    const done = await waitIdle(45000);
    check(`run ${i + 1} completed`, done);
  }
  const counts = await evalJs(`(() => ({ msgs: document.querySelectorAll('.thread-msg-user, .thread-msg-assistant').length }))()`);
  check("three exchanges in thread", counts.value?.msgs === 6, `msgs=${counts.value?.msgs}`);

  // 2. immediate reload — nothing may be lost
  await send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 2500));
  const persisted = await evalJs(`(() => ({
    msgs: document.querySelectorAll('.thread-msg-user, .thread-msg-assistant').length,
    queued: document.querySelectorAll('.composer-queue-chip').length,
    titles: [...document.querySelectorAll('.sidebar-row-label')].map(e => e.textContent),
    days: [...document.querySelectorAll('.thread-day')].map(e => e.textContent),
  }))()`);
  check("all exchanges survive immediate reload", persisted.value?.msgs === 6, `msgs=${persisted.value?.msgs} titles=${JSON.stringify(persisted.value?.titles)}`);
  check("no stuck queue after reload", (persisted.value?.queued ?? 1) === 0);
  check("no spurious day dividers", (persisted.value?.days ?? []).length === 0, JSON.stringify(persisted.value?.days));

  // 3. day surgery with write-blocked navigation
  const surgery = await evalJs(`(() => {
    const orig = Storage.prototype.setItem;
    const data = JSON.parse(localStorage.getItem('vellum:v1'));
    const t = data.threads.find(x => x.id === data.activeThreadId) ?? data.threads[0];
    if (!t || t.messages.length < 4) return { error: 'thread too short', len: t?.messages.length };
    t.messages[0].createdAt = Date.now() - 2 * 86400000;
    t.messages[1].createdAt = Date.now() - 2 * 86400000;
    Storage.prototype.setItem = function(k, v) {
      if (k === 'vellum:v1') return undefined;
      return orig.call(this, k, v);
    };
    orig.call(localStorage, 'vellum:v1', JSON.stringify(data));
    return { aged: true, len: t.messages.length };
  })()`);
  check("surgery applied to active thread", surgery.value?.aged === true, JSON.stringify(surgery).slice(0, 120));
  await send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 2500));
  const divider = await evalJs(`(() => ({
    days: [...document.querySelectorAll('.thread-day')].map(e => e.textContent),
    msgs: document.querySelectorAll('.thread-msg-user, .thread-msg-assistant').length,
  }))()`);
  check("day divider on day boundary", divider.value?.days?.length === 1 && divider.value?.days?.[0] === "Today", JSON.stringify(divider.value));

  // 4. jump-to-latest
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 500, deviceScaleFactor: 1, mobile: false });
  await new Promise((r) => setTimeout(r, 600));
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 250, deltaX: 0, deltaY: -800 });
  await new Promise((r) => setTimeout(r, 700));
  const postWheel = await evalJs(`(() => ({ jump: !!document.querySelector('.thread-jump'), top: document.querySelector('.thread-scroll').scrollTop }))()`);
  check("jump button appears after wheel-up", postWheel.value?.jump === true, JSON.stringify(postWheel.value));
  const jumpRect = await evalJs(`(() => { const b = document.querySelector('.thread-jump')?.getBoundingClientRect(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; })()`);
  if (jumpRect.value) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: Math.round(jumpRect.value.x), y: Math.round(jumpRect.value.y), button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: Math.round(jumpRect.value.x), y: Math.round(jumpRect.value.y), button: "left", clickCount: 1 });
  }
  await new Promise((r) => setTimeout(r, 1500));
  const postJump = await evalJs(`(() => { const sc = document.querySelector('.thread-scroll'); return { atBottom: sc.scrollHeight - sc.scrollTop - sc.clientHeight < 40, jump: !!document.querySelector('.thread-jump') }; })()`);
  check("jump click scrolls to bottom and hides", postJump.value?.atBottom === true && postJump.value?.jump === false, JSON.stringify(postJump.value));

  // 5. quota toast (deterministic idle path)
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await new Promise((r) => setTimeout(r, 400));
  await evalJs(`(() => {
    window.__origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v) {
      if (k === 'vellum:v1') throw new DOMException('quota exceeded', 'QuotaExceededError');
      return window.__origSetItem.call(this, k, v);
    };
    return true;
  })()`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", modifiers: 2, key: "b", code: "KeyB", windowsVirtualKeyCode: 66 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", modifiers: 2, key: "b", code: "KeyB", windowsVirtualKeyCode: 66 });
  let toastText = "";
  for (let i = 0; i < 8; i++) {
    const t = await evalJs(`[...document.querySelectorAll('.shell-toast')].map(e => e.textContent).join(' | ')`);
    toastText = t.value ?? "";
    if (/storage is full/i.test(toastText)) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  check("quota failure surfaces a toast, no crash", /storage is full/i.test(toastText), toastText.slice(0, 140));
  const alive = await evalJs(`(() => ({ msgs: document.querySelectorAll('.thread-msg-user, .thread-msg-assistant').length, composer: !!document.querySelector('.composer-input'), sidebarOpen: !!document.querySelector('.shell-sidebar-slot') }))()`);
  check("app still interactive after quota failure", (alive.value?.msgs ?? 0) === 6 && alive.value?.composer === true, JSON.stringify(alive.value));

  // 6. widths
  report.widths = {};
  for (const width of [390, 768, 1024, 1440]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await new Promise((r) => setTimeout(r, 700));
    const res = await evalJs(`(() => JSON.stringify({
      viewport:innerWidth,
      overflowX:document.documentElement.scrollWidth-innerWidth,
      under14: [...document.querySelectorAll('h1,h2,h3,h4,p,span,a,li,small,button,td,th,b,summary,figcaption,time,dt,dd')]
        .filter(e=>e.textContent.trim()&&e.offsetParent&&parseFloat(getComputedStyle(e).fontSize)<14)
        .map(e=>e.tagName+':'+e.textContent.trim().slice(0,16)).slice(0,10),
      docH: document.body.scrollHeight
    }))()`);
    report.widths[width] = JSON.parse(res.value);
    check(`no overflowX at ${width}`, report.widths[width].overflowX === 0, `under14=${report.widths[width].under14.length}`);
  }

  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log("report written:", out);
  const failed = report.steps.filter((s) => !s.ok).length;
  console.log(`steps: ${report.steps.length - failed}/${report.steps.length} passed; consoleErrors=${report.consoleErrors.length}; exceptions=${report.exceptions.length}`);
  if (report.consoleErrors.length) console.log("console:", JSON.stringify(report.consoleErrors, null, 1));
  ws.close();
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
