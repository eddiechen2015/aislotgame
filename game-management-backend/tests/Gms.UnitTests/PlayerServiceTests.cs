using Gms.Application.Abstractions;
using Xunit;
using Gms.Application.Services;
using Gms.Contracts.Players;
using Gms.Domain.Entities;
using Gms.Domain.Enums;
using Gms.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Gms.UnitTests;

public class PlayerServiceTests
{
    [Fact]
    public async Task Login_CreatesNewPlayerAndSession()
    {
        await using var db = CreateDb();
        var op = SeedOperator(db);
        var service = CreateService(db, op);

        var result = await service.LoginAsync(new PlayerLoginRequest
        {
            OperatorPlayerId = "player-1",
            Currency = "USD",
            DisplayName = "Test Player"
        });

        Assert.True(result.IsNewPlayer);
        Assert.Equal("Normal", result.WalletType);
        Assert.False(string.IsNullOrWhiteSpace(result.SessionId));

        var wallet = await db.CasinoWallets.FirstOrDefaultAsync(w => w.PlayerId == result.PlayerId);
        Assert.NotNull(wallet);
        Assert.Equal(0m, wallet!.Balance);
    }

    private static GmsDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<GmsDbContext>()
            .UseSqlite("Data Source=:memory:")
            .Options;
        var db = new GmsDbContext(options);
        db.Database.OpenConnection();
        db.Database.EnsureCreated();
        return db;
    }

    private static Operator SeedOperator(GmsDbContext db)
    {
        var op = new Operator
        {
            Id = Guid.NewGuid(),
            Name = "Test",
            ApiKey = "test-key",
            ApiSecret = "test-secret",
            WalletType = WalletType.Normal,
            IsActive = true
        };
        db.Operators.Add(op);
        db.SaveChanges();
        return op;
    }

    private static PlayerService CreateService(GmsDbContext db, Operator op)
    {
        var ctx = new OperatorContext();
        ctx.SetOperator(op);
        return new PlayerService(
            ctx,
            new PlayerRepository(db),
            new SessionRepository(db),
            new WalletRepository(db));
    }
}
