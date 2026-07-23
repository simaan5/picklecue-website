// Raw-HTML preview verification for /l/<league-id> (no JavaScript executed —
// exactly what Apple Messages sees). Run: node tests/verify-league-preview.mjs [league-id]
//
// Asserts: HTTP 200, apple-touch-icon, favicon, og:title, absolute HTTPS
// og:image, token-free og:url — and that a token passed in the query string
// never appears anywhere in the returned HTML.

const leagueId = process.argv[2] || "053c7938-9ca9-4bfe-b72a-a17387907571";
const FAKE_TOKEN = "TEST-TOKEN-MUST-NEVER-RENDER";
const url = `https://www.picklecue.com/l/${leagueId}?mode=invite&token=${FAKE_TOKEN}`;

const res = await fetch(url, { redirect: "follow" });
const html = await res.text();

const checks = [
  ["HTTP 200", res.status === 200],
  ["Content-Type html", (res.headers.get("content-type") || "").includes("text/html")],
  ["apple-touch-icon present", /rel="apple-touch-icon"[^>]*href="https:\/\/www\.picklecue\.com\//.test(html)],
  ["favicon present", /rel="icon"[^>]*href="https:\/\/www\.picklecue\.com\//.test(html)],
  ["og:title present", /property="og:title" content="[^"]+"/.test(html)],
  ["og:image absolute https", /property="og:image" content="https:\/\/www\.picklecue\.com\/[^"]+"/.test(html)],
  ["og:url has no token/mode", (() => {
    const m = html.match(/property="og:url" content="([^"]+)"/);
    return !!m && !m[1].includes("token") && !m[1].includes("mode=");
  })()],
  ["og:image is the dedicated card route", /property="og:image" content="https:\/\/www\.picklecue\.com\/og\/l\//.test(html)],
  ["og:image URL has no token", (() => {
    const m = html.match(/property="og:image" content="([^"]+)"/);
    return !!m && !m[1].includes("token");
  })()],
  ["token never rendered", !html.includes(FAKE_TOKEN)],
];

// The card itself: HTTP 200 PNG.
{
  const m = html.match(/property="og:image" content="([^"]+)"/);
  if (m) {
    const img = await fetch(m[1].replace(/&amp;/g, "&"));
    checks.push(["og image HTTP 200", img.status === 200]);
    checks.push(["og image is png", (img.headers.get("content-type") || "").includes("image/png")]);
  }
}

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
process.exit(failed === 0 ? 0 : 1);
