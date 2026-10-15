using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;

var builder = WebApplication.CreateBuilder(args);
var dbPath = Path.Combine(builder.Environment.ContentRootPath, "workaccounting_v2.db");
builder.Services.AddSingleton(new Store($"Data Source={dbPath};Foreign Keys=True;Default Timeout=15"));
builder.Services.AddCors(o => o.AddPolicy("local", p => p.WithOrigins("http://localhost:5173", "http://127.0.0.1:5173").AllowAnyHeader().AllowAnyMethod()));
var app = builder.Build();
app.UseCors("local");
var store = app.Services.GetRequiredService<Store>();
store.Init();
var bootstrap = Environment.GetEnvironmentVariable("WORK_ADMIN_PASSWORD");
if (!string.IsNullOrWhiteSpace(bootstrap)) store.SeedAdmin(bootstrap);

app.MapGet("/api/health", () => Results.Ok(new { status = "ok", version = 2 }));
app.MapPost("/api/auth/login", (LoginRequest req, Store s) => {
    var login = req.Login?.Trim() ?? "";
    var user = s.One("SELECT id,login,role,password_hash,active FROM users WHERE login=@login", ("@login", login));
    if (user is null || Convert.ToInt64(user["active"]) != 1 || new PasswordHasher<string>().VerifyHashedPassword(login, (string)user["password_hash"]!, req.Password ?? "") == PasswordVerificationResult.Failed) return Results.Unauthorized();
    var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    s.Exec("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(@t,@u,@e)", ("@t", Hash(token)), ("@u", user["id"]), ("@e", DateTimeOffset.UtcNow.AddHours(12).ToUnixTimeSeconds()));
    return Results.Ok(new { token, login = user["login"], role = user["role"] });
});
app.MapGet("/api/auth/me", (HttpContext h, Store s) => Current(h, s) is { } u ? Results.Ok(new { u.Id, u.Login, u.Role, sections = AllowedSections(u, s) }) : Results.Unauthorized());
app.MapPost("/api/auth/logout", (HttpContext h, Store s) => { var t = Token(h); if (t is not null) s.Exec("DELETE FROM sessions WHERE token_hash=@t", ("@t", Hash(t))); return Results.Ok(); });

app.MapGet("/api/{entity}", (string entity, HttpContext h, Store s) => {
    var u = Current(h, s); if (u is null) return Results.Unauthorized();
    if (!Schema.Tables.TryGetValue(entity, out var table)) return Results.NotFound();
    if (entity is "users" or "user_sections" && u.Role != "Admin") return Results.StatusCode(403);
    var fields = entity == "users" ? "id,login,role,active" : "*";
    return Results.Ok(s.All($"SELECT {fields} FROM {table} ORDER BY id DESC"));
});

app.MapPost("/api/{entity}", async (string entity, HttpContext h, Store s) => {
    var u = Current(h, s); if (u is null) return Results.Unauthorized();
    if (!Schema.Tables.ContainsKey(entity)) return Results.NotFound();
    if (u.Role != "Admin" && !(u.Role == "Master" && entity is "daily" or "section_daily_hours")) return Results.StatusCode(403);
    var d = await Read(h);
    try
    {
        if (entity == "users")
        {
            var login = Str(d, "login"); var pass = Str(d, "password"); var role = Str(d, "role");
            if (login.Length < 3 || pass.Length < 10 || !Roles.Contains(role)) return Results.BadRequest("Логін від 3 символів, пароль від 10, правильна роль");
            var id = s.Insert("INSERT INTO users(login,password_hash,role,active) VALUES(@l,@p,@r,1)", ("@l", login), ("@p", new PasswordHasher<string>().HashPassword(login, pass)), ("@r", role));
            return Results.Ok(new { id });
        }
        if (entity == "daily") return AddProgress(d, u, s);
        if (entity == "section_daily_hours") return SaveHours(d, u, s);
        if (entity == "user_sections")
        {
            var userId = Id(d, "user_id"); var sectionId = Id(d, "section_id");
            if (s.Scalar("SELECT COUNT(*) FROM users WHERE id=@id AND role='Master'", ("@id", userId)) == 0) return Results.BadRequest("Призначати дільниці можна лише майстрам");
            s.Exec("INSERT OR IGNORE INTO user_sections(user_id,section_id) VALUES(@u,@s)", ("@u", userId), ("@s", sectionId));
            return Results.Ok();
        }
        if (entity == "movements") return Results.BadRequest("Надходження оформлюється через /api/materials/{id}/receive");
        if (entity == "vehicles")
        {
            var number = Str(d, "number"); if (number.Length == 0) return Results.BadRequest("Вкажіть номер автомобіля");
            var id = s.Insert("INSERT INTO vehicles(contract_id,number,description) VALUES(@c,@n,@d)", ("@c", Id(d, "contract_id")), ("@n", number), ("@d", Str(d, "description")));
            return Results.Ok(new { id });
        }
        if (entity == "contract_works")
        {
            if (Id(d, "contract_id") <= 0 || Id(d, "section_id") <= 0 || Str(d, "name").Length == 0 || !ValidNonnegative(d, "norm_hours")) return Results.BadRequest("Потрібні контракт, дільниця, назва і коректна норма");
        }
        if (entity == "works") return Results.BadRequest("Роботи автомобілів формуються автоматично з contract_works");
        var cols = Schema.Fields[entity].Where(d.ContainsKey).ToArray();
        if (cols.Length == 0) return Results.BadRequest("Немає полів");
        var idNew = s.Insert($"INSERT INTO {entity} ({string.Join(',', cols)}) VALUES ({string.Join(',', cols.Select(k => "@" + k))})", cols.Select(k => ("@" + k, Val(d[k]))).ToArray());
        return Results.Ok(new { id = idNew });
    }
    catch (SqliteException ex) { return Results.BadRequest(ex.Message); }
});

