using Gms.Application.Services;
using Gms.Contracts.Common;
using Gms.Contracts.Sessions;
using Microsoft.AspNetCore.Mvc;

namespace Gms.Api.Controllers;

[ApiController]
[Route("api/v1/sessions")]
public sealed class SessionsController(SessionService sessions) : ControllerBase
{
    [HttpPost("validate")]
    public async Task<ActionResult<ApiResponse<SessionValidateResponse>>> Validate(
        [FromBody] SessionValidateRequest request,
        CancellationToken ct)
    {
        var data = await sessions.ValidateAsync(request, ct);
        return Ok(ApiResponse<SessionValidateResponse>.Ok(data, HttpContext.TraceIdentifier));
    }
}
