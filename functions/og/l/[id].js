// Dynamic Open Graph card for league links — /og/l/<league-id>
//
// Renders a 1200×630 PNG invitation card (Satori via workers-og): PickleCue
// mark + wordmark, LEAGUE INVITATION badge, "You're invited to join" + the
// league name, public metadata, and the approved league logo when one
// exists. Replaces the old generic homepage-screenshot og-image for league
// links.
//
// PRIVACY: only public snapshot fields are used (league name, game type,
// location, skill range, APPROVED logo). Private leagues resolve to the
// generic "League Invitation" card. The invite bearer token never reaches
// this route — the page links og:image WITHOUT the query string, and this
// function reads only the path id + a non-secret `v` cache-buster.

import { ImageResponse } from "workers-og";

const SUPABASE_URL = "https://uejmhtdfbqbotvbqvfja.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlam1odGRmYnFib3R2YnF2ZmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyMjYzMjAsImV4cCI6MjA4MjgwMjMyMH0.oSZlTczSfIe1Jls0DSG6br1pVLKZ1F6e_DOPgndPdOc";
const ORIGIN = "https://www.picklecue.com";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function fetchLeague(id) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/live_league_snapshot`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ p_league_id: id }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json && json.league) || null;
  } catch (_) {
    return null;
  }
}

// Google Fonts TTF fetch (old-UA trick returns truetype URLs), cached at the
// edge. Satori cannot consume the site's woff2 files.
async function loadFont(cf, family, weight) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`;
  const cacheKey = new Request(`${ORIGIN}/__font/${encodeURIComponent(family)}/${weight}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached.arrayBuffer();

  const css = await (await fetch(cssUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" },
  })).text();
  const match = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/);
  if (!match) throw new Error("font css parse failed");
  const fontRes = await fetch(match[1]);
  const buffer = await fontRes.arrayBuffer();
  cf.waitUntil(cache.put(cacheKey, new Response(buffer, {
    headers: { "Cache-Control": "public, max-age=604800" },
  })));
  return buffer;
}

function metadataLine(league) {
  if (!league) return "";
  const parts = [];
  if (league.game_type) {
    parts.push(league.game_type.charAt(0).toUpperCase() + league.game_type.slice(1));
  }
  const location = [league.location_city, league.location_state].filter(Boolean).join(", ");
  if (location) parts.push(location);
  if (league.skill_min != null && league.skill_max != null) {
    parts.push(`${league.skill_min}–${league.skill_max}`);
  }
  return parts.join(" · ");
}

/// Approved logo only, and never DiceBear placeholder art as the hero.
function heroLogoUrl(league) {
  const url = league && league.avatar_url;
  if (!url || typeof url !== "string") return null;
  if (!url.startsWith("https://")) return null;
  if (url.includes("dicebear.com")) return null;
  return url;
}

function cardHtml({ name, meta, logoUrl }) {
  const twoLine = name.length > 22;
  const nameSize = name.length > 40 ? 52 : (twoLine ? 60 : 76);
  const displayName = name.length > 58 ? `${name.slice(0, 57)}…` : name;

  return `
  <div style="display:flex; width:1200px; height:630px; background:#0B1622; color:#F4F1EA; font-family:'Instrument Sans'; position:relative;">
    <!-- subtle court geometry -->
    <div style="display:flex; position:absolute; right:-120px; top:90px; width:520px; height:450px; border:3px solid rgba(122,205,143,0.10); border-radius:24px;"></div>
    <div style="display:flex; position:absolute; right:140px; top:90px; width:3px; height:450px; background:rgba(122,205,143,0.10);"></div>
    <div style="display:flex; position:absolute; left:-160px; bottom:-200px; width:420px; height:420px; border-radius:9999px; border:80px solid rgba(46,125,50,0.08);"></div>

    <div style="display:flex; flex-direction:column; justify-content:space-between; padding:60px; width:${logoUrl ? 860 : 1200}px;">
      <div style="display:flex; flex-direction:column;">
        <div style="display:flex; align-items:center;">
          <img src="${ORIGIN}/images/app-icon-192.png" width="72" height="72" style="border-radius:18px;" />
          <div style="display:flex; font-size:40px; font-weight:700; margin-left:20px;">PickleCue</div>
        </div>
        <div style="display:flex; margin-top:34px;">
          <div style="display:flex; font-size:20px; font-weight:700; letter-spacing:4px; color:#7ACD8F; border:2px solid rgba(122,205,143,0.45); border-radius:9999px; padding:10px 22px;">LEAGUE INVITATION</div>
        </div>
      </div>

      <div style="display:flex; flex-direction:column;">
        <div style="display:flex; font-size:30px; color:#9BA0A6;">You’re invited to join</div>
        <div style="display:flex; font-size:${nameSize}px; font-weight:700; line-height:1.1; margin-top:10px; max-width:${logoUrl ? 760 : 1080}px;">${esc(displayName)}</div>
        ${meta ? `<div style="display:flex; font-size:26px; color:#9BA0A6; margin-top:16px;">${esc(meta)}</div>` : ""}
      </div>

      <div style="display:flex;">
        <div style="display:flex; align-items:center; background:#2E7D32; color:#FFFFFF; font-size:24px; font-weight:700; border-radius:9999px; padding:14px 30px;">Open in PickleCue →</div>
      </div>
    </div>

    ${logoUrl ? `
    <div style="display:flex; align-items:center; justify-content:center; position:absolute; right:60px; top:195px; width:240px; height:240px; background:rgba(244,241,234,0.06); border:2px solid rgba(244,241,234,0.12); border-radius:32px;">
      <img src="${esc(logoUrl)}" width="200" height="200" style="border-radius:24px;" />
    </div>` : `
    <div style="display:flex; align-items:center; justify-content:center; position:absolute; right:60px; top:195px; width:240px; height:240px;">
      <img src="${ORIGIN}/images/app-icon-192.png" width="192" height="192" style="border-radius:44px; opacity:0.35;" />
    </div>`}
  </div>`;
}

export async function onRequestGet(context) {
  const rawId = String(context.params.id || "").replace(/\.png$/i, "").toLowerCase();
  const league = UUID_RE.test(rawId) ? await fetchLeague(rawId) : null;

  // Private / deleted / unknown leagues get the privacy-safe generic card.
  const name = (league && league.name) ? String(league.name).slice(0, 80) : "League Invitation";
  const meta = league
    ? metadataLine(league)
    : "You’ve been invited to join a league on PickleCue.";
  const logoUrl = heroLogoUrl(league);

  try {
    const [regular, bold] = await Promise.all([
      loadFont(context, "Instrument Sans", 500),
      loadFont(context, "Instrument Sans", 700),
    ]);
    return new ImageResponse(cardHtml({ name, meta, logoUrl }), {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Instrument Sans", data: regular, weight: 500, style: "normal" },
        { name: "Instrument Sans", data: bold, weight: 700, style: "normal" },
      ],
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch (err) {
    // Generation failure: fall back to the static site image rather than a
    // broken preview. (Premium static fallback tracked as a follow-up.)
    return Response.redirect(`${ORIGIN}/images/og-image.png`, 302);
  }
}
