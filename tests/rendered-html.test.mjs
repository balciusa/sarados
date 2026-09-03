import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(
    "test",
    String(process.pid) + "-" + String(Date.now()),
  );
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Lithuanian game home", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="lt">/i);
  assert.match(html, /<title>Šarados — lietuviškos šarados<\/title>/i);
  assert.match(html, /PRADĖTI ŽAIDIMĄ/);
  assert.match(html, /Žodis tavo/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("starter preview is removed and product metadata is present", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /CharadesGame/);
  assert.match(layout, /Šarados/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  await assert.rejects(
    access(new URL("../app/_sites-preview", import.meta.url)),
  );
});
