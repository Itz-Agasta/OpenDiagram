use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use futures::stream::{self, StreamExt};
use indicatif::{ProgressBar, ProgressStyle};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};

const LIBRARIES_JSON_URL: &str =
    "https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main/libraries.json";
const RAW_BASE: &str =
    "https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main/libraries";
const CONCURRENCY: usize = 16;

#[derive(Parser)]
#[command(
    name = "icon-fetcher",
    about = "Download & build Excalidraw icon registry"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Download .excalidrawlib files from GitHub
    Fetch {
        /// Source name filter (partial match)
        #[arg(short, long)]
        source: Option<String>,

        /// Download all libraries
        #[arg(short, long)]
        all: bool,

        /// Output directory
        #[arg(short, long, default_value = "output")]
        output: PathBuf,
    },

    /// List available library sources
    List,

    /// Parse downloaded files → generate tags.toml template
    GenTags {
        /// Directory containing .excalidrawlib files
        #[arg(short, long, default_value = "output")]
        input: PathBuf,

        /// Output tags file path
        #[arg(short, long, default_value = "tags.toml")]
        output: PathBuf,
    },

    /// Read tags.toml + .excalidrawlib files → registry.json
    BuildRegistry {
        /// Directory containing .excalidrawlib files
        #[arg(short, long, default_value = "output")]
        input: PathBuf,

        /// Path to tags.toml
        #[arg(short, long, default_value = "tags.toml")]
        tags: PathBuf,

        /// Output registry path
        #[arg(
            short,
            long,
            default_value = "../../apps/server/src/lib/icons/registry.json"
        )]
        output: PathBuf,
    },
}

#[derive(Debug, Deserialize)]
struct LibraryEntry {
    name: String,
    description: Option<String>,
    source: String,
}

// Excalidraw libraries ship in two shapes. v2 carries icons under `library_items`
// (or the older `items`); v1 nests them under `library` as raw element groups.
// We accept whichever is present and normalize downstream.
#[derive(Debug, Deserialize)]
struct ExcalidrawLib {
    // Real-world files use camelCase `libraryItems`; accept the snake_case
    // spelling too in case some exports differ.
    #[serde(rename = "libraryItems", alias = "library_items", default)]
    library_items: Vec<serde_json::Value>,
    #[serde(default)]
    items: Vec<serde_json::Value>,
    #[serde(default)]
    library: Option<Vec<Vec<serde_json::Value>>>,
}

/// One icon's hand-written metadata, keyed by tag id in tags.toml.
#[derive(Debug, Deserialize)]
struct TagEntry {
    name: String,
    #[serde(default)]
    category: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    keywords: Vec<String>,
}

/// One entry in the final registry.json the server consumes.
#[derive(Debug, Serialize)]
struct RegistryEntry {
    id: String,
    name: String,
    category: String,
    tags: Vec<String>,
    keywords: Vec<String>,
    source_lib: String,
    elements: serde_json::Value,
}

fn build_client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .context("Failed to build HTTP client")
}

async fn fetch_libraries_index(client: &reqwest::Client) -> Result<Vec<LibraryEntry>> {
    client
        .get(LIBRARIES_JSON_URL)
        .send()
        .await
        .context("Failed to fetch libraries.json")?
        .error_for_status()
        .context("libraries.json returned error")?
        .json::<Vec<LibraryEntry>>()
        .await
        .context("Failed to parse libraries.json")
}

async fn download_library(
    client: &reqwest::Client,
    source: &str,
    output_dir: &Path,
    pb: &ProgressBar,
) -> Result<PathBuf> {
    let url = format!("{RAW_BASE}/{source}");
    let bytes = client
        .get(&url)
        .send()
        .await
        .with_context(|| format!("Failed to download {source}"))?
        .error_for_status()
        .with_context(|| format!("HTTP error for {source}"))?
        .bytes()
        .await
        .with_context(|| format!("Failed to read body for {source}"))?;

    let filename = source.rsplit('/').next().unwrap_or("unknown.excalidrawlib");
    let out_path = output_dir.join(filename);
    std::fs::write(&out_path, &bytes).with_context(|| format!("Failed to write {out_path:?}"))?;

    // Parse just to report the icon count — a parse miss isn't fatal here.
    match serde_json::from_slice::<ExcalidrawLib>(&bytes) {
        Ok(lib) => {
            let count = if lib.library_items.is_empty() {
                lib.items.len()
            } else {
                lib.library_items.len()
            };
            pb.println(format!("  \u{2713} {filename} \u{2014} {count} items"));
        }
        Err(_) => pb.println(format!("  \u{2713} {filename} \u{2014} (parse warning)")),
    }

    pb.inc(1);
    Ok(out_path)
}

