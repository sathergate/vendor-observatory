import type { VendorMention, MentionType, WorkCategory, VendorTaxonomy, ParsedTurn, UnknownPackage, ExtractionResult } from "./types.js";
import { resolvePackageToVendor as resolvePackageToVendorStatic, isBlocklistedPackage } from "./package-map.js";

/** Optional configuration for extractVendorMentions. */
export interface ExtractorOptions {
  /**
   * Custom package-name → vendor resolver. When provided, this is used instead
   * of the hardcoded PACKAGE_TO_VENDOR map.  Typically created via
   * `createPackageResolver(await loadPackageMapFromDb(pool))`.
   */
  packageResolver?: (packageName: string) => string | null;
}

// ── Package Manager Patterns ────────────────────────────────────────

const INSTALL_PATTERNS = [
  /(?:npm\s+install|npm\s+i|npx)\s+([^\s|&;]+(?:\s+[^\s|&;-][^\s|&;]*)*)/g,
  /(?:pnpm\s+add|pnpm\s+install)\s+([^\s|&;]+(?:\s+[^\s|&;-][^\s|&;]*)*)/g,
  /(?:yarn\s+add)\s+([^\s|&;]+(?:\s+[^\s|&;-][^\s|&;]*)*)/g,
  /(?:pip\s+install|pip3\s+install)\s+([^\s|&;]+(?:\s+[^\s|&;-][^\s|&;]*)*)/g,
  /(?:brew\s+install)\s+([^\s|&;]+)/g,
  /(?:docker\s+pull)\s+([^\s|&;]+)/g,
];

// ── Connection String Patterns ──────────────────────────────────────

const CONNECTION_PATTERNS: Array<{ pattern: RegExp; vendor: string }> = [
  { pattern: /neon\.tech/i, vendor: "neon" },
  { pattern: /supabase\.co/i, vendor: "supabase" },
  { pattern: /supabase\.com/i, vendor: "supabase" },
  { pattern: /planetscale\.com/i, vendor: "planetscale" },
  { pattern: /turso\.io/i, vendor: "turso" },
  { pattern: /cockroachlabs\.cloud/i, vendor: "cockroachdb" },
  { pattern: /upstash\.io/i, vendor: "upstash" },
  { pattern: /xata\.sh/i, vendor: "xata" },
  { pattern: /fauna\.com/i, vendor: "fauna" },
  { pattern: /convex\.cloud/i, vendor: "convex" },
  { pattern: /railway\.app/i, vendor: "railway-postgres" },
  { pattern: /vercel\.app/i, vendor: "vercel-edge-functions" },
  { pattern: /fly\.dev/i, vendor: "fly-io" },
  { pattern: /workers\.dev/i, vendor: "cloudflare-workers" },
  { pattern: /deno\.dev/i, vendor: "deno-deploy" },
];

// ── ENV Var Patterns ────────────────────────────────────────────────

const ENV_VAR_PATTERNS: Array<{ pattern: RegExp; vendor: string }> = [
  { pattern: /SUPABASE_URL|SUPABASE_KEY|SUPABASE_ANON_KEY|NEXT_PUBLIC_SUPABASE/i, vendor: "supabase" },
  { pattern: /NEON_DATABASE_URL|NEON_DB_URL/i, vendor: "neon" },
  { pattern: /TURSO_DATABASE_URL|TURSO_AUTH_TOKEN/i, vendor: "turso" },
  { pattern: /PLANETSCALE_|DATABASE_URL.*planetscale/i, vendor: "planetscale" },
  { pattern: /UPSTASH_REDIS_URL|UPSTASH_REDIS_TOKEN/i, vendor: "upstash" },
  { pattern: /SENTRY_DSN|NEXT_PUBLIC_SENTRY/i, vendor: "sentry" },
  { pattern: /DATADOG_API_KEY|DD_API_KEY/i, vendor: "datadog" },
  { pattern: /NEW_RELIC_LICENSE_KEY/i, vendor: "new-relic" },
  { pattern: /LAUNCHDARKLY_SDK_KEY|LD_SDK_KEY/i, vendor: "launchdarkly" },
  { pattern: /HONEYCOMB_API_KEY/i, vendor: "honeycomb" },
  { pattern: /AXIOM_TOKEN|AXIOM_DATASET/i, vendor: "axiom" },
  { pattern: /CLERK_SECRET_KEY|NEXT_PUBLIC_CLERK/i, vendor: "clerk" },
  { pattern: /AUTH0_SECRET|AUTH0_DOMAIN/i, vendor: "auth0" },
  { pattern: /CONVEX_URL|CONVEX_DEPLOYMENT/i, vendor: "convex" },
  { pattern: /LANGFUSE_SECRET_KEY|LANGFUSE_PUBLIC_KEY/i, vendor: "langfuse" },
  { pattern: /CLOUDFLARE_API_TOKEN|CF_API_TOKEN/i, vendor: "cloudflare-workers" },
  { pattern: /FLY_API_TOKEN/i, vendor: "fly-io" },
  { pattern: /DOPPLER_TOKEN/i, vendor: "doppler" },
  { pattern: /INFISICAL_TOKEN/i, vendor: "infisical" },
  { pattern: /SNYK_TOKEN/i, vendor: "snyk" },
  { pattern: /FAUNA_SECRET/i, vendor: "fauna" },
];

