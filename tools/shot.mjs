import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const url = args[0] ?? "http://localhost:5173";
const out = args[1] ?? "shot.png";
const width = Number(args[2] ?? 1542);
const height = Number(args[3] ?? 790);
let pre = args[4] ?? "";
if (pre.startsWith("@")) {
  pre = readFileSync(pre.slice(1), "utf8");
}
const waitAfterPre = Number(args[5] ?? 1400);
const out2 = args[6] ?? "";
const waitBeforeSecond = Number(args[7] ?? 0);

async function cdp() {
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
  if (!page) throw new Error("no page target");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
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
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 3200));
  if (pre) {
    const res = await send("Runtime.evaluate", { expression: pre, awaitPromise: true, returnByValue: true });
    if (res.result && res.result.exceptionDetails) {
      console.error("eval error:", JSON.stringify(res.result.exceptionDetails).slice(0, 400));
    }
    await new Promise((r) => setTimeout(r, waitAfterPre));
  }
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  console.log("saved", out);
  if (out2) {
    await new Promise((r) => setTimeout(r, waitBeforeSecond));
    const shot2 = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(out2, Buffer.from(shot2.result.data, "base64"));
    console.log("saved", out2);
  }
  ws.close();
}

cdp().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
