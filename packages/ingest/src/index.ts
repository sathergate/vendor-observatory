#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { resolve, join, basename, dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import {
  loadVendorTaxonomy,
  extractVendorMentions,
  extractResponseContext,
  isEnrichmentEnabled,
  extractResponseContextWithLLM,
  classifyIntent,
} from "@obs/shared";
import type { VendorTaxonomy } from "@obs/shared";
import { ObservatoryDB } from "./db.js";
import { scanForTranscripts, scanAllTranscripts } from "./scanner.js";
import { parseClaudeCodeFile } from "./parsers/claude-code.js";
import { parseCodexCliFile } from "./parsers/codex-cli.js";
import { parseCursorAgentFile } from "./parsers/cursor-agent.js";

const program = new Command();

program
  .name("obs")
  .description("Vendor Observatory — passive observation of AI coding assistant vendor recommendations")
  .version("0.2.0");

// ── Find taxonomy file ──────────────────────────────────────────────

function findTaxonomyPath(): string {
  const candidates = [
    resolve(process.cwd(), "taxonomy", "vendors.yaml"),
    resolve(process.cwd(), "..", "..", "taxonomy", "vendors.yaml"),
  ];
  if (import.meta.dirname) {
    candidates.push(resolve(import.meta.dirname, "..", "..", "..", "taxonomy", "vendors.yaml"));
  }
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`Cannot find taxonomy/vendors.yaml. Tried: ${candidates.join(", ")}`);
}

function getDbPath(opts?: { db?: string }): string {
  const envPath = opts?.db || process.env.OBS_DB_PATH;
  if (envPath) return resolve(envPath);
  const dbDir = resolve(process.cwd(), "db");
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
  return resolve(dbDir, "observatory.sqlite");
}

// ── Ingest Command ──────────────────────────────────────────────────

