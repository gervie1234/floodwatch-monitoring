using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(builder.Configuration["FLOODWATCH_URL"] ?? "http://127.0.0.1:5086");
builder.Services.AddSingleton<Store>();
var app = builder.Build();
app.Use(async (ctx, next) => {
    if (ctx.Request.Path.StartsWithSegments("/api/settings") && ctx.Request.Method == "PUT" &&
        (ctx.Connection.RemoteIpAddress is not { } ip || !IPAddress.IsLoopback(ip))) {
        ctx.Response.StatusCode = 403; return;
    }
    await next();
});
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", service = "FloodWatch API" }));
app.MapGet("/api/settings", (Store s) => s.Settings);
app.MapPut("/api/settings", (Settings settings, Store s) => {
    if (string.IsNullOrWhiteSpace(settings.Name) || settings.Name.Length > 80 ||
        !double.IsFinite(settings.HeightCm) || !double.IsFinite(settings.AdvisoryCm) ||
        !double.IsFinite(settings.WarningCm) || !double.IsFinite(settings.CriticalCm) ||
        settings.HeightCm < 40 || settings.HeightCm > 600 || settings.AdvisoryCm < 0 ||
        settings.AdvisoryCm >= settings.WarningCm || settings.WarningCm >= settings.CriticalCm ||
        settings.CriticalCm > settings.HeightCm - 30)
        return Results.BadRequest(new { message = "Use increasing thresholds below the sensor's 30 cm clearance. Height must be 40-600 cm." });
    s.SaveSettings(settings);
    return Results.Ok(settings);
});
app.MapGet("/api/readings", (bool? demo, Store s) => demo == true ? Demo.Readings(s.Settings) : s.Readings());
app.MapPost("/api/readings", (Telemetry input, HttpContext ctx, Store s, IConfiguration config) => {
    var expected = config["DEVICE_API_KEY"];
    if (string.IsNullOrWhiteSpace(expected)) return Results.Problem("Device ingestion is disabled. Configure DEVICE_API_KEY on the API server.", statusCode:503);
    var supplied = ctx.Request.Headers["X-Device-Key"].ToString();
    if (!CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(expected)), SHA256.HashData(Encoding.UTF8.GetBytes(supplied)) )) return Results.Unauthorized();
    if (input.DeviceId != "FW-001" || string.IsNullOrWhiteSpace(input.BootId) || input.BootId.Length > 80 || input.Sequence < 0 ||
        !double.IsFinite(input.DistanceCm) || input.DistanceCm < 30 || input.DistanceCm > s.Settings.HeightCm ||
        input.ObservedAtUtc > DateTimeOffset.UtcNow.AddMinutes(1) || input.ObservedAtUtc < DateTimeOffset.UtcNow.AddDays(-7) ||
        (input.Latitude.HasValue != input.Longitude.HasValue) ||
        (input.Latitude is double lat && (!double.IsFinite(lat) || lat < -90 || lat > 90)) ||
        (input.Longitude is double lon && (!double.IsFinite(lon) || lon < -180 || lon > 180)))
        return Results.BadRequest(new { message = "Invalid station, timestamp, distance, sequence or coordinates. Use nullable coordinates when GPS has no fix." });
    var reading = new Reading(input.DeviceId, input.BootId, input.Sequence, input.ObservedAtUtc, DateTimeOffset.UtcNow,
        input.DistanceCm, Math.Round(s.Settings.HeightCm-input.DistanceCm, 2), input.Latitude, input.Longitude);
    return s.Add(reading) ? Results.Created("/api/readings", reading) : Results.Ok(new { duplicate = true });
});
app.Run();

record Settings(string Name = "Monitoring station 01", double HeightCm = 150, double AdvisoryCm = 30, double WarningCm = 50, double CriticalCm = 70);
record Telemetry(string DeviceId, string BootId, long Sequence, DateTimeOffset ObservedAtUtc, double DistanceCm, double? Latitude, double? Longitude);
record Reading(string DeviceId, string BootId, long Sequence, DateTimeOffset ObservedAtUtc, DateTimeOffset ReceivedAtUtc, double DistanceCm, double LevelCm, double? Latitude, double? Longitude);
class Store {
    private readonly object gate = new();
    private readonly string dir;
    private List<Reading> data = [];
    public Settings Settings { get; private set; } = new();
    public Store(IWebHostEnvironment env) {
        dir = Path.Combine(env.ContentRootPath,"Data"); Directory.CreateDirectory(dir);
        var rp=Path.Combine(dir,"readings.json"); var sp=Path.Combine(dir,"settings.json");
        if(File.Exists(rp)) data=JsonSerializer.Deserialize<List<Reading>>(File.ReadAllText(rp)) ?? [];
        if(File.Exists(sp)) Settings=JsonSerializer.Deserialize<Settings>(File.ReadAllText(sp)) ?? new();
    }
    public Reading[] Readings() { lock(gate) return data.OrderBy(x=>x.ObservedAtUtc).ToArray(); }
    public bool Add(Reading reading) { lock(gate) {
        if(data.Any(x=>x.DeviceId==reading.DeviceId && x.BootId==reading.BootId && x.Sequence==reading.Sequence)) return false;
        var updated=data.Append(reading).OrderBy(x=>x.ObservedAtUtc).TakeLast(10000).ToList();
        Write("readings.json",updated); data=updated; return true;
    }}
    public void SaveSettings(Settings settings) { lock(gate) { Write("settings.json",settings); Settings=settings; } }
    private void Write<T>(string name,T value) { var path=Path.Combine(dir,name); File.WriteAllText(path+".tmp",JsonSerializer.Serialize(value)); File.Move(path+".tmp",path,true); }
}
static class Demo {
    public static Reading[] Readings(Settings s) {
        var now=DateTimeOffset.UtcNow;
        return Enumerable.Range(0,145).Select(i=> {
            var level=Math.Round(19+9*Math.Sin(i/22.0)+3*Math.Sin(i/6.0)+i*.12,1);
            level=Math.Clamp(level,0,s.HeightCm-30);
            var time=now.AddMinutes((i-144)*10);
            return new Reading("FW-001","demo",i,time,time,s.HeightCm-level,level,14.5995,120.9842);
        }).ToArray();
    }
}
