# WorkAccounting — передача змін до `AI_changes`

## Джерело і призначення

- **Джерело (fork):** `Weekross/WorkAccounting`, гілка `refactor/codebase-architecture-audit`.
- **Призначення (upstream):** `DudokVitaliy/WorkAccounting`, гілка `AI_changes`.
- **ЗАБОРОНЕНО:** злиття в `main` у будь-якому репозиторії без окремого погодження.

## Що зроблено

1. `backend/Program.cs` тепер лише збирає застосунок і маршрути; групи роутів перенесені до `backend/Endpoints`.
2. SQLite persistence — `backend/Infrastructure/Persistence/SqliteStore.cs`, SQL allowlist — `Schema.cs`, доменні моделі — `backend/Domain/Models.cs`.
3. Спільні API-помічники — `backend/Application/ApiSupport.cs`.
4. Frontend: `app/config.ts`, `app/types.ts`, `lib/api.ts`, `lib/csv.ts`, `components/DataTable.tsx`, `components/display.tsx`, `features/matrix/utils.ts`.
5. Vite proxy приведено до API-адреси локального `start.bat`: `http://127.0.0.1:5088`.
6. README узгоджено з фактичною назвою SQLite `workaccounting_v2.db`.
7. Додані `docs/ARCHITECTURE.md`, `docs/AUDIT.md`, GitHub Actions і `tests/api_smoke.py`.

## Обов'язкові незмінні правила

- Майстри **переглядають усі виробничі дані** незалежно від призначення дільниці.
- Майстри **редагують лише призначені дільниці**.
- Збереження одного дня **замінює попередні добові записи**, а не додає відсотки вдруге.
- Верхня межа роботи — **100%**.
- При 100% матеріали списуються **атомарно**; недостатній залишок скасовує всю операцію.

## Тести

- `dotnet build backend/WorkAccounting.Api.csproj -c Release`
- `npm ci --prefix frontend`
- `npm run build --prefix frontend`
- `python3 tests/api_smoke.py` **після Release build**. Скрипт запускає API з окремою тимчасовою SQLite БД; він не використовує робочу базу.

Статус GitHub Actions перевіряйте у вкладці `Actions` на поточному head-коміті. Для production потрібні окремі перевірки Windows запуску та UI у браузерах.

## Найбезпечніше перенесення (через GitHub UI)

1. Відкрити вкладку **Pull requests → New pull request**.
2. Натиснути **compare across forks**.
3. Вибрати **base repository** `DudokVitaliy/WorkAccounting` та **base branch** `AI_changes`.
4. Вибрати **head repository** `Weekross/WorkAccounting` та **compare branch** `refactor/codebase-architecture-audit`.
5. Перевірити diff та CI; після рев'ю виконати Merge **тільки в `AI_changes`**.

Не потрібно переносити файли поодинці чи копіювати локальну БД. Рекомендовано зробити резервну копію чинної бази перед встановленням нової версії у Windows.

## Потенційні наступні кроки

1. Реальні API інтеграційні тести за ролями, сценаріями складу та всіма контрактами.
2. Типізовані frontend DTO замість `Record<string, any>`.
3. Розділення великих React-компонентів і CSS за функціональними модулями.
4. Цілісність зв'язків `works` між контрактом, автомобілем і нормативом.
5. Rate limiting логіну, безпечні відповіді на помилки БД, резервне копіювання та HTTPS для постійної роботи.
