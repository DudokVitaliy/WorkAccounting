using System.Text.Json;
using static ApiSupport;

internal static class ProgressEndpoints
{
    internal static void MapProgressEndpoints(this WebApplication app)
    {
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
    }
}
