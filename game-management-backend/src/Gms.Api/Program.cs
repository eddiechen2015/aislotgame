using Gms.Api.Middleware;
using Gms.Application;
using Gms.Infrastructure;
using Gms.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<GmsDbContext>();
    await SeedData.InitializeAsync(db);
}

app.UseMiddleware<ExceptionMiddleware>();
app.UseMiddleware<InternalApiAuthMiddleware>();
app.UseMiddleware<OperatorAuthMiddleware>();

app.MapControllers();

app.Run();

public partial class Program;
