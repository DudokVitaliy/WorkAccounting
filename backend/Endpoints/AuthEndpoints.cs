using Microsoft.AspNetCore.Identity;
using System.Security.Cryptography;
using System.Text.Json;
using static ApiSupport;

internal static class AuthEndpoints
{
    internal static void MapAuthEndpoints(this WebApplication app)
    {
    app.MapPost("/api/auth/login", (LoginRequest req, Store s) => {
        var login = req.Login?.Trim() ?? "";
        var user = s.One("SELECT id,login,role,password_hash,active FROM users WHERE login=@login", ("@login", login));
        if (user is null || Convert.ToInt64(user["active"]) != 1 || new PasswordHasher<string>().VerifyHashedPassword(login, (string)user["password_hash"]!, req.Password ?? "") == PasswordVerificationResult.Failed) return Results.Unauthorized();
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        s.Exec("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(@t,@u,@e)", ("@t", Hash(token)), ("@u", user["id"]), ("@e", DateTimeOffset.UtcNow.AddHours(12).ToUnixTimeSeconds()));
        return Results.Ok(new { token, login = user["login"], role = user["role"] });
    }).RequireRateLimiting("login");
    app.MapGet("/api/auth/me", (HttpContext h, Store s) => Current(h, s) is { } u ? Results.Ok(new { u.Id, u.Login, u.Role, sections = AllowedSections(u, s) }) : Results.Unauthorized());
    app.MapPost("/api/auth/logout", (HttpContext h, Store s) => { var t = Token(h); if (t is not null) s.Exec("DELETE FROM sessions WHERE token_hash=@t", ("@t", Hash(t))); return Results.Ok(); });
    
    
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
    }
}
