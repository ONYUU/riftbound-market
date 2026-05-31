# Security Policy

## Secrets

Never commit Supabase service-role keys, database passwords, access tokens, or connection strings.

Use `.env.local` for local development and Vercel/Supabase environment variables for deployed environments. `.env.local` is intentionally ignored by Git.

If a secret is accidentally shared or committed, rotate it immediately in the provider dashboard and remove it from Git history before publishing.

## Public Configuration

Values prefixed with `NEXT_PUBLIC_` are visible in the browser. Use them only for public client configuration such as the Supabase URL and publishable key.

## Reporting Issues

Please report security issues privately to beot.ai.team@gmail.com.
