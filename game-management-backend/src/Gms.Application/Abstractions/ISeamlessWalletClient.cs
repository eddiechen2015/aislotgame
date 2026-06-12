using Gms.Domain.Entities;

namespace Gms.Application.Abstractions;

public sealed class SeamlessWalletResult
{
    public bool Success { get; init; }
    public decimal? Balance { get; init; }
    public string? OperatorTransactionId { get; init; }
    public string? ErrorCode { get; init; }
    public string? Message { get; init; }
}

public interface ISeamlessWalletClient
{
    Task<SeamlessWalletResult> DebitAsync(
        Operator op, Player player, string gameId, decimal amount, string roundId, Guid transactionId, CancellationToken ct = default);

    Task<SeamlessWalletResult> CreditAsync(
        Operator op, Player player, string gameId, decimal amount, string roundId, Guid transactionId, CancellationToken ct = default);

    Task<SeamlessWalletResult> RollbackAsync(
        Operator op, Player player, string gameId, string roundId, Guid transactionId, CancellationToken ct = default);
}
