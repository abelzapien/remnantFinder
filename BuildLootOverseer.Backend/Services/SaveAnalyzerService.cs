using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using BuildLootOverseer.Backend.Models;
using lib.remnant2.analyzer;
using lib.remnant2.analyzer.Enums;
using lib.remnant2.analyzer.Model;

namespace BuildLootOverseer.Backend.Services;

public sealed class SaveAnalyzerService : IDisposable
{
    private readonly SafeSnapshotReader _snapshotReader;
    private readonly BackupService _backupService;
    private readonly SemaphoreSlim _analyzeLock = new(1, 1);
    private readonly Dictionary<string, string> _esStrings = new(StringComparer.OrdinalIgnoreCase);

    private Dataset? _lastRawDataset;
    private SaveDatasetDto? _lastMappedDto;
    private string? _configuredSaveFolder;

    public event Action<SaveDatasetDto>? OnDatasetUpdated;

    public SaveAnalyzerService(SafeSnapshotReader snapshotReader, BackupService backupService)
    {
        _snapshotReader = snapshotReader;
        _backupService = backupService;

        LoadSpanishResources();

        _snapshotReader.OnDebouncedSaveChanged += async () =>
        {
            var updated = await LoadAndAnalyzeAsync(
                forceRefresh: true,
                forceManualBackup: false,
                preserveLastGoodOnTransientError: true);
            if (updated != null && updated.Characters.Count > 0)
            {
                OnDatasetUpdated?.Invoke(updated);
            }
        };
    }

    public string GetActiveSaveFolder()
    {
        if (!string.IsNullOrWhiteSpace(_configuredSaveFolder) && Directory.Exists(_configuredSaveFolder))
        {
            return _configuredSaveFolder;
        }
        _configuredSaveFolder = SafeSnapshotReader.ResolveDefaultSaveFolder();
        return _configuredSaveFolder;
    }

    public void SetCustomSaveFolder(string folderPath)
    {
        string normalized = SafeSnapshotReader.NormalizeSaveFolderPath(folderPath);
        if (string.IsNullOrWhiteSpace(normalized) || !Directory.Exists(normalized))
        {
            throw new DirectoryNotFoundException($"Save directory not found: {folderPath}");
        }
        _configuredSaveFolder = Path.GetFullPath(normalized);
        _lastRawDataset = null;
        _lastMappedDto = null;
        _snapshotReader.StartWatching(_configuredSaveFolder);
    }

    public void StartWatching()
    {
        string folder = GetActiveSaveFolder();
        _snapshotReader.StartWatching(folder);
    }

