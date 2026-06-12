using System.Globalization;
using Gms.Application.Abstractions;
using Gms.Application.Common;
using Gms.Contracts.Wallet;
using Gms.Domain.Entities;
using Gms.Domain.Enums;

namespace Gms.Application.Services;

public sealed class WalletService
{
    private readonly IOperatorContext _operatorContext;
    private readonly ISessionRepository _sessions;
    private readonly IPlayerRepository _players;
    private readonly IWalletRepository _wallets;
    private readonly IIdempotencyRepository _idempotency;
    private readonly ISeamlessWalletClient _seamless;
    private readonly SessionService _sessionService;

    public WalletService(
        IOperatorContext operatorContext,
        ISessionRepository sessions,
        IPlayerRepository players,
        IWalletRepository wallets,
        IIdempotencyRepository idempotency,
        ISeamlessWalletClient seamless,
        SessionService sessionService)
    {
        _operatorContext = operatorContext;
        _sessions = sessions;
        _players = players;
        _wallets = wallets;
        _idempotency = idempotency;
        _seamless = seamless;
        _sessionService = sessionService;
    }

    public async Task<WalletTransferResponse> TransferInAsync(
        WalletTransferRequest request, string idempotencyKey, CancellationToken ct = default)
    {
        var op = RequireOperator();
        if (op.WalletType != WalletType.Normal)
            throw new AppException("wallet_type_mismatch", "Transfer is not available for seamless wallet operators.", 400);

        if (string.IsNullOrWhiteSpace(idempotencyKey))
            throw new AppException("validation_error", "Idempotency-Key header is required.", 400);

        var endpoint = "wallet/transfer";
        var cached = await _idempotency.GetAsync(op.Id, idempotencyKey, endpoint, ct);
        if (cached is not null)
            return System.Text.Json.JsonSerializer.Deserialize<WalletTransferResponse>(cached.ResponseJson)!;

        var amount = ParsePositiveAmount(request.Amount);
        var (_, player, _) = await _sessionService.ResolveForOperatorAsync(request.SessionId, op.Id, ct);

        if (!string.Equals(player.Currency, request.Currency.Trim(), StringComparison.OrdinalIgnoreCase))
            throw new AppException("validation_error", "Currency mismatch.", 400);

        var wallet = await _wallets.GetByPlayerIdAsync(player.Id, ct)
            ?? throw new AppException("internal_error", "Casino wallet not found.", 500);

        var refId = string.IsNullOrWhiteSpace(request.Reference) ? idempotencyKey : request.Reference.Trim();
        var existing = await _wallets.GetByReferenceAsync(player.Id, refId, ct);
        if (existing is not null)
        {
            return new WalletTransferResponse
            {
                TransactionId = existing.Id,
                Balance = FormatAmount(existing.BalanceAfter),
                Currency = player.Currency
            };
        }

        wallet.Balance += amount;
        wallet.UpdatedAt = DateTime.UtcNow;

        var tx = new WalletTransaction
        {
            Id = Guid.NewGuid(),
            PlayerId = player.Id,
            Type = WalletTransactionType.TransferIn,
            Amount = amount,
            BalanceAfter = wallet.Balance,
            ReferenceId = refId,
            CreatedAt = DateTime.UtcNow
        };
        await _wallets.AddTransactionAsync(tx, ct);
        await _wallets.SaveChangesAsync(ct);

        var response = new WalletTransferResponse
        {
            TransactionId = tx.Id,
            Balance = FormatAmount(wallet.Balance),
            Currency = player.Currency
        };

        await StoreIdempotencyAsync(op.Id, idempotencyKey, endpoint, 200, response, ct);
        return response;
    }

    public async Task<WalletOperationResponse> DebitAsync(WalletDebitRequest request, CancellationToken ct = default)
    {
        var amount = ParsePositiveAmount(request.Amount);
        var (session, player, op) = await _sessionService.ResolveInternalAsync(request.SessionId, ct);

        var existing = await _wallets.GetByReferenceAsync(player.Id, request.RoundId, ct);
        if (existing is not null && existing.Type == WalletTransactionType.Bet)
        {
            var bal = await GetBalanceInternalAsync(player, op, ct);
            return new WalletOperationResponse
            {
                Success = true,
                Balance = FormatAmount(bal),
                OperatorTransactionId = existing.OperatorTransactionId
            };
        }

        if (op.WalletType == WalletType.Normal)
            return await DebitNormalAsync(player, amount, request.GameId, request.RoundId, ct);

        return await DebitSeamlessAsync(op, player, amount, request.GameId, request.RoundId, ct);
    }

