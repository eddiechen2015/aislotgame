namespace Gms.Contracts.Sessions;

public sealed class SessionValidateRequest
{
    public string SessionId { get; set; } = string.Empty;
}

public sealed class SessionValidateResponse
{
    public bool Valid { get; set; }
    public Guid? PlayerId { get; set; }
    public string? OperatorPlayerId { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public string? WalletType { get; set; }
    public string? Currency { get; set; }
    public string? Reason { get; set; }
}

public sealed class SessionContextResponse
{
    public string SessionId { get; set; } = string.Empty;
    public bool Valid { get; set; }
    public Guid PlayerId { get; set; }
    public Guid OperatorId { get; set; }
    public string OperatorPlayerId { get; set; } = string.Empty;
    public string Currency { get; set; } = string.Empty;
    public string? Locale { get; set; }
    public string Market { get; set; } = "MGA";
    public string WalletType { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
}
