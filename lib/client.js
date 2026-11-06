// lib/client.js — browser half: beautiful, modern UI for Gemini OAuth Bridge in DSH with Russian as default.
// Uses hand-written window.__ModuleLoader__.load module factory with React.

window.__ModuleLoader__.load({
	id: "dsh-gemini-oauth-bridge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		const createElement = react.createElement;

		const ru = {
			"sectionLabel": "Gemini OAuth",
			"connectionError": "Не удается подключиться к плагину (плагин не загружен или требуется перезапуск DSH)",
			"loginOpened": "Окно входа Google открыто. Завершите авторизацию в браузере; если всплывающее окно заблокировано — разрешите его.",
			"success": "Операция успешно выполнена",
			"loading": "Загрузка данных…",
			"description": "Мост Google AI (Antigravity OAuth) для использования моделей Gemini в DSH через OpenAI-совместимый интерфейс. Расходует квоту подписки Google AI Pro/Ultra без платы за API.",
			"state": "Статус",
			"accounts": "Подключенные Google-аккаунты",
			"noAccounts": "Нет подключенных аккаунтов. Нажмите «Войти через Google» для начала работы.",
			"activeBadge": "Основной",
			"makeActive": "Сделать основным",
			"remove": "Удалить",
			"addAccount": "+ Добавить Google аккаунт",
			"email": "Email",
			"project": "Google Cloud проект",
			"tier": "Тариф",
			"version": "Версия клиента",
			"models": "Доступные модели",
			"login": "Авторизация",
			"cooldown": "Кулдаун лимита (429)",
			"loggedIn": "✅ Подключен",
			"loggedOut": "Не авторизован",
			"pending": "Ожидание входа в браузере…",
			"cancelLogin": "Отменить вход",
			"relogin": "Переподключить",
			"signIn": "Войти через Google",
			"refreshModels": "Обновить модели",
			"refreshVersion": "Обновить версию",
			"logout": "Выйти со всех",
			"proxyTitle": "Прокси-сервер (обход блокировок)",
			"proxyDesc": "Поддерживаются HTTP, HTTPS и SOCKS5 (например, http://127.0.0.1:7890 или socks5://127.0.0.1:1080).",
			"proxyPlaceholder": "http://127.0.0.1:7890",
			"saveProxy": "Сохранить",
			"testProxy": "Проверить связь",
			"proxyActive": "Прокси активен",
			"proxyDirect": "Прямое подключение",
			"networkTitle": "Сетевой режим и авто-обход блокировок",
			"networkDesc": "Встроенный авто-обход на основе SNI Reverse Proxy (технология antigravity-unlocker). Не требует прав root/sudo, настройки /etc/hosts или внешнего VPN. Работает всегда независимо от локации на macOS, Linux (включая Steam Deck) и Windows.",
			"modeAuto": "⚡ Авто-обход (SNI)",
			"modeDirect": "🌐 Прямое подключение",
			"modeProxy": "🛡️ Свой прокси",
			"autoActive": "Авто-обход активен",
			"directActive": "Прямое подключение (без обхода)",
			"activeNode": "Узел:",
			"pingLatency": "Пинг: {ms}",
			"testConnectionBtn": "Проверить связь с Google",
			"refreshNodesBtn": "Обновить список узлов",
			"nodesRefreshed": "Список узлов обновлен",
			"connectionOk": "Связь с Google установлена (задержка: {ms} мс)",
			"connectionFail": "Ошибка связи с Google: {error}",
			"unlockTitle": "Анлок Antigravity (DNS-пин + патч)",
			"unlockDesc": "Вместо прокси: подмена DNS для Google API через «анблок»-DNS (запись в /etc/hosts) и байтовый патч language_server. Нужен sudo без пароля; если не выходит — выполните в Терминале: sudo bash ~/ag_unlocker_mac.sh",
			"unlockAll": "🚀 Полный анлок",
			"dnsPinBtn": "DNS-пин",
			"dnsPinRemoveBtn": "Убрать DNS-пин",
			"binPatchBtn": "Патч бинарей",
			"binRevertBtn": "Откатить патч",
			"wdInstallBtn": "Включить watchdog",
			"wdRemoveBtn": "Выключить watchdog",
			"dnsPinned": "DNS-пин активен ({n})",
			"dnsNotPinned": "DNS-пин не применён",
			"binPatched": "Патч применён ({n})",
			"binNotPatched": "Патч не применён",
			"binNone": "Antigravity не найден",
			"wdOn": "Watchdog включён",
			"wdOff": "Watchdog выключен",
			"unlockLogLabel": "Журнал",
			"proxyTestOk": "Связь с Google установлена (задержка: {ms} мс)",
			"proxyTestFail": "Ошибка подключения к Google через прокси: {error}",
			"aliasesTitle": "Альясы моделей (OpenAI / Claude совместимость)",
			"aliasesDesc": "Запросы к популярным названиям моделей автоматически перенаправляются на Gemini:",
			"howto": "Как использовать эти модели в DSH",
			"autoConfig": "Конфигурация provider и ключ создаются автоматически (перезапустите DSH для применения):",
			"configHelp": "Конфигурация provider сохраняется в ~/.dsh/settings.yaml, а фиктивный ключ — в ~/.dsh/.credentials.yaml. Мост принимает любой ключ.",
			"empty": "—",
			"unknown": "Неизвестная ошибка",
			"credentialFailed": " (ошибка записи ключа: {reason})",
			"credentialCreated": " (создан ключ {name})",
			"credentialExists": " (ключ {name} уже существует)",
			"providerFailed": "Модели обновлены, но запись конфигурации provider не удалась: {reason}",
			"modelsRefreshed": "Обновлено {count} моделей, конфигурация записана в settings.yaml{credential} (перезапустите DSH)",
			"versionRefreshed": "Версия клиента обновлена: {version}",
			"withSource": "{value} ({source})",
			"httpError": "Ошибка HTTP {status}",
			"separator": "; ",
			"source_none": "Отсутствует",
			"source_cache": "Кэш",
			"source_manifest": "Манифест",
			"source_fallback": "Базовый",
			"source_upstream": "Сервер",
			"source_default": "По умолчанию",
			"filterAll": "Все",
			"filterGemini3": "Gemini 3 (Флагманы)",
			"filterGemini2": "Gemini 2.5 / 2.0",
			"searchModelPlaceholder": "Быстрый поиск модели…",
			"copyModel": "Нажмите, чтобы скопировать название",
			"copiedModel": "Скопировано: {model}",
			"effortTip": "⚡ В чате DSH доступен переключатель Effort (Off / Low / High / Max) — он автоматически регулирует глубину мышления (thinkingBudget) и переключает режимы моделей."
		};

		const en = {
			"sectionLabel": "Gemini OAuth",
			"connectionError": "Cannot connect to the plugin API (plugin not loaded or DSH needs a restart)",
			"loginOpened": "Google sign-in opened. Complete authorization in your browser; if the popup was blocked, allow it and retry.",
			"success": "Operation successful",
			"loading": "Loading…",
			"description": "Bridge Google AI subscription (Antigravity / Code Assist OAuth) into DSH as an OpenAI-compatible model endpoint. Uses subscription quota without per-token API billing.",
			"state": "Status",
			"accounts": "Connected Google Accounts",
			"noAccounts": "No accounts connected yet. Sign in with Google to get started.",
			"activeBadge": "Active",
			"makeActive": "Make active",
			"remove": "Remove",
			"addAccount": "+ Add Google Account",
			"email": "Account",
			"project": "Project",
			"tier": "Tier",
			"version": "Client version",
			"models": "Models",
			"login": "Sign-in",
			"cooldown": "Rate-limit cooldown",
			"loggedIn": "✅ Signed in",
			"loggedOut": "Not signed in",
			"pending": "In progress — complete authorization in your browser",
			"cancelLogin": "Cancel sign-in",
			"relogin": "Sign in again",
			"signIn": "Sign in with Google",
			"refreshModels": "Refresh model list",
			"refreshVersion": "Refresh client version",
			"logout": "Sign out all",
			"proxyTitle": "Proxy Configuration (Bypass Geo-restrictions)",
			"proxyDesc": "Supports HTTP, HTTPS and SOCKS5 (e.g., http://127.0.0.1:7890 or socks5://127.0.0.1:1080).",
			"proxyPlaceholder": "http://127.0.0.1:7890",
			"saveProxy": "Save Proxy",
			"testProxy": "Test Connection",
			"proxyActive": "Proxy active",
			"proxyDirect": "Direct connection",
			"networkTitle": "Connection & Auto-Unblock Mode",
			"networkDesc": "Built-in SNI Reverse Proxy auto-unblock (antigravity-unlocker engine). Requires no root/sudo, no /etc/hosts changes, and no external VPN. Works anywhere regardless of location on macOS, Linux (including Steam Deck), and Windows.",
			"modeAuto": "⚡ Auto-Unblock (SNI)",
			"modeDirect": "🌐 Direct Connection",
			"modeProxy": "🛡️ Custom Proxy",
			"autoActive": "Auto-Unblock Active",
			"directActive": "Direct Connection (No unblock)",
			"activeNode": "Node:",
			"pingLatency": "Ping: {ms}",
			"testConnectionBtn": "Test Google Connection",
			"refreshNodesBtn": "Refresh Nodes",
			"nodesRefreshed": "Node list refreshed",
			"connectionOk": "Connected to Google successfully ({ms} ms)",
			"connectionFail": "Connection to Google failed: {error}",
			"unlockTitle": "Antigravity unlock (DNS pin + patch)",
			"unlockDesc": "Replaces the proxy: pins Google API domains via unblock DNS (/etc/hosts) and byte-patches language_server. Needs passwordless sudo; otherwise run in Terminal: sudo bash ~/ag_unlocker_mac.sh",
			"unlockAll": "🚀 Full unlock",
			"dnsPinBtn": "DNS pin",
			"dnsPinRemoveBtn": "Remove DNS pin",
			"binPatchBtn": "Patch binaries",
			"binRevertBtn": "Revert patch",
			"wdInstallBtn": "Enable watchdog",
			"wdRemoveBtn": "Disable watchdog",
			"dnsPinned": "DNS pin active ({n})",
			"dnsNotPinned": "DNS pin not applied",
			"binPatched": "Patched ({n})",
			"binNotPatched": "Not patched",
			"binNone": "Antigravity not found",
			"wdOn": "Watchdog on",
			"wdOff": "Watchdog off",
			"unlockLogLabel": "Log",
			"proxyTestOk": "Connected to Google successfully ({ms} ms)",
			"proxyTestFail": "Proxy connection to Google failed: {error}",
			"aliasesTitle": "Model Aliases (OpenAI / Claude compatibility)",
			"aliasesDesc": "Standard model names are automatically mapped to Gemini:",
			"howto": "How to use these models in DSH",
			"autoConfig": "Configuration is written automatically after sign-in / model refresh (restart DSH to apply):",
			"configHelp": "Provider config is stored in ~/.dsh/settings.yaml and a placeholder key in ~/.dsh/.credentials.yaml. The bridge accepts any key.",
			"empty": "—",
			"unknown": "Unknown reason",
			"credentialFailed": " (placeholder key error: {reason})",
			"credentialCreated": " (created key {name})",
			"credentialExists": " (key {name} exists)",
			"providerFailed": "Model list refreshed, but provider configuration could not be written: {reason}",
			"modelsRefreshed": "Refreshed {count} models and wrote provider config to settings.yaml{credential} (restart DSH to apply)",
			"versionRefreshed": "Client version updated: {version}",
			"withSource": "{value} ({source})",
			"httpError": "HTTP {status}",
			"separator": "; ",
			"source_none": "None",
			"source_cache": "Cache",
			"source_manifest": "Manifest",
			"source_fallback": "Fallback",
			"source_upstream": "Upstream",
			"source_default": "Default",
			"filterAll": "All",
			"filterGemini3": "Gemini 3 (Flagships)",
			"filterGemini2": "Gemini 2.5 / 2.0",
			"searchModelPlaceholder": "Search models…",
			"copyModel": "Click to copy model name",
			"copiedModel": "Copied: {model}",
			"effortTip": "⚡ DSH chat Effort switch (Off / Low / High / Max) is fully supported — it controls thinking budget and routes models dynamically."
		};

		const zh = {
			"sectionLabel": "Gemini OAuth",
			"connectionError": "无法连接插件接口（插件未加载或 DSH 需要重启）",
			"loginOpened": "已打开 Google 登录页，在浏览器完成授权即可；若浏览器拦截了弹窗，请允许后重试。",
			"success": "操作成功",
			"loading": "加载中…",
			"description": "使用 Google 账号（AI Pro / AI Ultra 订阅）登录 Antigravity 授权端点，把 Gemini 模型以 OpenAI 兼容接口桥接给 DSH。调用消耗订阅配额，不走 API 计费。",
			"state": "状态",
			"accounts": "已连接的 Google 账号",
			"noAccounts": "暂无已连接账号，请登录 Google 开始使用。",
			"activeBadge": "当前活跃",
			"makeActive": "设为主要",
			"remove": "删除",
			"addAccount": "+ 添加 Google 账号",
			"email": "账号",
			"project": "项目",
			"tier": "Tier",
			"version": "客户端版本",
			"models": "模型",
			"login": "登录",
			"cooldown": "限流冷却",
			"loggedIn": "✅ 已登录",
			"loggedOut": "未登录",
			"pending": "进行中——请在浏览器完成授权",
			"cancelLogin": "取消登录",
			"relogin": "重新登录",
			"signIn": "登录 Google 账号",
			"refreshModels": "刷新模型列表",
			"refreshVersion": "刷新客户端版本",
			"logout": "全部退出",
			"proxyTitle": "网络代理设置（支持绕过地域限制）",
			"proxyDesc": "支持 HTTP、HTTPS 与 SOCKS5（例如：http://127.0.0.1:7890 或 socks5://127.0.0.1:1080）。",
			"proxyPlaceholder": "http://127.0.0.1:7890",
			"saveProxy": "保存代理",
			"testProxy": "测试连接",
			"proxyActive": "代理生效中",
			"proxyDirect": "直连模式",
			"networkTitle": "网络模式与自动解除限制",
			"networkDesc": "基于 SNI 反向代理的内置自动绕过引擎（来自 antigravity-unlocker）。无需 root/sudo 权限，不修改 /etc/hosts，无需系统级 VPN。在 macOS、Linux（包括 Steam Deck）和 Windows 上均可始终可用。",
			"modeAuto": "⚡ 自动解除限制 (SNI)",
			"modeDirect": "🌐 直连模式",
			"modeProxy": "🛡️ 自定义代理",
			"autoActive": "自动绕过已生效",
			"directActive": "直连模式（无绕过）",
			"activeNode": "节点：",
			"pingLatency": "延迟：{ms}",
			"testConnectionBtn": "测试与 Google 连接",
			"refreshNodesBtn": "刷新节点列表",
			"nodesRefreshed": "节点列表已刷新",
			"connectionOk": "成功连接 Google（延迟：{ms} 毫秒）",
			"connectionFail": "连接 Google 失败：{error}",
			"unlockTitle": "Antigravity 解锁（DNS 固定 + 补丁）",
			"unlockDesc": "替代代理：通过解锁 DNS 固定 Google API 域名（/etc/hosts）并对 language_server 打字节补丁。需要免密 sudo；否则请在终端运行：sudo bash ~/ag_unlocker_mac.sh",
			"unlockAll": "🚀 一键解锁",
			"dnsPinBtn": "DNS 固定",
			"dnsPinRemoveBtn": "移除 DNS 固定",
			"binPatchBtn": "修补二进制",
			"binRevertBtn": "还原补丁",
			"wdInstallBtn": "启用 watchdog",
			"wdRemoveBtn": "停用 watchdog",
			"dnsPinned": "DNS 固定已生效（{n}）",
			"dnsNotPinned": "DNS 固定未应用",
			"binPatched": "已修补（{n}）",
			"binNotPatched": "未修补",
			"binNone": "未找到 Antigravity",
			"wdOn": "Watchdog 已启用",
			"wdOff": "Watchdog 未启用",
			"unlockLogLabel": "日志",
			"proxyTestOk": "成功连接 Google（延迟：{ms} 毫秒）",
			"proxyTestFail": "通过代理连接 Google 失败：{error}",
			"aliasesTitle": "模型别名映射（兼容 OpenAI / Claude）",
			"aliasesDesc": "常用外部模型名称将自动路由至 Gemini 对应模型：",
			"howto": "如何让 DSH 使用这些模型",
			"autoConfig": "登录成功 / 刷新模型列表后会自动写入，无需手动编辑（重启 DSH 生效）：",
			"configHelp": "配置会自动写入 settings.yaml，占位凭据写入 .credentials.yaml。桥接端接受任意 key。",
			"empty": "—",
			"unknown": "未知原因",
			"credentialFailed": "（凭据写入失败：{reason}）",
			"credentialCreated": "（已生成占位 key {name}）",
			"credentialExists": "（凭据 {name} 已存在）",
			"providerFailed": "模型列表已刷新，但写入 provider 配置失败：{reason}",
			"modelsRefreshed": "已刷新 {count} 个模型，并写入 settings.yaml{credential}（重启 DSH 后生效）",
			"versionRefreshed": "客户端版本已更新：{version}",
			"withSource": "{value}（{source}）",
			"httpError": "HTTP {status}",
			"separator": "；",
			"source_none": "无",
			"source_cache": "缓存",
			"source_manifest": "版本清单",
			"source_fallback": "兜底",
			"source_upstream": "上游",
			"source_default": "默认",
			"filterAll": "全部",
			"filterGemini3": "Gemini 3 (旗舰)",
			"filterGemini2": "Gemini 2.5 / 2.0",
			"searchModelPlaceholder": "搜索模型…",
			"copyModel": "点击复制模型名称",
			"copiedModel": "已复制：{model}",
			"effortTip": "⚡ DSH 对话框 Effort 切换器（Off / Low / High / Max）已完全支持，自动调节思考预算与模式。"
		};

		const CSS = `
.gb_wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-fg-default, #c9d1d9);
  max-width: 900px;
}
.gb_header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--color-canvas-subtle, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--color-border-default, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
}
.gb_title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
}
.gb_desc {
  color: var(--color-fg-muted, #8b949e);
  font-size: 13px;
  line-height: 1.5;
}
.gb_lang_switch {
  display: inline-flex;
  gap: 3px;
  background: rgba(0, 0, 0, 0.25);
  padding: 2px 3px;
  border-radius: 8px;
  border: 1px solid var(--color-border-default, rgba(255, 255, 255, 0.1));
}
.gb_lang_btn {
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-fg-muted, #8b949e);
  cursor: pointer;
  transition: all 0.15s ease;
}
.gb_lang_btn:hover {
  color: #ffffff;
}
.gb_lang_btn.active {
  background: #2563eb;
  color: #ffffff;
}
.gb_badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 20px;
}
.gb_badge.success {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}
.gb_badge.warning {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}
.gb_badge.muted {
  background: rgba(156, 163, 175, 0.15);
  color: #9ca3af;
  border: 1px solid rgba(156, 163, 175, 0.3);
}
.gb_tabs {
  display: flex;
  gap: 6px;
  background: rgba(0, 0, 0, 0.25);
  padding: 4px;
  border-radius: 8px;
  border: 1px solid var(--color-border-default, rgba(255, 255, 255, 0.08));
}
.gb_tab {
  flex: 1;
  text-align: center;
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-fg-muted, #8b949e);
  cursor: pointer;
  transition: all 0.15s ease;
}
.gb_tab:hover {
  color: #ffffff;
}
.gb_tab.active {
  background: #2563eb;
  color: #ffffff;
  font-weight: 600;
}
.gb_card {
  background: var(--color-canvas-subtle, rgba(255, 255, 255, 0.02));
  border: 1px solid var(--color-border-default, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.gb_cardTitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-fg-muted, #8b949e);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.gb_row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--color-border-muted, rgba(255, 255, 255, 0.04));
  font-size: 13px;
}
.gb_row:last-child {
  border-bottom: none;
}
.gb_label {
  color: var(--color-fg-muted, #8b949e);
}
.gb_value {
  font-weight: 500;
  font-family: ui-monospace, SFMono-Regular, monospace;
}
.gb_account_item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--color-canvas-default, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--color-border-default, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  margin-bottom: 8px;
}
.gb_account_item.active {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.06);
}
.gb_account_info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.gb_account_email {
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.gb_account_meta {
  font-size: 12px;
  color: #8b949e;
}
.gb_account_actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.gb_actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
}
.gb_btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  border: 1px solid var(--color-border-default, rgba(255, 255, 255, 0.15));
  background: var(--color-btn-bg, rgba(255, 255, 255, 0.05));
  color: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
}
.gb_btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}
.gb_btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.gb_btn.primary {
  background: #2563eb;
  color: #ffffff;
  border-color: #3b82f6;
}
.gb_btn.primary:hover:not(:disabled) {
  background: #1d4ed8;
}
.gb_btn.danger {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.3);
}
.gb_btn.danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.25);
}
.gb_btn.warning {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.3);
}
.gb_btn.sm {
  padding: 4px 10px;
  font-size: 12px;
}
.gb_input {
  flex: 1;
  padding: 8px 12px;
  font-size: 13px;
  border-radius: 8px;
  border: 1px solid var(--color-border-default, rgba(255, 255, 255, 0.15));
  background: var(--color-canvas-default, rgba(0, 0, 0, 0.2));
  color: inherit;
  outline: none;
}
.gb_input:focus {
  border-color: #3b82f6;
}
.gb_input_group {
  display: flex;
  gap: 8px;
  align-items: center;
}
.gb_model_controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
  margin-bottom: 8px;
}
.gb_model_search {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid var(--color-border-default, rgba(255, 255, 255, 0.15));
  background: var(--color-canvas-default, rgba(0, 0, 0, 0.2));
  color: inherit;
  outline: none;
  min-width: 170px;
}
.gb_model_search:focus {
  border-color: #3b82f6;
}
.gb_filter_tabs {
  display: inline-flex;
  gap: 3px;
  background: rgba(0, 0, 0, 0.2);
  padding: 2px 3px;
  border-radius: 8px;
  border: 1px solid var(--color-border-default, rgba(255, 255, 255, 0.08));
}
.gb_filter_tab {
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--color-fg-muted, #8b949e);
  cursor: pointer;
  transition: all 0.12s ease;
}
.gb_filter_tab:hover {
  color: #ffffff;
}
.gb_filter_tab.active {
  background: rgba(59, 130, 246, 0.25);
  color: #60a5fa;
  font-weight: 600;
}
.gb_chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 280px;
  overflow-y: auto;
  padding: 4px 2px;
}
.gb_chip {
  padding: 4px 10px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  background: rgba(59, 130, 246, 0.1);
  color: #93c5fd;
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: all;
}
.gb_chip:hover {
  background: rgba(59, 130, 246, 0.22);
  border-color: rgba(59, 130, 246, 0.4);
  color: #ffffff;
  transform: translateY(-1px);
}
.gb_chip.gemini3 {
  background: rgba(168, 85, 247, 0.12);
  color: #c084fc;
  border-color: rgba(168, 85, 247, 0.25);
}
.gb_chip.gemini3:hover {
  background: rgba(168, 85, 247, 0.22);
  border-color: rgba(168, 85, 247, 0.45);
  color: #f3e8ff;
}
.gb_chip.claude {
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.25);
}
.gb_chip.claude:hover {
  background: rgba(245, 158, 11, 0.22);
  border-color: rgba(245, 158, 11, 0.45);
  color: #fef3c7;
}
.gb_alias_grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}
.gb_alias_item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  font-size: 12px;
}
.gb_alias_from {
  font-family: ui-monospace, SFMono-Regular, monospace;
  color: #fbbf24;
}
.gb_alias_to {
  font-family: ui-monospace, SFMono-Regular, monospace;
  color: #34d399;
}
.gb_notice {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.4;
}
.gb_notice.ok {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.25);
}
.gb_notice.error {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.25);
}
.gb_notice.info {
  background: rgba(59, 130, 246, 0.12);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.25);
}
.gb_howto {
  background: var(--color-canvas-subtle, rgba(255, 255, 255, 0.02));
  border: 1px solid var(--color-border-default, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
  padding: 14px 18px;
}
.gb_howto summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: #8b949e;
}
.gb_howtoBody {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.gb_howtoBody pre {
  padding: 12px;
  background: #0d1117;
  border-radius: 8px;
  font-size: 12px;
  overflow-x: auto;
  border: 1px solid #30363d;
}
`;

		const inject = ["slots", "locale"];

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register("geminiOauth", { ru, en, zh }), "dsh-gemini-oauth-bridge: dictionaries");

			function Row({ label, children, t }) {
				return createElement(
					"div",
					{ className: "gb_row" },
					createElement("span", { className: "gb_label" }, label),
					createElement("span", { className: "gb_value" }, children ?? t("empty")),
				);
			}

			function GeminiSection() {
				// Default to Russian ("ru"), but allow user to toggle language via UI
				const [currentLang, setCurrentLang] = react.useState(() => {
					try {
						return localStorage.getItem("gb_locale") || "ru";
					} catch {
						return "ru";
					}
				});

				const t = react.useCallback((key, params) => {
					const dict = currentLang === "en" ? en : (currentLang === "zh" ? zh : ru);
					let str = dict[key] ?? ru[key] ?? en[key] ?? key;
					if (params && typeof params === "object") {
						str = str.replace(/\{(\w+)\}/g, (match, name) => String(params[name] ?? match));
					}
					return str;
				}, [currentLang]);

				const changeLang = react.useCallback((newLang) => {
					setCurrentLang(newLang);
					try {
						localStorage.setItem("gb_locale", newLang);
					} catch {}
				}, []);

				const api = react.useCallback((path, options) => {
					return fetch("/gemini-oauth-bridge/api" + path + (path.includes("?") ? "&" : "?") + new URLSearchParams({ lang: currentLang }), {
						headers: { "Content-Type": "application/json" },
						...options,
					}).then(async (resp) => ({ ok: resp.ok, status: resp.status, body: await resp.json().catch(() => ({})) }));
				}, [currentLang]);

				const [status, setStatus] = react.useState(null);
				const [busy, setBusy] = react.useState(false);
				const [notice, setNotice] = react.useState(null);
				const [proxyInput, setProxyInput] = react.useState("");
				const [proxyTesting, setProxyTesting] = react.useState(false);
				const [unlock, setUnlock] = react.useState(null);
				const [unlockLog, setUnlockLog] = react.useState("");
				const [modelFilter, setModelFilter] = react.useState("all");
				const [modelSearch, setModelSearch] = react.useState("");

				const copyModel = react.useCallback((m) => {
					if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
						navigator.clipboard.writeText(m).then(() => {
							setNotice({ kind: "info", text: t("copiedModel", { model: m }) });
						}).catch(() => {});
					}
				}, [t]);

				const refresh = react.useCallback(() => {
					api("/status")
						.then((r) => {
							setStatus(r.body);
							if (r.body && r.body.proxy !== undefined && !proxyInput) {
								setProxyInput(r.body.proxy || "");
							}
						})
						.catch(() => setStatus({ ok: false, error: t("connectionError") }));
				}, [api, proxyInput, t]);

				react.useEffect(() => {
					refresh();
					const timer = setInterval(refresh, 3500);
					return () => clearInterval(timer);
				}, [refresh]);

				const post = react.useCallback(
					async (path, payload = {}) => {
						setBusy(true);
						setNotice(null);
						try {
							const r = await api("/" + path, { method: "POST", body: JSON.stringify(payload) });
							if (!r.ok || r.body.error) {
								setNotice({ kind: "error", text: String(r.body.error ?? t("httpError", { status: r.status })) });
							} else if (path === "login" && r.body.authUrl) {
								window.open(r.body.authUrl, "_blank", "noopener");
								setNotice({ kind: "info", text: t("loginOpened") });
							} else if (path === "refresh-models") {
								const p = r.body.provider ?? {};
								const cred = p.credential ?? {};
								let credNote = "";
								if (cred.ok === false) credNote = t("credentialFailed", { reason: cred.reason ?? t("unknown") });
								else if (cred.created) credNote = t("credentialCreated", { name: p.apiKeyEnv ?? "" });
								else credNote = t("credentialExists", { name: p.apiKeyEnv ?? "" });
								setNotice({
									kind: p.ok === false ? "error" : "ok",
									text: p.ok === false
										? t("providerFailed", { reason: p.reason ?? t("unknown") })
										: t("modelsRefreshed", { count: (r.body.models ?? []).length, credential: credNote }),
								});
							} else if (path === "refresh-version") {
								setNotice({ kind: "ok", text: t("versionRefreshed", { version: r.body.version }) });
							} else if (r.body.message) {
								setNotice({ kind: "ok", text: r.body.message });
							} else {
								setNotice({ kind: "ok", text: t("success") });
							}
						} catch (e) {
							setNotice({ kind: "error", text: String(e) });
						}
						setBusy(false);
						refresh();
					},
					[api, refresh, t],
				);

				const handleSaveProxy = react.useCallback(async () => {
					await post("save-proxy", { proxy: proxyInput });
				}, [post, proxyInput]);

				const handleSetConnectionMode = react.useCallback(async (mode) => {
					await post("set-connection-mode", { mode, proxy: proxyInput });
				}, [post, proxyInput]);

				const handleTestConnection = react.useCallback(async () => {
					setProxyTesting(true);
					try {
						const currentMode = status?.connectionMode || (status?.proxy ? "proxy" : "auto");
						const r = await api("/test-connection", { method: "POST", body: JSON.stringify({ mode: currentMode, proxy: proxyInput }) });
						if (r.ok && r.body.ok) {
							setNotice({ kind: "ok", text: t("connectionOk", { ms: r.body.latencyMs }) });
						} else {
							setNotice({ kind: "error", text: t("connectionFail", { error: r.body.error || `HTTP ${r.status}` }) });
						}
					} catch (e) {
						setNotice({ kind: "error", text: t("connectionFail", { error: String(e) }) });
					}
					setProxyTesting(false);
				}, [api, proxyInput, status, t]);

				const handleRefreshUnblock = react.useCallback(async () => {
					setBusy(true);
					try {
						await api("/refresh-unblock", { method: "POST", body: "{}" });
						setNotice({ kind: "ok", text: t("nodesRefreshed") });
					} catch {}
					setBusy(false);
					refresh();
				}, [api, refresh, t]);

				const handleTestProxy = react.useCallback(async () => {
					setProxyTesting(true);
					try {
						const r = await api("/test-proxy", { method: "POST", body: JSON.stringify({ proxy: proxyInput }) });
						if (r.ok && r.body.ok) {
							setNotice({ kind: "ok", text: t("proxyTestOk", { ms: r.body.latencyMs }) });
						} else {
							setNotice({ kind: "error", text: t("proxyTestFail", { error: r.body.error || `HTTP ${r.status}` }) });
						}
					} catch (e) {
						setNotice({ kind: "error", text: t("proxyTestFail", { error: String(e) }) });
					}
					setProxyTesting(false);
				}, [api, proxyInput, t]);

				const loadUnlock = react.useCallback(() => {
					api("/unlock-status").then((r) => { if (r.ok && r.body) setUnlock(r.body); }).catch(() => {});
				}, [api]);

				react.useEffect(() => {
					loadUnlock();
					const timer = setInterval(loadUnlock, 5000);
					return () => clearInterval(timer);
				}, [loadUnlock]);

				const runUnlock = react.useCallback(async (path) => {
					setBusy(true);
					setNotice(null);
					try {
						const r = await api("/" + path, { method: "POST", body: "{}" });
						const b = r.body || {};
						setUnlockLog(Array.isArray(b.logs) ? b.logs.join("\n") : "");
						if (!r.ok || b.error || b.ok === false) {
							const m = b.error ?? b.message;
							setNotice({ kind: "error", text: typeof m === "string" ? m : t("httpError", { status: r.status }) });
						} else {
							setNotice({ kind: "ok", text: typeof b.message === "string" ? b.message : t("success") });
						}
					} catch (e) {
						setNotice({ kind: "error", text: String(e) });
					}
					setBusy(false);
					loadUnlock();
				}, [api, t, loadUnlock]);

				if (!status) {
					return createElement("div", { className: "gb_wrap" },
						createElement("style", null, CSS),
						createElement("div", { className: "gb_notice info" }, t("loading"))
					);
				}

				if (status.error) {
					return createElement("div", { className: "gb_wrap" },
						createElement("style", null, CSS),
						createElement("div", { className: "gb_notice error" }, status.error)
					);
				}

				const loggedIn = !!status.loggedIn;
				const accounts = status.accounts || [];
				const cooldownEntries = Object.entries(status.cooldowns ?? {});
				const aliasesEntries = Object.entries(status.aliases ?? {});

				return createElement(
					"div",
					{ className: "gb_wrap" },
					createElement("style", null, CSS),

					// Header with language switcher
					createElement(
						"div",
						{ className: "gb_header" },
						createElement(
							"div",
							{ className: "gb_title" },
							createElement("span", null, "🤖"),
							createElement("span", null, "Google Gemini OAuth Bridge"),
						),
						createElement(
							"div",
							{ style: { display: "flex", alignItems: "center", gap: "10px" } },
							// Language selector
							createElement(
								"div",
								{ className: "gb_lang_switch" },
								createElement(
									"button",
									{
										className: `gb_lang_btn ${currentLang === "ru" ? "active" : ""}`,
										onClick: () => changeLang("ru"),
									},
									"🇷🇺 РУС"
								),
								createElement(
									"button",
									{
										className: `gb_lang_btn ${currentLang === "en" ? "active" : ""}`,
										onClick: () => changeLang("en"),
									},
									"🇬🇧 ENG"
								),
								createElement(
									"button",
									{
										className: `gb_lang_btn ${currentLang === "zh" ? "active" : ""}`,
										onClick: () => changeLang("zh"),
									},
									"🇨🇳 中文"
								)
							),
							createElement(
								"span",
								{ className: `gb_badge ${loggedIn ? "success" : status.loginPending ? "warning" : "muted"}` },
								loggedIn ? t("loggedIn") : status.loginPending ? t("pending") : t("loggedOut")
							)
						),
					),

					createElement("div", { className: "gb_desc" }, t("description")),

					// Notice alert
					notice ? createElement("div", { className: `gb_notice ${notice.kind}` }, notice.text) : null,

					// Multi-account card
					createElement(
						"div",
						{ className: "gb_card" },
						createElement(
							"div",
							{ className: "gb_cardTitle" },
							createElement("span", null, t("accounts")),
							createElement("span", null, `${accounts.length}`)
						),

						accounts.length === 0
							? createElement("div", { className: "gb_desc" }, t("noAccounts"))
							: accounts.map((acc) => {
									const isCool = Object.keys(acc.cooldowns || {}).length > 0;
									return createElement(
										"div",
										{ key: acc.id, className: `gb_account_item ${acc.isActive ? "active" : ""}` },
										createElement(
											"div",
											{ className: "gb_account_info" },
											createElement(
												"div",
												{ className: "gb_account_email" },
												acc.email || acc.id,
												acc.isActive ? createElement("span", { className: "gb_badge success" }, t("activeBadge")) : null,
												isCool ? createElement("span", { className: "gb_badge warning" }, t("cooldown")) : null,
											),
											createElement(
												"div",
												{ className: "gb_account_meta" },
												`${t("project")}: ${acc.project || "—"} | ${t("tier")}: ${acc.tier || "free-tier"}`
											),
										),
										createElement(
											"div",
											{ className: "gb_account_actions" },
											!acc.isActive
												? createElement(
														"button",
														{
															className: "gb_btn sm",
															disabled: busy,
															onClick: () => post("switch-account", { id: acc.id }),
														},
														t("makeActive")
													)
												: null,
											createElement(
												"button",
												{
													className: "gb_btn sm danger",
													disabled: busy,
													onClick: () => post("remove-account", { id: acc.id }),
												},
												t("remove")
											),
										),
									);
							  }),

						// Account actions
						createElement(
							"div",
							{ className: "gb_actions" },
							createElement(
								"button",
								{ className: "gb_btn primary", disabled: busy, onClick: () => post("login") },
								t("addAccount")
							),
							status.loginPending
								? createElement(
										"button",
										{ className: "gb_btn warning", disabled: busy, onClick: () => post("cancel-login") },
										t("cancelLogin")
								  )
								: null,
							loggedIn
								? createElement(
										"button",
										{ className: "gb_btn", disabled: busy, onClick: () => post("refresh-models") },
										t("refreshModels")
								  )
								: null,
							loggedIn
								? createElement(
										"button",
										{ className: "gb_btn", disabled: busy, onClick: () => post("refresh-version") },
										t("refreshVersion")
								  )
								: null,
							loggedIn
								? createElement(
										"button",
										{ className: "gb_btn danger", disabled: busy, onClick: () => post("logout") },
										t("logout")
								  )
								: null,
						),
					),

					// Connection & Auto-Unblock Card (Native SNI Bypass)
					(() => {
						const currentMode = status.connectionMode || (status.proxy ? "proxy" : "auto");
						const unblock = status.unblock || {};
						const activeIp = unblock.activeIp || "—";
						const activeName = unblock.activeName || activeIp;
						const latency = unblock.latencyMs ? `${unblock.latencyMs} мс` : "—";

						return createElement(
							"div",
							{ className: "gb_card" },
							createElement("div", { className: "gb_cardTitle" }, t("networkTitle")),
							createElement("div", { className: "gb_desc" }, t("networkDesc")),

							// Mode Tabs
							createElement(
								"div",
								{ className: "gb_tabs" },
								createElement(
									"button",
									{
										className: `gb_tab ${currentMode === "auto" ? "active" : ""}`,
										disabled: busy,
										onClick: () => handleSetConnectionMode("auto"),
									},
									t("modeAuto")
								),
								createElement(
									"button",
									{
										className: `gb_tab ${currentMode === "direct" ? "active" : ""}`,
										disabled: busy,
										onClick: () => handleSetConnectionMode("direct"),
									},
									t("modeDirect")
								),
								createElement(
									"button",
									{
										className: `gb_tab ${currentMode === "proxy" ? "active" : ""}`,
										disabled: busy,
										onClick: () => handleSetConnectionMode("proxy"),
									},
									t("modeProxy")
								),
							),

							// Auto Mode View
							currentMode === "auto"
								? createElement(
										"div",
										{ style: { display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" } },
										createElement(
											"div",
											{ style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
											createElement("span", { className: "gb_badge success" }, "🟢 " + t("autoActive")),
											createElement("span", { className: "gb_badge muted" }, `${t("activeNode")} ${activeName}`),
											createElement("span", { className: "gb_badge muted" }, `${t("pingLatency", { ms: latency })}`),
										),
										createElement(
											"div",
											{ style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
											createElement(
												"button",
												{ className: "gb_btn primary", disabled: busy || proxyTesting, onClick: handleTestConnection },
												proxyTesting ? "..." : t("testConnectionBtn")
											),
											createElement(
												"button",
												{ className: "gb_btn", disabled: busy, onClick: handleRefreshUnblock },
												t("refreshNodesBtn")
											),
										),
								  )
								: null,

							// Direct Mode View
							currentMode === "direct"
								? createElement(
										"div",
										{ style: { display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" } },
										createElement(
											"div",
											{ style: { display: "flex", alignItems: "center", gap: "8px" } },
											createElement("span", { className: "gb_badge muted" }, "🌐 " + t("directActive")),
										),
										createElement(
											"div",
											null,
											createElement(
												"button",
												{ className: "gb_btn", disabled: busy || proxyTesting, onClick: handleTestConnection },
												proxyTesting ? "..." : t("testConnectionBtn")
											),
										),
								  )
								: null,

							// Custom Proxy View
							currentMode === "proxy"
								? createElement(
										"div",
										{ style: { display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" } },
										createElement(
											"div",
											{ className: "gb_input_group" },
											createElement("input", {
												className: "gb_input",
												placeholder: t("proxyPlaceholder"),
												value: proxyInput,
												onChange: (e) => setProxyInput(e.target.value),
											}),
											createElement(
												"button",
												{ className: "gb_btn primary", disabled: busy, onClick: handleSaveProxy },
												t("saveProxy")
											),
											createElement(
												"button",
												{ className: "gb_btn", disabled: busy || proxyTesting, onClick: handleTestConnection },
												proxyTesting ? "..." : t("testProxy")
											),
										),
								  )
								: null,
						);
					})(),

					// Models & Info Card
					(() => {
						const allModels = status.models ?? [];
						let list = allModels;
						if (modelFilter === "gemini3") {
							list = list.filter((m) => m.startsWith("gemini-3"));
						} else if (modelFilter === "gemini2") {
							list = list.filter((m) => m.startsWith("gemini-2"));
						}
						if (modelSearch.trim()) {
							const q = modelSearch.toLowerCase().trim();
							list = list.filter((m) => m.toLowerCase().includes(q));
						}

						const chipClass = (m) => {
							if (m.startsWith("gemini-3")) return "gb_chip gemini3";
							return "gb_chip";
						};

						return createElement(
							"div",
							{ className: "gb_card" },
							createElement(
								"div",
								{ className: "gb_cardTitle" },
								createElement("span", null, t("models")),
								createElement("span", null, `${list.length} / ${allModels.length}`)
							),
							createElement(
								Row,
								{ t, key: "version", label: t("version") },
								t("withSource", { value: status.version ?? t("empty"), source: t("source_" + (status.versionSource ?? "none")) })
							),
							createElement(
								"div",
								{ className: "gb_model_controls" },
								createElement(
									"div",
									{ className: "gb_filter_tabs" },
									[
										{ id: "all", label: `${t("filterAll")} (${allModels.length})` },
										{ id: "gemini3", label: t("filterGemini3") },
										{ id: "gemini2", label: t("filterGemini2") },
									].map((tab) =>
										createElement(
											"button",
											{
												key: tab.id,
												className: `gb_filter_tab ${modelFilter === tab.id ? "active" : ""}`,
												onClick: () => setModelFilter(tab.id),
											},
											tab.label
										)
									)
								),
								createElement("input", {
									className: "gb_model_search",
									placeholder: t("searchModelPlaceholder"),
									value: modelSearch,
									onChange: (e) => setModelSearch(e.target.value),
								})
							),
							createElement(
								"div",
								{ className: "gb_chips" },
								list.map((m) =>
									createElement(
										"span",
										{
											key: m,
											className: chipClass(m),
											title: t("copyModel"),
											onClick: () => copyModel(m),
										},
										m
									)
								)
							),
							createElement(
								"div",
								{ className: "gb_notice info", style: { marginTop: "6px", fontSize: "12px", padding: "8px 12px" } },
								t("effortTip")
							),
							cooldownEntries.length
								? createElement(
										Row,
										{ t, key: "cooldown", label: t("cooldown") },
										cooldownEntries.map(([m, time]) => `${m} → ${new Date(time).toLocaleTimeString()}`).join(t("separator"))
								  )
								: null,
						);
					})(),

					// Model Aliases Card
					createElement(
						"div",
						{ className: "gb_card" },
						createElement("div", { className: "gb_cardTitle" }, t("aliasesTitle")),
						createElement("div", { className: "gb_desc" }, t("aliasesDesc")),
						createElement(
							"div",
							{ className: "gb_alias_grid" },
							aliasesEntries.slice(0, 8).map(([from, to]) =>
								createElement(
									"div",
									{ key: from, className: "gb_alias_item" },
									createElement("span", { className: "gb_alias_from" }, from),
									createElement("span", null, "→"),
									createElement("span", { className: "gb_alias_to" }, to)
								)
							)
						),
					),

					// How-to accordion
					createElement(
						"details",
						{ className: "gb_howto" },
						createElement("summary", null, t("howto")),
						createElement(
							"div",
							{ className: "gb_howtoBody" },
							createElement("div", null, t("autoConfig")),
							createElement(
								"pre",
								null,
								`llm-pi-ai:\n  providers:\n    gemini-oauth:\n      api: openai-completions\n      baseURL: http://127.0.0.1:3080/gemini-oauth-bridge/v1\n      apiKeyEnv: GEMINI_OAUTH_API_KEY\n      models:\n        - id: gemini-3.1-pro-high\n        - id: gemini-3.7-flash-high`
							),
							createElement("div", { className: "gb_desc" }, t("configHelp"))
						)
					),
				);
			}

			ctx.slots.inject("settings.section", () =>
				ctx.slots.register(
					{
						name: "settings.section",
						id: "gemini-oauth-bridge",
						order: 52,
						label: () => "Gemini OAuth",
						locale: "geminiOauth",
					},
					GeminiSection,
				),
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
