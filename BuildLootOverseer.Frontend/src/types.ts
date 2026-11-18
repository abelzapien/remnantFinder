export type AppLanguage = 'es' | 'en';

export interface CopiedSaveFileMeta {
  fileName: string;
  sizeBytes: number;
  sha256: string;
  sourceLastWriteTimeUtc?: string;
  originalLastWriteUtc?: string;
}

export interface BackupEntryInfo {
  fileName: string;
  fullPath: string;
  createdAtUtc: string;
  sizeBytes: number;
  reason: string;
  combinedSha256: string;
}

export interface AccountAwardDto {
  id: string;
  name: string;
  nameEs: string;
}

export interface EquippedItemDto {
  slot: string;
  id: string;
  profileId: string;
  name: string;
  nameEs: string;
  type: string;
  level: number;
}

export interface LoadoutEntryDto {
  slot: string;
  id: string;
  name: string;
  nameEs: string;
  itemType: string;
  level: number;
}

export interface CharacterLoadoutDto {
  index: number;
  entries: LoadoutEntryDto[];
}

export interface CassShopItemDto {
  id: string;
  name: string;
  nameEs: string;
  type: string;
  isOwned: boolean;
}

export interface RolledItemDto {
  id: string;
  profileId: string;
  canonicalName: string;
  nameEs: string;
  type: string;
  weaponSubtype?: string | null;
  originType: string;
  originId: string;
  canonicalOriginName: string;
  originNameEs: string;
  howToObtainNote: string;
  prerequisiteRaw?: string | null;
  materialId?: string | null;
  isOwned: boolean;
  isLootedInWorld: boolean;
  isPrerequisiteMissing: boolean;
  hasRequiredMaterial: boolean;
  isCoop: boolean;
  isAccountAward: boolean;
  isInCassShop: boolean;
}

export interface DoorLinkDto {
  targetLocationName: string;
  targetLocationNameEs: string;
  doorCount: number;
  isMainPath: boolean;
  isUsed: boolean;
  isExitToParent: boolean;
}

export interface LocationDto {
  name: string;
  nameEs: string;
  world: string;
  worldEs: string;
  explorationStatus: 'Current' | 'Visited' | 'Undiscovered';
  isVisited: boolean;
  visitedCoordinatesCount: number;
  isRespawnLocation: boolean;
  respawnPointType: string;
  respawnPointName?: string | null;
  respawnPointFormatted?: string | null;
  zoneRole?: 'Overworld' | 'Miniboss' | 'SideDungeon' | 'WorldBoss' | 'SharedEvent' | 'Hub' | 'BossRush' | string;
  overworldIndex?: number;
  parentLocationName?: string | null;
  parentLocationNameEs?: string | null;
  isMainPathEntrance?: boolean;
  levelMin?: number;
  routeOrder?: number;
  routeGroupLabelEs?: string;
  routeGroupLabelEn?: string;
  doorLinks?: DoorLinkDto[];
  worldStones: string[];
  connections: string[];
  connectionsEs: string[];
  isTraitBookPresent: boolean;
  isTraitBookLooted: boolean;
  isSimulacrumPresent: boolean;
  isSimulacrumLooted: boolean;
  isBloodmoon: boolean;
  vendors: string[];
  vendorsEn?: string[];
  items: RolledItemDto[];
}

export interface ZoneDto {
  name: string;
  nameEs: string;
  story: string;
  storyEs: string;
  isFinished: boolean;
  isPlayerHere: boolean;
  totalLocations: number;
  visitedLocations: number;
  pendingLocations: number;
  isBossRushNode?: boolean;
  locations: LocationDto[];
}

export interface RolledWorldDto {
  mode: 'Campaign' | 'Adventure';
  difficulty: string;
  difficultyEn?: string;
  playtimeFormatted: string;
  currentLocationName?: string | null;
  currentLocationNameEs?: string | null;
  currentWorldName?: string | null;
  currentWorldNameEs?: string | null;
  respawnPointType: string;
  respawnPointRawName?: string | null;
  respawnPointFormatted?: string | null;
  respawnPointFormattedEn?: string | null;
  totalLocationsCount: number;
  visitedLocationsCount: number;
  pendingLocationsCount: number;
  questInventoryNames: string[];
  zones: ZoneDto[];
}

export interface CharacterDto {
  listIndex: number;
  saveSlotIndex: number;
  saveFileName: string;
  primaryArchetype: string;
  primaryArchetypeEs: string;
  secondaryArchetype?: string | null;
  secondaryArchetypeEs?: string | null;
  summary: string;
  summaryEn?: string;
  powerLevel: number;
  itemLevel: number;
  traitRank: number;
  lastSavedTraitPoints: number;
  isHardcore: boolean;
  gender: string;
  playtimeFormatted: string;
  playtimeHours: number;
  activeWorldSlot: 'Campaign' | 'Adventure';
  acquiredItemsCount: number;
  missingItemsCount: number;
  totalTrackableItemsCount: number;
  acquiredItemIds: string[];
  acquiredProfileIds: string[];
  missingItemIds: string[];
  hasRequiredMaterialItemIds: string[];
  equippedItems: EquippedItemDto[];
  loadouts: CharacterLoadoutDto[];
  cassShop: CassShopItemDto[];
  campaign: RolledWorldDto;
  adventure?: RolledWorldDto | null;
}

