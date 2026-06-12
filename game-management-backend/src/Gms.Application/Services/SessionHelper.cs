using Gms.Application.Common;
using Gms.Domain.Entities;
using Gms.Domain.Enums;

namespace Gms.Application.Services;

public static class SessionHelper
{
    public static void EnsureActive(Session session, Player player, Operator op)
    {
        if (session.RevokedAt is not null)
            throw new AppException("session_revoked", "Session has been revoked.", 401);

        var now = DateTime.UtcNow;
        if (session.ExpiresAt <= now)
            throw new AppException("session_expired", "Session has expired.", 401);

        if (op.ExtendOnActivity && op.IdleTtlMinutes > 0)
        {
            var idleDeadline = session.LastActiveAt.AddMinutes(op.IdleTtlMinutes);
            if (idleDeadline <= now)
                throw new AppException("session_expired", "Session idle timeout exceeded.", 401);
        }

        if (player.Status == PlayerStatus.Suspended)
            throw new AppException("player_suspended", "Player account is suspended.", 403);

        if (player.Status == PlayerStatus.Closed)
            throw new AppException("forbidden", "Player account is closed.", 403);
    }

    public static string? GetInvalidReason(Session? session, Player? player)
    {
        if (session is null || player is null)
            return "not_found";

        if (session.RevokedAt is not null)
            return "revoked";

        if (session.ExpiresAt <= DateTime.UtcNow)
            return "session_expired";

        if (player.Status == PlayerStatus.Suspended)
            return "player_suspended";

        return null;
    }
}
