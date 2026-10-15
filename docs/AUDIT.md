# Independent code audit — WorkAccounting
**Date:** 2026-10-15. **Baseline:** `5fa5c125`. **Method:** static source inspection (not penetration testing).
**Reviewed:** ASP.NET Core API, SQLite schema/transactions, React UI, Vite configuration, batch launch scripts.

## Confirmed business decisions — not defects
- All signed-in masters may **read** shared production data across contracts and sections. **Do not add read restrictions.**
- Masters may **write** only to their assigned sections.
- The daily report is a **replacement snapshot**: old daily rows for the specified day/work are deleted and recreated within a transaction. **Do not change this behavior.**

## Actionable findings
| Priority | Evidence | Recommendation |
|---|---|---|
| High | `frontend/vite.config.ts` proxies `/api` to port 64849, while `start.bat` launches on 5088 | Align proxy with launcher; add startup smoke test (fixed in refactor stage 1). |
| High | No automated integration tests in the initial repository tree | Add API tests for role-limited **writes**, repeated daily snapshots, progress 0–100%, rollback on insufficient stock, and multi-contract isolation. |
| Medium | `README.md` documented `workaccounting.db` while backend creates `workaccounting_v2.db` | Correct documentation (fixed in refactor stage 1). |
| Medium | `backend/Program.cs` holds routing, SQL, schema, and models | Extract persistence and domain models; later separate feature endpoints and services in small behavior-preserving steps. |
| Medium | `frontend/src/App.tsx`, `style.css` and `WorkMatrix.tsx` are large; `Row=Record<string, any>` | Extract configuration and HTTP client; add typed DTOs and isolate UI features incrementally. |
| Medium | `/api/auth/login` has no explicit rate-limiter in reviewed code | Introduce rate limiting and failure monitoring before external deployment. |
| Medium | `backend/Program.cs` returns raw SQLite exception messages for some API operations | Return stable error codes; log internal details server-side. |
| Medium | `works` DB model independently references vehicle and contract work | Validate that both belong to the same contract at the persistence boundary; add tests for mismatched IDs. |
| Medium | Startup password read from `backend/admin-password.txt` | Restrict file permissions and document removal/rotation procedure after bootstrap. |
| Low | Vite development server used in local startup | Serve a compiled production build behind HTTPS and access controls in a company network. |

## Positive observations
- `PasswordHasher<T>` for credentials and cryptographically random bearer tokens, with stored token hashes rather than plaintext.
- SQL values parameterized; entity identifiers drawn from allowlists.
- SQLite transactions are used when posting progress and writing off materials.
- Finished work cannot be simply reduced through the daily endpoint.

## Verification status and proposed tests
Build checks in `.github/workflows/ci.yml` verify .NET compilation and the TypeScript/Vite production bundle. The isolated `tests/api_smoke.py` test verifies shared reads, section-scoped writes, same-date progress replacement, and transactional stock write-off. A comprehensive unit/integration and browser end-to-end test suite is **not yet implemented**.
Do not claim production readiness until live environment validation and HTTPS deployment have been completed.
