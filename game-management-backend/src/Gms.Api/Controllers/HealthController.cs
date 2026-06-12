using Microsoft.AspNetCore.Mvc;

namespace Gms.Api.Controllers;

[ApiController]
public sealed class HealthController : ControllerBase
{
    [HttpGet("/health")]
    public IActionResult Health() => Ok(new { status = "healthy", service = "gms" });
}
