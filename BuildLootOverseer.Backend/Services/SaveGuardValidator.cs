using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace BuildLootOverseer.Backend.Services;

/// <summary>
/// Enforces Rule #1 (Zero Write to Game Saves) and Rule #2 (Non-blocking Read-Only FileShare).
/// Any attempt to write inside the Remnant 2 save directory or outside the app's isolated storage
/// throws an immediate security exception.
/// </summary>
public static class SaveGuardValidator
{
    public static string AppStorageRoot { get; } = Path.GetFullPath(
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Remnant2BuildOverseer")
    );

    public static string TempRoot { get; } = Path.GetFullPath(Path.Combine(AppStorageRoot, "temp"));
    public static string BackupsRoot { get; } = Path.GetFullPath(Path.Combine(AppStorageRoot, "backups"));
    public static string ConfigRoot { get; } = Path.GetFullPath(Path.Combine(AppStorageRoot, "config"));

    public static void EnsureAppDirectories()
    {
        Directory.CreateDirectory(AppStorageRoot);
        Directory.CreateDirectory(TempRoot);
        Directory.CreateDirectory(BackupsRoot);
        Directory.CreateDirectory(ConfigRoot);
    }

    /// <summary>
    /// Returns all known Remnant 2 save root paths (Steam, Epic, Xbox Game Pass WGS, plus user-configured path).
    /// </summary>
    public static IReadOnlyList<string> GetProtectedGameSaveRoots(string? customSaveFolder = null)
    {
        var roots = new List<string>();

        string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (!string.IsNullOrWhiteSpace(userProfile))
        {
            roots.Add(Path.GetFullPath(Path.Combine(userProfile, "Saved Games", "Remnant2")));
        }

        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (!string.IsNullOrWhiteSpace(localAppData))
        {
            roots.Add(Path.GetFullPath(Path.Combine(
                localAppData,
                "Packages",
                "PerfectWorldEntertainment.GFREMP2_jrajkyc4tsa6w",
                "SystemAppData",
                "wgs")));
        }

        if (!string.IsNullOrWhiteSpace(customSaveFolder))
        {
            try
            {
                roots.Add(Path.GetFullPath(customSaveFolder));
            }
            catch
            {
                // Ignore malformed path
            }
        }

        return roots.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    /// <summary>
    /// Validates that a path about to be written to is strictly inside our AppStorageRoot
    /// and NEVER inside any Remnant 2 save directory.
    /// </summary>
    public static void AssertSafeWritePath(string targetPath, string? activeGameSaveFolder = null)
    {
        if (string.IsNullOrWhiteSpace(targetPath))
        {
            throw new ArgumentException("Target write path cannot be empty.", nameof(targetPath));
        }

        string fullTarget = Path.GetFullPath(targetPath);

        foreach (string protectedRoot in GetProtectedGameSaveRoots(activeGameSaveFolder))
        {
            if (IsSubPathOf(fullTarget, protectedRoot))
            {
                throw new UnauthorizedAccessException(
                    $"CRITICAL SAFETY BLOCK: Write operation to '{fullTarget}' is strictly forbidden because it resides inside the protected Remnant 2 save directory '{protectedRoot}'.");
            }
        }

        if (!IsSubPathOf(fullTarget, AppStorageRoot))
        {
            throw new UnauthorizedAccessException(
                $"CRITICAL SAFETY BLOCK: Write operation to '{fullTarget}' is outside isolated application storage '{AppStorageRoot}'.");
        }
    }

    /// <summary>
    /// Opens a game save file strictly in non-blocking read-only mode:
    /// FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete.
    /// </summary>
    public static FileStream OpenReadOnlyNonBlocking(string sourceFilePath)
    {
        if (!File.Exists(sourceFilePath))
        {
            throw new FileNotFoundException($"Save file not found: {sourceFilePath}", sourceFilePath);
        }

        return new FileStream(
            sourceFilePath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.ReadWrite | FileShare.Delete,
            bufferSize: 65536,
            useAsync: true);
    }

    private static bool IsSubPathOf(string candidatePath, string baseDirPath)
    {
        string normalizedCandidate = candidatePath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                                     + Path.DirectorySeparatorChar;
        string normalizedBase = baseDirPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                                + Path.DirectorySeparatorChar;

        return normalizedCandidate.StartsWith(normalizedBase, StringComparison.OrdinalIgnoreCase);
    }
}