app.MapPut("/api/{entity}/{id:long}", async (string entity, long id, HttpContext h, Store s) => {
    var u = Current(h, s); if (u is null) return Results.Unauthorized();
    if (!Schema.Tables.ContainsKey(entity)) return Results.NotFound();
    if (entity == "section_daily_hours")
    {
        if (u.Role == "Manager") return Results.StatusCode(403);
        var d = await Read(h); return SaveHours(d, u, s, id);
    }
    if (u.Role != "Admin") return Results.StatusCode(403);
    if (entity is "daily" or "movements" or "works" or "user_sections") return Results.BadRequest("Запис не редагується через цей маршрут");
    var data = await Read(h);
    try
    {
        if (entity == "users")
        {
            var changes = new List<string>(); var args = new List<(string, object?)>();
            foreach (var key in new[] { "role", "active" }) if (data.TryGetValue(key, out var value))
            {
                if (key == "role" && !Roles.Contains(value.ToString())) return Results.BadRequest("Невідома роль");
                changes.Add(key + "=@" + key); args.Add(("@" + key, Val(value)));
            }
            if (data.ContainsKey("password") && Str(data, "password") != "")
            {
                var pass = Str(data, "password"); if (pass.Length < 10) return Results.BadRequest("Пароль від 10 символів");
                var old = s.One("SELECT login FROM users WHERE id=@id", ("@id", id)); if (old is null) return Results.NotFound();
                changes.Add("password_hash=@pw"); args.Add(("@pw", new PasswordHasher<string>().HashPassword((string)old["login"]!, pass)));
            }
            if (changes.Count == 0) return Results.BadRequest("Немає полів");
            args.Add(("@id", id)); s.Exec($"UPDATE users SET {string.Join(',', changes)} WHERE id=@id", args.ToArray()); return Results.Ok();
        }
        if (entity == "vehicles" && data.ContainsKey("number") && Str(data, "number").Length == 0) return Results.BadRequest("Порожній номер");
        if (entity == "contract_works" && data.ContainsKey("norm_hours") && !ValidNonnegative(data, "norm_hours")) return Results.BadRequest("Некоректна норма");
        var cols = Schema.Fields[entity].Where(data.ContainsKey).ToArray(); if (cols.Length == 0) return Results.BadRequest("Немає полів");
        var args2 = cols.Select(k => ("@" + k, Val(data[k]))).Append(("@id", (object?)id)).ToArray();
        s.Exec($"UPDATE {entity} SET {string.Join(',', cols.Select(k => k + "=@" + k))} WHERE id=@id", args2);
        return Results.Ok();
    }
    catch (SqliteException ex) { return Results.BadRequest(ex.Message); }
});

