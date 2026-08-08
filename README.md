# Matt's Deal Screener — Netlify version

This folder is the Netlify-ready version of Matt's Deal Screener.

## Deploy

1. Upload the contents of this folder to the root of the GitHub repository.
2. In Netlify, connect the repository or trigger a new deployment.
3. Netlify uses `npm run build` and publishes `.next` automatically from `netlify.toml`.

Outreach entries, workflow stages, and scoring weights are saved in the Netlify
Blobs store named `matts-deal-screener`. The 268 screened public-record
properties are included in `app/data/real-parcels.json`.

