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

## 2026-10-15 — результат другого етапу

- **Погоджені бізнес-правила збережено:** майстер читає загальні виробничі дані; редагує лише закріплені дільниці; повторне внесення за дату замінює денний запис.
- **Захист входу:** обмеження до 8 спроб на IP за 60 секунд на `/api/auth/login`; сесія відкликається під час виходу. Ліміти потрібно адаптувати до реального проксі та кількості користувачів.
- **Залежності:** оновлено `Microsoft.Data.Sqlite` до `10.0.13`. Попередня версія тягнула вразливий `SQLitePCLRaw.lib.e_sqlite3 2.1.11` (GHSA-2m69-gcr7-jv3q).
- **База даних:** назва `workaccounting_v2.db` і механізм щоденних знімків не змінені.
- **Frontend:** типізовані DTO контрактів, технічних робіт, транспорту, матеріалів, користувачів, звітів, авторизації, bulk-відповідей та запитів прогресу; невідомі поля у загальному CRUD мають тип `unknown`, а не `any`.
- **Компоненти:** окремі модулі dashboard, reports, admin tables/edit dialogs, bulk dialogs, inventory receipt, matrix filters/grid/summary.
- **Тести:** ізольований HTTP smoke перевіряє ролі, logout, заміну денної готовності, списання ТМЦ та rate limit; є тести чистих JS/TS-функцій матриці.
- **Windows:** додано створення ярлика і перевірку PowerShell/HTTP у GitHub Actions; актуальний результат Windows job необхідно перевіряти на HEAD-коміті перед оголошенням готовності.

**Залишкові ризики:** немає наскрізної browser-e2e перевірки сценаріїв усіх форм, повного контрактно-складського property testing, автоматичного резервування SQLite чи безпечного HTTPS-розгортання в LAN. Поточний запуск розрахований на `127.0.0.1` і роботу на одному ПК.
