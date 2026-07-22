import { and, db, desc, eq, or } from "@OpenDiagram/db";
import { project } from "@OpenDiagram/db/schema/project";
import { projectFile } from "@OpenDiagram/db/schema/project-file";
import { layoutDiagram, renderToExcalidraw, type DiagramSpec } from "@OpenDiagram/harness";
import { iconRegistry } from "./icons/registry";
import { generateArchitectureDoc, generateDiagramSpec } from "./repo-ai";
import { getProjectMemoryContext } from "./project-memory";
import { createLogger } from "evlog";

const log = createLogger({ module: "repo-generation" });

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
// Live SSE listeners keyed by jobId — see jobEmitters in routes/github.ts for
// the same pattern. Keeps generation running inside the streaming request.
const genEmitters = new Map<string, (job: RepoGenerationJob) => void>();
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
  const fields = {
    repoGen: { jobId: jobId.slice(0, 8), status, ...(data !== undefined ? { data } : {}) },
  };
  if (status === "error" || status === "failed") {
    log.error(message, fields);
  } else {
    log.info(message, fields);
  }
}

export async function startRepoGeneration(
  input: { projectId: string; userId: string },
  retryCount = 0,
) {
  if (retryCount > 3) {
    throw new Error("Failed to start repository generation due to concurrent updates.");
  }
  pruneOldJobs();
  const key = projectKey(input);
  const existingJobId = activeJobByProject.get(key);
  const existingJob = existingJobId ? jobs.get(existingJobId) : null;
  if (
    existingJob &&
    ["queued", "planning", "creating", "generating", "done"].includes(existingJob.status)
  ) {
    log.info("Repo generation start skipped (already active)", {
      repoGen: { jobId: existingJob.id.slice(0, 8) },
    });
    return { job: existingJob };
  }

  // Synchronous process lock
  const lockJobId = crypto.randomUUID();
  const now = new Date().toISOString();
  const lockJob: RepoGenerationJob = {
    id: lockJobId,
    userId: input.userId,
    projectId: input.projectId,
    status: "queued",
    message: "Initializing...",
    error: null,
    tasks: [],
    createdFiles: [],
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(lockJobId, lockJob);
  activeJobByProject.set(key, lockJobId);

  try {
    const [projectRow] = await db
      .select()
      .from(project)
      .where(and(eq(project.id, input.projectId), eq(project.userId, input.userId)));

    if (!projectRow) {
      jobs.delete(lockJobId);
      activeJobByProject.delete(key);
      return null;
    }
    if (projectRow.source !== "github_import") {
      jobs.delete(lockJobId);
      activeJobByProject.delete(key);
      throw new Error("Repository generation is only available for GitHub imports.");
    }

    const existingGeneratedFiles = await getGeneratedFiles(input.projectId);
    const hasCompletedPlan = PLAN.every((item) =>
      existingGeneratedFiles.some(
        (file) => file.name === item.name && isGeneratedFileComplete(file),
      ),
    );
    if (hasCompletedPlan) {
      await db
        .update(project)
        .set({ generationStatus: "done" })
        .where(and(eq(project.id, input.projectId), eq(project.userId, input.userId)));

      const doneJob: RepoGenerationJob = {
        ...lockJob,
        status: "done",
        message: "Repository files already generated",
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
      };
      jobs.set(lockJobId, doneJob);
      scheduleJobCleanup(lockJobId);
      log.info("Repo generation already complete", {
        repoGen: { jobId: lockJobId.slice(0, 8) },
      });
      return { job: doneJob };
    }

    const isAlreadyInProgress = ["queued", "planning", "creating", "generating"].includes(
      projectRow.generationStatus,
    );
    if (isAlreadyInProgress) {
      const resumeJob: RepoGenerationJob = {
        ...lockJob,
        status: "queued",
        message: "Resuming repository generation",
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
      };
      jobs.set(lockJobId, resumeJob);
      log.info("Repo generation resuming", { repoGen: { jobId: lockJobId.slice(0, 8) } });
      return { job: resumeJob, run: () => runGenerationJob(lockJobId, projectRow) };
    }

    const [updatedProject] = await db
      .update(project)
      .set({ generationStatus: "queued" })
      .where(
        and(
          eq(project.id, input.projectId),
          eq(project.userId, input.userId),
          or(
            eq(project.generationStatus, "none"),
            eq(project.generationStatus, "failed"),
            eq(project.generationStatus, "done"),
          ),
        ),
      )
      .returning();

    if (!updatedProject) {
      jobs.delete(lockJobId);
      activeJobByProject.delete(key);
      return startRepoGeneration(input, retryCount + 1);
    }

    const queuedJob: RepoGenerationJob = {
      ...lockJob,
      status: "queued",
      message: "Queued repository generation",
    };
    jobs.set(lockJobId, queuedJob);
    log.info("Repo generation queued", {
      repoGen: { jobId: lockJobId.slice(0, 8), projectId: lockJob.projectId },
    });

    return { job: queuedJob, run: () => runGenerationJob(lockJobId, projectRow) };
  } catch (error) {
    jobs.delete(lockJobId);
    activeJobByProject.delete(key);
    throw error;
  }
}

function runGenerationJob(jobId: string, projectRow: typeof project.$inferSelect) {
  return runRepoGenerationJob(jobId, projectRow).catch((error) => {
    updateJob(jobId, {
      status: "failed",
      message: "Repository generation failed",
      error: error instanceof Error ? error.message : "Repository generation failed.",
    });
  });
}

/**
 * Runs a started generation job while streaming each status change to `emit`.
 * The route holds the request open (SSE), so the work keeps its Cloud Run CPU
 * allocation until it finishes.
 */
export async function runRepoGenerationWithEmitter(
  started: { job: RepoGenerationJob; run?: () => Promise<void> },
  emit: (job: RepoGenerationJob) => void,
) {
  if (!started.run) return;
  genEmitters.set(started.job.id, emit);
  try {
    await started.run();
  } finally {
    genEmitters.delete(started.job.id);
  }
}

export async function getRepoGenerationJob(input: {
  projectId: string;
  userId: string;
  jobId: string;
}) {
  const job = jobs.get(input.jobId);
  if (job && job.projectId === input.projectId && job.userId === input.userId) {
    logJob(input.jobId, "retrieved", "Job status retrieved", {
      status: job.status,
      tasks: job.tasks.map((t) => ({ id: t.id, status: t.status })),
    });
    return job;
  }

  // Map miss: on Cloud Run a status poll can land on a different instance than
  // the one running the job (in-memory `jobs` is per-instance). Rebuild a
  // snapshot from DB — project.generationStatus + per-file specs are the
  // durable source of truth — so polling works across instances.
  return buildJobSnapshotFromDb(input);
}

const GENERATION_STATUS_TO_JOB: Record<string, RepoGenerationStatus | null> = {
  none: null,
  queued: "queued",
  planning: "planning",
  creating: "creating",
  generating: "generating",
  done: "done",
  failed: "failed",
};

async function buildJobSnapshotFromDb(input: {
  projectId: string;
  userId: string;
  jobId: string;
}): Promise<RepoGenerationJob | null> {
  const [projectRow] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, input.projectId), eq(project.userId, input.userId)));
  if (!projectRow) return null;

  const status = GENERATION_STATUS_TO_JOB[projectRow.generationStatus] ?? null;
  if (!status) return null;

  const files = await getGeneratedFiles(input.projectId);
  const tasks: RepoGenerationTask[] = PLAN.map((item) => {
    const file = files.find((f) => f.name === item.name);
    const complete = file ? isGeneratedFileComplete(file) : false;
    return {
      ...item,
      status: complete ? "complete" : status === "failed" ? "failed" : "pending",
      message: complete ? "Generated" : status === "failed" ? "Generation failed" : "Waiting",
      fileId: file?.id ?? null,
    };
  });

  const timestamp = new Date().toISOString();
  return {
    id: input.jobId,
    userId: input.userId,
    projectId: input.projectId,
    status,
    message:
      status === "done"
        ? "Repository docs and diagrams generated"
        : status === "failed"
          ? "Repository generation failed"
          : "Repository generation in progress",
    error: null,
    tasks,
    createdFiles: files.map((file) => ({ id: file.id, name: file.name, type: file.type })),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
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
        userId: projectRow.userId,
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
        diagramType: "system-design",
        context: context?.context ?? "",
        userId: projectRow.userId,
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
        // Neutral fallback when AI generation/layout fails. Deliberately
        // generic: the old hardcoded specs described OpenDiagram's own stack
        // (Hono/Bun/Supabase/Gemini) and were shown for every imported repo,
        // which is wrong output. The renderer owns colors/icons.
        const spec = buildFallbackDiagramSpec(item);
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

function buildFallbackDiagramSpec(item: RepoGenerationPlanItem): DiagramSpec {
  return {
    title: item.name,
    type: "system-design",
    nodes: [
      { id: "client", label: "Client", category: "client", shape: "rectangle" },
      { id: "app", label: "Application", category: "service", shape: "rectangle" },
      { id: "data", label: "Data Store", category: "database", shape: "cylinder" },
    ],
    edges: [
      { from: "client", to: "app", label: "request", protocol: "HTTPS" },
      { from: "app", to: "data", label: "reads / writes" },
    ],
  };
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

const dbUpdateQueues = new Map<string, Promise<unknown>>();

function updateJob(
  jobId: string,
  values: Partial<Omit<RepoGenerationJob, "id" | "userId" | "projectId" | "createdAt">>,
) {
  const job = jobs.get(jobId);
  if (!job) return;
  const nextJob = { ...job, ...values, updatedAt: new Date().toISOString() };
  jobs.set(jobId, nextJob);
  genEmitters.get(jobId)?.(nextJob);

  if (values.status) {
    const queueKey = job.projectId;
    const currentQueue = dbUpdateQueues.get(queueKey) ?? Promise.resolve();
    const nextQueue = currentQueue.then(async () => {
      try {
        await db
          .update(project)
          .set({ generationStatus: values.status as any })
          .where(and(eq(project.id, job.projectId), eq(project.userId, job.userId)));
      } catch (err) {
        log.error("Failed to update project generation_status", { error: err });
      }
    });
    dbUpdateQueues.set(queueKey, nextQueue);

    nextQueue.finally(() => {
      if (dbUpdateQueues.get(queueKey) === nextQueue) {
        dbUpdateQueues.delete(queueKey);
      }
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
