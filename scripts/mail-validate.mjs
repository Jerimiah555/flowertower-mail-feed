import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

export const FEED_PATH = path.join(REPO_ROOT, "docs", "mail", "v1", "feed.json");

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,80}$/;
const ALLOWED_REWARD_FIELDS = new Set([
  "gems",
  "pollen",
  "wildDNA",
  "strandDNA",
  "bloomGrowth",
  "bloomGrowthVariantId"
]);
const REWARD_AMOUNT_FIELDS = ["gems", "pollen", "wildDNA", "strandDNA", "bloomGrowth"];
const ALLOWED_VARIANTS = new Set(["mass", "velocity", "sporeburst", "tangle"]);
const ALLOWED_GATE_FIELDS = new Set(["platforms", "appEnvironments", "minBuildNumber", "maxBuildNumber"]);
const ALLOWED_PLATFORMS = new Set(["ios", "android", "web"]);
const ALLOWED_ENVIRONMENTS = new Set(["development", "preview", "production"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function parseDate(value) {
  if (!isNonEmptyString(value)) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function validateUniqueStringArray(errors, pathLabel, value, allowedValues) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${pathLabel} must be a non-empty array`);
    return;
  }

  const seen = new Set();
  for (const entry of value) {
    if (!allowedValues.has(entry)) {
      errors.push(`${pathLabel} includes unsupported value "${entry}"`);
    }

    if (seen.has(entry)) {
      errors.push(`${pathLabel} includes duplicate value "${entry}"`);
    }
    seen.add(entry);
  }
}

function validateReward(errors, pathLabel, reward) {
  if (reward === undefined) {
    return;
  }

  if (!isPlainObject(reward)) {
    errors.push(`${pathLabel} must be an object when present`);
    return;
  }

  for (const key of Object.keys(reward)) {
    if (!ALLOWED_REWARD_FIELDS.has(key)) {
      errors.push(`${pathLabel}.${key} is not supported`);
    }
  }

  let hasAmount = false;
  for (const key of REWARD_AMOUNT_FIELDS) {
    if (reward[key] !== undefined) {
      if (!isPositiveInteger(reward[key])) {
        errors.push(`${pathLabel}.${key} must be a positive integer`);
      } else {
        hasAmount = true;
      }
    }
  }

  if (reward.bloomGrowthVariantId !== undefined && !ALLOWED_VARIANTS.has(reward.bloomGrowthVariantId)) {
    errors.push(`${pathLabel}.bloomGrowthVariantId is not supported`);
  }

  if (reward.bloomGrowthVariantId !== undefined && reward.bloomGrowth === undefined) {
    errors.push(`${pathLabel}.bloomGrowthVariantId requires bloomGrowth`);
  }

  if (!hasAmount) {
    errors.push(`${pathLabel} must include at least one reward amount`);
  }
}

function validateGates(errors, pathLabel, gates) {
  if (gates === undefined) {
    return;
  }

  if (!isPlainObject(gates)) {
    errors.push(`${pathLabel} must be an object when present`);
    return;
  }

  for (const key of Object.keys(gates)) {
    if (!ALLOWED_GATE_FIELDS.has(key)) {
      errors.push(`${pathLabel}.${key} is not supported`);
    }
  }

  if (gates.platforms !== undefined) {
    validateUniqueStringArray(errors, `${pathLabel}.platforms`, gates.platforms, ALLOWED_PLATFORMS);
  }

  if (gates.appEnvironments !== undefined) {
    validateUniqueStringArray(errors, `${pathLabel}.appEnvironments`, gates.appEnvironments, ALLOWED_ENVIRONMENTS);
  }

  if (gates.minBuildNumber !== undefined && !isPositiveInteger(gates.minBuildNumber)) {
    errors.push(`${pathLabel}.minBuildNumber must be a positive integer`);
  }

  if (gates.maxBuildNumber !== undefined && !isPositiveInteger(gates.maxBuildNumber)) {
    errors.push(`${pathLabel}.maxBuildNumber must be a positive integer`);
  }

  if (
    isPositiveInteger(gates.minBuildNumber) &&
    isPositiveInteger(gates.maxBuildNumber) &&
    gates.minBuildNumber > gates.maxBuildNumber
  ) {
    errors.push(`${pathLabel}.minBuildNumber cannot be greater than maxBuildNumber`);
  }
}

export async function readFeed() {
  const raw = await readFile(FEED_PATH, "utf8");
  return JSON.parse(raw);
}

export async function writeFeed(feed) {
  await writeFile(FEED_PATH, `${JSON.stringify(feed, null, 2)}\n`);
}

export function validateFeed(feed) {
  const errors = [];
  const ids = new Set();

  if (!isPlainObject(feed)) {
    return {
      errors: ["feed must be a JSON object"],
      itemCount: 0,
      rewardCount: 0
    };
  }

  if (feed.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
  }

  if (!Array.isArray(feed.items)) {
    errors.push("items must be an array");
    return {
      errors,
      itemCount: 0,
      rewardCount: 0
    };
  }

  let rewardCount = 0;

  feed.items.forEach((item, index) => {
    const pathLabel = `items[${index}]`;

    if (!isPlainObject(item)) {
      errors.push(`${pathLabel} must be an object`);
      return;
    }

    if (!ID_PATTERN.test(item.id ?? "")) {
      errors.push(`${pathLabel}.id must use lowercase letters, numbers, and hyphens`);
    } else if (ids.has(item.id)) {
      errors.push(`${pathLabel}.id duplicates "${item.id}"`);
    } else {
      ids.add(item.id);
    }

    if (!isNonEmptyString(item.title) || item.title.length > 80) {
      errors.push(`${pathLabel}.title must be 1-80 characters`);
    }

    if (!isNonEmptyString(item.body) || item.body.length > 600) {
      errors.push(`${pathLabel}.body must be 1-600 characters`);
    }

    const publishedAt = parseDate(item.publishedAt);
    const startsAt = item.startsAt === undefined ? null : parseDate(item.startsAt);
    const expiresAt = item.expiresAt === undefined ? null : parseDate(item.expiresAt);

    if (publishedAt === null) {
      errors.push(`${pathLabel}.publishedAt must be a valid date-time string`);
    }

    if (item.startsAt !== undefined && startsAt === null) {
      errors.push(`${pathLabel}.startsAt must be a valid date-time string`);
    }

    if (item.expiresAt !== undefined && expiresAt === null) {
      errors.push(`${pathLabel}.expiresAt must be a valid date-time string`);
    }

    if (startsAt !== null && expiresAt !== null && startsAt > expiresAt) {
      errors.push(`${pathLabel}.startsAt cannot be after expiresAt`);
    }

    validateReward(errors, `${pathLabel}.reward`, item.reward);
    validateGates(errors, `${pathLabel}.gates`, item.gates);

    if (item.reward !== undefined) {
      rewardCount += 1;
    }
  });

  return {
    errors,
    itemCount: feed.items.length,
    rewardCount
  };
}

export function formatValidationSummary(result) {
  return `mail-validate: ok (${result.itemCount} item(s), ${result.rewardCount} reward item(s))`;
}

async function main() {
  let feed;

  try {
    feed = await readFeed();
  } catch (error) {
    console.error(`mail-validate: failed to read ${FEED_PATH}`);
    console.error(error.message);
    process.exit(1);
  }

  const result = validateFeed(feed);
  if (result.errors.length > 0) {
    console.error("mail-validate: failed");
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(formatValidationSummary(result));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
