# icon-fetcher

It downloads MIT-licensed `.excalidrawlib` packs from [excalidraw-libraries](https://github.com/excalidraw/excalidraw-libraries), lets you attach semantic tags to each icon, and emits the `registry.json` the server feeds to the LLM (`apps/server/src/lib/icons/registry.json`).

The AI never sees pixels -- it picks icons by `id` from the tags/keywords we write here. Garbage tags in, garbage icon choices out. This tool is the tagging surface.

## Requirements

- Rust (edition 2024). Network access for `list` / `fetch`.

## Pipeline

```bash
cd scripts/icon-fetcher

# 1. See what's available (230+ libraries)
cargo run -- list

# 2. Download the packs you want (parallel, 16 at a time)
cargo run -- fetch --source=aws-architecture-icons
cargo run -- fetch --source=software-architecture
#   --source matches name/description/path substrings, so --source=aws grabs every aws pack.
#   --all downloads everything (heavy, not recommended).

# 3. Scan the downloads → write tags.toml (one empty entry per icon)
cargo run -- gen-tags

# 4. Fill in category/tags/keywords in tags.toml by hand (see "Tagging" below)

# 5. Build the final registry → apps/server/src/lib/icons/registry.json
cargo run -- build-registry
```

## Commands

| Command          | What it does                                                                     |
| ---------------- | -------------------------------------------------------------------------------- |
| `list`           | Print every library source from the upstream index.                              |
| `fetch`          | Download matching `.excalidrawlib` files into `output/` (`--source` or `--all`). |
| `gen-tags`       | Parse `output/`, write `tags.toml` with one blank entry per icon.                |
| `build-registry` | Merge `tags.toml` + parsed icons → `registry.json`.                              |

Useful flags: `--input <dir>` (default `output`), `--output <path>`, `--tags <path>`.
Run `cargo run -- <command> --help` for the full list.

## File formats

`.excalidrawlib` files come in two shapes; both are handled automatically:

- **v2** (`libraryItems`) — most modern packs. Items carry real names (`EC2`, `S3`),
  so the generated id is meaningful: `aws-architecture-icons__ec2`.
- **v1** (`library`) — older packs (e.g. `software-architecture`). No names exist, so
  icons get index ids (`software-architecture__software-architecture-0`). Rename them
  in `tags.toml` if you tag them.

Two icons whose names slug to the same id get a `-2`, `-3` suffix so nothing collides
or drops (`…iot-greengrass`, `…iot-greengrass-2`).

### registry.json entry

```json
"aws-architecture-icons__ec2": {
  "id": "aws-architecture-icons__ec2",
  "name": "EC2",
  "category": "service",
  "tags": ["compute", "server", "vm", "instance", "aws"],
  "keywords": ["ec2", "instance", "virtual machine"],
  "source_lib": "aws-architecture-icons",
  "elements": [ ...raw excalidraw element group... ]
}
```

Every downloaded icon lands in the registry. Untagged icons are kept with empty `tags`/`keywords` so they're never silently lost — but the AI can only find an icon through its tags/keywords, so untagged ≈ invisible to the AI.

## Tagging

`tags.toml` is the only thing you edit by hand. Each block:

```toml
["aws-architecture-icons__ec2"]
name = "EC2"
category = "service"                                  # one of the categories in the comment
tags = ["compute", "server", "vm", "instance", "aws"] # concepts the AI matches against
keywords = ["ec2", "instance", "virtual machine"]     # synonyms / alternate names
```

- **category** — coarse bucket: `service|database|cache|queue|gateway|client|storage|function|network|external`.
- **tags** — the concepts an engineer might say ("compute", "load balancer", "object store").
  These do the heavy lifting for AI matching. Be generous but accurate.
- **keywords** — synonyms and the literal product name ("ec2", "elastic compute").

## Notes

- `output/` and `target/` are gitignored. `registry.json` is committed (it's the product).
- Re-running `gen-tags` overwrites `tags.toml` -- back it up before regenerating if you've already tagged a lot.
