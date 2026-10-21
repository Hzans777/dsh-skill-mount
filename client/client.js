window.__ModuleLoader__.load({ id: "dsh-skill-mount", factory: (require) => {

	var module = { exports: {} };
	var exports = module.exports;
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

	const react = require("react");
	const h = react.createElement;
	const { useState, useEffect, useMemo, useRef, useCallback } = react;

	const name = "dsh-skill-mount";
	const NS = "dsh-skill-mount";
	const API = "/skill-mount";

	/* ------------------------------------------------------------------ */
	/* 文案                                                                 */
	/* ------------------------------------------------------------------ */

	const zh = {
		nav: "技能",
		settingsNav: "技能挂载",
		title: "技能挂载",
		subtitle: "勾选的技能会作为指令预装进当前会话；备注名会显示在输入栏的选择器里。",
		search: "搜索技能…",
		empty: "还没有安装任何 SKILL",
		mountedBadge: "已挂载",
		mountedCount: "已挂载",
		closeAll: "全部关闭",
		manage: "管理 / 安装",
		installShort: "安装…",
		folderShort: "目录",
		settingsTip: "备注与卸载在 设置 → 技能挂载",
		refresh: "刷新",
		loading: "读取中…",
		uninstall: "卸载",
		confirm: "确认卸载",
		note: "备注",
		notePlaceholder: "给它起个顺手的名字",
		saved: "已保存",
		globalMount: "全局挂载",
		globalHint: "全局挂载对所有新会话生效；在输入栏里单独开关只影响当前会话。",
		installTitle: "本地安装 SKILL",
		installHint: "支持文件夹（含 SKILL.md）与 .zip 压缩包，装到 ~/.dsh/skills。",
		installPath: "本地路径，例如 E:\\skills\\my-skill 或 E:\\pack.zip",
		install: "安装",
		installPick: "选择 .zip 上传安装",
		installed: "已安装",
		uninstalled: "已卸载（可在回收站恢复）",
		openFolder: "打开技能目录",
		openTrash: "打开回收站",
		noSession: "当前没有会话 ID：这里的开关会写进全局挂载，对所有新会话生效。",
		skillsList: "技能清单",
		scopeUser: "全局",
		scopeWorkspace: "工作区",
		scopeBuiltin: "内置",
		builtinLocked: "内置技能，不可卸载",
		flat: "单文件",
		emptyHint: "把技能文件夹或 zip 放到下面路径，或用上面的安装按钮。",
		pin: "挂载",
		unpin: "关闭",
	};

	const en = {
		nav: "Skills",
		settingsNav: "Skill mounts",
		title: "Skill mounts",
		subtitle: "Checked skills are preloaded into this session; notes rename them everywhere.",
		search: "Search skills…",
		empty: "No SKILL installed yet",
		mountedBadge: "mounted",
		mountedCount: "Mounted",
		closeAll: "Clear all",
		manage: "Manage / install",
		installShort: "Install…",
		folderShort: "Folder",
		settingsTip: "Notes & uninstall: Settings → Skill mounts",
		refresh: "Refresh",
		loading: "Loading…",
		uninstall: "Uninstall",
		confirm: "Confirm",
		note: "Note",
		notePlaceholder: "Display name",
		saved: "Saved",
		globalMount: "Global mount",
		globalHint: "Global mounts apply to every new session.",
		installTitle: "Install a local SKILL",
		installHint: "Folder containing SKILL.md, or a .zip archive.",
		installPath: "Local path, e.g. E:\\skills\\my-skill",
		install: "Install",
		installPick: "Upload .zip",
		installed: "Installed",
		uninstalled: "Uninstalled (recoverable)",
		openFolder: "Open skills folder",
		openTrash: "Open trash",
		noSession: "No session id yet: toggles write the global mount list.",
		skillsList: "Installed skills",
		scopeUser: "Global",
		scopeWorkspace: "Workspace",
		scopeBuiltin: "Built-in",
		builtinLocked: "Built-in · not removable",
		flat: "flat file",
		emptyHint: "Drop a skill folder or zip into the path below.",
		pin: "Mount",
		unpin: "Off",
	};

	const dict = { zh, en };

	function makeT(t) {
		const pick = typeof t === "function" ? t : (key) => dict.zh[key] ?? key;
		return (key) => {
			try {
				const value = pick(key);
				if (typeof value === "string" && value !== "" && value !== key) return value;
			} catch (error) { /* ignore */ }
			return dict.zh[key] ?? key;
		};
	}

	/* ------------------------------------------------------------------ */
	/* 主题：跟随系统色，深色/浅色自动适配                                     */
	/* ------------------------------------------------------------------ */

	const S = {
		border: "1px solid color-mix(in srgb, CanvasText 16%, transparent)",
		softBorder: "1px solid color-mix(in srgb, CanvasText 10%, transparent)",
		hover: "color-mix(in srgb, CanvasText 7%, transparent)",
		accent: "#2f6bff",
		accentSoft: "color-mix(in srgb, #2f6bff 14%, transparent)",
		muted: "color-mix(in srgb, CanvasText 55%, transparent)",
		faint: "color-mix(in srgb, CanvasText 40%, transparent)",
	};

	const styles = {
		pill: {
			display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 9px",
			borderRadius: 999, border: S.border, background: "transparent", color: "inherit",
			fontSize: 12, lineHeight: "26px", cursor: "pointer", userSelect: "none",
			whiteSpace: "nowrap", fontFamily: "inherit",
		},
		pillOn: {
			border: "1px solid color-mix(in srgb, #2f6bff 60%, transparent)",
			background: S.accentSoft, color: "inherit",
		},
		badge: {
			display: "inline-flex", alignItems: "center", justifyContent: "center",
			minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999,
			background: S.accent, color: "#fff", fontSize: 10, fontWeight: 700, lineHeight: 1,
		},
		panel: {
			position: "fixed", zIndex: 9999, width: 384, maxHeight: "min(68vh, 520px)",
			display: "flex", flexDirection: "column", borderRadius: 14, border: S.border,
			background: "Canvas", color: "CanvasText", boxShadow: "0 18px 44px rgba(0,0,0,.24)",
			padding: 10, fontSize: 13, fontFamily: "inherit",
		},
		panelHead: {
			display: "flex", alignItems: "center", gap: 8, padding: "2px 2px 8px",
			borderBottom: S.softBorder, marginBottom: 6,
		},
		panelTitle: { fontWeight: 600, fontSize: 13 },
		panelMeta: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, color: S.muted, fontSize: 11 },
		linkBtn: {
			background: "transparent", border: "none", color: S.accent, cursor: "pointer",
			fontSize: 11, padding: 0, fontFamily: "inherit",
		},
		input: {
			width: "100%", boxSizing: "border-box", height: 30, padding: "0 9px",
			borderRadius: 8, border: S.border, background: "transparent", color: "inherit",
			fontSize: 12, fontFamily: "inherit", outline: "none",
		},
		list: { overflowY: "auto", overflowX: "hidden", padding: "2px 0", margin: 0, listStyle: "none" },
		row: {
			display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 8px",
			borderRadius: 9, cursor: "pointer", userSelect: "none",
		},
		rowOn: { background: S.accentSoft },
		check: {
			flex: "0 0 auto", width: 16, height: 16, marginTop: 1, borderRadius: 5,
			border: S.border, display: "inline-flex", alignItems: "center",
			justifyContent: "center", fontSize: 11, lineHeight: 1, color: "#fff",
		},
		checkOn: { background: S.accent, border: "1px solid " + S.accent },
		rowBody: { flex: "1 1 auto", minWidth: 0 },
		rowName: { fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
		rowReal: { fontSize: 10.5, color: S.faint, fontFamily: "ui-monospace, Menlo, Consolas, monospace" },
		rowDesc: { fontSize: 11, color: S.muted, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
		empty: { padding: "18px 8px", textAlign: "center", color: S.muted, fontSize: 12 },
		panelFoot: {
			display: "flex", alignItems: "center", gap: 10, paddingTop: 8, marginTop: 4,
			borderTop: S.softBorder, fontSize: 11, color: S.muted,
		},
		card: { border: S.border, borderRadius: 12, padding: 14, marginBottom: 14 },
		cardTitle: { fontSize: 13, fontWeight: 700, marginBottom: 4 },
		cardHint: { fontSize: 11.5, color: S.muted, marginBottom: 10, lineHeight: 1.6 },
		btn: {
			height: 30, padding: "0 12px", borderRadius: 8, border: S.border,
			background: "transparent", color: "inherit", fontSize: 12, cursor: "pointer",
			fontFamily: "inherit", whiteSpace: "nowrap",
		},
		btnPrimary: { border: "1px solid " + S.accent, background: S.accent, color: "#fff" },
		btnDanger: { border: "1px solid color-mix(in srgb, #e5484d 55%, transparent)", color: "#e5484d", background: "transparent" },
		btnSmall: { height: 26, padding: "0 9px", fontSize: 11.5, borderRadius: 7, border: S.border, background: "transparent", color: "inherit", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
		table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
		th: { textAlign: "left", fontWeight: 600, color: S.muted, fontSize: 11, padding: "0 8px 8px 0", borderBottom: S.softBorder },
		td: { padding: "9px 8px 9px 0", borderBottom: S.softBorder, verticalAlign: "middle" },
		tag: { display: "inline-block", padding: "1px 6px", borderRadius: 999, fontSize: 10, border: S.border, color: S.muted },
		error: { marginTop: 8, color: "#e5484d", fontSize: 11.5, whiteSpace: "pre-wrap" },
		ok: { marginTop: 8, color: "#2f9e44", fontSize: 11.5 },
		grid: { display: "flex", gap: 8, alignItems: "center" },
		hintLine: { fontSize: 11, color: S.faint, wordBreak: "break-all", marginTop: 6 },
	};

	/* ------------------------------------------------------------------ */
	/* 网络                                                                 */
	/* ------------------------------------------------------------------ */

	async function request(pathname, options) {
		const response = await fetch(API + pathname, Object.assign({ cache: "no-store" }, options || {}));
		const text = await response.text();
		let payload = null;
		try { payload = text === "" ? null : JSON.parse(text); } catch (error) { payload = { error: text }; }
		if (!response.ok) throw new Error((payload && payload.error) || ("HTTP " + response.status));
		return payload;
	}

	function postJson(pathname, body) {
		return request(pathname, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body || {}),
		});
	}

	const EMPTY = {
		skills: [], mounts: [], ownMounts: null, globalMounts: [], notes: {},
		roots: { user: "", trash: "", workspaces: [] }, sessionId: "",
	};

	/** One isolated state container (tray and settings keep separate ones). */
	function createStore() {
		const state = {
			data: EMPTY, loading: false, error: "", seq: 0, listeners: new Set(),
			subscribe(listener) {
				state.listeners.add(listener);
				return () => { state.listeners.delete(listener); };
			},
			emit() {
				for (const listener of Array.from(state.listeners)) {
					try { listener(); } catch (error) { /* ignore */ }
				}
			},
			patch(patch) { state.data = Object.assign({}, state.data, patch); state.emit(); },
			async load(sessionId) {
				const token = ++state.seq;
				state.loading = true; state.error = ""; state.emit();
				try {
					const data = await request("/state?sessionId=" + encodeURIComponent(sessionId || ""));
					if (token !== state.seq) return;
					state.data = Object.assign({}, EMPTY, data);
					state.loading = false; state.emit();
				} catch (error) {
					if (token !== state.seq) return;
					state.error = String((error && error.message) || error);
					state.loading = false; state.emit();
				}
			},
			async mutate(pathname, body) {
				const data = await postJson(pathname, body);
				if (data && Array.isArray(data.skills)) state.data = Object.assign({}, EMPTY, data);
				else state.patch({});
				state.emit();
				return data;
			},
		};
		return state;
	}

	/** Broadcast so the tray and the settings page stay in sync. */
	const bus = {
		listeners: new Set(),
		emit() { for (const listener of Array.from(bus.listeners)) { try { listener(); } catch (error) { /* ignore */ } } },
		on(listener) { bus.listeners.add(listener); return () => { bus.listeners.delete(listener); }; },
	};

	function useStore(store, sessionId, active) {
		const [, force] = useState(0);
		useEffect(() => {
			const off = store.subscribe(() => force((value) => value + 1));
			return off;
		}, [store]);
		useEffect(() => {
			if (!active) return undefined;
			store.load(sessionId);
			const off = bus.on(() => { store.load(sessionId); });
			return off;
		}, [store, sessionId, active]);
		return store;
	}

	/* ------------------------------------------------------------------ */
	/* 会话 ID                                                              */
	/* ------------------------------------------------------------------ */

	const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

	function snapshotCurrent(sessions) {
		try {
			const snapshot = sessions && sessions.list && sessions.list.getSnapshot && sessions.list.getSnapshot();
			if (snapshot && typeof snapshot.current === "string" && snapshot.current !== "") return snapshot.current;
		} catch (error) { /* ignore */ }
		return "";
	}

	function selectionSession(uiWorkspace) {
		try {
			const snapshot = uiWorkspace && uiWorkspace.selection && uiWorkspace.selection.getSnapshot
				&& uiWorkspace.selection.getSnapshot();
			if (snapshot && typeof snapshot.sessionId === "string" && snapshot.sessionId !== "") return snapshot.sessionId;
		} catch (error) { /* ignore */ }
		return "";
	}

	function resolveSessionId(props) {
		if (props && typeof props.sessionId === "string" && props.sessionId !== "") return props.sessionId;
		const fromSelection = selectionSession(props && props.uiWorkspace);
		if (fromSelection !== "") return fromSelection;
		const fromList = snapshotCurrent(props && props.sessions);
		if (fromList !== "") return fromList;
		try {
			const match = UUID_RE.exec(String(window.location.hash || "") + " " + String(window.location.pathname || ""));
			if (match) return match[1];
		} catch (error) { /* ignore */ }
		return "";
	}

	/* ------------------------------------------------------------------ */
	/* 小组件                                                               */
	/* ------------------------------------------------------------------ */

	function displayName(skill) {
		return skill && skill.note ? skill.note : (skill ? skill.name : "");
	}

	function filterSkills(skills, query) {
		const text = (query || "").trim().toLowerCase();
		if (text === "") return skills;
		return skills.filter((skill) => (
			String(skill.name || "").toLowerCase().includes(text)
			|| String(skill.note || "").toLowerCase().includes(text)
			|| String(skill.description || "").toLowerCase().includes(text)
		));
	}

	function Check(props) {
		return h("span", {
			style: Object.assign({}, styles.check, props.on ? styles.checkOn : null),
			"aria-hidden": "true",
		}, props.on ? "✓" : "");
	}

	function SkillRow(props) {
		const { skill, mounted, onToggle, t } = props;
		const [hover, setHover] = useState(false);
		return h("li", {
			style: Object.assign({}, styles.row, mounted ? styles.rowOn : null, hover ? { background: mounted ? S.accentSoft : S.hover } : null),
			onMouseEnter: () => setHover(true),
			onMouseLeave: () => setHover(false),
			onClick: () => onToggle(!mounted),
			title: mounted ? t("unpin") : t("pin"),
		},
			h(Check, { on: mounted }),
			h("div", { style: styles.rowBody },
				h("div", { style: styles.rowName }, displayName(skill)),
				skill.note ? h("div", { style: styles.rowReal }, skill.name) : null,
				skill.description ? h("div", { style: styles.rowDesc }, skill.description) : null,
			),
		);
	}

	/* ------------------------------------------------------------------ */
	/* 输入栏托盘                                                            */
	/* ------------------------------------------------------------------ */

	const trayStore = createStore();

	function SkillTray(props) {
		const t = makeT(props.t);
		const sessionId = resolveSessionId(props);
		const store = useStore(trayStore, sessionId, true);
		const data = store.data;
		const [open, setOpen] = useState(false);
		const [query, setQuery] = useState("");
		const [pos, setPos] = useState(null);
		const [busy, setBusy] = useState(false);
		const [error, setError] = useState("");
		const triggerRef = useRef(null);
		const panelRef = useRef(null);
		const mounted = Array.isArray(data.mounts) ? data.mounts : [];
		const skills = useMemo(() => filterSkills(data.skills || [], query), [data.skills, query]);

		const place = useCallback(() => {
			const node = triggerRef.current;
			if (!node) return;
			const rect = node.getBoundingClientRect();
			const width = 384;
			const left = Math.max(8, Math.min(rect.left - 24, window.innerWidth - width - 8));
			setPos({ left, bottom: Math.max(8, window.innerHeight - rect.top + 8) });
		}, []);

		useEffect(() => {
			if (!open) return undefined;
			place();
			const onDown = (event) => {
				const panel = panelRef.current;
				const trigger = triggerRef.current;
				if (panel && panel.contains(event.target)) return;
				if (trigger && trigger.contains(event.target)) return;
				setOpen(false);
			};
			const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
			document.addEventListener("mousedown", onDown, true);
			document.addEventListener("keydown", onKey);
			window.addEventListener("resize", place);
			return () => {
				document.removeEventListener("mousedown", onDown, true);
				document.removeEventListener("keydown", onKey);
				window.removeEventListener("resize", place);
			};
		}, [open, place]);

		const toggle = useCallback(async (skillName, next) => {
			setBusy(true); setError("");
			try {
				await store.mutate("/toggle", { sessionId, name: skillName, mounted: next });
				bus.emit();
			} catch (err) {
				setError(String((err && err.message) || err));
			} finally {
				setBusy(false);
			}
		}, [store, sessionId]);

		const clearAll = useCallback(async () => {
			setBusy(true); setError("");
			try {
				await store.mutate("/clear", { sessionId });
				bus.emit();
			} catch (err) {
				setError(String((err && err.message) || err));
			} finally {
				setBusy(false);
			}
		}, [store, sessionId]);

		const installPrompt = useCallback(async () => {
			let path = "";
			try { path = window.prompt(t("installPath"), "") || ""; } catch (error) { path = ""; }
			if (!path.trim()) return;
			setBusy(true); setError("");
			try {
				await store.mutate("/install", { path: path.trim() });
				bus.emit();
				await store.load(sessionId);
			} catch (err) {
				setError(String((err && err.message) || err));
			} finally {
				setBusy(false);
			}
		}, [store, sessionId, t]);

		const revealFolder = useCallback(() => {
			store.mutate("/reveal", { which: "user" }).catch(() => {});
		}, [store]);

		const count = mounted.length;
		const pillStyle = Object.assign({}, styles.pill, count > 0 || open ? styles.pillOn : null);

		return h(react.Fragment, null,
			h("button", {
				ref: triggerRef,
				type: "button",
				style: pillStyle,
				onClick: () => { setOpen((value) => !value); setError(""); },
				title: t("title"),
			},
				h("span", { style: { fontSize: 13 }, "aria-hidden": "true" }, "🧩"),
				h("span", null, t("nav")),
				count > 0 ? h("span", { style: styles.badge }, String(count)) : null,
			),
			open && pos ? h("div", { ref: panelRef, style: Object.assign({}, styles.panel, { left: pos.left, bottom: pos.bottom }) },
				h("div", { style: styles.panelHead },
					h("span", { style: styles.panelTitle }, t("title")),
					h("span", { style: styles.panelMeta },
						h("span", null, t("mountedCount") + " " + count),
						count > 0 ? h("button", { type: "button", style: styles.linkBtn, onClick: clearAll, disabled: busy }, t("closeAll")) : null,
					),
				),
				h("input", {
					style: Object.assign({}, styles.input, { marginBottom: 8 }),
					placeholder: t("search"),
					value: query,
					onChange: (event) => setQuery(event.target.value),
					autoFocus: true,
				}),
				store.loading && (data.skills || []).length === 0
					? h("div", { style: styles.empty }, t("loading"))
					: skills.length === 0
						? h("div", { style: styles.empty }, (data.skills || []).length === 0 ? t("empty") : t("empty"))
						: h("ul", { style: styles.list }, skills.map((skill) => h(SkillRow, {
							key: skill.name,
							skill,
							mounted: mounted.includes(skill.name),
							onToggle: (next) => toggle(skill.name, next),
							t,
						}))),
				error ? h("div", { style: styles.error }, error) : null,
				!sessionId ? h("div", { style: styles.hintLine }, t("noSession")) : null,
				h("div", { style: styles.hintLine }, t("settingsTip")),
				h("div", { style: styles.panelFoot },
					h("button", { type: "button", style: styles.linkBtn, onClick: installPrompt, disabled: busy }, t("installShort")),
					h("button", { type: "button", style: styles.linkBtn, onClick: revealFolder }, t("folderShort")),
					h("span", { style: { marginLeft: "auto", opacity: 0.65 } }, (data.roots && data.roots.user) || ""),
					h("button", { type: "button", style: styles.linkBtn, onClick: () => store.load(sessionId) }, t("refresh")),
				),
			) : null,
		);
	}

	/* ------------------------------------------------------------------ */
	/* 设置页                                                               */
	/* ------------------------------------------------------------------ */

	const settingsStore = createStore();

	function NoteEditor(props) {
		const { skill, onSave, placeholder } = props;
		const [value, setValue] = useState(skill.note || "");
		const [state, setState] = useState("");
		useEffect(() => { setValue(skill.note || ""); }, [skill.note]);
		const commit = useCallback(async () => {
			if ((value || "") === (skill.note || "")) return;
			setState("saving");
			try {
				await onSave(value);
				setState("saved");
			} catch (error) {
				setState("error");
			}
		}, [value, skill.note, onSave]);
		return h("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
			h("input", {
				style: Object.assign({}, styles.input, { height: 26, width: 150 }),
				value,
				placeholder,
				onChange: (event) => { setValue(event.target.value); setState(""); },
				onBlur: commit,
				onKeyDown: (event) => { if (event.key === "Enter") { event.currentTarget.blur(); } },
			}),
			state === "saved" ? h("span", { style: { fontSize: 10, color: "#2f9e44" } }, "✓") : null,
			state === "error" ? h("span", { style: { fontSize: 10, color: "#e5484d" } }, "!") : null,
		);
	}

	function SettingsView(props) {
		const t = makeT(props.t);
		const store = useStore(settingsStore, "", true);
		const data = store.data;
		const [query, setQuery] = useState("");
		const [path, setPath] = useState("");
		const [note, setNote] = useState("");
		const [busy, setBusy] = useState(false);
		const [confirming, setConfirming] = useState("");
		const fileRef = useRef(null);
		const skills = useMemo(() => filterSkills(data.skills || [], query), [data.skills, query]);
		const globalMounts = Array.isArray(data.globalMounts) ? data.globalMounts : [];

		const flash = useCallback((text) => { setNote(text); window.setTimeout(() => setNote(""), 4000); }, []);

		const toggleGlobal = useCallback(async (skillName, next) => {
			setBusy(true);
			try {
				await store.mutate("/toggle", { sessionId: "", name: skillName, mounted: next });
				bus.emit();
			} catch (error) {
				flash(String((error && error.message) || error));
			} finally { setBusy(false); }
		}, [store, flash]);

		const saveNote = useCallback(async (skillName, value) => {
			await store.mutate("/note", { name: skillName, note: value });
			bus.emit();
		}, [store]);

		const uninstall = useCallback(async (skillName) => {
			if (confirming !== skillName) { setConfirming(skillName); window.setTimeout(() => setConfirming(""), 3500); return; }
			setConfirming("");
			setBusy(true);
			try {
				await store.mutate("/remove", { name: skillName });
				bus.emit();
				flash(t("uninstalled"));
			} catch (error) {
				flash(String((error && error.message) || error));
			} finally { setBusy(false); }
		}, [confirming, store, flash, t]);

		const installPath = useCallback(async () => {
			const target = path.trim();
			if (target === "") return;
			setBusy(true);
			try {
				const result = await store.mutate("/install", { path: target, scope: "user" });
				bus.emit();
				flash(t("installed") + "：" + ((result && result.installed) || []).join("、"));
				setPath("");
			} catch (error) {
				flash(String((error && error.message) || error));
			} finally { setBusy(false); }
		}, [path, store, flash, t]);

		const installZip = useCallback(async (file) => {
			if (!file) return;
			setBusy(true);
			try {
				const buffer = await file.arrayBuffer();
				const result = await request("/install-zip?scope=user&filename=" + encodeURIComponent(file.name || "skills.zip"), {
					method: "POST",
					headers: { "content-type": "application/zip" },
					body: buffer,
				});
				await store.load("");
				bus.emit();
				flash(t("installed") + "：" + (((result && result.installed) || []).join("、")));
			} catch (error) {
				flash(String((error && error.message) || error));
			} finally {
				setBusy(false);
				if (fileRef.current) fileRef.current.value = "";
			}
		}, [store, flash, t]);

		const reveal = useCallback(async (which) => {
			try { await postJson("/reveal", { which }); } catch (error) { /* ignore */ }
		}, []);

		return h("div", { style: { padding: "4px 2px 24px", fontSize: 13 } },
			h("div", { style: { marginBottom: 14 } },
				h("div", { style: { fontSize: 16, fontWeight: 700, marginBottom: 4 } }, t("title")),
				h("div", { style: { fontSize: 12, color: S.muted, lineHeight: 1.7 } }, t("subtitle")),
			),

			h("div", { style: styles.card },
				h("div", { style: styles.cardTitle }, t("installTitle")),
				h("div", { style: styles.cardHint }, t("installHint")),
				h("div", { style: styles.grid },
					h("input", {
						style: Object.assign({}, styles.input, { flex: "1 1 auto" }),
						placeholder: t("installPath"),
						value: path,
						onChange: (event) => setPath(event.target.value),
						onKeyDown: (event) => { if (event.key === "Enter") installPath(); },
					}),
					h("button", { type: "button", style: Object.assign({}, styles.btn, styles.btnPrimary), onClick: installPath, disabled: busy }, t("install")),
					h("button", { type: "button", style: styles.btn, onClick: () => fileRef.current && fileRef.current.click(), disabled: busy }, t("installPick")),
					h("input", {
						ref: fileRef,
						type: "file",
						accept: ".zip,application/zip",
						style: { display: "none" },
						onChange: (event) => installZip(event.target.files && event.target.files[0]),
					}),
				),
				h("div", { style: Object.assign({}, styles.grid, { marginTop: 8 }) },
					h("span", { style: styles.hintLine }, (data.roots && data.roots.user) || ""),
					h("button", { type: "button", style: Object.assign({}, styles.btnSmall, { marginLeft: "auto" }), onClick: () => reveal("user") }, t("openFolder")),
					h("button", { type: "button", style: styles.btnSmall, onClick: () => reveal("trash") }, t("openTrash")),
				),
			),

			h("div", { style: styles.card },
				h("div", { style: Object.assign({}, styles.cardTitle, { display: "flex", alignItems: "center", gap: 10 }) },
					h("span", null, t("skillsList") + " · " + ((data.skills || []).length)),
					h("input", {
						style: Object.assign({}, styles.input, { height: 26, width: 180, marginLeft: "auto" }),
						placeholder: t("search"),
						value: query,
						onChange: (event) => setQuery(event.target.value),
					}),
				),
				h("div", { style: Object.assign({}, styles.cardHint, { marginTop: 8 }) }, t("globalHint")),
				((data.skills || []).length === 0)
					? h("div", { style: styles.empty }, t("emptyHint"))
					: h("table", { style: styles.table },
						h("thead", null, h("tr", null,
							h("th", { style: styles.th }, t("note")),
							h("th", { style: styles.th }, "SKILL"),
							h("th", { style: styles.th }, ""),
							h("th", { style: Object.assign({}, styles.th, { textAlign: "center" }) }, t("globalMount")),
							h("th", { style: Object.assign({}, styles.th, { textAlign: "right" }) }, ""),
						)),
						h("tbody", null, skills.map((skill) => h("tr", { key: skill.name },
							h("td", { style: styles.td }, h(NoteEditor, {
								skill,
								placeholder: t("notePlaceholder"),
								onSave: (value) => saveNote(skill.name, value),
							})),
							h("td", { style: Object.assign({}, styles.td, { minWidth: 160 }) },
								h("div", { style: { fontSize: 12, fontFamily: "ui-monospace, Menlo, Consolas, monospace" } }, skill.name),
								h("div", { style: { fontSize: 11, color: S.muted, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } }, skill.description || ""),
							),
							h("td", { style: styles.td },
								h("span", { style: styles.tag }, skill.scope === "workspace" ? t("scopeWorkspace") : skill.scope === "builtin" ? t("scopeBuiltin") : t("scopeUser")),
								skill.flat ? h("span", { style: Object.assign({}, styles.tag, { marginLeft: 4 }) }, t("flat")) : null,
							),
							h("td", { style: Object.assign({}, styles.td, { textAlign: "center" }) },
								h("button", {
									type: "button",
									style: Object.assign({}, styles.btnSmall, globalMounts.includes(skill.name) ? { border: "1px solid " + S.accent, color: S.accent } : null),
									onClick: () => toggleGlobal(skill.name, !globalMounts.includes(skill.name)),
									disabled: busy,
								}, globalMounts.includes(skill.name) ? "●" : "○"),
							),
							h("td", { style: Object.assign({}, styles.td, { textAlign: "right" }) },
								skill.uninstallable === false
									? h("span", { style: Object.assign({}, styles.hintLine, { fontSize: 11 }) }, t("builtinLocked"))
									: h("button", {
										type: "button",
										style: Object.assign({}, styles.btnSmall, confirming === skill.name ? styles.btnDanger : null),
										onClick: () => uninstall(skill.name),
										disabled: busy,
									}, confirming === skill.name ? t("confirm") : t("uninstall")),
							),
						))),
					),
				note ? h("div", { style: styles.ok }, note) : null,
				store.error ? h("div", { style: styles.error }, store.error) : null,
			),
		);
	}

	/* ------------------------------------------------------------------ */
	/* 兜底：槽位条目渲染异常不再静默消失                                    */
	/* ------------------------------------------------------------------ */

	class EntryBoundary extends react.Component {
		constructor(props) {
			super(props);
			this.state = { error: null };
		}
		static getDerivedStateFromError(error) {
			return { error };
		}
		render() {
			const error = this.state.error;
			if (error === null) return this.props.children;
			const message = String((error && error.message) || error);
			return h("button", {
				type: "button",
				style: { fontSize: 12, padding: "3px 8px", borderRadius: 999, border: "1px solid rgba(229,72,77,.5)", background: "transparent", color: "#e5484d", cursor: "pointer" },
				onClick: () => { try { window.alert("dsh-skill-mount: " + message); } catch (ignored) { /* ignore */ } },
				title: message,
			}, this.props.label);
		}
	}

	function withBoundary(Component, label) {
		return function BoundedEntry(props) {
			return h(EntryBoundary, { label }, h(Component, props));
		};
	}

	/* ------------------------------------------------------------------ */
	/* 注册                                                                 */
	/* ------------------------------------------------------------------ */

	function apply(ctx) {
		ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-skill-mount: dictionaries");
		const t = ctx.locale.bind(NS);

		// 注意：注入面里绝不能出现未声明注入的 ctx 服务（cordis 代理会抛
		// "cannot get property X without inject"），而槽位渲染抛错会被
		// SlotErrorBoundary 抓住并把该条目永久 abdicate —— 按钮就静默消失了。
		// sessionId 由 session 作用域槽位作为标准 prop 直接下发，不需要自己去取服务。
		ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
			name: "conversation.input.right",
			id: "dsh-skill-mount-tray",
			order: 22,
			label: () => t("nav"),
			locale: NS,
			inject: (sessionId) => ({
				sessionId: sessionId || "",
				t,
			}),
		}, withBoundary(SkillTray, "🧩")));

		ctx.slots.inject("settings.section", () => ctx.slots.register({
			name: "settings.section",
			id: "skill-mount",
			order: 46,
			label: () => t("settingsNav"),
			locale: NS,
			inject: () => ({ t }),
		}, withBoundary(SettingsView, "技能挂载（渲染出错，点击查看）")));
	}

	exports.name = name;
	exports.inject = ["slots", "locale"];
	exports.apply = apply;
	return module.exports;
}
});