// ── CLI Command Patterns ────────────────────────────────────────────

const CLI_PATTERNS: Array<{ pattern: RegExp; vendor: string }> = [
  { pattern: /\bsupabase\s+(?:init|start|link|db\s+push|migration)/i, vendor: "supabase" },
  { pattern: /\bneon\s+(?:databases|branches|connection-string)/i, vendor: "neon" },
  { pattern: /\bturso\s+(?:db|auth|group)/i, vendor: "turso" },
  { pattern: /\bwrangler\s+(?:dev|deploy|publish|init)/i, vendor: "cloudflare-workers" },
  { pattern: /\bflyctl\s+|fly\s+(?:deploy|launch|scale)/i, vendor: "fly-io" },
  { pattern: /\bdagger\s+(?:run|call)/i, vendor: "dagger" },
  { pattern: /\bvercel\s+(?:deploy|dev|env|link)/i, vendor: "vercel-edge-functions" },
  { pattern: /\bnetlify\s+(?:deploy|dev|init)/i, vendor: "netlify" },
  { pattern: /\bsentry-cli\s+/i, vendor: "sentry" },
  { pattern: /\bdoppler\s+(?:run|setup|secrets)/i, vendor: "doppler" },
  { pattern: /\binfisical\s+(?:init|run|secrets)/i, vendor: "infisical" },
];

// ── Comparison / Rejection Phrases ──────────────────────────────────

const COMPARISON_PHRASES = [
  /(?:compared?\s+to|versus|vs\.?|alternatively|or\s+you\s+could\s+use|another\s+option\s+is|instead\s+of)/i,
];

const REJECTION_PHRASES = [
  /(?:(?:I\s+)?(?:wouldn't|would\s+not|don't|do\s+not)\s+recommend|avoid|stay\s+away\s+from|not\s+(?:a\s+good|the\s+best)\s+(?:choice|option|fit)|(?:downside|drawback|limitation)s?\s+of)/i,
];

const RECOMMENDATION_PHRASES = [
  /(?:I\s+(?:recommend|suggest)|you\s+(?:should|could)\s+use|(?:great|good|excellent|best|ideal)\s+(?:choice|option|fit)|let's\s+use|we(?:'ll)?\s+use)/i,
];

// ── Main Extraction Function ────────────────────────────────────────

/**
 * Extract vendor mentions from a single turn (user or assistant).
 * Returns an array of VendorMentions with deduplication within the turn.
 *
 * @param options.packageResolver - custom resolver for package → vendor mapping.
 *   When omitted, falls back to the static PACKAGE_TO_VENDOR map.
 */
