# PickleCue brand assets — originals, unaltered

These four files are the **source of truth**, supplied by the owner and
committed byte-for-byte. Do not recolour, redraw, or re-export them.

| File | Size | MD5 |
|---|---|---|
| `picklecue-wordmark.png` | 1670×345 | `96fae317e763795ada93bd8f3b26d6ac` |
| `picklecue-mark.png` | 1088×1088 | `fe1b8e5f2a896c943c8eb589cb0a4c39` |
| `picklecue-browser-icon.png` | 1254×1254 | `31a449c2a382230c7baa7efa762eace3` |
| `picklecue-email-icon.png` | 1254×1254 | `8094e9fb6b30ad2a11b42b84b8f80177` |

Brand inks: `#184530` (deep green), `#B3E73D` (citron), `#005128` (mark body).

## Which shipping assets derive from these

Verified by pixel comparison on 2026-08-22 (mean RGB delta over ink):

| Shipping file | Derived from | Delta | Status |
|---|---|---|---|
| `images/email/cuemark.png` | `picklecue-mark.png` | 0.7/255 | faithful downscale |
| `images/wordmark-on-light.png` | `picklecue-wordmark.png` | 2.2/255 | faithful downscale |
| `images/wordmark-on-dark.png` | `picklecue-wordmark.png` | **128/255** | **recoloured** — "Pickle" knocked out to white |

## Why a dark variant exists

Both originals are drawn for light backgrounds. Measured against the site's
dark surfaces they are unreadable:

| Element | On dark | On light |
|---|---|---|
| wordmark "Pickle" `#184530` | **1.69:1** | 10.11:1 |
| mark body `#005128` | **1.89:1** | 8.85:1 |
| wordmark "Cue" `#B3E73D` | 12.57:1 | — |

`wordmark-on-dark.png` is the knockout variant that makes the lockup legible
on the dark footer. Replacing it with the unaltered original would drop
"Pickle" to 1.69:1. Any change here is an owner decision, not a cleanup task.

## Note on the C

The mark's C is a paddle silhouette with five holes. The wordmark's C is a
plain letterform with a diagonal notch and **no holes** — that is how the
original wordmark is drawn, not something the website introduced. The two
cannot be reconciled by editing the website; it would take a redrawn wordmark.
