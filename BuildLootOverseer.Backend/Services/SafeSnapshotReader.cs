using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using lib.remnant2.analyzer.SaveLocation;

namespace BuildLootOverseer.Backend.Services;

public sealed class SnapshotCopyResult
{
    public required string SourceFolder { get; init; }
    public required string SnapshotFolder { get; init; }
    public required double CopyDurationMs { get; init; }
    public required DateTime SnapshotTimestampUtc { get; init; }
    public required IReadOnlyList<CopiedSaveFileMeta> Files { get; init; }
    public required string CombinedSha256 { get; init; }
}

public sealed class CopiedSaveFileMeta
{
    public required string FileName { get; init; }
    public required string SourcePath { get; init; }
    public required string TempPath { get; init; }
    public required long SizeBytes { get; init; }
    public required DateTime OriginalLastWriteUtc { get; init; }
    public required string Sha256 { get; init; }
}

public sealed class SaveFolderInspectionResult
{
    public required bool IsValid { get; init; }
    public required string InputPath { get; init; }
    public required string NormalizedPath { get; init; }
    public required string PlatformType { get; init; } // "Steam", "Epic", "Xbox", "Custom"
    public required bool DirectoryExists { get; init; }
    public required bool HasProfileSav { get; init; }
    public required IReadOnlyList<string> WorldSaveFiles { get; init; }
    public required DateTime? LastModifiedUtc { get; init; }
}

public sealed class SaveAccountSubfolderDto
{
    public required string AccountId { get; init; }
    public required string FullPath { get; init; }
    public required bool HasProfileSav { get; init; }
    public required IReadOnlyList<string> WorldSaveFiles { get; init; }
    public required DateTime? LastModifiedUtc { get; init; }
}

public sealed class PlatformDiscoveryItemDto
{
    public required string Platform { get; init; } // "Steam", "Epic", "Xbox"
    public required string BaseFolder { get; init; }
    public required bool BaseFolderExists { get; init; }
    public required string RecommendedPath { get; init; }
    public required bool HasValidSaves { get; init; }
    public required IReadOnlyList<SaveAccountSubfolderDto> Accounts { get; init; }
}

public sealed class PlatformDiscoveryResponseDto
{
    public required string ActiveSaveFolder { get; init; }
    public required SaveFolderInspectionResult ActiveInspection { get; init; }
    public required IReadOnlyList<PlatformDiscoveryItemDto> Platforms { get; init; }
}

/// <summary>
/// Implements Rule #2:
/// - Watches profile.sav and save_*.sav (plus Xbox Game Pass wgs containers.index & container blobs) with a 650ms debounce
/// - Opens source files strictly with FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete
/// - Copies bytes into memory in milliseconds, immediately closes the source handle, and writes to temp/
/// </summary>
public sealed class SafeSnapshotReader : IDisposable
{
    public const int DefaultDebounceMs = 650;

    private readonly FileSystemWatcher _watcher = new();
    private readonly SemaphoreSlim _copyLock = new(1, 1);
    private readonly object _timerLock = new();
    private readonly string _processSnapshotDir;
    private System.Threading.Timer? _debounceTimer;
    private string? _watchedFolder;
    private bool _watchingXboxWgs;
    private bool _disposed;

    public event Func<Task>? OnDebouncedSaveChanged;

    public SafeSnapshotReader()
    {
        SaveGuardValidator.EnsureAppDirectories();
        _processSnapshotDir = Path.Combine(
            SaveGuardValidator.TempRoot,
            $"snapshot_pid_{Environment.ProcessId}");

        _watcher.NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.CreationTime | NotifyFilters.Size;
        _watcher.Filter = "*.sav";
        _watcher.Changed += HandleFileEvent;
        _watcher.Created += HandleFileEvent;
        _watcher.Renamed += HandleFileEvent;
    }

    public static string GetDefaultSteamBaseFolder()
    {
        string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        return Path.Combine(userProfile, "Saved Games", "Remnant2", "Steam");
    }

    public static string GetDefaultEpicBaseFolder()
    {
        string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        return Path.Combine(userProfile, "Saved Games", "Remnant2", "Epic");
    }

