using Gms.Application.Services;
using Gms.Contracts.Common;
using Gms.Contracts.Sessions;
using Gms.Contracts.Wallet;
using Microsoft.AspNetCore.Mvc;

namespace Gms.Api.Controllers;

[ApiController]
[Route("api/v1/internal")]
public sealed class InternalController(SessionService sessions, WalletService wallet) : ControllerBase
{
    [HttpGet("sessions/{sessionId}")]
    public async Task<ActionResult<ApiResponse<SessionContextResponse>>> GetSession(string sessionId, CancellationToken ct)
    {
        var data = await sessions.GetContextAsync(sessionId, ct);
        return Ok(ApiResponse<SessionContextResponse>.Ok(data, HttpContext.TraceIdentifier));
    }

    [HttpPost("sessions/{sessionId}/touch")]
    public async Task<IActionResult> TouchSession(string sessionId, CancellationToken ct)
    {
        await sessions.TouchAsync(sessionId, ct);
        return Ok(ApiResponse<object>.Ok(new { }, HttpContext.TraceIdentifier));
    }

    [HttpPost("wallet/debit")]
    public async Task<ActionResult<ApiResponse<WalletOperationResponse>>> Debit(
        [FromBody] WalletDebitRequest request,
        CancellationToken ct)
    {
        var data = await wallet.DebitAsync(request, ct);
        return Ok(ApiResponse<WalletOperationResponse>.Ok(data, HttpContext.TraceIdentifier));
    }

    [HttpPost("wallet/credit")]
    public async Task<ActionResult<ApiResponse<WalletOperationResponse>>> Credit(
        [FromBody] WalletCreditRequest request,
        CancellationToken ct)
    {
        var data = await wallet.CreditAsync(request, ct);
        return Ok(ApiResponse<WalletOperationResponse>.Ok(data, HttpContext.TraceIdentifier));
    }

    [HttpPost("wallet/rollback")]
    public async Task<ActionResult<ApiResponse<WalletOperationResponse>>> Rollback(
        [FromBody] WalletRollbackRequest request,
        CancellationToken ct)
    {
        var data = await wallet.RollbackAsync(request, ct);
        return Ok(ApiResponse<WalletOperationResponse>.Ok(data, HttpContext.TraceIdentifier));
    }

    [HttpGet("wallet/balance")]
    public async Task<ActionResult<ApiResponse<WalletBalanceResponse>>> Balance(
        [FromQuery] string sessionId,
        CancellationToken ct)
    {
        var data = await wallet.GetBalanceAsync(sessionId, ct);
        return Ok(ApiResponse<WalletBalanceResponse>.Ok(data, HttpContext.TraceIdentifier));
    }
}