app.MapDelete("/api/{entity}/{id:long}", (string entity, long id, HttpContext h, Store s) => {
    var u = Current(h, s); if (u is null) return Results.Unauthorized(); if (u.Role != "Admin") return Results.StatusCode(403);
    if (!Schema.Tables.ContainsKey(entity) || entity is "daily" or "movements" or "works" or "section_daily_hours") return Results.BadRequest("Історичні записи не видаляються");
    if (entity == "users" && u.Id == id) return Results.BadRequest("Не можна видалити власний акаунт");
    try { s.Exec($"DELETE FROM {entity} WHERE id=@id", ("@id", id)); return Results.Ok(); }
    catch (SqliteException ex) { return Results.BadRequest("Є пов'язані записи: " + ex.Message); }
});

app.MapGet("/api/auth/sections", (HttpContext h, Store s) => Current(h, s) is { } u ? Results.Ok(AllowedSections(u, s)) : Results.Unauthorized());
app.MapPut("/api/users/{id:long}/sections", async (long id, HttpContext h, Store s) => {
    var u = Current(h, s); if (u is null) return Results.Unauthorized(); if (u.Role != "Admin") return Results.StatusCode(403);
    var d = await Read(h);
    if (!d.TryGetValue("section_ids", out var arr) || arr.ValueKind != JsonValueKind.Array) return Results.BadRequest("Потрібен масив section_ids");
    var ids = new List<long>();
    foreach (var item in arr.EnumerateArray()) { if (!item.TryGetInt64(out var n) || n <= 0) return Results.BadRequest("Некоректний section_id"); ids.Add(n); }
    using var c = s.Open(); using var tx = c.BeginTransaction();
    if (Store.Scalar(c, tx, "SELECT COUNT(*) FROM users WHERE id=@id AND role='Master'", ("@id", id)) == 0) return Results.BadRequest("Користувач не є майстром");
    foreach (var sid in ids.Distinct()) if (Store.Scalar(c, tx, "SELECT COUNT(*) FROM sections WHERE id=@id", ("@id", sid)) == 0) return Results.BadRequest("Невідома дільниця: " + sid);
    Store.Execute(c, tx, "DELETE FROM user_sections WHERE user_id=@id", ("@id", id));
    foreach (var sid in ids.Distinct()) Store.Execute(c, tx, "INSERT INTO user_sections(user_id,section_id) VALUES(@u,@s)", ("@u", id), ("@s", sid));
    tx.Commit(); return Results.Ok(new { user_id = id, section_ids = ids.Distinct().ToArray() });
});

// Atomic creation of contract work templates. Vehicle work assignments are generated by the existing SQLite trigger.
app.MapPost("/api/contract-works/bulk", async (HttpContext h, Store s) => {
    var u = Current(h, s); if (u is null) return Results.Unauthorized();
    if (u.Role != "Admin") return Results.StatusCode(403);
    var d = await Read(h);
    var contract = Id(d, "contract_id"); var section = Id(d, "section_id");
    if (contract <= 0 || section <= 0 || !d.TryGetValue("works", out var arr) || arr.ValueKind != JsonValueKind.Array)
        return Results.BadRequest("Оберіть контракт, дільницю та перелік робіт");
    var raw = arr.EnumerateArray().ToArray();
    if (raw.Length == 0 || raw.Length > 1000) return Results.BadRequest("Можна додати від 1 до 1000 робіт за раз");
    var items = new List<(string Name, double Norm, string Description)>();
    foreach (var item in raw)
    {
        if (item.ValueKind != JsonValueKind.Object ||
            !item.TryGetProperty("name", out var nameVal) || nameVal.ValueKind != JsonValueKind.String ||
            !item.TryGetProperty("norm_hours", out var normVal) || normVal.ValueKind != JsonValueKind.Number ||
            !normVal.TryGetDouble(out var norm) || !double.IsFinite(norm) || norm < 0)
            return Results.BadRequest("Некоректна назва або норма роботи");
        var name = (nameVal.GetString() ?? "").Trim();
        var desc = item.TryGetProperty("description", out var dv) && dv.ValueKind == JsonValueKind.String ? (dv.GetString() ?? "").Trim() : "";
        if (name.Length == 0 || name.Length > 500 || desc.Length > 2000)
            return Results.BadRequest("Назва роботи: 1–500 символів, примітка: до 2000 символів");
        items.Add((name, norm, desc));
    }
    using var c = s.Open(); using var tx = c.BeginTransaction();
    if (Store.Scalar(c, tx, "SELECT COUNT(*) FROM contracts WHERE id=@id", ("@id", contract)) == 0 ||
        Store.Scalar(c, tx, "SELECT COUNT(*) FROM sections WHERE id=@id", ("@id", section)) == 0)
        return Results.BadRequest("Контракт або дільницю не знайдено");
    var added = new List<string>(); var skipped = new List<string>();
    var seen = new HashSet<string>(StringComparer.Ordinal);
    try
    {
        foreach (var item in items)
        {
            if (!seen.Add(item.Name) || Store.Scalar(c, tx,
                "SELECT COUNT(*) FROM contract_works WHERE contract_id=@c AND section_id=@s AND name=@n",
                ("@c", contract), ("@s", section), ("@n", item.Name)) > 0)
            {
                skipped.Add(item.Name); continue;
            }
            Store.Execute(c, tx,
                "INSERT INTO contract_works(contract_id,section_id,name,norm_hours,description) VALUES(@c,@s,@n,@h,@d)",
                ("@c", contract), ("@s", section), ("@n", item.Name), ("@h", item.Norm), ("@d", item.Description));
            added.Add(item.Name);
        }
        tx.Commit();
        return Results.Ok(new { added = added.Count, skipped = skipped.Count, addedNames = added, skippedNames = skipped });
    }
    catch (SqliteException ex) { return Results.BadRequest("Не вдалося додати роботи: " + ex.Message); }
});

