using static ApiSupport;

internal static class ReportEndpoints
{
    internal static void MapReportEndpoints(this WebApplication app)
    {
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
    }
}
