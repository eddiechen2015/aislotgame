using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SeamlessDemo.Models;
using SeamlessDemo.Services;

namespace SeamlessDemo.Controllers;

/// <summary>
/// GMS seamless wallet callback endpoints.
/// GMS 在玩家游戏过程中调用这些 API 来操作玩家钱包。
/// </summary>
[ApiController]
[Route("wallet")]
public sealed class WalletCallbackController : ControllerBase
{
    private readonly WalletStore _walletStore;
    private readonly SeamlessDemoOptions _opts;
    private readonly ILogger<WalletCallbackController> _logger;

    public WalletCallbackController(
        WalletStore walletStore,
        IOptions<SeamlessDemoOptions> opts,
        ILogger<WalletCallbackController> logger)
    {
        _walletStore = walletStore;
        _opts = opts.Value;
        _logger = logger;
    }

    /// <summary>
    /// 扣款（下注）
    /// </summary>
    [HttpPost("debit")]
    public async Task<IActionResult> Debit()
    {
        var (request, signatureValid) = await ReadAndVerifyAsync();
        if (!signatureValid)
            return Unauthorized(MakeError("invalid_signature", "Signature verification failed"));

        if (request is null)
            return BadRequest(MakeError("invalid_request", "Invalid request body"));

        _logger.LogInformation("Wallet DEBIT: player={PlayerId} amount={Amount} round={RoundId} tx={TxId}",
            request.OperatorPlayerId, request.Amount, request.RoundId, request.TransactionId);

        if (!decimal.TryParse(request.Amount, System.Globalization.NumberStyles.Number,
            System.Globalization.CultureInfo.InvariantCulture, out var amount))
            return BadRequest(MakeError("invalid_amount", "Invalid amount format"));

        try
        {
            var (balance, opTxId) = _walletStore.Debit(
                request.OperatorPlayerId, amount, request.RoundId, request.GameId, request.TransactionId);

            return Ok(new WalletCallbackResponse
            {
                Success = true,
                Balance = WalletStore.FormatBalance(balance),
                OperatorTransactionId = opTxId
            });
        }
        catch (InsufficientFundsException ex)
        {
            return Ok(new WalletCallbackResponse
            {
                Success = false,
                Balance = WalletStore.FormatBalance(ex.CurrentBalance),
                ErrorCode = "insufficient_funds",
                Message = "Player does not have enough balance"
            });
        }
        catch (InvalidOperationException ex)
        {
            return Ok(new WalletCallbackResponse
            {
                Success = false,
                ErrorCode = "player_not_found",
                Message = ex.Message
            });
        }
    }

    /// <summary>
    /// 加款（赢钱）
    /// </summary>
    [HttpPost("credit")]
    public async Task<IActionResult> Credit()
    {
        var (request, signatureValid) = await ReadAndVerifyAsync();
        if (!signatureValid)
            return Unauthorized(MakeError("invalid_signature", "Signature verification failed"));

        if (request is null)
            return BadRequest(MakeError("invalid_request", "Invalid request body"));

        _logger.LogInformation("Wallet CREDIT: player={PlayerId} amount={Amount} round={RoundId} tx={TxId}",
            request.OperatorPlayerId, request.Amount, request.RoundId, request.TransactionId);

        if (!decimal.TryParse(request.Amount, System.Globalization.NumberStyles.Number,
            System.Globalization.CultureInfo.InvariantCulture, out var amount))
            return BadRequest(MakeError("invalid_amount", "Invalid amount format"));

        try
        {
            var (balance, opTxId) = _walletStore.Credit(
                request.OperatorPlayerId, amount, request.RoundId, request.GameId, request.TransactionId);

            return Ok(new WalletCallbackResponse
            {
                Success = true,
                Balance = WalletStore.FormatBalance(balance),
                OperatorTransactionId = opTxId
            });
        }
        catch (InvalidOperationException ex)
        {
            return Ok(new WalletCallbackResponse
            {
                Success = false,
                ErrorCode = "player_not_found",
                Message = ex.Message
            });
        }
    }

    /// <summary>
    /// 回滚（撤销下注）
    /// </summary>
    [HttpPost("rollback")]
    public async Task<IActionResult> Rollback()
    {
        var (request, signatureValid) = await ReadAndVerifyAsync();
        if (!signatureValid)
            return Unauthorized(MakeError("invalid_signature", "Signature verification failed"));

        if (request is null)
            return BadRequest(MakeError("invalid_request", "Invalid request body"));

        _logger.LogInformation("Wallet ROLLBACK: player={PlayerId} round={RoundId} tx={TxId}",
            request.OperatorPlayerId, request.RoundId, request.TransactionId);

        try
        {
            var (balance, opTxId) = _walletStore.Rollback(
                request.OperatorPlayerId, request.RoundId, request.GameId, request.TransactionId);

            return Ok(new WalletCallbackResponse
            {
                Success = true,
                Balance = WalletStore.FormatBalance(balance),
                OperatorTransactionId = opTxId
            });
        }
        catch (InvalidOperationException ex)
        {
            return Ok(new WalletCallbackResponse
            {
                Success = false,
                ErrorCode = "player_not_found",
                Message = ex.Message
            });
        }
    }

    /// <summary>
    /// 读取请求体并验证 HMAC 签名
    /// </summary>
    private async Task<(WalletCallbackRequest? request, bool signatureValid)> ReadAndVerifyAsync()
    {
        Request.EnableBuffering();
        using var reader = new StreamReader(Request.Body, Encoding.UTF8, leaveOpen: true);
        var body = await reader.ReadToEndAsync();
        Request.Body.Position = 0;

        var signature = Request.Headers["X-GMS-Signature"].ToString();

        // 验证签名（如果配置了 CallbackSecret）
        if (!string.IsNullOrWhiteSpace(_opts.CallbackSecret))
        {
            if (string.IsNullOrWhiteSpace(signature))
            {
                _logger.LogWarning("Missing X-GMS-Signature header");
                return (null, false);
            }

            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_opts.CallbackSecret));
            var expected = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(body))).ToLowerInvariant();

            if (!string.Equals(expected, signature, StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning("Signature mismatch: expected={Expected}, got={Got}", expected, signature);
                return (null, false);
            }
        }

        try
        {
            var request = System.Text.Json.JsonSerializer.Deserialize<WalletCallbackRequest>(body);
            return (request, true);
        }
        catch
        {
            return (null, false);
        }
    }

    private static WalletCallbackResponse MakeError(string code, string message) =>
        new() { Success = false, ErrorCode = code, Message = message };
}
