using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using static ApiSupport;

internal static class EntityEndpoints
{
    internal static void MapEntityEndpoints(this WebApplication app)
    {
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
    }
}
