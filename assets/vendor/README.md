# Vendored libraries

Two third-party libraries, served from this origin instead of a CDN.

## Why they are here

`/live`, `/organizer`, `/scorekeeper`, `/checkin` and `/e` loaded
`@supabase/supabase-js` from `cdn.jsdelivr.net`. Three problems, all of them
worse than the disk space:

1. **The version floated.** The tag was `@supabase/supabase-js@2` — jsdelivr
   serves whatever the newest 2.x is at request time. On 2026-08-26 that was
   **2.112.4**. A breaking change in any later 2.x reaches live scoring with no
   deploy on our side and no way to roll back.
2. **A CDN outage takes down live scoring**, during an event, when the
   scoreboard is the whole point.
3. **The CSP never allowed the host.** The policy runs Report-Only, so nothing
   broke and nothing complained; flipping it to enforcing would have killed all
   five pages at once while every marketing page looked perfect. Found by
   `tools/checks/csp.mjs`, and now permanently guarded by
   `tools/gate-csp-hosts.mjs`.

## What is here

| file | package | version | sha256 |
|---|---|---|---|
| `supabase-js-2.112.4.umd.min.js` | `@supabase/supabase-js` | 2.112.4 | `9a8142ffedb319a3ac0d4a8a123c9c2f7ffdb0e1e86cd9553889911b647175f6` |
| `qrcode-generator-1.4.4.min.js` | `qrcode-generator` | 1.4.4 | `bb2365e4902f4f84852cf4025e6f6a60325a682aeafa43fb63b7fc8f098d1ef2` |

Both are byte-for-byte what jsdelivr served on 2026-08-26, unmodified.

## Updating

Filenames carry the version because `/assets/*` is cached immutable for a year.
Bumping means a new filename, not a new file at the same URL.

```sh
V=2.113.0
curl -sSL -o assets/vendor/supabase-js-$V.umd.min.js \
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@$V/dist/umd/supabase.min.js"
shasum -a 256 assets/vendor/supabase-js-$V.umd.min.js   # record it above
grep -rl 'supabase-js-2\.' *.html | xargs sed -i '' "s/supabase-js-[0-9.]*\.umd/supabase-js-$V.umd/g"
node tools/gate-csp-hosts.mjs && node tools/checks/csp.mjs
```

Then load `/live`, `/organizer`, `/scorekeeper`, `/checkin` and `/e` and confirm
each reaches its Supabase client before shipping. A version bump here is a
change to live scoring during events; treat it as one.
