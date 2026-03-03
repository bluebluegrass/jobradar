# JobRadar

AI-powered job search intelligence dashboard. Connect Gmail/Outlook with OAuth, parse hiring emails, and visualize your funnel.

## What this app now includes
- Google OAuth (Gmail read scope)
- Microsoft OAuth (Outlook Mail.Read scope)
- Inbox fetch endpoint for job-related emails (`/api/emails/job-search`)
- Server-side OpenAI analysis endpoint (`/api/analyze`)
- Sankey funnel + conversion dashboard UI

## Setup
1. Install dependencies

```bash
npm install
```

2. Create env file

```bash
cp .env.example .env
```

3. Fill in credentials in `.env`
- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`

4. Configure OAuth redirect URIs
- Google: `http://localhost:8787/api/auth/google/callback`
- Microsoft: `http://localhost:8787/api/auth/outlook/callback`

5. Run app

```bash
npm run dev
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:8787`

## Notes
- OAuth tokens are stored in an in-memory session (for local/dev use).
- Secrets are not exposed to the browser.
- Vite proxies `/api/*` to the backend during development.

## Deploy on Render
1. Push this project to GitHub.
2. In Render, create a new **Blueprint** service from your repo (it will read `render.yaml`).
3. Set all `sync: false` env vars in Render dashboard:
   - `OPENAI_API_KEY`
   - `APP_BASE_URL` = `https://<your-service>.onrender.com`
   - `SERVER_BASE_URL` = `https://<your-service>.onrender.com`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
   - `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI`
4. Set OAuth redirect URIs in providers:
   - Google: `https://<your-service>.onrender.com/api/auth/google/callback`
   - Microsoft: `https://<your-service>.onrender.com/api/auth/outlook/callback`

## Custom Domain (Cloudflare + Render)
1. In Render service settings, open **Custom Domains** and add `jobradar.simona.life`.
2. Render will show a DNS target (usually your `*.onrender.com` host).
3. In Cloudflare DNS, create:
   - `Type`: `CNAME`
   - `Name`: `jobradar`
   - `Target`: the Render target host
4. Keep Cloudflare proxy **DNS only** until Render certificate is issued, then you can switch to proxied if desired.
5. After domain is active, update Render env:
   - `APP_BASE_URL=https://jobradar.simona.life`
   - `SERVER_BASE_URL=https://jobradar.simona.life`
   - `GOOGLE_REDIRECT_URI=https://jobradar.simona.life/api/auth/google/callback`
   - `MICROSOFT_REDIRECT_URI=https://jobradar.simona.life/api/auth/outlook/callback`
6. Update the same redirect URIs in Google Cloud Console and Azure App Registration.

## OAuth Troubleshooting
- Hit `https://<your-domain>/api/auth/status` and confirm:
  - `googleConfigured: true`
  - `outlookConfigured: true`
- If either is `false`, the Render env key name is wrong or value is empty.
