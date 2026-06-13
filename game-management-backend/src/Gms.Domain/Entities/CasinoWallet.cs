namespace Gms.Domain.Entities;

public class CasinoWallet
{
    public Guid Id { get; set; }
    public Guid PlayerId { get; set; }
    public string Currency { get; set; } = string.Empty;
    public decimal Balance { get; set; }
    public uint Version { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Player Player { get; set; } = null!;
    public ICollection<WalletTransaction> Transactions { get; set; } = [];
}
