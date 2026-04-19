import { useEffect, useState } from "react";

type DetailStatus = "queued" | "processing" | "completed" | "failed";

export type JobDetailData = {
  id: string;
  status: string;
  progress: number;
  current_stage: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  document: {
    id: string;
    filename: string;
    file_type: string;
    file_size: number;
    created_at: string;
  } | null;
  result: {
    id: string;
    title: string | null;
    category: string | null;
    summary: string | null;
    keywords: string[];
    raw_output: Record<string, unknown>;
    reviewed_json: Record<string, unknown>;
    is_finalized: boolean;
    finalized_at: string | null;
  } | null;
};

type ReviewForm = {
  title: string;
  category: string;
  summary: string;
  keywords: string;
};

type Props = {
  job: JobDetailData | null;
  loading: boolean;
  error: string | null;
  progress: number;
  statusEvent: string;
  message: string;
  onBack: () => void;
  onExport: () => void;
  onRefresh: () => Promise<void>;
};

const stepSequence = [
  { key: "job_started", label: "Job started" },
  { key: "parsing_started", label: "Parsing started" },
  { key: "parsing_completed", label: "Parsing completed" },
  { key: "extraction_started", label: "Extraction started" },
  { key: "extraction_completed", label: "Extraction completed" },
  { key: "storing_result", label: "Storing result" },
  { key: "job_completed", label: "Job completed" },
];

