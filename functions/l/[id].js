// Server-rendered league link page — /l/<league-id>
//
// Apple Messages, Mail, Discord, and every other link scraper read the RAW
// initial HTML (no JavaScript). Before this function existed, /l/* fell
// through to 404.html (HTTP 404, no Open Graph tags, relative icon paths
// that break on nested routes) — Messages showed Safari's gray compass.
//
// This returns HTTP 200 HTML with absolute site icons + Open Graph metadata
// (league name resolved via the anon-safe live_league_snapshot RPC), plus a
// small human landing for recipients without the app.
//
// TOKEN SAFETY: the invite bearer token rides the query string. It is NEVER
// read, rendered, logged, or used in any URL emitted by this function —
// og:url is the clean canonical league URL. The app hand-off appends the
// query string CLIENT-side (script reads location.search), so the token
// stays on-device. Cache-Control is keyed by Cloudflare on the full URL,
// but the response body is token-independent.

const SUPABASE_URL = "https://uejmhtdfbqbotvbqvfja.supabase.co";
// Public anon key (same one shipped in assets/live-core.js).
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlam1odGRmYnFib3R2YnF2ZmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyMjYzMjAsImV4cCI6MjA4MjgwMjMyMH0.oSZlTczSfIe1Jls0DSG6br1pVLKZ1F6e_DOPgndPdOc";
const ORIGIN = "https://www.picklecue.com";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function fetchLeagueName(id) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/live_league_snapshot`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ p_league_id: id }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const name = json && json.league && json.league.name;
    return name ? String(name).slice(0, 80) : null;
  } catch (_) {
    // Snapshot unavailable (private league, deleted league, timeout) —
    // fall back to the generic invitation copy. Never fail the page.
    return null;
  }
}

export async function onRequestGet({ params }) {
  const rawId = String(params.id || "").toLowerCase();
  const validId = UUID_RE.test(rawId);
  const leagueName = validId ? await fetchLeagueName(rawId) : null;

  const title = leagueName || "League Invitation";
  const description = leagueName
    ? `You’ve been invited to join ${leagueName} on PickleCue.`
    : "You’ve been invited to join a league on PickleCue.";
  const canonical = validId ? `${ORIGIN}/l/${rawId}` : `${ORIGIN}/`;

  const html = `<!DOCTYPE html>
<html lang="en" style="color-scheme: light dark;">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <title>${esc(title)} · PickleCue</title>
    <meta name="robots" content="noindex,follow">

    <link rel="icon" type="image/png" sizes="32x32" href="${ORIGIN}/images/favicon-32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="${ORIGIN}/images/favicon-16.png">
    <link rel="icon" type="image/png" sizes="192x192" href="${ORIGIN}/images/app-icon-192.png">
    <link rel="apple-touch-icon" sizes="180x180" href="${ORIGIN}/images/apple-touch-icon.png">

    <meta property="og:site_name" content="PickleCue">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${esc(canonical)}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:image" content="${ORIGIN}/images/og-image.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${esc(title)} on PickleCue">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(description)}">
    <meta name="twitter:image" content="${ORIGIN}/images/og-image.png">

    <meta name="theme-color" content="#F4F1EA" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#0F1214" media="(prefers-color-scheme: dark)">
    <style>
        :root { --paper:#F4F1EA; --ink:#0C0F12; --mute:#6E7278; --green:#2E7D32; }
        @media (prefers-color-scheme: dark) {
            :root { --paper:#0F1214; --ink:#F4F1EA; --mute:#9BA0A6; }
        }
        * { margin:0; padding:0; box-sizing:border-box; }
        body {
            background:var(--paper); color:var(--ink);
            font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            min-height:100vh; display:flex; align-items:center; justify-content:center;
            padding:24px; text-align:center;
        }
        .card { max-width:420px; }
        .mark { width:96px; height:96px; border-radius:22px; margin-bottom:20px; }
        h1 { font-size:1.6rem; margin-bottom:8px; }
        p { color:var(--mute); line-height:1.5; margin-bottom:24px; }
        .btn {
            display:inline-block; background:var(--green); color:#fff;
            padding:14px 28px; border-radius:999px; text-decoration:none;
            font-weight:700; font-size:1rem;
        }
        .hint { font-size:0.85rem; margin-top:20px; }
    </style>
</head>
<body>
    <main class="card">
        <img class="mark" src="${ORIGIN}/images/app-icon-192.png" alt="PickleCue">
        <h1>${esc(leagueName ? "You’re invited" : "League Invitation")}</h1>
        <p>${esc(description)}</p>
        <a class="btn" id="open-app" href="picklecue://league/${esc(validId ? rawId : "")}">Open in PickleCue</a>
        <p class="hint">Don’t have PickleCue yet? Ask the organizer for a beta invitation — then tap your invite link again.</p>
    </main>
    <script>
        // App hand-off keeps the query string (invite token) CLIENT-side —
        // it never reaches the server-rendered markup above.
        (function () {
            var a = document.getElementById("open-app");
            if (a && location.search) { a.href += location.search; }
        })();
    </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
