using Gms.Application.Services;
using Gms.Contracts.Common;
using Gms.Contracts.Players;
using Microsoft.AspNetCore.Mvc;

namespace Gms.Api.Controllers;

[ApiController]
[Route("api/v1/players")]
public sealed class PlayersController(PlayerService players) : ControllerBase
{
    [HttpPost("login")]
    public async Task<ActionResult<ApiResponse<PlayerLoginResponse>>> Login(
        [FromBody] PlayerLoginRequest request,
        CancellationToken ct)
    {
        var data = await players.LoginAsync(request, ct);
        return Ok(ApiResponse<PlayerLoginResponse>.Ok(data, HttpContext.TraceIdentifier));
    }
}
