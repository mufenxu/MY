import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";

const gzipAsync = promisify(gzip);
const brotliCompressAsync = promisify(brotliCompress);
const COMPRESS_THRESHOLD_BYTES = 1_024;
const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
});

function isCompressible(contentType) {
  return /^(text\/|application\/(?:javascript|json)|image\/svg\+xml)/.test(contentType);
}

function isMissingAsset(error) {
  return ["EISDIR", "ENOENT", "ENOTDIR"].includes(error?.code);
}

function encodingQuality(headerValue, encoding) {
  let wildcard = 0;
  for (const item of String(headerValue || "").toLowerCase().split(",")) {
    const [name, ...parameters] = item.trim().split(";");
    let quality = 1;
    for (const parameter of parameters) {
      const match = /^q\s*=\s*(0(?:\.\d+)?|1(?:\.0+)?)$/.exec(parameter.trim());
      if (match) quality = Number(match[1]);
    }
    if (name === encoding) return quality;
    if (name === "*") wildcard = quality;
  }
  return wildcard;
}

async function buildAsset(filePath) {
  const body = await readFile(filePath);
  const contentType = MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
  let gzipBody = null;
  let brotliBody = null;
  if (isCompressible(contentType) && body.length > COMPRESS_THRESHOLD_BYTES) {
    [gzipBody, brotliBody] = await Promise.all([
      gzipAsync(body, { level: 9 }),
      brotliCompressAsync(body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 9 } })
    ]);
  }
  return {
    body,
    brotli: brotliBody,
    contentType,
    etag: `W/"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`,
    gzip: gzipBody
  };
}

export function createStaticAssetHandler({
  publicDir,
  production = false,
  securityHeaders,
  getRequestId = () => "",
  json
}) {
  const publicRoot = resolve(publicDir);
  const cache = new Map();

  async function loadAsset(filePath) {
    const cached = cache.get(filePath);
    if (production && cached) return cached.promise;

    const metadata = await stat(filePath);
    const signature = `${metadata.size}:${metadata.mtimeMs}`;
    if (cached?.signature === signature) return cached.promise;

    const promise = buildAsset(filePath);
    const entry = { promise, signature };
    cache.set(filePath, entry);
    try {
      return await promise;
    } catch (error) {
      if (cache.get(filePath) === entry) cache.delete(filePath);
      throw error;
    }
  }

  function sendAsset(req, res, url, asset) {
    const acceptsEncoding = req.headers["accept-encoding"];
    const brQuality = encodingQuality(acceptsEncoding, "br");
    const gzipQuality = encodingQuality(acceptsEncoding, "gzip");
    let body = asset.body;
    let contentEncoding = "";
    if (asset.brotli && brQuality > 0 && brQuality >= gzipQuality) {
      body = asset.brotli;
      contentEncoding = "br";
    } else if (asset.gzip && gzipQuality > 0) {
      body = asset.gzip;
      contentEncoding = "gzip";
    }

    const cacheControl = url.searchParams.has("v")
      ? "public, max-age=31536000, immutable"
      : (asset.contentType.startsWith("text/html") ? "no-cache" : "public, max-age=3600");
    const headers = {
      ...securityHeaders(),
      "x-request-id": getRequestId(),
      "content-type": asset.contentType,
      "cache-control": cacheControl,
      etag: asset.etag,
      vary: "Accept-Encoding"
    };
    if (contentEncoding) headers["content-encoding"] = contentEncoding;
    if (req.headers["if-none-match"] === asset.etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    headers["content-length"] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : body);
  }

  return async function serveStatic(req, res, url) {
    if (!["GET", "HEAD"].includes(req.method || "GET")) {
      json(res, 405, { ok: false, error: "Method not allowed" }, { allow: "GET, HEAD" });
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      json(res, 400, { ok: false, error: "Bad request" });
      return;
    }
    if (pathname === "/") pathname = "/index.html";
    const filePath = resolve(publicRoot, pathname.replace(/^[/\\]+/, ""));
    const relativePath = relative(publicRoot, filePath);
    if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
      json(res, 403, { ok: false, error: "Forbidden" });
      return;
    }

    try {
      sendAsset(req, res, url, await loadAsset(filePath));
    } catch (error) {
      if (!isMissingAsset(error)) throw error;
      if (extname(pathname)) {
        json(res, 404, { ok: false, error: "Not found" });
        return;
      }
      sendAsset(req, res, url, await loadAsset(join(publicRoot, "index.html")));
    }
  };
}
