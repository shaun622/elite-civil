import type { ExtraOverBand, ProjectConfig } from "@/types/db";
import type {
  WallEntry,
  WallCalculated,
  CostBreakdown,
  QuotationLineItem,
  RateBreakdown,
  MaterialsOrder,
  MaterialOrderLine,
  CostBreakdownDetail,
  CostDetailLine,
  CostOverrides,
} from "./types";

/**
 * Round wall height UP to the next embedment increment (default 0.2 m, the
 * 200 mm sleeper module). Per Brenton: a 1.3 m wall becomes 1.4 m, the extra
 * 0.1 m being embedment in-ground. Both the increment and whether to round at
 * all are per-project settings; when `enabled` is false the actual height is
 * used (price on measured height). Defaults keep the original behaviour so
 * pre-existing project configs are unchanged.
 */
export function roundHeightUp(
  height: number,
  opts?: { enabled?: boolean; incrementM?: number },
): number {
  if (height <= 0) return 0;
  const enabled = opts?.enabled ?? true;
  const inc = opts?.incrementM && opts.incrementM > 0 ? opts.incrementM : 0.2;
  if (!enabled) return height;
  // Round the product to kill float drift (0.2 × 7 = 1.4000…01 otherwise).
  return Math.round(Math.ceil(height / inc - 1e-9) * inc * 1e6) / 1e6;
}

/** Pull the embedment round-up settings off a project config. */
export function embedmentOpts(config: ProjectConfig): {
  enabled: boolean;
  incrementM: number;
} {
  return {
    enabled: config.engineering.embedmentRoundUp ?? true,
    incrementM: config.engineering.embedmentIncrementM ?? 0.2,
  };
}

/** The auto Quotation label for an extra-over band, used when the band has no
 *  custom `quoteLabel`. Shared by the engine and the Pricing & Performance
 *  editor's placeholder so they never drift. */
export function defaultQuoteLabel(band: ExtraOverBand): string {
  if (/upper/i.test(band.label)) return "Upper 2 tier wall";
  if (/lower/i.test(band.label)) return "Lower 2 tier wall";
  return `Height ${band.heightMin}-${band.heightMax}m - Single Tier`;
}

/**
 * Determine bay size based on wall height and engineering thresholds.
 * Replicates the array formula in column AB of the Take off tab.
 */
function getBaySize(height: number, config: ProjectConfig): number {
  const eng = config.engineering;
  if (height <= eng.heightBelowThreshold) return eng.sleeperLengthBelow;
  if (height >= eng.heightAboveThreshold) return eng.sleeperLengthAbove;
  return eng.defaultSleeperLength;
}

/**
 * Determine post size based on wall height. Replicates the VLOOKUP in
 * the Posting tab.
 */
function getPostSize(
  height: number,
  config: ProjectConfig,
): { postSize: string; pricePerMetre: number } {
  const ranges = config.engineering.postSizeRanges;
  for (const range of ranges) {
    if (height >= range.heightMin && height <= range.heightMax) {
      return { postSize: range.postSize, pricePerMetre: range.pricePerMetre };
    }
  }
  const last = ranges[ranges.length - 1];
  return { postSize: last.postSize, pricePerMetre: last.pricePerMetre };
}

/**
 * Calculate all derived values for a single wall entry. Replicates all
 * formulas in the Take off tab row.
 *
 * Rounding rules (per Brenton's QS workflow):
 *  - Wall height is rounded UP to the next 0.2 m increment. The extra
 *    (e.g. 0.1 m on a 1.3 m wall) becomes in-ground embedment.
 *  - Number of bays is rounded UP so material orders are whole units.
 *  - m² is calculated from rounded height × actual length (not
 *    bay-aligned).
 */
