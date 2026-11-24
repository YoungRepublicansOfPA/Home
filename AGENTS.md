# Repository instructions

This repository is the public `YoungRepublicansOfPA/Home` GitHub Pages site.

## Hard account boundary

- Never push, authenticate, or create commits with the user's personal GitHub account or personal email for this repository.
- Use only the dedicated repo-scoped SSH deploy key configured in this checkout. Do not change global Git config, sign out of another GitHub account, or reuse another account's credential.
- Before pushing, confirm `git remote get-url --push origin` is exactly `git@github.com:YoungRepublicansOfPA/Home.git` and the repository-local `user.name` and `user.email` are `YoungRepublicansOfPA` and `YoungRepublicansOfPA@users.noreply.github.com`.
- If the dedicated key or identity is unavailable, stop the push and explain the blocker. Do not fall back to a personal account.

## Data integrity

- County officeholders, party control, budget figures, and agenda items require a source URL and checked date before publication.
- Distinguish source-directory links from verified facts. Keep missing values visibly unverified.
- Statewide election dates and legislation can change; use the official source and an as-of date.
