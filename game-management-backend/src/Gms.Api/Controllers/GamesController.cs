using Gms.Application.Services;
using Gms.Contracts.Common;
using Gms.Contracts.Games;
using Microsoft.AspNetCore.Mvc;

namespace Gms.Api.Controllers;

[ApiController]
[Route("api/v1/games")]
public sealed class GamesController(GameService games) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<GameListResponse>>> List(
        [FromQuery] string? category,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default)
    {
        var data = await games.ListAsync(page, pageSize, category, ct);
        return Ok(ApiResponse<GameListResponse>.Ok(data, HttpContext.TraceIdentifier));
    }

    [HttpGet("{gameId}")]
    public async Task<ActionResult<ApiResponse<GameDetailResponse>>> Get(string gameId, CancellationToken ct)
    {
        var data = await games.GetAsync(gameId, ct);
        return Ok(ApiResponse<GameDetailResponse>.Ok(data, HttpContext.TraceIdentifier));
    }

    [HttpPost("launch")]
    public async Task<ActionResult<ApiResponse<GameLaunchResponse>>> Launch(
        [FromBody] GameLaunchRequest request,
        CancellationToken ct)
    {
        var data = await games.LaunchAsync(request, ct);
        return Ok(ApiResponse<GameLaunchResponse>.Ok(data, HttpContext.TraceIdentifier));
    }
}
