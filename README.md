# BC25 Sandbox

Public simulator for the **BC25 Defender Index** — lets anyone play with minting,
redeeming, swapping, sending, a Time Machine, and a "Survive the Bear" mini-game to build
familiarity and support fundraising/awareness. **Simulation only — no real money, nothing
on-chain.**

- **Static site** (`index.html`, logos) + **Vercel serverless functions** (`api/`).
- Live basket prices + real historical data via CoinGecko (server-side, key hidden), with
  graceful fallback to illustrative data if the API is unavailable.
- Optional email capture for the waitlist.

## Deploy (Vercel)

1. Put this folder in a Git repo and import it into Vercel (framework preset: **Other** —
   it's a static site with an `api/` directory; no build step).
2. Set environment variables in Vercel → Settings → Environment Variables:
   - `COINGECKO_DEMO_API_KEY` — your CoinGecko demo key (enables live NAV + Time Machine).
   - **Email capture (pick one, optional):**
     - `SIGNUP_WEBHOOK_URL` — a URL to POST `{email,ts,ua}` to (Google Apps Script / Zapier /
       form service). Simplest.
     - or `KV_REST_API_URL` + `KV_REST_API_TOKEN` — a Vercel KV / Upstash store (emails are
       added to the `bc25_signups` set).
     - If neither is set, signups are written to the function logs (fine to start).
3. Deploy. That's it.

Local preview with live APIs: `npx vercel dev` (needs the Vercel CLI + the env vars). The
page also works opened directly as a file — it just uses the built-in illustrative data.

## Replace the logos

- `coin-logo.png` — **replace this placeholder with the real BC25 coin logo** (the gold
  "Blue-Chip Defender Index 25" coin). Used as the brand mark.
- `bull-logo.png` — the blue bull head (mascot). Already correct.

## Honesty / data notes

- NAV and the Time Machine use a **simplified weighted-basket model** of the index
  (leadership + sampled alts + a defensive stable/gold sleeve). It shows the *shape* of the
  strategy but is **not** the live xv3.1 engine. A later step can ingest the real engine's
  NAV series for exact fidelity.
- All copy is marked as a simulation and carries a no-promises disclaimer. Any
  reward/airdrop/early-supporter language has securities implications — have counsel review
  before leaning on it publicly.
