import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("platform console link follows the verified SSO state", async () => {
  const [html, source] = await Promise.all([
    readFile("public/index.html", "utf8"),
    readFile("public/app.js", "utf8")
  ]);

  assert.match(html, /id="platformConsoleLink"[^>]*href="\/"[^>]*hidden/);
  assert.match(source, /platformConsoleLink"\)\.hidden = !state\.appAuth\?\.platformSso/);
});
