# HousePass

Digital sign-out / sign-in for boarding houses. Replaces the paper sheet with
three connected surfaces: a student phone app (PWA), an office iPad station,
and a live staff dashboard.

> Full setup, seeding and deployment instructions land with the final
> milestone; this file grows with the build.

## Quick start (development)

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys + secrets
npm run dev
```

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase: Postgres, Auth, Realtime, Row-Level Security
- Deployed on Vercel; installable PWA
