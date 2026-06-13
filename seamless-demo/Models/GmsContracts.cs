using System.Text.Json.Serialization;

namespace SeamlessDemo.Models;

// --- Requests to GMS ---

public sealed class GmsPlayerLoginRequest
{
    [JsonPropertyName("operatorPlayerId")]
    public string OperatorPlayerId { get; set; } = "";

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = "USD";

    [JsonPropertyName("displayName")]
    public string? DisplayName { get; set; }
}

public sealed class GmsGameLaunchRequest
{
    [JsonPropertyName("gameId")]
    public string GameId { get; set; } = "";

    [JsonPropertyName("sessionId")]
    public string SessionId { get; set; } = "";

    [JsonPropertyName("locale")]
    public string? Locale { get; set; }

    [JsonPropertyName("returnUrl")]
    public string? ReturnUrl { get; set; }

    [JsonPropertyName("lobbyUrl")]
    public string? LobbyUrl { get; set; }
}

// --- Responses from GMS ---

public sealed class GmsApiResponse<T>
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("data")]
    public T? Data { get; set; }

    [JsonPropertyName("error")]
    public GmsError? Error { get; set; }

    [JsonPropertyName("requestId")]
    public string? RequestId { get; set; }
}

public sealed class GmsError
{
    [JsonPropertyName("code")]
    public string? Code { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }
}

public sealed class GmsPlayerLoginResponse
{
    [JsonPropertyName("playerId")]
    public string PlayerId { get; set; } = "";

    [JsonPropertyName("operatorPlayerId")]
    public string OperatorPlayerId { get; set; } = "";

    [JsonPropertyName("sessionId")]
    public string SessionId { get; set; } = "";

    [JsonPropertyName("expiresAt")]
    public DateTime ExpiresAt { get; set; }

    [JsonPropertyName("walletType")]
    public string WalletType { get; set; } = "";

    [JsonPropertyName("isNewPlayer")]
    public bool IsNewPlayer { get; set; }
}

public sealed class GmsGameListData
{
    [JsonPropertyName("games")]
    public List<GmsGameItem> Games { get; set; } = new();

    [JsonPropertyName("pagination")]
    public GmsPagination? Pagination { get; set; }
}

public sealed class GmsGameItem
{
    [JsonPropertyName("gameId")]
    public string GameId { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("category")]
    public string Category { get; set; } = "";

    [JsonPropertyName("thumbnailUrl")]
    public string? ThumbnailUrl { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "";

    [JsonPropertyName("minBet")]
    public string? MinBet { get; set; }

    [JsonPropertyName("maxBet")]
    public string? MaxBet { get; set; }

    [JsonPropertyName("currencies")]
    public List<string>? Currencies { get; set; }
}

public sealed class GmsPagination
{
    [JsonPropertyName("page")]
    public int Page { get; set; }

    [JsonPropertyName("pageSize")]
    public int PageSize { get; set; }

    [JsonPropertyName("total")]
    public int Total { get; set; }
}

public sealed class GmsGameLaunchData
{
    [JsonPropertyName("launchUrl")]
    public string LaunchUrl { get; set; } = "";

    [JsonPropertyName("expiresAt")]
    public DateTime ExpiresAt { get; set; }

    [JsonPropertyName("gameId")]
    public string GameId { get; set; } = "";

    [JsonPropertyName("sessionId")]
    public string SessionId { get; set; } = "";
}

// --- Wallet Callback Models (GMS → seamless-demo) ---

public sealed class WalletCallbackRequest
{
    [JsonPropertyName("operatorPlayerId")]
    public string OperatorPlayerId { get; set; } = "";

    [JsonPropertyName("amount")]
    public string Amount { get; set; } = "0.00";

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = "";

    [JsonPropertyName("roundId")]
    public string RoundId { get; set; } = "";

    [JsonPropertyName("gameId")]
    public string GameId { get; set; } = "";

    [JsonPropertyName("transactionId")]
    public string TransactionId { get; set; } = "";

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; set; } = "";
}

public sealed class WalletCallbackResponse
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("balance")]
    public string? Balance { get; set; }

    [JsonPropertyName("operatorTransactionId")]
    public string? OperatorTransactionId { get; set; }

    [JsonPropertyName("errorCode")]
    public string? ErrorCode { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }
}
