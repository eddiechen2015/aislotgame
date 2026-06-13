using Microsoft.AspNetCore.Mvc;
using SeamlessDemo.Models;
using SeamlessDemo.Services;

namespace SeamlessDemo.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly WalletStore _walletStore;
    private readonly GmsApiClient _gmsClient;
    private readonly ILogger<AuthController> _logger;

    public AuthController(WalletStore walletStore, GmsApiClient gmsClient, ILogger<AuthController> logger)
    {
        _walletStore = walletStore;
        _gmsClient = gmsClient;
        _logger = logger;
    }

    /// <summary>
    /// 返回可用的 demo 玩家列表
    /// </summary>
    [HttpGet("players")]
    public IActionResult GetPlayers()
    {
        var players = _walletStore.GetAllPlayers()
            .Select(p => new
            {
                p.Id,
                p.DisplayName,
                balance = WalletStore.FormatBalance(p.Balance),
                p.Currency,
                isLoggedIn = p.GmsSessionId is not null
            });
        return Ok(new { success = true, players });
    }

    /// <summary>
    /// Demo 玩家登录：
    /// 1. 验证玩家存在
    /// 2. 调 GMS S2S API 注册/登录
    /// 3. 返回 demo token
    /// </summary>
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.PlayerId))
            return BadRequest(new { success = false, error = "playerId is required" });

        var player = _walletStore.GetPlayer(request.PlayerId);
        if (player is null)
            return NotFound(new { success = false, error = $"Demo player '{request.PlayerId}' not found" });

        try
        {
            var gmsResult = await _gmsClient.LoginPlayerAsync(
                player.Id, player.Currency, player.DisplayName, ct);

            player.GmsSessionId = gmsResult.SessionId;
            player.GmsPlayerId = gmsResult.PlayerId;
            var token = _walletStore.AssignToken(player);

            _logger.LogInformation("Player {PlayerId} logged in, GMS session={SessionId}, isNew={IsNew}",
                player.Id, gmsResult.SessionId, gmsResult.IsNewPlayer);

            return Ok(new
            {
                success = true,
                token,
                playerId = player.Id,
                displayName = player.DisplayName,
                balance = WalletStore.FormatBalance(player.Balance),
                currency = player.Currency,
                gmsSessionId = gmsResult.SessionId,
                isNewPlayer = gmsResult.IsNewPlayer
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Login failed for player {PlayerId}", player.Id);
            return StatusCode(502, new { success = false, error = $"GMS login failed: {ex.Message}" });
        }
    }

    public sealed class LoginRequest
    {
        public string PlayerId { get; set; } = "";
    }
}
