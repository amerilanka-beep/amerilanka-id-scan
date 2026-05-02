# AmeriLanka ID Scan Deployment

## Field Order

The app extracts and exports fields in this order:

1. Surname
2. Other Name / Given Name
3. Birth Date
4. Gender
5. Nationality
6. Expiration Date

## OpenAI API Key

Create the key in your OpenAI platform project. Keep it secret.

If an API key was pasted into chat or any shared place, revoke it and create a new one before production use.

For local testing, create a `.dev.vars` file:

```text
OPENAI_API_KEY="your_openai_api_key_here"
OPENAI_MODEL="gpt-4.1-mini"
```

Do not commit `.dev.vars`.

## Cloudflare Workers Static Assets

Deploy the app as a Cloudflare Worker with static assets. Add `OPENAI_API_KEY` as an encrypted secret in Cloudflare, not as a plain text variable.

Dashboard path:

1. Go to Cloudflare Dashboard.
2. Open Workers & Pages.
3. Create an application from the GitHub repository.
4. Use the Worker/static assets project.
5. Open the project settings.
6. Go to Variables and Secrets.
7. Add `OPENAI_API_KEY` as an encrypted secret.
8. Optional: add `OPENAI_MODEL` as a normal variable with `gpt-4.1-mini`.
9. Redeploy the project after adding the secret.

With Wrangler:

```powershell
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npx wrangler deploy
```

After deployment, open the Cloudflare Pages URL on your phone.
