namespace Gms.Application.Abstractions;

public interface IGmsSettings
{
    string PlayBaseUrl { get; }
    decimal MinLaunchBalance { get; }
}