program
  .command("ingest")
  .description("Scan and ingest transcript files from AI coding platforms")
  .option("--source <source>", "Source platform: claude-code, codex-cli, or all", "all")
  .option("--dry-run", "Show what would be ingested without writing", false)
  .option("--db <path>", "Path to SQLite database")
  .option("--taxonomy <path>", "Path to vendor taxonomy YAML")
  .action(async (opts) => {
    const taxonomyPath = opts.taxonomy ?? findTaxonomyPath();
    let taxonomy: VendorTaxonomy;
    try {
      taxonomy = loadVendorTaxonomy(taxonomyPath);
      console.log(chalk.green(`✓ Loaded ${taxonomy.vendors.length} vendors from taxonomy`));
    } catch (err) {
      console.error(chalk.red(`✗ Failed to load taxonomy: ${err}`));
      process.exit(1);
    }

    // Scan for files
    const source = opts.source as string;
    const files =
      source === "all" ? scanAllTranscripts()
      : source === "claude-code" ? scanForTranscripts("claude_code")
      : source === "codex-cli" ? scanForTranscripts("codex_cli")
      : source === "cursor" ? scanForTranscripts("cursor")
      : null;

    if (!files) {
      console.error(chalk.red(`Unknown source: ${source}. Use claude-code, codex-cli, cursor, or all.`));
      process.exit(1);
    }

    console.log(chalk.blue(`Found ${files.length} transcript files`));

    if (opts.dryRun) {
      for (const f of files) {
        console.log(chalk.gray(`  [dry-run] ${f.platform} ${f.path} (${(f.size / 1024).toFixed(1)}KB)`));
      }
      return;
    }

    const dbPath = getDbPath(opts);
    const db = new ObservatoryDB(dbPath);
    console.log(chalk.green(`✓ Database: ${dbPath}`));

    let totalSessions = 0;
    let totalObservations = 0;
    let skippedFiles = 0;
    let processedFiles = 0;

    for (const file of files) {
      if (!db.needsReingestion(file.path, file.size, file.mtime)) {
        skippedFiles++;
        continue;
      }

      console.log(chalk.blue(`  Processing: ${file.path}`));

      let sessions;
      try {
        if (file.platform === "claude_code") {
          sessions = parseClaudeCodeFile(file.path);
        } else if (file.platform === "codex_cli") {
          sessions = parseCodexCliFile(file.path);
        } else if (file.platform === "cursor") {
          sessions = parseCursorAgentFile(file.path);
        } else {
          console.log(chalk.gray(`    Skipping unknown platform: ${file.platform}`));
          continue;
        }
      } catch (err) {
        console.error(chalk.red(`    Error parsing: ${err}`));
        continue;
      }

      console.log(chalk.gray(`    Found ${sessions.length} sessions`));

      // Collect benchmark sessions that need async LLM enrichment (done after transaction)
      const pendingLLMEnrichments: Array<{
        sessionId: string;
        promptId: string;
        turns: typeof sessions[0]["turns"];
        constraints: string[];
        promptText: string;
      }> = [];

      db.runInTransaction(() => {
        db.deleteSessionsByFilePath(file.path);

        for (const session of sessions) {
          db.upsertSession({
            id: session.id,
            sourcePlatform: session.platform,
            modelId: session.modelId,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            cwd: session.cwd,
            gitBranch: session.gitBranch,
            turnCount: session.turns.length,
            filePath: file.path,
          });

          let lastUserText: string | null = null;
          let sessionObservations = 0;

          for (const turn of session.turns) {
            // Track user messages for context
            if (turn.role === "user" && turn.textContent) {
              lastUserText = turn.textContent.slice(0, 300);
            }

            // Extract vendor mentions from this turn
            const mentions = extractVendorMentions(turn, taxonomy, lastUserText);

            for (const mention of mentions) {
              db.insertObservation(session.id, mention);
              sessionObservations++;
            }

            // Record tool actions
            for (const toolUse of turn.toolUses) {
              const command = getCommandStr(toolUse);
              const vendorId = mentions.find(
                (m) => m.mentionType === "installed" || m.mentionType === "configured",
              )?.vendorCanonicalId ?? null;

              db.insertToolAction(
                session.id,
                toolUse.toolName,
                command?.slice(0, 500) ?? null,
                vendorId,
                vendorId ? (mentions.find((m) => m.vendorCanonicalId === vendorId)?.mentionType ?? null) : null,
                null,
                turn.timestamp,
              );
            }
          }

          totalObservations += sessionObservations;
          if (sessionObservations > 0) {
            console.log(chalk.green(`    Session ${session.id.slice(0, 8)}... → ${sessionObservations} vendor observations`));
          }

          // ── Enrichment: Store prompt metadata + response context for benchmark sessions ──
          const isBenchmark = (session.cwd && session.cwd.includes("obs-bench")) || session.gitBranch === "__obs_bench__";
          if (isBenchmark && session.cwd) {
            try {
              // Extract prompt ID from workspace path: /tmp/obs-bench/YYYY-MM-DD/{promptId}-{assistant}/
              const workDir = session.cwd;
              const dirName = basename(workDir);
              // dirName looks like "db-01-claude_code" — split at last dash before platform
              const promptId = dirName.replace(/-(?:claude_code|codex_cli|cursor)$/, "");

              // Try to load sidecar metadata
              const sidecarPath = join(workDir, "prompt-metadata.json");
              if (existsSync(sidecarPath)) {
                try {
                  const raw = readFileSync(sidecarPath, "utf-8");
                  const sidecar = JSON.parse(raw) as {
                    promptId: string;
                    category: string;
                    metadata: {
                      contentTags: string[];
                      patternTags: string[];
                      constraints: string[];
                      existingStack: string[];
                      failureMode: string | null;
                      vendorsNamedInPrompt: string[];
                    };
                  };
                  db.upsertPromptMetadata({
                    promptId: sidecar.promptId,
                    category: sidecar.category,
                    contentTags: sidecar.metadata.contentTags,
                    patternTags: sidecar.metadata.patternTags,
                    constraints: sidecar.metadata.constraints,
                    existingStack: sidecar.metadata.existingStack,
                    failureMode: sidecar.metadata.failureMode,
                    vendorsNamedInPrompt: sidecar.metadata.vendorsNamedInPrompt,
                  });
                } catch {
                  // Sidecar parse failure is non-fatal
                }
              }

              // Run regex-based reasoning extractor (synchronous, always runs)
              const promptMeta = db.getPromptMetadata(promptId);
              const constraints = promptMeta ? JSON.parse(promptMeta.constraints) as string[] : [];
              const responseCtx = extractResponseContext(session.turns, taxonomy, constraints);

              db.upsertResponseContext({
                sessionId: session.id,
                promptId,
                primaryVendor: responseCtx.primaryVendor,
                isImplemented: responseCtx.isImplemented,
                rationaleSnippet: responseCtx.rationaleSnippet,
                vendorsMentioned: responseCtx.vendorsMentioned,
                tradeOffsSnippet: responseCtx.tradeOffsSnippet,
                gotchasSnippet: responseCtx.gotchasSnippet,
                constraintsAddressed: responseCtx.constraintsAddressed,
              });

              if (responseCtx.primaryVendor) {
                console.log(chalk.cyan(`    Enrichment: ${promptId} → primary=${responseCtx.primaryVendor}, constraints=${responseCtx.constraintsAddressed.length}/${constraints.length}`));
              }

              // ── Intent Classification (rule-based, synchronous) ──
              const userPromptText = session.turns
                .filter((t) => t.role === "user" && t.textContent)
                .map((t) => t.textContent)
                .join("\n");
              if (userPromptText) {
                const intent = classifyIntent(userPromptText);
                db.upsertPromptIntent({
                  sessionId: session.id,
                  promptId,
                  intent,
                });
                if (intent.intent !== "unknown") {
                  console.log(chalk.magenta(`    Intent: ${promptId} → ${intent.intent} (${Math.round(intent.confidence * 100)}%${intent.subIntent ? `, ${intent.subIntent}` : ""})`));
                }
              }

              // Queue for async LLM enrichment if enabled
              if (isEnrichmentEnabled()) {
                const promptText = session.turns
                  .filter((t) => t.role === "user" && t.textContent)
                  .map((t) => t.textContent)
                  .join("\n");
                pendingLLMEnrichments.push({
                  sessionId: session.id,
                  promptId,
                  turns: session.turns,
                  constraints,
                  promptText,
                });
              }
            } catch (enrichErr) {
              // Enrichment failure is non-fatal — don't break ingestion
              console.log(chalk.gray(`    Enrichment skipped: ${enrichErr}`));
            }
          }
        }

        totalSessions += sessions.length;
        db.upsertIngestedFile(file.path, file.size, file.mtime, file.platform, sessions.length);
      });

      // ── Populate search index from enrichment data ──
      try {
        const allCtxs = db.getAllResponseContexts();
        const searchEntries: Array<{
          sourceType: string; sourceId: string; vendor: string;
          category: string; platform: string; promptId: string; textContent: string;
        }> = [];

        for (const ctx of allCtxs) {
          const baseEntry = {
            vendor: ctx.primary_vendor || "",
            category: ctx.category || "",
            platform: ctx.source_platform,
            promptId: ctx.prompt_id,
          };

          if (ctx.rationale_snippet) {
            searchEntries.push({ ...baseEntry, sourceType: "rationale", sourceId: `rationale-${ctx.session_id}-${ctx.prompt_id}`, textContent: ctx.rationale_snippet });
          }
          if (ctx.trade_offs_snippet) {
            searchEntries.push({ ...baseEntry, sourceType: "trade_off", sourceId: `tradeoff-${ctx.session_id}-${ctx.prompt_id}`, textContent: ctx.trade_offs_snippet });
          }
          if (ctx.gotchas_snippet) {
            searchEntries.push({ ...baseEntry, sourceType: "gotcha", sourceId: `gotcha-${ctx.session_id}-${ctx.prompt_id}`, textContent: ctx.gotchas_snippet });
          }
        }

        if (searchEntries.length > 0) {
          db.populateSearchIndex(searchEntries);
          console.log(chalk.cyan(`    Search index: ${searchEntries.length} entries indexed`));
        }
      } catch (searchErr) {
        console.log(chalk.gray(`    Search index population failed: ${searchErr}`));
      }

      // ── Async LLM enrichment pass (outside transaction) ──
      if (pendingLLMEnrichments.length > 0) {
        console.log(chalk.blue(`  LLM enrichment: processing ${pendingLLMEnrichments.length} sessions...`));
        let llmSuccesses = 0;
        for (const pending of pendingLLMEnrichments) {
          try {
            const llmCtx = await extractResponseContextWithLLM(
              pending.turns,
              taxonomy,
              pending.constraints,
            );
            if (llmCtx) {
              db.upsertResponseContext({
                sessionId: pending.sessionId,
                promptId: pending.promptId,
                primaryVendor: llmCtx.primaryVendor,
                isImplemented: llmCtx.isImplemented,
                rationaleSnippet: llmCtx.rationaleSnippet,
                vendorsMentioned: llmCtx.vendorsMentioned,
                tradeOffsSnippet: llmCtx.tradeOffsSnippet,
                gotchasSnippet: llmCtx.gotchasSnippet,
                constraintsAddressed: llmCtx.constraintsAddressed,
                reasoningChain: llmCtx.reasoningChain,
                disqualificationReasons: llmCtx.disqualificationReasons,
                confidenceScore: llmCtx.confidenceScore,
              });
              llmSuccesses++;
              console.log(chalk.green(`    LLM: ${pending.promptId} → primary=${llmCtx.primaryVendor} (conf=${llmCtx.confidenceScore?.toFixed(2)})`));
            }
          } catch (llmErr) {
            console.log(chalk.gray(`    LLM enrichment failed for ${pending.promptId}: ${llmErr}`));
          }
        }
        console.log(chalk.green(`  LLM enrichment complete: ${llmSuccesses}/${pendingLLMEnrichments.length} succeeded`));
      }

      processedFiles++;
    }

    db.close();

    console.log(chalk.green("\n✓ Ingestion complete"));
    console.log(`  Files processed: ${processedFiles}`);
    console.log(`  Files skipped (unchanged): ${skippedFiles}`);
    console.log(`  Sessions found: ${totalSessions}`);
    console.log(`  Vendor observations: ${totalObservations}`);
  });

