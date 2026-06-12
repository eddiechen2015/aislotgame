using Gms.Domain.Entities;

namespace Gms.Application.Abstractions;

public interface IOperatorRepository
{
    Task<Operator?> GetByApiKeyAsync(string apiKey, CancellationToken ct = default);
}

public interface IPlayerRepository
{
    Task<Player?> GetByOperatorPlayerIdAsync(Guid operatorId, string operatorPlayerId, CancellationToken ct = default);
    Task<Player?> GetByIdAsync(Guid playerId, CancellationToken ct = default);
    Task AddAsync(Player player, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}

public interface ISessionRepository
{
    Task<Session?> GetByIdAsync(string sessionId, CancellationToken ct = default);
    Task<IReadOnlyList<Session>> GetActiveByPlayerIdAsync(Guid playerId, CancellationToken ct = default);
    Task AddAsync(Session session, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}

public interface IWalletRepository
{
    Task<CasinoWallet?> GetByPlayerIdAsync(Guid playerId, CancellationToken ct = default);
    Task<WalletTransaction?> GetByReferenceAsync(Guid playerId, string referenceId, CancellationToken ct = default);
    Task AddWalletAsync(CasinoWallet wallet, CancellationToken ct = default);
    Task AddTransactionAsync(WalletTransaction tx, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}

public interface IGameRepository
{
    Task<IReadOnlyList<Game>> GetEnabledForOperatorAsync(Guid operatorId, string? category, CancellationToken ct = default);
    Task<Game?> GetByIdForOperatorAsync(Guid operatorId, string gameId, CancellationToken ct = default);
    Task<int> CountEnabledForOperatorAsync(Guid operatorId, string? category, CancellationToken ct = default);
}

public interface IIdempotencyRepository
{
    Task<IdempotencyRecord?> GetAsync(Guid operatorId, string key, string endpoint, CancellationToken ct = default);
    Task AddAsync(IdempotencyRecord record, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
