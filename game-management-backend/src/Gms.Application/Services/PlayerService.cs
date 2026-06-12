using System.Security.Cryptography;
using System.Text.Json;
using Gms.Application.Abstractions;
using Gms.Application.Common;
using Gms.Contracts.Players;
using Gms.Domain.Entities;
using Gms.Domain.Enums;

namespace Gms.Application.Services;

public sealed class PlayerService
{
    private readonly IOperatorContext _operatorContext;
    private readonly IPlayerRepository _players;
    private readonly ISessionRepository _sessions;
    private readonly IWalletRepository _wallets;

    public PlayerService(
        IOperatorContext operatorContext,
        IPlayerRepository players,
        ISessionRepository sessions,
        IWalletRepository wallets)
    {
        _operatorContext = operatorContext;
        _players = players;
        _sessions = sessions;
        _wallets = wallets;
    }

    public async Task<PlayerLoginResponse> LoginAsync(PlayerLoginRequest request, CancellationToken ct = default)
    {
        var op = RequireOperator();
        ValidateLoginRequest(request);

        var existing = await _players.GetByOperatorPlayerIdAsync(op.Id, request.OperatorPlayerId, ct);
        var isNew = existing is null;

        Player player;
        if (isNew)
        {
            player = new Player
            {
                Id = Guid.NewGuid(),
                OperatorId = op.Id,
                OperatorPlayerId = request.OperatorPlayerId.Trim(),
                Currency = request.Currency.Trim().ToUpperInvariant(),
                Locale = request.Locale,
                DisplayName = request.DisplayName,
                MetadataJson = request.Metadata is null ? null : JsonSerializer.Serialize(request.Metadata),
                Status = PlayerStatus.Active,
                CreatedAt = DateTime.UtcNow,
                LastLoginAt = DateTime.UtcNow
            };
            await _players.AddAsync(player, ct);

            if (op.WalletType == WalletType.Normal)
            {
                await _wallets.AddWalletAsync(new CasinoWallet
                {
                    Id = Guid.NewGuid(),
                    PlayerId = player.Id,
                    Currency = player.Currency,
                    Balance = 0m,
                    UpdatedAt = DateTime.UtcNow
                }, ct);
            }

            await _players.SaveChangesAsync(ct);
        }
        else
        {
            player = existing!;
            if (!string.Equals(player.Currency, request.Currency.Trim(), StringComparison.OrdinalIgnoreCase))
                throw new AppException("validation_error", "Currency cannot be changed after registration.", 400);

            player.LastLoginAt = DateTime.UtcNow;
            if (!string.IsNullOrWhiteSpace(request.Locale)) player.Locale = request.Locale;
            if (!string.IsNullOrWhiteSpace(request.DisplayName)) player.DisplayName = request.DisplayName;
            if (request.Metadata is not null)
                player.MetadataJson = JsonSerializer.Serialize(request.Metadata);

            await _players.SaveChangesAsync(ct);
        }

        if (op.MaxConcurrentSessions > 0)
        {
            var active = await _sessions.GetActiveByPlayerIdAsync(player.Id, ct);
            var now = DateTime.UtcNow;
            foreach (var s in active.Where(s => s.RevokedAt is null && s.ExpiresAt > now))
                s.RevokedAt = now;
            await _sessions.SaveChangesAsync(ct);
        }

        var session = new Session
        {
            Id = GenerateSessionId(),
            PlayerId = player.Id,
            OperatorId = op.Id,
            ExpiresAt = DateTime.UtcNow.AddMinutes(op.SessionTtlMinutes),
            LastActiveAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        };
        await _sessions.AddAsync(session, ct);
        await _sessions.SaveChangesAsync(ct);

        return new PlayerLoginResponse
        {
            PlayerId = player.Id,
            OperatorPlayerId = player.OperatorPlayerId,
            SessionId = session.Id,
            ExpiresAt = session.ExpiresAt,
            WalletType = op.WalletType.ToString(),
            IsNewPlayer = isNew
        };
    }

    private static void ValidateLoginRequest(PlayerLoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.OperatorPlayerId))
            throw new AppException("validation_error", "operatorPlayerId is required.", 400);
        if (string.IsNullOrWhiteSpace(request.Currency) || request.Currency.Length != 3)
            throw new AppException("validation_error", "currency must be a 3-letter ISO 4217 code.", 400);
    }

    private Operator RequireOperator()
    {
        return _operatorContext.CurrentOperator
            ?? throw new AppException("unauthorized", "Operator not authenticated.", 401);
    }

    private static string GenerateSessionId() =>
        Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
}
