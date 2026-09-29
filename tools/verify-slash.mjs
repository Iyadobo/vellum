import { writeFileSync } from "node:fs";

const out = process.argv[2] ?? "verify-slash.json";
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
    if (res.result?.exceptionDetails) return { error: JSON.stringify(res.result.exceptionDetails).slice(0, 300) };
    return { value: res.result?.result?.value };
  };
  const type = async (text) => {
    await evalJs(`(() => {
      const ta = document.querySelector('.composer-input');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${JSON.stringify(text)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 250));
  };
  const key = async (k, extra = {}) =>
    await send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: k,
      code: k.length === 1 ? `Key${k.toUpperCase()}` : k,
      windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : { ArrowDown: 40, ArrowUp: 38, Enter: 13, Escape: 27, Tab: 9 }[k] ?? 0,
      ...extra,
    }).then(() =>
      send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: k,
        code: k.length === 1 ? `Key${k.toUpperCase()}` : k,
        windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : { ArrowDown: 40, ArrowUp: 38, Enter: 13, Escape: 27, Tab: 9 }[k] ?? 0,
        ...extra,
      }),
    );
  const snapshot = async () =>
    await evalJs(`(() => ({
      panel: !!document.querySelector('.slash-panel'),
      rows: [...document.querySelectorAll('.slash-row')].map(r => r.textContent),
      selected: document.querySelector('.slash-row[data-selected="true"]')?.textContent ?? null,
      empty: document.querySelector('.slash-empty')?.textContent ?? null,
      value: document.querySelector('.composer-input')?.value ?? null,
      theme: document.documentElement.dataset.theme,
      threads: document.querySelectorAll('.sidebar-row-label').length,
      msgs: document.querySelectorAll('.thread-msg-user, .thread-msg-assistant').length,
      toast: [...document.querySelectorAll('.shell-toast')].map(t => t.textContent).join('|'),
    }))()`);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 2800));
  report.consoleErrors.length = 0;
  report.exceptions.length = 0;

  // 1. "/" opens the buffer instantly with the full list
  const t0 = Date.now();
  await type("/");
  let snap = await snapshot();
  const openMs = Date.now() - t0;
  check("slash buffer opens on /", snap.value?.panel === true, `rows=${snap.value?.rows?.length} in ${openMs}ms`);
  check("full command list buffered (no loading)", (snap.value?.rows?.length ?? 0) >= 20, `rows=${snap.value?.rows?.length}`);

  // 2. filter narrows
  await type("/new");
  snap = await snapshot();
  check("filter narrows to matching commands", (snap.value?.rows?.length ?? 0) <= 3 && (snap.value?.rows?.[0] ?? "").includes("New chat"), JSON.stringify(snap.value?.rows));

  // 3. arrow keys move selection, Enter executes
  await key("ArrowDown");
  snap = await snapshot();
  const movedOk = snap.value?.selected !== null;
  await key("ArrowUp");
  await key("Enter");
  await new Promise((r) => setTimeout(r, 500));
  snap = await snapshot();
  check("Enter executes selected command (new chat draft)", snap.value?.value === "" && snap.value?.panel !== true, `value="${snap.value?.value}" panel=${snap.value?.panel}`);

  // 4. theme command changes theme live
  await type("/light");
  snap = await snapshot();
  check("theme command matched", (snap.value?.rows?.length ?? 0) === 1 && (snap.value?.rows?.[0] ?? "").includes("Light"), JSON.stringify(snap.value?.rows));
  await key("Enter");
  await new Promise((r) => setTimeout(r, 400));
  snap = await snapshot();
  check("theme command executes live", snap.value?.theme === "light", `theme=${snap.value?.theme}`);
  await evalJs(`(() => { const data = JSON.parse(localStorage.getItem('vellum:v1')); data.settings.theme = 'bw'; localStorage.setItem('vellum:v1', JSON.stringify(data)); return true; })()`);

  // 5. Escape dismisses; deleting the slash re-arms it
  await type("/");
  await key("Escape");
  snap = await snapshot();
  check("Escape dismisses buffer", snap.value?.panel !== true && snap.value?.value === "/", `panel=${snap.value?.panel} value="${snap.value?.value}"`);
  await type("x");
  await type("");
  await type("/");
  snap = await snapshot();
  check("slash re-arms after full deletion", snap.value?.panel === true, `panel=${snap.value?.panel}`);
  await type("");

  // 6. Tab completes
  await type("/new");
  await key("Tab");
  snap = await snapshot();
  check("Tab completes to command id", snap.value?.value === "/new-chat", `value="${snap.value?.value}"`);

  // 7. unknown slash + Enter sends as a message
  await type("/zzz");
  snap = await snapshot();
  check("no-match hint shown", /No matching command/.test(snap.value?.empty ?? ""), snap.value?.empty);
  await key("Enter");
  await new Promise((r) => setTimeout(r, 4000));
  snap = await snapshot();
  check("unknown slash sends as message", (snap.value?.msgs ?? 0) >= 2 && snap.value?.value === "", `msgs=${snap.value?.msgs} value="${snap.value?.value}"`);

  // 8. plain text still sends normally (wait for the previous run to go idle first)
  for (let i = 0; i < 90; i++) {
    const res = await evalJs(`!!document.querySelector('.composer-primary[aria-label="Stop run"]')`);
    if (res.value === false) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  await type("hello there");
  await key("Enter");
  await new Promise((r) => setTimeout(r, 3000));
  snap = await snapshot();
  check("plain text send still works", (snap.value?.msgs ?? 0) >= 4 && snap.value?.value === "", `msgs=${snap.value?.msgs}`);

  // 9. widths with the buffer open
  report.widths = {};
  await type("/");
  for (const width of [390, 1440]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await new Promise((r) => setTimeout(r, 600));
    const res = await evalJs(`(() => JSON.stringify({ overflowX: document.documentElement.scrollWidth - innerWidth, panelVisible: !!document.querySelector('.slash-panel'), panelRect: (() => { const r = document.querySelector('.slash-panel')?.getBoundingClientRect(); return r ? { l: Math.round(r.left), r: Math.round(r.right), w: innerWidth } : null; })() }))()`);
    report.widths[width] = JSON.parse(res.value);
    const w = report.widths[width];
    check(`no overflowX at ${width} with buffer open`, w.overflowX === 0 && w.panelVisible && w.panelRect.l >= 0 && w.panelRect.r <= w.panelRect.w, JSON.stringify(w));
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
