using Gms.Infrastructure.Options;
using Microsoft.Extensions.Options;

namespace Gms.Api.Middleware;

public sealed class InternalApiAuthMiddleware
{
    private readonly RequestDelegate _next;

    public InternalApiAuthMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context, IOptions<GmsOptions> options)
    {
        var path = context.Request.Path.Value ?? "";
        if (!path.StartsWith("/api/v1/internal", StringComparison.OrdinalIgnoreCase))
        {
            await _next(context);
            return;
        }

        var key = context.Request.Headers["X-Internal-Api-Key"].ToString();
        if (!string.Equals(key, options.Value.InternalApiKey, StringComparison.Ordinal))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new
            {
                success = false,
                error = new { code = "unauthorized", message = "Invalid internal API key." }
            });
            return;
        }

        await _next(context);
    }
}
