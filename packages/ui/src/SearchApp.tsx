"use client";
import { useRef, useState, type FormEvent } from "react";
import type { AccountResult, ErrorReport } from "@anti-threadarmy/threads-client";
import {
  contactDetails,
  createErrorReport,
  parseThreadsInput,
} from "@anti-threadarmy/threads-client";
import { ErrorReportDialog } from "./ErrorReportDialog";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={diagonal ? "M6 18 18 6M6 6h12v12" : "M5 12h14m-6-6 6 6-6 6"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function AccountCard({ result }: { result: AccountResult }) {
  const profile = result.profiles[0];
  if (!profile) return null;
  const { phoneRegions, possiblePhoneRegions, providers, possibleProviders } = contactDetails(
    result.contacts,
  );
  return (
    <article className="profile-card" aria-live="polite">
      <div className="profile-top">
        <div className="profile-identity">
          <h3>{profile.name}</h3>
          <p>
            @{result.username}
            <span className="platform-pill">threads</span>
          </p>
        </div>
        <div className="avatar">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : null}
          <span aria-hidden="true">{profile.name[0]?.toUpperCase()}</span>
        </div>
      </div>
      <dl className="profile-details">
        <div>
          <dt>使用者名稱</dt>
          <dd>@{result.username}</dd>
        </div>
        <div>
          <dt>資料來源</dt>
          <dd>{profile.platform || "Threads"}</dd>
        </div>
        {result.contacts.map((contact, i) => (
          <div key={i}>
            <dt>
              {contact.type === "PHONE"
                ? "手機號碼"
                : contact.type === "EMAIL"
                  ? "電子郵件"
                  : "聯絡方式"}
            </dt>
            <dd>{contact.value}</dd>
          </div>
        ))}
      </dl>
      {phoneRegions.length > 0 ||
      possiblePhoneRegions.length > 0 ||
      providers.length > 0 ||
      possibleProviders.length > 0 ? (
        <dl className="profile-details" aria-label="聯絡資訊">
          {phoneRegions.length > 0 ? (
            <div>
              <dt>電話地區</dt>
              <dd>{phoneRegions.join("／")}</dd>
            </div>
          ) : null}
          {possiblePhoneRegions.length > 0 ? (
            <div>
              <dt>可能的電話地區</dt>
              <dd>{possiblePhoneRegions.join("／")}</dd>
            </div>
          ) : null}
          {providers.length > 0 ? (
            <div>
              <dt>電子郵件服務</dt>
              <dd>{providers.join("／")}</dd>
            </div>
          ) : null}
          {possibleProviders.length > 0 ? (
            <div>
              <dt>可能的郵件服務</dt>
              <dd>{possibleProviders.join("／")}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <div className="card-bottom">
        <span className="result-status">
          <span />
          已取得資料
        </span>
        <a
          href={`https://www.threads.com/@${encodeURIComponent(result.username)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          在 Threads 查看
          <Arrow diagonal />
        </a>
      </div>
    </article>
  );
}

export function LookupError({ error, report }: { error: string; report?: ErrorReport }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="error-card" role="alert">
        <span className="error-icon">!</span>
        <div>
          <h3>暫時無法取得資料</h3>
          <p>{error}</p>
          <button type="button" className="report-link" onClick={() => setOpen(true)}>
            查看錯誤報告
          </button>
        </div>
      </div>
      {open ? (
        <ErrorReportDialog
          report={report ?? createErrorReport(new Error(error))}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function SearchApp({
  search,
  autoFocus = false,
}: {
  search: (username: string) => Promise<AccountResult>;
  autoFocus?: boolean;
}) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<AccountResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ErrorReport>();
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    let username: string;
    try {
      const target = parseThreadsInput(input);
      username = target.username ?? target.shareUrl;
    } catch (failure) {
      setResult(null);
      setError("請輸入有效的 Threads ID 或 Threads 連結。");
      setReport(createErrorReport(failure, { stage: "validate-input", context: { input } }));
      return;
    }
    locked.current = true;
    setInput(username);
    setBusy(true);
    setError("");
    setReport(undefined);
    setResult(null);
    try {
      setResult(await search(username));
    } catch (error) {
      setError(error instanceof Error ? error.message : "查詢失敗，請稍後再試。");
      setReport(createErrorReport(error, { context: { input: username } }));
    } finally {
      setBusy(false);
      locked.current = false;
    }
  }
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="anti-threadarmy 首頁">
          <span className="brand-symbol" aria-hidden="true">
            @
          </span>
          <span>anti-threadarmy</span>
        </a>
      </header>
      <main id="main" className="lookup">
        <form onSubmit={submit} className="search-form" aria-label="查詢 Threads 帳號">
          <label className="sr-only" htmlFor="thread-id">
            Threads ID 或連結
          </label>
          <div className={busy ? "search-field is-loading" : "search-field"}>
            <span className="input-at" aria-hidden="true">
              @
            </span>
            <input
              id="thread-id"
              ref={inputRef}
              autoFocus={autoFocus}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="輸入 Threads ID 或貼上連結"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              maxLength={2048}
              readOnly={busy}
              aria-invalid={!!error}
            />
            {input.length > 0 ? (
              <button
                type="button"
                className="clear-input"
                aria-label="清除輸入"
                title="清除輸入"
                disabled={busy}
                onClick={() => {
                  setInput("");
                  inputRef.current?.focus();
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="m7 7 10 10M17 7 7 17"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : null}
            <button
              type="submit"
              className="search-submit"
              disabled={busy || !input.trim()}
              aria-label={busy ? "查詢中" : "查詢帳號"}
            >
              {busy ? <span className="spinner" /> : <Arrow />}
            </button>
          </div>
        </form>
        <section className="results" aria-label="帳號資料" aria-busy={busy}>
          <span className="sr-only" role="status">
            {busy ? "查詢中" : error ? "查詢未完成" : result ? "已取得帳號資料" : "等待查詢"}
          </span>
          {error ? <LookupError error={error} report={report} /> : null}
          {result?.profiles.length ? (
            <AccountCard result={result} />
          ) : (
            <div className={busy ? "empty-card loading-card" : "empty-card"}>
              <div className="empty-art" aria-hidden="true">
                <div className="ghost-avatar">@</div>
                <div className="ghost-lines">
                  <i />
                  <i />
                </div>
                <span className="ghost-dot" />
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
