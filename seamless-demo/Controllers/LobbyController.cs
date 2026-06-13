using Microsoft.AspNetCore.Mvc;
using SeamlessDemo.Models;
using SeamlessDemo.Services;

namespace SeamlessDemo.Controllers;

[ApiController]
[Route("api/lobby")]
public sealed class LobbyController : ControllerBase
{
    private readonly WalletStore _walletStore;
    private readonly GmsApiClient _gmsClient;
    private readonly ILogger<LobbyController> _logger;

    public LobbyController(WalletStore walletStore, GmsApiClient gmsClient, ILogger<LobbyController> logger)
    {
        _walletStore = walletStore;
        _gmsClient = gmsClient;
        _logger = logger;
    }

    /// <summary>
    /// 从 GMS 获取游戏列表 (S2S)
    /// </summary>
    [HttpGet("games")]
    public async Task<IActionResult> GetGames(CancellationToken ct)
    {
        var player = GetAuthenticatedPlayer();
        if (player is null)
            return Unauthorized(new { success = false, error = "Not logged in" });

        try
        {
            var games = await _gmsClient.GetGamesAsync(ct: ct);
            return Ok(new
            {
                success = true,
                games = games.Games,
                pagination = games.Pagination,
                player = new
                {
                    player.Id,
                    player.DisplayName,
                    balance = WalletStore.FormatBalance(player.Balance),
                    player.Currency
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch games from GMS");
            return StatusCode(502, new { success = false, error = $"Failed to fetch games: {ex.Message}" });
        }
    }

    /// <summary>
    /// 启动游戏：调 GMS 获取 launchUrl
    /// </summary>
    [HttpPost("launch")]
    public async Task<IActionResult> LaunchGame([FromBody] LaunchRequest request, CancellationToken ct)
    {
        var player = GetAuthenticatedPlayer();
        if (player is null)
            return Unauthorized(new { success = false, error = "Not logged in" });

        if (string.IsNullOrWhiteSpace(request.GameId))
            return BadRequest(new { success = false, error = "gameId is required" });

        if (string.IsNullOrWhiteSpace(player.GmsSessionId))
            return BadRequest(new { success = false, error = "No active GMS session. Please login again." });

        try
        {
            var lobbyUrl = $"{Request.Scheme}://{Request.Host}/lobby.html";
            var launch = await _gmsClient.LaunchGameAsync(
                request.GameId, player.GmsSessionId, lobbyUrl, ct);

            _logger.LogInformation("Game launched: player={PlayerId} game={GameId} url={LaunchUrl}",
                player.Id, request.GameId, launch.LaunchUrl);

            return Ok(new
            {
                success = true,
                launchUrl = launch.LaunchUrl,
                expiresAt = launch.ExpiresAt,
                gameId = launch.GameId
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Game launch failed for player {PlayerId}, game {GameId}",
                player.Id, request.GameId);
            return StatusCode(502, new { success = false, error = $"Game launch failed: {ex.Message}" });
        }
    }

    /// <summary>
    /// 获取当前玩家余额
    /// </summary>
    [HttpGet("balance")]
    public IActionResult GetBalance()
    {
        var player = GetAuthenticatedPlayer();
        if (player is null)
            return Unauthorized(new { success = false, error = "Not logged in" });

        return Ok(new
        {
            success = true,
            balance = WalletStore.FormatBalance(player.Balance),
            currency = player.Currency,
            displayName = player.DisplayName,
            recentTransactions = player.Transactions
                .OrderByDescending(t => t.CreatedAt)
                .Take(20)
                .Select(t => new
                {
                    t.Type,
                    amount = WalletStore.FormatBalance(t.Amount),
                    balanceAfter = WalletStore.FormatBalance(t.BalanceAfter),
                    t.RoundId,
                    t.GameId,
                    t.CreatedAt
                })
        });
    }

    private DemoPlayer? GetAuthenticatedPlayer()
    {
        var auth = Request.Headers.Authorization.ToString();
        if (!auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return null;

        var token = auth["Bearer ".Length..].Trim();
        return _walletStore.GetPlayerByToken(token);
    }

    public sealed class LaunchRequest
    {
        public string GameId { get; set; } = "";
    }
}
