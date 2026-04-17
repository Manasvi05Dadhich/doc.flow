import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type Screen = "upload" | "dashboard" | "detail" | "export";
type Status = "Processing" | "Completed" | "Failed" | "Queued";
type ExportType = "json" | "csv";

type UploadFile = {
  id: number;
  name: string;
  size: string;
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
  openable?: boolean;
};

type Step = {
  name: string;
  time: string;
  state: "done" | "active" | "idle";
};

const detailSteps: Step[] = [
  { name: "Document received", time: "Waiting for job events", state: "idle" },
  { name: "Parsing started", time: "Waiting for job events", state: "idle" },
  { name: "Parsing completed", time: "Waiting for job events", state: "idle" },
  { name: "Extraction started", time: "Waiting for job events", state: "idle" },
  { name: "Extraction completed", time: "Pending", state: "idle" },
  { name: "Result stored", time: "Pending", state: "idle" },
  { name: "Job completed", time: "Pending", state: "idle" },
];

function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [selectedFilter, setSelectedFilter] = useState<"All" | Status>("All");
  const [selectedExport, setSelectedExport] = useState<ExportType>("json");
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [documents] = useState<DocumentRow[]>([]);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [summary, setSummary] = useState("");

  const stats = useMemo(
    () => ({
      total: documents.length,
      processing: documents.filter((doc) => doc.status === "Processing").length,
      completed: documents.filter((doc) => doc.status === "Completed").length,
      failed: documents.filter((doc) => doc.status === "Failed").length,
    }),
    [documents],
  );

  const visibleDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const matchesFilter = selectedFilter === "All" || doc.status === selectedFilter;
      const matchesSearch = doc.name.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [documents, search, selectedFilter]);

  const removeFile = (id: number) => {
    setUploadFiles((current) => current.filter((file) => file.id !== id));
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
              <span className="topbar-meta">PDF · DOCX · TXT · up to 1 GB</span>
            </div>
            <div className="screen-centered">
              <div className="upload-card">
                <h2>Upload Documents</h2>
                <p>Drop files below or browse. Jobs are processed asynchronously in the background.</p>
                <button className="drop-zone" type="button">
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
                      <div className="empty-state-copy">Hook your uploader here when the backend is ready.</div>
                    </div>
                  ) : (
                    uploadFiles.map((file) => (
                      <div className="file-item" key={file.id}>
                        <div className={`file-icon ${file.type}`}>{file.type.toUpperCase()}</div>
                        <div className="file-meta">
                          <div className="file-name">{file.name}</div>
                          <div className="file-size">{file.size}</div>
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
                <div className="upload-actions">
                  <button className="btn-ghost" type="button">
                    Cancel
                  </button>
                  <button className="btn-primary" type="button" onClick={() => setScreen("dashboard")}>
                    Upload
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
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2v8M5 5l3-3 3 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
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
                  <input
                    type="text"
                    placeholder="Search documents…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                {(["All", "Processing", "Completed", "Failed"] as const).map((filter) => (
                  <button
                    key={filter}
                    className={`filter-btn ${selectedFilter === filter ? "active-filter" : ""}`}
                    type="button"
                    onClick={() => setSelectedFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
                <button className="filter-btn" type="button">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  Sort
                </button>
              </div>
              <div className="doc-table">
                <div className="table-header">
                  <div className="th">Document</div>
                  <div className="th">Type</div>
                  <div className="th">Size</div>
                  <div className="th">Status</div>
                  <div className="th">Actions</div>
                </div>
                {visibleDocuments.length === 0 ? (
                  <div className="table-empty">
                    <div className="empty-state-title">No documents yet</div>
                    <div className="empty-state-copy">Uploaded jobs will appear here once the API is connected.</div>
                  </div>
                ) : (
                  visibleDocuments.map((doc) => (
                    <div
                      className="doc-row"
                      key={doc.id}
                      onClick={() => {
                        if (doc.openable) {
                          setScreen("detail");
                        }
                      }}
                    >
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
                        <button className={`action-btn ${doc.status === "Failed" ? "retry" : ""}`} type="button" onClick={() => setScreen("detail")}>
                          <svg viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4" />
                            <path d="M1.5 8S4 3 8 3s6.5 5 6.5 5-2.5 5-6.5 5S1.5 8 1.5 8z" stroke="currentColor" strokeWidth="1.4" />
                          </svg>
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
          <section className="screen">
            <div className="topbar">
              <div className="topbar-group">
                <button className="back-btn" type="button" onClick={() => setScreen("dashboard")}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Back
                </button>
                <span className="divider">|</span>
                <span className="topbar-title">Document Detail</span>
                <span className="badge queued">Awaiting Data</span>
              </div>
              <div className="topbar-actions">
                <button className="filter-btn" type="button" onClick={() => setScreen("export")}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M8 2v8M5 9l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Export
                </button>
                <button className="btn-primary btn-inline" type="button">
                  Finalize
                </button>
              </div>
            </div>
            <div className="screen-pad">
              <div className="finalize-bar">
                <div className="job-meta">
                  <strong>Job ID:</strong>
                  <span className="job-id"> pending</span>
                  <span className="meta-separator">·</span>
                  <span className="job-submeta">Connect selected document data here</span>
                </div>
                <div className="job-progress-meta">
                  <span className="chip">Stage - / 7</span>
                  <span className="job-percent">0% complete</span>
                </div>
              </div>
              <div className="detail-grid">
                <div className="detail-column">
                  <div className="card">
                    <div className="card-title">Extracted Fields</div>
                    <div className="extracted-fields">
                      <Field label="Title">
                        <input className="field-value" type="text" placeholder="Title will appear here" value={title} onChange={(event) => setTitle(event.target.value)} />
                      </Field>
                      <Field label="Category">
                        <input className="field-value" type="text" placeholder="Category will appear here" value={category} onChange={(event) => setCategory(event.target.value)} />
                      </Field>
                      <Field label="Summary">
                        <textarea className="field-value" rows={3} placeholder="Summary will appear here" value={summary} onChange={(event) => setSummary(event.target.value)} />
                      </Field>
                      <Field label="Keywords">
                        <div className="empty-state inline-empty">
                          <div className="empty-state-copy">No extracted keywords yet.</div>
                        </div>
                      </Field>
                    </div>
                  </div>
                </div>
                <div className="detail-column">
                  <div className="card">
                    <div className="card-title">Processing Progress</div>
                    <div className="overall-progress">
                      <div className="progress-bar-track">
                        <div className="progress-bar-fill" style={{ width: "0%" }} />
                      </div>
                      <div className="progress-label">
                        <span>Waiting for job start</span>
                        <span>0%</span>
                      </div>
                    </div>
                    <div className="progress-steps">
                      {detailSteps.map((step) => (
                        <div className="step-item" key={step.name}>
                          <div className={`step-dot ${step.state}`}>
                            {step.state === "done" && (
                              <svg viewBox="0 0 12 12" fill="none">
                                <path d="M2.5 6L5 8.5 9.5 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                            {step.state === "active" && (
                              <svg viewBox="0 0 12 12" fill="none">
                                <circle cx="6" cy="6" r="2" fill="white" />
                              </svg>
                            )}
                          </div>
                          <div>
                            <div className="step-name">{step.name}</div>
                            <div className={`step-time ${step.state === "idle" ? "pending" : ""}`}>{step.time}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
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
                <div className="export-subheading">Select a format for your finalized document</div>
              </div>
              <div className="export-grid">
                <button className={`export-option ${selectedExport === "json" ? "selected" : ""}`} type="button" onClick={() => setSelectedExport("json")}>
                  <div className="export-icon">{"{ }"}</div>
                  <div className="export-name">JSON</div>
                  <div className="export-desc">Structured data, ideal for APIs and integrations</div>
                </button>
                <button className={`export-option ${selectedExport === "csv" ? "selected" : ""}`} type="button" onClick={() => setSelectedExport("csv")}>
                  <div className="export-icon export-csv-icon">CSV</div>
                  <div className="export-name">CSV</div>
                  <div className="export-desc">Spreadsheet-compatible, rows and columns</div>
                </button>
              </div>
              <div className="card preview-card">
                <div className="card-title">Preview — {selectedExport.toUpperCase()}</div>
                <div className="preview-box">
                  <pre>
                    {selectedExport === "json"
                      ? `{
  "id": "",
  "filename": "",
  "status": "",
  "extracted": {
    "title": "",
    "category": "",
    "keywords": [],
    "summary": ""
  },
  "exported_at": ""
}`
                      : `id,filename,status,title,category,keywords,summary,exported_at`}
                  </pre>
                </div>
              </div>
              <div className="export-actions">
                <button className="btn-ghost btn-inline" type="button" onClick={() => setScreen("detail")}>
                  Cancel
                </button>
                <button className="btn-primary btn-inline" type="button">
                  Download {selectedExport.toUpperCase()}
                </button>
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field-row">
      <div className="field-label">{label}</div>
      {children}
    </div>
  );
}

export default App;
