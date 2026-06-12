using Gms.Domain.Entities;

namespace Gms.Application.Abstractions;

public interface ILaunchTokenService
{
    string CreateLaunchToken(
        Session session,
        Player player,
        Operator op,
        string gameId,
        string? locale,
        string? returnUrl,
        string? lobbyUrl,
        TimeSpan ttl);

    bool TryValidateLaunchToken(string token, out IDictionary<string, object>? claims);
}
