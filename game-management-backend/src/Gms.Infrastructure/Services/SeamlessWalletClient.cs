using System.Globalization;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Gms.Application.Abstractions;
using Gms.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace Gms.Infrastructure.Services;

public sealed class SeamlessWalletClient : ISeamlessWalletClient
{
    private readonly HttpClient _http;
    private readonly ILogger<SeamlessWalletClient> _logger;

    public SeamlessWalletClient(HttpClient http, ILogger<SeamlessWalletClient> logger)
    {
        _http = http;
        _logger = logger;
    }

    public Task<SeamlessWalletResult> DebitAsync(
        Operator op, Player player, string gameId, decimal amount, string roundId, Guid transactionId, CancellationToken ct = default) =>
        PostAsync(op, "wallet/debit", player, gameId, amount, roundId, transactionId, ct);

    public Task<SeamlessWalletResult> CreditAsync(
        Operator op, Player player, string gameId, decimal amount, string roundId, Guid transactionId, CancellationToken ct = default) =>
        PostAsync(op, "wallet/credit", player, gameId, amount, roundId, transactionId, ct);

    public Task<SeamlessWalletResult> RollbackAsync(
        Operator op, Player player, string gameId, string roundId, Guid transactionId, CancellationToken ct = default) =>
        PostAsync(op, "wallet/rollback", player, gameId, 0m, roundId, transactionId, ct);

    private async Task<SeamlessWalletResult> PostAsync(
        Operator op, string path, Player player, string gameId, decimal amount, string roundId, Guid transactionId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(op.CallbackBaseUrl))
        {
            _logger.LogWarning("Seamless callback URL not configured for operator {OperatorId}", op.Id);
            return new SeamlessWalletResult
            {
                Success = false,
                ErrorCode = "callback_not_configured",
                Message = "Operator callback base URL is not configured."
            };
        }

        var url = $"{op.CallbackBaseUrl.TrimEnd('/')}/{path}";
        var body = new
        {
            operatorPlayerId = player.OperatorPlayerId,
            amount = amount.ToString("0.00", CultureInfo.InvariantCulture),
            currency = player.Currency,
            roundId,
            gameId,
            transactionId = transactionId.ToString(),
            timestamp = DateTime.UtcNow.ToString("o")
        };

        var json = JsonSerializer.Serialize(body);
        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };

        if (!string.IsNullOrWhiteSpace(op.CallbackSecret))
        {
            var signature = ComputeHmac(op.CallbackSecret, json);
            request.Headers.Add("X-GMS-Signature", signature);
        }

        try
        {
            using var response = await _http.SendAsync(request, ct);
            var payload = await response.Content.ReadFromJsonAsync<CallbackResponse>(cancellationToken: ct);
            if (payload is null)
                return new SeamlessWalletResult { Success = false, ErrorCode = "invalid_response", Message = "Empty callback response." };

            return new SeamlessWalletResult
            {
                Success = payload.Success,
                Balance = ParseBalance(payload.Balance),
                OperatorTransactionId = payload.OperatorTransactionId,
                ErrorCode = payload.ErrorCode,
                Message = payload.Message
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Seamless callback failed for {Url}", url);
            return new SeamlessWalletResult
            {
                Success = false,
                ErrorCode = "callback_timeout",
                Message = ex.Message
            };
        }
    }

    private static decimal? ParseBalance(string? value) =>
        decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var b) ? b : null;

    private static string ComputeHmac(string secret, string body)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        return Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(body))).ToLowerInvariant();
    }

    private sealed class CallbackResponse
    {
        public bool Success { get; set; }
        public string? Balance { get; set; }
        public string? OperatorTransactionId { get; set; }
        public string? ErrorCode { get; set; }
        public string? Message { get; set; }
    }
}
