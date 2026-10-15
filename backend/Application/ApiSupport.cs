using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;

internal static class ApiSupport
{
    internal static IResult AddProgress(Dictionary<string, JsonElement> d, User u, Store s)
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
    internal static IResult SaveHours(Dictionary<string, JsonElement> d, User u, Store s, long? editId = null)
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
    internal static bool CanEdit(User u, long section, SqliteConnection c, SqliteTransaction tx) => u.Role == "Admin" || u.Role == "Master" && Store.Scalar(c, tx, "SELECT COUNT(*) FROM user_sections WHERE user_id=@u AND section_id=@s", ("@u", u.Id), ("@s", section)) > 0;
    internal static long[] AllowedSections(User u, Store s) => u.Role == "Admin" ? s.All("SELECT id FROM sections").Select(r => Convert.ToInt64(r["id"])).ToArray() : u.Role == "Master" ? s.All("SELECT section_id FROM user_sections WHERE user_id=@id", ("@id", u.Id)).Select(r => Convert.ToInt64(r["section_id"])).ToArray() : [];
    internal static string? Token(HttpContext h) { var auth = h.Request.Headers.Authorization.ToString(); return auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? auth[7..] : null; }
    internal static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    internal static User? Current(HttpContext h, Store s) { var t = Token(h); if (t is null) return null; var row = s.One("SELECT u.id,u.login,u.role FROM sessions se JOIN users u ON u.id=se.user_id WHERE se.token_hash=@t AND se.expires_at>@now AND u.active=1", ("@t", Hash(t)), ("@now", DateTimeOffset.UtcNow.ToUnixTimeSeconds())); return row is null ? null : new User(Convert.ToInt64(row["id"]), (string)row["login"]!, (string)row["role"]!); }
    internal static async Task<Dictionary<string, JsonElement>> Read(HttpContext h) => await JsonSerializer.DeserializeAsync<Dictionary<string, JsonElement>>(h.Request.Body) ?? new();
    internal static string Str(Dictionary<string, JsonElement> d, string key) => d.TryGetValue(key, out var e) ? e.ToString().Trim() : "";
    internal static double Num(Dictionary<string, JsonElement> d, string key) => d.TryGetValue(key, out var e) && double.TryParse(e.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var n) ? n : double.NaN;
    internal static long Id(Dictionary<string, JsonElement> d, string key) => long.TryParse(Str(d, key), out var n) ? n : 0;
    internal static bool ValidNonnegative(Dictionary<string, JsonElement> d, string key) => d.ContainsKey(key) && double.IsFinite(Num(d, key)) && Num(d, key) >= 0;
    internal static bool ValidDate(string value) => DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
    internal static object? Val(JsonElement e) => e.ValueKind switch { JsonValueKind.Number => e.GetDouble(), JsonValueKind.True => 1, JsonValueKind.False => 0, JsonValueKind.Null => DBNull.Value, _ => e.ToString().Trim() };
}
