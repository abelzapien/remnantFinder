using System;
using System.Collections.Generic;
using BuildLootOverseer.Backend.Services;

namespace BuildLootOverseer.Backend.Models;

public sealed class SaveDatasetDto
{
    public required DateTime ParsedAtUtc { get; init; }
    public required string SourceFolder { get; init; }
    public required string TempSnapshotFolder { get; init; }
    public required double CopyDurationMs { get; init; }
    public required double ParseDurationMs { get; init; }
    public required string CombinedSha256 { get; init; }
    public required int GameBuildNumber { get; init; }
    public required int ActiveCharacterSlot { get; init; }
    public required int ActiveCharacterListIndex { get; init; }
    public required IReadOnlyList<CopiedSaveFileMeta> SnapshotFiles { get; init; }
    public required IReadOnlyList<BackupEntryInfo> Backups { get; init; }
    public required IReadOnlyList<AccountAwardDto> AccountAwards { get; init; }
    public required IReadOnlyList<CharacterDto> Characters { get; init; }
}

public sealed class AccountAwardDto
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string NameEs { get; init; }
}

public sealed class CharacterDto
{
    public required int ListIndex { get; init; }
    public required int SaveSlotIndex { get; init; }
    public required string SaveFileName { get; init; }
    public required string PrimaryArchetype { get; init; }
    public required string PrimaryArchetypeEs { get; init; }
    public required string? SecondaryArchetype { get; init; }
    public required string? SecondaryArchetypeEs { get; init; }
    public required string Summary { get; init; }
    public required string SummaryEn { get; init; }
    public required int PowerLevel { get; init; }
    public required int ItemLevel { get; init; }
    public required int TraitRank { get; init; }
    public required int LastSavedTraitPoints { get; init; }
    public required bool IsHardcore { get; init; }
    public required string Gender { get; init; }
    public required string PlaytimeFormatted { get; init; }
    public required double PlaytimeHours { get; init; }
    public required string ActiveWorldSlot { get; init; } // "Campaign" or "Adventure"
    public required int AcquiredItemsCount { get; init; }
    public required int MissingItemsCount { get; init; }
    public required int TotalTrackableItemsCount { get; init; }
    public required IReadOnlyList<string> AcquiredItemIds { get; init; }
    public required IReadOnlyList<string> AcquiredProfileIds { get; init; }
    public required IReadOnlyList<string> MissingItemIds { get; init; }
    public required IReadOnlyList<string> HasRequiredMaterialItemIds { get; init; }
    public required IReadOnlyList<EquippedItemDto> EquippedItems { get; init; }
    public required IReadOnlyList<CharacterLoadoutDto> Loadouts { get; init; }
    public required IReadOnlyList<CassShopItemDto> CassShop { get; init; }
    public required RolledWorldDto Campaign { get; init; }
    public required RolledWorldDto? Adventure { get; init; }
}

public sealed class EquippedItemDto
{
    public required string Slot { get; init; }
    public required string Id { get; init; }
    public required string ProfileId { get; init; }
    public required string Name { get; init; }
    public required string NameEs { get; init; }
    public required string Type { get; init; }
    public required int Level { get; init; }
}

public sealed class CharacterLoadoutDto
{
    public required int Index { get; init; }
    public required IReadOnlyList<LoadoutEntryDto> Entries { get; init; }
}

public sealed class LoadoutEntryDto
{
    public required string Slot { get; init; }
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string NameEs { get; init; }
    public required string ItemType { get; init; }
    public required int Level { get; init; }
}

public sealed class CassShopItemDto
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string NameEs { get; init; }
    public required string Type { get; init; }
    public required bool IsOwned { get; init; }
}

public sealed class RolledWorldDto
{
    public required string Mode { get; init; } // "Campaign" or "Adventure"
    public required string Difficulty { get; init; }
    public required string DifficultyEn { get; init; }
    public required string PlaytimeFormatted { get; init; }
    public required string? CurrentLocationName { get; init; }
    public required string? CurrentLocationNameEs { get; init; }
    public required string? CurrentWorldName { get; init; }
    public required string? CurrentWorldNameEs { get; init; }
    public required string RespawnPointType { get; init; }
    public required string? RespawnPointRawName { get; init; }
    public required string? RespawnPointFormatted { get; init; }
    public required string? RespawnPointFormattedEn { get; init; }
    public required int TotalLocationsCount { get; init; }
    public required int VisitedLocationsCount { get; init; }
    public required int PendingLocationsCount { get; init; }
    public required IReadOnlyList<string> QuestInventoryNames { get; init; }
    public required IReadOnlyList<ZoneDto> Zones { get; init; }
}

