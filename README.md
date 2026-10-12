# IIC Calendar 2026-27

IIC event tracker for Presidency College. Deployed on Netlify.

1. Netlify > Add new site > Import from Git > pick this repo. Keep the default settings.
2. Before the first deploy (or then redeploy): Site configuration > Environment variables > add `IIC_PASSWORD` with the faculty password.

Files: `public/index.html` is the website. `netlify/functions/api.mjs` checks the password and saves edits in Netlify Blobs. `netlify/functions/base.mjs` is the event list from the Excel file.
