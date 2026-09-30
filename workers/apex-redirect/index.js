/**
 * picklecue.com (apex) -> www.picklecue.com, permanently.
 *
 * Cloudflare Pages ignores host-based rules in _redirects, so the
 * `https://picklecue.com/* https://www.picklecue.com/:splat 301` line never
 * ran: the apex served every page itself, creating a duplicate copy of the
 * site under a second host. This Worker is bound to the route
 * `picklecue.com/*` only (www is untouched and never reaches it).
 *
 * /.well-known/* passes through unchanged. iOS fetches
 * apple-app-site-association from the exact host and will NOT follow a
 * redirect; redirecting it would break universal links for apex URLs.
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname !== 'picklecue.com' || url.pathname.startsWith('/.well-known/')) {
      return fetch(request);
    }
    url.hostname = 'www.picklecue.com';
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  },
};
