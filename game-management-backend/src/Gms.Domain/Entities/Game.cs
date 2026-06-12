using Gms.Domain.Enums;

namespace Gms.Domain.Entities;

public class Game
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = "slots";
    public string Provider { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;
    public GameStatus Status { get; set; } = GameStatus.Active;
    public string ThumbnailUrl { get; set; } = string.Empty;
    public string BannerUrl { get; set; } = string.Empty;
    public decimal MinBet { get; set; }
    public decimal MaxBet { get; set; }
    public string CurrenciesJson { get; set; } = "[]";
    public string LocalesJson { get; set; } = "[]";
    public string FeaturesJson { get; set; } = "[]";
    public string? Rtp { get; set; }
    public string LaunchPath { get; set; } = string.Empty;

    public ICollection<OperatorGame> OperatorGames { get; set; } = [];
}
