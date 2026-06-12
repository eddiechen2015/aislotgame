using Gms.Application.Abstractions;
using Gms.Application.Common;
using Gms.Contracts.Sessions;
using Gms.Domain.Enums;

namespace Gms.Application.Services;

public sealed class SessionService
{
    private readonly IOperatorContext _operatorContext;
    private readonly ISessionRepository _sessions;
    private readonly IPlayerRepository _players;

    public SessionService(
        IOperatorContext operatorContext,
        ISessionRepository sessions,
        IPlayerRepository players)
    {
        _operatorContext = operatorContext;
        _sessions = sessions;
        _players = players;
    }

    public async Task<SessionValidateResponse> ValidateAsync(SessionValidateRequest request, CancellationToken ct = default)
    {
        var op = _operatorContext.CurrentOperator
            ?? throw new AppException("unauthorized", "Operator not authenticated.", 401);

        if (string.IsNullOrWhiteSpace(request.SessionId))
            throw new AppException("validation_error", "sessionId is required.", 400);

        var session = await _sessions.GetByIdAsync(request.SessionId.Trim(), ct);
        var player = session is null ? null : await _players.GetByIdAsync(session.PlayerId, ct);

        if (session is null || player is null || session.OperatorId != op.Id)
        {
            return new SessionValidateResponse { Valid = false, Reason = "not_found" };
        }

        var reason = SessionHelper.GetInvalidReason(session, player);
        if (reason is not null)
        {
            return new SessionValidateResponse { Valid = false, Reason = reason };
        }

        return new SessionValidateResponse
        {
            Valid = true,
            PlayerId = player.Id,
            OperatorPlayerId = player.OperatorPlayerId,
            ExpiresAt = session.ExpiresAt,
            WalletType = op.WalletType.ToString(),
            Currency = player.Currency
        };
    }

    public async Task<SessionContextResponse> GetContextAsync(string sessionId, CancellationToken ct = default)
    {
        var session = await _sessions.GetByIdAsync(sessionId, ct)
            ?? throw new AppException("not_found", "Session not found.", 404);

        var player = await _players.GetByIdAsync(session.PlayerId, ct)
            ?? throw new AppException("not_found", "Player not found.", 404);

        var op = player.Operator ?? throw new AppException("internal_error", "Operator not loaded.", 500);
        SessionHelper.EnsureActive(session, player, op);

        session.LastActiveAt = DateTime.UtcNow;
        await _sessions.SaveChangesAsync(ct);

        return new SessionContextResponse
        {
            SessionId = session.Id,
            Valid = true,
            PlayerId = player.Id,
            OperatorId = op.Id,
            OperatorPlayerId = player.OperatorPlayerId,
            Currency = player.Currency,
            Locale = player.Locale,
            Market = "MGA",
            WalletType = op.WalletType.ToString(),
            ExpiresAt = session.ExpiresAt
        };
    }

    public async Task TouchAsync(string sessionId, CancellationToken ct = default)
    {
        var session = await _sessions.GetByIdAsync(sessionId, ct)
            ?? throw new AppException("not_found", "Session not found.", 404);

        var player = await _players.GetByIdAsync(session.PlayerId, ct)
            ?? throw new AppException("not_found", "Player not found.", 404);

        var op = player.Operator;
        if (op is null) return;

        SessionHelper.EnsureActive(session, player, op);
        session.LastActiveAt = DateTime.UtcNow;
        await _sessions.SaveChangesAsync(ct);
    }

    public async Task<(Domain.Entities.Session Session, Domain.Entities.Player Player, Domain.Entities.Operator Operator)> ResolveForOperatorAsync(
        string sessionId, Guid operatorId, CancellationToken ct = default)
    {
        var (session, player, op) = await ResolveInternalAsync(sessionId, ct);

        if (session.OperatorId != operatorId)
            throw new AppException("forbidden", "Session does not belong to this operator.", 403);

        return (session, player, op);
    }

    public async Task<(Domain.Entities.Session Session, Domain.Entities.Player Player, Domain.Entities.Operator Operator)> ResolveInternalAsync(
        string sessionId, CancellationToken ct = default)
    {
        var session = await _sessions.GetByIdAsync(sessionId, ct)
            ?? throw new AppException("session_expired", "Session not found.", 401);

        var player = await _players.GetByIdAsync(session.PlayerId, ct)
            ?? throw new AppException("not_found", "Player not found.", 404);

        var op = player.Operator
            ?? throw new AppException("internal_error", "Operator not loaded.", 500);

        SessionHelper.EnsureActive(session, player, op);
        return (session, player, op);
    }
}
