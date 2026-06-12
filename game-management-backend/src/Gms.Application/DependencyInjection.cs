using Gms.Application.Abstractions;
using Gms.Application.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Gms.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IOperatorContext, OperatorContext>();
        services.AddScoped<PlayerService>();
        services.AddScoped<SessionService>();
        services.AddScoped<WalletService>();
        services.AddScoped<GameService>();
        return services;
    }
}
