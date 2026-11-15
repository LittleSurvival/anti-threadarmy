"use client";
import { useEffect, useRef, useState } from "react";
import type { ErrorReport } from "@anti-threadarmy/threads-client";

export function ErrorReportDialog({
  report,
  onClose,
}: {
  report: ErrorReport;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const text = JSON.stringify(report, null, 2);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("已複製");
    } catch {
      setCopyStatus("無法複製，請選取內容或下載報告。");
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `anti-threadarmy-error-${report.timestamp.replace(/[^0-9TZ]/g, "-")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <dialog
      ref={dialog}
      className="error-report-dialog"
      aria-labelledby="error-report-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <header>
        <h2 id="error-report-title">錯誤報告</h2>
        <button type="button" onClick={onClose} aria-label="關閉錯誤報告">
          ×
        </button>
      </header>
      <p className="report-problem">{report.message}</p>
      <dl>
        <div>
          <dt>發生時間</dt>
          <dd>{report.timestamp}</dd>
        </div>
        <div>
          <dt>錯誤階段</dt>
          <dd>{report.stage}</dd>
        </div>
        {report.response ? (
          <div>
            <dt>HTTP 狀態</dt>
            <dd>
              {report.response.status ?? "未取得"} {report.response.statusText}
            </dd>
          </div>
        ) : null}
      </dl>
      {!report.response ? <p>此階段未取得 HTTP response。</p> : null}
      <pre tabIndex={0} aria-label="錯誤報告詳細內容">
        {text}
      </pre>
      <footer>
        <button type="button" onClick={copy}>
          複製報告
        </button>
        <button type="button" onClick={download}>
          下載 JSON
        </button>
        <span role="status">{copyStatus}</span>
      </footer>
    </dialog>
  );
}
