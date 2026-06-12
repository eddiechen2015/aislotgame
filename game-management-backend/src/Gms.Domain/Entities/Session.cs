namespace Gms.Domain.Entities;

public class Session
{
    public string Id { get; set; } = string.Empty;
    public Guid PlayerId { get; set; }
    public Guid OperatorId { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public DateTime LastActiveAt { get; set; } = DateTime.UtcNow;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? ClientIp { get; set; }
    public string? UserAgent { get; set; }

    public Player Player { get; set; } = null!;
    public Operator Operator { get; set; } = null!;
}
