namespace Gms.Domain.Entities;

public class OperatorGame
{
    public Guid OperatorId { get; set; }
    public string GameId { get; set; } = string.Empty;
    public bool IsEnabled { get; set; } = true;

    public Operator Operator { get; set; } = null!;
    public Game Game { get; set; } = null!;
}