// Bulk vehicle creation: duplicates are skipped, valid new vehicles are committed atomically.
app.MapPost("/api/vehicles/bulk", async (HttpContext h, Store s) => {
    var u = Current(h, s); if (u is null) return Results.Unauthorized();
    if (u.Role != "Admin") return Results.StatusCode(403);
    var d = await Read(h);
    var contractId = Id(d, "contract_id");
    if (contractId <= 0 || !d.TryGetValue("numbers", out var arr) || arr.ValueKind != JsonValueKind.Array)
        return Results.BadRequest("Вкажіть контракт і список номерів автомобілів");
    var raw = arr.EnumerateArray().ToArray();
    if (raw.Length == 0 || raw.Length > 1000 || raw.Any(x => x.ValueKind != JsonValueKind.String))
        return Results.BadRequest("Вкажіть від 1 до 1000 номерів автомобілів");
    var numbers = raw.Select(x => x.GetString()!.Trim()).ToArray();
    if (numbers.Any(x => x.Length == 0 || x.Length > 100))
        return Results.BadRequest("Номер автомобіля не може бути порожнім або довшим за 100 символів");
    using var c = s.Open(); using var tx = c.BeginTransaction();
    if (Store.Scalar(c, tx, "SELECT COUNT(*) FROM contracts WHERE id=@id", ("@id", contractId)) == 0)
        return Results.BadRequest("Контракт не знайдено");
    var added = new List<string>();
    var skipped = new List<string>();
    var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    try
    {
        foreach (var number in numbers)
        {
            if (!seen.Add(number) || Store.Scalar(c, tx, "SELECT COUNT(*) FROM vehicles WHERE number=@n COLLATE NOCASE", ("@n", number)) > 0)
            {
                skipped.Add(number); continue;
            }
            Store.Execute(c, tx, "INSERT INTO vehicles(contract_id,number,description) VALUES(@c,@n,'')", ("@c", contractId), ("@n", number));
            added.Add(number);
        }
        tx.Commit();
        return Results.Ok(new { added = added.Count, skipped = skipped.Count, addedNumbers = added, skippedNumbers = skipped });
    }
    catch (SqliteException ex) { return Results.BadRequest("Не вдалося додати автомобілі: " + ex.Message); }
});

app.MapPost("/api/materials/{id:long}/receive", async (long id, HttpContext h, Store s) => {
    var u = Current(h, s); if (u is null) return Results.Unauthorized(); if (u.Role != "Admin") return Results.StatusCode(403);
    var d = await Read(h); var qty = Num(d, "quantity"); if (!double.IsFinite(qty) || qty <= 0) return Results.BadRequest("Кількість має бути додатною");
    using var c = s.Open(); using var tx = c.BeginTransaction();
    if (Store.Scalar(c, tx, "SELECT COUNT(*) FROM materials WHERE id=@id", ("@id", id)) == 0) return Results.NotFound();
    Store.Execute(c, tx, "UPDATE materials SET balance=balance+@q WHERE id=@id", ("@q", qty), ("@id", id));
    Store.Execute(c, tx, "INSERT INTO movements(material_id,quantity,kind,created_at) VALUES(@id,@q,'Receipt',@dt)", ("@id", id), ("@q", qty), ("@dt", DateTime.UtcNow.ToString("O")));
    tx.Commit(); return Results.Ok();
});