// ── Stats Command ───────────────────────────────────────────────────

program
  .command("stats")
  .description("Show statistics from the observation database")
  .option("--by <dimension>", "Group by: vendor, platform, category, action", "vendor")
  .option("--db <path>", "Path to SQLite database")
  .action((opts) => {
    const dbPath = getDbPath(opts);
    if (!existsSync(dbPath)) {
      console.error(chalk.red("No database found. Run 'obs ingest' first."));
      process.exit(1);
    }

    const db = new ObservatoryDB(dbPath);
    const by = opts.by as string;

    console.log(chalk.blue(`\nVendor Observatory — Stats by ${by}\n`));

    switch (by) {
      case "vendor": {
        const stats = db.getVendorStats();
        if (stats.length === 0) {
          console.log(chalk.yellow("No vendor observations found."));
          break;
        }
        console.log(
          chalk.bold(
            "Vendor".padEnd(25) +
            "Total".padStart(6) +
            "Install".padStart(9) +
            "Config".padStart(8) +
            "Recommend".padStart(11) +
            "Mention".padStart(9) +
            "Platforms".padStart(25),
          ),
        );
        console.log("─".repeat(93));
        for (const s of stats) {
          console.log(
            s.vendor_canonical_id.padEnd(25) +
            String(s.total).padStart(6) +
            String(s.installed).padStart(9) +
            String(s.configured).padStart(8) +
            String(s.recommended).padStart(11) +
            String(s.mentioned).padStart(9) +
            s.platforms.padStart(25),
          );
        }
        break;
      }

      case "platform": {
        const dashboard = db.getDashboardStats();
        console.log(chalk.bold("Platform".padEnd(20) + "Sessions".padStart(10)));
        console.log("─".repeat(30));
        for (const [platform, count] of Object.entries(dashboard.platformBreakdown)) {
          console.log(platform.padEnd(20) + String(count).padStart(10));
        }
        console.log(`\n  Total sessions: ${dashboard.totalSessions}`);
        console.log(`  Total observations: ${dashboard.totalObservations}`);
        console.log(`  Unique vendors: ${dashboard.uniqueVendors}`);
        break;
      }

      case "category": {
        const stats = db.getVendorStats();
        const categories = new Map<string, { count: number; vendors: string[] }>();
        for (const s of stats) {
          const cat = s.category || "other";
          const existing = categories.get(cat) || { count: 0, vendors: [] };
          existing.count += s.total;
          existing.vendors.push(s.vendor_canonical_id);
          categories.set(cat, existing);
        }
        console.log(chalk.bold("Category".padEnd(25) + "Count".padStart(7) + "  Vendors"));
        console.log("─".repeat(70));
        const sorted = [...categories.entries()].sort((a, b) => b[1].count - a[1].count);
        for (const [cat, data] of sorted) {
          console.log(
            cat.padEnd(25) +
            String(data.count).padStart(7) +
            "  " + data.vendors.slice(0, 5).join(", "),
          );
        }
        break;
      }

      case "action": {
        const funnels = db.getActionFunnels();
        if (funnels.length === 0) {
          console.log(chalk.yellow("No action data found."));
          break;
        }
        console.log(
          chalk.bold(
            "Vendor".padEnd(25) +
            "Mentioned".padStart(10) +
            "Recommend".padStart(10) +
            "Installed".padStart(10) +
            "Conv%".padStart(7),
          ),
        );
        console.log("─".repeat(62));
        for (const f of funnels) {
          console.log(
            f.vendor_canonical_id.padEnd(25) +
            String(f.mentioned_total).padStart(10) +
            String(f.recommended_total).padStart(10) +
            String(f.installed_total).padStart(10) +
            `${(f.conversion_rate * 100).toFixed(0)}%`.padStart(7),
          );
        }
        break;
      }

      default:
        console.error(chalk.red(`Unknown dimension: ${by}. Use vendor, platform, category, or action.`));
        process.exit(1);
    }

    db.close();
  });

