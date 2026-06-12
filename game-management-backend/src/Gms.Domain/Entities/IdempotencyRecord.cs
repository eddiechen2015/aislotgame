namespace Gms.Domain.Entities;

public class IdempotencyRecord
{
    public Guid Id { get; set; }
    public Guid OperatorId { get; set; }
    public string IdempotencyKey { get; set; } = string.Empty;
    public string Endpoint { get; set; } = string.Empty;
    public string ResponseJson { get; set; } = string.Empty;
    public int StatusCode { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