    public static string GetDefaultXboxWgsBaseFolder()
    {
        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string packagesDir = Path.Combine(localAppData, "Packages");
        string canonical = Path.Combine(
            packagesDir,
            "PerfectWorldEntertainment.GFREMP2_jrajkyc4tsa6w",
            "SystemAppData",
            "wgs");

        if (Directory.Exists(canonical))
        {
            return canonical;
        }

        if (Directory.Exists(packagesDir))
        {
            try
            {
                string? altPkg = Directory.GetDirectories(packagesDir, "*GFREMP2*", SearchOption.TopDirectoryOnly)
                    .Select(d => Path.Combine(d, "SystemAppData", "wgs"))
                    .FirstOrDefault(Directory.Exists);
                if (altPkg != null)
                {
                    return altPkg;
                }
            }
            catch
            {
                // Ignore permission errors in Packages
            }
        }

        return canonical;
    }

    public static string ResolveDefaultSaveFolder()
    {
        try
        {
            string auto = SaveUtils.GetSaveFolder();
            if (!string.IsNullOrWhiteSpace(auto) && Directory.Exists(auto))
            {
                return NormalizeSaveFolderPath(auto);
            }
        }
        catch
        {
            // Fall through to manual platform discovery
        }

        var discovery = DiscoverPlatforms(null);
        var best = discovery.Platforms.FirstOrDefault(p => p.HasValidSaves);
        if (best != null && !string.IsNullOrWhiteSpace(best.RecommendedPath))
        {
            return best.RecommendedPath;
        }

        return GetDefaultSteamBaseFolder();
    }

    public static string NormalizeSaveFolderPath(string? rawPath)
    {
        if (string.IsNullOrWhiteSpace(rawPath))
        {
            return string.Empty;
        }

        string cleaned = Environment.ExpandEnvironmentVariables(rawPath.Trim().Trim('"'));
        try
        {
            cleaned = Path.GetFullPath(cleaned);
        }
        catch
        {
            return cleaned;
        }

        // If the user selected a file (e.g. profile.sav or containers.index)
        if (File.Exists(cleaned))
        {
            string fileName = Path.GetFileName(cleaned);
            string? dir = Path.GetDirectoryName(cleaned);
            if (dir == null) return cleaned;

            if (fileName.Equals("containers.index", StringComparison.OrdinalIgnoreCase))
            {
                string? parentWgs = Directory.GetParent(dir)?.FullName;
                if (parentWgs != null && TryResolveXboxWgsSaveFiles(parentWgs).Count > 0)
                {
                    return parentWgs;
                }
                return dir;
            }
            cleaned = dir;
        }

        if (!Directory.Exists(cleaned))
        {
            return cleaned;
        }

        // If user selected wgs\<UserHexId> directly (contains containers.index), check if parent wgs resolves cleanly
        if (File.Exists(Path.Combine(cleaned, "containers.index")))
        {
            string? parentWgs = Directory.GetParent(cleaned)?.FullName;
            if (parentWgs != null && TryResolveXboxWgsSaveFiles(parentWgs).Count > 0)
            {
                return parentWgs;
            }
            return cleaned;
        }

        // If user selected parent Steam or Epic base folder (e.g. ...\Remnant2\Steam) without picking the account ID subfolder,
        // auto-step into the most recently modified account subfolder that contains profile.sav
        bool hasDirectSav = Directory.EnumerateFiles(cleaned, "*.sav", SearchOption.TopDirectoryOnly)
            .Any(f => IsRelevantSaveFile(Path.GetFileName(f)));
        if (!hasDirectSav && TryResolveXboxWgsSaveFiles(cleaned).Count == 0)
        {
            try
            {
                var subCandidates = Directory.GetDirectories(cleaned, "*", SearchOption.TopDirectoryOnly)
                    .Select(sub =>
                    {
                        var savs = Directory.GetFiles(sub, "*.sav", SearchOption.TopDirectoryOnly)
                            .Where(f => IsRelevantSaveFile(Path.GetFileName(f)))
                            .ToList();
                        DateTime? latest = savs.Count > 0 ? savs.Max(File.GetLastWriteTimeUtc) : null;
                        return (Sub: sub, SavCount: savs.Count, Latest: latest);
                    })
                    .Where(x => x.SavCount > 0)
                    .OrderByDescending(x => x.Latest)
                    .ToList();

                if (subCandidates.Count > 0)
                {
                    return subCandidates[0].Sub;
                }
            }
            catch
            {
                // Keep cleaned path
            }
        }

        return cleaned;
    }

