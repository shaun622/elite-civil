# Elite Civil — TakeoffMate

SaaS web app that extracts retaining-wall measurements from architectural PDFs using Claude's vision API. Initial vertical: retaining walls (AU/NZ). Frontend: Vite + React + TypeScript + Tailwind + shadcn/ui. Backend: Supabase (auth, Postgres, Storage, Edge Functions). Hosting: Cloudflare Pages.

The full product brief lives at [`docs/takeoffmate-build-spec.md`](docs/takeoffmate-build-spec.md). This README only covers running and deploying the scaffold.

## Status

**Step 1 of the build roadmap.** Auth flow, routing, and the `profiles` table migration are wired up. Project workspace, PDF upload, Anthropic extraction, review screen, exports, and Stripe come in later steps — see the spec.

## Local development

Prerequisites: Node 20+ (see `.nvmrc`).

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL + anon key
npm run dev
```

Open <http://localhost:5173>.

Without Supabase env vars set, the landing page and form UIs render but auth requests will fail at runtime — that's expected until you wire up a real Supabase project.

### Useful scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check then production build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |

## Supabase setup

1. Create a Supabase project at <https://supabase.com>.
2. Copy the project URL and `anon` key into `.env.local` and into the Cloudflare Pages env vars (see below).
3. Apply the initial migration:
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
4. In the Auth settings, set the site URL to your Cloudflare Pages domain (and `http://localhost:5173` for local).

## Cloudflare Pages deploy

The repo is pre-configured for Cloudflare Pages:

- `public/_redirects` handles SPA client-side routing.
- `.nvmrc` pins Node 20.
- Build output: `dist/`.

Steps in the Cloudflare dashboard:

1. **Pages → Create project → Connect to Git** and pick this repo.
2. Framework preset: **Vite** (auto-detected).
3. Build command: `npm run build` · Output directory: `dist`.
4. **Environment variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Save and deploy. CF assigns a `*.pages.dev` URL on the first build.

## Project layout

```
.
├── docs/takeoffmate-build-spec.md  Full product brief
├── public/
│   ├── _redirects                  CF Pages SPA routing
│   └── favicon.svg
├── src/
│   ├── App.tsx                     Route definitions
│   ├── main.tsx                    React root + providers
│   ├── index.css                   Tailwind + shadcn tokens
│   ├── components/
│   │   ├── auth/                   LoginForm, SignupForm
│   │   ├── layout/                 Header, ProtectedRoute
│   │   └── ui/                     shadcn primitives
│   ├── hooks/useAuth.tsx           Supabase auth context
│   ├── lib/
│   │   ├── supabase.ts             Supabase client
│   │   └── utils.ts                cn() helper
│   └── pages/                      LandingPage, LoginPage, SignupPage, DashboardPage
└── supabase/
    ├── config.toml
    └── migrations/                 profiles table + RLS + new-user trigger
```

## License

Proprietary — Elite Civil.
