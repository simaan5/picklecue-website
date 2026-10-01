# Testimonials, ratings, user counts or partner logos the data does not support

The website publishes no testimonial, star rating, user count, "trusted by" logo strip or review quote unless it exists in a system of record that a gate can check.

## Why this is out of scope

Every number on the site is traceable: court counts come from `data/claims.json`, which `tools/gate-claims.mjs` checks against every page; event facts come from `data/events.json`. The site once shipped three different court counts at the same time and advertised an early-bird price fifteen days after it ended, which is why the gates exist. Reviews and photos tables were empty at launch, so "courts with reviews" was removed from the App Store note. Invented social proof would be the same class of error and, for a consumer app, an FTC problem.

## What would reopen it

Real reviews (`court_reviews`, App Store reviews) or real partners, each with a source the gate can read.

## Prior requests

- (owner rule stated across the Aug–Sep 2026 website phases; no issue filed)
