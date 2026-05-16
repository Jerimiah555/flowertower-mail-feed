import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { pathToFileURL } from "node:url";
import { formatValidationSummary, readFeed, validateFeed, writeFeed } from "./mail-validate.mjs";

const REWARD_PROMPTS = [
  ["gems", "Gems"],
  ["pollen", "Pollen"],
  ["wildDNA", "Wild DNA"],
  ["strandDNA", "Strand DNA"],
  ["bloomGrowth", "Bloom Growth"]
];

const VARIANTS = new Set(["mass", "velocity", "sporeburst", "tangle"]);
const PLATFORMS = new Set(["ios", "android", "web"]);
const ENVIRONMENTS = new Set(["development", "preview", "production"]);

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function uniqueId(feed, baseId) {
  const ids = new Set(feed.items.map((item) => item.id));
  if (!ids.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (ids.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}

function parsePositiveInteger(value, label) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be blank or a positive integer`);
  }

  return parsed;
}

function parseDateInput(value, label) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) {
    throw new Error(`${label} must be blank or a valid date-time`);
  }

  return new Date(timestamp).toISOString();
}

function parseList(value, label, allowedValues) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const entries = trimmed
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    return undefined;
  }

  for (const entry of entries) {
    if (!allowedValues.has(entry)) {
      throw new Error(`${label} includes unsupported value "${entry}"`);
    }
  }

  return [...new Set(entries)];
}

async function requiredAnswer(rl, prompt) {
  while (true) {
    const answer = (await rl.question(prompt)).trim();
    if (answer.length > 0) {
      return answer;
    }
    console.log("Required.");
  }
}

async function main() {
  const feed = await readFeed();
  const rl = readline.createInterface({ input, output });

  try {
    const title = await requiredAnswer(rl, "Title: ");
    const body = await requiredAnswer(rl, "Body: ");
    const now = new Date();
    const datePrefix = now.toISOString().slice(0, 10);
    const id = uniqueId(feed, `${datePrefix}-${slugify(title) || "mail"}`);

    const item = {
      id,
      title,
      body,
      publishedAt: now.toISOString()
    };

    const startsAt = parseDateInput(await rl.question("Starts at (blank = now): "), "Starts at");
    if (startsAt !== undefined) {
      item.startsAt = startsAt;
    }

    const expiresAt = parseDateInput(await rl.question("Expires at (blank = never): "), "Expires at");
    if (expiresAt !== undefined) {
      item.expiresAt = expiresAt;
    }

    const reward = {};
    for (const [key, label] of REWARD_PROMPTS) {
      const value = parsePositiveInteger(await rl.question(`${label} reward amount (blank = none): `), label);
      if (value !== undefined) {
        reward[key] = value;
      }
    }

    if (reward.bloomGrowth !== undefined) {
      const variant = (await rl.question("Bloom Growth variant (mass, velocity, sporeburst, tangle; blank = none): ")).trim();
      if (variant.length > 0) {
        if (!VARIANTS.has(variant)) {
          throw new Error(`Bloom Growth variant must be one of ${[...VARIANTS].join(", ")}`);
        }
        reward.bloomGrowthVariantId = variant;
      }
    }

    if (Object.keys(reward).length > 0) {
      item.reward = reward;
    }

    const gates = {};
    const platforms = parseList(await rl.question("Platforms (ios,android,web; blank = all): "), "Platforms", PLATFORMS);
    if (platforms !== undefined) {
      gates.platforms = platforms;
    }

    const appEnvironments = parseList(
      await rl.question("App environments (development,preview,production; blank = all): "),
      "App environments",
      ENVIRONMENTS
    );
    if (appEnvironments !== undefined) {
      gates.appEnvironments = appEnvironments;
    }

    const minBuildNumber = parsePositiveInteger(await rl.question("Minimum build number (blank = none): "), "Minimum build number");
    if (minBuildNumber !== undefined) {
      gates.minBuildNumber = minBuildNumber;
    }

    const maxBuildNumber = parsePositiveInteger(await rl.question("Maximum build number (blank = none): "), "Maximum build number");
    if (maxBuildNumber !== undefined) {
      gates.maxBuildNumber = maxBuildNumber;
    }

    if (Object.keys(gates).length > 0) {
      item.gates = gates;
    }

    feed.items = [item, ...feed.items];

    const result = validateFeed(feed);
    if (result.errors.length > 0) {
      throw new Error(`Generated mail is invalid:\n- ${result.errors.join("\n- ")}`);
    }

    await writeFeed(feed);
    console.log(`Created mail item "${id}".`);
    console.log(formatValidationSummary(result));
  } finally {
    rl.close();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
