namespace Gms.Contracts.Wallet;

public sealed class WalletTransferRequest
{
    public string SessionId { get; set; } = string.Empty;
    public string Amount { get; set; } = string.Empty;
    public string Currency { get; set; } = string.Empty;
    public string? Reference { get; set; }
}

public sealed class WalletTransferResponse
{
    public Guid TransactionId { get; set; }
    public string Balance { get; set; } = string.Empty;
    public string Currency { get; set; } = string.Empty;
}

public sealed class WalletDebitRequest
{
    public string SessionId { get; set; } = string.Empty;
    public string GameId { get; set; } = string.Empty;
    public string Amount { get; set; } = string.Empty;
    public string RoundId { get; set; } = string.Empty;
}

public sealed class WalletCreditRequest
{
    public string SessionId { get; set; } = string.Empty;
    public string GameId { get; set; } = string.Empty;
    public string Amount { get; set; } = string.Empty;
    public string RoundId { get; set; } = string.Empty;
}

public sealed class WalletRollbackRequest
{
    public string SessionId { get; set; } = string.Empty;
    public string GameId { get; set; } = string.Empty;
    public string RoundId { get; set; } = string.Empty;
}

public sealed class WalletOperationResponse
{
    public bool Success { get; set; }
    public string Balance { get; set; } = string.Empty;
    public string? OperatorTransactionId { get; set; }
    public string? ErrorCode { get; set; }
    public string? Message { get; set; }
}

public sealed class WalletBalanceResponse
{
    public string Balance { get; set; } = string.Empty;
    public string Currency { get; set; } = string.Empty;
}
