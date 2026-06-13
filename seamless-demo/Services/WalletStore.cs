using System.Collections.Concurrent;
using System.Globalization;
using System.Security.Cryptography;
using Microsoft.Extensions.Options;
using SeamlessDemo.Models;

namespace SeamlessDemo.Services;

/// <summary>
/// In-memory wallet store for demo players.
/// Thread-safe per-player operations via locking.
/// </summary>
public sealed class WalletStore
{
    private readonly ConcurrentDictionary<string, DemoPlayer> _players = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, DemoPlayer> _tokenIndex = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, string> _processedTransactions = new(StringComparer.Ordinal);
    private readonly ILogger<WalletStore> _logger;

    public WalletStore(IOptions<SeamlessDemoOptions> opts, ILogger<WalletStore> logger)
    {
        _logger = logger;
        foreach (var cfg in opts.Value.DemoPlayers)
        {
            _players[cfg.Id] = new DemoPlayer
            {
                Id = cfg.Id,
                DisplayName = cfg.DisplayName,
                Currency = opts.Value.DefaultCurrency,
                Balance = cfg.Balance
            };
        }
        _logger.LogInformation("WalletStore initialized with {Count} demo players", _players.Count);
    }

    public IReadOnlyList<DemoPlayer> GetAllPlayers() => _players.Values.ToList();

    public DemoPlayer? GetPlayer(string playerId) =>
        _players.TryGetValue(playerId, out var p) ? p : null;

    public DemoPlayer? GetPlayerByToken(string token) =>
        _tokenIndex.TryGetValue(token, out var p) ? p : null;

    public string AssignToken(DemoPlayer player)
    {
        // 移除旧 token
        if (player.DemoToken is not null)
            _tokenIndex.TryRemove(player.DemoToken, out _);

        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        player.DemoToken = token;
        _tokenIndex[token] = player;
        return token;
    }

    public (decimal balance, string operatorTxId) Debit(
        string operatorPlayerId, decimal amount, string roundId, string gameId, string transactionId)
    {
        var player = GetPlayer(operatorPlayerId)
            ?? throw new InvalidOperationException($"Player not found: {operatorPlayerId}");

        lock (player.Lock)
        {
            // 幂等性检查：如果这笔交易已经处理过
            if (_processedTransactions.TryGetValue(transactionId, out var existingTxId))
            {
                return (player.Balance, existingTxId);
            }

            if (player.Balance < amount)
                throw new InsufficientFundsException(player.Balance);

            player.Balance -= amount;
            var opTxId = $"demo-{Guid.NewGuid():N}"[..24];

            player.Transactions.Add(new WalletTransaction
            {
                Type = "debit",
                Amount = -amount,
                BalanceAfter = player.Balance,
                RoundId = roundId,
                GameId = gameId,
                GmsTransactionId = transactionId
            });

            _processedTransactions[transactionId] = opTxId;
            _logger.LogInformation("DEBIT: player={PlayerId} amount={Amount} balance={Balance} round={RoundId}",
                operatorPlayerId, amount, player.Balance, roundId);

            return (player.Balance, opTxId);
        }
    }

    public (decimal balance, string operatorTxId) Credit(
        string operatorPlayerId, decimal amount, string roundId, string gameId, string transactionId)
    {
        var player = GetPlayer(operatorPlayerId)
            ?? throw new InvalidOperationException($"Player not found: {operatorPlayerId}");

        lock (player.Lock)
        {
            if (_processedTransactions.TryGetValue(transactionId, out var existingTxId))
            {
                return (player.Balance, existingTxId);
            }

            player.Balance += amount;
            var opTxId = $"demo-{Guid.NewGuid():N}"[..24];

            player.Transactions.Add(new WalletTransaction
            {
                Type = "credit",
                Amount = amount,
                BalanceAfter = player.Balance,
                RoundId = roundId,
                GameId = gameId,
                GmsTransactionId = transactionId
            });

            _processedTransactions[transactionId] = opTxId;
            _logger.LogInformation("CREDIT: player={PlayerId} amount={Amount} balance={Balance} round={RoundId}",
                operatorPlayerId, amount, player.Balance, roundId);

            return (player.Balance, opTxId);
        }
    }

    public (decimal balance, string operatorTxId) Rollback(
        string operatorPlayerId, string roundId, string gameId, string transactionId)
    {
        var player = GetPlayer(operatorPlayerId)
            ?? throw new InvalidOperationException($"Player not found: {operatorPlayerId}");

        lock (player.Lock)
        {
            if (_processedTransactions.TryGetValue(transactionId, out var existingTxId))
            {
                return (player.Balance, existingTxId);
            }

            // 找到原始 debit 交易并反转
            var originalDebit = player.Transactions
                .FirstOrDefault(t => t.RoundId == roundId && t.Type == "debit");

            if (originalDebit is not null)
            {
                var refundAmount = Math.Abs(originalDebit.Amount);
                player.Balance += refundAmount;
            }

            var opTxId = $"demo-{Guid.NewGuid():N}"[..24];

            player.Transactions.Add(new WalletTransaction
            {
                Type = "rollback",
                Amount = originalDebit is not null ? Math.Abs(originalDebit.Amount) : 0,
                BalanceAfter = player.Balance,
                RoundId = roundId,
                GameId = gameId,
                GmsTransactionId = transactionId
            });

            _processedTransactions[transactionId] = opTxId;
            _logger.LogInformation("ROLLBACK: player={PlayerId} balance={Balance} round={RoundId}",
                operatorPlayerId, player.Balance, roundId);

            return (player.Balance, opTxId);
        }
    }

    public static string FormatBalance(decimal balance) =>
        balance.ToString("0.00", CultureInfo.InvariantCulture);
}

public sealed class InsufficientFundsException : Exception
{
    public decimal CurrentBalance { get; }
    public InsufficientFundsException(decimal balance) : base("Insufficient funds")
    {
        CurrentBalance = balance;
    }
}
