using System;
using System.Collections.Generic;
using System.Linq;
using BuildLootOverseer.Backend.Models;
using lib.remnant2.analyzer.Model;
using lib.remnant2.saves.Model;
using lib.remnant2.saves.Model.Properties;

namespace BuildLootOverseer.Backend.Services;

public sealed class LocationExplorationInfo
{
    public required string LocationName { get; init; }
    public required int VisitedCoordinatesCount { get; init; }
    public required bool HasVisitedCoordinates { get; init; }
    public required bool HasLootedEventsOrItems { get; init; }
    public required bool IsCurrentRespawnLocation { get; init; }
    public required bool IsVisited { get; init; }
    public required string Status { get; init; } // "Current", "Visited", "Undiscovered"
}

public sealed class RawZoneLinkRecord
{
    public required string DestinationZoneNameId { get; init; }
    public required bool IsMainPath { get; init; }
    public required bool IsUsed { get; init; }
}

public sealed class RawZoneActorNode
{
    public required int ZoneId { get; init; }
    public required int ParentZoneId { get; init; }
    public required int LevelMin { get; init; }
    public required string NameId { get; init; }
    public required string Label { get; init; }
    public required string MapTemplate { get; init; }
    public required string TileSet { get; init; }
    public required int VisitedCoordinatesCount { get; init; }
    public required List<RawZoneLinkRecord> OutgoingLinks { get; init; }
}

public sealed class WorldContainerAnalysis
{
    public Dictionary<string, int> VisitedCoordinatesByLabel { get; } = new(StringComparer.OrdinalIgnoreCase);
    public List<RawZoneActorNode> ZoneNodes { get; } = [];
}

public sealed class ResolvedLocationTopology
{
    public required string LocationName { get; init; }
    public required string ZoneRole { get; init; } // "Overworld", "Miniboss", "SideDungeon", "WorldBoss", "SharedEvent", "Hub"
    public required int OverworldIndex { get; init; }
    public required string? ParentLocationName { get; init; }
    public required bool IsMainPathEntrance { get; init; }
    public required int LevelMin { get; init; }
    public required int RouteOrder { get; set; }
    public required string RouteGroupKey { get; set; }
    public required List<ResolvedDoorEdge> DoorEdges { get; init; }
}

public sealed class ResolvedDoorEdge
{
    public required string TargetLocationName { get; init; }
    public required int DoorCount { get; init; }
    public required bool IsMainPath { get; init; }
    public required bool IsUsed { get; init; }
    public required bool IsExitToParent { get; init; }
}

