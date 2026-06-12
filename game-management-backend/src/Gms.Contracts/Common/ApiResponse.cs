namespace Gms.Contracts.Common;

public sealed class ApiResponse<T>
{
    public bool Success { get; init; }
    public T? Data { get; init; }
    public ApiError? Error { get; init; }
    public string RequestId { get; init; } = string.Empty;

    public static ApiResponse<T> Ok(T data, string requestId) => new()
    {
        Success = true,
        Data = data,
        RequestId = requestId
    };

    public static ApiResponse<T> Fail(string code, string message, string requestId) => new()
    {
        Success = false,
        Error = new ApiError { Code = code, Message = message },
        RequestId = requestId
    };
}

public sealed class ApiError
{
    public string Code { get; init; } = string.Empty;
    public string Message { get; init; } = string.Empty;
}
