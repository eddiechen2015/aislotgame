using Gms.Application.Abstractions;
using Gms.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Gms.Infrastructure.Persistence;

public sealed class OperatorRepository(GmsDbContext db) : IOperatorRepository
{
    public Task<Operator?> GetByApiKeyAsync(string apiKey, CancellationToken ct = default) =>
        db.Operators.FirstOrDefaultAsync(x => x.ApiKey == apiKey && x.IsActive, ct);
}

public sealed class PlayerRepository(GmsDbContext db) : IPlayerRepository
{
    public Task<Player?> GetByOperatorPlayerIdAsync(Guid operatorId, string operatorPlayerId, CancellationToken ct = default) =>
        db.Players.Include(x => x.Operator).FirstOrDefaultAsync(
            x => x.OperatorId == operatorId && x.OperatorPlayerId == operatorPlayerId, ct);

    public Task<Player?> GetByIdAsync(Guid playerId, CancellationToken ct = default) =>
        db.Players.Include(x => x.Operator).FirstOrDefaultAsync(x => x.Id == playerId, ct);

    public async Task AddAsync(Player player, CancellationToken ct = default) =>
        await db.Players.AddAsync(player, ct);

    public Task SaveChangesAsync(CancellationToken ct = default) => db.SaveChangesAsync(ct);
}

public sealed class SessionRepository(GmsDbContext db) : ISessionRepository
{
    public Task<Session?> GetByIdAsync(string sessionId, CancellationToken ct = default) =>
        db.Sessions.FirstOrDefaultAsync(x => x.Id == sessionId, ct);

    public Task<IReadOnlyList<Session>> GetActiveByPlayerIdAsync(Guid playerId, CancellationToken ct = default) =>
        db.Sessions.Where(x => x.PlayerId == playerId).ToListAsync(ct)
            .ContinueWith(t => (IReadOnlyList<Session>)t.Result, ct);

    public async Task AddAsync(Session session, CancellationToken ct = default) =>
        await db.Sessions.AddAsync(session, ct);

    public Task SaveChangesAsync(CancellationToken ct = default) => db.SaveChangesAsync(ct);
}

public sealed class WalletRepository(GmsDbContext db) : IWalletRepository
{
    public Task<CasinoWallet?> GetByPlayerIdAsync(Guid playerId, CancellationToken ct = default) =>
        db.CasinoWallets.FirstOrDefaultAsync(x => x.PlayerId == playerId, ct);

    public Task<WalletTransaction?> GetByReferenceAsync(Guid playerId, string referenceId, CancellationToken ct = default) =>
        db.WalletTransactions.FirstOrDefaultAsync(x => x.PlayerId == playerId && x.ReferenceId == referenceId, ct);

    public Task<WalletTransaction?> GetLatestTransactionAsync(Guid playerId, CancellationToken ct = default) =>
        db.WalletTransactions
            .Where(x => x.PlayerId == playerId)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(ct);

    public async Task AddWalletAsync(CasinoWallet wallet, CancellationToken ct = default) =>
        await db.CasinoWallets.AddAsync(wallet, ct);

    public async Task AddTransactionAsync(WalletTransaction tx, CancellationToken ct = default) =>
        await db.WalletTransactions.AddAsync(tx, ct);

    public async Task ReloadWalletAsync(CasinoWallet wallet, CancellationToken ct = default) =>
        await db.Entry(wallet).ReloadAsync(ct);

    public Task SaveChangesAsync(CancellationToken ct = default) => db.SaveChangesAsync(ct);
}

public sealed class GameRepository(GmsDbContext db) : IGameRepository
{
    private IQueryable<Game> EnabledQuery(Guid operatorId, string? category) =>
        db.OperatorGames
            .Where(og => og.OperatorId == operatorId && og.IsEnabled)
            .Select(og => og.Game)
            .Where(g => g.Status == Domain.Enums.GameStatus.Active)
            .Where(g => category == null || g.Category == category);

    public Task<IReadOnlyList<Game>> GetEnabledForOperatorAsync(Guid operatorId, string? category, CancellationToken ct = default) =>
        EnabledQuery(operatorId, category).OrderBy(g => g.Name).ToListAsync(ct)
            .ContinueWith(t => (IReadOnlyList<Game>)t.Result, ct);

    public Task<Game?> GetByIdForOperatorAsync(Guid operatorId, string gameId, CancellationToken ct = default) =>
        EnabledQuery(operatorId, null).FirstOrDefaultAsync(g => g.Id == gameId, ct);

    public Task<int> CountEnabledForOperatorAsync(Guid operatorId, string? category, CancellationToken ct = default) =>
        EnabledQuery(operatorId, category).CountAsync(ct);
}

public sealed class IdempotencyRepository(GmsDbContext db) : IIdempotencyRepository
{
    public Task<IdempotencyRecord?> GetAsync(Guid operatorId, string key, string endpoint, CancellationToken ct = default) =>
        db.IdempotencyRecords.FirstOrDefaultAsync(
            x => x.OperatorId == operatorId && x.IdempotencyKey == key && x.Endpoint == endpoint, ct);

    public async Task AddAsync(IdempotencyRecord record, CancellationToken ct = default) =>
        await db.IdempotencyRecords.AddAsync(record, ct);

    public Task SaveChangesAsync(CancellationToken ct = default) => db.SaveChangesAsync(ct);
}