export function extractVendorMentions(
  turn: ParsedTurn,
  taxonomy: VendorTaxonomy,
  userPromptSnippet: string | null,
  options?: ExtractorOptions,
): VendorMention[] {
  const resolvePackage = options?.packageResolver ?? resolvePackageToVendorStatic;
  const mentions: VendorMention[] = [];
  const seen = new Set<string>(); // "vendorId:mentionType" for dedup within turn

  function addMention(m: Omit<VendorMention, "userPromptSnippet">) {
    const key = `${m.vendorCanonicalId}:${m.mentionType}`;
    if (seen.has(key)) return;
    seen.add(key);

    // Look up work category from taxonomy
    const entry = taxonomy.vendors.find(v => v.canonical_id === m.vendorCanonicalId);
    const workCategory = (entry?.category as WorkCategory) ?? "other";

    mentions.push({ ...m, userPromptSnippet, workCategory });
  }

  // ── Tier 1: Package install signals from tool_use blocks ────────
  for (const toolUse of turn.toolUses) {
    const command = getCommandFromToolUse(toolUse);
    if (!command) continue;

    for (const pattern of INSTALL_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(command)) !== null) {
        const pkgStr = match[1];
        // Split on whitespace to handle "npm install pkg1 pkg2"
        const pkgs = pkgStr.split(/\s+/).filter(p => p && !p.startsWith("-"));
        for (const pkg of pkgs) {
          const vendorId = resolvePackage(pkg);
          if (vendorId) {
            addMention({
              vendorCanonicalId: vendorId,
              vendorRaw: pkg,
              mentionType: "installed",
              confidence: 1.0,
              contextSnippet: command.slice(0, 200),
              timestamp: turn.timestamp,
              workCategory: null,
            });
          }
        }
      }
    }

    // Check for CLI command patterns
    if (command) {
      for (const { pattern, vendor } of CLI_PATTERNS) {
        if (pattern.test(command)) {
          addMention({
            vendorCanonicalId: vendor,
            vendorRaw: command.slice(0, 80),
            mentionType: "configured",
            confidence: 0.9,
            contextSnippet: command.slice(0, 200),
            timestamp: turn.timestamp,
            workCategory: null,
          });
        }
      }
    }
  }

  // ── Tier 2: Configuration signals from tool_use (Write/Edit) ────
  for (const toolUse of turn.toolUses) {
    const content = getWriteContentFromToolUse(toolUse);
    if (!content) continue;

    // Check connection strings
    for (const { pattern, vendor } of CONNECTION_PATTERNS) {
      if (pattern.test(content)) {
        addMention({
          vendorCanonicalId: vendor,
          vendorRaw: pattern.source,
          mentionType: "configured",
          confidence: 0.95,
          contextSnippet: content.slice(0, 200),
          timestamp: turn.timestamp,
          workCategory: null,
        });
      }
    }

    // Check env vars
    for (const { pattern, vendor } of ENV_VAR_PATTERNS) {
      if (pattern.test(content)) {
        addMention({
          vendorCanonicalId: vendor,
          vendorRaw: pattern.source,
          mentionType: "configured",
          confidence: 0.9,
          contextSnippet: content.slice(0, 200),
          timestamp: turn.timestamp,
          workCategory: null,
        });
      }
    }

    // Check import statements → "implemented"
    const importMatches = content.matchAll(
      /(?:import\s+.*?from\s+['"]|require\s*\(\s*['"])([^'"]+)['"]/g,
    );
    for (const im of importMatches) {
      const pkg = im[1];
      const vendorId = resolvePackage(pkg);
      if (vendorId) {
        addMention({
          vendorCanonicalId: vendorId,
          vendorRaw: pkg,
          mentionType: "implemented",
          confidence: 0.9,
          contextSnippet: content.slice(0, 200),
          timestamp: turn.timestamp,
          workCategory: null,
        });
      }
    }
  }

  // ── Tier 3: Text mentions from assistant text ─────────────────
  if (turn.role === "assistant" && turn.textContent) {
    extractTextMentions(turn.textContent, taxonomy, turn.timestamp, addMention);
  }

  return mentions;
}

/**
 * Extract vendor mentions AND collect unknown packages in one pass.
 * Unknown packages are those that appear in install commands or import
 * statements but don't resolve to any known vendor and aren't blocklisted.
 *
 * The caller (ingest-bridge) uses the unknownPackages list to create
 * dynamic vendor entries, then re-extracts to catch text mentions.
 */
