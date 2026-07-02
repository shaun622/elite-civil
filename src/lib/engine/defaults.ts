import type { ProjectConfig, PostSizeRange } from "@/types/db";

/**
 * Master list of available post sizes with default prices (BR Products).
 * Used as the dropdown options in Engineering > Post Size Ranges.
 * Switching a post in a height range will auto-populate the price from
 * here, but the user can override it per project.
 *
 * postingLabourPerM2: labour rate (Subbie mode) to install this post
 * size per m² of wall. Confirmed values: 100UC = $35/m², 150UC24 =
 * $40/m². Other sizes are estimated and can be adjusted per project.
 */
export const POST_SIZE_OPTIONS: Omit<PostSizeRange, "heightMin" | "heightMax">[] = [
  { postSize: "100UC",   pricePerMetre: 35,     lengthPerUnit: 3.6, pricePerUnit: 126,    postingLabourPerM2: 35 },
  { postSize: "150UC24", pricePerMetre: 72.5,   lengthPerUnit: 5.2, pricePerUnit: 377,    postingLabourPerM2: 40 },
  { postSize: "150UC30", pricePerMetre: 115.76, lengthPerUnit: 5.6, pricePerUnit: 648.25, postingLabourPerM2: 45 },
  { postSize: "200UB18", pricePerMetre: 65,     lengthPerUnit: 5.2, pricePerUnit: 338,    postingLabourPerM2: 50 },
  { postSize: "250UB31", pricePerMetre: 118.50, lengthPerUnit: 5.8, pricePerUnit: 687.30, postingLabourPerM2: 55 },
  { postSize: "250UB37", pricePerMetre: 122.44, lengthPerUnit: 5.8, pricePerUnit: 710.13, postingLabourPerM2: 60 },
];

/**
 * Default project configuration — the BE Landscapes Master Template
 * baseline. Used for any project whose `config` column is null and as
 * the starting point for newly created projects.
 */
export const defaultConfig: ProjectConfig = {
  crewType: "Employee Crew",

  machineRates: [
    { name: "8ton KPR", rate: 375, unit: "Day" },
    { name: "BE 1.7ton", rate: 200, unit: "Day" },
    { name: "BE Bobcat", rate: 200, unit: "Day" },
    { name: "Fuel", rate: 80, unit: "Day" },
    { name: "KPR Bobcat", rate: 300, unit: "Day" },
  ],

  materialPrices: {
    superSleeper: 29,
    superSupport: 11,
    wedges: 0.11,
    concreteSleeper: 29,
    concreteRate: 225,
    gravelRate: 65,
    geo1mX50m: 36.96,
    geo2mX50m: 74.16,
    geo1mX100m: 73.92,
    geo2mX100m: 148.32,
    agLine100mmX100m: 348,
    fenceBracket: 13,
    fenceBracketLabour: 3,
  },

  labourRates: {
    subbieDrill: 13,
    subbiePost: 35,
    subbieBuild: 10,
    subbieBackfill: 7.5,
    subbieMachine: 7,
    employeeBuild: 70,
    employeePost: 70,
    employeeBackfill: 50,
    employeeDrill: 50,
  },

  performance: {
    timeToDrill1LM: 10,
    timeToInstall1Sleeper: 1.68,
    buildCrewM2PerDay: 100,
    workHours: 7.5,
    breakTime: 30,
    maxPostingPerDay: 75,
  },

  engineering: {
    holeSize: 450,
    heightPlusFactor: 0.4,
    postSizeRanges: [
      { postSize: "100UC",   heightMin: 0.2, heightMax: 1.6, pricePerMetre: 35,     lengthPerUnit: 3.6, pricePerUnit: 126,    postingLabourPerM2: 35 },
      { postSize: "150UC24", heightMin: 1.6, heightMax: 2.2, pricePerMetre: 72.5,   lengthPerUnit: 5.2, pricePerUnit: 377,    postingLabourPerM2: 40 },
      { postSize: "150UC30", heightMin: 2.2, heightMax: 3.0, pricePerMetre: 115.76, lengthPerUnit: 5.6, pricePerUnit: 648.25, postingLabourPerM2: 45 },
      { postSize: "250UB37", heightMin: 3.0, heightMax: 4.0, pricePerMetre: 122.44, lengthPerUnit: 5.8, pricePerUnit: 710.13, postingLabourPerM2: 60 },
    ],
    heightBelowThreshold: 0.6,
    sleeperLengthBelow: 2.4,
    heightAboveThreshold: 2.0,
    sleeperLengthAbove: 1.6,
    defaultSleeperLength: 2.0,
    embedmentRoundUp: true,
    embedmentIncrementM: 0.2,
    postEmbedmentRatio: 1.0,
    holeDepthOverEmbedmentM: 0.2,
  },

  admin: {
    engineering: 3600,
    formPerLot: 65,
    mobeAndDemobe: 1500,
    markup: 0.2,
    margin: 0.3,
  },

  extraOverBands: [
    { label: "0 - 1.6m High",   heightMin: 0,   heightMax: 1.6, multiplier: 0 },
    { label: "1.6 - 2.2m High", heightMin: 1.6, heightMax: 2.2, multiplier: 0.1 },
    { label: "2.2 - 3.0m High", heightMin: 2.2, heightMax: 3.0, multiplier: 0.1 },
    { label: "3.0 - 4.0m High", heightMin: 3.0, heightMax: 4.0, multiplier: 0.2 },
    { label: "Upper Tier",      heightMin: 0,   heightMax: 4.0, multiplier: 0.12 },
    { label: "Lower Tier",      heightMin: 0,   heightMax: 4.0, multiplier: 0.11 },
  ],

  heightBandEdges: [1.6, 3.0],
};

/** Default description for the Quotation page T&Cs. */
export const DEFAULT_PROJECT_DESCRIPTION =
  "Supply, install and engineer’s certification (form 15) SuperSleeper Retaining wall using Steel Posts and Supersleepers. All rates are subject to engineering documentation approval.";