/// <summary>
/// Extracts 3D fog-of-war VisitedCoordinates AND the exact UE5 ZoneActor / ZoneLinkInfo door connectivity graph
/// (ParentZoneID, IsMainPath square vs arched doors, Used state, and World Route progression) from WorldSaveFile.
/// </summary>
public static class ZoneExplorationAnalyzer
{
    public static WorldContainerAnalysis AnalyzeWorldContainer(Character character, string mode)
    {
        var analysis = new WorldContainerAnalysis();
        SaveFile? worldSave = character.WorldSaveFile;
        if (worldSave?.SaveData?.Objects == null)
        {
            return analysis;
        }

        try
        {
            string selector = mode.Equals("adventure", StringComparison.OrdinalIgnoreCase)
                ? "Quest_AdventureMode"
                : "Quest_Campaign";

            UObject? main = worldSave.SaveData.Objects.FirstOrDefault(
                o => o.KeySelector == "/Game/Maps/Main.Main:PersistentLevel");

            if (main?.Properties == null || !main.Properties.Contains("Blob"))
            {
                return analysis;
            }

            Actor? metaActor = main.Properties["Blob"]
                .Get<PersistenceContainer>()
                .Actors
                .Select(x => x.Value)
                .LastOrDefault(x => x.ToString() != null && x.ToString()!.StartsWith(selector, StringComparison.Ordinal));

            if (metaActor == null)
            {
                return analysis;
            }

            UObject meta = metaActor.Archive.Objects[0];
            int rollId = meta.Properties!["ID"].Get<int>();
            string containerKey = $"/Game/Quest_{rollId}_Container.Quest_Container:PersistentLevel";

            UObject? rollObject = worldSave.SaveData.Objects.FirstOrDefault(
                o => o.KeySelector == containerKey);

            if (rollObject?.Properties == null || !rollObject.Properties.Contains("Blob"))
            {
                return analysis;
            }

            PersistenceContainer container = rollObject.Properties["Blob"].Get<PersistenceContainer>();
            foreach (var kvp in container.Actors)
            {
                Actor actor = kvp.Value;
                if (actor.DynamicData?.ClassPath.Name != "ZoneActor")
                {
                    continue;
                }

                UObject? zoneObj = actor.Archive.Objects.FirstOrDefault(x => x.Name == "ZoneActor")
                                   ?? actor.Archive.Objects.FirstOrDefault();
                if (zoneObj?.Properties == null || !zoneObj.Properties.Contains("Label"))
                {
                    continue;
                }

                string? rawLabel = zoneObj.Properties["Label"].ToStringValue();
                if (string.IsNullOrWhiteSpace(rawLabel))
                {
                    continue;
                }

                string trimmedLabel = rawLabel.Trim();
                int coordCount = zoneObj.ZoneActorExtraData?.VisitedCoordinates?.Count ?? 0;

                if (analysis.VisitedCoordinatesByLabel.TryGetValue(trimmedLabel, out int existing))
                {
                    analysis.VisitedCoordinatesByLabel[trimmedLabel] = Math.Max(existing, coordCount);
                }
                else
                {
                    analysis.VisitedCoordinatesByLabel[trimmedLabel] = coordCount;
                }

                int zoneId = zoneObj.Properties.Contains("ID") ? zoneObj.Properties["ID"].Get<int>() : -1;
                int parentZoneId = zoneObj.Properties.Contains("ParentZoneID") ? zoneObj.Properties["ParentZoneID"].Get<int>() : -1;
                int levelMin = zoneObj.Properties.Contains("LevelMin") ? zoneObj.Properties["LevelMin"].Get<int>() : -1;
                string nameId = zoneObj.Properties.Contains("NameID") ? zoneObj.Properties["NameID"].ToStringValue() ?? "" : "";
                string mapTemplate = zoneObj.Properties.Contains("MapTemplate") ? zoneObj.Properties["MapTemplate"].ToStringValue() ?? "" : "";
                string tileSet = zoneObj.Properties.Contains("TileSet") ? zoneObj.Properties["TileSet"].ToStringValue() ?? "" : "";

                var outLinks = new List<RawZoneLinkRecord>();
                if (zoneObj.Properties.Contains("ZoneLinks") && zoneObj.Properties["ZoneLinks"].Value is ArrayStructProperty asp)
                {
                    foreach (PropertyBag bag in asp.Items.OfType<PropertyBag>())
                    {
                        string linkType = bag.Contains("Type") ? bag["Type"].ToStringValue() ?? "" : "";
                        string destZone = bag.Contains("DestinationZone") ? bag["DestinationZone"].ToStringValue() ?? "" : "";
                        int isDisabled = bag.Contains("IsDisabled") ? bag["IsDisabled"].Get<byte>() : 0;
                        int isMain = bag.Contains("IsMainPath") ? bag["IsMainPath"].Get<byte>() : 0;
                        int used = bag.Contains("Used") ? bag["Used"].Get<byte>() : 0;

                        if (linkType == "EZoneLinkType::Link"
                            && !string.IsNullOrWhiteSpace(destZone)
                            && !destZone.Equals("None", StringComparison.OrdinalIgnoreCase)
                            && !destZone.Equals(nameId, StringComparison.OrdinalIgnoreCase)
                            && isDisabled == 0)
                        {
                            outLinks.Add(new RawZoneLinkRecord
                            {
                                DestinationZoneNameId = destZone,
                                IsMainPath = isMain != 0,
                                IsUsed = used != 0
                            });
                        }
                    }
                }

                analysis.ZoneNodes.Add(new RawZoneActorNode
                {
                    ZoneId = zoneId,
                    ParentZoneId = parentZoneId,
                    LevelMin = levelMin,
                    NameId = nameId,
                    Label = trimmedLabel,
                    MapTemplate = mapTemplate,
                    TileSet = tileSet,
                    VisitedCoordinatesCount = coordCount,
                    OutgoingLinks = outLinks
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ZoneExplorationAnalyzer] Non-fatal warning analyzing ZoneActors ({mode}): {ex.Message}");
        }

        return analysis;
    }

    public static Dictionary<string, ResolvedLocationTopology> BuildZoneTopology(
        Zone zone,
        WorldContainerAnalysis containerAnalysis)
    {
        var result = new Dictionary<string, ResolvedLocationTopology>(StringComparer.OrdinalIgnoreCase);
        if (zone.Locations.Count == 0)
        {
            return result;
        }

        // Map trimmed location name -> exact Location in this Zone
        var locByTrimmed = new Dictionary<string, Location>(StringComparer.OrdinalIgnoreCase);
        foreach (Location loc in zone.Locations)
        {
            locByTrimmed.TryAdd(loc.Name.Trim(), loc);
        }

        var nodeByNameId = containerAnalysis.ZoneNodes
            .Where(n => !string.IsNullOrWhiteSpace(n.NameId))
            .GroupBy(n => n.NameId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.LevelMin).First(), StringComparer.OrdinalIgnoreCase);

        var nodeByZoneId = containerAnalysis.ZoneNodes
            .Where(n => n.ZoneId >= 0)
            .GroupBy(n => n.ZoneId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.LevelMin).First());

        // Match each Location in Zone to its active RawZoneActorNode (preferring LevelMin >= 0)
        var matchedNodeByLocName = new Dictionary<string, RawZoneActorNode>(StringComparer.OrdinalIgnoreCase);
        foreach (Location loc in zone.Locations)
        {
            RawZoneActorNode? match = containerAnalysis.ZoneNodes
                .Where(n => string.Equals(n.Label, loc.Name.Trim(), StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(n => n.LevelMin)
                .FirstOrDefault();

            if (match != null)
            {
                matchedNodeByLocName[loc.Name] = match;
            }
        }

        // Classify initial roles
        var roleByLocName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var levelByLocName = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (int idx = 0; idx < zone.Locations.Count; idx++)
        {
            Location loc = zone.Locations[idx];
            matchedNodeByLocName.TryGetValue(loc.Name, out RawZoneActorNode? node);
            string role = ClassifyLocationRole(loc, node);
            roleByLocName[loc.Name] = role;
            levelByLocName[loc.Name] = node is { LevelMin: >= 0 } ? node.LevelMin : (idx + 1);
        }

        // Build physical DoorEdges for each Location in this Zone
        var rawEdgesByLocName = new Dictionary<string, List<(string TargetLocName, int Count, bool IsMain, bool IsUsed)>>(StringComparer.OrdinalIgnoreCase);

        foreach (Location loc in zone.Locations)
        {
            var edges = new List<(string TargetLocName, int Count, bool IsMain, bool IsUsed)>();

            if (matchedNodeByLocName.TryGetValue(loc.Name, out RawZoneActorNode? node) && node.OutgoingLinks.Count > 0)
            {
                var groupedTargets = node.OutgoingLinks
                    .Where(l => nodeByNameId.ContainsKey(l.DestinationZoneNameId))
                    .GroupBy(l => nodeByNameId[l.DestinationZoneNameId].Label, StringComparer.OrdinalIgnoreCase);

                foreach (var grp in groupedTargets)
                {
                    if (!locByTrimmed.TryGetValue(grp.Key, out Location? targetLoc))
                    {
                        continue; // Skip cross-world links (e.g., Labyrinth portal)
                    }
                    if (string.Equals(targetLoc.Name, loc.Name, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    RawZoneActorNode targetNode = nodeByNameId[grp.First().DestinationZoneNameId];
                    bool reverseMain = targetNode.OutgoingLinks.Any(rl =>
                        string.Equals(rl.DestinationZoneNameId, node.NameId, StringComparison.OrdinalIgnoreCase) && rl.IsMainPath);
                    bool reverseUsed = targetNode.OutgoingLinks.Any(rl =>
                        string.Equals(rl.DestinationZoneNameId, node.NameId, StringComparison.OrdinalIgnoreCase) && rl.IsUsed);

                    bool isMain = grp.Any(x => x.IsMainPath) || reverseMain;
                    bool isUsed = grp.Any(x => x.IsUsed) || reverseUsed;
                    edges.Add((targetLoc.Name, grp.Count(), isMain, isUsed));
                }
            }
            else if (loc.Connections.Count > 0)
            {
                // Fallback to analyzer Connections if ZoneActor links were absent
                foreach (string rawConn in loc.Connections)
                {
                    (string targetTrimmed, int count) = ParseConnectionString(rawConn);
                    if (locByTrimmed.TryGetValue(targetTrimmed, out Location? targetLoc)
                        && !string.Equals(targetLoc.Name, loc.Name, StringComparison.OrdinalIgnoreCase))
                    {
                        string tRole = roleByLocName[targetLoc.Name];
                        bool inferredMain = count > 1 || tRole is "Miniboss" or "WorldBoss" or "Overworld";
                        edges.Add((targetLoc.Name, count, inferredMain, false));
                    }
                }
            }

            rawEdgesByLocName[loc.Name] = edges;
        }

        // Isolated doorless rooms in multi-zone biomes (e.g., Alepsis-Taura void room) should not count as open Overworlds
        if (zone.Locations.Count > 1)
        {
            foreach (Location loc in zone.Locations)
            {
                if (roleByLocName[loc.Name] == "Overworld" && rawEdgesByLocName[loc.Name].Count == 0)
                {
                    roleByLocName[loc.Name] = "SideDungeon";
                }
            }
        }

        // Assign OverworldIndex (1, 2, ...) ordered by LevelMin then appearance
        var overworldsOrdered = zone.Locations
            .Where(l => roleByLocName[l.Name] == "Overworld")
            .OrderBy(l => levelByLocName[l.Name])
            .ToList();

        var overworldIndexByLocName = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < overworldsOrdered.Count; i++)
        {
            overworldIndexByLocName[overworldsOrdered[i].Name] = i + 1;
        }

        // Resolve ParentLocationName & IsMainPathEntrance for each Location
        string? firstOverworldName = overworldsOrdered.FirstOrDefault()?.Name;
        var parentByLocName = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        var mainEntranceByLocName = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);

        foreach (Location loc in zone.Locations)
        {
            string role = roleByLocName[loc.Name];
            if (role is "Hub" or "SharedEvent" || string.Equals(loc.Name, firstOverworldName, StringComparison.OrdinalIgnoreCase))
            {
                parentByLocName[loc.Name] = null;
                mainEntranceByLocName[loc.Name] = role == "Overworld";
                continue;
            }

            string? resolvedParent = null;
            if (matchedNodeByLocName.TryGetValue(loc.Name, out RawZoneActorNode? node)
                && node.ParentZoneId >= 0
                && nodeByZoneId.TryGetValue(node.ParentZoneId, out RawZoneActorNode? parentNode)
                && locByTrimmed.TryGetValue(parentNode.Label, out Location? parentLoc)
                && !string.Equals(parentLoc.Name, loc.Name, StringComparison.OrdinalIgnoreCase))
            {
                resolvedParent = parentLoc.Name;
            }

            var edges = rawEdgesByLocName[loc.Name];
            if (resolvedParent == null && edges.Count > 0)
            {
                // Fallback (e.g., DLC1 Palace of the One True King has ParentZoneID=-1, connected to Forlorn Coast with lower LevelMin)
                var candidate = edges
                    .OrderByDescending(e => roleByLocName[e.TargetLocName] == "Overworld" ? 1 : 0)
                    .ThenBy(e => levelByLocName[e.TargetLocName])
                    .FirstOrDefault(e => levelByLocName[e.TargetLocName] <= levelByLocName[loc.Name]);

                resolvedParent = candidate.TargetLocName ?? edges[0].TargetLocName;
            }

            parentByLocName[loc.Name] = resolvedParent;

            bool isMainEntrance = role is "Overworld" or "WorldBoss";
            if (resolvedParent != null)
            {
                var edgeWithParent = edges.FirstOrDefault(e =>
                    string.Equals(e.TargetLocName, resolvedParent, StringComparison.OrdinalIgnoreCase));
                if (edgeWithParent.TargetLocName != null)
                {
                    isMainEntrance = edgeWithParent.IsMain;
                }
            }
            mainEntranceByLocName[loc.Name] = isMainEntrance;
        }

        // Assemble ResolvedLocationTopology records
        foreach (Location loc in zone.Locations)
        {
            string? parentName = parentByLocName[loc.Name];
            var doorEdges = rawEdgesByLocName[loc.Name]
                .OrderByDescending(e => string.Equals(e.TargetLocName, parentName, StringComparison.OrdinalIgnoreCase) ? 1 : 0)
                .ThenByDescending(e => e.IsMain ? 1 : 0)
                .ThenBy(e => levelByLocName[e.TargetLocName])
                .Select(e => new ResolvedDoorEdge
                {
                    TargetLocationName = e.TargetLocName,
                    DoorCount = e.Count,
                    IsMainPath = e.IsMain,
                    IsUsed = e.IsUsed,
                    IsExitToParent = parentName != null && string.Equals(e.TargetLocName, parentName, StringComparison.OrdinalIgnoreCase)
                })
                .ToList();

            result[loc.Name] = new ResolvedLocationTopology
            {
                LocationName = loc.Name,
                ZoneRole = roleByLocName[loc.Name],
                OverworldIndex = overworldIndexByLocName.GetValueOrDefault(loc.Name, 0),
                ParentLocationName = parentName,
                IsMainPathEntrance = mainEntranceByLocName[loc.Name],
                LevelMin = levelByLocName[loc.Name],
                RouteOrder = 0,
                RouteGroupKey = string.Empty,
                DoorEdges = doorEdges
            };
        }

        // Compute natural World Route progression order (Overworld 1 + doors -> Connector -> Overworld 2 + doors -> World Boss)
        AssignWorldRouteOrder(zone.Locations, result);

        return result;
    }

    private static void AssignWorldRouteOrder(
        List<Location> locations,
        Dictionary<string, ResolvedLocationTopology> topologyMap)
    {
        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        int order = 0;

        // Identify which nodes are ancestors of an Overworld (e.g., connector dungeons / bridge bosses like The Putrid Domain or The Bloodless Throne)
        var leadsToOverworld = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var topo in topologyMap.Values.Where(t => t.ZoneRole == "Overworld" && t.OverworldIndex > 1))
        {
            string? curr = topo.ParentLocationName;
            int guard = 0;
            while (!string.IsNullOrEmpty(curr) && guard++ < 10)
            {
                if (topologyMap.TryGetValue(curr, out var pTopo) && pTopo.ZoneRole != "Overworld")
                {
                    leadsToOverworld.Add(curr);
                    curr = pTopo.ParentLocationName;
                }
                else
                {
                    break;
                }
            }
        }

        void VisitSubtree(string locName, string currentGroupKey, bool deferTerminalWorldBoss)
        {
            if (!visited.Add(locName) || !topologyMap.TryGetValue(locName, out var node))
            {
                return;
            }

            string effectiveGroup = node.ZoneRole switch
            {
                "Overworld" => $"Overworld_{node.OverworldIndex}:{node.LocationName}",
                "WorldBoss" when leadsToOverworld.Contains(locName) => $"BridgeBoss:{node.LocationName}",
                "WorldBoss" => "WorldBoss",
                "SharedEvent" => "SharedEvent",
                _ => string.IsNullOrEmpty(currentGroupKey) ? $"Root:{node.LocationName}" : currentGroupKey
            };

            node.RouteOrder = order++;
            node.RouteGroupKey = effectiveGroup;

            var children = topologyMap.Values
                .Where(c => string.Equals(c.ParentLocationName, locName, StringComparison.OrdinalIgnoreCase)
                            && !visited.Contains(c.LocationName))
                .ToList();

            // 1. Optional Side Dungeons of this zone first
            foreach (var side in children
                         .Where(c => !c.IsMainPathEntrance && c.ZoneRole != "Overworld" && !leadsToOverworld.Contains(c.LocationName))
                         .OrderBy(c => c.LevelMin))
            {
                VisitSubtree(side.LocationName, effectiveGroup, deferTerminalWorldBoss);
            }

            // 2. Main-Path Miniboss Dungeons that do NOT bridge to the next Overworld
            foreach (var mainD in children
                         .Where(c => c.IsMainPathEntrance && c.ZoneRole != "Overworld" && c.ZoneRole != "WorldBoss" && !leadsToOverworld.Contains(c.LocationName))
                         .OrderBy(c => c.LevelMin))
            {
                VisitSubtree(mainD.LocationName, effectiveGroup, deferTerminalWorldBoss);
            }

            // 3. Bridge dungeons/bosses or direct next Overworlds
            foreach (var bridge in children
                         .Where(c => leadsToOverworld.Contains(c.LocationName) || c.ZoneRole == "Overworld")
                         .OrderBy(c => c.LevelMin))
            {
                string nextGroup = leadsToOverworld.Contains(bridge.LocationName)
                    ? $"Bridge:{bridge.LocationName}"
                    : effectiveGroup;
                VisitSubtree(bridge.LocationName, nextGroup, deferTerminalWorldBoss);
            }

            // 4. Terminal World Boss (if not deferred to very end of biome)
            if (!deferTerminalWorldBoss)
            {
                foreach (var boss in children.Where(c => c.ZoneRole == "WorldBoss" && !visited.Contains(c.LocationName)))
                {
                    VisitSubtree(boss.LocationName, "WorldBoss", false);
                }
            }
        }

        // Start from root locations (excluding SharedEvent & deferred terminal WorldBosses)
        var roots = locations
            .Select(l => topologyMap[l.Name])
            .Where(t => t.ParentLocationName == null && t.ZoneRole != "SharedEvent")
            .OrderBy(t => t.ZoneRole == "Overworld" ? 0 : 1)
            .ThenBy(t => t.LevelMin)
            .ToList();

        foreach (var root in roots)
        {
            VisitSubtree(root.LocationName, "", deferTerminalWorldBoss: true);
        }

        // Visit any remaining non-WorldBoss, non-SharedEvent locations
        foreach (var loc in locations)
        {
            var t = topologyMap[loc.Name];
            if (!visited.Contains(loc.Name) && t.ZoneRole != "WorldBoss" && t.ZoneRole != "SharedEvent")
            {
                VisitSubtree(loc.Name, t.ParentLocationName ?? "", deferTerminalWorldBoss: false);
            }
        }

        // Visit terminal WorldBosses at the end of the world route
        foreach (var loc in locations)
        {
            var t = topologyMap[loc.Name];
            if (!visited.Contains(loc.Name) && t.ZoneRole == "WorldBoss")
            {
                VisitSubtree(loc.Name, "WorldBoss", deferTerminalWorldBoss: false);
            }
        }

        // Visit SharedEvents last
        foreach (var loc in locations)
        {
            if (!visited.Contains(loc.Name))
            {
                VisitSubtree(loc.Name, "SharedEvent", deferTerminalWorldBoss: false);
            }
        }
    }

    private static string ClassifyLocationRole(Location loc, RawZoneActorNode? node)
    {
        if (loc.Name.Contains('/'))
        {
            return "SharedEvent";
        }
        if (loc.Name.Trim().Equals("Ward 13", StringComparison.OrdinalIgnoreCase))
        {
            return "Hub";
        }

        string template = node?.MapTemplate ?? string.Empty;
        string tileSet = node?.TileSet ?? string.Empty;

        if (tileSet.Contains("Overworld", StringComparison.OrdinalIgnoreCase)
            || template.Contains("Overworld", StringComparison.OrdinalIgnoreCase)
            || template.Contains("Quest_Story_", StringComparison.OrdinalIgnoreCase)
            || template.Contains("Labyrinth_Main", StringComparison.OrdinalIgnoreCase)
            || template.Contains("Quest_RootEarth_Zone", StringComparison.OrdinalIgnoreCase))
        {
            return "Overworld";
        }

        if (tileSet.Contains("WorldBoss", StringComparison.OrdinalIgnoreCase)
            || template.Contains("Quest_Boss_", StringComparison.OrdinalIgnoreCase)
            || template.Contains("TowerBoss", StringComparison.OrdinalIgnoreCase)
            || loc.LootGroups.Any(g => g.Type.Equals("boss", StringComparison.OrdinalIgnoreCase)))
        {
            return "WorldBoss";
        }

        if (template.Contains("Quest_Miniboss_", StringComparison.OrdinalIgnoreCase)
            || loc.LootGroups.Any(g => g.Type.Equals("miniboss", StringComparison.OrdinalIgnoreCase)))
        {
            return "Miniboss";
        }

        return "SideDungeon";
    }

    private static (string Name, int Count) ParseConnectionString(string raw)
    {
        string trimmed = raw.Trim();
        int dupIdx = trimmed.LastIndexOf(" x", StringComparison.Ordinal);
        if (dupIdx > 0 && dupIdx + 2 < trimmed.Length && int.TryParse(trimmed[(dupIdx + 2)..], out int parsedCount))
        {
            return (trimmed[..dupIdx].Trim(), Math.Max(1, parsedCount));
        }
        return (trimmed, 1);
    }

    public static LocationExplorationInfo EvaluateLocation(
        Location location,
        IReadOnlyDictionary<string, int> visitedCoordsByLabel,
        RespawnPoint? respawnPoint)
    {
        string trimmedLocName = location.Name.Trim();
        bool isWard13 = trimmedLocName.Equals("Ward 13", StringComparison.OrdinalIgnoreCase);

        int coords = 0;
        if (visitedCoordsByLabel.TryGetValue(trimmedLocName, out int c))
        {
            coords = c;
        }
        else if (trimmedLocName.Contains('/'))
        {
            foreach (string part in trimmedLocName.Split('/'))
            {
                if (visitedCoordsByLabel.TryGetValue(part.Trim(), out int pc))
                {
                    coords += pc;
                }
            }
        }

        bool isRespawn = IsLocationRespawnPoint(location, respawnPoint);
        bool hasLootedActivity =
            location.TraitBookLooted ||
            location.SimulacrumLooted ||
            location.WorldDrops.Any(d => d.IsLooted) ||
            location.DropReferences.Any(d => d.IsLooted) ||
            location.LootedMarkers.Any(m => m.IsLooted) ||
            location.LootGroups.SelectMany(lg => lg.Items).Any(i => i.IsLooted);

        bool isVisited = isWard13 || isRespawn || coords > 0 || hasLootedActivity;
        string status = isRespawn ? "Current" : (isVisited ? "Visited" : "Undiscovered");

        return new LocationExplorationInfo
        {
            LocationName = location.Name,
            VisitedCoordinatesCount = coords,
            HasVisitedCoordinates = coords > 0,
            HasLootedEventsOrItems = hasLootedActivity,
            IsCurrentRespawnLocation = isRespawn,
            IsVisited = isVisited,
            Status = status
        };
    }

    public static bool IsLocationRespawnPoint(Location location, RespawnPoint? respawnPoint)
    {
        if (respawnPoint == null || respawnPoint.Type == lib.remnant2.analyzer.Enums.RespawnPointType.None)
        {
            return false;
        }

        string locTrimmed = location.Name.Trim();
        string rpTrimmed = respawnPoint.Name.Trim();

        return respawnPoint.Type switch
        {
            lib.remnant2.analyzer.Enums.RespawnPointType.WorldStone =>
                location.WorldStones.Any(ws => string.Equals(ws.Trim(), rpTrimmed, StringComparison.OrdinalIgnoreCase)),
            lib.remnant2.analyzer.Enums.RespawnPointType.Checkpoint =>
                string.Equals(locTrimmed, rpTrimmed, StringComparison.OrdinalIgnoreCase),
            lib.remnant2.analyzer.Enums.RespawnPointType.ZoneTransition =>
                string.Equals(locTrimmed, rpTrimmed.Split('/')[0].Trim(), StringComparison.OrdinalIgnoreCase),
            _ => false
        };
    }
}
