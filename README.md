# YouInc

YouInc is a personal behaviour dashboard priced like a market. Habits, goals,
quick wins, relapses, and inactivity move a personal credit balance and chart.

## Development

1. Copy `.env.example` to `.env.local`.
2. Add the Firebase web app values.
3. Install dependencies with `npm install`.
4. Start the app with `npm run dev`.

Useful checks:

```sh
npm test
npm run build
```

## Data Storage

The signed-in dashboard stores each account independently in Firestore:

```text
users/{uid}/store/main
```

The dashboard also performs a one-time migration from the browser key
`youinc_v1_store` when a signed-in account does not have a Firestore document.

The `/api/load` and `/api/synq` routes are retained only for backward
compatibility with an older single-user deployment. They continue to use:

```text
users/me/state/main
```

The current dashboard does not call those routes. Their storage path is
intentionally unchanged so existing legacy data remains available until a
controlled migration is performed.

## Deployment Secrets

Set `YOUINC_SYNC_KEY` in the deployment environment if the legacy sync routes
are still needed. Do not expose it through a `NEXT_PUBLIC_` variable or commit
its value to the repository. Because an earlier value was committed, rotate it
in the deployment environment.
