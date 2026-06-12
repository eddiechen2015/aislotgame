namespace Gms.Infrastructure.Options;

public sealed class GmsOptions
{
    public const string SectionName = "Gms";

    public string ConnectionString { get; set; } = "Data Source=gms.db";
    public string LaunchSigningKey { get; set; } = "dev-launch-signing-key-change-in-production-min-32-chars";
    public string PlayBaseUrl { get; set; } = "http://localhost:3000";
    public decimal MinLaunchBalance { get; set; } = 0m;
    public bool SkipSignatureValidation { get; set; } = true;
    public string InternalApiKey { get; set; } = "dev-internal-ges-key";
}