/// Parse one .excalidrawlib into its file stem plus `(name, elements)` per icon.
fn parse_lib_file(path: &Path) -> Result<(String, Vec<(String, serde_json::Value)>)> {
    let raw = std::fs::read_to_string(path).with_context(|| format!("Failed to read {path:?}"))?;
    let lib: ExcalidrawLib =
        serde_json::from_str(&raw).with_context(|| format!("Failed to parse {path:?}"))?;

    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Collapse the v1/v2 split into a single list of item objects.
    let items: Vec<serde_json::Value> = if !lib.library_items.is_empty() {
        lib.library_items
    } else if !lib.items.is_empty() {
        lib.items
    } else if let Some(library) = lib.library {
        // v1 has no names — wrap each raw element group so it matches the v2 shape.
        library
            .into_iter()
            .enumerate()
            .map(|(i, group)| serde_json::json!({ "name": format!("{stem}-{i}"), "elements": group }))
            .collect()
    } else {
        Vec::new()
    };

    let entries = items
        .into_iter()
        .enumerate()
        .map(|(i, item)| {
            let name = item
                .get("name")
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .unwrap_or_else(|| format!("{stem}-{i}"));
            let elements = item
                .get("elements")
                .cloned()
                .unwrap_or(serde_json::json!([]));
            (name, elements)
        })
        .collect();

    Ok((stem, entries))
}

/// "aws-architecture-icons" + "Amazon EC2" → "aws-architecture-icons__amazon-ec2".
fn make_tag_id(lib_stem: &str, item_name: &str) -> String {
    let slug = item_name
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric(), "-")
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    format!("{lib_stem}__{slug}")
}

/// Assign a unique id to each icon. Different names can slug to the same id
/// (e.g. "IoT Greengrass" vs "IoT GreenGrass"); collisions get a -2, -3 suffix.
/// Deterministic on parse order so gen-tags and build-registry agree.
fn assign_ids(
    lib_stem: &str,
    items: Vec<(String, serde_json::Value)>,
) -> Vec<(String, String, serde_json::Value)> {
    let mut seen: HashMap<String, usize> = HashMap::new();
    items
        .into_iter()
        .map(|(name, elements)| {
            let base = make_tag_id(lib_stem, &name);
            let n = seen.entry(base.clone()).or_insert(0);
            *n += 1;
            let id = if *n == 1 { base } else { format!("{base}-{n}") };
            (id, name, elements)
        })
        .collect()
}

/// Collect every .excalidrawlib path in a directory.
fn lib_files(input: &Path) -> Result<Vec<PathBuf>> {
    let files = std::fs::read_dir(input)
        .context("Failed to read input dir")?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|ext| ext == "excalidrawlib"))
        .collect();
    Ok(files)
}

async fn cmd_fetch(
    client: &reqwest::Client,
    source: &Option<String>,
    all: bool,
    output: &Path,
) -> Result<()> {
    eprintln!("Fetching libraries index...");
    let libraries = fetch_libraries_index(client).await?;
    eprintln!("Found {} libraries total.", libraries.len());

    let filtered: Vec<&LibraryEntry> = if all {
        libraries.iter().collect()
    } else if let Some(query) = source {
        let q = query.to_lowercase();
        let matches: Vec<&LibraryEntry> = libraries
            .iter()
            .filter(|lib| {
                lib.source.to_lowercase().contains(&q)
                    || lib.name.to_lowercase().contains(&q)
                    || lib
                        .description
                        .as_deref()
                        .unwrap_or("")
                        .to_lowercase()
                        .contains(&q)
            })
            .collect();
        if matches.is_empty() {
            anyhow::bail!("No libraries matching '{query}'. Run 'list' to see options.");
        }
        matches
    } else {
        anyhow::bail!("Specify --source or --all.");
    };

    eprintln!(
        "Downloading {} {}...",
        filtered.len(),
        if filtered.len() == 1 {
            "library"
        } else {
            "libraries"
        }
    );

    std::fs::create_dir_all(output)
        .with_context(|| format!("Failed to create output dir: {output:?}"))?;

    let pb = ProgressBar::new(filtered.len() as u64);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} {msg}")
            .unwrap()
            .progress_chars("#>-"),
    );

    let results: Vec<Result<PathBuf>> = stream::iter(filtered)
        .map(|lib| download_library(client, &lib.source, output, &pb))
        .buffer_unordered(CONCURRENCY)
        .collect()
        .await;

    pb.finish_with_message("done");

    let fail = results.iter().filter(|r| r.is_err()).count();
    eprintln!("\n{} downloaded, {fail} failed.", results.len() - fail);
    for r in &results {
        if let Err(e) = r {
            eprintln!("  \u{2717} {e}");
        }
    }
    Ok(())
}

