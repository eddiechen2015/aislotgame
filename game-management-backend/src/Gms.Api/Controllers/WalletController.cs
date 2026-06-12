using Gms.Application.Services;
using Gms.Contracts.Common;
using Gms.Contracts.Wallet;
using Microsoft.AspNetCore.Mvc;

namespace Gms.Api.Controllers;

[ApiController]
[Route("api/v1/wallet")]
public sealed class WalletController(WalletService wallet) : ControllerBase
{
    [HttpPost("transfer")]
    public async Task<ActionResult<ApiResponse<WalletTransferResponse>>> Transfer(
        [FromBody] WalletTransferRequest request,
        CancellationToken ct)
    {
        var idempotencyKey = Request.Headers["Idempotency-Key"].ToString();
        var data = await wallet.TransferInAsync(request, idempotencyKey, ct);
        return Ok(ApiResponse<WalletTransferResponse>.Ok(data, HttpContext.TraceIdentifier));
    }
}
