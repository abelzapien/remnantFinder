using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace BuildLootOverseer.Backend.Services;

public sealed class AppBrandingDto
{
    public const string DefaultAuthor = "Choppx";
    public const string KofiHandle = "choppx";
    public const string KofiUrl = $"https://ko-fi.com/{KofiHandle}";

    public string Author { get; set; } = DefaultAuthor;
    public string AppVersion { get; set; } = "1.0.0";
    public string License { get; set; } = "GPL-3.0";
    public string DefaultDonationUrl { get; set; } = KofiUrl;
    public string RepositoryUrl { get; set; } = "https://github.com/abelzapien/remnantFinder";
}

public sealed class UserAppConfigDto
{
    public string Language { get; set; } = "es";
    public bool HideOwnedItems { get; set; } = false;
    public bool HideLootedInWorld { get; set; } = false;
    public bool HasCompletedSetup { get; set; } = false;
    public string SavePlatform { get; set; } = "Steam"; // "Steam", "Epic", "Xbox", "Custom"
    public string? CustomSaveFolder { get; set; }
    public string DonationUrl { get; set; } = "";
    public string ActiveBuildId { get; set; } = "default";
    public List<UserBuildPresetDto> Builds { get; set; } =
    [
        new UserBuildPresetDto
        {
            Id = "default",
            Name = "Mi Build Principal",
            ActiveSynergyTags = ["Critical Chance", "Weakspot", "Mod Power"],
            WishlistItemIds = [],
            WishlistToolkitIds = [],
            WishlistItemNames = [],
            ImportedSourceUrl = null,
            Notes = ""
        }
    ];
}

public sealed class UserBuildPresetDto
{
    public string Id { get; set; } = "default";
    public string Name { get; set; } = "Mi Build";
    public List<string> ActiveSynergyTags { get; set; } = [];
    public List<string> WishlistItemIds { get; set; } = [];
    public List<string> WishlistToolkitIds { get; set; } = [];
    public List<string> WishlistItemNames { get; set; } = [];
    public string? ImportedSourceUrl { get; set; }
    public string Notes { get; set; } = "";
}

/// <summary>
/// Persists user builds, synergy tags, wishlist items, language, platform, and preferences strictly
/// in isolated app storage (never inside the Remnant 2 save folder).
/// </summary>
public sealed class UserStorageService
{
    private readonly SemaphoreSlim _ioLock = new(1, 1);
    private readonly string _configFilePath;
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public UserStorageService()
    {
        SaveGuardValidator.EnsureAppDirectories();
        _configFilePath = Path.Combine(SaveGuardValidator.ConfigRoot, "user-builds.json");
        SaveGuardValidator.AssertSafeWritePath(_configFilePath);
    }

    public static AppBrandingDto LoadBranding()
    {
        string[] candidates =
        [
            Path.Combine(AppContext.BaseDirectory, "app-branding.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "app-branding.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "..", "app-branding.json"),
            @"c:\Users\abelz\Workspace\remnantFinder\app-branding.json"
        ];

        string? path = candidates.FirstOrDefault(File.Exists);
        if (path != null)
        {
            try
            {
                string json = File.ReadAllText(path);
                var parsed = JsonSerializer.Deserialize<AppBrandingDto>(json, JsonOpts);
                if (parsed != null) return parsed;
            }
            catch
            {
                // Ignore malformed branding file
            }
        }
        return new AppBrandingDto();
    }

    public async Task<UserAppConfigDto> LoadConfigAsync()
    {
        await _ioLock.WaitAsync();
        try
        {
            var branding = LoadBranding();

            if (!File.Exists(_configFilePath))
            {
                var defaultCfg = new UserAppConfigDto
                {
                    DonationUrl = branding.DefaultDonationUrl
                };
                await WriteInternalAsync(defaultCfg);
                return defaultCfg;
            }

            string json = await File.ReadAllTextAsync(_configFilePath);
            var parsed = JsonSerializer.Deserialize<UserAppConfigDto>(json, JsonOpts) ?? new UserAppConfigDto();
            if (string.IsNullOrWhiteSpace(parsed.DonationUrl)
                || parsed.DonationUrl.Trim().Equals("https://ko-fi.com/", StringComparison.OrdinalIgnoreCase)
                || parsed.DonationUrl.Trim().Equals("https://ko-fi.com", StringComparison.OrdinalIgnoreCase))
            {
                parsed.DonationUrl = !string.IsNullOrWhiteSpace(branding.DefaultDonationUrl)
                    ? branding.DefaultDonationUrl
                    : AppBrandingDto.KofiUrl;
            }
            if (string.IsNullOrWhiteSpace(parsed.Language))
            {
                parsed.Language = "es";
            }
            if (string.IsNullOrWhiteSpace(parsed.SavePlatform))
            {
                parsed.SavePlatform = "Steam";
            }
            return parsed;
        }
        catch
        {
            return new UserAppConfigDto();
        }
        finally
        {
            _ioLock.Release();
        }
    }

    public async Task<UserAppConfigDto> SaveConfigAsync(UserAppConfigDto config)
    {
        await _ioLock.WaitAsync();
        try
        {
            await WriteInternalAsync(config);
            return config;
        }
        finally
        {
            _ioLock.Release();
        }
    }

    private async Task WriteInternalAsync(UserAppConfigDto config)
    {
        SaveGuardValidator.AssertSafeWritePath(_configFilePath, config.CustomSaveFolder);
        string json = JsonSerializer.Serialize(config, JsonOpts);
        await File.WriteAllTextAsync(_configFilePath, json);
    }
}
