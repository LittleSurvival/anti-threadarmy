import {
  createErrorReport,
  queryThreads,
  resolveThreadsInput,
} from "@anti-threadarmy/threads-client";

// Bundled as a standalone MAIN-world content script. Never run in a normal tab.
if (
  window.parent !== window &&
  (window as Window & { credentialless?: boolean }).credentialless === true
) {
  const receive = async (event: MessageEvent) => {
    if (
      event.source !== window.parent ||
      !/^chrome-extension:\/\/[a-p]{32}$/.test(event.origin) ||
      event.data?.type !== "anti-threadarmy:query" ||
      typeof event.data.requestId !== "string"
    )
      return;
    window.removeEventListener("message", receive);
    const { requestId, target } = event.data;
    try {
      const username = await resolveThreadsInput(target);
      const result = await queryThreads(username);
      window.parent.postMessage(
        { type: "anti-threadarmy:query-result", requestId, ok: true, result },
        event.origin,
      );
    } catch (error) {
      window.parent.postMessage(
        {
          type: "anti-threadarmy:query-result",
          requestId,
          ok: false,
          error: error instanceof Error ? error.message : "查詢失敗。",
          report: createErrorReport(error, {
            stage: "resolve-input",
            context: { target, pageUrl: location.href },
          }),
        },
        event.origin,
      );
    }
  };
  window.addEventListener("message", receive);
}