    public async Task<SaveDatasetDto?> LoadAndAnalyzeAsync(
        bool forceRefresh = false,
        bool forceManualBackup = false,
        bool preserveLastGoodOnTransientError = false,
        CancellationToken ct = default)
    {
        await _analyzeLock.WaitAsync(ct);
        try
        {
            if (!forceRefresh && !forceManualBackup && _lastMappedDto != null && _lastMappedDto.Characters.Count > 0)
            {
                return _lastMappedDto;
            }

            string sourceFolder = GetActiveSaveFolder();

            SnapshotCopyResult? snapshot = null;
            Dataset? dataset = null;
            double parseElapsedMs = 0;
            Exception? lastError = null;

            const int maxParseAttempts = 4;
            for (int attempt = 1; attempt <= maxParseAttempts; attempt++)
            {
                try
                {
                    // 1. Copy .sav files in milliseconds using non-blocking ReadOnly FileShare to process-isolated temp/
                    snapshot = await _snapshotReader.CaptureSnapshotToTempAsync(sourceFolder, ct);

                    bool hasWorldSaveFiles = snapshot.Files.Any(f =>
                        f.FileName.StartsWith("save_", StringComparison.OrdinalIgnoreCase));

                    // 2. Run lib.remnant2.analyzer strictly on the temporary snapshot directory.
                    // On retry attempts (attempt >= 2), force a clean full parse (previous = null).
                    Dataset? prev = attempt == 1 ? _lastRawDataset : null;
                    var parseSw = Stopwatch.StartNew();
                    Dataset candidate = await Task.Run(() => Analyzer.Analyze(snapshot.SnapshotFolder, prev), ct);
                    parseSw.Stop();

                    // Guard against silent empty character list if save_*.sav was mid-write on disk
                    if (hasWorldSaveFiles && candidate.Characters.Count == 0)
                    {
                        throw new IOException(
                            "El juego aún está terminando de guardar en el punto de control (save_*.sav en transición).");
                    }

                    dataset = candidate;
                    parseElapsedMs = Math.Round(parseSw.Elapsed.TotalMilliseconds, 2);
                    lastError = null;
                    break;
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    lastError = ex;
                    if (attempt < maxParseAttempts)
                    {
                        await Task.Delay(320 * attempt, ct);
                    }
                }
            }

            if (dataset == null || snapshot == null)
            {
                if (preserveLastGoodOnTransientError && _lastMappedDto != null && _lastMappedDto.Characters.Count > 0)
                {
                    return _lastMappedDto;
                }
                throw lastError ?? new InvalidOperationException("No se pudo analizar la copia temporal del guardado.");
            }

            _lastRawDataset = dataset;

            int activeCharListIndex = GetActiveCharacterListIndex(dataset);
            string charSummary = "NoCharacter";
            int acquiredCount = 0;
            string? currentRespawnLoc = null;

            if (dataset.Characters.Count > 0)
            {
                Character activeChar = dataset.Characters[activeCharListIndex];
                string arch = activeChar.Profile.Archetype;
                string subArch = activeChar.Profile.SecondaryArchetype;
                charSummary = string.IsNullOrEmpty(subArch) ? arch : $"{arch}_{subArch}";
                acquiredCount = activeChar.Profile.AcquiredItems;
                RolledWorld activeWorld = activeChar.ActiveWorldSlot == WorldSlot.Adventure && activeChar.Save.Adventure != null
                    ? activeChar.Save.Adventure
                    : activeChar.Save.Campaign;
                currentRespawnLoc = activeWorld.RespawnPoint?.Name;

                // 3. Create rotating .zip backup if needed (strictly from valid temp snapshot to isolated backups/ folder)
                await _backupService.CreateBackupIfNeededAsync(
                    snapshot,
                    charSummary,
                    acquiredCount,
                    currentRespawnLoc,
                    forceManualBackup);
            }

            var backups = _backupService.ListBackups();

            // 4. Map to rich DTO
            var mapped = MapDatasetToDto(dataset, snapshot, backups, parseElapsedMs);
            if (mapped.Characters.Count > 0 || _lastMappedDto == null)
            {
                _lastMappedDto = mapped;
            }
            return _lastMappedDto;
        }
        finally
        {
            _analyzeLock.Release();
        }
    }

    private SaveDatasetDto MapDatasetToDto(
        Dataset dataset,
        SnapshotCopyResult snapshot,
        IReadOnlyList<BackupEntryInfo> backups,
        double parseDurationMs)
    {
        int activeListIndex = GetActiveCharacterListIndex(dataset);

        var accountAwards = dataset.AccountAwards.Select(awardId =>
        {
            LootItem? item = ItemDb.GetItemByIdOrDefault(awardId);
            string canonical = item?.Name ?? awardId;
            return new AccountAwardDto
            {
                Id = awardId,
                Name = canonical,
                NameEs = Translate(awardId, canonical)
            };
        }).ToList();

        var characters = new List<CharacterDto>(dataset.Characters.Count);
        for (int i = 0; i < dataset.Characters.Count; i++)
        {
            characters.Add(MapCharacter(dataset.Characters[i], i, dataset.AccountAwards));
        }

        return new SaveDatasetDto
        {
            ParsedAtUtc = DateTime.UtcNow,
            SourceFolder = snapshot.SourceFolder,
            TempSnapshotFolder = snapshot.SnapshotFolder,
            CopyDurationMs = snapshot.CopyDurationMs,
            ParseDurationMs = parseDurationMs,
            CombinedSha256 = snapshot.CombinedSha256,
            GameBuildNumber = dataset.ProfileSaveFile?.FileHeader.BuildNumber ?? 0,
            ActiveCharacterSlot = dataset.ActiveCharacterIndex,
            ActiveCharacterListIndex = activeListIndex,
            SnapshotFiles = snapshot.Files,
            Backups = backups,
            AccountAwards = accountAwards,
            Characters = characters
        };
    }

