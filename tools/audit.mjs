import { writeFileSync } from "node:fs";

const out = process.argv[2] ?? "audit.json";
const url = process.argv[3] ?? "http://localhost:5173";

const MEASURE = `(() => {
const els=[...document.querySelectorAll('h1,h2,h3,h4,p,span,a,li,small,button,td,th,b,summary,figcaption,time,dt,dd')]
  .filter(e=>e.textContent.trim()&&e.offsetParent);
const leaf=[...document.querySelectorAll('body *')]
  .filter(e=>e.offsetParent&&e.textContent.trim()&&![...e.children].some(c=>c.textContent.trim()));
const boxes=leaf.map(e=>{const r=e.getBoundingClientRect();return{top:r.top+scrollY,bot:r.bottom+scrollY}})
  .sort((a,b)=>a.top-b.top);
let mb=-1,gaps=[];boxes.forEach(b=>{if(b.top-mb>120&&mb>0)gaps.push(Math.round(b.top-mb));mb=Math.max(mb,b.bot)});
const clickable=[...document.querySelectorAll('a,button,summary,[role="button"],[role="link"],[onclick]')]
  .filter(e=>e.offsetParent);
return JSON.stringify({
  viewport:innerWidth,
  overflowX:document.documentElement.scrollWidth-innerWidth,
  under14:els.filter(e=>parseFloat(getComputedStyle(e).fontSize)<14)
    .map(e=>e.tagName+':'+e.textContent.trim().slice(0,24)),
  smallTargets:clickable.filter(e=>{const r=e.getBoundingClientRect();
    return r.height<44||r.width<44}).map(e=>e.tagName+':'+Math.round(e.getBoundingClientRect().height)),
  deadAnchors:clickable.filter(e=>
    e.tagName==='A'&&!e.getAttribute('href')).map(e=>e.textContent.trim().slice(0,32)),
  sizes:[...new Set(els.map(e=>parseFloat(getComputedStyle(e).fontSize)))].sort((a,b)=>b-a),
  weights:[...new Set(els.map(e=>getComputedStyle(e).fontWeight))].sort(),
  surfaces:[...new Set([...document.querySelectorAll('*')]
    .map(e=>getComputedStyle(e).backgroundColor).filter(c=>c&&!c.includes('rgba(0, 0, 0, 0)')))].slice(0,24),
  gaps, maxGapPctVh:Math.round(Math.max(...gaps,0)/innerHeight*100),
  images:document.images.length,
  docH:document.body.scrollHeight
},null,1);})()`;

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
  const consoleMsgs = [];
  const exceptions = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method === "Runtime.consoleAPICalled" && (msg.params.type === "error" || msg.params.type === "warning")) {
      consoleMsgs.push({
        type: msg.params.type,
        text: (msg.params.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(" ").slice(0, 200),
      });
    }
    if (msg.method === "Runtime.exceptionThrown") {
      exceptions.push((msg.params.exceptionDetails?.exception?.description ?? "?").slice(0, 300));
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
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 4000));

  const report = { widths: {}, consoleMsgs, exceptions };
  for (const width of [390, 1440]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await new Promise((r) => setTimeout(r, 600));
    const res = await send("Runtime.evaluate", { expression: MEASURE, returnByValue: true });
    report.widths[width] = JSON.parse(res.result.result.value);
  }
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log("audit written:", out);
  console.log("exceptions:", exceptions.length, "console:", consoleMsgs.length);
  ws.close();
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
