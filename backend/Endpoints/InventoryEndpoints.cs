using static ApiSupport;

internal static class InventoryEndpoints
{
    internal static void MapInventoryEndpoints(this WebApplication app)
    {
    app.MapPost("/api/materials/{id:long}/receive", async (long id, HttpContext h, Store s) => {
        var u = Current(h, s); if (u is null) return Results.Unauthorized(); if (u.Role != "Admin") return Results.StatusCode(403);
        var d = await Read(h); var qty = Num(d, "quantity"); if (!double.IsFinite(qty) || qty <= 0) return Results.BadRequest("Кількість має бути додатною");
        using var c = s.Open(); using var tx = c.BeginTransaction();
        if (Store.Scalar(c, tx, "SELECT COUNT(*) FROM materials WHERE id=@id", ("@id", id)) == 0) return Results.NotFound();
        Store.Execute(c, tx, "UPDATE materials SET balance=balance+@q WHERE id=@id", ("@q", qty), ("@id", id));
        Store.Execute(c, tx, "INSERT INTO movements(material_id,quantity,kind,created_at) VALUES(@id,@q,'Receipt',@dt)", ("@id", id), ("@q", qty), ("@dt", DateTime.UtcNow.ToString("O")));
        tx.Commit(); return Results.Ok();
    });
    }
}