export function calculateWall(
  entry: WallEntry,
  config: ProjectConfig,
  ctx?: { pairedLowerHeightM?: number },
): WallCalculated {
  const height = roundHeightUp(entry.height, embedmentOpts(config));
  const lengthLM = entry.lengthLM;

  const baySize = getBaySize(height, config);
  const bays = lengthLM > 0 && baySize > 0 ? Math.ceil(lengthLM / baySize) : 0;
  const numberOfHoles = bays > 0 ? bays + 1 : 0;

  // Steel post length + in-ground embedment. A post embeds in-ground by
  // `ratio × height` (1:1 by default → post = 2× height). An Upper-tier post
  // runs the full upper height, down past its paired Lower tier, then embeds
  // 1:1 of the LOWER height: post = upper + lower + ratio×lower. Falls back to
  // the single-wall rule when an Upper has no paired Lower in its lot.
  const ratio = config.engineering.postEmbedmentRatio ?? 1;
  const holeExtra = config.engineering.holeDepthOverEmbedmentM ?? 0.2;
  const pairedLowerH =
    entry.type === "Upper" &&
    ctx?.pairedLowerHeightM &&
    ctx.pairedLowerHeightM > 0
      ? ctx.pairedLowerHeightM
      : null;
  const embedmentDepth = ratio * (pairedLowerH ?? height);
  const postLength =
    pairedLowerH != null
      ? height + pairedLowerH + embedmentDepth
      : height + embedmentDepth;

  const holeDepth = embedmentDepth + holeExtra;
  const holeSizeM = config.engineering.holeSize / 1000;

  const m2 = height * lengthLM;

  const concreteM3 =
    numberOfHoles > 0
      ? Math.PI * (holeSizeM / 2) ** 2 * holeDepth * numberOfHoles
      : 0;

  const gravelM3 = (height / 1.25) * lengthLM * 0.3;

  const sleepersPerBay = Math.round(height / 0.2);
  const sleeperCount = bays * sleepersPerBay;

  const timeToBuildHrs =
    (sleeperCount * config.performance.timeToInstall1Sleeper) / 60;

  const drillTimeHrs =
    (numberOfHoles * holeDepth * config.performance.timeToDrill1LM) / 60;

  const steelLength = postLength;

  const pfcLength = steelLength;
  const pfcQty = lengthLM > 0 ? 1 : 0;

  const ucLength = steelLength;
  const ucQty = bays;

  const sleeperQty = sleeperCount;

  const superSupports = entry.wallDesign === "Super Sleeper" ? bays * 2 : 0;

  const wedges =
    entry.wallDesign === "Super Sleeper" ? (sleeperQty + superSupports) * 2 : 0;

  const postInfo = getPostSize(height, config);

  const fenceBrackets = bays;

  return {
    ...entry,
    height,
    concreteM3,
    gravelM3,
    m2,
    numberOfHoles,
    timeToBuildHrs,
    drillTimeHrs,
    pfcLength,
    pfcQty,
    ucLength,
    ucQty,
    sleeperQty,
    superSupports,
    wedges,
    fenceBrackets,
    baySize,
    bays,
    postSize: postInfo.postSize,
    holeDepth,
  };
}

/** Calculate all walls for a project. */
export function calculateAllWalls(
  walls: WallEntry[],
  config: ProjectConfig,
): WallCalculated[] {
  // Pre-pass: tallest (rounded) Lower-tier height per lot, so an Upper-tier
  // post can embed relative to the Lower tier it sits above (same lot).
  const round = embedmentOpts(config);
  const lowerHeightByLot = new Map<string, number>();
  for (const w of walls) {
    if (w.type !== "Lower") continue;
    const h = roundHeightUp(w.height, round);
    const cur = lowerHeightByLot.get(w.lot) ?? 0;
    if (h > cur) lowerHeightByLot.set(w.lot, h);
  }
  return walls.map((w) =>
    calculateWall(w, config, {
      pairedLowerHeightM:
        w.type === "Upper" ? lowerHeightByLot.get(w.lot) : undefined,
    }),
  );
}

/** Get unique lot count from wall entries. */
export function getUniqueLotCount(walls: WallEntry[]): number {
  return new Set(walls.map((w) => w.lot).filter(Boolean)).size;
}

/**
 * Calculate the full cost breakdown for a project. Replicates the Total
 * Cost tab.
 *
 * Accepts manual cost overrides (from the Cost Breakdown page) so the
 * dashboard / quote totals reflect any user adjustments to estimated
 * quantities (e.g. machine days, labour hours).
 */