    public async Task<WalletOperationResponse> CreditAsync(WalletCreditRequest request, CancellationToken ct = default)
    {
        var amount = ParseAmount(request.Amount);
        if (amount < 0) throw new AppException("validation_error", "Amount must be non-negative.", 400);

        var (session, player, op) = await _sessionService.ResolveInternalAsync(request.SessionId, ct);

        if (amount == 0)
        {
            var bal0 = await GetBalanceInternalAsync(player, op, ct);
            return new WalletOperationResponse { Success = true, Balance = FormatAmount(bal0) };
        }

        var existing = await _wallets.GetByReferenceAsync(player.Id, $"win:{request.RoundId}", ct);
        if (existing is not null)
        {
            var bal = await GetBalanceInternalAsync(player, op, ct);
            return new WalletOperationResponse
            {
                Success = true,
                Balance = FormatAmount(bal),
                OperatorTransactionId = existing.OperatorTransactionId
            };
        }

        if (op.WalletType == WalletType.Normal)
            return await CreditNormalAsync(player, amount, request.GameId, request.RoundId, ct);

        return await CreditSeamlessAsync(op, player, amount, request.GameId, request.RoundId, ct);
    }

    public async Task<WalletOperationResponse> RollbackAsync(WalletRollbackRequest request, CancellationToken ct = default)
    {
        var (session, player, op) = await _sessionService.ResolveInternalAsync(request.SessionId, ct);

        var betTx = await _wallets.GetByReferenceAsync(player.Id, request.RoundId, ct);
        if (betTx is null)
        {
            var bal = await GetBalanceInternalAsync(player, op, ct);
            return new WalletOperationResponse { Success = true, Balance = FormatAmount(bal) };
        }

        if (op.WalletType == WalletType.Normal)
            return await RollbackNormalAsync(player, betTx, request.GameId, request.RoundId, ct);

        var txId = Guid.NewGuid();
        var result = await _seamless.RollbackAsync(op, player, request.GameId, request.RoundId, txId, ct);
        var balance = await GetBalanceInternalAsync(player, op, ct);
        return new WalletOperationResponse
        {
            Success = result.Success,
            Balance = FormatAmount(balance),
            OperatorTransactionId = result.OperatorTransactionId,
            ErrorCode = result.ErrorCode,
            Message = result.Message
        };
    }

    public async Task<WalletBalanceResponse> GetBalanceAsync(string sessionId, CancellationToken ct = default)
    {
        var session = await _sessions.GetByIdAsync(sessionId, ct)
            ?? throw new AppException("not_found", "Session not found.", 404);
        var player = await _players.GetByIdAsync(session.PlayerId, ct)
            ?? throw new AppException("not_found", "Player not found.", 404);
        var op = player.Operator
            ?? throw new AppException("internal_error", "Operator not loaded.", 500);

        SessionHelper.EnsureActive(session, player, op);
        var balance = await GetBalanceInternalAsync(player, op, ct);
        return new WalletBalanceResponse
        {
            Balance = FormatAmount(balance),
            Currency = player.Currency
        };
    }

    private async Task<WalletOperationResponse> DebitNormalAsync(
        Player player, decimal amount, string gameId, string roundId, CancellationToken ct)
    {
        var wallet = await _wallets.GetByPlayerIdAsync(player.Id, ct)
            ?? throw new AppException("internal_error", "Casino wallet not found.", 500);

        if (wallet.Balance < amount)
            throw new AppException("insufficient_funds", "Insufficient casino wallet balance.", 402);

        wallet.Balance -= amount;
        wallet.UpdatedAt = DateTime.UtcNow;

        var tx = new WalletTransaction
        {
            Id = Guid.NewGuid(),
            PlayerId = player.Id,
            Type = WalletTransactionType.Bet,
            Amount = -amount,
            BalanceAfter = wallet.Balance,
            ReferenceId = roundId,
            GameId = gameId,
            CreatedAt = DateTime.UtcNow
        };
        await _wallets.AddTransactionAsync(tx, ct);
        await _wallets.SaveChangesAsync(ct);

        return new WalletOperationResponse
        {
            Success = true,
            Balance = FormatAmount(wallet.Balance)
        };
    }

    private async Task<WalletOperationResponse> CreditNormalAsync(
        Player player, decimal amount, string gameId, string roundId, CancellationToken ct)
    {
        var wallet = await _wallets.GetByPlayerIdAsync(player.Id, ct)
            ?? throw new AppException("internal_error", "Casino wallet not found.", 500);

        wallet.Balance += amount;
        wallet.UpdatedAt = DateTime.UtcNow;

        var tx = new WalletTransaction
        {
            Id = Guid.NewGuid(),
            PlayerId = player.Id,
            Type = WalletTransactionType.Win,
            Amount = amount,
            BalanceAfter = wallet.Balance,
            ReferenceId = $"win:{roundId}",
            GameId = gameId,
            CreatedAt = DateTime.UtcNow
        };
        await _wallets.AddTransactionAsync(tx, ct);
        await _wallets.SaveChangesAsync(ct);

        return new WalletOperationResponse
        {
            Success = true,
            Balance = FormatAmount(wallet.Balance)
        };
    }

