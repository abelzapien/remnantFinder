import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const WORKSPACE_ROOT = 'c:\\Users\\abelz\\Workspace\\remnantFinder';
const DATA_DIR = path.join(WORKSPACE_ROOT, 'data');
const RAW_TOOLKIT_DIR = path.join(DATA_DIR, 'toolkit_raw');
const OVERSEER_RESX_DIR = path.join(WORKSPACE_ROOT, 'RemnantOverseer', 'Resources');

const TOOLKIT_BASE_URL = 'https://raw.githubusercontent.com/joshpayette/remnant2-toolkit/main/src/app';

const TOOLKIT_ITEM_FILES = [
  'amulet-items.ts',
  'archetype-items.ts',
  'armor-items.ts',
  'concoction-items.ts',
  'consumable-items.ts',
  'fusion-items.ts',
  'mod-items.ts',
  'mutator-items.ts',
  'perk-items.ts',
  'prism-items.ts',
  'relic-fragment-items.ts',
  'relic-items.ts',
  'ring-items.ts',
  'skill-items.ts',
  'trait-items.ts',
  'weapon-items.ts',
];

export const SYNERGY_TAG_DEFINITIONS = [
  {
    id: 'Critical Chance',
    labelEs: 'Prob. / Daño Crítico',
    labelEn: 'Critical Chance & Crit DMG',
    category: 'Ofensiva',
    icon: 'crosshair',
    rawTokens: [
      'Critical Chance',
      'Critical Damage',
      'Critical Hit',
      'Melee Critical Chance',
      'Melee Critical Damage',
      'Melee Critical Hit',
      'Weakspot Critical Chance',
    ],
    keywords: ['critical chance', 'critical damage', 'crit chance', 'crit damage', 'critical hit'],
  },
  {
    id: 'Weakspot',
    labelEs: 'Punto Débil (Weakspot)',
    labelEn: 'Weakspot',
    category: 'Ofensiva',
    icon: 'target',
    rawTokens: ['Weakspot Damage', 'Weakspot Hit', 'Weakspot Critical Chance'],
    keywords: ['weakspot'],
  },
  {
    id: 'Bleed',
    labelEs: 'Sangrado (Bleed)',
    labelEn: 'Bleed',
    category: 'Elemental / Estado',
    icon: 'droplet',
    rawTokens: ['Attack Dog', 'Guard Dog', 'Support Dog'],
    keywords: ['bleeding', 'bleed'],
  },
  {
    id: 'Fire/Burning',
    labelEs: 'Fuego / Quemadura',
    labelEn: 'Fire / Burning',
    category: 'Elemental / Estado',
    icon: 'flame',
    rawTokens: ['Heat Generation'],
    keywords: ['burning', 'fire damage', 'deals fire', 'applies burning', 'elemental fire'],
  },
  {
    id: 'Shock',
    labelEs: 'Electricidad / Shock',
    labelEn: 'Shock / Overloaded',
    category: 'Elemental / Estado',
    icon: 'zap',
    rawTokens: [],
    keywords: ['shock', 'overloaded'],
  },
  {
    id: 'Corrosive',
    labelEs: 'Corrosivo / Ácido',
    labelEn: 'Corrosive / Acid',
    category: 'Elemental / Estado',
    icon: 'biohazard',
    rawTokens: [],
    keywords: ['corrosive', 'corroded', 'acid'],
  },
  {
    id: 'Status Effect',
    labelEs: 'Efectos de Estado / Elemental',
    labelEn: 'Status & Elemental',
    category: 'Elemental / Estado',
    icon: 'sparkles',
    rawTokens: ['Status Effect', 'Status Duration', 'Elemental Damage'],
    keywords: ['status effect', 'elemental damage', 'exposed', 'blight', 'contamination', 'curse', 'slow'],
  },
  {
    id: 'Mod Power',
    labelEs: 'Poder y Daño de Mod',
    labelEn: 'Mod Power & Damage',
    category: 'Habilidades / Mods',
    icon: 'wand',
    rawTokens: ['Mod Power', 'Mod Damage', 'Mod Duration', 'Mod Cooldown', 'Mod Cost', 'Mod Cast Speed'],
    keywords: ['mod power', 'mod damage', 'mod duration', 'mod cost'],
  },
  {
    id: 'Skill Cooldown',
    labelEs: 'Cooldown y Daño de Habilidad',
    labelEn: 'Skill Cooldown & Damage',
    category: 'Habilidades / Mods',
    icon: 'clock',
    rawTokens: ['Reduce Skill Cooldown', 'Skill Damage', 'Skill Duration', 'Skill Cast Speed'],
    keywords: ['skill cooldown', 'skill damage', 'skill duration', 'skill cast'],
  },
  {
    id: 'Shield',
    labelEs: 'Escudos (Shield)',
    labelEn: 'Shield',
    category: 'Defensa / Supervivencia',
    icon: 'shield',
    rawTokens: [],
    keywords: ['shield'],
  },
  {
    id: 'Lifesteal/Healing',
    labelEs: 'Robo de Vida / Curación',
    labelEn: 'Lifesteal & Healing',
    category: 'Defensa / Supervivencia',
    icon: 'heart',
    rawTokens: ['Lifesteal', 'Heal', 'Healing Effectiveness', 'Grey Health', 'Relic Use Speed', 'Health'],
    keywords: ['lifesteal', 'healing', 'grey health', 'regenerates', 'relic use'],
  },
  {
    id: 'Summons',
    labelEs: 'Invocaciones (Summons)',
    labelEn: 'Summons',
    category: 'Arquetipo / Estilo',
    icon: 'users',
    rawTokens: ['Summon'],
    keywords: ['summon', 'minion', 'companion', 'turret'],
  },
  {
    id: 'Melee',
    labelEs: 'Cuerpo a Cuerpo (Melee)',
    labelEn: 'Melee',
    category: 'Arquetipo / Estilo',
    icon: 'sword',
    rawTokens: [
      'Melee',
      'Melee Damage',
      'Melee Speed',
      'Melee Attack Speed',
      'Charged Melee',
      'Charged Melee Damage',
      'Melee Charge Speed',
      'Melee Hit',
      'Melee Special Ability',
      'Melee Critical Chance',
      'Melee Critical Damage',
      'Melee Critical Hit',
    ],
    keywords: ['melee', 'unarmed'],
  },
  {
    id: 'Encumbrance/DR',
    labelEs: 'Tanque / Peso / Reducción Daño',
    labelEn: 'Encumbrance & Damage Reduction',
    category: 'Defensa / Supervivencia',
    icon: 'anchor',
    rawTokens: ['Damage Reduction', 'Encumbrance', 'Armor Increase', 'Stamina'],
    keywords: ['damage reduction', 'encumbrance', 'bulwark', 'armor', 'weight threshold'],
  },
  {
    id: 'Ranged/Firearms',
    labelEs: 'Armas de Fuego / Rango / Explosivo',
    labelEn: 'Ranged / Firearms / Explosive',
    category: 'Ofensiva',
    icon: 'flame-kindling',
    rawTokens: [
      'Ranged Damage',
      'Fire Rate',
      'Reload Speed',
      'Projectile Speed',
      'Charged Shot',
      'Magazine Capacity',
      'Ammo Reserves',
      'Spread',
      'Recoil',
      'Range',
      'Weapon Damage',
      'All Damage',
      'Firearm Swap Speed',
    ],
    keywords: ['ranged damage', 'fire rate', 'reload speed', 'explosive damage', 'projectile speed', 'all damage'],
  },
];