// ── Analyze Command ─────────────────────────────────────────────────

program
  .command("analyze")
  .description("Run cross-session divergence analysis")
  .option("--type <type>", "Analysis type: divergences, constraints, drift, all", "all")
  .option("--db <path>", "Path to SQLite database")
  .action(async (opts) => {
    const dbPath = getDbPath(opts);
    if (!existsSync(dbPath)) {
      console.error(chalk.red("No database found. Run 'obs ingest' first."));
      process.exit(1);
    }
    const db = new ObservatoryDB(dbPath);
    const { analyzePlatformDivergence, analyzeConstraintInfluence, analyzeTemporalDrift } = await import("./analyzer.js");
    const type = opts.type as string;

    console.log(chalk.blue("\nVendor Observatory — Cross-Session Analysis\n"));

    if (type === "all" || type === "divergences") {
      console.log(chalk.cyan("Analyzing platform divergence..."));
      const results = analyzePlatformDivergence(db);
      console.log(chalk.green(`  ${results.length} prompts analyzed, ${results.filter(r => r.isDivergent).length} divergent`));
    }
    if (type === "all" || type === "constraints") {
      console.log(chalk.cyan("Analyzing constraint influence..."));
      const results = analyzeConstraintInfluence(db);
      console.log(chalk.green(`  ${results.length} constraints analyzed`));
    }
    if (type === "all" || type === "drift") {
      console.log(chalk.cyan("Analyzing temporal drift..."));
      const results = analyzeTemporalDrift(db);
      console.log(chalk.green(`  ${results.length} vendor drift signals detected`));
    }

    db.close();
    console.log(chalk.green("\n✓ Analysis complete"));
  });