    public static bool IsXboxWgsDirectory(string? folderPath)
    {
        if (string.IsNullOrWhiteSpace(folderPath) || !Directory.Exists(folderPath))
        {
            return false;
        }

        if (folderPath.Contains($"{Path.DirectorySeparatorChar}wgs", StringComparison.OrdinalIgnoreCase) ||
            folderPath.Contains("GFREMP2", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (File.Exists(Path.Combine(folderPath, "containers.index")))
        {
            return true;
        }

        try
        {
            return Directory.EnumerateFiles(folderPath, "containers.index", SearchOption.AllDirectories).Any();
        }
        catch
        {
            return false;
        }
    }

    public static string InferPlatformFromPath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return "Custom";
        if (path.Contains("GFREMP2", StringComparison.OrdinalIgnoreCase) ||
            path.Contains($"{Path.DirectorySeparatorChar}wgs", StringComparison.OrdinalIgnoreCase) ||
            IsXboxWgsDirectory(path))
        {
            return "Xbox";
        }
        if (path.Contains($"{Path.DirectorySeparatorChar}Steam", StringComparison.OrdinalIgnoreCase))
        {
            return "Steam";
        }
        if (path.Contains($"{Path.DirectorySeparatorChar}Epic", StringComparison.OrdinalIgnoreCase))
        {
            return "Epic";
        }
        return "Custom";
    }

    public static SaveFolderInspectionResult InspectSaveFolder(string? candidatePath)
    {
        string raw = candidatePath?.Trim() ?? string.Empty;
        string normalized = NormalizeSaveFolderPath(raw);
        string platform = InferPlatformFromPath(normalized);

        if (string.IsNullOrWhiteSpace(normalized) || !Directory.Exists(normalized))
        {
            return new SaveFolderInspectionResult
            {
                IsValid = false,
                InputPath = raw,
                NormalizedPath = string.IsNullOrWhiteSpace(normalized) ? raw : normalized,
                PlatformType = platform,
                DirectoryExists = false,
                HasProfileSav = false,
                WorldSaveFiles = [],
                LastModifiedUtc = null
            };
        }

        var logicalFiles = ResolveLogicalSaveFiles(normalized);
        bool hasProfile = logicalFiles.Any(f => f.LogicalName.Equals("profile.sav", StringComparison.OrdinalIgnoreCase));
        var worldSaves = logicalFiles
            .Where(f => f.LogicalName.StartsWith("save_", StringComparison.OrdinalIgnoreCase))
            .Select(f => f.LogicalName)
            .OrderBy(n => n, StringComparer.OrdinalIgnoreCase)
            .ToList();

        DateTime? lastMod = null;
        if (logicalFiles.Count > 0)
        {
            try
            {
                lastMod = logicalFiles.Max(f => File.GetLastWriteTimeUtc(f.SourcePath));
            }
            catch
            {
                // Ignore timestamp error
            }
        }

        return new SaveFolderInspectionResult
        {
            IsValid = hasProfile,
            InputPath = raw,
            NormalizedPath = normalized,
            PlatformType = platform,
            DirectoryExists = true,
            HasProfileSav = hasProfile,
            WorldSaveFiles = worldSaves,
            LastModifiedUtc = lastMod
        };
    }

    public static PlatformDiscoveryResponseDto DiscoverPlatforms(string? currentActiveFolder)
    {
        var platforms = new List<PlatformDiscoveryItemDto>
        {
            InspectStandardPlatform("Steam", GetDefaultSteamBaseFolder()),
            InspectStandardPlatform("Epic", GetDefaultEpicBaseFolder()),
            InspectXboxPlatform(GetDefaultXboxWgsBaseFolder())
        };

        string activeFolder = !string.IsNullOrWhiteSpace(currentActiveFolder)
            ? currentActiveFolder
            : (platforms.FirstOrDefault(p => p.HasValidSaves)?.RecommendedPath ?? GetDefaultSteamBaseFolder());

        return new PlatformDiscoveryResponseDto
        {
            ActiveSaveFolder = activeFolder,
            ActiveInspection = InspectSaveFolder(activeFolder),
            Platforms = platforms
        };
    }

    private static PlatformDiscoveryItemDto InspectStandardPlatform(string platformName, string baseFolder)
    {
        var accounts = new List<SaveAccountSubfolderDto>();
        bool exists = Directory.Exists(baseFolder);

        if (exists)
        {
            try
            {
                // Check direct .sav files in baseFolder (some Epic installs put .sav directly or in an ID subfolder)
                var directFiles = ResolveDirectSavFiles(baseFolder);
                if (directFiles.Any(f => f.LogicalName.Equals("profile.sav", StringComparison.OrdinalIgnoreCase)))
                {
                    accounts.Add(new SaveAccountSubfolderDto
                    {
                        AccountId = platformName,
                        FullPath = baseFolder,
                        HasProfileSav = true,
                        WorldSaveFiles = directFiles
                            .Where(x => x.LogicalName.StartsWith("save_", StringComparison.OrdinalIgnoreCase))
                            .Select(x => x.LogicalName)
                            .ToList(),
                        LastModifiedUtc = directFiles.Max(x => File.GetLastWriteTimeUtc(x.SourcePath))
                    });
                }

                // Check account ID subfolders (e.g. Steam\303395815 or Epic\<AccountId>)
                foreach (string subDir in Directory.GetDirectories(baseFolder, "*", SearchOption.TopDirectoryOnly))
                {
                    var subFiles = ResolveDirectSavFiles(subDir);
                    bool hasProfile = subFiles.Any(f => f.LogicalName.Equals("profile.sav", StringComparison.OrdinalIgnoreCase));
                    var worldSaves = subFiles
                        .Where(x => x.LogicalName.StartsWith("save_", StringComparison.OrdinalIgnoreCase))
                        .Select(x => x.LogicalName)
                        .ToList();
                    DateTime? lastMod = subFiles.Count > 0
                        ? subFiles.Max(x => File.GetLastWriteTimeUtc(x.SourcePath))
                        : null;

                    accounts.Add(new SaveAccountSubfolderDto
                    {
                        AccountId = Path.GetFileName(subDir),
                        FullPath = subDir,
                        HasProfileSav = hasProfile,
                        WorldSaveFiles = worldSaves,
                        LastModifiedUtc = lastMod
                    });
                }
            }
            catch
            {
                // Ignore inaccessible subfolders
            }
        }

        accounts = accounts
            .OrderByDescending(a => a.HasProfileSav)
            .ThenByDescending(a => a.LastModifiedUtc ?? DateTime.MinValue)
            .ToList();

        var bestAccount = accounts.FirstOrDefault(a => a.HasProfileSav) ?? accounts.FirstOrDefault();

        return new PlatformDiscoveryItemDto
        {
            Platform = platformName,
            BaseFolder = baseFolder,
            BaseFolderExists = exists,
            RecommendedPath = bestAccount?.FullPath ?? baseFolder,
            HasValidSaves = accounts.Any(a => a.HasProfileSav),
            Accounts = accounts
        };
    }

    private static PlatformDiscoveryItemDto InspectXboxPlatform(string wgsFolder)
    {
        var accounts = new List<SaveAccountSubfolderDto>();
        bool exists = Directory.Exists(wgsFolder);

        if (exists)
        {
            try
            {
                var wgsFiles = TryResolveXboxWgsSaveFiles(wgsFolder);
                if (wgsFiles.Count > 0)
                {
                    bool hasProfile = wgsFiles.Any(f => f.LogicalName.Equals("profile.sav", StringComparison.OrdinalIgnoreCase));
                    var worldSaves = wgsFiles
                        .Where(f => f.LogicalName.StartsWith("save_", StringComparison.OrdinalIgnoreCase))
                        .Select(f => f.LogicalName)
                        .ToList();
                    DateTime? lastMod = wgsFiles.Max(f => File.GetLastWriteTimeUtc(f.SourcePath));

                    // Identify user container subfolder label if present
                    string accountLabel = "Xbox / PC Game Pass (wgs)";
                    var indexDir = Directory.GetDirectories(wgsFolder, "*", SearchOption.TopDirectoryOnly)
                        .FirstOrDefault(d => File.Exists(Path.Combine(d, "containers.index")));
                    if (indexDir != null)
                    {
                        string dirName = Path.GetFileName(indexDir);
                        accountLabel = dirName.Length > 20 ? $"{dirName[..16]}…" : dirName;
                    }

                    accounts.Add(new SaveAccountSubfolderDto
                    {
                        AccountId = accountLabel,
                        FullPath = wgsFolder,
                        HasProfileSav = hasProfile,
                        WorldSaveFiles = worldSaves,
                        LastModifiedUtc = lastMod
                    });
                }
            }
            catch
            {
                // Ignore wgs scan errors
            }
        }

        return new PlatformDiscoveryItemDto
        {
            Platform = "Xbox",
            BaseFolder = wgsFolder,
            BaseFolderExists = exists,
            RecommendedPath = wgsFolder,
            HasValidSaves = accounts.Any(a => a.HasProfileSav),
            Accounts = accounts
        };
    }

    public void StartWatching(string saveFolder)
    {
        string normalized = NormalizeSaveFolderPath(saveFolder);
        if (!Directory.Exists(normalized))
        {
            throw new DirectoryNotFoundException($"Save directory does not exist: {normalized}");
        }

        _watcher.EnableRaisingEvents = false;
        _watchedFolder = normalized;
        _watchingXboxWgs = IsXboxWgsDirectory(normalized);

        _watcher.Path = normalized;
        if (_watchingXboxWgs)
        {
            _watcher.IncludeSubdirectories = true;
            _watcher.Filter = "*";
        }
        else
        {
            _watcher.IncludeSubdirectories = false;
            _watcher.Filter = "*.sav";
        }
        _watcher.EnableRaisingEvents = true;
    }

    public void StopWatching()
    {
        _watcher.EnableRaisingEvents = false;
    }

    private void HandleFileEvent(object sender, FileSystemEventArgs e)
    {
        string name = Path.GetFileName(e.FullPath);
        if (_watchingXboxWgs)
        {
            if (!IsRelevantXboxWgsFile(name))
            {
                return;
            }
        }
        else
        {
            if (!IsRelevantSaveFile(name))
            {
                return;
            }
        }

        // Thread-safe reset of debounce timer on every write/rename event from the game
        lock (_timerLock)
        {
            if (_disposed) return;
            if (_debounceTimer == null)
            {
                _debounceTimer = new System.Threading.Timer(OnDebounceTimerElapsed, null, DefaultDebounceMs, Timeout.Infinite);
            }
            else
            {
                _debounceTimer.Change(DefaultDebounceMs, Timeout.Infinite);
            }
        }
    }

    private async void OnDebounceTimerElapsed(object? _)
    {
        if (_disposed || OnDebouncedSaveChanged == null) return;
        try
        {
            await OnDebouncedSaveChanged.Invoke();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[SafeSnapshotReader] Error in debounced callback: {ex.Message}");
        }
    }

    public static bool IsRelevantSaveFile(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName)) return false;
        return fileName.Equals("profile.sav", StringComparison.OrdinalIgnoreCase)
               || (fileName.StartsWith("save_", StringComparison.OrdinalIgnoreCase)
                   && fileName.EndsWith(".sav", StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsRelevantXboxWgsFile(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName)) return false;
        if (fileName.Equals("containers.index", StringComparison.OrdinalIgnoreCase)) return true;
        if (fileName.StartsWith("container.", StringComparison.OrdinalIgnoreCase)) return true;
        // Xbox Game Pass save blobs are 32 uppercase hex characters without extension
        return fileName.Length == 32 && fileName.All(Uri.IsHexDigit);
    }

