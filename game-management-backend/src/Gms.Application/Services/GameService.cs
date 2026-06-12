using System.Globalization;
using System.Text.Json;
using Gms.Application.Abstractions;
using Gms.Application.Common;
using Gms.Contracts.Games;
using Gms.Domain.Enums;

namespace Gms.Application.Services;

public sealed class GameService
{
    private readonly IOperatorContext _operatorContext;
    private readonly IGameRepository _games;
    private readonly SessionService _sessions;
    private readonly ILaunchTokenService _launchTokens;
    private readonly IWalletRepository _wallets;
    private readonly IGmsSettings _settings;

    public GameService(
        IOperatorContext operatorContext,
        IGameRepository games,
        SessionService sessions,
        ILaunchTokenService launchTokens,
        IWalletRepository wallets,
        IGmsSettings settings)
    {
        _operatorContext = operatorContext;
        _games = games;
        _sessions = sessions;
        _launchTokens = launchTokens;
        _wallets = wallets;
        _settings = settings;
    }

    public async Task<GameListResponse> ListAsync(int page, int pageSize, string? category, CancellationToken ct = default)
    {
        var op = RequireOperator();
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var total = await _games.CountEnabledForOperatorAsync(op.Id, category, ct);
        var all = await _games.GetEnabledForOperatorAsync(op.Id, category, ct);
        var games = all
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(MapListItem)
            .ToList();

        return new GameListResponse
        {
            Games = games,
            Pagination = new PaginationInfo { Page = page, PageSize = pageSize, Total = total }
        };
    }

    public async Task<GameDetailResponse> GetAsync(string gameId, CancellationToken ct = default)
    {
        var op = RequireOperator();
        var game = await _games.GetByIdForOperatorAsync(op.Id, gameId, ct)
            ?? throw new AppException("game_unavailable", "Game not available for this operator.", 404);

        return MapDetail(game);
    }

    public async Task<GameLaunchResponse> LaunchAsync(GameLaunchRequest request, CancellationToken ct = default)
    {
        var op = RequireOperator();
        if (string.IsNullOrWhiteSpace(request.GameId))
            throw new AppException("validation_error", "gameId is required.", 400);
        if (string.IsNullOrWhiteSpace(request.SessionId))
            throw new AppException("validation_error", "sessionId is required.", 400);

        var game = await _games.GetByIdForOperatorAsync(op.Id, request.GameId, ct)
            ?? throw new AppException("game_unavailable", "Game not available for this operator.", 404);

        if (game.Status != GameStatus.Active)
            throw new AppException("game_unavailable", "Game is not active.", 404);

        var (session, player, _) = await _sessions.ResolveForOperatorAsync(request.SessionId, op.Id, ct);

        if (op.WalletType == WalletType.Normal && _settings.MinLaunchBalance > 0)
        {
            var wallet = await _wallets.GetByPlayerIdAsync(player.Id, ct);
            if (wallet is null || wallet.Balance < _settings.MinLaunchBalance)
                throw new AppException("insufficient_funds", "Casino wallet below minimum for launch.", 402);
        }

        var locale = request.Locale ?? player.Locale;
        var ttl = TimeSpan.FromMinutes(5);
        var token = _launchTokens.CreateLaunchToken(
            session, player, op, game.Id, locale, request.ReturnUrl, request.LobbyUrl, ttl);

        var path = string.IsNullOrWhiteSpace(game.LaunchPath)
            ? $"/play/{game.Id}"
            : game.LaunchPath;

        return new GameLaunchResponse
        {
            LaunchUrl = $"{_settings.PlayBaseUrl.TrimEnd('/')}{path}?launchToken={Uri.EscapeDataString(token)}",
            ExpiresAt = DateTime.UtcNow.Add(ttl),
            GameId = game.Id,
            SessionId = session.Id
        };
    }

    private static GameListItem MapListItem(Domain.Entities.Game g) => new()
    {
        GameId = g.Id,
        Name = g.Name,
        Category = g.Category,
        ThumbnailUrl = g.ThumbnailUrl,
        Status = g.Status.ToString().ToLowerInvariant(),
        MinBet = g.MinBet.ToString("0.00", CultureInfo.InvariantCulture),
        MaxBet = g.MaxBet.ToString("0.00", CultureInfo.InvariantCulture),
        Currencies = JsonSerializer.Deserialize<string[]>(g.CurrenciesJson) ?? []
    };

    private static GameDetailResponse MapDetail(Domain.Entities.Game g) => new()
    {
        GameId = g.Id,
        Name = g.Name,
        Description = g.Description,
        Category = g.Category,
        Provider = g.Provider,
        Version = g.Version,
        Status = g.Status.ToString().ToLowerInvariant(),
        ThumbnailUrl = g.ThumbnailUrl,
        BannerUrl = g.BannerUrl,
        MinBet = g.MinBet.ToString("0.00", CultureInfo.InvariantCulture),
        MaxBet = g.MaxBet.ToString("0.00", CultureInfo.InvariantCulture),
        Currencies = JsonSerializer.Deserialize<string[]>(g.CurrenciesJson) ?? [],
        Locales = JsonSerializer.Deserialize<string[]>(g.LocalesJson) ?? [],
        Features = JsonSerializer.Deserialize<string[]>(g.FeaturesJson) ?? [],
        Rtp = g.Rtp
    };

    private Domain.Entities.Operator RequireOperator() =>
        _operatorContext.CurrentOperator
        ?? throw new AppException("unauthorized", "Operator not authenticated.", 401);
}