export function calculateCostBreakdown(
  walls: WallEntry[],
  config: ProjectConfig,
  overrides: CostOverrides = {},
): CostBreakdown {
  const calculated = calculateAllWalls(walls, config);
  const totalM2 = calculated.reduce((sum, w) => sum + w.m2, 0);
  const totalDrillHrs = calculated.reduce((sum, w) => sum + w.drillTimeHrs, 0);
  const totalBuildHrs = calculated.reduce((sum, w) => sum + w.timeToBuildHrs, 0);
  const totalConcreteM3 = calculated.reduce((sum, w) => sum + w.concreteM3, 0);
  const totalGravelM3 = calculated.reduce((sum, w) => sum + w.gravelM3, 0);
  const totalFenceBrackets = calculated.reduce(
    (sum, w) => sum + w.fenceBrackets,
    0,
  );
  const lotCount = getUniqueLotCount(walls);

  // --- DRILLING ---
  let drillingLabour: number;
  let drillingMachine: number;
  if (config.crewType === "Subbie Crew") {
    drillingLabour = config.labourRates.subbieDrill * totalM2;
    drillingMachine = config.labourRates.subbieMachine * totalM2;
  } else {
    const drillDays = totalDrillHrs / config.performance.workHours;
    drillingLabour =
      drillDays * config.labourRates.employeeDrill * config.performance.workHours;
    drillingMachine =
      drillDays *
      (config.machineRates.find((m) => m.name === "8ton KPR")?.rate ?? 375);
  }

  // --- POSTING ---
  // Subbie mode: labour is charged per m² and varies by post size.
  let postingLabour: number;
  if (config.crewType === "Subbie Crew") {
    postingLabour = calculated.reduce((sum, w) => {
      const range = config.engineering.postSizeRanges.find(
        (r) => w.height >= r.heightMin && w.height <= r.heightMax,
      );
      const rate = range?.postingLabourPerM2 ?? config.labourRates.subbiePost;
      return sum + w.m2 * rate;
    }, 0);
  } else {
    const postDays = totalM2 / config.performance.maxPostingPerDay;
    postingLabour =
      postDays * config.labourRates.employeePost * config.performance.workHours;
  }
  const postingConcrete = totalConcreteM3 * config.materialPrices.concreteRate;
  const postingSteel = calculated.reduce((sum, w) => {
    const postInfo = getPostSize(w.height, config);
    return sum + postInfo.pricePerMetre * w.ucLength * (w.ucQty + w.pfcQty);
  }, 0);

  // --- WALL BUILDING ---
  let buildingLabour: number;
  if (config.crewType === "Subbie Crew") {
    buildingLabour = config.labourRates.subbieBuild * totalM2;
  } else {
    buildingLabour = totalBuildHrs * config.labourRates.employeeBuild;
  }

  const concreteSleepersM2 = calculated
    .filter((w) => w.wallDesign === "Concrete")
    .reduce((sum, w) => sum + w.sleeperQty, 0);
  const superSleepersQty = calculated
    .filter((w) => w.wallDesign === "Super Sleeper")
    .reduce((sum, w) => sum + w.sleeperQty, 0);
  const superSupportsQty = calculated.reduce(
    (sum, w) => sum + w.superSupports,
    0,
  );

  const concreteSleepersTotal =
    concreteSleepersM2 * config.materialPrices.concreteSleeper;
  const superSleepersTotal =
    superSleepersQty * config.materialPrices.superSleeper +
    superSupportsQty * config.materialPrices.superSupport;

  // --- BACKFILL & GRAVEL ---
  // Walls ≤ 1 m get 0.9 m wide geofab; walls > 1 m get 2 m wide. 50 m rolls.
  const lmUnder1m = calculated
    .filter((w) => w.height <= 1.0)
    .reduce((sum, w) => sum + w.lengthLM, 0);
  const lmOver1m = calculated
    .filter((w) => w.height > 1.0)
    .reduce((sum, w) => sum + w.lengthLM, 0);

  const geo1mRolls = lmUnder1m > 0 ? Math.ceil(lmUnder1m / 50) : 0;
  const geo2mRolls = lmOver1m > 0 ? Math.ceil(lmOver1m / 50) : 0;
  const geofabCost =
    geo1mRolls * config.materialPrices.geo1mX50m +
    geo2mRolls * config.materialPrices.geo2mX50m;

  const totalLM = calculated.reduce((sum, w) => sum + w.lengthLM, 0);
  const agLineRolls = totalLM > 0 ? Math.ceil(totalLM / 100) : 0;
  const agLineCost = agLineRolls * config.materialPrices.agLine100mmX100m;

  const gravelCost = totalGravelM3 * config.materialPrices.gravelRate;

  let backfillLabour: number;
  if (config.crewType === "Subbie Crew") {
    backfillLabour = config.labourRates.subbieBackfill * totalM2;
  } else {
    backfillLabour = totalBuildHrs * config.labourRates.employeeBackfill;
  }
  const backfillMachineRate =
    config.machineRates.find((m) => m.name === "8ton KPR")?.rate ?? 375;
  const backfillMachine =
    (totalBuildHrs / config.performance.workHours) * backfillMachineRate;
  const backfillLabourAndMachine = backfillLabour + backfillMachine;

  // --- ENGINEERING ---
  const form15 = config.admin.engineering;
  const form12 = config.admin.formPerLot * lotCount;

  // --- TOTALS ---
  const drillingTotal = drillingLabour + drillingMachine;
  const postingTotal = postingLabour + postingConcrete + postingSteel;
  const buildingTotal =
    buildingLabour + concreteSleepersTotal + superSleepersTotal;
  const backfillTotal =
    geofabCost + agLineCost + gravelCost + backfillLabourAndMachine;
  const engineeringTotal = form15 + form12;

  const costTotal =
    drillingTotal + postingTotal + buildingTotal + backfillTotal + engineeringTotal;
  const markupAmount = costTotal * config.admin.markup;
  const marginAmount = (costTotal + markupAmount) * config.admin.margin;

  // Quote total comes from summing the actual quote lines so the
  // dashboard, the Cost Breakdown page, and the Quotation page all
  // stay in lock-step. This also makes manual cost-overrides flow
  // through to the quote total.
  const quoteLines = generateQuotationLines(walls, config, overrides);
  const totalExGST = quoteLines.reduce((s, l) => s + l.total, 0);

  const totalWithGST = totalExGST * 1.1;
  const projectedProfit = totalExGST - costTotal;
  void totalFenceBrackets;

  return {
    drilling: {
      labour: drillingLabour,
      machine: drillingMachine,
      total: drillingTotal,
    },
    posting: {
      labour: postingLabour,
      concrete: postingConcrete,
      steel: postingSteel,
      total: postingTotal,
    },
    wallBuilding: {
      labour: buildingLabour,
      concreteSleepers: concreteSleepersTotal,
      superSleepers: superSleepersTotal,
      total: buildingTotal,
    },
    backfill: {
      geofab: geofabCost,
      agLine: agLineCost,
      gravel: gravelCost,
      labourAndMachine: backfillLabourAndMachine,
      total: backfillTotal,
    },
    engineering: { form15, form12, total: engineeringTotal },
    misc: 0,
    costTotal,
    markup: markupAmount,
    marginAmount,
    totalExGST,
    totalWithGST,
    projectedProfit,
    totalM2,
    pricePerM2: totalM2 > 0 ? totalExGST / totalM2 : 0,
    costPerM2: totalM2 > 0 ? costTotal / totalM2 : 0,
  };
}