    public static List<(string LogicalName, string SourcePath)> ResolveLogicalSaveFiles(string folderPath)
    {
        var direct = ResolveDirectSavFiles(folderPath);
        if (direct.Count > 0)
        {
            return direct;
        }
        return TryResolveXboxWgsSaveFiles(folderPath);
    }

    private static List<(string LogicalName, string SourcePath)> ResolveDirectSavFiles(string folderPath)
    {
        if (!Directory.Exists(folderPath)) return [];
        return Directory.GetFiles(folderPath, "*.sav", SearchOption.TopDirectoryOnly)
            .Where(f => IsRelevantSaveFile(Path.GetFileName(f)))
            .OrderBy(f => Path.GetFileName(f), StringComparer.OrdinalIgnoreCase)
            .Select(f => (Path.GetFileName(f).ToLowerInvariant(), f))
            .ToList();
    }

    /// <summary>
    /// Resolves Xbox / PC Game Pass WGS containers (containers.index -> container.<N> -> 32-hex blob)
    /// using both lib.remnant2.analyzer's SaveUtils.GetSavePath AND a direct binary containers.index fallback,
    /// preserving exact slot indices (profile.sav, save_0.sav .. save_9.sav).
    /// </summary>
    public static List<(string LogicalName, string SourcePath)> TryResolveXboxWgsSaveFiles(string folderPath)
    {
        var results = new List<(string LogicalName, string SourcePath)>();
        if (string.IsNullOrWhiteSpace(folderPath) || !Directory.Exists(folderPath))
        {
            return results;
        }

        // Candidate roots for SaveUtils.GetSavePath (expects the parent of the folder containing containers.index, e.g. wgs or wgs\t)
        var candidateWgsRoots = new List<string> { folderPath };
        var foundIndexFiles = new List<string>();
        try
        {
            foundIndexFiles = Directory.GetFiles(folderPath, "containers.index", SearchOption.AllDirectories).ToList();
            foreach (string idxFile in foundIndexFiles)
            {
                string? idxDir = Path.GetDirectoryName(idxFile);
                string? idxParent = idxDir != null ? Directory.GetParent(idxDir)?.FullName : null;
                if (!string.IsNullOrWhiteSpace(idxParent) && !candidateWgsRoots.Contains(idxParent, StringComparer.OrdinalIgnoreCase))
                {
                    candidateWgsRoots.Insert(0, idxParent);
                }
                if (!string.IsNullOrWhiteSpace(idxDir) && !candidateWgsRoots.Contains(idxDir, StringComparer.OrdinalIgnoreCase))
                {
                    candidateWgsRoots.Add(idxDir);
                }
            }
        }
        catch
        {
            // Ignore directory enumeration errors
        }

        foreach (string root in candidateWgsRoots)
        {
            try
            {
                string? wgsProfile = SaveUtils.GetSavePath(root, "profile");
                if (!string.IsNullOrWhiteSpace(wgsProfile) && File.Exists(wgsProfile))
                {
                    results.Add(("profile.sav", wgsProfile));
                    for (int slot = 0; slot < 10; slot++)
                    {
                        string? wgsSave = SaveUtils.GetSavePath(root, $"save_{slot}");
                        if (!string.IsNullOrWhiteSpace(wgsSave) && File.Exists(wgsSave))
                        {
                            results.Add(($"save_{slot}.sav", wgsSave));
                        }
                    }
                    return results;
                }
            }
            catch
            {
                // Fall through to direct containers.index binary parser
            }
        }

        // Direct fallback parser for UWP containers.index + container.<n>
        try
        {
            foreach (string idxPath in foundIndexFiles)
            {
                var parsed = ParseWgsContainersIndexFallback(idxPath);
                if (parsed.Any(p => p.LogicalName.Equals("profile.sav", StringComparison.OrdinalIgnoreCase)))
                {
                    return parsed;
                }
            }
        }
        catch
        {
            // Ignore malformed containers.index
        }

        return results;
    }