// Archetype -> recommended synergy tags mapping for smart build suggestions
export const ARCHETYPE_SYNERGY_MAP = {
  Hunter: ['Weakspot', 'Critical Chance', 'Ranged/Firearms'],
  Gunslinger: ['Ranged/Firearms', 'Critical Chance', 'Skill Cooldown'],
  Challenger: ['Melee', 'Encumbrance/DR', 'Critical Chance'],
  Medic: ['Lifesteal/Healing', 'Shield', 'Encumbrance/DR'],
  Handler: ['Bleed', 'Summons', 'Ranged/Firearms', 'Lifesteal/Healing'],
  Explorer: ['Ranged/Firearms', 'Skill Cooldown', 'Encumbrance/DR'],
  Alchemist: ['Status Effect', 'Lifesteal/Healing', 'Critical Chance'],
  Archon: ['Mod Power', 'Shock', 'Status Effect'],
  Engineer: ['Summons', 'Skill Cooldown', 'Encumbrance/DR', 'Ranged/Firearms'],
  Summoner: ['Summons', 'Mod Power', 'Lifesteal/Healing', 'Ranged/Firearms'],
  Invader: ['Critical Chance', 'Lifesteal/Healing', 'Melee'],
  Ritualist: ['Status Effect', 'Bleed', 'Fire/Burning', 'Shock', 'Corrosive'],
  Invoker: ['Skill Cooldown', 'Shock', 'Elemental Damage', 'Status Effect'],
  Warden: ['Shield', 'Summons', 'Skill Cooldown', 'Encumbrance/DR'],
};