    private async Task<WalletOperationResponse> RollbackNormalAsync(
        Player player, WalletTransaction betTx, string gameId, string roundId, CancellationToken ct)
    {
        var rollbackRef = $"rollback:{roundId}";
        var existing = await _wallets.GetByReferenceAsync(player.Id, rollbackRef, ct);
        if (existing is not null)
        {
            var wallet = await _wallets.GetByPlayerIdAsync(player.Id, ct)!;
            return new WalletOperationResponse { Success = true, Balance = FormatAmount(wallet!.Balance) };
        }

        var w = await _wallets.GetByPlayerIdAsync(player.Id, ct)!;
        var amount = Math.Abs(betTx.Amount);
        w!.Balance += amount;
        w.UpdatedAt = DateTime.UtcNow;

        await _wallets.AddTransactionAsync(new WalletTransaction
        {
            Id = Guid.NewGuid(),
            PlayerId = player.Id,
            Type = WalletTransactionType.Rollback,
            Amount = amount,
            BalanceAfter = w.Balance,
            ReferenceId = rollbackRef,
            GameId = gameId,
            CreatedAt = DateTime.UtcNow
        }, ct);
        await _wallets.SaveChangesAsync(ct);

        return new WalletOperationResponse { Success = true, Balance = FormatAmount(w.Balance) };
    }

    private async Task<WalletOperationResponse> DebitSeamlessAsync(
        Operator op, Player player, decimal amount, string gameId, string roundId, CancellationToken ct)
    {
        var txId = Guid.NewGuid();
        var result = await _seamless.DebitAsync(op, player, gameId, amount, roundId, txId, ct);
        if (!result.Success)
            throw new AppException(result.ErrorCode ?? "insufficient_funds", result.Message ?? "Debit failed.", 402);

        await _wallets.AddTransactionAsync(new WalletTransaction
        {
            Id = txId,
            PlayerId = player.Id,
            Type = WalletTransactionType.Bet,
            Amount = -amount,
            BalanceAfter = result.Balance ?? 0m,
            ReferenceId = roundId,
            GameId = gameId,
            OperatorTransactionId = result.OperatorTransactionId,
            CreatedAt = DateTime.UtcNow
        }, ct);
        await _wallets.SaveChangesAsync(ct);

        return new WalletOperationResponse
        {
            Success = true,
            Balance = FormatAmount(result.Balance ?? 0m),
            OperatorTransactionId = result.OperatorTransactionId
        };
    }

    private async Task<WalletOperationResponse> CreditSeamlessAsync(
        Operator op, Player player, decimal amount, string gameId, string roundId, CancellationToken ct)
    {
        var txId = Guid.NewGuid();
        var result = await _seamless.CreditAsync(op, player, gameId, amount, roundId, txId, ct);
        if (!result.Success)
            throw new AppException(result.ErrorCode ?? "internal_error", result.Message ?? "Credit failed.", 500);

        await _wallets.AddTransactionAsync(new WalletTransaction
        {
            Id = txId,
            PlayerId = player.Id,
            Type = WalletTransactionType.Win,
            Amount = amount,
            BalanceAfter = result.Balance ?? 0m,
            ReferenceId = $"win:{roundId}",
            GameId = gameId,
            OperatorTransactionId = result.OperatorTransactionId,
            CreatedAt = DateTime.UtcNow
        }, ct);
        await _wallets.SaveChangesAsync(ct);

        return new WalletOperationResponse
        {
            Success = true,
            Balance = FormatAmount(result.Balance ?? 0m),
            OperatorTransactionId = result.OperatorTransactionId
        };
    }

    private async Task<decimal> GetBalanceInternalAsync(Player player, Operator op, CancellationToken ct)
    {
        if (op.WalletType == WalletType.Normal)
        {
            var wallet = await _wallets.GetByPlayerIdAsync(player.Id, ct);
            return wallet?.Balance ?? 0m;
        }

        // Seamless: balance comes from operator; return last known from ledger or 0
        var last = await _wallets.GetByReferenceAsync(player.Id, "balance-probe", ct);
        return last?.BalanceAfter ?? 0m;
    }

    private async Task StoreIdempotencyAsync<T>(
        Guid operatorId, string key, string endpoint, int statusCode, T response, CancellationToken ct)
    {
        await _idempotency.AddAsync(new IdempotencyRecord
        {
            Id = Guid.NewGuid(),
            OperatorId = operatorId,
            IdempotencyKey = key,
            Endpoint = endpoint,
            ResponseJson = System.Text.Json.JsonSerializer.Serialize(response),
            StatusCode = statusCode,
            CreatedAt = DateTime.UtcNow
        }, ct);
        await _idempotency.SaveChangesAsync(ct);
    }

    private Operator RequireOperator() =>
        _operatorContext.CurrentOperator
        ?? throw new AppException("unauthorized", "Operator not authenticated.", 401);

    private static decimal ParsePositiveAmount(string value)
    {
        var amount = ParseAmount(value);
        if (amount <= 0) throw new AppException("validation_error", "Amount must be positive.", 400);
        return amount;
    }

    private static decimal ParseAmount(string value)
    {
        if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount))
            throw new AppException("validation_error", "Invalid amount format.", 400);
        return Math.Round(amount, 2, MidpointRounding.ToEven);
    }

    private static string FormatAmount(decimal amount) =>
        amount.ToString("0.00", CultureInfo.InvariantCulture);
}