export function extractVendorMentionsWithUnknowns(
  turn: ParsedTurn,
  taxonomy: VendorTaxonomy,
  userPromptSnippet: string | null,
  options?: ExtractorOptions,
): ExtractionResult {
  const resolvePackage = options?.packageResolver ?? resolvePackageToVendorStatic;
  const mentions: VendorMention[] = [];
  const unknownPackages: UnknownPackage[] = [];
  const seen = new Set<string>();
  const seenUnknown = new Set<string>();

  function addMention(m: Omit<VendorMention, "userPromptSnippet">) {
    const key = `${m.vendorCanonicalId}:${m.mentionType}`;
    if (seen.has(key)) return;
    seen.add(key);
    const entry = taxonomy.vendors.find(v => v.canonical_id === m.vendorCanonicalId);
    const workCategory = (entry?.category as WorkCategory) ?? "other";
    mentions.push({ ...m, userPromptSnippet, workCategory });
  }

  function addUnknown(pkg: string, command: string, timestamp: string) {
    if (seenUnknown.has(pkg)) return;
    seenUnknown.add(pkg);
    unknownPackages.push({
      packageName: pkg,
      installCommand: command.slice(0, 300),
      timestamp,
      contextSnippet: command.slice(0, 200),
    });
  }

  // ── Tier 1: Package install signals from tool_use blocks ────────
  for (const toolUse of turn.toolUses) {
    const command = getCommandFromToolUse(toolUse);
    if (!command) continue;

    for (const pattern of INSTALL_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(command)) !== null) {
        const pkgStr = match[1];
        const pkgs = pkgStr.split(/\s+/).filter(p => p && !p.startsWith("-"));
        for (const pkg of pkgs) {
          const vendorId = resolvePackage(pkg);
          if (vendorId) {
            addMention({
              vendorCanonicalId: vendorId,
              vendorRaw: pkg,
              mentionType: "installed",
              confidence: 1.0,
              contextSnippet: command.slice(0, 200),
              timestamp: turn.timestamp,
              workCategory: null,
            });
          } else {
            const cleaned = pkg.replace(/@[\d^~>=<.*]+$/, "");
            if (!isBlocklistedPackage(cleaned)) {
              addUnknown(cleaned, command, turn.timestamp);
            }
          }
        }
      }
    }

    // CLI command patterns (same as original — no unknown collection needed)
    if (command) {
      for (const { pattern, vendor } of CLI_PATTERNS) {
        if (pattern.test(command)) {
          addMention({
            vendorCanonicalId: vendor,
            vendorRaw: command.slice(0, 80),
            mentionType: "configured",
            confidence: 0.9,
            contextSnippet: command.slice(0, 200),
            timestamp: turn.timestamp,
            workCategory: null,
          });
        }
      }
    }
  }

  // ── Tier 2: Configuration signals from tool_use (Write/Edit) ────
  for (const toolUse of turn.toolUses) {
    const content = getWriteContentFromToolUse(toolUse);
    if (!content) continue;

    for (const { pattern, vendor } of CONNECTION_PATTERNS) {
      if (pattern.test(content)) {
        addMention({
          vendorCanonicalId: vendor,
          vendorRaw: pattern.source,
          mentionType: "configured",
          confidence: 0.95,
          contextSnippet: content.slice(0, 200),
          timestamp: turn.timestamp,
          workCategory: null,
        });
      }
    }

    for (const { pattern, vendor } of ENV_VAR_PATTERNS) {
      if (pattern.test(content)) {
        addMention({
          vendorCanonicalId: vendor,
          vendorRaw: pattern.source,
          mentionType: "configured",
          confidence: 0.9,
          contextSnippet: content.slice(0, 200),
          timestamp: turn.timestamp,
          workCategory: null,
        });
      }
    }

    // Import statements — collect unknowns here too
    const importMatches = content.matchAll(
      /(?:import\s+.*?from\s+['"]|require\s*\(\s*['"])([^'"]+)['"]/g,
    );
    for (const im of importMatches) {
      const pkg = im[1];
      // Skip relative imports
      if (pkg.startsWith(".") || pkg.startsWith("/")) continue;
      const vendorId = resolvePackage(pkg);
      if (vendorId) {
        addMention({
          vendorCanonicalId: vendorId,
          vendorRaw: pkg,
          mentionType: "implemented",
          confidence: 0.9,
          contextSnippet: content.slice(0, 200),
          timestamp: turn.timestamp,
          workCategory: null,
        });
      } else {
        const cleaned = pkg.replace(/@[\d^~>=<.*]+$/, "");
        if (!isBlocklistedPackage(cleaned)) {
          addUnknown(cleaned, `import ${pkg}`, turn.timestamp);
        }
      }
    }
  }

  // ── Tier 3: Text mentions from assistant text ─────────────────
  if (turn.role === "assistant" && turn.textContent) {
    extractTextMentions(turn.textContent, taxonomy, turn.timestamp, addMention);
  }

  return { mentions, unknownPackages };
}

