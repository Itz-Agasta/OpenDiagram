import { and, db, desc, eq } from "@OpenDiagram/db";
import { project } from "@OpenDiagram/db/schema/project";
import { projectFile } from "@OpenDiagram/db/schema/project-file";
import { layoutDiagram, renderToExcalidraw, type DiagramSpec } from "@OpenDiagram/harness";
import { iconRegistry } from "./icons/registry";
import { generateArchitectureDoc, generateDiagramSpec } from "./llm";
import { getProjectMemoryContext } from "./project-memory";

type RepoGenerationStatus = "queued" | "planning" | "creating" | "generating" | "done" | "failed";
type RepoGenerationTaskStatus = "pending" | "active" | "complete" | "failed";
type RepoGeneratedFileType = "doc" | "diagram";

type RepoGenerationPlanItem = {
  id: string;
  type: RepoGeneratedFileType;
  name: string;
  goal: string;
};

export type RepoGenerationTask = RepoGenerationPlanItem & {
  status: RepoGenerationTaskStatus;
  message: string;
  fileId: string | null;
};

export type RepoGenerationJob = {
  id: string;
  userId: string;
  projectId: string;
  status: RepoGenerationStatus;
  message: string;
  error: string | null;
  tasks: RepoGenerationTask[];
  createdFiles: Array<{ id: string; name: string; type: RepoGeneratedFileType }>;
  createdAt: string;
  updatedAt: string;
};

const jobs = new Map<string, RepoGenerationJob>();
const activeJobByProject = new Map<string, string>();
const jobCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
const JOB_RETENTION_MS = 15 * 60 * 1000;
const MAX_RETAINED_JOBS = 100;

const PLAN: RepoGenerationPlanItem[] = [
  {
    id: "architecture-guide",
    type: "doc",
    name: "Architecture guide.md",
    goal: "Summarize major systems, entry points, dependencies, and runtime boundaries.",
  },
  {
    id: "system-context",
    type: "diagram",
    name: "System context diagram",
    goal: "Show users, application boundaries, external services, and data stores.",
  },
  {
    id: "request-flow",
    type: "diagram",
    name: "Request flow diagram",
    goal: "Show the main request path from client through routes, services, and persistence.",
  },
  {
    id: "data-model-notes",
    type: "doc",
    name: "Data model notes.md",
    goal: "Document storage, schemas, migrations, and important data lifecycle decisions.",
  },
];

function logJob(
  jobId: string,
  status:
    | "queued"
    | "planning"
    | "creating"
    | "generating"
    | "done"
    | "failed"
    | "pending"
    | "active"
    | "complete"
    | "info"
    | "error"
    | "debug"
    | "retrieved",
  message: string,
  data?: unknown,
) {
  const timestamp = new Date().toLocaleTimeString();
  const statusLabel = status.toUpperCase();
  const emoji =
    status === "done"
      ? "✅"
      : status === "failed" || status === "error"
        ? "❌"
        : status === "generating" || status === "active"
          ? "🧠"
          : status === "planning"
            ? "📋"
            : status === "creating"
              ? "📄"
              : "🔷";

  console.log(`${emoji} [repo-gen ${jobId.slice(0, 8)}] ${timestamp} ${statusLabel}: ${message}`);
  if (data) console.log(`   ${JSON.stringify(data)}`);
}

