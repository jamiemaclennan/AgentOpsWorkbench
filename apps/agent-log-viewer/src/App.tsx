import { type RefObject, startTransition, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

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
  const [selectedFileKey, setSelectedFileKey] = useState<FrameworkFileKey | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileContent | null>(null);

  const [backlogSearch, setBacklogSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BacklogStatus | 'all'>('all');
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

  function openBoard(projectId: string) {
    selectProject(projectId);
    setBoardProjectId(projectId);
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
    const items =
      statusFilter === 'all'
        ? zoneFilteredBacklog
        : zoneFilteredBacklog.filter((item) => item.status === statusFilter);

    return sortBacklogItemsByRecentLog(items, projectDetail?.logs ?? []);
  }, [zoneFilteredBacklog, statusFilter, projectDetail]);

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
              <BacklogBoard
                items={projectDetail.backlogItems}
                projectId={projectDetail.project.id}
                bossHandoffs={bossHandoffs}
                validatedItems={validatedItems}
                onValidationChange={handleBoardValidationChange}
              />
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
                        {statusFilter !== 'all' ? ` Showing ${labelForStatus(statusFilter)} items.` : ''}
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
  validationFingerprint
}: {
  item: BacklogItem;
  blockedReason: string | null;
  bossHandoff: ProjectLogEntry | null;
  missingInstructions: boolean;
  isValidated: boolean;
  onValidationChange: (validated: boolean) => void;
  validationFingerprint: string;
}) {
  const bossApproval = getBossApprovalState(item.bossSignoff);
  const awaitingBossSignoff = item.status === 'blocked' && bossApproval.needsApproval;
  const isDone = item.status === 'done';

  return (
    <article className="backlog-row">
      <div className="row-meta">
        <span className={`status-dot ${item.status}`}>{labelForStatus(item.status)}</span>
        <span>{item.id}</span>
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

type SvgLine = { x1: number; y1: number; x2: number; y2: number; color: string };

function SwimlaneSvgOverlay({
  trackRef,
  zoneItems,
  doneIds
}: {
  trackRef: RefObject<HTMLDivElement>;
  zoneItems: BacklogItem[];
  doneIds: Set<string>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [lines, setLines] = useState<SvgLine[]>([]);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const trackRect = track.getBoundingClientRect();
    const cardEls = track.querySelectorAll<HTMLElement>('[data-card-id]');
    const cardRects = new Map<string, DOMRect>();
    for (const el of cardEls) {
      const cardId = el.getAttribute('data-card-id');
      if (cardId) {
        cardRects.set(cardId, el.getBoundingClientRect());
      }
    }

    const zoneIdSet = new Set(zoneItems.map((item) => item.id));
    const nextLines: SvgLine[] = [];

    for (const item of zoneItems) {
      const depRect = cardRects.get(item.id);
      if (!depRect) continue;

      for (const dependentItem of zoneItems) {
        if (!zoneIdSet.has(dependentItem.id)) continue;
        const deps = parseDeps(dependentItem.dependsOn);
        if (!deps.includes(item.id)) continue;

        const depEndRect = cardRects.get(dependentItem.id);
        if (!depEndRect) continue;

        // x1 = right edge of dep card, x2 = left edge of dependent card
        // Positions are relative to the track element
        const x1 = depRect.right - trackRect.left + track.scrollLeft;
        const y1 = depRect.top + depRect.height / 2 - trackRect.top;
        const x2 = depEndRect.left - trackRect.left + track.scrollLeft;
        const y2 = depEndRect.top + depEndRect.height / 2 - trackRect.top;

        const isDone = doneIds.has(item.id);
        const color = isDone
          ? 'rgba(159, 224, 180, 0.25)'
          : 'rgba(243, 184, 109, 0.3)';

        nextLines.push({ x1, y1, x2, y2, color });
      }
    }

    setLines(nextLines);
  });

  if (lines.length === 0) return null;

  return (
    <svg
      ref={svgRef}
      className="swimlane-svg"
      aria-hidden="true"
    >
      {lines.map((line, index) => {
        const cx = (line.x1 + line.x2) / 2;
        const d = `M ${line.x1} ${line.y1} Q ${cx} ${line.y1} ${cx} ${(line.y1 + line.y2) / 2} Q ${cx} ${line.y2} ${line.x2} ${line.y2}`;
        return (
          <path
            key={index}
            d={d}
            fill="none"
            stroke={line.color}
            strokeWidth="1.5"
          />
        );
      })}
    </svg>
  );
}

type CardHighlight = 'selected' | 'dep-done' | 'dep-active' | 'dependent' | 'dimmed' | null;

function Swimlane({
  zone,
  zoneItems,
  doneIds,
  firstActiveId,
  selectedCardId,
  selectedDepIds,
  onSelect,
  projectId,
  bossHandoffs,
  validatedItems,
  onValidationClick
}: {
  zone: string;
  zoneItems: BacklogItem[];
  doneIds: Set<string>;
  firstActiveId: string | null;
  selectedCardId: string | null;
  selectedDepIds: Set<string> | null;
  onSelect: (id: string) => void;
  projectId: string;
  bossHandoffs: Map<string, ProjectLogEntry>;
  validatedItems: ValidatedItemStore;
  onValidationClick: (item: BacklogItem) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  function getHighlight(item: BacklogItem): CardHighlight {
    if (!selectedCardId) return null;
    if (item.id === selectedCardId) return 'selected';
    if (selectedDepIds && selectedDepIds.has(item.id)) {
      return item.status === 'done' ? 'dep-done' : 'dep-active';
    }
    if (parseDeps(item.dependsOn).includes(selectedCardId)) return 'dependent';
    return 'dimmed';
  }

  return (
    <div className="swimlane">
      <p className="swimlane-label">{zone}</p>
      <div className="swimlane-track" ref={trackRef}>
        {zoneItems.map((item) => {
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
              highlight={getHighlight(item)}
              onSelect={onSelect}
              isValidated={isValidated}
              isStale={isStale}
              hasValidationInstructions={hasValidationInstructions}
              onValidationClick={() => onValidationClick(item)}
            />
          );
        })}
        <SwimlaneSvgOverlay trackRef={trackRef} zoneItems={zoneItems} doneIds={doneIds} />
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
  onValidationChange
}: {
  items: BacklogItem[];
  projectId: string;
  bossHandoffs: Map<string, ProjectLogEntry>;
  validatedItems: ValidatedItemStore;
  onValidationChange: (storageKey: string, fingerprint: string, validated: boolean) => void;
}) {
  const doneIds = useMemo(() => new Set(items.filter((i) => i.status === 'done').map((i) => i.id)), [items]);
  const zones = useMemo(() => groupItemsByZone(items), [items]);
  const firstActiveId = items.find((item) => item.status !== 'done')?.id ?? null;
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const selectedCard = selectedCardId ? items.find((i) => i.id === selectedCardId) ?? null : null;
  const selectedDepIds = selectedCard ? new Set(parseDeps(selectedCard.dependsOn)) : null;
  const [overlayItem, setOverlayItem] = useState<OverlayItem | null>(null);

  useEffect(() => {
    if (!overlayItem) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOverlayItem(null);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [overlayItem]);

  function handleBoardClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (!target.closest('.board-card')) setSelectedCardId(null);
  }
  function handleSelect(id: string) {
    setSelectedCardId((prev) => (prev === id ? null : id));
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

  return (
    <>
      <div className="board-view" onClick={handleBoardClick}>
        {zones.map(({ zone, items: zoneItems }) => (
          <Swimlane
            key={zone}
            zone={zone}
            zoneItems={zoneItems}
            doneIds={doneIds}
            firstActiveId={firstActiveId}
            selectedCardId={selectedCardId}
            selectedDepIds={selectedDepIds}
            onSelect={handleSelect}
            projectId={projectId}
            bossHandoffs={bossHandoffs}
            validatedItems={validatedItems}
            onValidationClick={handleValidationClick}
          />
        ))}
      </div>
      {overlayItem ? (
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
        </div>
      ) : null}
    </>
  );
}

function BoardCard({
  item,
  doneIds,
  isFirstActive,
  highlight,
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
  const isDone = item.status === 'done';

  return (
    <article
      ref={ref}
      data-card-id={item.id}
      className={`board-card${isDone ? ' done' : ''}${isFirstActive ? ' first-active' : ''}${highlightClass}`}
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
          {deps.map((dep) => (
            <span key={dep} className={`dep-chip${doneIds.has(dep) ? ' met' : ' unmet'}`}>
              {dep}
            </span>
          ))}
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

function topoSortZoneItems(zoneItems: BacklogItem[]): BacklogItem[] {
  const idSet = new Set(zoneItems.map((item) => item.id));
  // Build adjacency: depId -> list of item ids that depend on it (within zone)
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // depId -> [itemId, ...]
  for (const item of zoneItems) {
    inDegree.set(item.id, 0);
    dependents.set(item.id, []);
  }
  for (const item of zoneItems) {
    for (const depId of parseDeps(item.dependsOn)) {
      if (idSet.has(depId)) {
        inDegree.set(item.id, (inDegree.get(item.id) ?? 0) + 1);
        dependents.get(depId)!.push(item.id);
      }
    }
  }
  // Kahn's algorithm
  const queue: string[] = [];
  for (const item of zoneItems) {
    if ((inDegree.get(item.id) ?? 0) === 0) {
      queue.push(item.id);
    }
  }
  const itemById = new Map(zoneItems.map((item) => [item.id, item]));
  const sorted: BacklogItem[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const item = itemById.get(id);
    if (item) sorted.push(item);
    for (const dependentId of (dependents.get(id) ?? [])) {
      const newDegree = (inDegree.get(dependentId) ?? 0) - 1;
      inDegree.set(dependentId, newDegree);
      if (newDegree === 0) {
        queue.push(dependentId);
      }
    }
  }
  // If there are cycles, append any remaining items in original order
  if (sorted.length < zoneItems.length) {
    const sortedIds = new Set(sorted.map((item) => item.id));
    for (const item of zoneItems) {
      if (!sortedIds.has(item.id)) sorted.push(item);
    }
  }
  return sorted;
}

function groupItemsByZone(items: BacklogItem[]): { zone: string; items: BacklogItem[] }[] {
  const zoneMap = new Map<string, BacklogItem[]>();
  for (const item of items) {
    const zone = item.ownerZone ?? 'Unzoned';
    if (!zoneMap.has(zone)) zoneMap.set(zone, []);
    zoneMap.get(zone)!.push(item);
  }
  return Array.from(zoneMap.entries()).map(([zone, zoneItems]) => ({
    zone,
    items: topoSortZoneItems(zoneItems)
  }));
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