function parseResxXml(xmlContent) {
  const map = {};
  const dataRegex = /<data\s+name="([^"]+)"[^>]*>\s*<value>([\s\S]*?)<\/value>/g;
  let match;
  while ((match = dataRegex.exec(xmlContent)) !== null) {
    const key = match[1].trim();
    const val = match[2]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    map[key] = val;
  }
  return map;
}

function cleanKey(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/['’`"\-_:.,!()/\\]/g, '')
    .replace(/\s+/g, '');
}

function cleanSlug(slug) {
  if (!slug) return '';
  let s = slug.trim();
  if (s.includes('/')) {
    const parts = s.split('/');
    s = parts[parts.length - 1];
  }
  if (s.includes('.')) {
    const parts = s.split('.');
    s = parts[parts.length - 1];
  }
  s = s.replace(/_c$/i, '');
  return s.toLowerCase();
}

async function fetchOrLoadToolkitFile(fileName) {
  await fs.mkdir(RAW_TOOLKIT_DIR, { recursive: true });
  const localPath = path.join(RAW_TOOLKIT_DIR, fileName);
  try {
    return await fs.readFile(localPath, 'utf8');
  } catch {
    const url = `${TOOLKIT_BASE_URL}/(items)/_constants/${fileName}`;
    console.log(`Downloading ${url}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    const text = await res.text();
    await fs.writeFile(localPath, text, 'utf8');
    return text;
  }
}

function extractToolkitItemsFromTs(tsContent, fileName) {
  // Strip TypeScript imports and type annotations so we can evaluate the array literal cleanly in a sandbox
  let code = tsContent
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/export\s+const\s+(\w+)\s*:\s*[^=]+=\s*/, 'globalThis.__EXPORTED_ITEMS__ = ')
    .replace(/export\s+const\s+(\w+)\s*=\s*/, 'globalThis.__EXPORTED_ITEMS__ = ')
    .replace(/\s+as\s+const\s+satisfies\s+[^;]+/g, '');

  const sandbox = {
    __EXPORTED_ITEMS__: [],
    DEFAULT_TRAIT_AMOUNT: 10,
    ARCHETYPE_COLORS: new Proxy({}, { get: () => ({ text: '', bg: '' }) }),
  };

  try {
    vm.runInNewContext(code, sandbox, { filename: fileName, timeout: 5000 });
    return Array.isArray(sandbox.__EXPORTED_ITEMS__) ? sandbox.__EXPORTED_ITEMS__ : [];
  } catch (err) {
    console.error(`Error evaluating ${fileName}:`, err.message);
    return [];
  }
}

function computeSynergyTagsForItem(toolkitItem, linkedModOrArchetypeItems = []) {
  const matchedSynergies = new Set();
  const rawTags = new Set(toolkitItem?.tags || []);
  const externalTokens = new Set(toolkitItem?.externalTokens || []);

  let combinedDescription = (toolkitItem?.description || '').toLowerCase();

  for (const linked of linkedModOrArchetypeItems) {
    for (const t of linked.tags || []) rawTags.add(t);
    for (const et of linked.externalTokens || []) externalTokens.add(et);
    if (linked.description) {
      combinedDescription += ' ' + linked.description.toLowerCase();
    }
  }

  // Check elemental resistances / armor stats
  if ((toolkitItem?.fireResistance || 0) > 0 || combinedDescription.includes('fire') || combinedDescription.includes('burning')) {
    if (combinedDescription.includes('burning') || combinedDescription.includes('fire damage')) {
      matchedSynergies.add('Fire/Burning');
    }
  }
  if (combinedDescription.includes('bleed') || combinedDescription.includes('bleeding')) {
    matchedSynergies.add('Bleed');
  }
  if (combinedDescription.includes('shock') || combinedDescription.includes('overload')) {
    matchedSynergies.add('Shock');
  }
  if (combinedDescription.includes('corrosive') || combinedDescription.includes('corroded') || combinedDescription.includes('acid')) {
    matchedSynergies.add('Corrosive');
  }
  if (combinedDescription.includes('shield')) {
    matchedSynergies.add('Shield');
  }
  if (combinedDescription.includes('bulwark')) {
    matchedSynergies.add('Encumbrance/DR');
  }
  if (externalTokens.has('Explosive Damage') || combinedDescription.includes('explosive')) {
    matchedSynergies.add('Ranged/Firearms');
  }

  for (const def of SYNERGY_TAG_DEFINITIONS) {
    for (const rt of def.rawTokens) {
      if (rawTags.has(rt) || externalTokens.has(rt)) {
        matchedSynergies.add(def.id);
      }
    }
    for (const kw of def.keywords) {
      if (combinedDescription.includes(kw)) {
        matchedSynergies.add(def.id);
      }
    }
  }

  // Extract inline uppercase mechanic tokens present in description
  const inlineMechanics = [];
  const mechanicKeywords = [
    'BLEEDING',
    'BURNING',
    'OVERLOADED',
    'CORRODED',
    'ACID',
    'FIRE',
    'SHOCK',
    'CORROSIVE',
    'SHIELD',
    'BULWARK',
    'HASTE',
    'SLOW',
    'EXPOSED',
    'CURSE',
    'CONTAMINATION',
    'DRENCHED',
    'MADNESS',
    'SUPPRESSED',
  ];
  const upperDesc = (toolkitItem?.description || '').toUpperCase();
  for (const mk of mechanicKeywords) {
    const regex = new RegExp(`\\b${mk}\\b`);
    if (regex.test(upperDesc)) {
      inlineMechanics.push(mk);
    }
  }

  return {
    synergyTags: Array.from(matchedSynergies),
    rawToolkitTags: Array.from(rawTags),
    externalTokens: Array.from(externalTokens),
    inlineMechanics,
  };
}

async function main() {
  console.log('=== Fase 2: Construyendo Catálogo Maestro Normalizado (RemnantOverseer + remnant2-toolkit) ===');

  // 1. Load Spanish & English resx from RemnantOverseer
  const esResxXml = await fs.readFile(path.join(OVERSEER_RESX_DIR, 'GameStrings.es.resx'), 'utf8');
  const enResxXml = await fs.readFile(path.join(OVERSEER_RESX_DIR, 'GameStrings.resx'), 'utf8');
  const esStrings = parseResxXml(esResxXml);
  const enStrings = parseResxXml(enResxXml);

  // 2. Load exported analyzer_db_raw.json from lib.remnant2.analyzer
  const analyzerRawText = (await fs.readFile(path.join(DATA_DIR, 'analyzer_db_raw.json'), 'utf8')).replace(/^\uFEFF/, '');
  const analyzerDb = JSON.parse(analyzerRawText);
  console.log(`Cargados ${analyzerDb.length} registros desde lib.remnant2.analyzer (db.json)`);

  // 3. Download and parse all 16 item files from joshpayette/remnant2-toolkit
  const toolkitAllItems = [];
  for (const file of TOOLKIT_ITEM_FILES) {
    const tsContent = await fetchOrLoadToolkitFile(file);
    const items = extractToolkitItemsFromTs(tsContent, file);
    console.log(`  • ${file.padEnd(26)} -> ${items.length} ítems extraídos`);
    toolkitAllItems.push(...items);
  }
  console.log(`Total de ítems extraídos de remnant2-toolkit: ${toolkitAllItems.length}`);

  // Build lookup indexes for toolkit items
  const toolkitBySlug = new Map();
  const toolkitByName = new Map();
  const toolkitById = new Map();

  for (const tkItem of toolkitAllItems) {
    if (tkItem.id) {
      toolkitById.set(tkItem.id.toLowerCase(), tkItem);
    }
    if (tkItem.name) {
      toolkitByName.set(cleanKey(tkItem.name), tkItem);
    }
    if (tkItem.saveFileSlug) {
      const slug = cleanSlug(tkItem.saveFileSlug);
      if (slug) toolkitBySlug.set(slug, tkItem);
    }
  }

  // Merge and cross-reference
  const mergedItems = [];
  const analyzerById = new Map();
  let matchedToToolkitCount = 0;

  for (const dbEntry of analyzerDb) {
    const id = dbEntry.Id || '';
    const type = (dbEntry.Type || '').toLowerCase();
    const profileId = dbEntry.ProfileId || '';
    const canonicalName = dbEntry.Name || enStrings[id] || id.replace(/^[A-Za-z]+_/, '');
    const nameEs = esStrings[id] || esStrings[canonicalName] || canonicalName;

    analyzerById.set(id.toLowerCase(), dbEntry);

    // Match against toolkit
    let tkMatch = null;
    const slugFromProfile = cleanSlug(profileId);
    const slugFromId = cleanSlug(id);

    if (slugFromProfile && toolkitBySlug.has(slugFromProfile)) {
      tkMatch = toolkitBySlug.get(slugFromProfile);
    } else if (slugFromId && toolkitBySlug.has(slugFromId)) {
      tkMatch = toolkitBySlug.get(slugFromId);
    } else if (toolkitByName.has(cleanKey(canonicalName))) {
      tkMatch = toolkitByName.get(cleanKey(canonicalName));
    }

    // Special handling for Engrams -> match linked Archetype in toolkit
    const linkedToolkitItems = [];
    if (!tkMatch && type === 'engram') {
      // Engram Note or Name often corresponds to Archetype
      for (const archItem of toolkitAllItems.filter((x) => x.category === 'archetype')) {
        if (
          archItem.linkedItems?.engram?.name &&
          cleanKey(archItem.linkedItems.engram.name) === cleanKey(canonicalName)
        ) {
          tkMatch = archItem;
          break;
        }
      }
    }

    if (tkMatch) {
      matchedToToolkitCount++;
      // If weapon or archetype has linked mod/perks/skills/traits, include their tags for synergy!
      if (tkMatch.linkedItems?.mod?.name) {
        const linkedMod = toolkitByName.get(cleanKey(tkMatch.linkedItems.mod.name));
        if (linkedMod) linkedToolkitItems.push(linkedMod);
      }
      if (tkMatch.linkedItems?.perks) {
        for (const p of tkMatch.linkedItems.perks) {
          const lp = toolkitByName.get(cleanKey(p.name));
          if (lp) linkedToolkitItems.push(lp);
        }
      }
      if (tkMatch.linkedItems?.skills) {
        for (const s of tkMatch.linkedItems.skills) {
          const ls = toolkitByName.get(cleanKey(s.name));
          if (ls) linkedToolkitItems.push(ls);
        }
      }
    }

    const { synergyTags, rawToolkitTags, externalTokens, inlineMechanics } = computeSynergyTagsForItem(
      tkMatch,
      linkedToolkitItems
    );

    mergedItems.push({
      id,
      toolkitId: tkMatch?.id || null,
      profileId,
      saveFileSlug: tkMatch?.saveFileSlug || null,
      canonicalName,
      nameEs,
      type,
      subtype: dbEntry.Subtype || null,
      dlc: tkMatch?.dlc || 'base',
      description: tkMatch?.description || '',
      howToObtainNote: dbEntry.Note || '',
      dropType: dbEntry.DropType || null,
      dropReference: dbEntry.DropReference || null,
      world: dbEntry.World || tkMatch?.location?.world || null,
      materialId: dbEntry.Material || null,
      prerequisite: dbEntry.Prerequisite || null,
      isCoop: dbEntry.Coop === 'True',
      isAccountAward: dbEntry.AccountAward === 'True',
      wikiLink: tkMatch?.wikiLinks?.[0] || `https://remnant.wiki/${encodeURIComponent(canonicalName.replace(/ /g, '_'))}`,
      synergyTags,
      rawToolkitTags,
      externalTokens,
      inlineMechanics,
      linkedItems: tkMatch?.linkedItems || null,
      stats: tkMatch
        ? {
            armor: tkMatch.armor,
            weight: tkMatch.weight,
            damage: tkMatch.damage,
            rps: tkMatch.rps,
            magazine: tkMatch.magazine,
            crit: tkMatch.crit,
            weakspot: tkMatch.weakspot,
            stagger: tkMatch.stagger,
          }
        : null,
    });
  }

  // Also include toolkit-only items (like standalone skills/perks/fusions) in a lookup table so URL imports resolve 100% of IDs
  const existingToolkitIds = new Set(mergedItems.map((m) => m.toolkitId).filter(Boolean));
  for (const tkItem of toolkitAllItems) {
    if (!tkItem.id || existingToolkitIds.has(tkItem.id)) continue;
    const { synergyTags, rawToolkitTags, externalTokens, inlineMechanics } = computeSynergyTagsForItem(tkItem, []);
    mergedItems.push({
      id: `Toolkit_${tkItem.category}_${tkItem.id}`,
      toolkitId: tkItem.id,
      profileId: tkItem.saveFileSlug || '',
      saveFileSlug: tkItem.saveFileSlug || null,
      canonicalName: tkItem.name,
      nameEs: esStrings[tkItem.name] || tkItem.name,
      type: tkItem.category,
      subtype: null,
      dlc: tkItem.dlc || 'base',
      description: tkItem.description || '',
      howToObtainNote: tkItem.location ? `${tkItem.location.world} - ${tkItem.location.dungeon || tkItem.location.biome || ''}` : '',
      dropType: null,
      dropReference: null,
      world: tkItem.location?.world || null,
      materialId: null,
      prerequisite: null,
      isCoop: false,
      isAccountAward: false,
      wikiLink: tkItem.wikiLinks?.[0] || `https://remnant.wiki/${encodeURIComponent(tkItem.name.replace(/ /g, '_'))}`,
      synergyTags,
      rawToolkitTags,
      externalTokens,
      inlineMechanics,
      linkedItems: tkItem.linkedItems || null,
      stats: null,
    });
  }

  const catalogPayload = {
    generatedAtUtc: new Date().toISOString(),
    sources: {
      analyzerDbVersion: 'lib.remnant2.analyzer@2.0.4',
      overseerLocalization: 'Angelore/remnant-two-overseer@1.7.5',
      toolkitRepo: 'joshpayette/remnant2-toolkit',
    },
    synergyTagDefinitions: SYNERGY_TAG_DEFINITIONS,
    archetypeSynergyMap: ARCHETYPE_SYNERGY_MAP,
    totalItemsCount: mergedItems.length,
    matchedAnalyzerToToolkitCount: matchedToToolkitCount,
    items: mergedItems,
  };

  const outPath = path.join(DATA_DIR, 'catalog.merged.json');
  await fs.writeFile(outPath, JSON.stringify(catalogPayload, null, 2), 'utf8');
  console.log(`\n✅ Catálogo maestro guardado en: ${outPath}`);
  console.log(`   • Total de entradas en catálogo : ${mergedItems.length}`);
  console.log(`   • Ítems cruzados con Toolkit    : ${matchedToToolkitCount}`);
  console.log(`   • Categorías de Sinergia        : ${SYNERGY_TAG_DEFINITIONS.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
