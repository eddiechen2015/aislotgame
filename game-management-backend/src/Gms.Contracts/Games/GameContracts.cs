namespace Gms.Contracts.Games;

public sealed class GameListItem
{
    public string GameId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string ThumbnailUrl { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string MinBet { get; set; } = string.Empty;
    public string MaxBet { get; set; } = string.Empty;
    public IReadOnlyList<string> Currencies { get; set; } = [];
}

public sealed class GameListResponse
{
    public IReadOnlyList<GameListItem> Games { get; set; } = [];
    public PaginationInfo Pagination { get; set; } = new();
}

public sealed class PaginationInfo
{
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int Total { get; set; }
}

public sealed class GameDetailResponse
{
    public string GameId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Provider { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string ThumbnailUrl { get; set; } = string.Empty;
    public string BannerUrl { get; set; } = string.Empty;
    public string MinBet { get; set; } = string.Empty;
    public string MaxBet { get; set; } = string.Empty;
    public IReadOnlyList<string> Currencies { get; set; } = [];
    public IReadOnlyList<string> Locales { get; set; } = [];
    public IReadOnlyList<string> Features { get; set; } = [];
    public string? Rtp { get; set; }
}

public sealed class GameLaunchRequest
{
    public string GameId { get; set; } = string.Empty;
    public string SessionId { get; set; } = string.Empty;
    public string? Locale { get; set; }
    public string? ReturnUrl { get; set; }
    public string? LobbyUrl { get; set; }
    public string Device { get; set; } = "desktop";
}

public sealed class GameLaunchResponse
{
    public string LaunchUrl { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public string GameId { get; set; } = string.Empty;
    public string SessionId { get; set; } = string.Empty;
}