async fn cmd_list(client: &reqwest::Client) -> Result<()> {
    let libraries = fetch_libraries_index(client).await?;

    eprintln!("\nAvailable libraries:\n");
    for lib in &libraries {
        let desc = lib.description.as_deref().unwrap_or("");
        eprintln!("  {:<55} {}", lib.source, desc);
    }
    eprintln!("\nTotal: {} libraries", libraries.len());
    Ok(())
}

fn cmd_gen_tags(input: &Path, output: &Path) -> Result<()> {
    let files = lib_files(input)?;
    if files.is_empty() {
        anyhow::bail!("No .excalidrawlib files found in {input:?}. Run 'fetch' first.");
    }

    eprintln!("Scanning {} files...", files.len());

    let mut tag_file = String::from("# OpenDiagram Icon Registry — Tags\n");
    tag_file.push_str("# Fill in category, tags, and keywords for each icon.\n");
    tag_file.push_str("# Tags help the AI match icons to concepts.\n");
    tag_file.push_str("# Keywords are synonyms for the icon name.\n\n");

    let mut total_items = 0;

    for path in &files {
        let (lib_stem, items) = parse_lib_file(path)?;
        if items.is_empty() {
            eprintln!("  \u{26a0}  {lib_stem}: no items found, skipping");
            continue;
        }

        tag_file.push_str(&format!("# {lib_stem}\n"));
        for (id, name, _elements) in assign_ids(&lib_stem, items) {
            tag_file.push_str(&format!("[\"{id}\"]\n"));
            tag_file.push_str(&format!("name = \"{name}\"\n"));
            tag_file.push_str("category = \"\"  # service|database|cache|queue|gateway|client|storage|function|network|external\n");
            tag_file.push_str(
                "tags = []       # semantic: [\"compute\", \"server\", \"vm\", \"aws\"]\n",
            );
            tag_file.push_str(
                "keywords = []   # synonyms: [\"ec2\", \"instance\", \"virtual machine\"]\n\n",
            );
            total_items += 1;
        }
    }

    std::fs::write(output, &tag_file).with_context(|| format!("Failed to write {output:?}"))?;

    eprintln!("Generated {output:?} with {total_items} icon entries.");
    eprintln!("Edit the file, fill in tags, then run: cargo run -- build-registry");
    Ok(())
}

fn cmd_build_registry(input: &Path, tags_path: &Path, output: &Path) -> Result<()> {
    if !tags_path.exists() {
        anyhow::bail!("{tags_path:?} not found. Run 'gen-tags' first to create it.");
    }
    let tags_raw = std::fs::read_to_string(tags_path)
        .with_context(|| format!("Failed to read {tags_path:?}"))?;
    let tags: BTreeMap<String, TagEntry> =
        toml::from_str(&tags_raw).with_context(|| format!("Failed to parse {tags_path:?}"))?;

    eprintln!("Loaded {} tag entries from {tags_path:?}", tags.len());

    let files = lib_files(input)?;
    let mut registry: BTreeMap<String, RegistryEntry> = BTreeMap::new();
    let mut matched = 0;
    let mut unmatched = 0;

    for path in &files {
        let (lib_stem, items) = parse_lib_file(path)?;
        for (id, name, elements) in assign_ids(&lib_stem, items) {
            // Use the curated metadata when present, otherwise emit a bare entry
            // with empty tags so nothing silently drops out of the registry.
            let entry = match tags.get(&id) {
                Some(tag) => {
                    matched += 1;
                    RegistryEntry {
                        id: id.clone(),
                        name: tag.name.clone(),
                        category: tag.category.clone(),
                        tags: tag.tags.clone(),
                        keywords: tag.keywords.clone(),
                        source_lib: lib_stem.clone(),
                        elements,
                    }
                }
                None => {
                    unmatched += 1;
                    RegistryEntry {
                        id: id.clone(),
                        name,
                        category: String::new(),
                        tags: Vec::new(),
                        keywords: Vec::new(),
                        source_lib: lib_stem.clone(),
                        elements,
                    }
                }
            };
            registry.insert(id, entry);
        }
    }

    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create output dir: {parent:?}"))?;
    }

    let json = serde_json::to_string_pretty(&registry).context("Failed to serialize registry")?;
    std::fs::write(output, &json).with_context(|| format!("Failed to write {output:?}"))?;

    eprintln!("Registry written: {output:?}");
    eprintln!("  {matched} icons with tags, {unmatched} without (included with empty tags)");
    eprintln!("  {} total", registry.len());
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Fetch {
            source,
            all,
            output,
        } => cmd_fetch(&build_client()?, &source, all, &output).await,
        Commands::List => cmd_list(&build_client()?).await,
        Commands::GenTags { input, output } => cmd_gen_tags(&input, &output),
        Commands::BuildRegistry {
            input,
            tags,
            output,
        } => cmd_build_registry(&input, &tags, &output),
    }
}