export async function startRepoGeneration(input: { projectId: string; userId: string }) {
  pruneOldJobs();
  const existingJobId = activeJobByProject.get(projectKey(input));
  const existingJob = existingJobId ? jobs.get(existingJobId) : null;
  if (
    existingJob &&
    ["queued", "planning", "creating", "generating", "done"].includes(existingJob.status)
  ) {
    console.log(`👀 job start skipped for [${existingJob.id.slice(0, 8)}]`);
    return existingJob;
  }

  const [projectRow] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, input.projectId), eq(project.userId, input.userId)));

  if (!projectRow) return null;
  if (projectRow.source !== "github_import") {
    throw new Error("Repository generation is only available for GitHub imports.");
  }

  const existingGeneratedFiles = await getGeneratedFiles(input.projectId);
  const hasCompletedPlan = PLAN.every((item) =>
    existingGeneratedFiles.some((file) => file.name === item.name && isGeneratedFileComplete(file)),
  );
  if (hasCompletedPlan) {
    if (projectRow.generationStatus === "none") {
      await db
        .update(project)
        .set({ generationStatus: "done" })
        .where(and(eq(project.id, input.projectId), eq(project.userId, input.userId)));
    }
    const now = new Date().toISOString();
    const job: RepoGenerationJob = {
      id: crypto.randomUUID(),
      userId: input.userId,
      projectId: input.projectId,
      status: "done",
      message: "Repository files already generated",
      error: null,
      tasks: PLAN.map((item) => ({
        ...item,
        status: "complete",
        message: "Already generated",
        fileId: existingGeneratedFiles.find((file) => file.name === item.name)?.id ?? null,
      })),
      createdFiles: existingGeneratedFiles.map((file) => ({
        id: file.id,
        name: file.name,
        type: file.type,
      })),
      createdAt: now,
      updatedAt: now,
    };
    jobs.set(job.id, job);
    activeJobByProject.set(projectKey(input), job.id);
    scheduleJobCleanup(job.id);
    console.log(`👀 job start: returning done job #${job.id.slice(0, 8)}`);
    return job;
  }

  const isAlreadyInProgress = ["queued", "planning", "creating", "generating"].includes(
    projectRow.generationStatus,
  );
  if (isAlreadyInProgress) {
    const now = new Date().toISOString();
    const job: RepoGenerationJob = {
      id: crypto.randomUUID(),
      userId: input.userId,
      projectId: input.projectId,
      status: "queued",
      message: "Resuming repository generation",
      error: null,
      tasks: PLAN.map((item) => {
        const file = existingGeneratedFiles.find((f) => f.name === item.name);
        const isCompleted = file && (file.spec as any)?.status === "complete";
        return {
          ...item,
          status: isCompleted ? "complete" : "pending",
          message: isCompleted ? "Already generated" : "Waiting",
          fileId: file?.id ?? null,
        };
      }),
      createdFiles: existingGeneratedFiles.map((file) => ({
        id: file.id,
        name: file.name,
        type: file.type,
      })),
      createdAt: now,
      updatedAt: now,
    };
    jobs.set(job.id, job);
    activeJobByProject.set(projectKey(input), job.id);
    console.log(`👀 job resume: respawning job #${job.id.slice(0, 8)}`);
    void runRepoGenerationJob(job.id, projectRow).catch((error) => {
      updateJob(job.id, {
        status: "failed",
        message: "Repository generation failed",
        error: error instanceof Error ? error.message : "Repository generation failed.",
      });
    });
    return job;
  }

  const now = new Date().toISOString();
  const job: RepoGenerationJob = {
    id: crypto.randomUUID(),
    userId: input.userId,
    projectId: input.projectId,
    status: "queued",
    message: "Queued repository generation",
    error: null,
    tasks: [],
    createdFiles: [],
    createdAt: now,
    updatedAt: now,
  };

  jobs.set(job.id, job);
  activeJobByProject.set(projectKey(input), job.id);
  console.log(`🚀 job started: #${job.id.slice(0, 8)} queued for ${job.projectId}`);

  await db
    .update(project)
    .set({ generationStatus: "queued" })
    .where(and(eq(project.id, input.projectId), eq(project.userId, input.userId)));

  void runRepoGenerationJob(job.id, projectRow).catch((error) => {
    updateJob(job.id, {
      status: "failed",
      message: "Repository generation failed",
      error: error instanceof Error ? error.message : "Repository generation failed.",
    });
  });

  return job;
}

export function getRepoGenerationJob(input: { projectId: string; userId: string; jobId: string }) {
  const job = jobs.get(input.jobId);
  if (!job || job.projectId !== input.projectId || job.userId !== input.userId) return null;
  logJob(input.jobId, "retrieved", "Job status retrieved", {
    status: job.status,
    tasks: job.tasks.map((t) => ({ id: t.id, status: t.status })),
  });
  return job;
}

