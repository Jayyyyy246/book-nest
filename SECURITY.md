# Security Policy

The BookNest team takes application security, data privacy, and vulnerability disclosure seriously. We appreciate the efforts of security researchers and developers who help make BookNest safer.

---

## 1. Supported Versions

| Version | Supported | Security Updates |
|:---:|:---:|:---:|
| 2.x (Current) | :white_check_mark: | Full active security support |
| 1.x (Legacy PHP) | :x: | Archived reference only |

---

## 2. Reporting a Vulnerability

If you discover a potential security vulnerability in BookNest, please do **NOT** open a public GitHub issue.

Instead, please report it privately:
1. Email your findings to: `security@booknest.campus.edu` (or contact the repository maintainer directly via GitHub Security Advisories).
2. Include detailed reproduction steps, potential impact, and sample requests.
3. Allow up to 48 hours for an acknowledgment from our security maintainers.

We ask that you practice responsible disclosure and refrain from publicly discussing or demonstrating the issue until a patch has been published.

---

## 3. Implemented Security Controls

BookNest implements defense-in-depth security measures across both client and server:

### 3.1 Authentication & Session Security
- **JWT Cryptographic Verification**: JSON Web Tokens are signed using HMAC-SHA256. In production, `JWT_SECRET` must be at least 32 characters and cannot match common insecure defaults.
- **Password Hashing**: User passwords are encrypted using bcrypt prior to database insertion.
- **RBAC (Role-Based Access Control)**: Administrative endpoints require verified `role === 'admin'`. Token tampering or role spoofing is strictly blocked.

### 3.2 Request Hardening & DoS Prevention
- **Strict Payload Limits**: Standard REST endpoints enforce a strict `100KB` body limit to prevent memory exhaustion. Only the optical scanner accepts up to `15MB` for camera frames.
- **Multi-Window Rate Limiting**:
  - Auth routes: 15 requests per 15-minute window (`AUTH_RATE_LIMIT_MAX`)
  - AI recommendations: 20 requests per 15-minute window (`AI_RATE_LIMIT_MAX`)
  - Optical scanner: 30 requests per 1-minute window (`SCANNER_RATE_LIMIT_MAX`)
- **Rate Limit Bypass Defenses**: Spoofed `X-Forwarded-For` headers are discarded unless `TRUST_PROXY` is explicitly enabled.

### 3.3 Data Integrity & Concurrency Protection
- **Atomic Transactions**: Multi-step checkout processes run inside SQLite `BEGIN IMMEDIATE TRANSACTION` blocks to prevent stock overselling and race conditions.
- **Order Idempotency**: Checkout requests accept an `Idempotency-Key` header to prevent duplicate charges or double inventory decrements from network retries.

### 3.4 Input Validation & Sanitization
- **Centralized Sanitization**: All queries, parameters, and payloads are strictly validated before hitting the database.
- **Parameterized SQL**: All database operations use SQLite parameterized prepared statements, eliminating SQL injection risks.
- **Magic-Byte Inspection**: Uploaded images in the optical scanner undergo binary header inspection to prevent polyglot file uploads and MIME confusion attacks.
