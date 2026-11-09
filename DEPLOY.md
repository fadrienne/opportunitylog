# Deploy to Vercel

Deploying takes a few minutes. Enabling cloud sync requires a Supabase project and takes additional setup.

## Step 1: Put the files on GitHub

1. Go to github.com and create a new repository. Name it anything, e.g. `opportunity-log`. Set it to Private.
2. Upload these files, keeping the `api` folder:
   - `index.html`
   - `api/assess.js` (make sure the `api` folder exists)
   - `api/sync.js`
   - `vercel.json`

You can do this through GitHub's web interface: click "Add file" → "Upload files".

## Step 2: Deploy on Vercel

1. Go to vercel.com and sign in with your GitHub account.
2. Click "Add New Project" → select your `opportunity-log` repository.
3. Leave all settings as defaults. Click "Deploy".
4. Vercel will give you a URL like `https://opportunity-log-abc123.vercel.app`. That's your dashboard.

## Step 3: Add your Anthropic API key

1. In the Vercel dashboard, go to your project → Settings → Environment Variables.
2. Add a new variable:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your Anthropic API key (get one at console.anthropic.com if you don't have one — it's separate from your Claude.ai subscription)
3. Click Save.
4. Go to Deployments → click the three dots on the latest deployment → "Redeploy". This picks up the new environment variable.

## Step 4: Enable private cloud sync

Cloud sync keeps the Vercel dashboard and standalone HTML copies connected. It is separate from Anthropic and does not use AI credits.

1. Create a Supabase project.
2. In Supabase, open **SQL Editor** and run:

   ```sql
   create table public.opportunity_log_sync (
     id text primary key check (id = 'primary'),
     records jsonb not null default '[]'::jsonb,
     updated_at timestamptz not null default now()
   );

   alter table public.opportunity_log_sync enable row level security;
   revoke all on table public.opportunity_log_sync from anon, authenticated;
   grant all on table public.opportunity_log_sync to service_role;
   ```

3. In Vercel, open the project **Settings → Environment Variables** and add:
   - `SUPABASE_URL`: the Supabase project URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: the Supabase `service_role` secret key.
   - `OPPORTUNITY_SYNC_KEY`: a long, random private password. For example, generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. Redeploy the Vercel project so the API can read the new environment variables.
5. Open the Vercel dashboard, click **Cloud sync**, enter the same `OPPORTUNITY_SYNC_KEY`, and connect. The Vercel URL is filled in automatically.
6. Click **Download standalone copy** from the connected Vercel dashboard and open that downloaded HTML file. In its **Cloud sync** panel, enter the same key and connect. Do the same on each browser/device that should share the data.

Keep the Supabase service-role key only in Vercel's environment variables; never put it in the HTML or GitHub. The sync key grants access to the shared opportunity list, so keep it private. It is stored in each connected browser's local storage. The database table has row-level security enabled and is only accessed by the server-side Vercel API.

The app syncs on saves and checks for changes about every 20 seconds while open. On the first connection, local-only opportunities are added to the shared list; when the same opportunity exists in both places, the newer synced version is kept. Entries are archived rather than deleted, so archiving also syncs.

## If assessment returns "Forbidden"

The assessment runs through `/api/assess` on Vercel, so opening a downloaded HTML file directly (`file:///...`) will not work. Open the dashboard using its Vercel project URL. For local development, run the project with `vercel dev`. If the request still returns HTTP 403 on Vercel, check the deployment's **Deployment Protection** and **Firewall** settings. If the deployment is intentionally protected, sign in or use the authorized production URL; do not make a protected deployment public just to bypass the error.

## Done

Your dashboard is live at the Vercel URL. Open it on any device or browser, then connect cloud sync on each one you want to share data with.

## Updating the dashboard

When I send you updated files:
1. Replace each changed file in your GitHub repo, keeping `api/assess.js` in the `api` folder.
2. Vercel redeploys automatically within about 30 seconds.

Assessment responses are streamed from Anthropic. An assessment uses one model request. If Details is empty and a URL is supplied, the request can use at most one web search to find the listing; when Details is pasted, web search is not used. A timeout can still consume credits, so do not repeatedly retry a failing request.

The tracker and manual logging work without Anthropic credits. Use **Log without AI** to save an opportunity directly in this browser; it will be marked as not assessed. AI assessments still require a working Anthropic API key and available API credits. There is no way for a hosted AI assessment to continue after those credits run out without switching to a separately funded provider or running a local model.

Without cloud sync, the Vercel site and a downloaded `file:///` copy use separate browser storage. Once both are connected with the same sync key, changes are shared without repeatedly downloading a fresh copy. A newly downloaded standalone copy includes the Vercel URL, but you still need to connect it with the key.
