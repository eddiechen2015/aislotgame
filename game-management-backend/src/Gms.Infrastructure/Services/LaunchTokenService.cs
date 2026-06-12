using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Gms.Application.Abstractions;
using Gms.Domain.Entities;
using Microsoft.IdentityModel.Tokens;

namespace Gms.Infrastructure.Services;

public sealed class LaunchTokenService : ILaunchTokenService
{
    private readonly byte[] _key;

    public LaunchTokenService(string signingKey)
    {
        _key = Encoding.UTF8.GetBytes(signingKey);
    }

    public string CreateLaunchToken(
        Session session,
        Player player,
        Operator op,
        string gameId,
        string? locale,
        string? returnUrl,
        string? lobbyUrl,
        TimeSpan ttl)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, session.Id),
            new("sessionId", session.Id),
            new("gameId", gameId),
            new("playerId", player.Id.ToString()),
            new("operatorId", op.Id.ToString()),
            new("operatorPlayerId", player.OperatorPlayerId),
            new("currency", player.Currency),
            new("walletType", op.WalletType.ToString()),
            new("market", "MGA")
        };

        if (!string.IsNullOrWhiteSpace(locale))
            claims.Add(new Claim("locale", locale));
        if (!string.IsNullOrWhiteSpace(returnUrl))
            claims.Add(new Claim("returnUrl", returnUrl));
        if (!string.IsNullOrWhiteSpace(lobbyUrl))
            claims.Add(new Claim("lobbyUrl", lobbyUrl));

        var creds = new SigningCredentials(
            new SymmetricSecurityKey(_key),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: "gms",
            audience: "ges",
            claims: claims,
            expires: DateTime.UtcNow.Add(ttl),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public bool TryValidateLaunchToken(string token, out IDictionary<string, object>? claims)
    {
        claims = null;
        try
        {
            var handler = new JwtSecurityTokenHandler();
            var principal = handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = "gms",
                ValidateAudience = true,
                ValidAudience = "ges",
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(_key),
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromMinutes(1)
            }, out _);

            claims = principal.Claims.ToDictionary(c => c.Type, c => (object)c.Value);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
