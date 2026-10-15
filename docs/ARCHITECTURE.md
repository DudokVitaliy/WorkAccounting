# WorkAccounting — архітектура та правила безпечного рефакторингу

Початкова версія: `5fa5c1252e6c1e2c39458ebcbce61afc95d8206b`. Власник: `DudokVitaliy/WorkAccounting`. Гілка розробки у форку: `refactor/codebase-architecture-audit`.

## Технології та призначення

- **Backend:** ASP.NET Core 10 Minimal API, SQLite (WAL), парольні хеші ASP.NET Identity.
- **Frontend:** React 19, TypeScript, Vite, власні CSS-стилі.
- **Запуск:** `setup.bat`, `start.bat`; API за HTTP лише для довіреного локального середовища.

## Узгоджені правила предметної області (НЕ змінювати)

1. Кожен авторизований майстер **може читати спільні виробничі дані та звіти**. Розмежування прав на читання за дільницями не потрібне.
2. Майстер **може редагувати** лише роботи на призначених йому дільницях. Менеджер не може вносити прогрес.
3. Збереження щоденного звіту **замінює запис виконання за вибрану дату**, залишаючи правильний загальний прогрес. Видалення й повторне створення добових рядків у межах транзакції — погоджена поведінка.
4. Загальний прогрес кожної роботи залишається у межах **0–100%**.
5. Досягнення 100% виконує **атомарне списання закріплених ТМЦ** (за їх наявності), а зменшення завершеної роботи потребує окремої процедури.
6. Контракти, автомобілі, дільниці, історія виконання й складські записи повинні зберігатися після рефакторингу. Наявну схему БД і назву файлу БД не змінювати в суто структурних комітах.

## Цільова структура коду (інкрементально)

```text
backend/
  Program.cs                      # Composition root та реєстрація API
  Domain/
    Models.cs                     # User, LoginRequest, Roles
  Infrastructure/
    Persistence/
      Schema.cs                   # Allowlist таблиць/полів API
      SqliteStore.cs              # SQLite schema, DAO, транзакційні методи
  Application/
    ApiSupport.cs                 # API helper methods
  Endpoints/
    AuthEndpoints.cs              # Login and user-section assignments
    EntityEndpoints.cs            # Generic CRUD routes
    BulkEndpoints.cs              # Bulk import endpoints
    InventoryEndpoints.cs         # Stock receipts
    ReportEndpoints.cs            # Production reporting
    ProgressEndpoints.cs          # Daily snapshot writes
  [наступні етапи] Services/, Validation/
frontend/
  src/
    App.tsx                       # Кореневий UI / навігація
    WorkMatrix.tsx                # Матриця (без змін поведінки)
    app/
      config.ts                   # Навігація та опис CRUD-форм
      types.ts                    # Типи UI й сесії
    lib/
      api.ts                      # HTTP-клієнт
      csv.ts                      # Експорт CSV
    components/
      DataTable.tsx               # Табличний вивід
      display.tsx                 # Відображення значень
    features/matrix/utils.ts      # Розрахунки й форматування матриці
docs/
  ARCHITECTURE.md
  AUDIT.md
tests/
  api_smoke.py                    # Регресійні HTTP-перевірки на тимчасовій SQLite
.github/workflows/
  ci.yml
```

## Правила релізу

- Зміни виконуються **лише у форку `Weekross/WorkAccounting`, в гілці `refactor/codebase-architecture-audit`**.
- Оригінальні `main` та `AI_changes` не змінюються без окремого перенесення.
- Перед інтеграцією: `dotnet build backend/WorkAccounting.Api.csproj`, `npm ci --prefix frontend`, `npm run build --prefix frontend`.
- Перевіряти вручну: логін, CRUD контрактів, роботу матриці, повторне збереження тієї самої дати, обмеження майстра **на запис**, завершення 100% зі списанням ТМЦ, експорт CSV.
- Не вважати статичний аудит підтвердженим penetration test.

## Оновлена структура другого етапу

```text
frontend/src/
  app/dto.ts                            # Контракти API й типи відповідей
  app/types.ts                          # Динамічні CRUD поля (unknown)
  components/{DataTable,display}.tsx
  features/
    dashboard/DashboardPage.tsx
    reports/ReportsPage.tsx
    admin/{EntityTable,EntityEditorDialog,BulkWorksDialog,BulkVehiclesDialog}.tsx
    matrix/{MatrixFilters,MatrixGrid,ProductionSummary,utils}.tsx
    inventory/ReceiptDialog.tsx
  lib/{api,csv}.ts
windows/
  launch.ps1                            # Відкриває сайт в Edge --app
  install-shortcut.ps1                  # Створює WorkAccounting.lnk
install-shortcut.bat
tests/
  api_smoke.py
  frontend_utils.test.mjs
  windows_smoke.ps1
```

Залишаються локальними `http://127.0.0.1:5088` (API) та `http://127.0.0.1:5173` (UI). `AllowedHosts` включає `localhost` і `127.0.0.1` для proxy. Без окремої захищеної схеми розгортання сервер не можна відкривати в зовнішню мережу.