/**
 * Generate quotation line items matching the Quotation tab layout.
 *
 * Markup & margin model:
 *  - Direct work costs (drilling, posting, building, backfill) are
 *    averaged per m² and marked up before being multiplied by the
 *    height-band multiplier.
 *  - Fence brackets are also marked up (extras carry margin).
 *  - Mobe & Demobe and Engineering (Form 15 / Form 12) are
 *    pass-through — no markup, no margin.
 */
export function generateQuotationLines(
  walls: WallEntry[],
  config: ProjectConfig,
  overrides: CostOverrides = {},
): QuotationLineItem[] {
  const calculated = calculateAllWalls(walls, config);
  const detail = generateCostBreakdownDetail(walls, config, overrides);
  const lines: QuotationLineItem[] = [];
  const totalM2 = calculated.reduce((s, w) => s + w.m2, 0);

  // Push a line, applying a manual per-line rate override if one is stored
  // (cost_overrides["quote_rate:<key>"]). A negative/NaN override is ignored.
  const pushLine = (
    key: string,
    description: string,
    qty: number,
    unit: string,
    computedRate: number,
    rateBreakdown?: RateBreakdown,
  ) => {
    const ovr = overrides[`quote_rate:${key}`];
    const overridden =
      typeof ovr === "number" && Number.isFinite(ovr) && ovr >= 0;
    const rate = overridden ? ovr : computedRate;
    lines.push({
      key,
      description,
      qty,
      unit,
      rate,
      total: qty * rate,
      // The breakdown explains the computed rate; drop it once overridden.
      rateBreakdown: overridden ? undefined : rateBreakdown,
      rateOverridden: overridden,
    });
  };

  const getQty = (id: string, fallback: number): number => {
    const line = detail.lines.find((l) => l.id === id);
    if (!line) return fallback;
    return line.qtyOverride ?? line.qtyEstimated;
  };

  const directCosts =
    (detail.categoryTotals["Drilling"] ?? 0) +
    (detail.categoryTotals["Posting"] ?? 0) +
    (detail.categoryTotals["Wall Building"] ?? 0) +
    (detail.categoryTotals["Backfill & Gravel"] ?? 0);

  const directCostPerM2 = totalM2 > 0 ? directCosts / totalM2 : 0;
  const markupMargin = (1 + config.admin.markup) * (1 + config.admin.margin);
  const baseRate = directCostPerM2 * markupMargin;

  const bands = config.extraOverBands;
  const getRate = (multiplier: number) => baseRate * (1 + multiplier);
  const breakdownFor = (multiplier: number): RateBreakdown => ({
    directCostPerM2,
    markup: config.admin.markup,
    margin: config.admin.margin,
    bandMultiplier: multiplier,
  });
  const isTierBand = (label: string) => /upper|lower/i.test(label);

  const estQty = getQty("other-establishment", 1);
  if (estQty > 0) {
    pushLine("establishment", "Establishment", estQty, "EA", config.admin.mobeAndDemobe);
  }

  const m2_upper = calculated
    .filter((w) => w.type === "Upper")
    .reduce((s, w) => s + w.m2, 0);
  const m2_lower = calculated
    .filter((w) => w.type === "Lower")
    .reduce((s, w) => s + w.m2, 0);

  if (m2_upper > 0) {
    const tierBand = bands.find((b) => /upper/i.test(b.label));
    const mult = tierBand?.multiplier ?? 0.12;
    pushLine(
      "upper-tier",
      tierBand?.quoteLabel?.trim() || "Upper 2 tier wall",
      m2_upper,
      "m2",
      getRate(mult),
      breakdownFor(mult),
    );
  }
  if (m2_lower > 0) {
    const tierBand = bands.find((b) => /lower/i.test(b.label));
    const mult = tierBand?.multiplier ?? 0.11;
    pushLine(
      "lower-tier",
      tierBand?.quoteLabel?.trim() || "Lower 2 tier wall",
      m2_lower,
      "m2",
      getRate(mult),
      breakdownFor(mult),
    );
  }

  const singles = calculated.filter((w) => w.type === "Single");
  const heightBands = bands.filter((b) => !isTierBand(b.label));

  for (const band of heightBands) {
    const m2InBand = singles
      .filter((w) => w.height > band.heightMin && w.height <= band.heightMax)
      .reduce((s, w) => s + w.m2, 0);
    if (m2InBand <= 0) continue;

    const desc = band.quoteLabel?.trim() || defaultQuoteLabel(band);
    pushLine(
      `single-${band.heightMin}-${band.heightMax}`,
      desc,
      m2InBand,
      "m2",
      getRate(band.multiplier),
      breakdownFor(band.multiplier),
    );
  }

  const totalBrackets = getQty("other-brackets-material", 0);
  if (totalBrackets > 0) {
    const bracketCost =
      config.materialPrices.fenceBracket + config.materialPrices.fenceBracketLabour;
    pushLine("brackets", "Fence Brackets - 6mm", totalBrackets, "EA", bracketCost * markupMargin);
  }

  const form15Qty = getQty("eng-form15", 1);
  if (form15Qty > 0) {
    pushLine("form15", "Form 15", form15Qty, "", config.admin.engineering);
  }

  const form12Qty = getQty("eng-form12", getUniqueLotCount(walls));
  if (form12Qty > 0) {
    pushLine("form12", "Form 12 (per lot)", form12Qty, "lots", config.admin.formPerLot);
  }

  const deestQty = getQty("other-deestablishment", 1);
  if (deestQty > 0) {
    pushLine("deestablishment", "De-establishment", deestQty, "EA", config.admin.mobeAndDemobe);
  }

  return lines;
}

