using Gms.Domain.Enums;

namespace Gms.Domain.Entities;

public class WalletTransaction
{
    public Guid Id { get; set; }
    public Guid PlayerId { get; set; }
    public WalletTransactionType Type { get; set; }
    public decimal Amount { get; set; }
    public decimal BalanceAfter { get; set; }
    public string ReferenceId { get; set; } = string.Empty;
    public string? GameId { get; set; }
    public string? OperatorTransactionId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Player Player { get; set; } = null!;
}
