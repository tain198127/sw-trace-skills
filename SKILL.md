---
name: sw-trace
description: SkyWalking trace fetcher, code locator and analyzer — batch fetch traces, locate code, auto-analyze errors and slow calls
---

# SkyWalking Trace Agent

Fetch SkyWalking traces, locate related source code, and generate analysis reports.

## Commands

### Fetch traces

```
/sw-trace <trace_ids> [--name <name>] [--no-analyze] [--no-locate] [--no-csv]
```

**Arguments:**
- `trace_ids` — One or more SkyWalking trace IDs (space or comma separated)

**Options:**
- `--name, -n` — Output folder name under `.trace/` (default: `trace-<timestamp>`)
- `--no-analyze` — Skip automatic analysis
- `--no-locate` — Skip code location
- `--no-csv` — Skip CSV export

**Examples:**
```
/sw-trace abc123.1.123 --name login-bug
/sw-trace id1 id2 id3 --name order-flow
```

### Configure

```
/sw-trace config
```

Interactively configure:
1. SkyWalking OAP address (host, port, protocol)
2. Code repositories (name, path, type: springboot/ejb/generic, source roots)
3. Output directory (default: `.trace`)

Configuration is saved to `.claude/sw-trace.yaml` in the project root.

### Help

```
/sw-trace help
```

## Workflow

When the user invokes `/sw-trace`:

1. **Check configuration** — Read `.claude/sw-trace.yaml`. If not found, prompt the user to run `/sw-trace config` first.

2. **Check prompt override** — If `prompt_override` is set in config and the file exists, use it to augment this skill's instructions. Otherwise use the default instructions below.

3. **Parse arguments** — Extract trace IDs and options from the user's input.

4. **Execute the sw-trace CLI tool:**
   ```bash
   cd ~/.claude/skills/sw-trace && npx tsx src/index.ts <trace_ids> --name <name>
   ```
   If `--no-analyze` / `--no-locate` / `--no-csv` are specified, pass them through.

5. **Review the output** — Read the generated files from `.trace/<name>/`:
   - `meta.json` — Fetch metadata
   - `raw/*.json` — Raw trace data
   - `*.csv` — Hierarchical CSV files
   - `locations.json` — Code location results
   - `analysis.md` — Analysis report

6. **Present results** — Show the conversation summary to the user. If errors or slow calls were found, highlight them with file:line references.

7. **Offer next steps** — Ask the user if they want to:
   - Read specific source files identified in the analysis
   - Dive deeper into a specific error or slow call
   - Compare traces

## Configuration File Format

```yaml
skywalking:
  host: "127.0.0.1"
  port: 12800
  protocol: "http"
  timeout: 30

codebases:
  - name: "my-service"
    path: "/path/to/project"
    type: "springboot"        # springboot | ejb | generic
    source_roots:
      - "src/main/java"

output:
  directory: ".trace"

# Optional: external prompt override file
prompt_override: "/path/to/custom-prompt.md"
```

## Config Subcommand Workflow

When the user invokes `/sw-trace config`, use AskUserQuestion to interactively:

1. Ask for SkyWalking OAP host (default: 127.0.0.1)
2. Ask for port (default: 12800)
3. Ask for protocol (default: http)
4. Ask if they want to add code repositories. For each:
   - Name (identifier)
   - Path (absolute path to the project)
   - Type (springboot / ejb / generic)
   - Source roots (e.g., src/main/java)
5. Ask if they want to add more repositories
6. Save to `.claude/sw-trace.yaml`

## Output Directory Structure

```
.trace/<name>/
├── meta.json              # Fetch metadata (trace IDs, timestamp, OAP URL)
├── raw/
│   ├── <trace_id>.json    # Raw span data from OAP
│   └── ...
├── <trace_id>.csv         # Hierarchical CSV (one per trace)
├── locations.json         # Code location results
└── analysis.md            # Analysis report
```

## Analysis Report Contents

The analysis report (`analysis.md`) includes:
- Summary (total spans, duration, error count)
- Error spans with code locations
- Slow calls ranked by duration
- Database call analysis
- Cross-trace comparison (when multiple traces are fetched)

## Default Instructions

When no prompt override is configured, follow these instructions:

- Always fetch ALL specified trace IDs in a single invocation
- Always run analysis unless `--no-analyze` is specified
- Always attempt code location unless `--no-locate` is specified or no codebases are configured
- Read and present the analysis.md content after generation
- Highlight actionable findings (errors, slow calls > 1s, shared slow code across traces)
