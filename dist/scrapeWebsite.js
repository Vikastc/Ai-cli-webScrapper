"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeWebsite = scrapeWebsite;
const cheerio = __importStar(require("cheerio"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const p_limit_1 = __importDefault(require("p-limit"));
function scrapeWebsite(startUrl_1) {
    return __awaiter(this, arguments, void 0, function* (startUrl, opts = {}) {
        var _a, _b, _c, _d;
        const root = new URL(startUrl);
        const rootOrigin = root.origin;
        const outputDir = path_1.default.join(process.cwd(), (_a = opts.outDir) !== null && _a !== void 0 ? _a : "output");
        const maxPages = (_b = opts.maxPages) !== null && _b !== void 0 ? _b : 100;
        const mirrorExternalAssets = (_c = opts.mirrorExternalAssets) !== null && _c !== void 0 ? _c : true;
        const concurrency = (_d = opts.concurrency) !== null && _d !== void 0 ? _d : 10;
        const limit = (0, p_limit_1.default)(concurrency);
        // always flatten into assets/
        const toLocalAssetPath = (u) => {
            const urlPath = u.pathname.split("/").filter(Boolean).join("_");
            const base = path_1.default.basename(urlPath || "asset");
            const hash = crypto_1.default
                .createHash("md5")
                .update(u.href)
                .digest("hex")
                .slice(0, 6);
            return `assets/${hash}-${base}`;
        };
        const urlToPageFilePath = (u) => {
            let p = u.pathname;
            if (p.endsWith("/"))
                p += "index.html";
            else if (!path_1.default.extname(p))
                p += "/index.html";
            return path_1.default.join(outputDir, p.replace(/^\/+/, ""));
        };
        const shouldSkipHref = (href) => !href ||
            href.startsWith("#") ||
            href.startsWith("mailto:") ||
            href.startsWith("tel:") ||
            href.startsWith("javascript:");
        const visitedPages = new Set();
        const pageQueue = [root.href];
        const assetSet = new Set();
        yield fs_extra_1.default.emptyDir(outputDir);
        while (pageQueue.length && visitedPages.size < maxPages) {
            const current = pageQueue.shift();
            if (visitedPages.has(current))
                continue;
            visitedPages.add(current);
            let res;
            try {
                res = yield fetch(current, { signal: AbortSignal.timeout(15000) });
            }
            catch (e) {
                console.warn(`❌ Failed to fetch page ${current}`, e);
                continue;
            }
            const ct = res.headers.get("content-type") || "";
            if (!ct.includes("text/html")) {
                console.warn(`⚠️ Skipping non-HTML page ${current} (${ct})`);
                continue;
            }
            const html = yield res.text();
            const $ = cheerio.load(html);
            // ---- Fix <img> ----
            $("img").each((_, el) => {
                const $el = $(el);
                ["src", "data-src"].forEach((attr) => {
                    const val = $el.attr(attr);
                    if (!val)
                        return;
                    if (val.includes("/_next/image") && val.includes("url=")) {
                        try {
                            const realUrl = decodeURIComponent(val.split("url=")[1].split("&")[0]);
                            const abs = new URL(realUrl, current);
                            const localPath = toLocalAssetPath(abs);
                            $el.attr("src", localPath);
                            assetSet.add(abs.href);
                        }
                        catch (_a) {
                            console.warn(`⚠️ Failed to decode next/image: ${val}`);
                        }
                    }
                    else if (!val.startsWith("data:")) {
                        const abs = new URL(val, current);
                        $el.attr("src", toLocalAssetPath(abs));
                        assetSet.add(abs.href);
                    }
                });
                const srcset = $el.attr("srcset");
                if (srcset) {
                    const parts = srcset.split(",").map((entry) => {
                        const [u, d] = entry.trim().split(/\s+/);
                        if (!u)
                            return entry;
                        let fixedUrl = u;
                        if (u.includes("/_next/image?url=")) {
                            const m = u.match(/\/_next\/image\?url=([^&]+)/);
                            if (m === null || m === void 0 ? void 0 : m[1])
                                fixedUrl = decodeURIComponent(m[1]);
                        }
                        const abs = new URL(fixedUrl, current);
                        assetSet.add(abs.href);
                        return `${toLocalAssetPath(abs)}${d ? " " + d : ""}`;
                    });
                    $el.attr("srcset", parts.join(", "));
                }
                $el.removeAttr("data-src data-nimg decoding loading");
            });
            // ---- CSS + JS ----
            $("link[href]").each((_, el) => {
                const $el = $(el);
                const href = $el.attr("href");
                if (!href || href.startsWith("data:"))
                    return;
                const abs = new URL(href, current);
                $el.attr("href", toLocalAssetPath(abs));
                assetSet.add(abs.href);
            });
            $("script[src]").each((_, el) => {
                const $el = $(el);
                const src = $el.attr("src");
                if (!src || src.startsWith("data:"))
                    return;
                const abs = new URL(src, current);
                $el.attr("src", toLocalAssetPath(abs));
                assetSet.add(abs.href);
            });
            // ---- Links ----
            $("a[href]").each((_, el) => {
                const $el = $(el);
                const href = $el.attr("href");
                if (shouldSkipHref(href))
                    return;
                const abs = new URL(href, current);
                if (abs.origin === rootOrigin) {
                    abs.search = "";
                    abs.hash = "";
                    let pretty = abs.pathname;
                    if (!path_1.default.extname(pretty) && !pretty.endsWith("/"))
                        pretty += "/";
                    $el.attr("href", pretty);
                    if (!visitedPages.has(abs.href) && !pageQueue.includes(abs.href)) {
                        pageQueue.push(abs.href);
                    }
                }
            });
            const filePath = urlToPageFilePath(new URL(current));
            yield fs_extra_1.default.ensureDir(path_1.default.dirname(filePath));
            yield fs_extra_1.default.writeFile(filePath, $.html(), "utf8");
            console.log(`✅ Saved page: ${filePath}`);
        }
        // ---- Download assets ----
        yield Promise.all([...assetSet].map((assetUrl) => limit(() => __awaiter(this, void 0, void 0, function* () {
            try {
                const u = new URL(assetUrl);
                if (u.protocol !== "http:" && u.protocol !== "https:")
                    return;
                if (u.origin !== rootOrigin && !mirrorExternalAssets)
                    return;
                const res = yield fetch(assetUrl, {
                    signal: AbortSignal.timeout(15000),
                });
                if (!res.ok)
                    throw new Error(`HTTP ${res.status}`);
                const buf = Buffer.from(yield res.arrayBuffer());
                const localPath = toLocalAssetPath(u);
                const filePath = path_1.default.join(outputDir, localPath);
                yield fs_extra_1.default.ensureDir(path_1.default.dirname(filePath));
                yield fs_extra_1.default.writeFile(filePath, buf);
                console.log(`📥 Asset: ${filePath}`);
            }
            catch (err) {
                console.warn(`❌ Failed asset ${assetUrl}`, err);
            }
        }))));
        return {
            message: "✅ Website cloned successfully",
            path: outputDir,
            pages: visitedPages.size,
            assets: assetSet.size,
        };
    });
}
