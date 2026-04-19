import { useEffect, useState } from "react";

export type JobProgressEvent = {
  event: string;
  progress: number;
  message: string;
  job_id: string;
};

export function useJobProgress(jobId: string | null) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("queued");
  const [message, setMessage] = useState("");
  const [lastEvent, setLastEvent] = useState<JobProgressEvent | null>(null);

  useEffect(() => {
    if (!jobId) {
      setProgress(0);
      setStatus("queued");
      setMessage("");
      setLastEvent(null);
      return;
    }

    const es = new EventSource(`/api/jobs/${jobId}/progress`);

    es.onmessage = (event) => {
      const data = JSON.parse(event.data) as JobProgressEvent;
      setProgress(data.progress);
      setStatus(data.event);
      setMessage(data.message);
      setLastEvent(data);

      if (data.event === "job_completed" || data.event === "job_failed") {
        es.close();
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => es.close();
  }, [jobId]);

  return { progress, status, message, lastEvent };
}
