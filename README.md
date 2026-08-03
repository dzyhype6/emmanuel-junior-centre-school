# Emmanuel Junior Centre School

Static website for Emmanuel Junior Centre School, a CBC (Competency-Based Curriculum) school in Nairobi, Kenya.

## Tech stack

Plain HTML/CSS/JS — no build step, no framework. Editable content (fees, contact
info, gallery, directors and school history) lives in small JSON files and is fetched client-side; the one
piece of "backend" is a small Cloudflare Worker that only handles GitHub OAuth
login for the admin panel — see [`SETUP.md`](SETUP.md).

## Project structure

```
index.html            # main site page — fetches and renders content/*.json
content/
  settings.json        # phone, WhatsApp, email, address, hours
  fees.json             # fee tables, uniform tables, transport charges
  gallery.json           # photo/video gallery items
  profile.json           # directors (leadership) + school history, milestones, mean scores
admin/
  index.html            # Decap CMS admin panel (visit /admin to edit content)
  config.yml             # Decap CMS collections + GitHub backend config
cms-oauth-proxy/        # Cloudflare Worker: GitHub OAuth login for /admin
uploads/                # images uploaded via the CMS land here
```

## Editing content

Non-technical staff can update fees, contact info, and the gallery at
`/admin` without touching code — see [`SETUP.md`](SETUP.md) for the one-time
setup and how to give the school admin their own login.

## Local development

Open `index.html` directly in a browser, or serve it locally:

```bash
npx serve .
```

## Deploy

This repo is set up for GitHub Pages:

1. Push changes to the `main` branch.
2. In the repo settings, under **Pages**, set the source to the `main` branch (root).
3. The site will be published at `https://<github-username>.github.io/emmanuel-junior-centre-school/`.

No build step is required since this is a static site.
