using Gms.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Gms.Infrastructure.Persistence;

public sealed class GmsDbContext : DbContext
{
    public GmsDbContext(DbContextOptions<GmsDbContext> options) : base(options) { }

    public DbSet<Operator> Operators => Set<Operator>();
    public DbSet<Player> Players => Set<Player>();
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<CasinoWallet> CasinoWallets => Set<CasinoWallet>();
    public DbSet<WalletTransaction> WalletTransactions => Set<WalletTransaction>();
    public DbSet<Game> Games => Set<Game>();
    public DbSet<OperatorGame> OperatorGames => Set<OperatorGame>();
    public DbSet<IdempotencyRecord> IdempotencyRecords => Set<IdempotencyRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Operator>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.ApiKey).IsUnique();
        });

        modelBuilder.Entity<Player>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.OperatorId, x.OperatorPlayerId }).IsUnique();
            e.HasOne(x => x.Operator).WithMany(x => x.Players).HasForeignKey(x => x.OperatorId);
            e.HasOne(x => x.CasinoWallet).WithOne(x => x.Player).HasForeignKey<CasinoWallet>(x => x.PlayerId);
        });

        modelBuilder.Entity<Session>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne(x => x.Player).WithMany(x => x.Sessions).HasForeignKey(x => x.PlayerId);
            e.HasOne(x => x.Operator).WithMany().HasForeignKey(x => x.OperatorId);
        });

        modelBuilder.Entity<CasinoWallet>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Balance).HasPrecision(18, 2);
            e.Property(x => x.Version).IsConcurrencyToken();
        });

        modelBuilder.Entity<WalletTransaction>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.BalanceAfter).HasPrecision(18, 2);
            e.HasIndex(x => new { x.PlayerId, x.ReferenceId });
            e.HasOne(x => x.Player).WithMany().HasForeignKey(x => x.PlayerId);
        });

        modelBuilder.Entity<Game>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.MinBet).HasPrecision(18, 2);
            e.Property(x => x.MaxBet).HasPrecision(18, 2);
        });

        modelBuilder.Entity<OperatorGame>(e =>
        {
            e.HasKey(x => new { x.OperatorId, x.GameId });
            e.HasOne(x => x.Operator).WithMany(x => x.OperatorGames).HasForeignKey(x => x.OperatorId);
            e.HasOne(x => x.Game).WithMany(x => x.OperatorGames).HasForeignKey(x => x.GameId);
        });

        modelBuilder.Entity<IdempotencyRecord>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.OperatorId, x.IdempotencyKey, x.Endpoint }).IsUnique();
        });
    }
}