public sealed class ZoneDto
{
    public required string Name { get; init; }
    public required string NameEs { get; init; }
    public required string Story { get; init; }
    public required string StoryEs { get; init; }
    public required bool IsFinished { get; init; }
    public required bool IsPlayerHere { get; init; }
    public required int TotalLocations { get; init; }
    public required int VisitedLocations { get; init; }
    public required int PendingLocations { get; init; }
    public required IReadOnlyList<LocationDto> Locations { get; init; }
}

public sealed class DoorLinkDto
{
    public required string TargetLocationName { get; init; }
    public required string TargetLocationNameEs { get; init; }
    public required int DoorCount { get; init; }
    public required bool IsMainPath { get; init; } // true = Puerta Cuadrada (Principal/Jefe), false = Puerta Arqueada (Secundaria)
    public required bool IsUsed { get; init; } // true = puerta ya cruzada en save_*.sav
    public required bool IsExitToParent { get; init; }
}

public sealed class LocationDto
{
    public required string Name { get; init; }
    public required string NameEs { get; init; }
    public required string World { get; init; }
    public required string WorldEs { get; init; }
    public required string ExplorationStatus { get; init; } // "Current", "Visited", "Undiscovered"
    public required bool IsVisited { get; init; }
    public required int VisitedCoordinatesCount { get; init; }
    public required bool IsRespawnLocation { get; init; }
    public required string RespawnPointType { get; init; }
    public required string? RespawnPointName { get; init; }
    public required string? RespawnPointFormatted { get; init; }
    public required string ZoneRole { get; init; } // "Overworld", "Miniboss", "SideDungeon", "WorldBoss", "SharedEvent", "Hub"
    public required int OverworldIndex { get; init; } // 1 = Zona Exterior 1, 2 = Zona Exterior 2, 0 = otra
    public required string? ParentLocationName { get; init; }
    public required string? ParentLocationNameEs { get; init; }
    public required bool IsMainPathEntrance { get; init; }
    public required int LevelMin { get; init; }
    public required int RouteOrder { get; init; }
    public required string RouteGroupLabelEs { get; init; }
    public required string RouteGroupLabelEn { get; init; }
    public required IReadOnlyList<DoorLinkDto> DoorLinks { get; init; }
    public required IReadOnlyList<string> WorldStones { get; init; }
    public required IReadOnlyList<string> Connections { get; init; }
    public required IReadOnlyList<string> ConnectionsEs { get; init; }
    public required bool IsTraitBookPresent { get; init; }
    public required bool IsTraitBookLooted { get; init; }
    public required bool IsSimulacrumPresent { get; init; }
    public required bool IsSimulacrumLooted { get; init; }
    public required bool IsBloodmoon { get; init; }
    public required IReadOnlyList<string> Vendors { get; init; }
    public required IReadOnlyList<string> VendorsEn { get; init; }
    public required IReadOnlyList<RolledItemDto> Items { get; init; }
}

public sealed class RolledItemDto
{
    public required string Id { get; init; }
    public required string ProfileId { get; init; }
    public required string CanonicalName { get; init; }
    public required string NameEs { get; init; }
    public required string Type { get; init; }
    public required string? WeaponSubtype { get; init; }
    public required string OriginType { get; init; }
    public required string OriginId { get; init; }
    public required string CanonicalOriginName { get; init; }
    public required string OriginNameEs { get; init; }
    public required string HowToObtainNote { get; init; }
    public required string? PrerequisiteRaw { get; init; }
    public required string? MaterialId { get; init; }
    public required bool IsOwned { get; init; }
    public required bool IsLootedInWorld { get; init; }
    public required bool IsPrerequisiteMissing { get; init; }
    public required bool HasRequiredMaterial { get; init; }
    public required bool IsCoop { get; init; }
    public required bool IsAccountAward { get; init; }
    public required bool IsInCassShop { get; init; }
}