/**
 * Extract vendor mentions from free text using taxonomy matching.
 */
function extractTextMentions(
  text: string,
  taxonomy: VendorTaxonomy,
  timestamp: string,
  addMention: (m: Omit<VendorMention, "userPromptSnippet">) => void,
): void {
  for (const vendor of taxonomy.vendors) {
    // Build list of terms to match
    const terms = [vendor.display_name, ...vendor.synonyms];

    for (const term of terms) {
      // Skip very short terms that cause false positives
      if (term.length < 3) continue;

      // Word-boundary match (case-insensitive)
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "i");
      const match = regex.exec(text);

      if (!match) continue;

      // Determine mention type based on surrounding context
      const startIdx = Math.max(0, match.index - 100);
      const endIdx = Math.min(text.length, match.index + term.length + 100);
      const context = text.slice(startIdx, endIdx);

      let mentionType: MentionType = "mentioned";
      let confidence = 0.5;

      // Check for rejection context
      if (REJECTION_PHRASES.some(p => p.test(context))) {
        mentionType = "rejected";
        confidence = 0.7;
      }
      // Check for comparison context
      else if (COMPARISON_PHRASES.some(p => p.test(context))) {
        mentionType = "compared";
        confidence = 0.7;
      }
      // Check for recommendation context
      else if (RECOMMENDATION_PHRASES.some(p => p.test(context))) {
        mentionType = "recommended";
        confidence = 0.8;
      }

      addMention({
        vendorCanonicalId: vendor.canonical_id,
        vendorRaw: match[0],
        mentionType,
        confidence,
        contextSnippet: context,
        timestamp,
        workCategory: null,
      });

      break; // Only match each vendor once per text block
    }
  }
}

// ── Helper: Extract command from tool_use ────────────────────────────

function getCommandFromToolUse(toolUse: { toolName: string; input: Record<string, unknown> }): string | null {
  // Claude Code: Bash tool with "command" input
  if (toolUse.toolName === "Bash" && typeof toolUse.input.command === "string") {
    return toolUse.input.command;
  }
  // Codex CLI: shell/shell_command function with "command" input
  if (toolUse.toolName === "shell" || toolUse.toolName === "shell_command") {
    const cmd = toolUse.input.command;
    if (Array.isArray(cmd)) {
      return (cmd as string[]).join(" ");
    }
    if (typeof cmd === "string") return cmd;

    // May be in arguments as JSON string
    const args = toolUse.input.arguments;
    if (typeof args === "string") {
      try {
        const parsed = JSON.parse(args);
        if (Array.isArray(parsed.command)) return parsed.command.join(" ");
      } catch { /* ignore */ }
    }
  }
  return null;
}

function getWriteContentFromToolUse(toolUse: { toolName: string; input: Record<string, unknown> }): string | null {
  if (toolUse.toolName === "Write" || toolUse.toolName === "Edit") {
    return (
      (typeof toolUse.input.content === "string" ? toolUse.input.content : null) ??
      (typeof toolUse.input.new_string === "string" ? toolUse.input.new_string : null)
    );
  }
  // Codex CLI: apply_patch tool contains file content as raw string
  if (toolUse.toolName === "apply_patch") {
    return typeof toolUse.input.raw === "string" ? toolUse.input.raw : null;
  }
  return null;
}
