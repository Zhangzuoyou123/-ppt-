const fs = require("fs");
const path = require("path");

function arg(name, fallback = "") {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : fallback;
}

const courseUrl = arg("url");
const outRoot = path.resolve(arg("out", "chaoxing_courseware"));
const port = arg("port", "9222");
if (!courseUrl) {
  console.error("Usage: node crawl_chaoxing_courseware.js --url <course-url> [--out chaoxing_courseware] [--port 9222]");
  process.exit(2);
}

const skipRe = /测验|测试|考试|作业|拓展|扩展|资源|阅读|quiz|test|exam|homework|extension|resource|reading/i;
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0";

function safeName(text) {
  return text.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\s+/g, "_").slice(0, 120);
}

async function getPageWs() {
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = pages.find((p) => p.type === "page" && p.url.includes("chaoxing.com")) || pages.find((p) => p.type === "page");
  if (!page) throw new Error(`No debuggable Edge page found on port ${port}`);
  return page.webSocketDebuggerUrl;
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 1;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve({
      close: () => ws.close(),
      send(method, params = {}) {
        const msgId = id++;
        ws.send(JSON.stringify({ id: msgId, method, params }));
        return new Promise((done) => pending.set(msgId, done));
      }
    }));
    ws.addEventListener("error", reject);
  });
}

async function getCookies() {
  const client = await connect(await getPageWs());
  const result = await client.send("Network.getAllCookies");
  client.close();
  return result.result.cookies
    .filter((c) => /chaoxing|cldisk|xuexi|pan-yz/.test(c.domain))
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

function parseQuery(url) {
  const u = new URL(url);
  return {
    courseId: u.searchParams.get("courseId") || u.searchParams.get("courseid"),
    clazzid: u.searchParams.get("clazzid"),
    cpi: u.searchParams.get("cpi") || "0",
    chapterId: u.searchParams.get("chapterId") || ""
  };
}

async function fetchBytes(url, cookie, referer = "https://mooc1.chaoxing.com/") {
  const res = await fetch(url, { redirect: "follow", headers: { Cookie: cookie, "User-Agent": userAgent, Referer: referer } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchText(url, cookie, referer) {
  const bytes = await fetchBytes(url, cookie, referer);
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (utf8.includes("�")) {
    try { return new TextDecoder("gb18030").decode(bytes); } catch {}
  }
  return utf8;
}

function parseCourseList(html) {
  const sections = [];
  const re = /id="cur(\d+)">[\s\S]*?<span class="posCatalog_name" title="([^"]*)"[^>]*onclick="getTeacherAjax\('[^']*','[^']*','(\d+)'\);"><em class="posCatalog_sbar">([^<]+)<\/em>\s*([^<]*)<\/span>/g;
  for (const m of html.matchAll(re)) {
    const title = (m[2] || m[5] || "").replace(/\s+/g, " ").trim();
    const label = `${m[4].trim()} ${title}`.trim();
    sections.push({ id: m[1], number: m[4].trim(), title, label, skip: skipRe.test(label) });
  }
  return sections;
}

function objectIdsFromHtml(html) {
  const ids = new Set();
  for (const m of html.matchAll(/objectid=([a-f0-9]{32})/gi)) ids.add(m[1]);
  for (const m of html.matchAll(/["']objectid["']\s*[:=]\s*["']([a-f0-9]{32})["']/gi)) ids.add(m[1]);
  for (const m of html.matchAll(/\b([a-f0-9]{32})\b/gi)) ids.add(m[1]);
  return Array.from(ids);
}

function thumbsFromHtml(html) {
  return Array.from(new Set(Array.from(html.matchAll(/https?:\/\/s3\.cldisk\.com\/[^"'<> \r\n\t]+\/thumb\/\d+\.png/g)).map((m) => m[0])))
    .sort((a, b) => Number((a.match(/\/thumb\/(\d+)\.png/) || [])[1] || 0) - Number((b.match(/\/thumb\/(\d+)\.png/) || [])[1] || 0));
}

async function findThumbsForSection(section, params, cookie) {
  const urls = [
    `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${params.clazzid}&courseid=${params.courseId}&knowledgeid=${section.id}&num=0&ut=s&cpi=${params.cpi}&v=2025-0424-1038-3&mooc2=1&isMicroCourse=false&editorPreview=0`,
    `https://mooc1.chaoxing.com/mooc-ans/mycourse/studentstudyAjax?courseId=${params.courseId}&clazzid=${params.clazzid}&chapterId=${section.id}&cpi=${params.cpi}&verificationcode=&mooc2=1&toComputer=false&microTopicId=0&editorPreview=0&isPreviewVideo=false&videoWidth=0&videoHeight=0&targetVideoJobId=&cardIndex=0`
  ];
  const objectIds = new Set();
  for (const url of urls) {
    try {
      const html = await fetchText(url, cookie, courseUrl);
      for (const id of objectIdsFromHtml(html)) objectIds.add(id);
      const directThumbs = thumbsFromHtml(html);
      if (directThumbs.length) return { objectId: "", thumbs: directThumbs };
    } catch {}
  }
  for (const objectId of objectIds) {
    try {
      const html = await fetchText(`https://mooc1.chaoxing.com/mooc-ans/screen/file?objectid=${objectId}`, cookie, courseUrl);
      const thumbs = thumbsFromHtml(html);
      if (thumbs.length) return { objectId, thumbs };
    } catch {}
  }
  return null;
}

async function main() {
  fs.mkdirSync(outRoot, { recursive: true });
  const cookie = await getCookies();
  if (!cookie) throw new Error("No Chaoxing cookies found. Log in with the debug Edge window first.");

  const params = parseQuery(courseUrl);
  const listUrl = `https://mooc1.chaoxing.com/mooc-ans/mycourse/studentstudycourselist?courseId=${params.courseId}&chapterId=${params.chapterId}&clazzid=${params.clazzid}&cpi=${params.cpi}&mooc2=1&searchChapterListByName=`;
  const listHtml = await fetchText(listUrl, cookie, courseUrl);
  const courseSections = parseCourseList(listHtml);
  const manifest = { sourceUrl: courseUrl, sections: [], skipped: [] };

  for (const section of courseSections) {
    if (section.skip) {
      manifest.skipped.push({ ...section, reason: "skip keyword" });
      continue;
    }
    const found = await findThumbsForSection(section, params, cookie);
    if (!found) {
      manifest.skipped.push({ ...section, reason: "no ppt/document thumbs" });
      continue;
    }
    const dir = path.join(outRoot, "images", safeName(`${section.number}_${section.title}_${section.id}`));
    fs.mkdirSync(dir, { recursive: true });
    const images = [];
    for (const thumb of found.thumbs) {
      const page = Number((thumb.match(/\/thumb\/(\d+)\.png/) || [])[1] || images.length + 1);
      const file = path.join(dir, `${String(page).padStart(3, "0")}.png`);
      const bytes = await fetchBytes(thumb, cookie, "https://pan-yz.chaoxing.com/");
      fs.writeFileSync(file, bytes);
      images.push({ page, path: file, url: thumb, bytes: bytes.length });
    }
    manifest.sections.push({ id: section.id, number: section.number, title: section.title, label: section.label, objectId: found.objectId, images });
    console.log(`downloaded ${section.label}: ${images.length} pages`);
  }

  fs.writeFileSync(path.join(outRoot, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`manifest=${path.join(outRoot, "manifest.json")}`);
  console.log(`sections=${manifest.sections.length} pages=${manifest.sections.reduce((n, s) => n + s.images.length, 0)} skipped=${manifest.skipped.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
