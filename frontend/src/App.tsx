import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { JobDetail, type JobDetailData } from "./components/JobDetail";
import { useJobProgress } from "./hooks/useJobProgress";

type Screen = "upload" | "dashboard" | "detail" | "export";
type Status = "Processing" | "Completed" | "Failed" | "Queued";
type ExportType = "json" | "csv";

type UploadFile = {
  id: number;
  name: string;
  size: number;
  type: "pdf" | "doc" | "txt";
  progress: number;
};

type DocumentRow = {
  id: string;
  name: string;
  uploadedAt: string;
  type: string;
  size: string;
  status: Status;
};

type JobListApiItem = {
  id: string;
  status: string;
  progress: number;
  current_stage: string | null;
  retry_count: number;
  created_at: string;
  document: {
    id: string;
    filename: string;
    file_type: string;
    file_size: number;
  } | null;
};

function App() {
  const [screen, setScreen] = useState<Screen>("upload");
  const [selectedFilter, setSelectedFilter] = useState<"All" | Status>("All");
  const [selectedExport, setSelectedExport] = useState<ExportType>("json");
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [search, setSearch] = useState("");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobDetailData | null>(null);
  const [sortKey, setSortKey] = useState<"uploaded_at" | "filename" | "status" | "size" | "type">("uploaded_at");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { progress, status, message } = useJobProgress(activeJobId);

  const stats = useMemo(
    () => ({
      total: documents.length,
      processing: documents.filter((doc) => doc.status === "Processing").length,
      completed: documents.filter((doc) => doc.status === "Completed").length,
      failed: documents.filter((doc) => doc.status === "Failed").length,
    }),
    [documents],
  );

  const loadJobs = async (signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (selectedFilter !== "All") {
      params.set("status", selectedFilter.toLowerCase());
    }
    if (search.trim()) {
      params.set("search", search.trim());
    }
    params.set("sort", sortKey);

    const response = await fetch(`/api/jobs?${params.toString()}`, { signal });
    if (!response.ok) {
      throw new Error("Failed to load jobs");
    }

    const data = (await response.json()) as JobListApiItem[];
    setDocuments(data.map(mapJobToDocumentRow));
    setDashboardError(null);
  };

  const loadJobDetail = async (jobId: string, signal?: AbortSignal) => {
    const response = await fetch(`/api/jobs/${jobId}`, { signal });
    if (!response.ok) {
      throw new Error("Failed to load job detail");
    }

    const detail = (await response.json()) as JobDetailData;
    setSelectedJob(detail);
    setDetailError(null);
    return detail;
  };

  useEffect(() => {
    const controller = new AbortController();

    void loadJobs(controller.signal).catch((error) => {
      if (!controller.signal.aborted) {
        setDashboardError(error instanceof Error ? error.message : "Failed to load jobs");
      }
    });

    return () => controller.abort();
  }, [search, selectedFilter, sortKey]);

  useEffect(() => {
    if (!activeJobId) {
      setSelectedJob(null);
      return;
    }

    const controller = new AbortController();
    setDetailLoading(true);

    void loadJobDetail(activeJobId, controller.signal)
      .catch((error) => {
        if (!controller.signal.aborted) {
          setDetailError(error instanceof Error ? error.message : "Failed to load job detail");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      });

    return () => controller.abort();
  }, [activeJobId]);

  useEffect(() => {
    if (!activeJobId) {
      return;
    }
    setUploadFiles((current) => current.map((file) => ({ ...file, progress })));
  }, [activeJobId, progress]);

  useEffect(() => {
    if (!activeJobId) {
      return;
    }
    if (status === "job_completed" || status === "job_failed") {
      setScreen("detail");
      void loadJobs().catch(() => undefined);
      void loadJobDetail(activeJobId).catch(() => undefined);
    }
  }, [activeJobId, status]);

  const removeFile = (id: number) => {
    setUploadFiles((current) => current.filter((file) => file.id !== id));
  };

  const onBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const onSelectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "txt";
    const type: UploadFile["type"] = extension === "pdf" ? "pdf" : extension === "docx" ? "doc" : "txt";

    setUploadFiles([
      {
        id: Date.now(),
        name: file.name,
        size: file.size,
        type,
        progress: 0,
      },
    ]);
    setUploadError(null);
  };

  const uploadSelectedFile = async () => {
    const selected = fileInputRef.current?.files?.[0];
    if (!selected) {
      setUploadError("Choose a file before uploading.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selected);

    try {
      setIsUploading(true);
      setUploadError(null);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Upload failed");
      }

      const data = (await response.json()) as { job_id: string };
      setActiveJobId(data.job_id);
      setUploadFiles((current) => current.map((file) => ({ ...file, progress: 5 })));
      setScreen("dashboard");
      await loadJobs();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const openJob = (jobId: string) => {
    setActiveJobId(jobId);
    setScreen("detail");
  };

  const refreshActiveJob = async () => {
    if (!activeJobId) {
      return;
    }
    await loadJobDetail(activeJobId);
    await loadJobs();
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="7" rx="1.5" fill="white" opacity="0.9" />
              <rect x="9" y="2" width="5" height="4" rx="1.5" fill="white" opacity="0.6" />
              <rect x="2" y="11" width="12" height="3" rx="1.5" fill="white" opacity="0.7" />
              <rect x="9" y="8" width="5" height="3" rx="1.5" fill="white" opacity="0.5" />
            </svg>
          </div>
          <span className="logo-text">DocFlow</span>
        </div>

        <NavButton active={screen === "upload"} onClick={() => setScreen("upload")} label="Upload">
          <path d="M8 2v8M5 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </NavButton>
        <NavButton active={screen === "dashboard"} onClick={() => setScreen("dashboard")} label="Dashboard">
          <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </NavButton>
        <div className="nav-section">Workspace</div>
        <NavButton active={screen === "detail"} onClick={() => setScreen("detail")} label="Doc Detail">
          <path d="M3 2h7l4 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M10 2v4h4M5 9h6M5 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </NavButton>
        <NavButton active={screen === "export"} onClick={() => setScreen("export")} label="Export">
          <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M8 2v8M5 9l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </NavButton>

        <div className="sidebar-spacer" />
        <div className="profile-row">
          <div className="avatar">AJ</div>
          <span className="profile-name">Alex J.</span>
        </div>
      </aside>

      <main className="main">
        {screen === "upload" && (
          <section className="screen">
            <div className="topbar">
              <span className="topbar-title">Upload Documents</span>
              <span className="topbar-meta">PDF · DOCX · TXT · up to 10 MB</span>
            </div>
            <div className="screen-centered">
              <div className="upload-card">
                <h2>Upload Documents</h2>
                <p>Choose a file and start a real background job. Progress comes from Redis pub/sub over SSE.</p>
                <input ref={fileInputRef} className="hidden-input" type="file" accept=".pdf,.docx,.txt" onChange={onSelectFile} />
                <button className="drop-zone" type="button" onClick={onBrowseClick}>
                  <div className="drop-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M12 4v12M8 8l4-4 4 4" stroke="#4FA8E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" stroke="#4FA8E8" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="drop-text">Drop files here or click to browse</div>
                  <div className="drop-sub">Supports PDF, DOCX, TXT</div>
                </button>
                <div className="file-list">
                  {uploadFiles.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-title">No files selected</div>
                      <div className="empty-state-copy">Choose a file to create a processing job.</div>
                    </div>
                  ) : (
                    uploadFiles.map((file) => (
                      <div className="file-item" key={file.id}>
                        <div className={`file-icon ${file.type}`}>{file.type.toUpperCase()}</div>
                        <div className="file-meta">
                          <div className="file-name">{file.name}</div>
                          <div className="file-size">{formatSize(file.size)}</div>
                          <div className="file-progress">
                            <div className="file-progress-bar" style={{ width: `${file.progress}%` }} />
                          </div>
                        </div>
                        <button className="file-remove" type="button" onClick={() => removeFile(file.id)}>
                          x
                        </button>
                      </div>
                    ))
                  )}
                </div>
                {activeJobId && (
                  <div className="upload-status-card">
                    <div className="upload-status-row">
                      <span className="chip">Job {activeJobId.slice(0, 8)}</span>
                      <span className="upload-status-text">{status.split("_").join(" ")}</span>
                    </div>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="progress-label">
                      <span>{message || "Waiting for worker events"}</span>
                      <span>{progress}%</span>
                    </div>
                  </div>
                )}
                {uploadError && <div className="error-banner">{uploadError}</div>}
                <div className="upload-actions">
                  <button className="btn-ghost" type="button" onClick={() => setUploadFiles([])}>
                    Clear
                  </button>
                  <button className="btn-primary" type="button" onClick={uploadSelectedFile} disabled={isUploading || uploadFiles.length === 0}>
                    {isUploading ? "Uploading..." : "Upload"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {screen === "dashboard" && (
          <section className="screen">
            <div className="topbar">
              <span className="topbar-title">All Documents</span>
              <button className="upload-btn-glass" type="button" onClick={() => setScreen("upload")}>
                Upload
              </button>
            </div>
            <div className="screen-pad">
              <div className="stats-row">
                <StatCard label="Total" value={stats.total} />
                <StatCard label="Processing" value={stats.processing} tone="blue" />
                <StatCard label="Completed" value={stats.completed} tone="green" />
                <StatCard label="Failed" value={stats.failed} tone="red" />
              </div>
              <div className="toolbar">
                <div className="search-box">
                  <svg viewBox="0 0 16 16" fill="none">
                    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <input type="text" placeholder="Search documents..." value={search} onChange={(event) => setSearch(event.target.value)} />
                </div>
                <select className="filter-select" value={selectedFilter} onChange={(event) => setSelectedFilter(event.target.value as "All" | Status)}>
                  <option value="All">All</option>
                  <option value="Processing">Processing</option>
                  <option value="Completed">Completed</option>
                  <option value="Failed">Failed</option>
                  <option value="Queued">Queued</option>
                </select>
              </div>
              {dashboardError && <div className="error-banner">{dashboardError}</div>}
              <div className="doc-table">
                <div className="table-header">
                  <button className="th th-button" type="button" onClick={() => setSortKey("filename")}>Document</button>
                  <button className="th th-button" type="button" onClick={() => setSortKey("type")}>Type</button>
                  <button className="th th-button" type="button" onClick={() => setSortKey("size")}>Size</button>
                  <button className="th th-button" type="button" onClick={() => setSortKey("status")}>Status</button>
                  <div className="th">Actions</div>
                </div>
                {documents.length === 0 ? (
                  <div className="table-empty">
                    <div className="empty-state-title">No documents found</div>
                    <div className="empty-state-copy">Upload a file or adjust your filters to see jobs here.</div>
                  </div>
                ) : (
                  documents.map((doc) => (
                    <div className="doc-row" key={doc.id} onClick={() => openJob(doc.id)}>
                      <div>
                        <div className="doc-name">
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M3 2h7l4 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                          </svg>
                          {doc.name}
                        </div>
                        <div className="doc-name-sub">{doc.uploadedAt}</div>
                      </div>
                      <div className="doc-cell">{doc.type}</div>
                      <div className="doc-cell">{doc.size}</div>
                      <div>
                        <span className={`badge ${doc.status.toLowerCase()}`}>{doc.status}</span>
                      </div>
                      <div className="row-action" onClick={(event) => event.stopPropagation()}>
                        <button className="action-btn" type="button" onClick={() => openJob(doc.id)}>
                          Open
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        {screen === "detail" && (
          <JobDetail
            job={selectedJob}
            loading={detailLoading}
            error={detailError}
            progress={selectedJob?.status === "completed" ? 100 : progress}
            statusEvent={status}
            message={message}
            onBack={() => setScreen("dashboard")}
            onExport={() => setScreen("export")}
            onRefresh={refreshActiveJob}
          />
        )}

        {screen === "export" && (
          <section className="screen">
            <div className="topbar">
              <div className="topbar-group">
                <button className="back-btn" type="button" onClick={() => setScreen("detail")}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Back
                </button>
                <span className="divider">|</span>
                <span className="topbar-title">Export Results</span>
              </div>
            </div>
            <div className="export-shell">
              <div className="export-copy">
                <div className="export-heading">Choose export format</div>
                <div className="export-subheading">Pick a finalized record export format.</div>
              </div>
              <div className="export-grid">
                <button className={`export-option ${selectedExport === "json" ? "selected" : ""}`} type="button" onClick={() => setSelectedExport("json")}>
                  <div className="export-icon">{"{ }"}</div>
                  <div className="export-name">JSON</div>
                  <div className="export-desc">Structured data for APIs and integrations.</div>
                </button>
                <button className={`export-option ${selectedExport === "csv" ? "selected" : ""}`} type="button" onClick={() => setSelectedExport("csv")}>
                  <div className="export-icon export-csv-icon">CSV</div>
                  <div className="export-name">CSV</div>
                  <div className="export-desc">Spreadsheet-friendly tabular export.</div>
                </button>
              </div>
              <div className="card preview-card">
                <div className="card-title">Preview — {selectedExport.toUpperCase()}</div>
                <div className="preview-box">
                  <pre>
                    {selectedExport === "json"
                      ? JSON.stringify(
                          {
                            job_id: selectedJob?.id ?? "",
                            document: selectedJob?.document?.filename ?? "",
                            reviewed_json: selectedJob?.result?.reviewed_json ?? selectedJob?.result?.raw_output ?? {},
                            is_finalized: selectedJob?.result?.is_finalized ?? false,
                          },
                          null,
                          2,
                        )
                      : `job_id,filename,is_finalized,title,category,summary\n${selectedJob?.id ?? ""},${selectedJob?.document?.filename ?? ""},${selectedJob?.result?.is_finalized ?? false},${stringifyCsvField(getReviewedValue(selectedJob, "title"))},${stringifyCsvField(getReviewedValue(selectedJob, "category"))},${stringifyCsvField(getReviewedValue(selectedJob, "summary"))}`}
                  </pre>
                </div>
              </div>
              <div className="export-actions">
                <button className="btn-ghost btn-inline" type="button" onClick={() => setScreen("detail")}>
                  Cancel
                </button>
                <a
                  className={`btn-primary btn-inline export-link ${!activeJobId ? "disabled-link" : ""}`}
                  href={activeJobId ? `/api/jobs/${activeJobId}/export?format=${selectedExport}` : undefined}
                >
                  Download {selectedExport.toUpperCase()}
                </a>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function NavButton({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} type="button" onClick={onClick}>
      <svg viewBox="0 0 16 16" fill="none">
        {children}
      </svg>
      {label}
    </button>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "blue" | "green" | "red" }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-val ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

function mapJobToDocumentRow(job: JobListApiItem): DocumentRow {
  return {
    id: job.id,
    name: job.document?.filename ?? "Unknown file",
    uploadedAt: new Date(job.created_at).toLocaleString(),
    type: (job.document?.file_type ?? "unknown").toUpperCase(),
    size: job.document ? formatSize(job.document.file_size) : "0 B",
    status: normalizeStatus(job.status),
  };
}

function normalizeStatus(status: string): Status {
  const lower = status.toLowerCase();
  if (lower === "completed") return "Completed";
  if (lower === "failed") return "Failed";
  if (lower === "processing") return "Processing";
  return "Queued";
}

function formatSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function getReviewedValue(job: JobDetailData | null, key: "title" | "category" | "summary") {
  const reviewed = job?.result?.reviewed_json ?? {};
  const raw = job?.result?.raw_output ?? {};
  const value = reviewed[key] ?? raw[key];
  return typeof value === "string" ? value : "";
}

function stringifyCsvField(value: string) {
  return `"${value.split('"').join('""')}"`;
}

export default App;
