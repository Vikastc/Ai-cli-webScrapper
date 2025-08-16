import * as cheerio from "cheerio";
import fs from "fs-extra";
import path from "path";
import pLimit from "p-limit";

type CrawlOptions = {
  outDir?: string;
  maxPages?: number; // safety cap set to 100 by default
  mirrorExternalAssets?: boolean; // download cross-origin assets
  concurrency?: number; // parallel downloads
};

export async function scrapeWebsite(startUrl: string, opts: CrawlOptions = {}) {
  const root = new URL(startUrl);
  const rootOrigin = root.origin;
  const outputDir = path.join(process.cwd(), opts.outDir ?? "cloned-site");
  const maxPages = opts.maxPages ?? 100;
  const mirrorExternalAssets = opts.mirrorExternalAssets ?? true;
  const concurrency = opts.concurrency ?? 10;

  const limit = pLimit(concurrency);

  // normalize paths for saving
  const toLocalAssetPath = (u: URL) => {
    let finalPath = u.pathname;

    // safe filename for query strings
    if (u.search) {
      const safeQuery = u.search.replace(/[?&=]/g, "_").slice(0, 100); // limit length
      finalPath = `${u.pathname}${safeQuery}`;
    }

    if (u.origin === rootOrigin) {
      return finalPath.replace(/^\/+/, "");
    }
    return `external/${u.hostname}${finalPath}`.replace(/^\/+/, "");
  };

  const urlToPageFilePath = (u: URL) => {
    let p = u.pathname;
    if (p.endsWith("/")) p += "index.html";
    else if (!path.extname(p)) p += "/index.html";
    return path.join(outputDir, p.replace(/^\/+/, ""));
  };

  const shouldSkipHref = (href: string) =>
    !href ||
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("javascript:");

  const visitedPages = new Set<string>();
  const pageQueue: string[] = [root.href];
  const assetSet = new Set<string>();

  await fs.emptyDir(outputDir);

  // ---- Crawl pages ----
  while (pageQueue.length && visitedPages.size < maxPages) {
    const current = pageQueue.shift()!;
    if (visitedPages.has(current)) continue;
    visitedPages.add(current);

    let res: Response;
    try {
      res = await fetch(current, { signal: AbortSignal.timeout(15000) });
    } catch (e) {
      console.warn(`❌ Failed to fetch page ${current}`, e);
      continue;
    }

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) {
      console.warn(`⚠️ Skipping non-HTML page ${current} (${ct})`);
      continue;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // ---- Handle Images (fix Next.js /_next/image etc) ----
    $("img").each((_, el) => {
      const $el = $(el);

      ["src", "data-src"].forEach((attr) => {
        const val = $el.attr(attr);
        if (!val) return;

        // Fix Next.js proxy
        if (val.includes("/_next/image") && val.includes("url=")) {
          try {
            const realUrl = decodeURIComponent(
              val.split("url=")[1].split("&")[0]
            );
            const abs = new URL(realUrl, current);
            const localPath = toLocalAssetPath(abs);
            $el.attr("src", localPath);
            assetSet.add(abs.href);
          } catch {
            console.warn(`⚠️ Failed to decode next/image: ${val}`);
          }
        } else if (!val.startsWith("data:")) {
          const abs = new URL(val, current);
          $el.attr("src", toLocalAssetPath(abs));
          assetSet.add(abs.href);
        }
      });

      // fix srcset
      const srcset = $el.attr("srcset");
      if (srcset) {
        const parts = srcset.split(",").map((entry) => {
          const [u, d] = entry.trim().split(/\s+/);
          if (!u) return entry;
          let fixedUrl = u;
          if (u.includes("/_next/image?url=")) {
            const m = u.match(/\/_next\/image\?url=([^&]+)/);
            if (m?.[1]) fixedUrl = decodeURIComponent(m[1]);
          }
          const abs = new URL(fixedUrl, current);
          assetSet.add(abs.href);
          return `${toLocalAssetPath(abs)}${d ? " " + d : ""}`;
        });
        $el.attr("srcset", parts.join(", "));
      }

      // cleanup
      $el.removeAttr("data-src data-nimg decoding loading");
    });

    // ---- CSS + JS ----
    $("link[href]").each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href")!;
      if (!href || href.startsWith("data:")) return;
      const abs = new URL(href, current);
      $el.attr("href", toLocalAssetPath(abs));
      assetSet.add(abs.href);
    });

    $("script[src]").each((_, el) => {
      const $el = $(el);
      const src = $el.attr("src")!;
      if (!src || src.startsWith("data:")) return;
      const abs = new URL(src, current);
      $el.attr("src", toLocalAssetPath(abs));
      assetSet.add(abs.href);
    });

    // ---- Internal links ----
    $("a[href]").each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href")!;
      if (shouldSkipHref(href)) return;

      const abs = new URL(href, current);

      if (abs.origin === rootOrigin) {
        abs.search = "";
        abs.hash = "";
        let pretty = abs.pathname;
        if (!path.extname(pretty) && !pretty.endsWith("/")) pretty += "/";
        $el.attr("href", pretty);
        if (!visitedPages.has(abs.href) && !pageQueue.includes(abs.href)) {
          pageQueue.push(abs.href);
        }
      }
    });

    // ---- Save rewritten HTML ----
    const filePath = urlToPageFilePath(new URL(current));
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, $.html(), "utf8");
    console.log(`✅ Saved page: ${filePath}`);
  }

  // ---- Download assets concurrently ----
  await Promise.all(
    [...assetSet].map((assetUrl) =>
      limit(async () => {
        try {
          const u = new URL(assetUrl);
          if (u.protocol !== "http:" && u.protocol !== "https:") return;
          if (u.origin !== rootOrigin && !mirrorExternalAssets) return;

          const res = await fetch(assetUrl, {
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());

          const localPath = toLocalAssetPath(u);
          const filePath = path.join(outputDir, localPath);
          await fs.ensureDir(path.dirname(filePath));
          await fs.writeFile(filePath, buf);
          console.log(`📥 Asset: ${filePath}`);
        } catch (err) {
          console.warn(`❌ Failed asset ${assetUrl}`, err);
        }
      })
    )
  );

  return {
    message: "✅ Website cloned successfully",
    path: outputDir,
    pages: visitedPages.size,
    assets: assetSet.size,
  };
}
