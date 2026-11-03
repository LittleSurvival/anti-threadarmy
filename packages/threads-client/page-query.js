export async function queryThreads(username) {
  // Self-contained: runs inside a fresh Threads page on every platform.
  if (typeof username !== 'string' || !/^[A-Za-z0-9._]{1,30}$/.test(username)) throw new Error('請輸入有效的 Threads ID。');
  if (location.origin !== 'https://www.threads.com') throw new Error('無法載入 Threads 查詢頁面。');
  const operation = 'CAAIGAccountSearchViewQuery';
  let config, query, params, asbd;
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    try {
      const pageRequire = globalThis.require;
      if (typeof pageRequire !== 'function') throw new Error('loading');
      config = pageRequire('RelayAPIConfigDefaults');
      query = pageRequire('CAAIGAccountSearchViewQuery.graphql').params;
      if (String(pageRequire('CurrentUserInitialData').USER_ID) !== '0') throw new Error('SIGNED_IN');
      asbd = pageRequire('BDHeaderConfig').ASBD_ID;
      params = pageRequire('getAsyncParams')('POST');
      break;
    } catch (error) {
      if (error.message === 'SIGNED_IN') throw new Error('查詢環境已登入帳號，已停止操作。請使用未登入的獨立環境。');
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  if (!params || !query || query.name !== operation || query.operationKind !== 'query' || !query.id) throw new Error('Threads 頁面未就緒或需要驗證，請稍後重試。');
  const csrf = document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith('csrftoken='))?.slice(10);
  if (!csrf || !params.lsd || !params.__s) throw new Error('未取得完整的查詢參數，請稍後重試。');
  Object.assign(params, {
    av: config.actorID, fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: operation,
    server_timestamps: 'true', doc_id: query.id,
    variables: JSON.stringify({params: {
      account_recovery_entry_point: null, event_request_id: crypto.randomUUID(), is_threads: true,
      next_uri: '', search_query: username, waterfall_id: crypto.randomUUID(),
    }}),
  });
  if (params.qpl_active_flow_ids) params.fb_api_analytics_tags = JSON.stringify(['qpl_active_flow_ids=' + params.qpl_active_flow_ids]);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('/api/graphql', {
      method: 'POST', credentials: 'same-origin', signal: controller.signal,
      headers: {
        'content-type': 'application/x-www-form-urlencoded', 'x-asbd-id': String(asbd),
        'x-csrftoken': decodeURIComponent(csrf), 'x-fb-friendly-name': operation,
        'x-fb-lsd': params.lsd, 'x-ig-app-id': config.customHeaders['X-IG-App-ID'],
        'x-web-session-id': params.__s,
      },
      body: new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    if (!response.ok) throw new Error('Threads 暫時無法回應，請稍後重試。');
    let parsed;
    try { parsed = JSON.parse((await response.text()).replace(/^for\s*\(;;\);/, '').trim()); }
    catch { throw new Error('Threads 回傳了無法辨識的內容。'); }
    if (parsed.error || parsed.errors?.length) throw new Error('Threads 拒絕了這次查詢，請稍後重試。');
    const data = parsed.data?.caa_ar_ig_account_search;
    if (!data) throw new Error('未取得可辨識的帳號資料。');
    if (data.recaptcha_required) throw new Error('Threads 要求驗證，這次查詢已停止。');
    if (data.error_content) throw new Error('Threads 無法完成這次查詢，請確認 ID 或稍後重試。');
    const profiles = (data.profiles ?? []).map(p => ({
      name: String(p.name ?? username), platform: String(p.platform ?? ''),
      avatarUrl: typeof p.profile_pic_url === 'string' && p.profile_pic_url.startsWith('https://') ? p.profile_pic_url : null,
    }));
    if (!profiles.length) throw new Error('這次沒有取得帳號資料，請確認 ID 後再試。');
    // Display fields only. Never return cookies, cipher, cuid or raw responses.
    return {
      username, profiles,
      contacts: (data.contact_points ?? []).filter(c => typeof c.contact_point === 'string' && /[*•…]/.test(c.contact_point)).map(c => ({type: String(c.type ?? ''), value: c.contact_point})),
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('查詢逾時，請稍後再試。');
    throw error;
  } finally { clearTimeout(timeout); }
}
