# Working on this repo (for Claude)

Read `README.md` and `docs/DATA_MODEL.md` first. The project brief lives in the claude.ai Project instructions.

## Workflow

Branch → change → test → pull request → **merge it yourself once everything passes**:

- `npm run validate`, `npm test` and `npx playwright test` all pass, and
- nothing in the change needs a person to check first (new or changed facts that couldn't be verified, guest-facing wording the owner should approve, anything destructive or hard to undo).

If something does need a person, open the PR, list it under "Needs a human look", and leave it unmerged. Merging to `main` publishes the live site (GitHub Pages) within a minute or two.

Use the REST API for GitHub (`gh api repos/nebelnes/jw-atlanta-local-guide/...`); GraphQL is not available from Claude sessions.

## Rules that are easy to forget

- Never commit secrets (the Google Maps API key stays a GitHub secret).
- Don't invent hours, phones, prices, status or policies. Use `null` and let the page show "Check current hours".
- Stored routes come from OpenStreetMap, not Google (see ADR 0002); keep "© OpenStreetMap contributors".
- The repo is public: no internal Marriott material or guest information.
