using Gms.Domain.Enums;

namespace Gms.Domain.Entities;

public class Player
{
    public Guid Id { get; set; }
    public Guid OperatorId { get; set; }
    public string OperatorPlayerId { get; set; } = string.Empty;
    public string Currency { get; set; } = string.Empty;
    public string? Locale { get; set; }
    public string? DisplayName { get; set; }
    public string? MetadataJson { get; set; }
    public PlayerStatus Status { get; set; } = PlayerStatus.Active;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastLoginAt { get; set; } = DateTime.UtcNow;

    public Operator Operator { get; set; } = null!;
    public CasinoWallet? CasinoWallet { get; set; }
    public ICollection<Session> Sessions { get; set; } = [];
}
