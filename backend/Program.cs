// WorkAccounting application entry point: dependency registration and endpoint composition.
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
var dbPath = Path.Combine(builder.Environment.ContentRootPath, "workaccounting_v2.db");
builder.Services.AddSingleton(new Store($"Data Source={dbPath};Foreign Keys=True;Default Timeout=15"));
builder.Services.AddCors(o => o.AddPolicy("local", p => p.WithOrigins("http://localhost:5173", "http://127.0.0.1:5173").AllowAnyHeader().AllowAnyMethod()));
// Limit online password guessing without altering which records an authenticated master may read.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("login", http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 8,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        }));
});
var app = builder.Build();
app.UseCors("local");
app.UseRateLimiter();
var store = app.Services.GetRequiredService<Store>();
store.Init();
var bootstrap = Environment.GetEnvironmentVariable("WORK_ADMIN_PASSWORD");
if (!string.IsNullOrWhiteSpace(bootstrap)) store.SeedAdmin(bootstrap);

app.MapGet("/api/health", () => Results.Ok(new { status = "ok", version = 2 }));

app.MapAuthEndpoints();
app.MapEntityEndpoints();
app.MapBulkEndpoints();
app.MapInventoryEndpoints();
app.MapReportEndpoints();
app.MapProgressEndpoints();

app.Run();