export interface SaveDatasetDto {
  parsedAtUtc: string;
  sourceFolder: string;
  tempSnapshotFolder: string;
  copyDurationMs: number;
  parseDurationMs: number;
  combinedSha256: string;
  gameBuildNumber: number;
  activeCharacterSlot: number;
  activeCharacterListIndex: number;
  snapshotFiles: CopiedSaveFileMeta[];
  backups: BackupEntryInfo[];
  accountAwards: AccountAwardDto[];
  characters: CharacterDto[];
}

export interface SynergyTagDefinition {
  id: string;
  labelEs: string;
  labelEn: string;
  category: string;
  icon?: string;
  color?: string;
  rawTokens?: string[];
  toolkitTags?: string[];
  externalTokens?: string[];
  keywords: string[];
}

export interface CatalogItemStats {
  armor?: number;
  weight?: number;
  damage?: number;
  rps?: number;
  magazine?: number;
  crit?: number;
  weakspot?: number;
  stagger?: number;
}

export interface CatalogItem {
  id: string;
  toolkitId?: string | null;
  profileId: string;
  saveFileSlug?: string | null;
  canonicalName: string;
  nameEs: string;
  type: string;
  subtype?: string | null;
  dlc: string;
  description: string;
  descriptionEs?: string;
  howToObtainNote: string;
  howToObtainNoteEs?: string;
  acquisitionEs?: string;
  dropType?: string | null;
  dropReference?: string | null;
  world?: string | null;
  materialId?: string | null;
  prerequisite?: string | null;
  isCoop: boolean;
  isAccountAward: boolean;
  wikiLink: string;
  synergyTags: string[];
  rawToolkitTags: string[];
  externalTokens: string[];
  inlineMechanics: string[];
  linkedItems?: Record<string, any> | null;
  stats?: CatalogItemStats | null;
}

export interface CatalogPayload {
  generatedAtUtc: string;
  sources: {
    analyzerDbVersion: string;
    overseerLocalization: string;
    toolkitRepo: string;
  };
  synergyTagDefinitions: SynergyTagDefinition[];
  archetypeSynergyMap: Record<string, string[]>;
  totalItemsCount: number;
  matchedAnalyzerToToolkitCount: number;
  uiGlossaryEs?: Record<string, string>;
  notesDictionaryEs?: Record<string, string>;
  items: CatalogItem[];
}

export interface UserBuildPresetDto {
  id: string;
  name: string;
  activeSynergyTags: string[];
  wishlistItemIds: string[];
  wishlistToolkitIds: string[];
  wishlistItemNames: string[];
  importedSourceUrl?: string | null;
  notes: string;
}

export interface UserAppConfigDto {
  language: string;
  hideOwnedItems: boolean;
  hideLootedInWorld: boolean;
  hasCompletedSetup?: boolean;
  savePlatform?: 'Steam' | 'Epic' | 'Xbox' | 'Custom' | string;
  customSaveFolder?: string | null;
  donationUrl?: string;
  activeBuildId: string;
  builds: UserBuildPresetDto[];
}

export interface AppBrandingDto {
  author?: string;
  appVersion: string;
  license: string;
  defaultDonationUrl: string;
  repositoryUrl: string;
}

export interface SaveFolderInspectionDto {
  isValid: boolean;
  inputPath: string;
  normalizedPath: string;
  platformType: 'Steam' | 'Epic' | 'Xbox' | 'Custom' | string;
  directoryExists: boolean;
  hasProfileSav: boolean;
  worldSaveFiles: string[];
  lastModifiedUtc?: string | null;
}

export interface SaveAccountSubfolderDto {
  accountId: string;
  fullPath: string;
  hasProfileSav: boolean;
  worldSaveFiles: string[];
  lastModifiedUtc?: string | null;
}

export interface PlatformDiscoveryItemDto {
  platform: 'Steam' | 'Epic' | 'Xbox' | string;
  baseFolder: string;
  baseFolderExists: boolean;
  recommendedPath: string;
  hasValidSaves: boolean;
  accounts: SaveAccountSubfolderDto[];
}

export interface PlatformDiscoveryResponseDto {
  activeSaveFolder: string;
  activeInspection: SaveFolderInspectionDto;
  platforms: PlatformDiscoveryItemDto[];
}

export type LootPriorityTier = 'gold' | 'purple' | 'green' | 'gray';

export interface EvaluatedLootItem {
  rolled: RolledItemDto;
  catalog?: CatalogItem;
  priority: LootPriorityTier;
  priorityRank: number; // 1 = Gold, 2 = Purple, 3 = Green, 4 = Gray
  priorityLabel: string;
  isWishlistMatch: boolean;
  matchedActiveTags: string[];
  matchedArchetypeTags: string[];
  synergyReasons: string[];
}
