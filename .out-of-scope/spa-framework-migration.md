# Rewrite the website in React / Next.js / a SPA framework

www.picklecue.com stays static HTML, CSS and vanilla JavaScript on Cloudflare Pages.

## Why this is out of scope

The static architecture is the performance and reliability advantage: no build step, no hydration, Lighthouse-clean pages, 4,000+ generated court pages served from the edge, and gates (`tools/gate-*.mjs`) that can read the shipped HTML directly. The owner has repeated this constraint across every website phase since August 2026. Interactive surfaces that need a runtime (live scores, the organizer console, the scorekeeper, check-in) already work with vendored scripts and anonymous RPCs, and a Pages Function covers the few server-side needs (event short codes, OG images, geo).

## What would reopen it

A feature that demonstrably cannot be built as a static page plus a Function, with the cost of the migration (gates, SEO pages, CSP, caching) priced against it.

## Prior requests

- (recorded from the owner's standing rule; no issue filed)