app.MapGet("/api/report/summary", (HttpContext h, Store s) => Current(h, s) is null ? Results.Unauthorized() : Results.Ok(new
{
    contracts = s.Scalar("SELECT COUNT(*) FROM contracts"),
    vehicles = s.Scalar("SELECT COUNT(*) FROM vehicles"),
    works = s.Scalar("SELECT COUNT(*) FROM works"),
    completed = s.Scalar("SELECT COUNT(*) FROM works WHERE progress>=100"),
    todayHours = s.Number("SELECT COALESCE(SUM(hours),0) FROM section_daily_hours WHERE date=@d", ("@d", DateTime.Today.ToString("yyyy-MM-dd"))),
    totalHours = s.Number("SELECT COALESCE(SUM(hours),0) FROM section_daily_hours"),
    writtenOff = s.Scalar("SELECT COUNT(*) FROM movements WHERE kind='WriteOff'")
}));
app.MapGet("/api/report/contracts", (HttpContext h, Store s) => Current(h, s) is null ? Results.Unauthorized() : Results.Ok(s.All("""
 SELECT c.id,c.name,COUNT(w.id) AS works,COALESCE(SUM(cw.norm_hours),0) AS planned_norm_hours,
 COALESCE(SUM(cw.norm_hours*w.progress/100.0),0) AS completed_norm_hours,
 CASE WHEN SUM(cw.norm_hours)>0 THEN ROUND(100.0*SUM(cw.norm_hours*w.progress/100.0)/SUM(cw.norm_hours),1) ELSE 0 END AS progress
 FROM contracts c LEFT JOIN vehicles v ON v.contract_id=c.id LEFT JOIN works w ON w.vehicle_id=v.id
 LEFT JOIN contract_works cw ON cw.id=w.contract_work_id GROUP BY c.id ORDER BY c.id DESC
 """)));
app.MapGet("/api/report/materials", (HttpContext h, Store s) => Current(h, s) is null ? Results.Unauthorized() : Results.Ok(s.All("""
 SELECT m.name AS material,m.unit,mo.quantity,mo.created_at,c.name AS contract,v.number AS vehicle,se.name AS section,cw.name AS work
 FROM movements mo JOIN materials m ON m.id=mo.material_id LEFT JOIN works w ON w.id=mo.work_id
 LEFT JOIN contract_works cw ON cw.id=w.contract_work_id LEFT JOIN vehicles v ON v.id=w.vehicle_id
 LEFT JOIN contracts c ON c.id=v.contract_id LEFT JOIN sections se ON se.id=cw.section_id
 WHERE mo.kind='WriteOff' ORDER BY mo.id DESC
 """)));
app.MapGet("/api/report/daily", (HttpContext h, Store s) => Current(h, s) is null ? Results.Unauthorized() : Results.Ok(s.All("""
 SELECT d.id,d.date,d.percent,d.norm_hours,d.created_at,u.login AS author,c.name AS contract,v.number AS vehicle,se.name AS section,cw.name AS work
 FROM daily d JOIN works w ON w.id=d.work_id JOIN contract_works cw ON cw.id=w.contract_work_id
 JOIN vehicles v ON v.id=w.vehicle_id JOIN contracts c ON c.id=v.contract_id
 JOIN sections se ON se.id=cw.section_id JOIN users u ON u.id=d.user_id ORDER BY d.date DESC,d.id DESC
 """)));
app.MapGet("/api/report/hours", (HttpContext h, Store s) => Current(h, s) is null ? Results.Unauthorized() : Results.Ok(s.All("""
 SELECT dh.id,dh.date,dh.hours,c.name AS contract,se.name AS section,u.login AS author
 FROM section_daily_hours dh JOIN contracts c ON c.id=dh.contract_id JOIN sections se ON se.id=dh.section_id
 JOIN users u ON u.id=dh.user_id ORDER BY dh.date DESC,dh.id DESC
 """)));

