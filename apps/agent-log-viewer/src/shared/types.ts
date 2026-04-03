export type BacklogStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'unknown';

export type BacklogItem = {
  id: string;
  status: BacklogStatus;
  ownerZone: string | null;
  title: string;
  writeScope: string | null;
  dependsOn: string | null;
  doneWhen: string | null;
  validation: string | null;
  bossSignoff: string | null;
  notes: string | null;
  backlogSourceKey: string;
  backlogSourceLabel: string;
  extraFields: Record<string, string>;
};

export type FrameworkFileKey = string;

export type FrameworkFileMeta = {
  key: FrameworkFileKey;
  label: string;
  path: string;
};

export type ProjectLogEntry = {
  id: string;
  ts: string | null;
  itemId: string | null;
  zone: string | null;
  agent: string | null;
  event: string | null;
  stepVerdict: string | null;
  itemStatus: string | null;
  summary: string | null;
  nextGap: string | null;
  evidenceInstructions: {
    runThis: string[];
    openThis: string[];
    expectThis: string[];
  };
  raw: string;
  sourcePath: string;
};

export type ProjectSummary = {
  id: string;
  name: string;
  rootPath: string;
  projectPath: string;
  latestChangedAt: string | null;
  hasLogs: boolean;
  countsByStatus: Record<BacklogStatus, number>;
  totalItems: number;
  attention: {
    tone: 'blocked' | 'active' | 'quiet';
    label: string;
  };
  latestLog: ProjectLogEntry | null;
};

export type ProjectDetail = {
  project: ProjectSummary;
  backlogItems: BacklogItem[];
  logs: ProjectLogEntry[];
  frameworkFiles: FrameworkFileMeta[];
  backlogSources: Array<{ key: string; label: string }>;
  backlogZones: string[];
  logZones: string[];
};

export type FileContent = {
  key: FrameworkFileKey;
  label: string;
  path: string;
  markdown: string;
  html: string;
};

export type ProjectsResponse = {
  roots: string[];
  polledAt: string;
  projects: ProjectSummary[];
};

export type WatchEventKind = 'change' | 'watcher_error' | 'watcher_unavailable';

export type WatchStatus = {
  roots: string[];
  activeRoots: string[];
  unavailableRoots: string[];
  erroredRoots: string[];
  isLive: boolean;
};

export type WatchEventPayload = {
  ts: string;
  root: string;
  path: string | null;
  kind: WatchEventKind;
  watchStatus: WatchStatus;
};
