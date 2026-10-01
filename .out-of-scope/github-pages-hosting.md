# Host (or mirror) the site on GitHub Pages

Cloudflare Pages is the only host of picklecue.com and www.picklecue.com. GitHub stores source and runs CI; it must not serve the site.

## Why this is out of scope

On 2026-08-10 GitHub Pages was found still enabled on the repo, building a shadow copy of the site with a stuck certificate. It was disabled and the `CNAME` file removed. Two hosts for one domain means two caches, two redirect behaviours and a certificate that can break universal links. Deploys go push → GitHub Action → `wrangler pages deploy dist` (an allowlisted staging folder since 2026-09-28).

## What would reopen it

Nothing foreseeable. If GitHub Pages reappears (a settings misclick re-enables it), disable it again; do not "fix" its certificate.

## Prior requests

- (owner decision 2026-08-10; no issue filed)