// Atomic daily report: daily percentages and section hours are saved together.
app.MapPut("/api/section-report", async (HttpContext h, Store s) => {
    var u = Current(h, s); if (u is null) return Results.Unauthorized();
    if (u.Role == "Manager") return Results.StatusCode(403);
    var d = await Read(h);
    var contract = Id(d, "contract_id"); var section = Id(d, "section_id");
    var date = Str(d, "date"); var hours = Num(d, "hours");
    if (contract <= 0 || section <= 0 || !ValidDate(date) || !ValidNonnegative(d, "hours"))
        return Results.BadRequest("Вкажіть контракт, дільницю, дату та коректні людино-години");
    if (!d.TryGetValue("entries", out var entries) || entries.ValueKind != JsonValueKind.Array)
        return Results.BadRequest("Потрібен масив entries");
    var updates = new Dictionary<long, double>();
    foreach (var item in entries.EnumerateArray())
    {
        if (item.ValueKind != JsonValueKind.Object ||
            !item.TryGetProperty("work_id", out var wid) || !wid.TryGetInt64(out var workId) || workId <= 0 ||
            !item.TryGetProperty("percent", out var pct) || !pct.TryGetDouble(out var value) ||
            !double.IsFinite(value) || value < 0 || value > 100 || !updates.TryAdd(workId, value))
            return Results.BadRequest("Некоректні або повторені роботи в матриці");
    }
    using var c = s.Open(); using var tx = c.BeginTransaction();
    if (!CanEdit(u, section, c, tx)) return Results.StatusCode(403);
    if (Store.Scalar(c, tx, "SELECT COUNT(*) FROM contracts WHERE id=@id", ("@id", contract)) == 0 ||
        Store.Scalar(c, tx, "SELECT COUNT(*) FROM sections WHERE id=@id", ("@id", section)) == 0)
        return Results.BadRequest("Контракт або дільниця не існує");
    var allWorks = Store.Rows(c, tx, """
        SELECT w.id,w.progress,cw.norm_hours FROM works w
        JOIN vehicles v ON v.id=w.vehicle_id
        JOIN contract_works cw ON cw.id=w.contract_work_id
        WHERE v.contract_id=@c AND cw.contract_id=@c AND cw.section_id=@s
        """, ("@c", contract), ("@s", section));
    var oldRows = Store.Rows(c, tx, """
        SELECT d.work_id,COALESCE(SUM(d.percent),0) AS percent FROM daily d
        JOIN works w ON w.id=d.work_id JOIN vehicles v ON v.id=w.vehicle_id
        JOIN contract_works cw ON cw.id=w.contract_work_id
        WHERE v.contract_id=@c AND cw.section_id=@s AND d.date=@d
        GROUP BY d.work_id
        """, ("@c", contract), ("@s", section), ("@d", date));
    var old = oldRows.ToDictionary(x => Convert.ToInt64(x["work_id"]), x => Convert.ToDouble(x["percent"]));
    var valid = allWorks.ToDictionary(x => Convert.ToInt64(x["id"]));
    if (updates.Keys.Any(id => !valid.ContainsKey(id))) return Results.BadRequest("Робота не належить контракту або дільниці");
    // Entries are a complete daily snapshot, including zeros. Missing work IDs are not modified.
    foreach (var (id, value) in updates)
    {
        var w = valid[id];
        var previous = old.GetValueOrDefault(id);
        var current = Convert.ToDouble(w["progress"]);
        var next = current - previous + value;
        if (next < -0.000001 || next > 100.000001)
            return Results.BadRequest($"Робота #{id}: загальний прогрес має бути від 0 до 100%");
        // Completed work has material write-offs; reversing it needs a separate audited operation.
        if (current >= 99.999999 && next < 99.999999)
            return Results.BadRequest($"Робота #{id} завершена: зменшення потребує окремого коригування списання ТМЦ");
        if (current < 99.999999 && next >= 99.999999)
        {
            var materials = Store.Rows(c, tx, "SELECT wm.material_id,wm.quantity,m.balance FROM work_materials wm JOIN materials m ON m.id=wm.material_id WHERE wm.work_id=@w", ("@w", id));
            foreach (var m in materials)
                if (Convert.ToDouble(m["balance"]) + 1e-8 < Convert.ToDouble(m["quantity"]))
                    return Results.BadRequest("Недостатньо матеріалу #" + m["material_id"]);
            foreach (var m in materials)
            {
                Store.Execute(c, tx, "UPDATE materials SET balance=balance-@q WHERE id=@id", ("@q", m["quantity"]), ("@id", m["material_id"]));
                Store.Execute(c, tx, "INSERT INTO movements(material_id,work_id,quantity,kind,created_at) VALUES(@m,@w,@q,'WriteOff',@dt)", ("@m", m["material_id"]), ("@w", id), ("@q", m["quantity"]), ("@dt", DateTime.UtcNow.ToString("O")));
            }
        }
        Store.Execute(c, tx, "DELETE FROM daily WHERE work_id=@w AND date=@d", ("@w", id), ("@d", date));
        if (value > 0) Store.Execute(c, tx,
            "INSERT INTO daily(work_id,user_id,date,percent,norm_hours,created_at) VALUES(@w,@u,@d,@p,@n,@t)",
            ("@w", id), ("@u", u.Id), ("@d", date), ("@p", value), ("@n", Convert.ToDouble(w["norm_hours"]) * value / 100), ("@t", DateTime.UtcNow.ToString("O")));
        Store.Execute(c, tx, "UPDATE works SET progress=@p WHERE id=@id", ("@p", Math.Clamp(next, 0, 100)), ("@id", id));
    }
    Store.Execute(c, tx, """
        INSERT INTO section_daily_hours(contract_id,section_id,date,hours,user_id,updated_at)
        VALUES(@c,@s,@d,@h,@u,@t)
        ON CONFLICT(contract_id,section_id,date) DO UPDATE SET
        hours=excluded.hours,user_id=excluded.user_id,updated_at=excluded.updated_at
        """, ("@c", contract), ("@s", section), ("@d", date), ("@h", hours), ("@u", u.Id), ("@t", DateTime.UtcNow.ToString("O")));
    tx.Commit();
    return Results.Ok(new { saved = true, entries = updates.Count });
});

