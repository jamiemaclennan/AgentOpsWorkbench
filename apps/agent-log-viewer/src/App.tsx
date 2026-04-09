import { type RefObject, Component, type ReactNode, startTransition, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { fetchFileContent, fetchProjectDetail, fetchProjects } from './api';
import type {
  BacklogItem,
  BacklogStatus,
  FileContent,
  FrameworkFileKey,
  ProjectDetail,
  ProjectLogEntry,
  ProjectSummary,
  WatchEventPayload,
  WatchStatus
} from './shared/types';

class BoardErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="empty-state" style={{ padding: '24px' }}>
          <strong>Board failed to render</strong>
          <p className="muted" style={{ marginTop: '8px', fontSize: '0.88rem' }}>{this.state.error}</p>
          <button
            type="button"
            className="mini-action secondary"
            style={{ marginTop: '12px' }}
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const RECONCILIATION_INTERVAL_MS = 300_000;
const DEFAULT_ROOTS = ['C:\\work'];
const STATUS_ORDER = ['blocked', 'in_progress', 'todo', 'postponed', 'done', 'unknown'] as const;
const LOCAL_VALIDATION_STORAGE_KEY = 'agent-log-viewer:validated-items';

type DetailMode = 'overview' | 'board' | 'logs' | 'framework';
type LogSignalFilter = 'all' | 'blocked' | 'active' | 'complete' | 'other';
type LogGrouping = 'item' | 'timeline' | 'zone';
type LiveRefreshState = 'live' | 'fallback' | 'reconnecting';
type ValidatedItemRecord = { fingerprint: string; validatedAt: string };
type ValidatedItemStore = Record<string, ValidatedItemRecord>;

export default function App() {
  const [rootsText, setRootsText] = useState(DEFAULT_ROOTS.join(', '));
  const [editingRoots, setEditingRoots] = useState(false);
  const roots = rootsText
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const activeRoots = roots.length > 0 ? roots : DEFAULT_ROOTS;
  const rootsKey = activeRoots.join('|');

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [detailMode, setDetailMode] = useState<DetailMode>('overview');
  const [boardProjectId, setBoardProjectId] = useState<string | null>(null);
  const [boardInitialCardId, setBoardInitialCardId] = useState<string | null>(null);
  const [selectedFileKey, setSelectedFileKey] = useState<FrameworkFileKey | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileContent | null>(null);

  const [backlogSearch, setBacklogSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BacklogStatus | 'all' | 'needs-validation'>('all');
  const [backlogSourceFilter, setBacklogSourceFilter] = useState('all');
  const [backlogZoneFilter, setBacklogZoneFilter] = useState('all');
  const deferredBacklogSearch = useDeferredValue(backlogSearch);

  const [logSearch, setLogSearch] = useState('');
  const [logItemFilter, setLogItemFilter] = useState('all');
  const [logAgentFilter, setLogAgentFilter] = useState('all');
  const [logZoneFilter, setLogZoneFilter] = useState('all');
  const [logSignalFilter, setLogSignalFilter] = useState<LogSignalFilter>('all');
  const [logGrouping, setLogGrouping] = useState<LogGrouping>('item');
  const deferredLogSearch = useDeferredValue(logSearch);

  const [error, setError] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [liveRefreshState, setLiveRefreshState] = useState<LiveRefreshState>('reconnecting');
  const [validatedItems, setValidatedItems] = useState<ValidatedItemStore>(() => loadValidatedItems());
  const latestRootsRef = useRef(roots);
  const selectedProjectIdRef = useRef<string | null>(null);
  const selectedFileKeyRef = useRef<FrameworkFileKey | null>(null);

  useEffect(() => {
    latestRootsRef.current = activeRoots;
  }, [rootsKey]);

  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  useEffect(() => {
    selectedFileKeyRef.current = selectedFileKey;
  }, [selectedFileKey]);

  useEffect(() => {
    void refreshProjects(true);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('roots', activeRoots.join(','));
    const source = new EventSource(`/api/events?${params.toString()}`);

    source.addEventListener('connected', (event) => {
      const payload = parseWatchEventPayload(event);
      setLiveRefreshState(resolveLiveRefreshState(payload?.watchStatus));
    });

    source.addEventListener('project-change', (event) => {
      const payload = parseWatchEventPayload(event);
      setLiveRefreshState(resolveLiveRefreshState(payload?.watchStatus));
      void refreshProjects(false);
    });

    source.onerror = () => {
      setLiveRefreshState('reconnecting');
    };

    return () => {
      setLiveRefreshState('reconnecting');
      source.close();
    };
  }, [rootsKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshProjects(false);
    }, RECONCILIATION_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    persistValidatedItems(validatedItems);
  }, [validatedItems]);

  useEffect(() => {
    if (!selectedProjectId) {
      setProjectDetail(null);
      return;
    }

    void loadProjectDetail(selectedProjectId, false);
  }, [selectedProjectId]);

  function selectProject(
    projectId: string | null,
    options: { resetControls?: boolean; clearFile?: boolean } = {}
  ) {
    const { resetControls = false, clearFile = false } = options;

    if (resetControls) {
      resetDetailControls();
    }

    if (clearFile) {
      setSelectedFileKey(null);
      setSelectedFile(null);
    }

    setSelectedProjectId(projectId);
  }

  function openBoard(projectId: string, initialCardId?: string) {
    selectProject(projectId);
    setBoardProjectId(projectId);
    setBoardInitialCardId(initialCardId ?? null);
  }

  async function refreshProjects(showInitialLoader: boolean) {
    if (showInitialLoader) {
      setLoadingProjects(true);
    }

    const currentProjectId = selectedProjectIdRef.current;

    try {
      const response = await fetchProjects(latestRootsRef.current);
      startTransition(() => {
        setProjects(response.projects);
        setError(null);
        setLoadingProjects(false);

        if (!currentProjectId && response.projects.length > 0) {
          selectProject(response.projects[0].id);
          return;
        }

        if (
          currentProjectId &&
          !response.projects.some((project) => project.id === currentProjectId)
        ) {
          selectProject(response.projects[0]?.id ?? null, {
            resetControls: true,
            clearFile: true
          });
          setProjectDetail(null);
          return;
        }
      });

      if (currentProjectId && response.projects.some((project) => project.id === currentProjectId)) {
        void loadProjectDetail(currentProjectId, true);
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh projects.');
      setLoadingProjects(false);
    }
  }

  async function loadProjectDetail(projectId: string, preserveSelection: boolean) {
    setLoadingDetail(true);
    const currentFileKey = selectedFileKeyRef.current;
    try {
      const detail = await fetchProjectDetail(projectId, latestRootsRef.current);
      startTransition(() => {
        setProjectDetail(detail);
        setLoadingDetail(false);
        setError(null);

        if (!preserveSelection && detail.frameworkFiles.length > 0 && currentFileKey === null) {
          setSelectedFileKey(detail.frameworkFiles[0].key);
        }
      });

      if (currentFileKey) {
        const stillExists = detail.frameworkFiles.some((file) => file.key === currentFileKey);
        if (stillExists) {
          void loadFile(projectId, currentFileKey, false);
        } else {
          setSelectedFileKey(null);
          setSelectedFile(null);
        }
      }
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : 'Unable to load project detail.');
      setLoadingDetail(false);
    }
  }

  async function loadFile(projectId: string, fileKey: FrameworkFileKey, switchMode = true) {
    try {
      const content = await fetchFileContent(projectId, fileKey, latestRootsRef.current);
      startTransition(() => {
        setSelectedFileKey(fileKey);
        setSelectedFile(content);
        if (switchMode) {
          setDetailMode('framework');
        }
      });
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'Unable to load file.');
    }
  }

  function resetDetailControls() {
    setDetailMode('overview');
    setStatusFilter('all');
    setBacklogSourceFilter('all');
    setBacklogZoneFilter('all');
    setBacklogSearch('');
    setLogSearch('');
    setLogItemFilter('all');
    setLogAgentFilter('all');
    setLogZoneFilter('all');
    setLogSignalFilter('all');
    setLogGrouping('item');
  }

  function handleBoardValidationChange(storageKey: string, fingerprint: string, validated: boolean) {
    setValidatedItems((current) => updateValidatedItems(current, storageKey, fingerprint, validated));
  }

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const blockedReasons = createBlockedReasonMap(projectDetail?.logs ?? []);
  const bossHandoffs = createBossHandoffMap(projectDetail?.logs ?? []);
  const itemsMissingInstructions = createInstructionGapSet(
    projectDetail?.backlogItems ?? [],
    projectDetail?.logs ?? []
  );
  const latestItemActivity = createLatestItemActivityMap(projectDetail?.logs ?? []);

  const needsValidationCount = useMemo(() => {
    const allItems = projectDetail?.backlogItems ?? [];
    return allItems.filter((item) => {
      if (item.status !== 'done') return false;
      const bh = bossHandoffs.get(item.id) ?? null;
      const hasInstructions = item.validation !== null || (bh !== null && hasInstructionSet(bh));
      if (!hasInstructions) return false;
      const fp = createValidationFingerprint(item, latestItemActivity.get(item.id) ?? null, bh);
      const sk = createValidationStorageKey(selectedProject?.projectPath ?? 'unknown-project', item.id);
      return !isBacklogItemValidated(validatedItems, sk, fp);
    }).length;
  }, [projectDetail, bossHandoffs, latestItemActivity, validatedItems, selectedProject]);

  const filteredBacklog = filterBacklogItems(projectDetail?.backlogItems ?? [], deferredBacklogSearch);
  const sourceFilteredBacklog =
    backlogSourceFilter === 'all'
      ? filteredBacklog
      : filteredBacklog.filter((item) => item.backlogSourceKey === backlogSourceFilter);
  const zoneFilteredBacklog =
    backlogZoneFilter === 'all'
      ? sourceFilteredBacklog
      : sourceFilteredBacklog.filter((item) => item.ownerZone === backlogZoneFilter);
  const statusFilteredBacklog = useMemo(() => {
    let items: BacklogItem[];
    if (statusFilter === 'all') {
      items = zoneFilteredBacklog;
    } else if (statusFilter === 'needs-validation') {
      items = zoneFilteredBacklog.filter((item) => {
        if (item.status !== 'done') return false;
        const bossHandoff = bossHandoffs.get(item.id) ?? null;
        const hasInstructions = item.validation !== null || (bossHandoff !== null && hasInstructionSet(bossHandoff));
        if (!hasInstructions) return false;
        const fingerprint = createValidationFingerprint(
          item,
          latestItemActivity.get(item.id) ?? null,
          bossHandoff
        );
        const storageKey = createValidationStorageKey(
          selectedProject?.projectPath ?? 'unknown-project',
          item.id
        );
        return !isBacklogItemValidated(validatedItems, storageKey, fingerprint);
      });
    } else {
      items = zoneFilteredBacklog.filter((item) => item.status === statusFilter);
    }

    return sortBacklogItemsByRecentLog(items, projectDetail?.logs ?? []);
  }, [zoneFilteredBacklog, statusFilter, projectDetail, validatedItems, bossHandoffs, latestItemActivity, selectedProject]);

  const logItems = useMemo(
    () => createLogItemOptions(projectDetail?.logs ?? [], projectDetail?.backlogItems ?? []),
    [projectDetail]
  );
  const logAgents = useMemo(() => createLogAgentOptions(projectDetail?.logs ?? []), [projectDetail]);
  const filteredLogs = useMemo(
    () =>
      filterLogs(projectDetail?.logs ?? [], {
        itemId: logItemFilter,
        agent: logAgentFilter,
        zone: logZoneFilter,
        signal: logSignalFilter,
        text: deferredLogSearch
      }),
    [projectDetail, logItemFilter, logAgentFilter, logZoneFilter, logSignalFilter, deferredLogSearch]
  );
  const groupedLogs = useMemo(() => groupLogs(filteredLogs, logGrouping), [filteredLogs, logGrouping]);

  return (
    <div className="shell">
      <header className="masthead slim">
        <div className="title-row">
          <h1>Agent Log Viewer</h1>
          <div className="inline-roots">
            <span className="muted">Roots:</span>
            {editingRoots ? (
              <input
                autoFocus
                value={rootsText}
                onChange={(event) => setRootsText(event.target.value)}
                onBlur={() => {
                  setEditingRoots(false);
                  void refreshProjects(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setEditingRoots(false);
                    void refreshProjects(false);
                  }
                  if (event.key === 'Escape') {
                    setEditingRoots(false);
                  }
                }}
                placeholder="C:\work, D:\other-root"
              />
            ) : (
              <button type="button" className="roots-link" onClick={() => setEditingRoots(true)}>
                {roots.length > 0 ? roots.join(', ') : DEFAULT_ROOTS.join(', ')}
              </button>
            )}
          </div>
        </div>
        <div className="header-actions">
          <span className="refresh-inline">
            <span className="pulse" />
            {formatLiveRefreshLabel(liveRefreshState)}
          </span>
          <button className="action" onClick={() => void refreshProjects(false)} type="button">
            Refresh
          </button>
        </div>
      </header>

      {error ? <div className="banner error">{error}</div> : null}

      <main className={`workspace${boardProjectId ? ' board-mode' : ''}`}>
        {boardProjectId ? (
          <section className="board-fullscreen">
            <div className="board-fullscreen-head">
              <div>
                <p className="section-kicker">Board</p>
                <h2>{projects.find((p) => p.id === boardProjectId)?.name ?? boardProjectId}</h2>
              </div>
              <button type="button" className="action" onClick={() => setBoardProjectId(null)}>
                ← Back
              </button>
            </div>
            {projectDetail && projectDetail.project.id === boardProjectId ? (
              <BoardErrorBoundary>
                <BacklogBoard
                  items={projectDetail.backlogItems}
                  projectId={projectDetail.project.id}
                  bossHandoffs={bossHandoffs}
                  validatedItems={validatedItems}
                  onValidationChange={handleBoardValidationChange}
                  initialSelectedCardId={boardInitialCardId}
                />
              </BoardErrorBoundary>
            ) : (
              <p className="muted">Loading board…</p>
            )}
          </section>
        ) : null}

        <section className={`dashboard-panel${boardProjectId ? ' hidden' : ''}`}>
          <div className="section-head">
            <div>
              <p className="section-kicker">Portfolio</p>
              <h2>Tracked projects</h2>
            </div>
            <div className="stat-chip">
              {loadingProjects ? 'Refreshing...' : `${projects.length} project${projects.length === 1 ? '' : 's'}`}
            </div>
          </div>

          <div className="tile-grid">
            {projects.map((project) => (
              <div key={project.id} className={`project-tile${project.id === selectedProjectId ? ' selected' : ''}`}>
                <button
                  type="button"
                  className="tile-select-area"
                  onClick={() => selectProject(project.id, { resetControls: true })}
                >
                <div className="tile-topline">
                  <span className={`attention-pill ${project.attention.tone}`}>{project.attention.label}</span>
                  <span className="log-indicator">{project.hasLogs ? 'Logs present' : 'No logs yet'}</span>
                </div>
                <div>
                  <h3>{project.name}</h3>
                  <p className="muted">{project.projectPath}</p>
                </div>
                <dl className="status-grid">
                  {STATUS_ORDER.map((status) => (
                    <div key={status}>
                      <dt>{status.replace('_', ' ')}</dt>
                      <dd>{project.countsByStatus[status]}</dd>
                    </div>
                  ))}
                </dl>
                <div className="tile-footer">
                  <span>{project.totalItems} items</span>
                  <span>{formatRecentChange(project.latestChangedAt)}</span>
                </div>
                </button>
                <button
                  type="button"
                  className="tile-board-btn"
                  onClick={() => openBoard(project.id)}
                >
                  Board
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className={`detail-panel${boardProjectId ? ' hidden' : ''}`}>
          <div className="section-head">
            <div>
              <p className="section-kicker">Project detail</p>
              <h2>{selectedProject?.name ?? 'Select a project'}</h2>
            </div>
            <div className="detail-nav">
              <button
                type="button"
                className={detailMode === 'overview' ? 'active' : ''}
                onClick={() => setDetailMode('overview')}
              >
                Backlog
              </button>
              <button
                type="button"
                className={detailMode === 'logs' ? 'active' : ''}
                onClick={() => setDetailMode('logs')}
              >
                Logs
              </button>
              <button
                type="button"
                className={detailMode === 'framework' ? 'active' : ''}
                onClick={() => setDetailMode('framework')}
              >
                Framework
              </button>
            </div>
          </div>

          {!selectedProject ? (
            <EmptyState
              title="No project selected"
              body="Choose a project tile to inspect backlog, logs, and framework files."
            />
          ) : loadingDetail && !projectDetail ? (
            <EmptyState title="Loading project" body="Reading backlog, logs, and framework files." />
          ) : projectDetail ? (
            <>
              {detailMode === 'overview' ? (
                <section className="surface">
                  <div className="surface-head">
                    <div>
                      <h3>Backlogs</h3>
                      <p>
                        Aggregated across the primary backlog and any sibling backlogs.
                        {statusFilter === 'needs-validation'
                          ? ' Showing done items that need validation.'
                          : statusFilter !== 'all' ? ` Showing ${labelForStatus(statusFilter)} items.` : ''}
                      </p>
                    </div>
                    <input
                      className="search"
                      value={backlogSearch}
                      onChange={(event) => setBacklogSearch(event.target.value)}
                      placeholder="Search backlog"
                    />
                  </div>

                  <div className="summary-strip compact">
                    <SummaryMetric
                      label="All items"
                      value={projectDetail.project.totalItems}
                      tone="quiet"
                      active={statusFilter === 'all'}
                      onClick={() => setStatusFilter('all')}
                    />
                    <SummaryMetric
                      label="Blocked"
                      value={projectDetail.project.countsByStatus.blocked}
                      tone="blocked"
                      active={statusFilter === 'blocked'}
                      onClick={() => setStatusFilter('blocked')}
                    />
                    <SummaryMetric
                      label="In progress"
                      value={projectDetail.project.countsByStatus.in_progress}
                      tone="active"
                      active={statusFilter === 'in_progress'}
                      onClick={() => setStatusFilter('in_progress')}
                    />
                    <SummaryMetric
                      label="Not started"
                      value={projectDetail.project.countsByStatus.todo}
                      tone="quiet"
                      active={statusFilter === 'todo'}
                      onClick={() => setStatusFilter('todo')}
                    />
                    <SummaryMetric
                      label="Done"
                      value={projectDetail.project.countsByStatus.done}
                      tone="quiet"
                      active={statusFilter === 'done'}
                      onClick={() => setStatusFilter('done')}
                    />
                    <SummaryMetric
                      label="Needs validation"
                      value={needsValidationCount}
                      tone="blocked"
                      active={statusFilter === 'needs-validation'}
                      onClick={() => setStatusFilter('needs-validation')}
                    />
                    <SummaryMetric
                      label="Postponed"
                      value={projectDetail.project.countsByStatus.postponed}
                      tone="quiet"
                      active={statusFilter === 'postponed'}
                      onClick={() => setStatusFilter('postponed')}
                    />
                    <SummaryMetric
                      label="Unknown"
                      value={projectDetail.project.countsByStatus.unknown}
                      tone="quiet"
                      active={statusFilter === 'unknown'}
                      onClick={() => setStatusFilter('unknown')}
                    />
                  </div>

                  <div className="log-toolbar backlog-toolbar">
                    <label className="field compact">
                      <span>Backlog source</span>
                      <select value={backlogSourceFilter} onChange={(event) => setBacklogSourceFilter(event.target.value)}>
                        <option value="all">All backlog files</option>
                        {projectDetail.backlogSources.map((source) => (
                          <option key={source.key} value={source.key}>
                            {source.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field compact">
                      <span>Zone</span>
                      <select value={backlogZoneFilter} onChange={(event) => setBacklogZoneFilter(event.target.value)}>
                        <option value="all">All zones</option>
                        {projectDetail.backlogZones.map((zone) => (
                          <option key={zone} value={zone}>
                            {zone}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="backlog-list">
                    {statusFilteredBacklog.length === 0 ? (
                      <EmptyState
                        title="No matching backlog items"
                        body="Try a broader search or change the backlog source, zone, or status filters."
                      />
                    ) : (
                      statusFilteredBacklog.map((item) => (
                        (() => {
                          const bossHandoff = bossHandoffs.get(item.id) ?? null;
                          const validationFingerprint = createValidationFingerprint(
                            item,
                            latestItemActivity.get(item.id) ?? null,
                            bossHandoff
                          );
                          const storageKey = createValidationStorageKey(
                            selectedProject?.projectPath ?? 'unknown-project',
                            item.id
                          );

                          return (
                            <BacklogRow
                              key={`${item.backlogSourceKey}:${item.id}`}
                              item={item}
                              blockedReason={item.status === 'blocked' ? blockedReasons.get(item.id) ?? null : null}
                              bossHandoff={bossHandoff}
                              missingInstructions={itemsMissingInstructions.has(item.id)}
                              isValidated={isBacklogItemValidated(validatedItems, storageKey, validationFingerprint)}
                              onValidationChange={(validated) => {
                                setValidatedItems((current) =>
                                  updateValidatedItems(current, storageKey, validationFingerprint, validated)
                                );
                              }}
                              validationFingerprint={validationFingerprint}
                              onNavigateToBoard={(itemId) => openBoard(selectedProject!.id, itemId)}
                            />
                          );
                        })()
                      ))
                    )}
                  </div>
                </section>
              ) : null}

              {detailMode === 'logs' ? (
                <section className="surface">
                  <div className="surface-head">
                    <div>
                      <h3>Readable activity log</h3>
                      <p>Newest first. Filter by backlog item, agent, zone, signal, or free text.</p>
                    </div>
                  </div>

                  <div className="summary-strip compact">
                    <SummaryMetric label="Visible entries" value={filteredLogs.length} tone="active" />
                    <SummaryMetric
                      label="Blocked signals"
                      value={filteredLogs.filter((entry) => classifyLogSignal(entry) === 'blocked').length}
                      tone="blocked"
                    />
                    <SummaryMetric label="Backlog items" value={logItems.length - 1} tone="quiet" />
                  </div>

                  <div className="log-toolbar">
                    <label className="field compact">
                      <span>Backlog item</span>
                      <select value={logItemFilter} onChange={(event) => setLogItemFilter(event.target.value)}>
                        {logItems.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field compact">
                      <span>Agent</span>
                      <select value={logAgentFilter} onChange={(event) => setLogAgentFilter(event.target.value)}>
                        {logAgents.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field compact">
                      <span>Zone</span>
                      <select value={logZoneFilter} onChange={(event) => setLogZoneFilter(event.target.value)}>
                        <option value="all">All zones</option>
                        {projectDetail.logZones.map((zone) => (
                          <option key={zone} value={zone}>
                            {zone}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field compact">
                      <span>Signal</span>
                      <select
                        value={logSignalFilter}
                        onChange={(event) => setLogSignalFilter(event.target.value as LogSignalFilter)}
                      >
                        <option value="all">All signals</option>
                        <option value="blocked">Blocked</option>
                        <option value="active">Active</option>
                        <option value="complete">Complete</option>
                        <option value="other">Other</option>
                      </select>
                    </label>

                    <label className="field compact">
                      <span>Grouping</span>
                      <select
                        value={logGrouping}
                        onChange={(event) => setLogGrouping(event.target.value as LogGrouping)}
                      >
                        <option value="item">Group by backlog item</option>
                        <option value="zone">Group by zone</option>
                        <option value="timeline">Flat timeline</option>
                      </select>
                    </label>

                    <label className="field grow">
                      <span>Search logs</span>
                      <input
                        value={logSearch}
                        onChange={(event) => setLogSearch(event.target.value)}
                        placeholder="Search summary, next action, source path"
                      />
                    </label>
                  </div>

                  {filteredLogs.length === 0 ? (
                    <EmptyState title="No logs match the current filters" body="Change one of the log filters or clear the text search." />
                  ) : logGrouping === 'timeline' ? (
                    <div className="log-list">
                      {filteredLogs.map((entry) => (
                        <LogCard
                          key={entry.id}
                          entry={entry}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="log-groups">
                      {groupedLogs.map((group) => (
                        <section key={group.key} className="log-group">
                          <div className="log-group-head">
                            <div>
                              <h4>{group.label}</h4>
                              <p className="muted">
                                {group.entries.length} entr{group.entries.length === 1 ? 'y' : 'ies'} · newest first
                              </p>
                            </div>
                          </div>
                          <div className="log-list">
                            {group.entries.map((entry) => (
                              <LogCard
                                key={entry.id}
                                entry={entry}
                              />
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </section>
              ) : null}

              {detailMode === 'framework' ? (
                <section className="surface framework-surface">
                  <div className="surface-head">
                    <div>
                      <h3>Framework files</h3>
                      <p>Project reference documents rendered in place, including backlog variants.</p>
                    </div>
                  </div>

                  <div className="file-viewer">
                    <div className="file-tab-row">
                      {projectDetail.frameworkFiles.length === 0 ? (
                        <EmptyState
                          title="No framework files"
                          body="This project does not expose the expected docs yet."
                        />
                      ) : (
                        projectDetail.frameworkFiles.map((file) => (
                          <button
                            key={file.key}
                            type="button"
                            className={`file-tab ${file.key === selectedFileKey ? 'active' : ''}`}
                            onClick={() => void loadFile(projectDetail.project.id, file.key)}
                          >
                            {file.label}
                          </button>
                        ))
                      )}
                    </div>

                    {selectedFile ? (
                      <>
                        <div className="surface-head">
                          <div>
                            <h3>{selectedFile.label}</h3>
                            <p>{selectedFile.path}</p>
                          </div>
                        </div>
                        <article
                          className="markdown-body"
                          dangerouslySetInnerHTML={{ __html: selectedFile.html }}
                        />
                      </>
                    ) : (
                      <EmptyState
                        title="Choose a framework file"
                        body="Open AGENTS or one of the docs to read it in place."
                      />
                    )}
                  </div>
                </section>
              ) : null}
            </>
          ) : (
            <EmptyState title="No detail loaded" body="Select a project tile to load its backlog and logs." />
          )}
        </section>
      </main>
    </div>
  );
}

function parseWatchEventPayload(event: MessageEvent<string>): WatchEventPayload | null {
  try {
    return JSON.parse(event.data) as WatchEventPayload;
  } catch {
    return null;
  }
}

function resolveLiveRefreshState(watchStatus: WatchStatus | undefined): LiveRefreshState {
  if (!watchStatus) {
    return 'reconnecting';
  }

  return watchStatus.isLive ? 'live' : 'fallback';
}

function formatLiveRefreshLabel(state: LiveRefreshState): string {
  switch (state) {
    case 'live':
      return 'Live updates';
    case 'fallback':
      return 'Polling fallback';
    default:
      return 'Reconnect pending';
  }
}

function SummaryMetric({
  label,
  value,
  tone,
  active = false,
  onClick
}: {
  label: string;
  value: number;
  tone: 'blocked' | 'active' | 'quiet';
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`metric ${tone}-tone${active ? ' active' : ''}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

function BacklogRow({
  item,
  blockedReason,
  bossHandoff,
  missingInstructions,
  isValidated,
  onValidationChange,
  validationFingerprint,
  onNavigateToBoard
}: {
  item: BacklogItem;
  blockedReason: string | null;
  bossHandoff: ProjectLogEntry | null;
  missingInstructions: boolean;
  isValidated: boolean;
  onValidationChange: (validated: boolean) => void;
  validationFingerprint: string;
  onNavigateToBoard: (itemId: string) => void;
}) {
  const bossApproval = getBossApprovalState(item.bossSignoff);
  const awaitingBossSignoff = item.status === 'blocked' && bossApproval.needsApproval;
  const isDone = item.status === 'done';

  return (
    <article className="backlog-row">
      <div className="row-meta">
        <span className={`status-dot ${item.status}`}>{labelForStatus(item.status)}</span>
        <button
          type="button"
          className="backlog-id-link"
          onClick={() => onNavigateToBoard(item.id)}
          title="View on board"
        >
          {item.id}
        </button>
        {item.ownerZone ? <span>{item.ownerZone}</span> : null}
        {awaitingBossSignoff ? <span className="approval-pill">Needs BOSS signoff</span> : null}
        {isDone && isValidated ? <span className="validated-pill">Validated</span> : null}
        {missingInstructions ? <span className="warning-pill">Missing validation instructions</span> : null}
      </div>
      <h4>{item.title}</h4>
      <div className="backlog-details">
        {item.notes ? <BacklogDetail label="Notes" value={item.notes} /> : null}
        {item.doneWhen ? <BacklogDetail label="Done When" value={item.doneWhen} /> : null}
        {!isDone && item.validation ? <BacklogDetail label="Validation" value={item.validation} /> : null}
        {!item.notes && !item.doneWhen && (!item.validation || isDone) ? <p>No additional notes.</p> : null}
      </div>
      {awaitingBossSignoff && bossApproval.note ? <p className="approval-note">BOSS signoff: {bossApproval.note}</p> : null}
      {blockedReason ? <p className="blocked-reason">Blocked because: {blockedReason}</p> : null}
      {missingInstructions ? (
        <p className="warning-note">
          {awaitingBossSignoff
            ? 'Items waiting on BOSS signoff should include `run this`, `open this`, or `expect this` instructions.'
            : 'Done items should include `run this`, `open this`, or `expect this` instructions.'}
        </p>
      ) : null}
      {isDone ? (
        <ValidationPanel
          item={item}
          entry={bossHandoff}
          isValidated={isValidated}
          onValidationChange={onValidationChange}
          fingerprint={validationFingerprint}
        />
      ) : null}
      {awaitingBossSignoff && bossHandoff ? <BossHandoffBlock entry={bossHandoff} context="backlog" /> : null}
    </article>
  );
}

function BacklogDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="backlog-detail">
      <p className="backlog-detail-label">{label}</p>
      <p>{value}</p>
    </div>
  );
}

function ValidationPanel({
  item,
  entry,
  isValidated,
  onValidationChange,
  fingerprint
}: {
  item: BacklogItem;
  entry: ProjectLogEntry | null;
  isValidated: boolean;
  onValidationChange: (validated: boolean) => void;
  fingerprint: string;
}) {
  const [isOpen, setIsOpen] = useState(!isValidated);
  const hasInstructions = entry ? hasInstructionSet(entry) : false;

  useEffect(() => {
    setIsOpen(!isValidated);
  }, [fingerprint, isValidated]);

  return (
    <section className={`validation-panel${isOpen ? ' open' : ''}`}>
      <button type="button" className="validation-toggle" onClick={() => setIsOpen((current) => !current)}>
        <span>Validation</span>
        <span className="validation-toggle-indicator" aria-hidden="true">{isOpen ? 'v' : '^'}</span>
      </button>
      {isOpen ? (
        <div className="validation-body">
          <div className="validation-summary">
            <p className="backlog-detail-label">Status</p>
            <p>{isValidated ? 'Validated in this viewer' : 'Needs validation in this viewer'}</p>
          </div>
          {item.validation ? <BacklogDetail label="Review Target" value={item.validation} /> : null}
          {hasInstructions && entry ? <InstructionSetBlock entry={entry} heading="Validation Instructions" /> : null}
          {!item.validation && !hasInstructions ? (
            <p className="muted">No explicit validation instructions were recorded for this item.</p>
          ) : null}
          <div className="validation-actions">
            <button
              type="button"
              className="mini-action secondary"
              onClick={() => {
                onValidationChange(!isValidated);
                setIsOpen(isValidated);
              }}
            >
              {isValidated ? 'Mark Not Validated' : 'Mark Validated'}
            </button>
            {isValidated ? <span className="validated-inline">Validated in this viewer</span> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}


// Arrowhead dimensions (in SVG user units / px)
const ARROW_LENGTH = 12;
const ARROW_HALF_WIDTH = 5;

function BoardSvgOverlay({
  boardRef,
  items,
  doneIds,
  selectedCardId,
  focusCollapsed
}: {
  boardRef: RefObject<HTMLDivElement | null>;
  items: BacklogItem[];
  doneIds: Set<string>;
  selectedCardId: string | null;
  focusCollapsed: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const board = boardRef.current;
    if (!board || !selectedCardId) {
      svg.style.display = 'none';
      return;
    }

    const boardRect = board.getBoundingClientRect();
    const sL = board.scrollLeft;
    const sT = board.scrollTop;

    function toLocal(r: DOMRect) {
      return {
        left: r.left - boardRect.left + sL,
        right: r.right - boardRect.left + sL,
        top: r.top - boardRect.top + sT,
        bottom: r.bottom - boardRect.top + sT,
        cx: r.left + r.width / 2 - boardRect.left + sL,
        cy: r.top + r.height / 2 - boardRect.top + sT
      };
    }

    // Collect card DOM rects
    const cardRects = new Map<string, DOMRect>();
    for (const el of board.querySelectorAll<HTMLElement>('[data-card-id]')) {
      const id = el.getAttribute('data-card-id');
      if (id) cardRects.set(id, el.getBoundingClientRect());
    }

    const itemById = new Map(items.map((i) => [i.id, i]));
    const selItem = itemById.get(selectedCardId);
    if (!selItem || !cardRects.has(selectedCardId)) {
      svg.style.display = 'none';
      return;
    }

    // Compute edges: deps (selected depends on them) and dependents (they depend on selected)
    const depIds = parseDeps(selItem.dependsOn).filter((d) => itemById.has(d) && cardRects.has(d));
    const dependentIds = items
      .filter((i) => i.id !== selectedCardId && parseDeps(i.dependsOn).includes(selectedCardId) && cardRects.has(i.id))
      .map((i) => i.id);

    if (depIds.length === 0 && dependentIds.length === 0) {
      svg.style.display = 'none';
      return;
    }

    // Draw a bezier connector with a manually-drawn arrowhead.
    // The arrowhead is always horizontal, pointing at the target card edge.
    // The bezier line terminates at the arrowhead's base (not the card edge).
    // fromId = logical source, toId = logical target (arrow points at toId).
    function drawEdge(fromId: string, toId: string, color: string, dashed = false) {
      const fromRect = cardRects.get(fromId);
      const toRect = cardRects.get(toId);
      if (!fromRect || !toRect) return;
      const fr = toLocal(fromRect);
      const tr = toLocal(toRect);

      // Determine which side the arrow enters the target card.
      // Arrow always points horizontally at the target card's nearest edge.
      const targetIsRight = fr.cx <= tr.cx;

      // Source exits its nearest edge toward target; target arrow is at its nearest edge.
      const x1 = targetIsRight ? fr.right : fr.left;
      const y1 = fr.cy;
      const arrowTipX = targetIsRight ? tr.left : tr.right;
      const arrowTipY = tr.cy;

      // Arrowhead base is offset from the card edge by ARROW_LENGTH, toward the source.
      const arrowBaseX = targetIsRight ? arrowTipX - ARROW_LENGTH : arrowTipX + ARROW_LENGTH;

      // Bezier ends at arrowhead base, not the card edge.
      const x2 = arrowBaseX;
      const y2 = arrowTipY;

      // Control point offset scales with horizontal distance for a smooth curve.
      const dx = Math.abs(x2 - x1);
      const cpOffset = Math.max(60, dx * 0.4);

      const cp1x = targetIsRight ? x1 + cpOffset : x1 - cpOffset;
      const cp2x = targetIsRight ? x2 - cpOffset : x2 + cpOffset;

      // Draw the bezier path
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', dashed ? '1.5' : '2');
      if (dashed) path.setAttribute('stroke-dasharray', '6 4');
      svg!.appendChild(path);

      // Draw the arrowhead as a filled triangle, always horizontal.
      // Points: tip at card edge, two base corners offset back toward the source.
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const hw = dashed ? ARROW_HALF_WIDTH - 1 : ARROW_HALF_WIDTH;
      polygon.setAttribute('points', [
        `${arrowTipX},${arrowTipY}`,
        `${arrowBaseX},${arrowTipY - hw}`,
        `${arrowBaseX},${arrowTipY + hw}`
      ].join(' '));
      polygon.setAttribute('fill', color);
      if (dashed) polygon.setAttribute('opacity', '0.7');
      svg!.appendChild(polygon);
    }

    // Draw dependency lines (dep → selected): green/amber arrows pointing to selected card.
    // Parent-child links (inferred from ID structure) are dashed.
    for (const depId of depIds) {
      const isDone = doneIds.has(depId);
      const parentChild = isChildOf(selectedCardId, depId);
      const color = isDone ? 'rgba(159,224,180,0.85)' : 'rgba(243,184,109,0.9)';
      drawEdge(depId, selectedCardId, color, parentChild);
    }

    // Draw dependent lines (selected → dependent): accent-colored arrows pointing to dependents.
    // Parent-child links are dashed.
    for (const depId of dependentIds) {
      const parentChild = isChildOf(depId, selectedCardId);
      drawEdge(selectedCardId, depId, 'rgba(120,180,255,0.9)', parentChild);
    }

    svg.setAttribute('width', String(board.scrollWidth));
    svg.setAttribute('height', String(board.scrollHeight));
    svg.style.display = 'block';
  });

  return (
    <svg
      ref={svgRef}
      className="board-svg"
      aria-hidden="true"
      style={{ display: 'none' }}
    />
  );
}

type CardHighlight = 'selected' | 'dep-done' | 'dep-active' | 'dependent' | 'dimmed' | null;

type FocusSlot = BacklogItem | null;
type FocusLayout = { zoneSlots: Map<string, FocusSlot[]>; columnCount: number } | null;

function Swimlane({
  zone,
  items: zoneItems,
  doneIds,
  firstActiveId,
  selectedCardId,
  selectedDepIds,
  participatingIds,
  focusCollapsed,
  focusLayout,
  onSelect,
  projectId,
  bossHandoffs,
  validatedItems,
  onValidationClick
}: {
  zone: string;
  items: BacklogItem[];
  doneIds: Set<string>;
  firstActiveId: string | null;
  selectedCardId: string | null;
  selectedDepIds: Set<string> | null;
  participatingIds: Set<string> | null;
  focusCollapsed: boolean;
  focusLayout: FocusLayout;
  onSelect: (id: string) => void;
  projectId: string;
  bossHandoffs: Map<string, ProjectLogEntry>;
  validatedItems: ValidatedItemStore;
  onValidationClick: (item: BacklogItem) => void;
}) {
  function getHighlight(item: BacklogItem): CardHighlight {
    if (!selectedCardId) return null;
    if (item.id === selectedCardId) return 'selected';
    if (selectedDepIds && selectedDepIds.has(item.id)) {
      return item.status === 'done' ? 'dep-done' : 'dep-active';
    }
    if (parseDeps(item.dependsOn).includes(selectedCardId)) return 'dependent';
    return 'dimmed';
  }

  // If focus mode is active and no items in this zone participate, collapse the swimlane
  const hasParticipant = !participatingIds || zoneItems.some((i) => participatingIds.has(i.id));
  const isCollapsed = focusCollapsed && !hasParticipant;

  // In focused+collapsed mode, render using slot arrays from focusLayout (with gap spacers)
  const useFocusLayout = focusCollapsed && focusLayout && hasParticipant;
  const slots = useFocusLayout ? focusLayout.zoneSlots.get(zone) ?? null : null;

  function renderCard(item: BacklogItem, highlight: CardHighlight, isDimmedCollapsed: boolean) {
    const bossHandoff = bossHandoffs.get(item.id) ?? null;
    const fingerprint = createValidationFingerprint(item, null, bossHandoff);
    const storageKey = createValidationStorageKey(projectId, item.id);
    const record = validatedItems[storageKey];
    const isValidated = record?.fingerprint === fingerprint;
    const isStale = !!record && record.fingerprint !== fingerprint;
    const hasValidationInstructions =
      item.validation !== null || (bossHandoff !== null && hasInstructionSet(bossHandoff));
    return (
      <BoardCard
        key={`${item.backlogSourceKey}:${item.id}`}
        item={item}
        doneIds={doneIds}
        isFirstActive={item.id === firstActiveId}
        highlight={highlight}
        isDimmedCollapsed={isDimmedCollapsed}
        onSelect={onSelect}
        isValidated={isValidated}
        isStale={isStale}
        hasValidationInstructions={hasValidationInstructions}
        onValidationClick={() => onValidationClick(item)}
      />
    );
  }

  return (
    <div className={`swimlane${isCollapsed ? ' swimlane-collapsed' : ''}`} data-zone={zone}>
      <p className="swimlane-label">{zone}</p>
      <div className="swimlane-track">
        {slots
          ? slots.map((slot, idx) =>
              slot
                ? renderCard(slot, getHighlight(slot), false)
                : <div key={`gap-${idx}`} className="board-slot-gap" />
            )
          : zoneItems.map((item) => {
              const highlight = getHighlight(item);
              const isDimmedCollapsed = highlight === 'dimmed' && focusCollapsed;
              return renderCard(item, highlight, isDimmedCollapsed);
            })
        }
      </div>
    </div>
  );
}

type OverlayItem = {
  item: BacklogItem;
  bossHandoff: ProjectLogEntry | null;
  isValidated: boolean;
  isStale: boolean;
  storageKey: string;
  fingerprint: string;
};

function BacklogBoard({
  items,
  projectId,
  bossHandoffs,
  validatedItems,
  onValidationChange,
  initialSelectedCardId
}: {
  items: BacklogItem[];
  projectId: string;
  bossHandoffs: Map<string, ProjectLogEntry>;
  validatedItems: ValidatedItemStore;
  onValidationChange: (storageKey: string, fingerprint: string, validated: boolean) => void;
  initialSelectedCardId: string | null;
}) {
  const doneIds = useMemo(() => new Set(items.filter((i) => i.status === 'done').map((i) => i.id)), [items]);
  const layout = useMemo(() => computeBoardLayout(items), [items]);
  const firstActiveId = items.find((item) => item.status !== 'done')?.id ?? null;
  const [selectedCardId, setSelectedCardId] = useState<string | null>(initialSelectedCardId);
  const selectedCard = selectedCardId ? items.find((i) => i.id === selectedCardId) ?? null : null;
  const selectedDepIds = selectedCard ? new Set(parseDeps(selectedCard.dependsOn)) : null;
  // Compute the full set of participating IDs (selected + deps + dependents)
  const participatingIds = useMemo(() => {
    if (!selectedCardId) return null;
    const set = new Set<string>();
    set.add(selectedCardId);
    const sel = items.find((i) => i.id === selectedCardId);
    if (sel) {
      for (const d of parseDeps(sel.dependsOn)) set.add(d);
    }
    for (const item of items) {
      if (parseDeps(item.dependsOn).includes(selectedCardId)) set.add(item.id);
    }
    return set;
  }, [selectedCardId, items]);
  // Compute global column layout for participating cards in focus mode.
  // Every item must be to the right of all its deps across all zones.
  // Produces slot arrays with null gaps, like the original global layout approach.
  const focusLayout: FocusLayout = useMemo(() => {
    if (!participatingIds) return null;
    const pItems = items.filter((i) => participatingIds.has(i.id));
    const allIds = new Set(pItems.map((i) => i.id));
    const depsOf = new Map<string, string[]>();
    for (const item of pItems) {
      depsOf.set(item.id, parseDeps(item.dependsOn).filter((d) => allIds.has(d)));
    }
    // Compute column = longest dependency chain depth
    const colOf = new Map<string, number>();
    const computing = new Set<string>();
    function getCol(id: string): number {
      if (colOf.has(id)) return colOf.get(id)!;
      if (computing.has(id)) return 0;
      computing.add(id);
      const deps = depsOf.get(id) ?? [];
      const col = deps.length === 0 ? 0 : Math.max(...deps.map((d) => getCol(d))) + 1;
      colOf.set(id, col);
      computing.delete(id);
      return col;
    }
    for (const item of pItems) getCol(item.id);
    // Group by zone
    const zoneMap = new Map<string, BacklogItem[]>();
    for (const item of pItems) {
      const z = item.ownerZone ?? 'Unzoned';
      if (!zoneMap.has(z)) zoneMap.set(z, []);
      zoneMap.get(z)!.push(item);
    }
    // Resolve unique columns per zone
    let changed = true;
    let iter = 0;
    while (changed && iter < 100) {
      changed = false;
      iter++;
      for (const item of pItems) {
        for (const depId of depsOf.get(item.id) ?? []) {
          if ((colOf.get(item.id) ?? 0) <= (colOf.get(depId) ?? 0)) {
            colOf.set(item.id, (colOf.get(depId) ?? 0) + 1);
            changed = true;
          }
        }
      }
      for (const [, zItems] of zoneMap) {
        const sorted = [...zItems].sort((a, b) => (colOf.get(a.id) ?? 0) - (colOf.get(b.id) ?? 0));
        let lastCol = -1;
        for (const item of sorted) {
          if ((colOf.get(item.id) ?? 0) <= lastCol) {
            colOf.set(item.id, lastCol + 1);
            changed = true;
          }
          lastCol = colOf.get(item.id) ?? 0;
        }
      }
    }
    const maxCol = Math.max(0, ...Array.from(colOf.values()));
    const columnCount = maxCol + 1;
    // Build slot arrays per zone
    const zoneSlots = new Map<string, FocusSlot[]>();
    for (const [zone, zItems] of zoneMap) {
      const slots: FocusSlot[] = Array(columnCount).fill(null);
      for (const item of zItems) {
        slots[colOf.get(item.id) ?? 0] = item;
      }
      zoneSlots.set(zone, slots);
    }
    return { zoneSlots, columnCount };
  }, [participatingIds, items]);
  // Track whether focus-mode collapse is active (delayed after fade animation)
  const [focusCollapsed, setFocusCollapsed] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    if (selectedCardId) {
      // Delay collapse until after the 250ms fade animation
      collapseTimer.current = setTimeout(() => setFocusCollapsed(true), 260);
    } else {
      setFocusCollapsed(false);
    }
    return () => { if (collapseTimer.current) clearTimeout(collapseTimer.current); };
  }, [selectedCardId]);
  // After focus collapse completes, scroll the selected card into view
  useEffect(() => {
    if (focusCollapsed && selectedCardId) {
      requestAnimationFrame(() => {
        const card = boardRef.current?.querySelector(`[data-card-id="${selectedCardId}"]`);
        card?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      });
    }
  }, [focusCollapsed, selectedCardId]);
  const [overlayItem, setOverlayItem] = useState<OverlayItem | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // Drag-to-scroll state (refs to avoid re-renders)
  const dragState = useRef<{ active: boolean; startX: number; startY: number; scrollX: number; scrollY: number }>({
    active: false, startX: 0, startY: 0, scrollX: 0, scrollY: 0
  });

  useEffect(() => {
    if (!overlayItem) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOverlayItem(null);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [overlayItem]);

  function handleBoardClick(event: React.MouseEvent<HTMLDivElement>) {
    if (dragState.current.active) return;
    const target = event.target as HTMLElement;
    if (!target.closest('.board-card')) setSelectedCardId(null);
  }
  function handleSelect(id: string) {
    if (dragState.current.active) return;
    // Always select the clicked card (no toggle). Deselection is via clicking empty board space.
    setSelectedCardId(id);
  }
  function handleValidationClick(item: BacklogItem) {
    const bossHandoff = bossHandoffs.get(item.id) ?? null;
    const fingerprint = createValidationFingerprint(item, null, bossHandoff);
    const storageKey = createValidationStorageKey(projectId, item.id);
    const record = validatedItems[storageKey];
    const isValidated = record?.fingerprint === fingerprint;
    const isStale = !!record && record.fingerprint !== fingerprint;
    setOverlayItem({ item, bossHandoff, isValidated, isStale, storageKey, fingerprint });
  }

  // Drag-to-scroll handlers — only active in focus mode (card selected)
  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!selectedCardId) return;
    if ((event.target as HTMLElement).closest('.board-card')) return;
    const board = boardRef.current;
    if (!board) return;
    dragState.current = { active: false, startX: event.clientX, startY: event.clientY, scrollX: board.scrollLeft, scrollY: board.scrollTop };
    board.setPointerCapture(event.pointerId);
    board.classList.add('grabbing');
  }
  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const ds = dragState.current;
    if (ds.startX === 0 && ds.startY === 0) return;
    const dx = event.clientX - ds.startX;
    const dy = event.clientY - ds.startY;
    if (!ds.active && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) ds.active = true;
    if (!ds.active) return;
    const board = boardRef.current;
    if (board) {
      board.scrollLeft = ds.scrollX - dx;
      board.scrollTop = ds.scrollY - dy;
    }
  }
  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const board = boardRef.current;
    if (board) {
      board.releasePointerCapture(event.pointerId);
      board.classList.remove('grabbing');
    }
    const wasActive = dragState.current.active;
    // Keep active flag alive so the click handler (which fires after pointer-up) can see it
    if (wasActive) {
      requestAnimationFrame(() => {
        dragState.current = { active: false, startX: 0, startY: 0, scrollX: 0, scrollY: 0 };
      });
    } else {
      dragState.current = { active: false, startX: 0, startY: 0, scrollX: 0, scrollY: 0 };
    }
  }

  return (
    <>
      <div
        className={`board-view${selectedCardId ? ' focus-active' : ''}`}
        ref={boardRef}
        onClick={handleBoardClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {layout.zones.map(({ zone, items: zoneItems }) => (
          <Swimlane
            key={zone}
            zone={zone}
            items={zoneItems}
            doneIds={doneIds}
            firstActiveId={firstActiveId}
            selectedCardId={selectedCardId}
            selectedDepIds={selectedDepIds}
            participatingIds={participatingIds}
            focusCollapsed={focusCollapsed}
            focusLayout={focusLayout}
            onSelect={handleSelect}
            projectId={projectId}
            bossHandoffs={bossHandoffs}
            validatedItems={validatedItems}
            onValidationClick={handleValidationClick}
          />
        ))}
        <BoardSvgOverlay boardRef={boardRef} items={items} doneIds={doneIds} selectedCardId={selectedCardId} focusCollapsed={focusCollapsed} />
      </div>
      {overlayItem ? createPortal(
        <div
          className="validation-overlay-backdrop"
          onClick={() => setOverlayItem(null)}
        >
          <div
            className="validation-overlay"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="validation-overlay-close"
              onClick={() => setOverlayItem(null)}
              aria-label="Close"
            >
              ×
            </button>
            <p className="board-card-id">{overlayItem.item.id}</p>
            <h3 style={{ marginBottom: '16px', marginTop: '6px' }}>{overlayItem.item.title}</h3>
            {overlayItem.item.validation ? (
              <BacklogDetail label="Validation" value={overlayItem.item.validation} />
            ) : null}
            {overlayItem.bossHandoff && hasInstructionSet(overlayItem.bossHandoff) ? (
              <InstructionSetBlock entry={overlayItem.bossHandoff} heading="Validation Instructions" />
            ) : null}
            {!overlayItem.item.validation &&
            !(overlayItem.bossHandoff && hasInstructionSet(overlayItem.bossHandoff)) ? (
              <p className="muted">No explicit validation instructions were recorded for this item.</p>
            ) : null}
            {overlayItem.isStale ? (
              <p className="board-card-stale-warning" style={{ margin: '12px 0' }}>
                This item has changed since it was last validated. Review carefully before re-validating.
              </p>
            ) : null}
            <div className="validation-actions" style={{ marginTop: '16px' }}>
              <button
                type="button"
                className="mini-action secondary"
                onClick={() => {
                  const newValidated = !overlayItem.isValidated;
                  onValidationChange(overlayItem.storageKey, overlayItem.fingerprint, newValidated);
                  setOverlayItem((current) =>
                    current ? { ...current, isValidated: newValidated, isStale: false } : null
                  );
                }}
              >
                {overlayItem.isValidated ? 'Mark Not Validated' : 'Mark Validated'}
              </button>
              {overlayItem.isValidated ? (
                <span className="validated-inline">Validated in this viewer</span>
              ) : null}
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}

function BoardCard({
  item,
  doneIds,
  isFirstActive,
  highlight,
  isDimmedCollapsed,
  onSelect,
  isValidated,
  isStale,
  hasValidationInstructions,
  onValidationClick
}: {
  item: BacklogItem;
  doneIds: Set<string>;
  isFirstActive: boolean;
  highlight: CardHighlight;
  isDimmedCollapsed?: boolean;
  onSelect: (id: string) => void;
  isValidated: boolean;
  isStale: boolean;
  hasValidationInstructions: boolean;
  onValidationClick: () => void;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isFirstActive && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, []);

  const deps = parseDeps(item.dependsOn);
  const highlightClass = highlight ? ` highlight-${highlight}` : '';
  const collapsedClass = isDimmedCollapsed ? ' collapsed' : '';
  const isDone = item.status === 'done';

  return (
    <article
      ref={ref}
      data-card-id={item.id}
      className={`board-card${isDone ? ' done' : ''}${isFirstActive ? ' first-active' : ''}${highlightClass}${collapsedClass}`}
      onClick={() => onSelect(item.id)}
      style={{ cursor: 'pointer' }}
    >
      <div className="board-card-top">
        <span className="board-card-id">{item.id}</span>
        <span className={`board-status-badge ${item.status}`}>{labelForStatus(item.status)}</span>
      </div>
      <h4 className="board-card-title">{item.title}</h4>
      {item.notes ? <p className="board-card-notes">{item.notes}</p> : null}
      {deps.length > 0 ? (
        <div className="board-card-deps">
          {deps.map((dep) => {
            const parentChild = isChildOf(item.id, dep);
            return (
              <span key={dep} className={`dep-chip${doneIds.has(dep) ? ' met' : ' unmet'}${parentChild ? ' parent' : ''}`}>
                {dep}
              </span>
            );
          })}
        </div>
      ) : null}
      {isDone ? (
        <div onClick={(event) => event.stopPropagation()}>
          {!hasValidationInstructions ? (
            <p className="board-card-no-validation">No validation rules</p>
          ) : isValidated ? (
            <div>
              <span className="board-card-validated-chip">
                <span>✓</span>
                <span>Validated</span>
              </span>
              {isStale ? (
                <p className="board-card-stale-warning">May be outdated</p>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              className="board-card-validate-btn"
              onClick={onValidationClick}
            >
              Validate
            </button>
          )}
        </div>
      ) : null}
    </article>
  );
}

function parseDeps(dependsOn: string | null): string[] {
  if (!dependsOn) return [];
  return dependsOn
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
}

/** True if childId is a hierarchical child of parentId (e.g. HX2-052.01 is child of HX2-052) */
function isChildOf(childId: string, parentId: string): boolean {
  return childId.startsWith(parentId + '.');
}

type BoardLayout = {
  zones: { zone: string; items: BacklogItem[] }[];
  zoneOrder: string[];
};

function computeBoardLayout(items: BacklogItem[]): BoardLayout {
  // Build a global set of all item IDs and their parsed deps
  const allIds = new Set(items.map((i) => i.id));
  const depsOf = new Map<string, string[]>();
  for (const item of items) {
    depsOf.set(item.id, parseDeps(item.dependsOn).filter((d) => allIds.has(d)));
  }

  // Compute topological depth = longest dependency chain (across all zones)
  const depthOf = new Map<string, number>();
  const computing = new Set<string>();
  function getDepth(id: string): number {
    if (depthOf.has(id)) return depthOf.get(id)!;
    if (computing.has(id)) return 0; // cycle guard
    computing.add(id);
    const deps = depsOf.get(id) ?? [];
    const depth = deps.length === 0 ? 0 : Math.max(...deps.map((d) => getDepth(d))) + 1;
    depthOf.set(id, depth);
    computing.delete(id);
    return depth;
  }
  for (const item of items) getDepth(item.id);

  // Group by zone
  const zoneMap = new Map<string, BacklogItem[]>();
  for (const item of items) {
    const zone = item.ownerZone ?? 'Unzoned';
    if (!zoneMap.has(zone)) zoneMap.set(zone, []);
    zoneMap.get(zone)!.push(item);
  }

  // Sort each zone by topological depth (stable: ties preserve original order)
  for (const [, zoneItems] of zoneMap) {
    zoneItems.sort((a, b) => (depthOf.get(a.id) ?? 0) - (depthOf.get(b.id) ?? 0));
  }

  const zoneOrder = Array.from(zoneMap.keys());
  const zones = zoneOrder.map((zone) => ({ zone, items: zoneMap.get(zone)! }));
  return { zones, zoneOrder };
}

function LogCard({ entry }: { entry: ProjectLogEntry }) {
  return (
    <article className="log-card">
      <div className="row-meta">
        <span className={`status-dot ${normalizeSignal(entry.itemStatus, entry.stepVerdict)}`}>
          {entry.itemStatus ?? entry.stepVerdict ?? 'activity'}
        </span>
        <span>{entry.itemId ?? 'Unlinked item'}</span>
        {entry.zone ? <span>{entry.zone}</span> : null}
        <span>{entry.agent ?? 'Unknown agent'}</span>
        <span>{entry.event ?? 'event'}</span>
      </div>
      <h4>{entry.summary ?? 'No summary provided.'}</h4>
      {entry.nextGap ? <p className="next-gap">Next action: {entry.nextGap}</p> : null}
      {hasBossHandoff(entry) ? <BossHandoffBlock entry={entry} context="log" /> : null}
      <p className="muted">
        {entry.ts ?? 'No timestamp'} · {entry.sourcePath}
      </p>
    </article>
  );
}

function BossHandoffBlock({
  entry,
  context
}: {
  entry: ProjectLogEntry;
  context: 'backlog' | 'log';
}) {
  const heading = context === 'backlog' ? 'Latest BOSS handoff' : 'BOSS handoff';
  return <InstructionSetBlock entry={entry} heading={heading} />;
}

function InstructionSetBlock({ entry, heading }: { entry: ProjectLogEntry; heading: string }) {
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleCopy(value: string) {
    try {
      const normalizedValue = normalizeInstructionCopy(value);
      await navigator.clipboard.writeText(normalizedValue);
      setCopiedValue(value);
      window.setTimeout(() => {
        setCopiedValue((current) => (current === value ? null : current));
      }, 1500);
    } catch {
      setActionError('Unable to copy to clipboard.');
    }
  }

  return (
    <section className="handoff-block">
      <p className="handoff-title">{heading}</p>
      {entry.evidenceInstructions.runThis.length > 0 ? (
        <div>
          <p className="handoff-label">Run this</p>
          <ul className="handoff-list">
            {entry.evidenceInstructions.runThis.map((instruction, index) => (
              <li key={`${entry.id}:instruction:${index}`} className="handoff-item">
                <code>{instruction}</code>
                <span className="handoff-actions">
                  <button
                    type="button"
                    className="mini-action secondary"
                    onClick={() => void handleCopy(instruction)}
                  >
                    {copiedValue === instruction ? 'Copied' : 'Copy'}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {entry.evidenceInstructions.openThis.length > 0 ? (
        <div>
          <p className="handoff-label">Open this</p>
          <ul className="handoff-list">
            {entry.evidenceInstructions.openThis.map((instruction, index) => (
              <li key={`${entry.id}:open:${index}`} className="handoff-item">
                <code>{instruction}</code>
                <span className="handoff-actions">
                  {isHttpUrl(instruction) ? (
                    <a className="mini-action link-action" href={instruction} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="mini-action secondary"
                    onClick={() => void handleCopy(instruction)}
                  >
                    {copiedValue === instruction ? 'Copied' : 'Copy'}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {entry.evidenceInstructions.expectThis.length > 0 ? (
        <div>
          <p className="handoff-label">Expect this</p>
          <ul className="handoff-list">
            {entry.evidenceInstructions.expectThis.map((instruction, index) => (
              <li key={`${entry.id}:expect:${index}`} className="handoff-item">
                <span>{instruction}</span>
                <span className="handoff-actions">
                  <button
                    type="button"
                    className="mini-action secondary"
                    onClick={() => void handleCopy(instruction)}
                  >
                    {copiedValue === instruction ? 'Copied' : 'Copy'}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {actionError ? <p className="warning-note">{actionError}</p> : null}
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function filterBacklogItems(items: BacklogItem[], query: string): BacklogItem[] {
  const text = query.trim().toLowerCase();
  if (!text) {
    return items;
  }

  return items.filter((item) => {
    const haystack = [item.id, item.status, item.ownerZone, item.title, item.notes, item.backlogSourceLabel]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(text);
  });
}

function sortBacklogItemsByRecentLog(items: BacklogItem[], logs: ProjectLogEntry[]): BacklogItem[] {
  const latestLogByItem = new Map<string, number>();

  for (const entry of logs) {
    if (!entry.itemId || latestLogByItem.has(entry.itemId)) {
      continue;
    }

    const timestamp = entry.ts ? Date.parse(entry.ts) : 0;
    latestLogByItem.set(entry.itemId, Number.isNaN(timestamp) ? 0 : timestamp);
  }

  return [...items].sort((left, right) => {
    const rightTime = latestLogByItem.get(right.id) ?? -1;
    const leftTime = latestLogByItem.get(left.id) ?? -1;

    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    return left.id.localeCompare(right.id);
  });
}

function createBlockedReasonMap(logs: ProjectLogEntry[]): Map<string, string> {
  const reasons = new Map<string, string>();

  for (const entry of logs) {
    if (!entry.itemId || reasons.has(entry.itemId)) {
      continue;
    }

    const signal = `${entry.itemStatus ?? ''} ${entry.stepVerdict ?? ''}`.toLowerCase();
    const reason = entry.nextGap ?? entry.summary;
    if (signal.includes('block') && reason) {
      reasons.set(entry.itemId, reason);
    }
  }

  return reasons;
}

function createBossHandoffMap(logs: ProjectLogEntry[]): Map<string, ProjectLogEntry> {
  const handoffs = new Map<string, ProjectLogEntry>();

  for (const entry of logs) {
    if (!entry.itemId || handoffs.has(entry.itemId) || !hasInstructionSet(entry)) {
      continue;
    }

    handoffs.set(entry.itemId, entry);
  }

  return handoffs;
}

function createInstructionGapSet(
  backlogItems: BacklogItem[],
  logs: ProjectLogEntry[]
): Set<string> {
  const instructionItems = new Set(
    logs.filter(hasInstructionSet).map((entry) => entry.itemId).filter(Boolean) as string[]
  );

  return new Set(
    backlogItems
      .filter((item) => {
        const bossApproval = getBossApprovalState(item.bossSignoff);
        const needsInstructions = item.status === 'blocked' && bossApproval.needsApproval;
        return needsInstructions && !instructionItems.has(item.id);
      })
      .map((item) => item.id)
  );
}

function createLatestItemActivityMap(logs: ProjectLogEntry[]): Map<string, string> {
  const activity = new Map<string, string>();

  for (const entry of logs) {
    if (!entry.itemId || activity.has(entry.itemId)) {
      continue;
    }

    activity.set(entry.itemId, `${entry.id}:${entry.ts ?? 'no-ts'}`);
  }

  return activity;
}

function createLogItemOptions(logs: ProjectLogEntry[], backlogItems: BacklogItem[]) {
  const backlogMap = new Map(backlogItems.map((item) => [item.id, item.title]));
  const ids = Array.from(new Set(logs.map((entry) => entry.itemId).filter(Boolean) as string[])).sort();
  return [
    { value: 'all', label: 'All backlog items' },
    ...ids.map((id) => ({
      value: id,
      label: backlogMap.has(id) ? `${id} · ${backlogMap.get(id)}` : id
    }))
  ];
}

function createLogAgentOptions(logs: ProjectLogEntry[]) {
  const agents = Array.from(new Set(logs.map((entry) => entry.agent).filter(Boolean) as string[])).sort();
  return [
    { value: 'all', label: 'All agents' },
    ...agents.map((agent) => ({ value: agent, label: agent }))
  ];
}

function filterLogs(
  logs: ProjectLogEntry[],
  filters: { itemId: string; agent: string; zone: string; signal: LogSignalFilter; text: string }
) {
  const text = filters.text.trim().toLowerCase();

  return logs.filter((entry) => {
    if (filters.itemId !== 'all' && entry.itemId !== filters.itemId) {
      return false;
    }
    if (filters.agent !== 'all' && entry.agent !== filters.agent) {
      return false;
    }
    if (filters.zone !== 'all' && entry.zone !== filters.zone) {
      return false;
    }

    const signal = classifyLogSignal(entry);
    if (filters.signal !== 'all' && signal !== filters.signal) {
      return false;
    }

    if (!text) {
      return true;
    }

    const haystack = [
      entry.itemId,
      entry.zone,
      entry.agent,
      entry.event,
      entry.summary,
      entry.nextGap,
      entry.sourcePath,
      ...entry.evidenceInstructions.runThis,
      ...entry.evidenceInstructions.openThis,
      ...entry.evidenceInstructions.expectThis
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(text);
  });
}

function groupLogs(logs: ProjectLogEntry[], grouping: LogGrouping) {
  const groups = new Map<string, { key: string; label: string; entries: ProjectLogEntry[] }>();

  for (const entry of logs) {
    const key = grouping === 'zone' ? entry.zone ?? 'unassigned-zone' : entry.itemId ?? 'unlinked';
    const label = grouping === 'zone' ? entry.zone ?? 'Unassigned zone' : entry.itemId ?? 'Unlinked activity';
    if (!groups.has(key)) {
      groups.set(key, { key, label, entries: [] });
    }
    groups.get(key)!.entries.push(entry);
  }

  return Array.from(groups.values()).sort((left, right) => {
    const leftTs = left.entries[0]?.ts ? Date.parse(left.entries[0].ts as string) : 0;
    const rightTs = right.entries[0]?.ts ? Date.parse(right.entries[0].ts as string) : 0;
    return rightTs - leftTs;
  });
}

function classifyLogSignal(entry: ProjectLogEntry): LogSignalFilter {
  const value = `${entry.itemStatus ?? ''} ${entry.stepVerdict ?? ''} ${entry.summary ?? ''}`.toLowerCase();
  if (value.includes('block')) {
    return 'blocked';
  }
  if (value.includes('progress') || value.includes('pass') || value.includes('dispatch') || value.includes('start')) {
    return 'active';
  }
  if (value.includes('done') || value.includes('complete')) {
    return 'complete';
  }
  return 'other';
}

function normalizeSignal(itemStatus: string | null, stepVerdict: string | null): string {
  const value = (itemStatus ?? stepVerdict ?? '').toLowerCase();
  if (value.includes('block')) {
    return 'blocked';
  }
  if (value.includes('progress') || value.includes('pass')) {
    return 'in_progress';
  }
  if (value.includes('done') || value.includes('complete')) {
    return 'done';
  }
  return 'unknown';
}

function labelForStatus(status: BacklogStatus | 'all') {
  switch (status) {
    case 'todo':
      return 'not started';
    case 'in_progress':
      return 'in progress';
    case 'postponed':
      return 'postponed';
    case 'all':
      return 'all';
    default:
      return status.replace('_', ' ');
  }
}

function formatRecentChange(ts: string | null): string {
  if (!ts) {
    return 'No recent change';
  }

  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    return 'No recent change';
  }

  return `Updated ${date.toLocaleString()}`;
}

function getBossApprovalState(value: string | null) {
  if (!value) {
    return { needsApproval: false, note: null as string | null };
  }

  const normalized = value.trim();
  const lowered = normalized.toLowerCase();

  if (!normalized) {
    return { needsApproval: false, note: null as string | null };
  }

  if (lowered === 'no') {
    return { needsApproval: false, note: null as string | null };
  }

  if (lowered === 'yes') {
    return { needsApproval: true, note: null as string | null };
  }

  return { needsApproval: true, note: normalized };
}

function hasBossHandoff(entry: ProjectLogEntry): boolean {
  return entry.event === 'boss_review_handoff' || hasInstructionSet(entry);
}

function hasInstructionSet(entry: ProjectLogEntry): boolean {
  return (
    entry.evidenceInstructions.runThis.length > 0 ||
    entry.evidenceInstructions.openThis.length > 0 ||
    entry.evidenceInstructions.expectThis.length > 0
  );
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizeInstructionCopy(value: string): string {
  return value.replace(/^(run this|open this|expect this)\s*:\s*/i, '').trim();
}

function createValidationStorageKey(projectPath: string, itemId: string): string {
  return `${projectPath}::${itemId}`;
}

function createValidationFingerprint(
  item: BacklogItem,
  latestActivity: string | null,
  entry: ProjectLogEntry | null
): string {
  return JSON.stringify({
    status: item.status,
    title: item.title,
    doneWhen: item.doneWhen,
    validation: item.validation,
    notes: item.notes,
    latestActivity,
    instructionSource: entry?.id ?? null
  });
}

function loadValidatedItems(): ValidatedItemStore {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_VALIDATION_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    return JSON.parse(raw) as ValidatedItemStore;
  } catch {
    return {};
  }
}

function persistValidatedItems(validatedItems: ValidatedItemStore) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(LOCAL_VALIDATION_STORAGE_KEY, JSON.stringify(validatedItems));
}

function isBacklogItemValidated(
  validatedItems: ValidatedItemStore,
  storageKey: string,
  fingerprint: string
): boolean {
  return validatedItems[storageKey]?.fingerprint === fingerprint;
}

function updateValidatedItems(
  validatedItems: ValidatedItemStore,
  storageKey: string,
  fingerprint: string,
  validated: boolean
): ValidatedItemStore {
  if (!validated) {
    const { [storageKey]: _removed, ...rest } = validatedItems;
    return rest;
  }

  return {
    ...validatedItems,
    [storageKey]: {
      fingerprint,
      validatedAt: new Date().toISOString()
    }
  };
}
