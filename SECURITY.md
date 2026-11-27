# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Invexiqs WMS, please report it responsibly:

Report through the [support page](https://stokora.vercel.app/support).

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes

## Scope

This policy covers:
- The Invexiqs WMS web application (stokora.vercel.app)
- All API endpoints
- Authentication and authorization flows
- Data storage and encryption

## Out of Scope

- Denial of service attacks
- Social engineering
- Physical attacks
- Third-party services (Supabase, Vercel, Stripe, Shopify)

## Security Measures

- Row-level security policies on warehouse tables
- AES-256-GCM encryption for third-party access tokens
- HMAC-SHA256 verification on all Shopify webhooks
- Content Security Policy (CSP) headers
- HTTP Strict Transport Security (HSTS)
- Rate limiting on inquiry and job endpoints
- Authentication required on all non-public routes

## Responsible Disclosure

We ask that you:
- Give us reasonable time to fix the issue before public disclosure
- Do not access or modify other users' data
- Do not perform actions that could harm the service or its users