    private CharacterDto MapCharacter(Character c, int listIndex, List<string> accountAwards)
    {
        var missingItemIds = c.Profile.MissingItems
            .Select(x => x["Id"])
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var hasMatItemIds = c.Profile.HasMatsItems
            .Select(x => x["Id"])
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var cassShopIds = c.Save.CassShop
            .Select(x => x.Id)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var acquiredItemIds = c.Profile.Inventory
            .Where(x => x.Quantity is null or > 0)
            .Select(x => x.LootItem?.Id)
            .Where(id => !string.IsNullOrEmpty(id))
            .Select(id => id!)
            .Union(accountAwards, StringComparer.OrdinalIgnoreCase)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(id => id, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var acquiredProfileIds = c.Profile.Inventory
            .Where(x => x.Quantity is null or > 0 && !string.IsNullOrEmpty(x.ProfileId))
            .Select(x => x.ProfileId)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        // Equipped items & traits
        var equippedList = new List<EquippedItemDto>();
        foreach (InventoryItem eq in c.Profile.Inventory.Where(x => x.IsEquipped).OrderBy(x => x.IsTrait).ThenBy(x => x.EquippedSlot))
        {
            LootItem? li = eq.LootItem ?? ItemDb.GetItemByProfileId(eq.ProfileId);
            if (li == null) continue;
            string slotName = eq.IsTrait ? "Trait" : eq.EquippedSlot.ToString();
            equippedList.Add(new EquippedItemDto
            {
                Slot = slotName,
                Id = li.Id,
                ProfileId = eq.ProfileId,
                Name = li.Name,
                NameEs = Translate(li.Id, li.Name),
                Type = li.Type,
                Level = eq.Level ?? 0
            });
        }

        // Loadouts
        var loadoutsList = new List<CharacterLoadoutDto>();
        if (c.Profile.Loadouts != null)
        {
            for (int lIdx = 0; lIdx < c.Profile.Loadouts.Count; lIdx++)
            {
                var records = c.Profile.Loadouts[lIdx];
                if (records.Count == 0) continue;
                var entries = new List<LoadoutEntryDto>();
                foreach (LoadoutRecord r in records)
                {
                    LootItem? li = ItemDb.GetItemByProfileId(r.Id);
                    string itemId = li?.Id ?? r.Id;
                    string slotLabel = r.Type == LoadoutRecordType.Equipment
                        ? ((LoadoutSlot)r.Slot).ToString()
                        : "Trait";
                    entries.Add(new LoadoutEntryDto
                    {
                        Slot = slotLabel,
                        Id = itemId,
                        Name = r.Name,
                        NameEs = Translate(itemId, r.Name),
                        ItemType = r.ItemType,
                        Level = r.Level
                    });
                }
                loadoutsList.Add(new CharacterLoadoutDto
                {
                    Index = lIdx + 1,
                    Entries = entries
                });
            }
        }

        // Cass Shop
        var cassList = c.Save.CassShop.Select(item => new CassShopItemDto
        {
            Id = item.Id,
            Name = item.Name,
            NameEs = Translate(item.Id, item.Name),
            Type = item.Type,
            IsOwned = !missingItemIds.Contains(item.Id)
        }).ToList();

        string primaryArch = string.IsNullOrWhiteSpace(c.Profile.Archetype) ? "Unknown" : c.Profile.Archetype;
        string? secondaryArch = string.IsNullOrWhiteSpace(c.Profile.SecondaryArchetype) ? null : c.Profile.SecondaryArchetype;
        string primaryArchEs = Translate($"Archetype_{primaryArch}", primaryArch);
        string? secondaryArchEs = secondaryArch != null ? Translate($"Archetype_{secondaryArch}", secondaryArch) : null;

        string summary = secondaryArch != null
            ? $"{primaryArchEs} / {secondaryArchEs} ({c.Profile.AcquiredItems} obj.)"
            : $"{primaryArchEs} ({c.Profile.AcquiredItems} obj.)";

        string summaryEn = secondaryArch != null
            ? $"{primaryArch} / {secondaryArch} ({c.Profile.AcquiredItems} items)"
            : $"{primaryArch} ({c.Profile.AcquiredItems} items)";

        RolledWorldDto campaignDto = MapRolledWorld(c, c.Save.Campaign, "Campaign", missingItemIds, hasMatItemIds, cassShopIds);
        RolledWorldDto? adventureDto = c.Save.Adventure != null
            ? MapRolledWorld(c, c.Save.Adventure, "Adventure", missingItemIds, hasMatItemIds, cassShopIds)
            : null;

        TimeSpan playtime = c.Save.Playtime ?? TimeSpan.Zero;

        return new CharacterDto
        {
            ListIndex = listIndex,
            SaveSlotIndex = c.Index,
            SaveFileName = $"save_{c.Index}.sav",
            PrimaryArchetype = primaryArch,
            PrimaryArchetypeEs = primaryArchEs,
            SecondaryArchetype = secondaryArch,
            SecondaryArchetypeEs = secondaryArchEs,
            Summary = summary,
            SummaryEn = summaryEn,
            PowerLevel = c.Profile.PowerLevel,
            ItemLevel = c.Profile.ItemLevel,
            TraitRank = c.Profile.TraitRank,
            LastSavedTraitPoints = c.Profile.LastSavedTraitPoints,
            IsHardcore = c.Profile.IsHardcore,
            Gender = c.Profile.Gender,
            PlaytimeFormatted = Utils.FormatPlaytime(playtime),
            PlaytimeHours = Math.Round(playtime.TotalHours, 1),
            ActiveWorldSlot = c.ActiveWorldSlot.ToString(),
            AcquiredItemsCount = c.Profile.AcquiredItems,
            MissingItemsCount = missingItemIds.Count,
            TotalTrackableItemsCount = c.Profile.AcquiredItems + missingItemIds.Count,
            AcquiredItemIds = acquiredItemIds,
            AcquiredProfileIds = acquiredProfileIds,
            MissingItemIds = missingItemIds.OrderBy(x => x).ToList(),
            HasRequiredMaterialItemIds = hasMatItemIds.OrderBy(x => x).ToList(),
            EquippedItems = equippedList,
            Loadouts = loadoutsList,
            CassShop = cassList,
            Campaign = campaignDto,
            Adventure = adventureDto
        };
    }

    private RolledWorldDto MapRolledWorld(
        Character character,
        RolledWorld world,
        string mode,
        HashSet<string> missingItemIds,
        HashSet<string> hasMatItemIds,
        HashSet<string> cassShopIds)
    {
        var containerAnalysis = ZoneExplorationAnalyzer.AnalyzeWorldContainer(character, mode);
        var visitedCoordsByLabel = containerAnalysis.VisitedCoordinatesByLabel;

        var allZones = new List<Zone>(world.Zones) { world.Ward13 };
        var mappedZones = new List<ZoneDto>(allZones.Count);

        string? currentLocationName = null;
        string? currentLocationNameEs = null;
        string? currentWorldName = null;
        string? currentWorldNameEs = null;

        foreach (Zone z in allZones)
        {
            var zoneTopology = ZoneExplorationAnalyzer.BuildZoneTopology(z, containerAnalysis);
            var mappedLocations = new List<LocationDto>(z.Locations.Count);
            foreach (Location loc in z.Locations)
            {
                LocationExplorationInfo expInfo = ZoneExplorationAnalyzer.EvaluateLocation(
                    loc,
                    visitedCoordsByLabel,
                    world.RespawnPoint);

                var mappedItems = new List<RolledItemDto>();
                foreach (LootGroup lg in loc.LootGroups)
                {
                    foreach (LootItemExtended item in lg.Items)
                    {
                        bool isOwned = !missingItemIds.Contains(item.Id);
                        string originType = lg.Type.Replace(" ", "");
                        string canonicalOrigin = lg.Name ?? string.Empty;
                        string originId = originType.Equals("Vendor", StringComparison.OrdinalIgnoreCase)
                            ? canonicalOrigin
                            : (lg.EventDropReference ?? string.Empty);

                        item.Properties.TryGetValue("Subtype", out string? weaponSubtype);
                        item.Properties.TryGetValue("Prerequisite", out string? prereqRaw);
                        item.Properties.TryGetValue("Material", out string? materialId);
                        bool isCoop = item.Properties.TryGetValue("Coop", out string? coopVal) && coopVal == "True";
                        bool inCass = originType.Equals("Vendor", StringComparison.OrdinalIgnoreCase)
                                      && canonicalOrigin.Equals("Cass", StringComparison.OrdinalIgnoreCase)
                                      && cassShopIds.Contains(item.Id);

                        mappedItems.Add(new RolledItemDto
                        {
                            Id = item.Id,
                            ProfileId = item.Properties.GetValueOrDefault("ProfileId") ?? string.Empty,
                            CanonicalName = item.Name,
                            NameEs = Translate(item.Id, item.Name),
                            Type = item.Type.Replace("_", ""),
                            WeaponSubtype = weaponSubtype,
                            OriginType = originType,
                            OriginId = originId,
                            CanonicalOriginName = canonicalOrigin,
                            OriginNameEs = !string.IsNullOrEmpty(originId)
                                ? Translate(originId, canonicalOrigin)
                                : Translate(canonicalOrigin, canonicalOrigin),
                            HowToObtainNote = item.ItemNotes ?? string.Empty,
                            PrerequisiteRaw = prereqRaw,
                            MaterialId = materialId,
                            IsOwned = isOwned,
                            IsLootedInWorld = item.IsLooted,
                            IsPrerequisiteMissing = item.IsPrerequisiteMissing,
                            HasRequiredMaterial = item.HasRequiredMaterial || hasMatItemIds.Contains(item.Id),
                            IsCoop = isCoop,
                            IsAccountAward = item.IsVendoredAccountAward,
                            IsInCassShop = inCass
                        });
                    }
                }

                string locNameEs = TranslateLocationName(loc.Name);
                string worldEs = Translate(loc.World, loc.World);

                if (expInfo.IsCurrentRespawnLocation)
                {
                    currentLocationName = loc.Name;
                    currentLocationNameEs = locNameEs;
                    currentWorldName = z.Name;
                    currentWorldNameEs = Translate(z.Name, z.Name);
                }

                zoneTopology.TryGetValue(loc.Name, out ResolvedLocationTopology? topo);
                string zoneRole = topo?.ZoneRole ?? (loc.Name.Contains('/') ? "SharedEvent" : "SideDungeon");
                int overworldIdx = topo?.OverworldIndex ?? 0;
                string? parentLocName = topo?.ParentLocationName;
                string? parentLocNameEs = parentLocName != null
                    ? TranslateLocationName(parentLocName)
                    : (zoneRole == "SharedEvent" ? locNameEs : null);
                bool isMainEntrance = topo?.IsMainPathEntrance ?? false;
                int levelMin = topo?.LevelMin ?? 0;
                int routeOrder = topo?.RouteOrder ?? mappedLocations.Count;
                string routeGroupLabelEs = FormatRouteGroupLabelEs(topo?.RouteGroupKey ?? string.Empty);
                string routeGroupLabelEn = FormatRouteGroupLabelEn(topo?.RouteGroupKey ?? string.Empty);

                var doorLinks = topo?.DoorEdges.Select(e => new DoorLinkDto
                {
                    TargetLocationName = e.TargetLocationName,
                    TargetLocationNameEs = TranslateLocationName(e.TargetLocationName),
                    DoorCount = e.DoorCount,
                    IsMainPath = e.IsMainPath,
                    IsUsed = e.IsUsed,
                    IsExitToParent = e.IsExitToParent
                }).ToList() ?? [];

                mappedLocations.Add(new LocationDto
                {
                    Name = loc.Name,
                    NameEs = locNameEs,
                    World = loc.World,
                    WorldEs = worldEs,
                    ExplorationStatus = expInfo.Status,
                    IsVisited = expInfo.IsVisited,
                    VisitedCoordinatesCount = expInfo.VisitedCoordinatesCount,
                    IsRespawnLocation = expInfo.IsCurrentRespawnLocation,
                    RespawnPointType = expInfo.IsCurrentRespawnLocation && world.RespawnPoint != null
                        ? world.RespawnPoint.Type.ToString()
                        : "None",
                    RespawnPointName = expInfo.IsCurrentRespawnLocation ? world.RespawnPoint?.Name : null,
                    RespawnPointFormatted = expInfo.IsCurrentRespawnLocation
                        ? FormatRespawnPoint(world.RespawnPoint)
                        : null,
                    ZoneRole = zoneRole,
                    OverworldIndex = overworldIdx,
                    ParentLocationName = parentLocName,
                    ParentLocationNameEs = parentLocNameEs,
                    IsMainPathEntrance = isMainEntrance,
                    LevelMin = levelMin,
                    RouteOrder = routeOrder,
                    RouteGroupLabelEs = routeGroupLabelEs,
                    RouteGroupLabelEn = routeGroupLabelEn,
                    DoorLinks = doorLinks,
                    WorldStones = loc.WorldStones,
                    Connections = loc.Connections,
                    ConnectionsEs = loc.Connections.Select(TranslateConnection).ToList(),
                    IsTraitBookPresent = loc.TraitBook,
                    IsTraitBookLooted = loc.TraitBookLooted,
                    IsSimulacrumPresent = loc.Simulacrum,
                    IsSimulacrumLooted = loc.SimulacrumLooted,
                    IsBloodmoon = loc.Bloodmoon,
                    Vendors = loc.Vendors.Select(v => Translate(v, v)).ToList(),
                    VendorsEn = loc.Vendors.ToList(),
                    Items = mappedItems
                });
            }

            bool playerInZone = mappedLocations.Any(l => l.IsRespawnLocation);
            int visitedInZone = mappedLocations.Count(l => l.IsVisited);
            int totalInZone = mappedLocations.Count;

            mappedZones.Add(new ZoneDto
            {
                Name = z.Name,
                NameEs = Translate(z.Name, z.Name),
                Story = z.Story,
                StoryEs = Translate(z.Story, z.Story),
                IsFinished = z.Finished,
                IsPlayerHere = playerInZone,
                TotalLocations = totalInZone,
                VisitedLocations = visitedInZone,
                PendingLocations = totalInZone - visitedInZone,
                Locations = mappedLocations
            });
        }

        // Compute world-wide location counters (excluding Ward 13 so dungeon progress is pure world exploration)
        var playableZones = mappedZones.Where(z => !z.Name.Equals("Ward 13", StringComparison.OrdinalIgnoreCase)).ToList();
        int totalPlayableLocations = playableZones.Sum(z => z.TotalLocations);
        int visitedPlayableLocations = playableZones.Sum(z => z.VisitedLocations);
        int pendingPlayableLocations = totalPlayableLocations - visitedPlayableLocations;

        var questItemNames = world.QuestInventory
            .Select(x => ItemDb.GetItemByProfileId(x.ProfileId)?.Name ?? x.ProfileId)
            .OrderBy(n => n)
            .ToList();

        return new RolledWorldDto
        {
            Mode = mode,
            Difficulty = world.Difficulty switch
            {
                "Survivor" => "Superviviente",
                "Veteran" => "Veterano",
                "Nightmare" => "Pesadilla",
                "Apocalypse" => "Apocalipsis",
                _ => Translate(world.Difficulty, world.Difficulty)
            },
            DifficultyEn = world.Difficulty,
            PlaytimeFormatted = Utils.FormatPlaytime(world.Playtime),
            CurrentLocationName = currentLocationName,
            CurrentLocationNameEs = currentLocationNameEs,
            CurrentWorldName = currentWorldName,
            CurrentWorldNameEs = currentWorldNameEs,
            RespawnPointType = world.RespawnPoint?.Type.ToString() ?? "None",
            RespawnPointRawName = world.RespawnPoint?.Name,
            RespawnPointFormatted = FormatRespawnPoint(world.RespawnPoint),
            RespawnPointFormattedEn = FormatRespawnPointEn(world.RespawnPoint),
            TotalLocationsCount = totalPlayableLocations,
            VisitedLocationsCount = visitedPlayableLocations,
            PendingLocationsCount = pendingPlayableLocations,
            QuestInventoryNames = questItemNames,
            Zones = mappedZones
        };
    }

    private string? FormatRespawnPointEn(RespawnPoint? rp)
    {
        if (rp == null || rp.Type == RespawnPointType.None) return null;
        return rp.Type switch
        {
            RespawnPointType.WorldStone => $"World Stone: {rp.Name}",
            RespawnPointType.Checkpoint => $"Checkpoint: {rp.Name}",
            RespawnPointType.ZoneTransition => $"Zone Transition: {rp.Name.Replace("/", " → ")}",
            _ => rp.Name
        };
    }

    private string? FormatRespawnPoint(RespawnPoint? rp)
    {
        if (rp == null || rp.Type == RespawnPointType.None) return null;
        return rp.Type switch
        {
            RespawnPointType.WorldStone => $"Piedra de Mundo: {Translate(rp.Name, rp.Name)}",
            RespawnPointType.Checkpoint => $"Punto de control: {Translate(rp.Name, rp.Name)}",
            RespawnPointType.ZoneTransition => FormatTransition(rp.Name),
            _ => rp.Name
        };
    }

    private string FormatTransition(string raw)
    {
        string[] parts = raw.Split('/');
        if (parts.Length == 2)
        {
            return $"Transición de zona: {Translate(parts[0], parts[0])} → {Translate(parts[1], parts[1])}";
        }
        return $"Transición: {Translate(raw, raw)}";
    }

    private string TranslateLocationName(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return raw;
        if (raw.Contains('/'))
        {
            return string.Join(" / ", raw.Split('/').Select(part => Translate(part.Trim(), part.Trim())));
        }
        return Translate(raw.Trim(), raw.Trim());
    }

    private string FormatRouteGroupLabelEs(string routeGroupKey)
    {
        if (string.IsNullOrWhiteSpace(routeGroupKey)) return "Ruta del Mundo";
        if (routeGroupKey == "WorldBoss") return "👑 Jefe de Mundo";
        if (routeGroupKey == "SharedEvent") return "🤝 Evento Compartido";

        int colonIdx = routeGroupKey.IndexOf(':');
        if (colonIdx > 0)
        {
            string kind = routeGroupKey[..colonIdx];
            string locRaw = routeGroupKey[(colonIdx + 1)..];
            string locEs = TranslateLocationName(locRaw);

            if (kind.StartsWith("Overworld_", StringComparison.Ordinal))
            {
                string idxStr = kind["Overworld_".Length..];
                return $"🗺️ Zona Exterior {idxStr} · {locEs}";
            }
            if (kind is "Bridge" or "BridgeBoss")
            {
                return $"⚔️ Paso Conector · {locEs}";
            }
            return locEs;
        }
        return routeGroupKey;
    }

    private static string FormatRouteGroupLabelEn(string routeGroupKey)
    {
        if (string.IsNullOrWhiteSpace(routeGroupKey)) return "World Route";
        if (routeGroupKey == "WorldBoss") return "👑 World Boss";
        if (routeGroupKey == "SharedEvent") return "🤝 Shared Event";

        int colonIdx = routeGroupKey.IndexOf(':');
        if (colonIdx > 0)
        {
            string kind = routeGroupKey[..colonIdx];
            string locRaw = routeGroupKey[(colonIdx + 1)..].Trim();

            if (kind.StartsWith("Overworld_", StringComparison.Ordinal))
            {
                string idxStr = kind["Overworld_".Length..];
                return $"🗺️ Overworld {idxStr} · {locRaw}";
            }
            if (kind is "Bridge" or "BridgeBoss")
            {
                return $"⚔️ Connector · {locRaw}";
            }
            return locRaw;
        }
        return routeGroupKey;
    }

    private string TranslateConnection(string conn)
    {
        string canonical = conn.Trim();
        int dupIdx = canonical.LastIndexOf(" x", StringComparison.Ordinal);
        if (dupIdx > 0 && dupIdx + 2 < canonical.Length && int.TryParse(canonical[(dupIdx + 2)..], out _))
        {
            string baseLoc = canonical[..dupIdx];
            return $"{Translate(baseLoc, baseLoc)}{canonical[dupIdx..]}";
        }
        return Translate(canonical, canonical);
    }

    private string Translate(string key, string fallback)
    {
        if (string.IsNullOrWhiteSpace(key)) return fallback;
        if (_esStrings.TryGetValue(key.Trim(), out string? val) && !string.IsNullOrWhiteSpace(val))
        {
            return val;
        }
        return fallback;
    }

    private void LoadSpanishResources()
    {
        // Search for RemnantOverseer/Resources/GameStrings.es.resx and AppStrings.es.resx relative to workspace or base directory
        string[] candidateDirs =
        [
            Path.Combine(AppContext.BaseDirectory, "Resources"),
            Path.Combine(Directory.GetCurrentDirectory(), "RemnantOverseer", "Resources"),
            Path.Combine(Directory.GetCurrentDirectory(), "..", "RemnantOverseer", "Resources"),
            @"c:\Users\abelz\Workspace\remnantFinder\RemnantOverseer\Resources"
        ];

        foreach (string dir in candidateDirs)
        {
            if (!Directory.Exists(dir)) continue;

            foreach (string resxName in new[] { "GameStrings.es.resx", "AppStrings.es.resx" })
            {
                string filePath = Path.Combine(dir, resxName);
                if (!File.Exists(filePath)) continue;

                try
                {
                    XDocument doc = XDocument.Load(filePath);
                    foreach (XElement data in doc.Descendants("data"))
                    {
                        string? name = data.Attribute("name")?.Value;
                        string? value = data.Element("value")?.Value;
                        if (!string.IsNullOrWhiteSpace(name) && !string.IsNullOrWhiteSpace(value))
                        {
                            _esStrings[name] = value;
                        }
                    }
                }
                catch
                {
                    // Ignore malformed resx
                }
            }

            if (_esStrings.Count > 0) break;
        }
    }

    private static int GetActiveCharacterListIndex(Dataset dataset)
    {
        if (dataset.Characters.Count == 0) return 0;
        int[] indices = dataset.Characters.Select(c => c.Index).ToArray();
        int activeIdx = Array.IndexOf(indices, dataset.ActiveCharacterIndex);
        return activeIdx < 0 ? 0 : activeIdx;
    }

    public void Dispose()
    {
        _snapshotReader.Dispose();
        _analyzeLock.Dispose();
    }
}