/**
 * Generate a consolidated materials order sheet for procurement.
 * Lists concrete, steel, fence brackets, sleepers, geofab, ag line, gravel.
 */
export function generateMaterialsOrder(
  walls: WallEntry[],
  config: ProjectConfig,
): MaterialsOrder {
  const calculated = calculateAllWalls(walls, config);
  const lines: MaterialOrderLine[] = [];

  const totalConcreteM3 = calculated.reduce((s, w) => s + w.concreteM3, 0);
  if (totalConcreteM3 > 0) {
    lines.push({
      category: "Concrete",
      description: "Concrete for post holes",
      qty: totalConcreteM3,
      unit: "m3",
      unitPrice: config.materialPrices.concreteRate,
      total: totalConcreteM3 * config.materialPrices.concreteRate,
    });
  }

  // Steel posts, grouped by lot + section size + length so each distinct post
  // is ordered exactly and listed per lot (for bundling deliveries by location).
  const postGroups = new Map<
    string,
    {
      lot: string;
      size: string;
      length: number;
      qty: number;
      pricePerMetre: number;
    }
  >();
  for (const w of calculated) {
    const info =
      config.engineering.postSizeRanges.find(
        (r) => w.height >= r.heightMin && w.height <= r.heightMax,
      ) ??
      config.engineering.postSizeRanges[
        config.engineering.postSizeRanges.length - 1
      ];
    const totalPosts = w.ucQty + w.pfcQty;
    if (totalPosts <= 0) continue;
    const lot = w.lot || "";
    const key = `${lot}||${info.postSize}||${w.ucLength.toFixed(2)}`;
    const existing = postGroups.get(key);
    if (existing) {
      existing.qty += totalPosts;
    } else {
      postGroups.set(key, {
        lot,
        size: info.postSize,
        length: w.ucLength,
        qty: totalPosts,
        pricePerMetre: info.pricePerMetre,
      });
    }
  }
  const sortedPosts = [...postGroups.values()].sort(
    (a, b) =>
      a.lot.localeCompare(b.lot, undefined, { numeric: true }) ||
      a.size.localeCompare(b.size) ||
      a.length - b.length,
  );
  for (const p of sortedPosts) {
    lines.push({
      category: "Steel",
      lot: p.lot || undefined,
      description: `${p.size} posts (${p.length.toFixed(1)}m lengths)`,
      qty: p.qty,
      unit: "EA",
      unitPrice: p.pricePerMetre * p.length,
      total: p.qty * p.pricePerMetre * p.length,
    });
  }

  const totalBrackets = calculated.reduce((s, w) => s + w.fenceBrackets, 0);
  if (totalBrackets > 0) {
    lines.push({
      category: "Fence Brackets",
      description: "Fence brackets - 6mm",
      qty: totalBrackets,
      unit: "EA",
      unitPrice: config.materialPrices.fenceBracket,
      total: totalBrackets * config.materialPrices.fenceBracket,
    });
  }

  const superSleepersQty = calculated
    .filter((w) => w.wallDesign === "Super Sleeper")
    .reduce((s, w) => s + w.sleeperQty, 0);
  const superSupportsQty = calculated.reduce(
    (s, w) => s + w.superSupports,
    0,
  );
  const wedgesQty = calculated.reduce((s, w) => s + w.wedges, 0);
  const concreteSleepersQty = calculated
    .filter((w) => w.wallDesign === "Concrete")
    .reduce((s, w) => s + w.sleeperQty, 0);

  if (superSleepersQty > 0) {
    lines.push({
      category: "Sleepers",
      description: "Super Sleepers",
      qty: superSleepersQty,
      unit: "EA",
      unitPrice: config.materialPrices.superSleeper,
      total: superSleepersQty * config.materialPrices.superSleeper,
    });
  }
  if (superSupportsQty > 0) {
    lines.push({
      category: "Sleepers",
      description: "Super Supports",
      qty: superSupportsQty,
      unit: "EA",
      unitPrice: config.materialPrices.superSupport,
      total: superSupportsQty * config.materialPrices.superSupport,
    });
  }
  if (wedgesQty > 0) {
    lines.push({
      category: "Sleepers",
      description: "Wedges",
      qty: wedgesQty,
      unit: "EA",
      unitPrice: config.materialPrices.wedges,
      total: wedgesQty * config.materialPrices.wedges,
    });
  }
  if (concreteSleepersQty > 0) {
    lines.push({
      category: "Sleepers",
      description: "Concrete Sleepers",
      qty: concreteSleepersQty,
      unit: "EA",
      unitPrice: config.materialPrices.concreteSleeper,
      total: concreteSleepersQty * config.materialPrices.concreteSleeper,
    });
  }

  const lmUnder1m = calculated
    .filter((w) => w.height <= 1.0)
    .reduce((s, w) => s + w.lengthLM, 0);
  const lmOver1m = calculated
    .filter((w) => w.height > 1.0)
    .reduce((s, w) => s + w.lengthLM, 0);
  const geo1mRolls = lmUnder1m > 0 ? Math.ceil(lmUnder1m / 50) : 0;
  const geo2mRolls = lmOver1m > 0 ? Math.ceil(lmOver1m / 50) : 0;
  if (geo1mRolls > 0) {
    lines.push({
      category: "Geofabric",
      description: "Geofabric 0.9m x 50m (walls ≤ 1m)",
      qty: geo1mRolls,
      unit: "roll",
      unitPrice: config.materialPrices.geo1mX50m,
      total: geo1mRolls * config.materialPrices.geo1mX50m,
    });
  }
  if (geo2mRolls > 0) {
    lines.push({
      category: "Geofabric",
      description: "Geofabric 2m x 50m (walls > 1m)",
      qty: geo2mRolls,
      unit: "roll",
      unitPrice: config.materialPrices.geo2mX50m,
      total: geo2mRolls * config.materialPrices.geo2mX50m,
    });
  }

  const totalLM = calculated.reduce((s, w) => s + w.lengthLM, 0);
  const agRolls = totalLM > 0 ? Math.ceil(totalLM / 100) : 0;
  if (agRolls > 0) {
    lines.push({
      category: "Ag Line",
      description: "Ag line 100mm x 100m",
      qty: agRolls,
      unit: "roll",
      unitPrice: config.materialPrices.agLine100mmX100m,
      total: agRolls * config.materialPrices.agLine100mmX100m,
    });
  }

  const totalGravelM3 = calculated.reduce((s, w) => s + w.gravelM3, 0);
  if (totalGravelM3 > 0) {
    lines.push({
      category: "Gravel",
      description: "Gravel backfill",
      qty: totalGravelM3,
      unit: "m3",
      unitPrice: config.materialPrices.gravelRate,
      total: totalGravelM3 * config.materialPrices.gravelRate,
    });
  }

  const grandTotal = lines.reduce((s, l) => s + l.total, 0);
  return { lines, grandTotal };
}

