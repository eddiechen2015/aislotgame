using System.Security.Cryptography;
using System.Text;
using Gms.Application.Abstractions;
using Gms.Infrastructure.Options;
using Microsoft.Extensions.Options;

namespace Gms.Api.Middleware;

public sealed class OperatorAuthMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<OperatorAuthMiddleware> _logger;

    public OperatorAuthMiddleware(RequestDelegate next, ILogger<OperatorAuthMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(
        HttpContext context,
        IOperatorRepository operators,
        IOperatorContext operatorContext,
        IOptions<GmsOptions> options)
    {
        var path = context.Request.Path.Value ?? "";
        if (path.StartsWith("/api/v1/internal", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/health", StringComparison.OrdinalIgnoreCase))
        {
            await _next(context);
            return;
        }

        if (!path.StartsWith("/api/v1", StringComparison.OrdinalIgnoreCase))
        {
            await _next(context);
            return;
        }

        var auth = context.Request.Headers.Authorization.ToString();
        if (!auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            await WriteUnauthorized(context);
            return;
        }

        var apiKey = auth["Bearer ".Length..].Trim();
        var op = await operators.GetByApiKeyAsync(apiKey);
        if (op is null)
        {
            await WriteUnauthorized(context);
            return;
        }

        var opts = options.Value;
        if (!opts.SkipSignatureValidation)
        {
            if (!ValidateSignature(context, op.ApiSecret))
            {
                _logger.LogWarning("Invalid signature for operator {OperatorId}", op.Id);
                await WriteUnauthorized(context);
                return;
            }
        }

        operatorContext.SetOperator(op);
        await _next(context);
    }

    private static bool ValidateSignature(HttpContext context, string secret)
    {
        var timestamp = context.Request.Headers["X-GMS-Timestamp"].ToString();
        var signature = context.Request.Headers["X-GMS-Signature"].ToString();
        if (string.IsNullOrWhiteSpace(timestamp) || string.IsNullOrWhiteSpace(signature))
            return false;

        if (!DateTime.TryParse(timestamp, null, System.Globalization.DateTimeStyles.AdjustToUniversal, out var ts))
            return false;

        if (Math.Abs((DateTime.UtcNow - ts).TotalMinutes) > 5)
            return false;

        context.Request.EnableBuffering();
        using var reader = new StreamReader(context.Request.Body, Encoding.UTF8, leaveOpen: true);
        var body = reader.ReadToEndAsync().GetAwaiter().GetResult();
        context.Request.Body.Position = 0;

        var payload = $"{context.Request.Method}{context.Request.Path}{timestamp}{body}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var expected = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();
        return string.Equals(expected, signature, StringComparison.OrdinalIgnoreCase);
    }

    private static Task WriteUnauthorized(HttpContext context)
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return context.Response.WriteAsJsonAsync(new
        {
            success = false,
            error = new { code = "unauthorized", message = "Invalid or missing operator credentials." },
            requestId = context.TraceIdentifier
        });
    }
}
