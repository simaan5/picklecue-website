// Short event codes — /e/ABC123
//
// WHY THIS EXISTS
//
// Short codes are meant to be spoken and texted ("scan, or go to
// picklecue.com/e/ABC123"). Until now /e/* had no route at all: it fell
// through to 404.html, which resolved the code in client-side JavaScript and
// then called location.replace(). A human in a browser ended up in the right
// place, so it looked like it worked — but the HTTP status was 404 on every
// single request.
//
// That breaks precisely the audience short codes exist for. Messages, Slack,
// Discord, WhatsApp and every crawler read the raw response without running
// JavaScript; a 404 means no unfurl, no preview card, and search engines treat
// a working event address as a dead link. Verified before this function:
//
//     curl -o /dev/null -w '%{http_code}' /e/V8HXDD   ->  404
//
// Now a valid code answers with a real 302 to the live page, which every one
// of those clients understands. Invalid codes still answer 404 — that is the
// honest status for a code that does not resolve — but with a human page
// instead of a redirect into nowhere.
//
// NO SECRETS HERE. resolve_short_code is SECURITY DEFINER and anon-executable
// by design (it is on the reviewed anon RPC list in CLAUDE.md section 9, and is
// throttled server-side). This function sends the code and nothing else. It
// never sees or forwards a session, and the redirect target is the same public
// live URL the client-side shim produced.

const SUPABASE_URL = "https://uejmhtdfbqbotvbqvfja.supabase.co";
// Public anon key — the same one already shipped in assets/live-core.js.
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlam1odGRmYnFib3R2YnF2ZmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyMjYzMjAsImV4cCI6MjA4MjgwMjMyMH0.oSZlTczSfIe1Jls0DSG6br1pVLKZ1F6e_DOPgndPdOc";
const ORIGIN = "https://www.picklecue.com";

// Codes are 6 chars from an unambiguous alphabet — no 0/1/I/O, matching the
// e.html shim's own filter so the two agree on what "well formed" means.
const CODE_RE = /^[A-Z2-9]{6}$/;
// Only these reach the redirect; anything else is dropped rather than
// concatenated into a URL.
const VIEWS = new Set(["results", "bracket", "courts", "standings", "next"]);

function esc(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function resolve(code) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/resolve_short_code`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ p_code: code }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const json = await res.json();
    // The RPC returns null for unknown AND malformed codes; both mean "no".
    return json && json.event_id ? json : null;
  } catch (_) {
    // Timeout or Supabase hiccup. Fall through to the not-found page rather
    // than redirecting somewhere wrong or leaking an error to the visitor.
    return null;
  }
}

function notFound(code) {
  const html = `<!DOCTYPE html>
<html lang="en" style="color-scheme: light dark;">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Event code not found · PickleCue</title>
    <meta name="robots" content="noindex,nofollow">
    <link rel="icon" type="image/png" sizes="32x32" href="${ORIGIN}/images/favicon-32.png">
    <link rel="apple-touch-icon" sizes="180x180" href="${ORIGIN}/images/apple-touch-icon.png">
    <meta name="theme-color" content="#F7F7F2" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#071A12" media="(prefers-color-scheme: dark)">
    <style>
        :root{ --paper:#F7F7F2; --ink:#0E1B14; --mute:#5F6F64; --court:#1F5D43; }
        @media (prefers-color-scheme: dark){
            :root{ --paper:#071A12; --ink:#EDF3EC; --mute:#8FA697; --court:#56D364; }
        }
        *{ margin:0; padding:0; box-sizing:border-box; }
        body{
            background:var(--paper); color:var(--ink);
            font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
            min-height:100vh; display:flex; align-items:center; justify-content:center;
            padding:24px; text-align:center;
        }
        .card{ max-width:440px; }
        img{ width:72px; height:72px; border-radius:18px; margin-bottom:22px; }
        h1{ font-size:1.55rem; letter-spacing:-.02em; margin-bottom:10px; }
        p{ color:var(--mute); line-height:1.55; margin-bottom:10px; }
        code{ font-family:ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--ink); }
        a{ color:var(--court); }
    </style>
</head>
<body>
    <main class="card">
        <img src="${ORIGIN}/images/app-icon-192.png" alt="PickleCue">
        <h1>That code didn’t match an event</h1>
        <p>${code ? `We couldn’t find <code>${esc(code)}</code>.` : "Event codes are six characters, like ABC123."}
           Double-check it with the organizer — codes stop working once an event is over.</p>
        <p><a href="${ORIGIN}/">Go to picklecue.com</a></p>
    </main>
</body>
</html>`;
  return new Response(html, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Never cache a miss: the same code becomes valid the moment an
      // organizer creates it.
      "Cache-Control": "no-store",
    },
  });
}

export async function onRequestGet({ params, request }) {
  const raw = String(params.code || "").toUpperCase().replace(/[^A-Z2-9]/g, "");
  if (!CODE_RE.test(raw)) return notFound(raw.slice(0, 12));

  const hit = await resolve(raw);
  if (!hit) return notFound(raw);

  const kind = hit.scope === "tournament" ? "t" : "l";
  const target = new URL(`${ORIGIN}/live.html`);
  target.searchParams.set(kind, hit.event_id);

  // Carry through the display modifiers the live page understands, from an
  // allowlist — so /e/ABC123?view=bracket and the TV/projector display mode
  // survive the redirect, and nothing else is echoed into a Location header.
  const incoming = new URL(request.url).searchParams;
  const view = incoming.get("view");
  if (view && VIEWS.has(view)) target.searchParams.set("view", view);
  if (incoming.get("display") === "1") target.searchParams.set("display", "1");

  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      // 302 + a short cache: the code→event mapping is stable for the life of
      // the event, but an organizer can delete an event, so don't let
      // intermediaries pin it for long.
      "Cache-Control": "public, max-age=300",
    },
  });
}