/**
 * Build a detailed cost breakdown showing each line: qty × rate = cost.
 * Supports manual overrides on the quantities. Each line has a stable
 * `id` used as the override key.
 */
export function generateCostBreakdownDetail(
  walls: WallEntry[],
  config: ProjectConfig,
  overrides: CostOverrides = {},
): CostBreakdownDetail {
  const calculated = calculateAllWalls(walls, config);
  const totalM2 = calculated.reduce((s, w) => s + w.m2, 0);
  const totalDrillHrs = calculated.reduce((s, w) => s + w.drillTimeHrs, 0);
  const totalBuildHrs = calculated.reduce((s, w) => s + w.timeToBuildHrs, 0);
  const totalConcreteM3 = calculated.reduce((s, w) => s + w.concreteM3, 0);
  const totalGravelM3 = calculated.reduce((s, w) => s + w.gravelM3, 0);
  const totalFenceBrackets = calculated.reduce(
    (s, w) => s + w.fenceBrackets,
    0,
  );
  const totalLM = calculated.reduce((s, w) => s + w.lengthLM, 0);
  const lotCount = getUniqueLotCount(walls);
  const workHours = config.performance.workHours || 7.5;
  const kprRate =
    config.machineRates.find((m) => m.name === "8ton KPR")?.rate ?? 375;

  const raw: Array<Omit<CostDetailLine, "total" | "qtyOverride">> = [];

  // --- DRILLING ---
  if (config.crewType === "Subbie Crew") {
    raw.push({
      id: "drill-subbie-labour",
      category: "Drilling",
      description: "Subbie drill labour",
      qtyEstimated: totalM2,
      unit: "m2",
      rate: config.labourRates.subbieDrill,
    });
    raw.push({
      id: "drill-subbie-machine",
      category: "Drilling",
      description: "Subbie drill machine",
      qtyEstimated: totalM2,
      unit: "m2",
      rate: config.labourRates.subbieMachine,
    });
  } else {
    raw.push({
      id: "drill-labour-hrs",
      category: "Drilling",
      description: "Drill labour hours",
      qtyEstimated: totalDrillHrs,
      unit: "hrs",
      rate: config.labourRates.employeeDrill,
    });
    raw.push({
      id: "drill-machine-days",
      category: "Drilling",
      description: "8ton KPR machine days",
      qtyEstimated: totalDrillHrs / workHours,
      unit: "days",
      rate: kprRate,
    });
  }

  // --- POSTING ---
  if (config.crewType === "Subbie Crew") {
    const labourBySize = new Map<string, { m2: number; rate: number }>();
    for (const w of calculated) {
      if (w.m2 <= 0) continue;
      const range = config.engineering.postSizeRanges.find(
        (r) => w.height >= r.heightMin && w.height <= r.heightMax,
      );
      const size = range?.postSize ?? "default";
      const rate = range?.postingLabourPerM2 ?? config.labourRates.subbiePost;
      const existing = labourBySize.get(size);
      if (existing) existing.m2 += w.m2;
      else labourBySize.set(size, { m2: w.m2, rate });
    }
    for (const [size, info] of labourBySize) {
      raw.push({
        id: `post-subbie-labour-${size}`,
        category: "Posting",
        description: `Post labour (${size})`,
        qtyEstimated: info.m2,
        unit: "m2",
        rate: info.rate,
      });
    }
  } else {
    const postDays = totalM2 / (config.performance.maxPostingPerDay || 75);
    raw.push({
      id: "post-labour-hrs",
      category: "Posting",
      description: "Post labour hours",
      qtyEstimated: postDays * workHours,
      unit: "hrs",
      rate: config.labourRates.employeePost,
    });
  }
  raw.push({
    id: "post-concrete",
    category: "Posting",
    description: "Concrete (post holes)",
    qtyEstimated: totalConcreteM3,
    unit: "m3",
    rate: config.materialPrices.concreteRate,
  });

  const steelBySize = new Map<string, { lm: number; rate: number }>();
  for (const w of calculated) {
    const info =
      config.engineering.postSizeRanges.find(
        (r) => w.height >= r.heightMin && w.height <= r.heightMax,
      ) ??
      config.engineering.postSizeRanges[
        config.engineering.postSizeRanges.length - 1
      ];
    const lm = w.ucLength * (w.ucQty + w.pfcQty);
    if (lm <= 0) continue;
    const existing = steelBySize.get(info.postSize);
    if (existing) {
      existing.lm += lm;
    } else {
      steelBySize.set(info.postSize, { lm, rate: info.pricePerMetre });
    }
  }
  for (const [size, info] of steelBySize) {
    raw.push({
      id: `post-steel-${size}`,
      category: "Posting",
      description: `Steel ${size}`,
      qtyEstimated: info.lm,
      unit: "LM",
      rate: info.rate,
    });
  }

  // --- WALL BUILDING ---
  if (config.crewType === "Subbie Crew") {
    raw.push({
      id: "build-subbie-labour",
      category: "Wall Building",
      description: "Subbie build labour",
      qtyEstimated: totalM2,
      unit: "m2",
      rate: config.labourRates.subbieBuild,
    });
  } else {
    raw.push({
      id: "build-labour-hrs",
      category: "Wall Building",
      description: "Build labour hours",
      qtyEstimated: totalBuildHrs,
      unit: "hrs",
      rate: config.labourRates.employeeBuild,
    });
  }

  const superSleepersQty = calculated
    .filter((w) => w.wallDesign === "Super Sleeper")
    .reduce((s, w) => s + w.sleeperQty, 0);
  const superSupportsQty = calculated.reduce(
    (s, w) => s + w.superSupports,
    0,
  );
  const concreteSleepersQty = calculated
    .filter((w) => w.wallDesign === "Concrete")
    .reduce((s, w) => s + w.sleeperQty, 0);

  if (superSleepersQty > 0)
    raw.push({
      id: "build-super-sleepers",
      category: "Wall Building",
      description: "Super sleepers",
      qtyEstimated: superSleepersQty,
      unit: "EA",
      rate: config.materialPrices.superSleeper,
    });
  if (superSupportsQty > 0)
    raw.push({
      id: "build-super-supports",
      category: "Wall Building",
      description: "Super supports",
      qtyEstimated: superSupportsQty,
      unit: "EA",
      rate: config.materialPrices.superSupport,
    });
  if (concreteSleepersQty > 0)
    raw.push({
      id: "build-concrete-sleepers",
      category: "Wall Building",
      description: "Concrete sleepers",
      qtyEstimated: concreteSleepersQty,
      unit: "EA",
      rate: config.materialPrices.concreteSleeper,
    });

  // --- BACKFILL & GRAVEL ---
  const lmUnder1m = calculated
    .filter((w) => w.height <= 1.0)
    .reduce((s, w) => s + w.lengthLM, 0);
  const lmOver1m = calculated
    .filter((w) => w.height > 1.0)
    .reduce((s, w) => s + w.lengthLM, 0);
  const geo1mRolls = lmUnder1m > 0 ? Math.ceil(lmUnder1m / 50) : 0;
  const geo2mRolls = lmOver1m > 0 ? Math.ceil(lmOver1m / 50) : 0;
  const agRolls = totalLM > 0 ? Math.ceil(totalLM / 100) : 0;

  if (geo1mRolls > 0)
    raw.push({
      id: "backfill-geo1m",
      category: "Backfill & Gravel",
      description: "Geofab 0.9m x 50m",
      qtyEstimated: geo1mRolls,
      unit: "roll",
      rate: config.materialPrices.geo1mX50m,
    });
  if (geo2mRolls > 0)
    raw.push({
      id: "backfill-geo2m",
      category: "Backfill & Gravel",
      description: "Geofab 2m x 50m",
      qtyEstimated: geo2mRolls,
      unit: "roll",
      rate: config.materialPrices.geo2mX50m,
    });
  if (agRolls > 0)
    raw.push({
      id: "backfill-agline",
      category: "Backfill & Gravel",
      description: "Ag line 100mm x 100m",
      qtyEstimated: agRolls,
      unit: "roll",
      rate: config.materialPrices.agLine100mmX100m,
    });
  if (totalGravelM3 > 0)
    raw.push({
      id: "backfill-gravel",
      category: "Backfill & Gravel",
      description: "Gravel",
      qtyEstimated: totalGravelM3,
      unit: "m3",
      rate: config.materialPrices.gravelRate,
    });

  if (config.crewType === "Subbie Crew") {
    raw.push({
      id: "backfill-subbie-labour",
      category: "Backfill & Gravel",
      description: "Subbie backfill labour",
      qtyEstimated: totalM2,
      unit: "m2",
      rate: config.labourRates.subbieBackfill,
    });
  } else {
    raw.push({
      id: "backfill-labour-hrs",
      category: "Backfill & Gravel",
      description: "Backfill labour hours",
      qtyEstimated: totalBuildHrs,
      unit: "hrs",
      rate: config.labourRates.employeeBackfill,
    });
    raw.push({
      id: "backfill-machine-days",
      category: "Backfill & Gravel",
      description: "8ton KPR backfill days",
      qtyEstimated: totalBuildHrs / workHours,
      unit: "days",
      rate: kprRate,
    });
  }

  // --- ENGINEERING ---
  raw.push({
    id: "eng-form15",
    category: "Engineering",
    description: "Form 15",
    qtyEstimated: 1,
    unit: "EA",
    rate: config.admin.engineering,
  });
  if (lotCount > 0)
    raw.push({
      id: "eng-form12",
      category: "Engineering",
      description: "Form 12 (per lot)",
      qtyEstimated: lotCount,
      unit: "lots",
      rate: config.admin.formPerLot,
    });

  // --- OTHER ---
  if (totalFenceBrackets > 0) {
    raw.push({
      id: "other-brackets-material",
      category: "Other",
      description: "Fence brackets (material)",
      qtyEstimated: totalFenceBrackets,
      unit: "EA",
      rate: config.materialPrices.fenceBracket,
    });
    raw.push({
      id: "other-brackets-labour",
      category: "Other",
      description: "Fence brackets (labour)",
      qtyEstimated: totalFenceBrackets,
      unit: "EA",
      rate: config.materialPrices.fenceBracketLabour,
    });
  }
  raw.push({
    id: "other-establishment",
    category: "Other",
    description: "Establishment",
    qtyEstimated: 1,
    unit: "EA",
    rate: config.admin.mobeAndDemobe,
  });
  raw.push({
    id: "other-deestablishment",
    category: "Other",
    description: "De-establishment",
    qtyEstimated: 1,
    unit: "EA",
    rate: config.admin.mobeAndDemobe,
  });

  const lines = raw.map((l) => {
    const override = overrides[l.id];
    const effectiveQty = override !== undefined ? override : l.qtyEstimated;
    return {
      ...l,
      qtyOverride: override,
      total: effectiveQty * l.rate,
    };
  });

  const categoryTotals: Record<string, number> = {};
  let grandTotal = 0;
  for (const l of lines) {
    categoryTotals[l.category] = (categoryTotals[l.category] ?? 0) + l.total;
    grandTotal += l.total;
  }

  return { lines, categoryTotals, grandTotal };
}
