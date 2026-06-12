namespace Gms.Contracts.Players;

public sealed class PlayerLoginRequest
{
    public string OperatorPlayerId { get; set; } = string.Empty;
    public string Currency { get; set; } = string.Empty;
    public string? Locale { get; set; }
    public string? DisplayName { get; set; }
    public Dictionary<string, string>? Metadata { get; set; }
}

public sealed class PlayerLoginResponse
{
    public Guid PlayerId { get; set; }
    public string OperatorPlayerId { get; set; } = string.Empty;
    public string SessionId { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public string WalletType { get; set; } = string.Empty;
    public bool IsNewPlayer { get; set; }
}
