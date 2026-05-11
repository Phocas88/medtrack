# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Stokora WMS, please report it responsibly:

**Email:** security@stokora.com

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes

## Response Timeline

- **Acknowledgment:** Within 24 hours
- **Initial assessment:** Within 72 hours
- **Fix deployed:** Critical vulnerabilities within 7 days, others within 30 days

## Scope

This policy covers:
- The Stokora WMS web application (stokora.vercel.app)
- All API endpoints
- Authentication and authorization flows
- Data storage and encryption

## Out of Scope

- Denial of service attacks
- Social engineering
- Physical attacks
- Third-party services (Supabase, Vercel, Stripe, Shopify)

## Security Measures

- Row-Level Security (RLS) on all database tables
- AES-256-GCM encryption for third-party access tokens
- HMAC-SHA256 verification on all Shopify webhooks
- Content Security Policy (CSP) headers
- HTTP Strict Transport Security (HSTS)
- Rate limiting on API endpoints
- Multi-tenant isolation via tenant_id + RLS policies
- Authentication required on all non-public routes

## Responsible Disclosure

We ask that you:
- Give us reasonable time to fix the issue before public disclosure
- Do not access or modify other users' data
- Do not perform actions that could harm the service or its users