export function JobDetail({
  job,
  loading,
  error,
  progress,
  statusEvent,
  message,
  onBack,
  onExport,
  onRefresh,
}: Props) {
  const [form, setForm] = useState<ReviewForm>({
    title: "",
    category: "",
    summary: "",
    keywords: "",
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!job) {
      return;
    }

    const reviewed = job.result?.reviewed_json ?? {};
    const raw = job.result?.raw_output ?? {};
    setForm({
      title: coerceString(reviewed.title ?? raw.title ?? job.result?.title),
      category: coerceString(reviewed.category ?? raw.category ?? job.result?.category),
      summary: coerceString(reviewed.summary ?? raw.summary ?? job.result?.summary),
      keywords: coerceKeywords(reviewed.keywords ?? raw.keywords ?? job.result?.keywords ?? []),
    });
    setSaveError(null);
  }, [job]);

  if (loading) {
    return (
      <section className="screen">
        <div className="topbar">
          <span className="topbar-title">Document Detail</span>
        </div>
        <div className="screen-pad">
          <div className="empty-state">
            <div className="empty-state-title">Loading job detail</div>
            <div className="empty-state-copy">Pulling document, job, and review data from the backend.</div>
          </div>
        </div>
      </section>
    );
  }

  if (!job) {
    return (
      <section className="screen">
        <div className="topbar">
          <span className="topbar-title">Document Detail</span>
        </div>
        <div className="screen-pad">
          <div className="empty-state">
            <div className="empty-state-title">No job selected</div>
            <div className="empty-state-copy">Open a document from the dashboard or upload a new file to see its detail page.</div>
          </div>
        </div>
      </section>
    );
  }

  const isFinalized = Boolean(job.result?.is_finalized);
  const statusBadge = normalizeBadgeStatus(job.status, statusEvent);
  const steps = buildSteps(statusEvent, job.status);
  const canRetry = job.status === "failed" && job.retry_count < 3;

  const saveReview = async () => {
    try {
      setSaving(true);
      setSaveError(null);
      const response = await fetch(`/api/jobs/${job.id}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          category: form.category,
          summary: form.summary,
          keywords: parseKeywords(form.keywords),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to save review");
      }

      await onRefresh();
    } catch (reviewError) {
      setSaveError(reviewError instanceof Error ? reviewError.message : "Failed to save review");
    } finally {
      setSaving(false);
    }
  };

  const finalize = async () => {
    try {
      setFinalizing(true);
      setSaveError(null);
      const response = await fetch(`/api/jobs/${job.id}/finalize`, {
        method: "PATCH",
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to finalize result");
      }
      await onRefresh();
    } catch (finalizeError) {
      setSaveError(finalizeError instanceof Error ? finalizeError.message : "Failed to finalize result");
    } finally {
      setFinalizing(false);
    }
  };

  const retry = async () => {
    try {
      setRetrying(true);
      setSaveError(null);
      const response = await fetch(`/api/jobs/${job.id}/retry`, {
        method: "POST",
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to retry job");
      }
      await onRefresh();
    } catch (retryError) {
      setSaveError(retryError instanceof Error ? retryError.message : "Failed to retry job");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <section className="screen">
      <div className="topbar">
        <div className="topbar-group">
          <button className="back-btn" type="button" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
          <span className="divider">|</span>
          <span className="topbar-title">{job.document?.filename ?? "Document Detail"}</span>
          <span className={`badge ${statusBadge}`}>{job.status}</span>
        </div>
        <div className="topbar-actions">
          <button className="filter-btn" type="button" onClick={onExport}>
            Export
          </button>
          {canRetry && (
            <button className="filter-btn retry-inline" type="button" onClick={retry} disabled={retrying}>
              {retrying ? "Retrying..." : `Retry (${3 - job.retry_count} left)`}
            </button>
          )}
          <button className="btn-primary btn-inline" type="button" onClick={finalize} disabled={isFinalized || finalizing || saving}>
            {isFinalized ? "Finalized" : finalizing ? "Finalizing..." : "Finalize"}
          </button>
        </div>
      </div>
      <div className="screen-pad">
        <div className="finalize-bar">
          <div className="job-meta">
            <strong>Job ID:</strong>
            <span className="job-id">{job.id}</span>
            <span className="meta-separator">·</span>
            <span className="job-submeta">
              {job.document?.file_type?.toUpperCase()} · {formatSize(job.document?.file_size ?? 0)} · Uploaded {new Date(job.created_at).toLocaleString()}
            </span>
          </div>
          <div className="job-progress-meta">
            <span className="chip">{isFinalized ? "Read only" : "Editable review"}</span>
            <span className="job-percent">{progress}% complete</span>
          </div>
        </div>
        {(error || saveError) && <div className="error-banner">{error ?? saveError}</div>}
        {job.status === "failed" && job.error_message && <div className="error-banner">{job.error_message}</div>}
        {isFinalized && job.result?.finalized_at && (
          <div className="success-banner">Finalized at {new Date(job.result.finalized_at).toLocaleString()}</div>
        )}
        <div className="detail-grid">
          <div className="detail-column">
            <div className="card">
              <div className="card-title">Reviewed Fields</div>
              <div className="extracted-fields">
                <Field label="Title">
                  <input
                    className="field-value"
                    type="text"
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    readOnly={isFinalized}
                  />
                </Field>
                <Field label="Category">
                  <input
                    className="field-value"
                    type="text"
                    value={form.category}
                    onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                    readOnly={isFinalized}
                  />
                </Field>
                <Field label="Summary">
                  <textarea
                    className="field-value"
                    rows={5}
                    value={form.summary}
                    onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
                    readOnly={isFinalized}
                  />
                </Field>
                <Field label="Keywords">
                  <input
                    className="field-value"
                    type="text"
                    value={form.keywords}
                    onChange={(event) => setForm((current) => ({ ...current, keywords: event.target.value }))}
                    readOnly={isFinalized}
                    placeholder="keyword one, keyword two"
                  />
                </Field>
                <div className="detail-actions">
                  <button className="btn-ghost btn-inline" type="button" onClick={onRefresh}>
                    Refresh
                  </button>
                  <button className="btn-primary btn-inline" type="button" onClick={saveReview} disabled={isFinalized || saving}>
                    {saving ? "Saving..." : "Save Review"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="detail-column">
            <div className="card">
              <div className="card-title">Processing Progress</div>
              <div className="overall-progress">
                <div className="progress-bar-track">
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="progress-label">
                  <span>{message || job.current_stage || "Waiting for updates"}</span>
                  <span>{progress}%</span>
                </div>
              </div>
              <div className="progress-steps">
                {steps.map((step) => (
                  <div className="step-item" key={step.label}>
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
                      <div className="step-name">{step.label}</div>
                      <div className={`step-time ${step.state === "idle" ? "pending" : ""}`}>
                        {step.key === statusEvent ? "Current stage" : step.state === "done" ? "Completed" : "Pending"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-title">Extracted JSON</div>
              <div className="preview-box detail-preview-box">
                <pre>{JSON.stringify(job.result?.reviewed_json || job.result?.raw_output || {}, null, 2)}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field-row">
      <div className="field-label">{label}</div>
      {children}
    </div>
  );
}

function coerceString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function coerceKeywords(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").join(", ");
  }
  return "";
}

function parseKeywords(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeBadgeStatus(jobStatus: string, statusEvent: string): DetailStatus {
  if (jobStatus === "failed" || statusEvent === "job_failed") {
    return "failed";
  }
  if (jobStatus === "completed" || statusEvent === "job_completed") {
    return "completed";
  }
  if (jobStatus === "processing") {
    return "processing";
  }
  return "queued";
}

function buildSteps(statusEvent: string, jobStatus: string) {
  const activeKey = jobStatus === "completed" ? "job_completed" : statusEvent || "job_started";
  const activeIndex = stepSequence.findIndex((step) => step.key === activeKey);

  return stepSequence.map((step, index) => ({
    ...step,
    state:
      activeIndex === -1
        ? "idle"
        : index < activeIndex
          ? "done"
          : index === activeIndex
            ? step.key === "job_completed" && jobStatus === "completed"
              ? "done"
              : "active"
            : "idle",
  }));
}

function formatSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${size} B`;
}
