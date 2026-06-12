using Gms.Application.Abstractions;
using Gms.Application.Services;
using Gms.Infrastructure.Options;
using Gms.Infrastructure.Persistence;
using Gms.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Gms.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var options = configuration.GetSection(GmsOptions.SectionName).Get<GmsOptions>() ?? new GmsOptions();
        services.Configure<GmsOptions>(configuration.GetSection(GmsOptions.SectionName));

        services.AddDbContext<GmsDbContext>(opt =>
            opt.UseSqlite(options.ConnectionString));

        services.AddScoped<IOperatorRepository, OperatorRepository>();
        services.AddScoped<IPlayerRepository, PlayerRepository>();
        services.AddScoped<ISessionRepository, SessionRepository>();
        services.AddScoped<IWalletRepository, WalletRepository>();
        services.AddScoped<IGameRepository, GameRepository>();
        services.AddScoped<IIdempotencyRepository, IdempotencyRepository>();

        services.AddSingleton<ILaunchTokenService>(_ =>
            new LaunchTokenService(options.LaunchSigningKey));

        services.AddHttpClient<ISeamlessWalletClient, SeamlessWalletClient>();
        services.AddSingleton<IGmsSettings>(sp =>
        {
            var opts = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<GmsOptions>>().Value;
            return new GmsSettings(opts);
        });

        return services;
    }

    private sealed class GmsSettings(GmsOptions options) : IGmsSettings
    {
        public string PlayBaseUrl => options.PlayBaseUrl;
        public decimal MinLaunchBalance => options.MinLaunchBalance;
    }
}
