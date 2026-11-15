(() => {
  const postSelector = "[data-pressable-container][data-interactive-id], article, [role=article]";
  const triggerSelector = "button, [role=button], [aria-haspopup=menu]";
  const menuSelector = "[role=menu], [role=dialog]";
  const itemSelector = "button, [role=button], [role=menuitem], [aria-haspopup=menu]";
  const profileLabel =
    /^(?:關於此個人檔案|关于此个人资料|關於這個帳號|关于此账号|about (?:this )?(?:profile|account))$/iu;
  const actionLabel = "查看帳號註冊資訊";
  let stopWatching: (() => void) | undefined;
  let activeOption: HTMLButtonElement | undefined;
  let activeDialog: HTMLDialogElement | undefined;

  function findAuthor(trigger: HTMLElement) {
    const post = trigger.closest(postSelector);
    if (!post) return;
    // The timestamp belongs to this post. Mentions and quoted post links can belong to other authors.
    for (
      let header = trigger.parentElement;
      header && post.contains(header);
      header = header.parentElement
    ) {
      const authors = new Set<string>();
      for (const anchor of Array.from(
        header.querySelectorAll<HTMLAnchorElement>("a[href]:has(time)"),
      )) {
        if (anchor.closest(postSelector) !== post || !URL.canParse(anchor.href)) continue;
        const url = new URL(anchor.href);
        if (url.origin !== location.origin) continue;
        const match = /^\/@([A-Za-z0-9._]{1,30})\/post\/[A-Za-z0-9_-]+\/?$/.exec(url.pathname);
        if (match) authors.add(match[1].toLowerCase());
      }
      if (authors.size === 1) return authors.values().next().value;
      if (authors.size > 1 || header === post) return;
    }
  }

  async function showAccount(username: string, trigger: HTMLElement) {
    activeDialog?.close();
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "closed" });
    const dialog = document.createElement("dialog");
    activeDialog = dialog;
    dialog.setAttribute("aria-label", actionLabel);
    dialog.style.cssText =
      "margin:auto;padding:12px;width:min(440px,calc(100vw - 24px));max-height:calc(100vh - 24px);box-sizing:border-box;border:1px solid #353535;border-radius:22px;background:#101010;color:#f3f3f3;box-shadow:0 16px 65px #0009;font:14px system-ui";
    const styles = document.createElement("style");
    styles.textContent =
      "dialog::backdrop{background:rgba(0,0,0,.63)} button:focus-visible{outline:2px solid white;outline-offset:2px}";
    const header = document.createElement("header");
    header.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;padding:2px 6px 9px 12px";
    const title = document.createElement("strong");
    title.textContent = "帳號註冊資訊";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "關閉");
    close.style.cssText =
      "color:#eee;background:#252525;border:0;border-radius:50%;width:36px;height:36px;font:23px system-ui;cursor:pointer";
    close.addEventListener("click", () => dialog.close());
    header.append(title, close);
    const status = document.createElement("p");
    status.style.cssText = "padding:12px";
    status.setAttribute("role", "status");
    status.textContent = `正在開啟 @${username}…`;
    dialog.append(header, status);
    shadow.append(styles, dialog);
    document.body.append(host);
    dialog.showModal();
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    const iframe = document.createElement("iframe");
    const closeFromFrame = (event: MessageEvent) => {
      if (
        event.source === iframe.contentWindow &&
        event.origin === new URL(chrome.runtime.getURL("index.html")).origin &&
        event.data === "anti-threadarmy:close"
      )
        dialog.close();
    };
    window.addEventListener("message", closeFromFrame);
    dialog.addEventListener(
      "close",
      () => {
        window.removeEventListener("message", closeFromFrame);
        host.remove();
        if (activeDialog === dialog) {
          activeDialog = undefined;
          trigger.focus({ preventScroll: true });
        }
      },
      { once: true },
    );
    let received: { ticket?: string } | undefined;
    try {
      received = await chrome.runtime.sendMessage({ type: "prepare-post-lookup", username });
      const ticket = received?.ticket;
      if (typeof ticket !== "string") throw new Error("擴充套件未回傳查詢憑證。");
      if (!dialog.open) return;
      iframe.title = actionLabel;
      iframe.allow = "clipboard-write";
      iframe.style.cssText =
        "display:block;width:100%;height:min(300px,calc(100dvh - 108px));border:0;border-radius:14px";
      iframe.src =
        chrome.runtime.getURL("index.html") + "#post-lookup=" + encodeURIComponent(ticket);
      status.replaceWith(iframe);
    } catch (error) {
      status.textContent = "無法開啟查詢，請重新整理 Threads 後再試。";
      const report = JSON.stringify(
        {
          version: 1,
          timestamp: new Date().toISOString(),
          stage: "prepare-post-lookup",
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          context: {
            input: username,
            response: received
              ? { ...received, ...(received.ticket ? { ticket: "[REDACTED]" } : {}) }
              : null,
          },
        },
        null,
        2,
      );
      const view = document.createElement("button");
      view.type = "button";
      view.textContent = "查看錯誤報告";
      view.style.cssText =
        "margin:12px;padding:8px;color:inherit;background:#252525;border:1px solid #444;border-radius:8px;cursor:pointer";
      view.addEventListener(
        "click",
        () => {
          title.textContent = "錯誤報告";
          dialog.setAttribute("aria-label", "錯誤報告");
          const details = document.createElement("pre");
          details.style.cssText =
            "white-space:pre-wrap;overflow-wrap:anywhere;max-height:60vh;overflow:auto;padding:12px;user-select:text;font:12px/1.6 monospace";
          details.tabIndex = 0;
          details.textContent = report;
          status.replaceWith(details);
          view.textContent = "複製報告";
          view.onclick = () => {
            void navigator.clipboard.writeText(report).then(
              () => {
                view.textContent = "已複製";
              },
              () => {
                view.textContent = "請選取報告內容複製";
              },
            );
          };
        },
        { once: true },
      );
      dialog.append(view);
    }
  }

  function isVisible(element: HTMLElement) {
    return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
  }

  function visibleMenus() {
    return Array.from(document.querySelectorAll<HTMLElement>(menuSelector)).filter(isVisible);
  }

  function menuItems(menu: HTMLElement) {
    return Array.from(menu.querySelectorAll<HTMLElement>(itemSelector)).filter((item) => {
      const parentItem = item.parentElement?.closest(itemSelector);
      return (
        (item.closest(menuSelector) ?? menu) === menu &&
        (!parentItem || !menu.contains(parentItem)) &&
        isVisible(item)
      );
    });
  }

  function matchesLabel(item: HTMLElement, pattern: RegExp) {
    return [item.getAttribute("aria-label"), item.innerText].some(
      (label) => label && pattern.test(label.replace(/\s+/g, " ").trim()),
    );
  }

  function profileMenus(menus: HTMLElement[]) {
    const matches = new Set(
      menus.filter((menu) => menuItems(menu).some((item) => matchesLabel(item, profileLabel))),
    );
    // Some profile popovers expose button rows without a menu/dialog role.
    // Identify the smallest panel containing both account info and Copy link.
    for (const item of Array.from(document.querySelectorAll<HTMLElement>(itemSelector))) {
      if (!isVisible(item) || !matchesLabel(item, profileLabel) || item.closest(menuSelector))
        continue;
      for (
        let panel = item.parentElement;
        panel && panel !== document.body;
        panel = panel.parentElement
      ) {
        if (
          menuItems(panel).some((row) => matchesLabel(row, /^(?:複製連結|复制链接|copy link)$/iu))
        ) {
          matches.add(panel);
          break;
        }
        if (panel.matches("main, header, article")) break;
      }
    }
    return [...matches];
  }

  function placePostOption(menu: HTMLElement, option: HTMLButtonElement) {
    const items = menuItems(menu);
    const addToFeed = items.find((item) =>
      matchesLabel(
        item,
        /^(?:新增(?:到|至)(?:自訂)?動態(?:消息)?|add to (?:a |your )?(?:custom )?feeds?)$/iu,
      ),
    );
    const postOptions = items.find((item) =>
      matchesLabel(item, /^(?:貼文選項|帖子选项|贴文选项|post options)$/iu),
    );
    const anchor = addToFeed ?? postOptions ?? items.at(-1);
    if (!anchor) return;

    const group = anchor.closest<HTMLElement>("[role=group]");
    let row = anchor;
    // A role=group can wrap the whole popover. Climb through single-item
    // wrappers only, stopping at the section or the visual panel.
    while (
      row.parentElement &&
      row.parentElement !== menu &&
      row.parentElement !== group &&
      row.parentElement.childElementCount === 1
    ) {
      const parent = row.parentElement;
      const style = getComputedStyle(parent);
      if (style.backgroundColor !== "rgba(0, 0, 0, 0)" || style.backgroundImage !== "none") break;
      row = parent;
    }

    const previous = items[items.indexOf(anchor) - 1];
    if (previous && (!group || group.contains(previous))) {
      option.classList.add("anti-threadarmy-post-option-divider");
    }
    row.before(option);
  }

  function watchPostMenu(event: MouseEvent | KeyboardEvent) {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    if (
      event instanceof KeyboardEvent &&
      (event.repeat || !["Enter", " ", "ArrowDown"].includes(event.key))
    )
      return;
    const trigger = event.target.closest<HTMLElement>(triggerSelector);
    if (!trigger || trigger.closest(menuSelector) || activeOption?.contains(trigger)) return;
    stopWatching?.();
    activeOption?.remove();
    const profilePath = location.pathname;
    const profileUsername = /^\/@([A-Za-z0-9._]{1,30})(?:\/(?:replies|media|reposts))?\/?$/.exec(
      profilePath,
    )?.[1];
    const postUsername = findAuthor(trigger);
    if (!profileUsername && !postUsername) return;
    const before = new Set(visibleMenus());

    const insert = () => {
      if (stopWatching !== stop || location.pathname !== profilePath) return;
      const menus = visibleMenus();
      // The profile signature also works when the header resembles a post,
      // the trigger has no ARIA state, or pointerdown already opened the menu.
      const profiles = profileUsername ? profileMenus(menus) : [];
      if (profiles.length > 1) return;
      const candidates = profiles.length
        ? profiles
        : menus.filter(
            (menu) => !before.has(menu) && menu.matches("[role=menu]") && menuItems(menu).length,
          );
      const username = profiles.length ? profileUsername : postUsername;
      if (!username || candidates.length !== 1) return;
      const menu = candidates[0];
      const option = document.createElement("button");
      option.type = "button";
      option.setAttribute("role", "menuitem");
      option.className = "anti-threadarmy-post-option";
      option.textContent = actionLabel;
      option.addEventListener("click", (click) => {
        if (!click.isTrusted) return;
        click.stopPropagation();
        click.preventDefault();
        if (trigger.getAttribute("aria-expanded") === "true") trigger.click();
        else
          menu.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
          );
        void showAccount(username, trigger);
      });
      placePostOption(menu, option);
      if (!option.isConnected) return;
      activeOption = option;
      stop();
    };
    const observer = new MutationObserver(insert);
    const timer = setTimeout(() => stop(), 5000);
    const stop = () => {
      observer.disconnect();
      clearTimeout(timer);
      if (stopWatching === stop) stopWatching = undefined;
    };
    stopWatching = stop;
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "aria-expanded",
        "aria-label",
        "hidden",
        "style",
        "class",
        "role",
        "open",
        "data-state",
      ],
    });
    requestAnimationFrame(insert);
  }

  document.addEventListener("click", watchPostMenu, { capture: true });
  document.addEventListener("keydown", watchPostMenu, { capture: true });
})();
