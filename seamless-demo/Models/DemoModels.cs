using System.Collections.Concurrent;
using System.Globalization;

namespace SeamlessDemo.Models;

public sealed class DemoPlayerConfig
{
    public string Id { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public decimal Balance { get; set; }
}

public sealed class SeamlessDemoOptions
{
    public string GmsBaseUrl { get; set; } = "http://localhost:5080";
    public string ApiKey { get; set; } = "";
    public string ApiSecret { get; set; } = "";
    public string CallbackSecret { get; set; } = "";
    public string DefaultCurrency { get; set; } = "USD";
    public decimal StartingBalance { get; set; } = 1000m;
    public List<DemoPlayerConfig> DemoPlayers { get; set; } = new();
}

public sealed class DemoPlayer
{
    public string Id { get; init; } = "";
    public string DisplayName { get; init; } = "";
    public string Currency { get; init; } = "USD";
    public decimal Balance { get; set; }
    public string? GmsSessionId { get; set; }
    public string? GmsPlayerId { get; set; }
    public string? DemoToken { get; set; }
    public List<WalletTransaction> Transactions { get; } = new();
    public readonly object Lock = new();
}

public sealed class WalletTransaction
{
    public string Id { get; init; } = Guid.NewGuid().ToString();
    public string Type { get; init; } = "";
    public decimal Amount { get; init; }
    public decimal BalanceAfter { get; init; }
    public string? RoundId { get; init; }
    public string? GameId { get; init; }
    public string? GmsTransactionId { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}
