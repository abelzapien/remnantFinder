using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace BuildLootOverseer.Backend.Services;

public sealed class BackupEntryInfo
{
    public required string FileName { get; init; }
    public required string FullPath { get; init; }
    public required DateTime CreatedAtUtc { get; init; }
    public required long SizeBytes { get; init; }
    public required string Reason { get; init; }
    public required string CharacterSummary { get; init; }
    public required string CombinedSha256 { get; init; }
}

/// <summary>
/// Implements Rule #3:
/// Maintains a rotating history of the last 10 compressed (.zip) backups of the user's .sav files
/// inside isolated app storage whenever important progress is detected or manually requested.
/// Operates strictly on the temporary snapshot copy so the game's save folder is never touched.
/// </summary>
public sealed class BackupService
{
    public const int MaxRotatingBackups = 10;
    private string? _lastBackedUpSha256;
    private int _lastAcquiredItemCount = -1;
    private string? _lastRespawnLocation;

    public BackupService()
    {
        SaveGuardValidator.EnsureAppDirectories();
    }

    public IReadOnlyList<BackupEntryInfo> ListBackups()
    {
        SaveGuardValidator.EnsureAppDirectories();
        var dir = new DirectoryInfo(SaveGuardValidator.BackupsRoot);
        if (!dir.Exists) return [];

        var list = new List<BackupEntryInfo>();
        foreach (FileInfo file in dir.GetFiles("backup_*.zip").OrderByDescending(f => f.CreationTimeUtc))
        {
            string reason = "Auto";
            string charSummary = "";
            string sha256 = "";

            try
            {
                using ZipArchive zip = ZipFile.OpenRead(file.FullName);
                ZipArchiveEntry? metaEntry = zip.GetEntry("backup-meta.json");
                if (metaEntry != null)
                {
                    using Stream s = metaEntry.Open();
                    using var doc = JsonDocument.Parse(s);
                    if (doc.RootElement.TryGetProperty("Reason", out var r)) reason = r.GetString() ?? reason;
                    if (doc.RootElement.TryGetProperty("CharacterSummary", out var c)) charSummary = c.GetString() ?? "";
                    if (doc.RootElement.TryGetProperty("CombinedSha256", out var h)) sha256 = h.GetString() ?? "";
                }
            }
            catch
            {
                // Ignore metadata read errors on older/manual zips
            }

            list.Add(new BackupEntryInfo
            {
                FileName = file.Name,
                FullPath = file.FullName,
                CreatedAtUtc = file.CreationTimeUtc,
                SizeBytes = file.Length,
                Reason = reason,
                CharacterSummary = charSummary,
                CombinedSha256 = sha256
            });
        }

        return list;
    }

    public async Task<BackupEntryInfo?> CreateBackupIfNeededAsync(
        SnapshotCopyResult snapshot,
        string characterSummary,
        int acquiredItemCount,
        string? currentRespawnLocation,
        bool forceManual = false)
    {
        SaveGuardValidator.EnsureAppDirectories();

        // Hydrate state from latest valid existing backup on first run
        if (_lastBackedUpSha256 == null)
        {
            var existing = ListBackups()
                .FirstOrDefault(b => !string.IsNullOrEmpty(b.CombinedSha256)
                                     && !string.Equals(b.CharacterSummary, "NoCharacter", StringComparison.OrdinalIgnoreCase));
            if (existing != null)
            {
                _lastBackedUpSha256 = existing.CombinedSha256;
            }
        }

        if (!forceManual && string.Equals(characterSummary, "NoCharacter", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        bool isInitialBackup = _lastBackedUpSha256 == null;
        bool hashChanged = !string.Equals(_lastBackedUpSha256, snapshot.CombinedSha256, StringComparison.OrdinalIgnoreCase);
        bool itemProgress = _lastAcquiredItemCount >= 0 && acquiredItemCount != _lastAcquiredItemCount;
        bool locationProgress = _lastRespawnLocation != null && !string.Equals(_lastRespawnLocation, currentRespawnLocation, StringComparison.Ordinal);

        string? triggerReason = null;
        if (forceManual)
        {
            triggerReason = "Respaldo manual";
        }
        else if (isInitialBackup)
        {
            triggerReason = "Respaldo inicial de sesión";
        }
        else if (hashChanged && itemProgress)
        {
            triggerReason = $"Progreso de inventario ({acquiredItemCount} ítems)";
        }
        else if (hashChanged && locationProgress)
        {
            triggerReason = $"Cambio de zona ({currentRespawnLocation ?? "Piedra de Mundo"})";
        }
        else if (hashChanged)
        {
            triggerReason = "Actualización de guardado detectada";
        }

        _lastAcquiredItemCount = acquiredItemCount;
        _lastRespawnLocation = currentRespawnLocation;

        if (triggerReason == null)
        {
            return null;
        }

        string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss_fff");
        string zipFileName = $"backup_{timestamp}.zip";
        string zipFullPath = Path.Combine(SaveGuardValidator.BackupsRoot, zipFileName);

        // Strictly verify we are writing inside BackupsRoot and never in the game folder
        SaveGuardValidator.AssertSafeWritePath(zipFullPath, snapshot.SourceFolder);

        await Task.Run(() =>
        {
            using var fs = new FileStream(zipFullPath, FileMode.Create, FileAccess.Write, FileShare.None);
            using var archive = new ZipArchive(fs, ZipArchiveMode.Create);

            foreach (CopiedSaveFileMeta file in snapshot.Files)
            {
                archive.CreateEntryFromFile(file.TempPath, file.FileName, CompressionLevel.Optimal);
            }

            var metaEntry = archive.CreateEntry("backup-meta.json", CompressionLevel.Optimal);
            using Stream metaStream = metaEntry.Open();
            var metadata = new
            {
                CreatedAtUtc = DateTime.UtcNow,
                Reason = triggerReason,
                CharacterSummary = characterSummary,
                AcquiredItemCount = acquiredItemCount,
                CurrentRespawnLocation = currentRespawnLocation,
                CombinedSha256 = snapshot.CombinedSha256,
                SourceFolder = snapshot.SourceFolder,
                Files = snapshot.Files.Select(f => new { f.FileName, f.SizeBytes, f.OriginalLastWriteUtc, f.Sha256 })
            };
            JsonSerializer.Serialize(metaStream, metadata, new JsonSerializerOptions { WriteIndented = true });
        });

        _lastBackedUpSha256 = snapshot.CombinedSha256;

        // Enforce rotating limit of MaxRotatingBackups (10)
        RotateOldBackups(snapshot.SourceFolder);

        var fileInfo = new FileInfo(zipFullPath);
        return new BackupEntryInfo
        {
            FileName = fileInfo.Name,
            FullPath = fileInfo.FullName,
            CreatedAtUtc = fileInfo.CreationTimeUtc,
            SizeBytes = fileInfo.Length,
            Reason = triggerReason,
            CharacterSummary = characterSummary,
            CombinedSha256 = snapshot.CombinedSha256
        };
    }

    private static void RotateOldBackups(string? activeGameSaveFolder)
    {
        var dir = new DirectoryInfo(SaveGuardValidator.BackupsRoot);
        if (!dir.Exists) return;

        var backups = dir.GetFiles("backup_*.zip")
            .OrderByDescending(f => f.CreationTimeUtc)
            .ToList();

        for (int i = MaxRotatingBackups; i < backups.Count; i++)
        {
            SaveGuardValidator.AssertSafeWritePath(backups[i].FullName, activeGameSaveFolder);
            backups[i].Delete();
        }
    }
}
