using Gms.Domain.Enums;

namespace Gms.Domain.Entities;

public class Operator
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string ApiSecret { get; set; } = string.Empty;
    public WalletType WalletType { get; set; }
    public string? CallbackBaseUrl { get; set; }
    public string? CallbackSecret { get; set; }
    public int SessionTtlMinutes { get; set; } = 240;
    public int IdleTtlMinutes { get; set; } = 30;
    public int MaxConcurrentSessions { get; set; } = 1;
    public bool ExtendOnActivity { get; set; } = true;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Player> Players { get; set; } = [];
    public ICollection<OperatorGame> OperatorGames { get; set; } = [];
}
