# Deploy to Vercel

Three steps. Takes about 5 minutes.

## Step 1: Put the files on GitHub

1. Go to github.com and create a new repository. Name it anything, e.g. `opportunity-log`. Set it to Private.
2. Upload these three files into the repo root:
   - `index.html`
   - `api/assess.js` (make sure the `api` folder exists)
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

## If assessment returns "Forbidden"

The assessment runs through `/api/assess` on Vercel, so opening a downloaded HTML file directly (`file:///...`) will not work. Open the dashboard using its Vercel project URL. For local development, run the project with `vercel dev`. If the request still returns HTTP 403 on Vercel, check the deployment's **Deployment Protection** and **Firewall** settings. If the deployment is intentionally protected, sign in or use the authorized production URL; do not make a protected deployment public just to bypass the error.

## Done

Your dashboard is live at the Vercel URL. Open it on any device, any browser.

The "Download standalone copy" button still works exactly as before — use it to save checkpoints.

## Updating the dashboard

When I send you updated files:
1. Replace each changed file in your GitHub repo, keeping `api/assess.js` in the `api` folder.
2. Vercel redeploys automatically within about 30 seconds.

Assessment responses are streamed from Anthropic so Vercel can start responding before the full assessment is complete. If an assessment still returns HTTP 504, confirm the latest `index.html` and `api/assess.js` are deployed, then retry.