app.Run();

static IResult AddProgress(Dictionary<string, JsonElement> d, User u, Store s)
{
    var id = Id(d, "work_id"); var percent = Num(d, "percent"); var date = Str(d, "date");
    if (id <= 0 || !double.IsFinite(percent) || percent <= 0 || percent > 100 || !ValidDate(date)) return Results.BadRequest("Потрібні робота, дата та приріст відсотка більше 0");
    using var c = s.Open(); using var tx = c.BeginTransaction();
    var w = Store.Row(c, tx, """
       SELECT w.progress,cw.norm_hours,cw.section_id FROM works w JOIN contract_works cw ON cw.id=w.contract_work_id WHERE w.id=@id
       """, ("@id", id));
    if (w is null) return Results.NotFound();
    if (!CanEdit(u, Convert.ToInt64(w["section_id"]), c, tx)) return Results.StatusCode(403);
    var old = Convert.ToDouble(w["progress"]); if (old + percent > 100.0000001) return Results.BadRequest("Виконання перевищує 100%");
    var complete = old + percent >= 99.999999;
    if (complete)
    {
        var materials = Store.Rows(c, tx, "SELECT wm.material_id,wm.quantity,m.balance FROM work_materials wm JOIN materials m ON m.id=wm.material_id WHERE wm.work_id=@w", ("@w", id));
        foreach (var m in materials) if (Convert.ToDouble(m["balance"]) + 1e-8 < Convert.ToDouble(m["quantity"])) return Results.BadRequest("Недостатньо матеріалу #" + m["material_id"]);
        foreach (var m in materials)
        {
            Store.Execute(c, tx, "UPDATE materials SET balance=balance-@q WHERE id=@id", ("@q", m["quantity"]), ("@id", m["material_id"]));
            Store.Execute(c, tx, "INSERT INTO movements(material_id,work_id,quantity,kind,created_at) VALUES(@m,@w,@q,'WriteOff',@dt)", ("@m", m["material_id"]), ("@w", id), ("@q", m["quantity"]), ("@dt", DateTime.UtcNow.ToString("O")));
        }
    }
    Store.Execute(c, tx, "INSERT INTO daily(work_id,user_id,date,percent,norm_hours,created_at) VALUES(@w,@u,@d,@p,@n,@dt)", ("@w", id), ("@u", u.Id), ("@d", date), ("@p", percent), ("@n", Convert.ToDouble(w["norm_hours"]) * percent / 100), ("@dt", DateTime.UtcNow.ToString("O")));
    Store.Execute(c, tx, "UPDATE works SET progress=MIN(100,progress+@p) WHERE id=@w", ("@p", percent), ("@w", id));
    tx.Commit(); return Results.Ok(new { progress = Math.Min(100, old + percent), completed = complete, materialsWrittenOff = complete });
}
static IResult SaveHours(Dictionary<string, JsonElement> d, User u, Store s, long? editId = null)
{
    var contract = Id(d, "contract_id"); var section = Id(d, "section_id"); var date = Str(d, "date"); var hours = Num(d, "hours");
    if (contract <= 0 || section <= 0 || !ValidDate(date) || !ValidNonnegative(d, "hours")) return Results.BadRequest("Потрібні контракт, дільниця, дата та невід'ємні години");
    using var c = s.Open(); using var tx = c.BeginTransaction();
    if (!CanEdit(u, section, c, tx)) return Results.StatusCode(403);
    if (Store.Scalar(c, tx, "SELECT COUNT(*) FROM contracts WHERE id=@id", ("@id", contract)) == 0 || Store.Scalar(c, tx, "SELECT COUNT(*) FROM sections WHERE id=@id", ("@id", section)) == 0) return Results.BadRequest("Контракт або дільниця не існує");
    try
    {
        if (editId is null)
        {
            Store.Execute(c, tx, "INSERT INTO section_daily_hours(contract_id,section_id,date,hours,user_id,updated_at) VALUES(@c,@s,@d,@h,@u,@t) ON CONFLICT(contract_id,section_id,date) DO UPDATE SET hours=excluded.hours,user_id=excluded.user_id,updated_at=excluded.updated_at", ("@c", contract), ("@s", section), ("@d", date), ("@h", hours), ("@u", u.Id), ("@t", DateTime.UtcNow.ToString("O")));
        }
        else
        {
            var old = Store.Row(c, tx, "SELECT section_id FROM section_daily_hours WHERE id=@id", ("@id", editId.Value)); if (old is null) return Results.NotFound();
            if (!CanEdit(u, Convert.ToInt64(old["section_id"]), c, tx)) return Results.StatusCode(403);
            Store.Execute(c, tx, "UPDATE section_daily_hours SET contract_id=@c,section_id=@s,date=@d,hours=@h,user_id=@u,updated_at=@t WHERE id=@id", ("@c", contract), ("@s", section), ("@d", date), ("@h", hours), ("@u", u.Id), ("@t", DateTime.UtcNow.ToString("O")), ("@id", editId.Value));
        }
        tx.Commit(); return Results.Ok();
    }
    catch (SqliteException ex) { return Results.BadRequest(ex.Message); }
}
static bool CanEdit(User u, long section, SqliteConnection c, SqliteTransaction tx) => u.Role == "Admin" || u.Role == "Master" && Store.Scalar(c, tx, "SELECT COUNT(*) FROM user_sections WHERE user_id=@u AND section_id=@s", ("@u", u.Id), ("@s", section)) > 0;
static long[] AllowedSections(User u, Store s) => u.Role == "Admin" ? s.All("SELECT id FROM sections").Select(r => Convert.ToInt64(r["id"])).ToArray() : u.Role == "Master" ? s.All("SELECT section_id FROM user_sections WHERE user_id=@id", ("@id", u.Id)).Select(r => Convert.ToInt64(r["section_id"])).ToArray() : [];
static string? Token(HttpContext h) { var auth = h.Request.Headers.Authorization.ToString(); return auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? auth[7..] : null; }
static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
static User? Current(HttpContext h, Store s) { var t = Token(h); if (t is null) return null; var row = s.One("SELECT u.id,u.login,u.role FROM sessions se JOIN users u ON u.id=se.user_id WHERE se.token_hash=@t AND se.expires_at>@now AND u.active=1", ("@t", Hash(t)), ("@now", DateTimeOffset.UtcNow.ToUnixTimeSeconds())); return row is null ? null : new User(Convert.ToInt64(row["id"]), (string)row["login"]!, (string)row["role"]!); }
static async Task<Dictionary<string, JsonElement>> Read(HttpContext h) => await JsonSerializer.DeserializeAsync<Dictionary<string, JsonElement>>(h.Request.Body) ?? new();
static string Str(Dictionary<string, JsonElement> d, string key) => d.TryGetValue(key, out var e) ? e.ToString().Trim() : "";
static double Num(Dictionary<string, JsonElement> d, string key) => d.TryGetValue(key, out var e) && double.TryParse(e.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var n) ? n : double.NaN;
static long Id(Dictionary<string, JsonElement> d, string key) => long.TryParse(Str(d, key), out var n) ? n : 0;
static bool ValidNonnegative(Dictionary<string, JsonElement> d, string key) => d.ContainsKey(key) && double.IsFinite(Num(d, key)) && Num(d, key) >= 0;
static bool ValidDate(string value) => DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
static object? Val(JsonElement e) => e.ValueKind switch { JsonValueKind.Number => e.GetDouble(), JsonValueKind.True => 1, JsonValueKind.False => 0, JsonValueKind.Null => DBNull.Value, _ => e.ToString().Trim() };
