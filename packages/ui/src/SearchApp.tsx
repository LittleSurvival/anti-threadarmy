"use client";
import { useRef, useState, type FormEvent } from "react";
import type { AccountResult } from "@anti-threadarmy/threads-client";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? "M6 18 18 6M6 6h12v12" : "M5 12h14m-6-6 6 6-6 6"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export function SearchApp({ search }: { search: (username: string) => Promise<AccountResult> }) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<AccountResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    const username = input.trim().replace(/^@/, "");
    if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) { setResult(null); setError("請輸入 1–30 個英文字母、數字、底線或句點。"); return; }
    locked.current = true;
    setInput(username); setBusy(true); setError(""); setResult(null);
    try { setResult(await search(username)); }
    catch (error) { setError(error instanceof Error ? error.message : "查詢失敗，請稍後再試。"); }
    finally { setBusy(false); locked.current = false; }
  }
  const profile = result?.profiles[0];
  return <div className="app-shell">
    <header className="site-header"><a className="brand" href="/" aria-label="anti-threadarmy 首頁"><span className="brand-symbol" aria-hidden="true">@</span><span>anti-threadarmy</span></a></header>
    <main id="main" className="lookup">
      <form onSubmit={submit} className="search-form" aria-label="查詢 Threads 帳號">
        <label className="sr-only" htmlFor="thread-id">Threads ID</label>
        <div className={busy ? "search-field is-loading" : "search-field"}><span className="input-at" aria-hidden="true">@</span><input id="thread-id" value={input} onChange={e => setInput(e.target.value)} placeholder="輸入 Threads ID" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" maxLength={31} readOnly={busy} aria-invalid={!!error} /><button type="submit" disabled={busy || !input.trim()} aria-label={busy ? "查詢中" : "查詢帳號"}>{busy ? <span className="spinner" /> : <Arrow />}</button></div>
      </form>
      <section className="results" aria-label="帳號資料" aria-busy={busy}>
        <span className="sr-only" role="status">{busy ? "查詢中" : error ? "查詢未完成" : result ? "已取得帳號資料" : "等待查詢"}</span>
        {error ? <div className="error-card" role="alert"><span className="error-icon">!</span><div><h3>暫時無法取得資料</h3><p>{error}</p></div></div> : null}
        {result && profile ? <article className="profile-card" aria-live="polite">
          <div className="profile-top"><div className="profile-identity"><h3>{profile.name}</h3><p>@{result.username}<span className="platform-pill">threads</span></p></div><div className="avatar">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = "none"; }} /> : null}<span aria-hidden="true">{profile.name[0]?.toUpperCase()}</span></div></div>
          <dl className="profile-details"><div><dt>使用者名稱</dt><dd>@{result.username}</dd></div><div><dt>資料來源</dt><dd>{profile.platform || "Threads"}</dd></div>{result.contacts.map((contact, i) => <div key={i}><dt>{contact.type === "PHONE" ? "手機號碼" : contact.type === "EMAIL" ? "電子郵件" : "聯絡方式"}</dt><dd>{contact.value}</dd></div>)}</dl>
          <div className="card-bottom"><span className="result-status"><span />已取得資料</span><a href={`https://www.threads.com/@${encodeURIComponent(result.username)}`} target="_blank" rel="noopener noreferrer">在 Threads 查看<Arrow diagonal /></a></div>
        </article> : <div className={busy ? "empty-card loading-card" : "empty-card"}>
          <div className="empty-art" aria-hidden="true"><div className="ghost-avatar">@</div><div className="ghost-lines"><i /><i /></div><span className="ghost-dot" /></div>
        </div>}
      </section>
    </main>
  </div>;
}
