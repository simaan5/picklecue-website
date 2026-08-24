// Country of the requesting visitor, for the "not in the US yet" prompt.
//
// Cloudflare already knows this from the edge that served the request, so no
// third-party geo-IP service is involved and no IP address is sent anywhere.
// We return the two-letter country and nothing else — no IP, no city, no
// coordinates, nothing stored. The client uses it once to decide whether to
// offer the international notify form.
//
// Deliberately fails OPEN: if the country is unknown, the response says so and
// the client shows nothing. A visitor who cannot be placed should never be
// nagged with a popup, and a US visitor must never see it.

export async function onRequestGet({ request }) {
  const country =
    (request.cf && request.cf.country) ||
    request.headers.get("CF-IPCountry") ||
    null;

  return new Response(
    JSON.stringify({ country: country && country !== "XX" ? country : null }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // Per-visitor answer: never let a shared cache hand one country's
        // result to another country's visitor.
        "Cache-Control": "private, no-store",
      },
    },
  );
}