    /// <summary>
    /// Reads UWP containers.index + container.<n> strictly in non-blocking ReadOnly mode to map
    /// logical container names ("profile", "save_0".."save_9") to their 32-hex blob paths.
    /// </summary>
    private static List<(string LogicalName, string SourcePath)> ParseWgsContainersIndexFallback(string containersIndexPath)
    {
        var resolved = new List<(string LogicalName, string SourcePath)>();
        string? userWgsDir = Path.GetDirectoryName(containersIndexPath);
        if (string.IsNullOrWhiteSpace(userWgsDir) || !Directory.Exists(userWgsDir))
        {
            return resolved;
        }

        using var fs = SaveGuardValidator.OpenReadOnlyNonBlocking(containersIndexPath);
        byte[] indexBytes = new byte[fs.Length];
        _ = fs.Read(indexBytes, 0, indexBytes.Length);

        using var ms = new MemoryStream(indexBytes);
        using var br = new BinaryReader(ms);

        if (ms.Length < 16) return resolved;
        int version = br.ReadInt32();
        if (version is < 1 or > 20) return resolved;
        int containerCount = br.ReadInt32();
        if (containerCount is <= 0 or > 256) return resolved;

        static string ReadUtf16LenPrefixed(BinaryReader r)
        {
            int charLen = r.ReadInt32();
            if (charLen <= 0 || charLen > 2048) return string.Empty;
            byte[] raw = r.ReadBytes(charLen * 2);
            return Encoding.Unicode.GetString(raw);
        }

        _ = ReadUtf16LenPrefixed(br); // Package display name
        _ = ReadUtf16LenPrefixed(br); // Package family / store id
        _ = br.ReadInt64(); // Creation / sync filetime
        _ = br.ReadInt32(); // Flags
        _ = ReadUtf16LenPrefixed(br); // Unknown id

        for (int i = 0; i < containerCount && ms.Position + 24 <= ms.Length; i++)
        {
            string name1 = ReadUtf16LenPrefixed(br);
            _ = ReadUtf16LenPrefixed(br);
            _ = ReadUtf16LenPrefixed(br);
            byte containerNum = br.ReadByte();
            _ = br.ReadBytes(4);
            byte[] guidBytes = br.ReadBytes(16);
            _ = br.ReadInt64(); // FileTime
            _ = br.ReadInt64(); // Unknown
            _ = br.ReadInt64(); // Size

            var guid = new Guid(guidBytes);
            string folderGuidUpper = guid.ToString("N").ToUpperInvariant();
            string containerDir = Path.Combine(userWgsDir, folderGuidUpper);
            if (!Directory.Exists(containerDir)) continue;

            string normalizedName = name1.Trim().ToLowerInvariant();
            string? logicalSav = null;
            if (normalizedName == "profile" || normalizedName == "profile.sav")
            {
                logicalSav = "profile.sav";
            }
            else if (normalizedName.StartsWith("save_", StringComparison.Ordinal))
            {
                logicalSav = normalizedName.EndsWith(".sav", StringComparison.Ordinal)
                    ? normalizedName
                    : $"{normalizedName}.sav";
            }

            if (logicalSav == null) continue;

            // Locate the blob file inside containerDir (parse container.<containerNum> or pick the latest 32-hex blob)
            string containerMetaFile = Path.Combine(containerDir, $"container.{containerNum}");
            string? blobPath = TryResolveBlobFromContainerFile(containerDir, containerMetaFile);
            if (blobPath != null && File.Exists(blobPath))
            {
                resolved.Add((logicalSav, blobPath));
            }
        }

        return resolved
            .GroupBy(x => x.LogicalName, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.OrderByDescending(x => File.GetLastWriteTimeUtc(x.SourcePath)).First())
            .OrderBy(x => x.LogicalName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string? TryResolveBlobFromContainerFile(string containerDir, string containerMetaPath)
    {
        if (File.Exists(containerMetaPath))
        {
            try
            {
                using var fs = SaveGuardValidator.OpenReadOnlyNonBlocking(containerMetaPath);
                byte[] meta = new byte[fs.Length];
                _ = fs.Read(meta, 0, meta.Length);
                // Each entry in container.<n> ends with 2 x 16-byte GUIDs; the blob filename on disk is one of those GUIDs in uppercase "N" format
                for (int offset = 8; offset + 16 <= meta.Length; offset += 4)
                {
                    var g = new Guid(meta.AsSpan(offset, 16));
                    string candidate = Path.Combine(containerDir, g.ToString("N").ToUpperInvariant());
                    if (File.Exists(candidate))
                    {
                        return candidate;
                    }
                }
            }
            catch
            {
                // Fallback to scanning 32-hex files in containerDir
            }
        }

        return Directory.GetFiles(containerDir)
            .Where(f =>
            {
                string fn = Path.GetFileName(f);
                return fn.Length == 32 && fn.All(Uri.IsHexDigit);
            })
            .OrderByDescending(File.GetLastWriteTimeUtc)
            .FirstOrDefault();
    }

    /// <summary>
    /// Copies profile.sav and save_*.sav (or Xbox Game Pass WGS blobs) into an isolated temp directory.
    /// Source file handles are held only during in-memory buffer copy (typically &lt; 10 ms).
    /// </summary>
    public async Task<SnapshotCopyResult> CaptureSnapshotToTempAsync(string? sourceFolder = null, CancellationToken ct = default)
    {
        string resolvedSource = NormalizeSaveFolderPath(sourceFolder ?? _watchedFolder ?? ResolveDefaultSaveFolder());
        if (!Directory.Exists(resolvedSource))
        {
            throw new DirectoryNotFoundException($"Save folder not found: {resolvedSource}");
        }

        await _copyLock.WaitAsync(ct);
        try
        {
            SaveGuardValidator.EnsureAppDirectories();
            string snapshotDir = _processSnapshotDir;
            SaveGuardValidator.AssertSafeWritePath(snapshotDir, resolvedSource);
            Directory.CreateDirectory(snapshotDir);

            // Identify source files to copy; if UE5 is mid-atomic-rename, wait briefly so we capture a complete coherent set.
            List<(string LogicalName, string SourcePath)> logicalSourceFiles = [];
            bool isXboxWgs = IsXboxWgsDirectory(resolvedSource);
            bool expectsWorldSave = !isXboxWgs &&
                Directory.EnumerateFiles(resolvedSource, "save_*.bak*", SearchOption.TopDirectoryOnly).Any();

            for (int scanAttempt = 1; scanAttempt <= 8; scanAttempt++)
            {
                logicalSourceFiles = ResolveLogicalSaveFiles(resolvedSource);

                bool hasProfile = logicalSourceFiles.Any(f =>
                    f.LogicalName.Equals("profile.sav", StringComparison.OrdinalIgnoreCase));
                bool hasWorldSave = logicalSourceFiles.Any(f =>
                    f.LogicalName.StartsWith("save_", StringComparison.OrdinalIgnoreCase));

                if (hasProfile && (!expectsWorldSave || hasWorldSave))
                {
                    break;
                }

                if (scanAttempt < 8)
                {
                    await Task.Delay(150, ct);
                }
            }

            if (logicalSourceFiles.Count == 0)
            {
                throw new FileNotFoundException($"No profile.sav or save_*.sav files found in '{resolvedSource}'.");
            }

            // Phase A: Fast in-memory read of all save files so we release game file handles in milliseconds
            var memoryPayloads = new List<(string LogicalName, string SourcePath, byte[] Bytes, DateTime LastWriteUtc)>(logicalSourceFiles.Count);

            var sw = Stopwatch.StartNew();
            foreach (var (logicalName, srcPath) in logicalSourceFiles)
            {
                byte[] bytes = await ReadFileBytesWithRetryAsync(srcPath, ct);
                DateTime lastWriteUtc = File.GetLastWriteTimeUtc(srcPath);
                memoryPayloads.Add((logicalName, srcPath, bytes, lastWriteUtc));
            }
            sw.Stop();
            double sourceReadMs = sw.Elapsed.TotalMilliseconds;

            // Clean any stale files in snapshotDir that are no longer present
            var validNames = memoryPayloads.Select(p => p.LogicalName).ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (string existingFile in Directory.GetFiles(snapshotDir))
            {
                if (!validNames.Contains(Path.GetFileName(existingFile)))
                {
                    SaveGuardValidator.AssertSafeWritePath(existingFile, resolvedSource);
                    File.Delete(existingFile);
                }
            }

            // Phase B: Write from memory into our isolated temp folder
            var copiedFiles = new List<CopiedSaveFileMeta>(memoryPayloads.Count);
            using var incrementalHash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);

            foreach (var payload in memoryPayloads)
            {
                string tempFilePath = Path.Combine(snapshotDir, payload.LogicalName);
                SaveGuardValidator.AssertSafeWritePath(tempFilePath, resolvedSource);

                await File.WriteAllBytesAsync(tempFilePath, payload.Bytes, ct);
                File.SetLastWriteTimeUtc(tempFilePath, payload.LastWriteUtc);

                string fileSha256 = Convert.ToHexString(SHA256.HashData(payload.Bytes));
                incrementalHash.AppendData(payload.Bytes);

                copiedFiles.Add(new CopiedSaveFileMeta
                {
                    FileName = payload.LogicalName,
                    SourcePath = payload.SourcePath,
                    TempPath = tempFilePath,
                    SizeBytes = payload.Bytes.Length,
                    OriginalLastWriteUtc = payload.LastWriteUtc,
                    Sha256 = fileSha256
                });
            }

            return new SnapshotCopyResult
            {
                SourceFolder = resolvedSource,
                SnapshotFolder = snapshotDir,
                CopyDurationMs = Math.Round(sourceReadMs, 2),
                SnapshotTimestampUtc = DateTime.UtcNow,
                Files = copiedFiles,
                CombinedSha256 = Convert.ToHexString(incrementalHash.GetHashAndReset())
            };
        }
        finally
        {
            _copyLock.Release();
        }
    }

    private static async Task<byte[]> ReadFileBytesWithRetryAsync(string path, CancellationToken ct)
    {
        const int maxAttempts = 8;
        for (int attempt = 1; ; attempt++)
        {
            try
            {
                await using FileStream fs = SaveGuardValidator.OpenReadOnlyNonBlocking(path);
                long initialLength = fs.Length;
                if (initialLength < 64 && attempt < maxAttempts)
                {
                    throw new IOException($"Save file '{Path.GetFileName(path)}' is still initializing ({initialLength} bytes).");
                }

                byte[] buffer = new byte[initialLength];
                int offset = 0;
                while (offset < buffer.Length)
                {
                    int read = await fs.ReadAsync(buffer.AsMemory(offset, buffer.Length - offset), ct);
                    if (read == 0) break;
                    offset += read;
                }

                // Ensure the game did not append more bytes while we were reading
                if (fs.Length != initialLength && attempt < maxAttempts)
                {
                    throw new IOException($"Save file '{Path.GetFileName(path)}' grew during snapshot copy.");
                }

                if (offset == buffer.Length)
                {
                    return buffer;
                }
                return buffer[..offset];
            }
            catch (Exception ex) when ((ex is IOException or UnauthorizedAccessException) && attempt < maxAttempts)
            {
                await Task.Delay(90 * attempt, ct);
            }
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        lock (_timerLock)
        {
            _disposed = true;
            _debounceTimer?.Dispose();
            _debounceTimer = null;
        }
        _watcher.Dispose();
        _copyLock.Dispose();
        try
        {
            if (Directory.Exists(_processSnapshotDir))
            {
                SaveGuardValidator.AssertSafeWritePath(_processSnapshotDir);
                Directory.Delete(_processSnapshotDir, recursive: true);
            }
        }
        catch
        {
            // Ignore temp cleanup failure on exit
        }
    }
}
