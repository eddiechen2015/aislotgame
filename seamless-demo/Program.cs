using SeamlessDemo.Models;
using SeamlessDemo.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<SeamlessDemoOptions>(
    builder.Configuration.GetSection("SeamlessDemo"));

builder.Services.AddSingleton<WalletStore>();
builder.Services.AddHttpClient<GmsApiClient>();
builder.Services.AddControllers();

var app = builder.Build();

app.UseStaticFiles();
app.MapControllers();

// 根路径重定向到登录页
app.MapGet("/", () => Results.Redirect("/index.html"));

var url = app.Configuration["ASPNETCORE_URLS"]
    ?? app.Configuration["urls"]
    ?? "http://localhost:9090";

app.Logger.LogInformation("=== Seamless Demo Operator Website ===");
app.Logger.LogInformation("Login page:   {Url}", url);
app.Logger.LogInformation("Wallet callbacks: POST {Url}/wallet/debit|credit|rollback", url);

app.Run();