async function runRepoGenerationJob(jobId: string, projectRow: typeof project.$inferSelect) {
  await sleep(500);

  const existingFiles = await db
    .select({
      id: projectFile.id,
      name: projectFile.name,
      spec: projectFile.spec,
      type: projectFile.type,
    })
    .from(projectFile)
    .where(eq(projectFile.projectId, projectRow.id));

  updateJob(jobId, {
    status: "planning",
    message: "Orchestrator is planning repository files",
    tasks: PLAN.map((item) => {
      const file = existingFiles.find((f) => f.name === item.name);
      const isCompleted = file && (file.spec as any)?.status === "complete";
      return {
        ...item,
        status: isCompleted ? "complete" : "pending",
        message: isCompleted ? "Already generated" : "Waiting",
        fileId: file?.id ?? null,
      };
    }),
  });
  logJob(jobId, "planning", "Started", { plan: PLAN.map((p) => p.name) });

  const context = await getProjectMemoryContext({
    projectId: projectRow.id,
    userId: projectRow.userId,
    query: "Plan architecture documentation and diagrams for this imported source repository.",
  });
  logJob(jobId, "info", "Retrieved context", { contextLength: context?.context.length ?? 0 });

  const source = projectRow.sourceMetadata as Record<string, unknown> | null;
  const repoFullName =
    typeof source?.repoFullName === "string" ? source.repoFullName : projectRow.name;
  const defaultBranch =
    typeof source?.defaultBranch === "string" ? source.defaultBranch : "unknown";
  const commitSha = typeof source?.commitSha === "string" ? source.commitSha : "unknown";

  await sleep(700);
  updateJob(jobId, { status: "creating", message: `Creating ${PLAN.length} workspace files` });
  logJob(jobId, "creating", "Creating workspace files", { count: PLAN.length });

  for (const item of PLAN) {
    const existingFile = existingFiles.find((f) => f.name === item.name);
    let file = existingFile;

    if (!file) {
      updateTask(jobId, item.id, { status: "active", message: "Creating placeholder file" });
      logJob(jobId, "creating", `Creating placeholder: ${item.name}`, { type: item.type });

      try {
        const [inserted] = await db
          .insert(projectFile)
          .values({
            projectId: projectRow.id,
            name: item.name,
            type: item.type,
            content: item.type === "doc" ? "Generating repository documentation..." : undefined,
            scene: item.type === "diagram" ? { skeletons: [], rawElements: [] } : undefined,
            spec: createGeneratedSpec(projectRow, item, "placeholder"),
          })
          .returning();
        file = inserted;
      } catch (dbError) {
        logJob(
          jobId,
          "error",
          `Database error creating placeholder for ${item.name}: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
        );
        throw dbError;
      }

      if (!file) {
        logJob(jobId, "error", `Failed to create ${item.name}`);
        throw new Error(`Could not create ${item.name}.`);
      }
      addCreatedFile(jobId, { id: file.id, name: file.name, type: file.type });
      updateTask(jobId, item.id, {
        status: "pending",
        message: "Placeholder created",
        fileId: file.id,
      });
      logJob(jobId, "creating", `Created placeholder: ${item.name}`, { fileId: file.id });
      await sleep(250);
    } else {
      addCreatedFile(jobId, { id: file.id, name: file.name, type: file.type });
      const isCompleted = (file.spec as any)?.status === "complete";
      updateTask(jobId, item.id, {
        status: isCompleted ? "complete" : "pending",
        message: isCompleted ? "Already generated" : "Placeholder created",
        fileId: file.id,
      });
    }
  }

  updateJob(jobId, { status: "generating", message: "Generating docs and diagrams" });

  for (const item of PLAN) {
    const task = jobs.get(jobId)?.tasks.find((t) => t.id === item.id);
    if (!task || task.status === "complete") {
      logJob(jobId, "generating", `Skipping already generated file: ${item.name}`);
      continue;
    }
    const fileId = task.fileId;
    if (!fileId) continue;

    updateTask(jobId, item.id, {
      status: "active",
      message:
        item.type === "doc" ? "Doc agent is writing markdown" : "Diagram agent is composing canvas",
    });
    logJob(jobId, "generating", `Generating: ${item.name}`, { type: item.type });

    if (item.type === "doc") {
      const content = await generateArchitectureDoc({
        context: context?.context ?? "",
        goal: item.goal,
        title: item.name.replace(/\.md$/i, ""),
        repoFullName,
        defaultBranch,
        commitSha,
      }).catch(() => {
        return [
          `# ${item.name.replace(/\.md$/i, "")}`,
          "",
          `Goal: ${item.goal}`,
          "",
          "## Repository",
          `- Repo: ${repoFullName}`,
          `- Branch: ${defaultBranch}`,
          `- Commit: ${commitSha}`,
          "",
          "## Generated notes",
          context?.context ||
            "Repository memory was unavailable, so this file was created as a starter document.",
          "",
          "## Next steps",
          "- Review cited source files from repository memory.",
          "- Edit this generated draft with project-specific details.",
        ].join("\n");
      });

      try {
        await db
          .update(projectFile)
          .set({
            content,
            spec: createGeneratedSpec(projectRow, item, "complete"),
          })
          .where(eq(projectFile.id, fileId));
      } catch (dbError) {
        logJob(
          jobId,
          "error",
          `Database error updating content for ${item.name}: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
        );
        throw dbError;
      }
      logJob(jobId, "generating", `Generated doc: ${item.name}`, { contentLength: content.length });
    } else {
      const diagramResult = await generateDiagramSpec({
        prompt: `Generate a ${item.name.toLowerCase()} for the imported source repository.\nGoal: ${item.goal}`,
        diagramType: item.id === "system-context" ? "system-design" : "system-design",
        context: context?.context ?? "",
      }).catch(() => null);

      let diagram:
        | { spec: DiagramSpec; scene: { skeletons: any[]; rawElements: any[] } }
        | undefined = undefined;
      let layoutSucceeded = false;

      if (diagramResult) {
        try {
          const positioned = await layoutDiagram(diagramResult);
          const { skeletons, rawElements } = renderToExcalidraw(positioned, iconRegistry);
          diagram = { spec: diagramResult, scene: { skeletons, rawElements } };
          layoutSucceeded = true;
        } catch (layoutError) {
          logJob(
            jobId,
            "error",
            `Failed to layout generated diagram for ${item.name}: ${layoutError instanceof Error ? layoutError.message : String(layoutError)}`,
          );
        }
      }
      if (!layoutSucceeded) {
        let spec: DiagramSpec;
        if (item.id === "system-context") {
          spec = {
            title: item.name,
            type: "system-design",
            nodes: [
              {
                id: "client",
                label: "User Client",
                sublabel: "Web Browser / UI",
                category: "client",
                shape: "rectangle",
                icon: "architecture-diagram-components__device",
                style: { strokeColor: "#6b7280", backgroundColor: "#f3f4f6" },
              },
              {
                id: "app",
                label: "Hono Server",
                sublabel: "Application Core (Bun)",
                category: "service",
                shape: "rectangle",
                icon: "architecture-diagram-components__docker",
                style: { strokeColor: "#1e40af", backgroundColor: "#dbeafe" },
              },
              {
                id: "db",
                label: "Database",
                sublabel: "PostgreSQL (Supabase)",
                category: "database",
                shape: "cylinder",
                icon: "software-logos__software-logos-12",
                style: { strokeColor: "#166534", backgroundColor: "#dcfce7" },
              },
              {
                id: "ai",
                label: "AI Gateway",
                sublabel: "Google Gemini API",
                category: "external",
                shape: "rectangle",
                icon: "architecture-diagram-components__server",
                style: { strokeColor: "#7c2d12", backgroundColor: "#fed7aa" },
              },
            ],
            edges: [
              {
                from: "client",
                to: "app",
                label: "Interacts / Designs",
                protocol: "HTTPS",
                direction: "bi",
              },
              {
                from: "app",
                to: "db",
                label: "Persists diagrams & docs",
                protocol: "SQL",
                direction: "bi",
              },
              {
                from: "app",
                to: "ai",
                label: "Invokes model completion",
                protocol: "REST",
                direction: "uni",
              },
            ],
          };
        } else if (item.id === "request-flow") {
          spec = {
            title: item.name,
            type: "system-design",
            nodes: [
              {
                id: "client",
                label: "Web Browser",
                sublabel: "React SPA Client",
                category: "client",
                shape: "rectangle",
                icon: "architecture-diagram-components__device",
                style: { strokeColor: "#6b7280", backgroundColor: "#f3f4f6" },
              },
              {
                id: "gateway",
                label: "App Gateway",
                sublabel: "Reverse Proxy & CORS",
                category: "gateway",
                shape: "rectangle",
                icon: "architecture-diagram-components__server",
                style: { strokeColor: "#7c2d12", backgroundColor: "#fed7aa" },
              },
              {
                id: "api",
                label: "API Server",
                sublabel: "Hono Backend",
                category: "service",
                shape: "rectangle",
                icon: "architecture-diagram-components__docker",
                style: { strokeColor: "#1e40af", backgroundColor: "#dbeafe" },
              },
              {
                id: "db",
                label: "Database",
                sublabel: "PostgreSQL (Supabase)",
                category: "database",
                shape: "cylinder",
                icon: "software-logos__software-logos-12",
                style: { strokeColor: "#166534", backgroundColor: "#dcfce7" },
              },
            ],
            edges: [
              {
                from: "client",
                to: "gateway",
                label: "HTTP Requests",
                protocol: "HTTPS",
                direction: "uni",
              },
              {
                from: "gateway",
                to: "api",
                label: "Proxy Routing",
                protocol: "HTTP",
                direction: "uni",
              },
              {
                from: "api",
                to: "db",
                label: "Read/Write Queries",
                protocol: "SQL",
                direction: "bi",
              },
            ],
          };
        } else {
          spec = {
            title: item.name,
            type: "system-design",
            nodes: [
              {
                id: "client",
                label: "Client",
                sublabel: "User Client",
                category: "client",
                shape: "rectangle",
                icon: "architecture-diagram-components__device",
                style: { strokeColor: "#6b7280", backgroundColor: "#f3f4f6" },
              },
              {
                id: "app",
                label: "Application",
                sublabel: "Backend Server",
                category: "service",
                shape: "rectangle",
                icon: "architecture-diagram-components__docker",
                style: { strokeColor: "#1e40af", backgroundColor: "#dbeafe" },
              },
              {
                id: "data",
                label: "Data Layer",
                sublabel: "Database",
                category: "database",
                shape: "cylinder",
                icon: "software-logos__software-logos-12",
                style: { strokeColor: "#166534", backgroundColor: "#dcfce7" },
              },
            ],
            edges: [
              { from: "client", to: "app", label: "uses", protocol: "HTTPS" },
              { from: "app", to: "data", label: "reads/writes", protocol: "SQL" },
            ],
          };
        }
        try {
          const positioned = await layoutDiagram(spec);
          const { skeletons, rawElements } = renderToExcalidraw(positioned, iconRegistry);
          diagram = { spec, scene: { skeletons, rawElements } };
        } catch (fallbackError) {
          logJob(
            jobId,
            "error",
            `Failed to layout fallback diagram for ${item.name}: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
          );
          throw fallbackError;
        }
      }

      if (!diagram) {
        logJob(jobId, "error", `Failed to initialize diagram spec for ${item.name}`);
        throw new Error(`Failed to initialize diagram spec for ${item.name}`);
      }

      try {
        await db
          .update(projectFile)
          .set({
            scene: diagram.scene,
            spec: createGeneratedSpec(projectRow, item, "complete", diagram.spec),
          })
          .where(eq(projectFile.id, fileId));
      } catch (dbError) {
        logJob(
          jobId,
          "error",
          `Database error updating diagram for ${item.name}: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
        );
        throw dbError;
      }
      logJob(jobId, "generating", `Generated diagram: ${item.name}`, {
        nodes: diagram.spec.nodes.length,
        edges: diagram.spec.edges.length,
      });
    }

    updateTask(jobId, item.id, { status: "complete", message: "Generated", fileId });
    await sleep(650);
  }

  updateJob(jobId, { status: "done", message: "Repository docs and diagrams generated" });
  logJob(jobId, "done", "Completed successfully", {
    filesCreated: jobs.get(jobId)?.createdFiles.length ?? 0,
  });
}

async function getGeneratedFiles(projectId: string) {
  const files = await db
    .select({
      id: projectFile.id,
      name: projectFile.name,
      type: projectFile.type,
      spec: projectFile.spec,
    })
    .from(projectFile)
    .where(eq(projectFile.projectId, projectId))
    .orderBy(desc(projectFile.updatedAt));

  return files
    .filter((file) => isRepoGeneratedSpec(file.spec))
    .map((file) => ({ id: file.id, name: file.name, type: file.type, spec: file.spec }));
}

function createGeneratedSpec(
  projectRow: typeof project.$inferSelect,
  item: RepoGenerationPlanItem,
  status: "placeholder" | "complete",
  diagramSpec?: DiagramSpec,
) {
  const source = projectRow.sourceMetadata as Record<string, unknown> | null;
  return {
    kind: "repo_generated",
    generated: true,
    generatorVersion: "repo-generation-v1",
    status,
    planItemId: item.id,
    goal: item.goal,
    repoFullName: typeof source?.repoFullName === "string" ? source.repoFullName : projectRow.name,
    branch: typeof source?.defaultBranch === "string" ? source.defaultBranch : null,
    commitSha: typeof source?.commitSha === "string" ? source.commitSha : null,
    memoryDatasetId: projectRow.memoryDatasetId,
    generatedAt: new Date().toISOString(),
    diagramSpec,
  };
}

function isRepoGeneratedSpec(value: unknown) {
  return Boolean(
    value && typeof value === "object" && (value as { kind?: unknown }).kind === "repo_generated",
  );
}

function isGeneratedFileComplete(file: { spec: unknown }) {
  return (
    isRepoGeneratedSpec(file.spec) && (file.spec as { status?: unknown }).status === "complete"
  );
}

function updateJob(
  jobId: string,
  values: Partial<Omit<RepoGenerationJob, "id" | "userId" | "projectId" | "createdAt">>,
) {
  const job = jobs.get(jobId);
  if (!job) return;
  jobs.set(jobId, { ...job, ...values, updatedAt: new Date().toISOString() });

  if (values.status) {
    db.update(project)
      .set({ generationStatus: values.status as any })
      .where(and(eq(project.id, job.projectId), eq(project.userId, job.userId)))
      .catch((err) => {
        console.error(`Failed to update project generation_status in DB:`, err);
      });

    if (values.status === "done" || values.status === "failed") {
      scheduleJobCleanup(jobId);
    }
  }
}

function updateTask(jobId: string, taskId: string, values: Partial<RepoGenerationTask>) {
  const job = jobs.get(jobId);
  if (!job) return;
  updateJob(jobId, {
    tasks: job.tasks.map((task) => (task.id === taskId ? { ...task, ...values } : task)),
  });
}

function addCreatedFile(jobId: string, file: RepoGenerationJob["createdFiles"][number]) {
  const job = jobs.get(jobId);
  if (!job) return;
  updateJob(jobId, { createdFiles: [...job.createdFiles, file] });
}

function projectKey(input: { projectId: string; userId: string }) {
  return `${input.userId}:${input.projectId}`;
}

function scheduleJobCleanup(jobId: string) {
  if (jobCleanupTimers.has(jobId)) return;

  const timer = setTimeout(() => {
    const job = jobs.get(jobId);
    jobs.delete(jobId);
    jobCleanupTimers.delete(jobId);
    if (job && activeJobByProject.get(projectKey(job)) === jobId) {
      activeJobByProject.delete(projectKey(job));
    }
  }, JOB_RETENTION_MS);

  jobCleanupTimers.set(jobId, timer);
}

function pruneOldJobs() {
  if (jobs.size <= MAX_RETAINED_JOBS) return;

  const removable = [...jobs.values()]
    .filter((job) => job.status === "done" || job.status === "failed")
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));

  for (const job of removable.slice(0, jobs.size - MAX_RETAINED_JOBS)) {
    const timer = jobCleanupTimers.get(job.id);
    if (timer) clearTimeout(timer);
    jobCleanupTimers.delete(job.id);
    jobs.delete(job.id);
    if (activeJobByProject.get(projectKey(job)) === job.id) {
      activeJobByProject.delete(projectKey(job));
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
