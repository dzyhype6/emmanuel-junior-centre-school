# Admin CMS Setup

The school website content (phone/WhatsApp/email/hours, fees & uniform prices,
and the photo/video gallery) is editable at **`/admin`** using [Decap CMS](https://decapcms.org/),
without touching HTML or redeploying code. Content lives in `content/settings.json`,
`content/fees.json`, and `content/gallery.json`, and `index.html` reads those
files at page load.

Because this site is hosted on GitHub Pages (static files only), logging in to
`/admin` needs a small helper: a Cloudflare Worker in `cms-oauth-proxy/` that
completes GitHub's OAuth login on the CMS's behalf. That Worker only needs to
be deployed once. After that, editing content works from any browser, for
both Doomzy and the school admin.

---

## Part A: One-time setup (Doomzy only)

You need a GitHub account (already have: `dzyhype6`) and a free
[Cloudflare](https://dash.cloudflare.com/sign-up) account.

### 1. Register a GitHub OAuth App

1. Go to **[github.com/settings/developers](https://github.com/settings/developers)** → **OAuth Apps** → **New OAuth App**.
2. Fill in:
   - **Application name**: `Emmanuel Junior Centre School CMS` (anything you like)
   - **Homepage URL**: `https://dzyhype6.github.io/emmanuel-junior-centre-school/`
   - **Authorization callback URL**: `https://<your-worker-subdomain>.workers.dev/callback`
     (you'll get the exact `<your-worker-subdomain>` once you deploy the Worker
     in step 2. GitHub lets you edit this field later, so just come back and
     paste in the real URL then.)
3. Click **Register application**.
4. Click **Generate a new client secret**, then copy both the **Client ID**
   and the **Client secret** somewhere safe. You'll paste them into Cloudflare next.

### 2. Deploy the OAuth proxy Worker to Cloudflare

From the `cms-oauth-proxy/` folder in this repo, on a machine with
[Node.js](https://nodejs.org/) installed:

```bash
cd cms-oauth-proxy
npx wrangler login          # opens a browser to connect your Cloudflare account
npx wrangler deploy
```

Wrangler will print the Worker's live URL, e.g.:

```
https://emmanuel-school-decap-oauth.<your-subdomain>.workers.dev
```

Then set the two secrets it needs (paste the values from step 1 when prompted):

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

Go back to the GitHub OAuth App (step 1) and make sure the **Authorization
callback URL** is exactly `<worker URL>/callback`.

### 3. Point the CMS config at the deployed Worker

In [`admin/config.yml`](admin/config.yml), replace the placeholder:

```yaml
base_url: https://REPLACE_WITH_OAUTH_PROXY_URL
```

with your actual Worker URL (no trailing slash), e.g.:

```yaml
base_url: https://emmanuel-school-decap-oauth.<your-subdomain>.workers.dev
```

Commit and push that change. Once GitHub Pages redeploys (usually under a
minute), `/admin` is ready to log in.

---

## Part B: Giving the school admin their own login

The school admin is a separate person from Doomzy and needs their **own**
GitHub account to log into `/admin`. Decap CMS's GitHub backend authenticates
as a real GitHub user with write access to the repo; there's no separate
"CMS-only" account system.

1. Ask the school admin to create a free GitHub account if they don't have one
   ([github.com/join](https://github.com/join)) and tell you their username.
2. In this repo on GitHub: **Settings → Collaborators and teams → Add people**,
   and add their GitHub username. GitHub will email them an invite they must
   accept.
3. Once accepted, the school admin can go to
   `https://dzyhype6.github.io/emmanuel-junior-centre-school/admin/`, click
   **Login with GitHub**, and approve access. They'll then see the same
   editing screens (Contact & School Info, Fees & Uniform, Gallery) and can
   save changes, which commit directly to this repo's `main` branch.

**Note:** Collaborator access on GitHub is fairly broad; it lets someone push
code, not just edit the CMS's JSON/image files. If that becomes a concern
later, you can switch the repo to GitHub's fine-grained permissions or a
"content only" workflow (e.g. editorial_workflow with PR review). Not
necessary to start, but worth knowing about if you want tighter control down
the line.

---

## What's editable from `/admin`

- **Contact & School Info**: phone, WhatsApp number, email, address, hours.
- **Fees & Uniform**: the Playgroup fee table, other-stage fee ranges, program
  card fees, notes and policies, transport charges, the payment methods line,
  activity price, and all four uniform tables (boys/girls, lower/JSS).
- **Gallery**: add, remove, or reorder photo or video items. Upload a photo
  directly (it's stored in `/uploads/`) or paste a YouTube/Vimeo link instead.

Anything not listed above (page layout, colors, text copy, testimonials, etc.)
still lives directly in `index.html` and needs a code change to update.