// ── Digest Command ──────────────────────────────────────────────────

program
  .command("digest")
  .description("Generate post-benchmark daily digest")
  .option("--date <date>", "Digest date (YYYY-MM-DD)", new Date().toISOString().slice(0, 10))
  .option("--db <path>", "Path to SQLite database")
  .action(async (opts) => {
    const dbPath = getDbPath(opts);
    if (!existsSync(dbPath)) {
      console.error(chalk.red("No database found. Run 'obs ingest' first."));
      process.exit(1);
    }
    const db = new ObservatoryDB(dbPath);
    const { createSnapshot, detectDeltas, scoreSignificance, generateNarrative, emitAlerts } = await import("./digest.js");
    const date = opts.date as string;

    console.log(chalk.blue(`\nVendor Observatory — Daily Digest (${date})\n`));

    console.log(chalk.cyan("Creating snapshot..."));
    const snapshotCount = createSnapshot(db, date);
    console.log(chalk.green(`  ${snapshotCount} snapshot entries created`));

    console.log(chalk.cyan("Detecting deltas..."));
    const deltas = detectDeltas(db, date);
    console.log(chalk.green(`  ${deltas.length} vendor position changes detected`));

    const significant = scoreSignificance(deltas);
    console.log(chalk.green(`  ${significant.length} significant changes`));

    console.log(chalk.cyan("Generating narrative..."));
    const summary = await generateNarrative(significant);
    console.log(chalk.green(`  Summary: ${summary?.slice(0, 100) ?? "(template)"}`));

    const alerts = emitAlerts(deltas);
    console.log(chalk.green(`  ${alerts.length} alerts emitted`));

    db.upsertDailyDigest(date, summary, significant, alerts);
    console.log(chalk.green("\n✓ Digest stored in database"));

    db.close();
  });

// ── Serve Command ───────────────────────────────────────────────────

program
  .command("serve")
  .description("Start the web dashboard")
  .option("--port <port>", "Port number", "3000")
  .action(async (opts) => {
    console.log(chalk.blue(`Starting web dashboard on port ${opts.port}...`));
    const { execSync } = await import("node:child_process");
    try {
      execSync(`pnpm --filter web dev -- --port ${opts.port}`, {
        stdio: "inherit",
        cwd: resolve(process.cwd()),
      });
    } catch {
      // Server was terminated
    }
  });

// ── Helper ──────────────────────────────────────────────────────────

function getCommandStr(toolUse: { toolName: string; input: Record<string, unknown> }): string | null {
  if (toolUse.toolName === "Bash" && typeof toolUse.input.command === "string") {
    return toolUse.input.command;
  }
  if (toolUse.toolName === "shell") {
    const cmd = toolUse.input.command;
    if (Array.isArray(cmd)) return (cmd as string[]).join(" ");
    if (typeof cmd === "string") return cmd;
  }
  if (toolUse.toolName === "Write" || toolUse.toolName === "Edit") {
    return (toolUse.input.file_path as string) ?? null;
  }
  return null;
}

program.parse();
