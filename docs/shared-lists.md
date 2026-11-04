# Shared shortlists

Back to the [docs index](README.md).

## How shared lists work

- A normal `?board=...` link lets anyone with it view and edit shortlist items. Taste and private saves stay on-device; no account is required.
- New lists (`v2_...`) are created by `POST /api/boards` through CloudFront/API Gateway/Lambda. The server stores a SHA-256 hash of a random owner key in a private Firestore board document; the browser stores the key locally. The Share sheet can copy a **private management link** for recovery on another device. Never send it to collaborators.
- Anyone can **Leave list**. This removes their saved entries and first name from the shared list, but does not clear their private saved homes. The creator can **Delete list for everyone** using the owner key. Deletion marks the list inactive first, then purges its items; Firestore rules prevent clients from recreating them. A minimal tombstone remains. Lost owner keys require manual help via `hello@houseswipe.uk`.
- Older 40-character list links keep working, but no one can prove ownership of them. They support Leave; whole-list deletion is manual on request.
- The board API reads `/housefinder/firebase-admin` from SSM. `firebase/firestore.rules` must be deployed to Firebase separately from CDK; publish the rules **before** deploying a frontend that creates v2 lists. Run `cd infra/board-api && npm test`, `cd frontend && npm test && npm run build`, and `cd infra && NODE_OPTIONS=--max-old-space-size=3000 npm run build` when changing this flow.
