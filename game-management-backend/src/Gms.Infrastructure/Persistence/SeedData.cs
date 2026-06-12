using Gms.Domain.Entities;
using Gms.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Gms.Infrastructure.Persistence;

public static class SeedData
{
    public static async Task InitializeAsync(GmsDbContext db)
    {
        await db.Database.EnsureCreatedAsync();

        if (await db.Operators.AnyAsync()) return;

        var normalOpId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var seamlessOpId = Guid.Parse("22222222-2222-2222-2222-222222222222");

        var normalOp = new Operator
        {
            Id = normalOpId,
            Name = "Demo Casino (Normal Wallet)",
            ApiKey = "demo-normal-key",
            ApiSecret = "demo-normal-secret",
            WalletType = WalletType.Normal,
            SessionTtlMinutes = 240,
            IdleTtlMinutes = 30,
            MaxConcurrentSessions = 1,
            IsActive = true
        };

        var seamlessOp = new Operator
        {
            Id = seamlessOpId,
            Name = "Demo Casino (Seamless Wallet)",
            ApiKey = "demo-seamless-key",
            ApiSecret = "demo-seamless-secret",
            WalletType = WalletType.Seamless,
            CallbackBaseUrl = "http://localhost:9090",
            CallbackSecret = "demo-callback-secret",
            IsActive = true
        };

        var asianTour = new Game
        {
            Id = "asian-tour-01",
            Name = "Asian Tour",
            Code = "ASIAN-TOUR-01",
            Description = "High volatility cascading slot with free spins.",
            Category = "slots",
            Provider = "Your Studio",
            Version = "0.2.0",
            Status = GameStatus.Active,
            ThumbnailUrl = "https://cdn.example.com/games/asian-tour/thumb.png",
            BannerUrl = "https://cdn.example.com/games/asian-tour/banner.png",
            MinBet = 0.10m,
            MaxBet = 100.00m,
            CurrenciesJson = """["USD","CNY"]""",
            LocalesJson = """["en-US","zh-CN"]""",
            FeaturesJson = """["cascading","free-spins","multiplier"]""",
            Rtp = "96.50",
            LaunchPath = "/play/asian-tour-01"
        };

        db.Operators.AddRange(normalOp, seamlessOp);
        db.Games.Add(asianTour);
        db.OperatorGames.AddRange(
            new OperatorGame { OperatorId = normalOpId, GameId = asianTour.Id, IsEnabled = true },
            new OperatorGame { OperatorId = seamlessOpId, GameId = asianTour.Id, IsEnabled = true });

        await db.SaveChangesAsync();
    }
}
