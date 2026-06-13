using System.Globalization;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using SeamlessDemo.Models;

namespace SeamlessDemo.Services;

/// <summary>
/// S2S API client for calling GMS backend with HMAC-signed operator auth.
/// </summary>
public sealed class GmsApiClient
{
    private readonly HttpClient _http;
    private readonly SeamlessDemoOptions _opts;
    private readonly ILogger<GmsApiClient> _logger;

    public GmsApiClient(HttpClient http, IOptions<SeamlessDemoOptions> opts, ILogger<GmsApiClient> logger)
    {
        _http = http;
        _opts = opts.Value;
        _logger = logger;
        _http.BaseAddress = new Uri(_opts.GmsBaseUrl.TrimEnd('/'));
    }

    public async Task<GmsPlayerLoginResponse> LoginPlayerAsync(string operatorPlayerId, string currency, string? displayName, CancellationToken ct = default)
    {
        var body = new GmsPlayerLoginRequest
        {
            OperatorPlayerId = operatorPlayerId,
            Currency = currency,
            DisplayName = displayName
        };

        var response = await SendSignedAsync<GmsApiResponse<GmsPlayerLoginResponse>>(
            HttpMethod.Post, "/api/v1/players/login", body, ct);

        if (response?.Success != true || response.Data is null)
            throw new InvalidOperationException($"GMS login failed: {response?.Error?.Message ?? "unknown error"}");

        return response.Data;
    }

    public async Task<GmsGameListData> GetGamesAsync(string? category = null, int page = 1, int pageSize = 50, CancellationToken ct = default)
    {
        var query = $"?page={page}&pageSize={pageSize}";
        if (!string.IsNullOrWhiteSpace(category))
            query += $"&category={Uri.EscapeDataString(category)}";

        var response = await SendSignedAsync<GmsApiResponse<GmsGameListData>>(
            HttpMethod.Get, $"/api/v1/games{query}", null, ct);

        if (response?.Success != true || response.Data is null)
            throw new InvalidOperationException($"GMS get games failed: {response?.Error?.Message ?? "unknown error"}");

        return response.Data;
    }

    public async Task<GmsGameLaunchData> LaunchGameAsync(string gameId, string sessionId, string? lobbyUrl = null, CancellationToken ct = default)
    {
        var body = new GmsGameLaunchRequest
        {
            GameId = gameId,
            SessionId = sessionId,
            LobbyUrl = lobbyUrl,
            ReturnUrl = lobbyUrl
        };

        var response = await SendSignedAsync<GmsApiResponse<GmsGameLaunchData>>(
            HttpMethod.Post, "/api/v1/games/launch", body, ct);

        if (response?.Success != true || response.Data is null)
            throw new InvalidOperationException($"GMS launch failed: {response?.Error?.Message ?? "unknown error"}");

        return response.Data;
    }

    private async Task<T?> SendSignedAsync<T>(HttpMethod method, string path, object? body, CancellationToken ct)
    {
        var timestamp = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);
        var json = body is not null ? JsonSerializer.Serialize(body) : "";

        using var request = new HttpRequestMessage(method, path);
        request.Headers.Add("Authorization", $"Bearer {_opts.ApiKey}");
        request.Headers.Add("X-GMS-Timestamp", timestamp);

        if (!string.IsNullOrEmpty(_opts.ApiSecret))
        {
            var signaturePayload = $"{method.Method}{path.Split('?')[0]}{timestamp}{json}";
            var signature = ComputeHmac(_opts.ApiSecret, signaturePayload);
            request.Headers.Add("X-GMS-Signature", signature);
        }

        if (body is not null)
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");

        _logger.LogInformation("GMS API: {Method} {Path}", method, path);

        using var response = await _http.SendAsync(request, ct);
        var responseBody = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("GMS API error: {StatusCode} {Body}", response.StatusCode, responseBody);
        }

        return JsonSerializer.Deserialize<T>(responseBody);
    }

    private static string ComputeHmac(string secret, string payload)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        return Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();
    }
}
