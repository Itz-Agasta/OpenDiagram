# Security Policy

## Supported versions

OpenDiagram is pre-1.0 and moves fast. Only the latest `main` receives security fixes.

## Reporting a vulnerability

**Do not open a public issue.**

Report privately through [GitHub Security Advisories](https://github.com/Itz-Agasta/OpenDiagram/security/advisories/new), or email **admin@opendiagram.ink**.

Please include:

- What the issue is and where it lives (file, endpoint, package)
- Steps to reproduce, or a proof of concept
- What an attacker could achieve with it

You can expect an initial response within 72 hours. If the report is valid we will confirm the issue, work on a fix, and credit you in the advisory unless you prefer otherwise.

## Scope

Areas we consider especially sensitive:

- **BYOK provider keys** - encryption at rest, key handling in `apps/server/src/lib/ai-provider/`
- **Authentication and sessions** - Better Auth configuration in `packages/auth`
- **Prompt injection** leading to server-side actions or data disclosure
- **Multi-tenant isolation** - one user reading another user's projects, diagrams or documents

## Self-hosting

If you self-host OpenDiagram, you are responsible for your own deployment security: keep secrets out of version control, restrict database network access, and set a strong `BETTER_AUTH_SECRET`. Never commit a populated `.env`.
