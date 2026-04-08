# Site Migration Plan: TinaCMS + Fastly Compute

## Architecture

```
TinaCMS (k3s) → git push → GitHub Actions → Hugo build → Fastly Compute (edge)
```

- **Public site**: Served from Fastly Compute (no origin server)
- **Content editing**: TinaCMS self-hosted on local k3s cluster (Tailscale-only access)
- **Build pipeline**: GitHub Actions triggers on push, builds Hugo, publishes to Fastly

---

## Phase 0: Repo Cleanup

- [x] Add `public/`, `node_modules/`, `tina/__generated__/` to `.gitignore`
- [x] Remove `public/` from git tracking
- [x] Verify Hugo builds cleanly locally
- [x] Updated hugo-blog-awesome theme v1.17.0 → v1.21.0
- [x] Added RSS template override for Hugo 0.159 compat (`.Site.Author` deprecated)

## Phase 1: Add TinaCMS (Local Development)

- [x] Initialize TinaCMS with npm dependencies
- [x] Convert 5 content files from TOML (`+++`) to YAML (`---`) front matter
- [x] Configure Tina schema in `tina/config.ts` for two collections:
  - `posts` → `content/en/posts` (fields: title, date, draft, body)
  - `book-reviews` → `content/en/book-reviews` (fields: title, date, draft, body)
- [x] Disabled `createNestedFolder` to keep flat file structure
- [x] Test locally: `npm run dev` → CMS at `http://localhost:1313/admin/`

## Phase 2: Self-Host TinaCMS on k3s

- [x] Created Express backend server (`backend/server.js`)
- [x] Created Dockerfile (multi-stage: build TinaCMS → run Express)
- [x] K8s manifests written in `k3s-homelab/apps/homelab/tinacms/`:
  - [x] `tinacms.yaml` — HelmRelease with app-template (TinaCMS + MongoDB containers)
  - [x] `pvc.yaml` — 2Gi Longhorn PVC for MongoDB data
  - [x] `externalsecret.yaml` — ExternalSecret from 1Password (`tinacms` vault item)
  - [x] Tailscale ingress (accessible at `tinacms.porgy-monitor.ts.net` or similar)
- [x] Added tinacms to homelab kustomization.yaml
- [ ] **YOU**: Create 1Password item `tinacms` in `k8s-homelab` vault with keys:
  - `GITHUB_PERSONAL_ACCESS_TOKEN` — GitHub PAT with repo access
  - `GITHUB_OWNER` — `JonSchaeffer`
  - `GITHUB_REPO` — `jonschaeffer.github.io`
  - `GITHUB_BRANCH` — `main`
  - `NEXTAUTH_SECRET` — random string (run `openssl rand -hex 32`)
  - `GITHUB_CLIENT_ID` — from GitHub OAuth App
  - `GITHUB_CLIENT_SECRET` — from GitHub OAuth App
- [ ] **YOU**: Create GitHub OAuth App at github.com/settings/developers
  - Homepage URL: `https://tinacms.porgy-monitor.ts.net`
  - Callback URL: `https://tinacms.porgy-monitor.ts.net/api/tina/auth/callback`
- [ ] **YOU**: Build and push Docker image:
  - `docker build -t ghcr.io/jonschaeffer/tinacms-backend:latest .`
  - `docker push ghcr.io/jonschaeffer/tinacms-backend:latest`
- [ ] Deploy to k3s (Flux should pick up after commit to k3s-homelab)
- [ ] Verify CMS loads and can edit content

## Phase 3: Fastly Compute (parallel with Phase 2)

- [ ] Set up Fastly account + API token
- [ ] Install Fastly CLI: `brew install fastly/tap/fastly`
- [ ] Initialize static publish: `npx @fastly/compute-js-static-publish --public-dir=./public`
- [ ] Build Hugo: `hugo --gc --minify`
- [ ] Test locally at `http://127.0.0.1:7676`
- [ ] Deploy to Fastly Compute
- [ ] Configure custom domain `jonschaeffer.dev` on Fastly
- [ ] DNS migration:
  - [ ] Lower TTL to 60s on existing records
  - [ ] Verify Fastly service works on `*.edgecompute.app` domain
  - [ ] Switch DNS: A/AAAA records pointing to Fastly (apex domain, no CNAME)
  - [ ] Verify site loads on `jonschaeffer.dev`
  - [ ] Raise TTL back to 3600s
- [ ] Remove CNAME file from repo
- [ ] Disable GitHub Pages in repo settings

## Phase 4: CI/CD Pipeline

- [ ] Update `.github/workflows/hugo.yaml`:
  - [ ] Keep Hugo build step
  - [ ] Remove GitHub Pages deploy steps
  - [ ] Add Node.js + Fastly CLI setup
  - [ ] Add `fastly:publish` step
- [ ] Store `FASTLY_API_TOKEN` as GitHub Actions secret
- [ ] Test full loop: TinaCMS edit → git push → Actions → Fastly publish

## Phase 5: Hardening

- [ ] MongoDB backup CronJob on k3s (low priority — MongoDB is just a cache, Git is source of truth)
- [ ] Fastly monitoring/analytics
- [ ] TinaCMS media upload configuration (images → `assets/`)
- [ ] Webhook from GitHub to TinaCMS for content index sync

---

## Key Risks

- **Apex domain**: `jonschaeffer.dev` needs A/AAAA records for Fastly (not CNAME). Confirm DNS provider supports this.
- **TinaCMS self-hosted**: Less documented than TinaCloud. Auth setup may need debugging.
- **MongoDB**: Single pod with PVC is fine for personal blog. If it goes down, editing is unavailable but public site on Fastly is unaffected. Data is ephemeral (rebuilt from Git).
