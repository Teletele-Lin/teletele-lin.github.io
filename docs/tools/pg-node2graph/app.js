"use strict";

const example = `{QUERY
   :commandType 1
   :hasAggs false
   :targetList (
      {TARGETENTRY
         :expr {VAR :varno 1 :varattno 1 :vartype 23}
         :resname id
         :resjunk false
      }
   )
   :jointree {FROMEXPR
      :fromlist ({RANGETBLREF :rtindex 1})
      :quals {OPEXPR
         :opno 97
         :args (
            {VAR :varno 1 :varattno 1 :vartype 23}
            {CONST :consttype 23 :constisnull false}
         )
      }
   }
   :limitOffset <>
   :stmt_location 0
}`;

const element = id => document.getElementById(id);
const source = element("source");
const skipEmpty = element("skip-empty");
const viewport = element("graph-viewport");
const surface = element("graph-surface");
const status = element("status");
const graphPanel = element("graph-panel");
const viewer = element("graph-viewer");
const reopenButton = element("reopen-graph");
const fullscreenButton = element("fullscreen-graph");
const clearHistoryButton = element("clear-history");
const historyKey = "pgnode2graph.history.v1";
const historyLimit = 12;
const graphMargin = 28;
const minZoom = 0.025;
const maxZoom = 5;

let history = readHistory();
let renderer;
let graph;
let rendering = false;
let zoom = 1;
let fitMode = false;
let pan;
let returnFocus;
let savedView;

function setStatus(message, isError = false) {
    status.textContent = message;
    status.dataset.error = String(isError);
}

function setGraphFeedback(message, isError = false) {
    const feedback = element("graph-feedback");
    feedback.textContent = message;
    feedback.dataset.error = String(isError);
}

function readHistory() {
    try {
        const stored = JSON.parse(localStorage.getItem(historyKey) || "[]");
        return stored.filter(entry =>
            typeof entry?.input === "string" && typeof entry.name === "string" &&
            Number.isFinite(entry.createdAt) && typeof entry.skipEmpty === "boolean"
        ).slice(0, historyLimit);
    } catch {
        return [];
    }
}

function writeHistory() {
    try {
        localStorage.setItem(historyKey, JSON.stringify(history));
        return true;
    } catch {
        return false;
    }
}

function showHistory(emptyMessage = "暂无历史记录。") {
    const list = element("history-list");
    const empty = element("history-empty");
    empty.hidden = history.length > 0;
    empty.textContent = emptyMessage;
    clearHistoryButton.hidden = history.length === 0;
    const items = history.map(entry => {
        const item = document.createElement("li");
        const open = document.createElement("button");
        const time = document.createElement("time");
        open.type = "button";
        open.className = "history-entry";
        open.textContent = entry.name;
        time.className = "hint";
        const date = new Date(entry.createdAt);
        time.textContent = date.toLocaleString();
        open.append(time);
        open.addEventListener("click", () => {
            if (rendering) return;
            source.value = entry.input;
            skipEmpty.checked = entry.skipEmpty;
            renderCurrent({ trigger: open });
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "button";
        remove.textContent = "删除";
        remove.setAttribute("aria-label", `删除历史记录 ${entry.name} ${time.textContent}`);
        remove.addEventListener("click", () => {
            history = history.filter(candidate => candidate !== entry);
            const saved = writeHistory();
            showHistory();
            setStatus(saved ? "已删除历史记录。" : "已从当前页面移除记录，浏览器存储不可用。", !saved);
        });

        item.append(open, remove);
        return item;
    });
    list.replaceChildren(...items);
}

function clearHistory() {
    let message = "已清空本机历史。";
    try {
        localStorage.removeItem(historyKey);
    } catch {
        message = "已清空当前页面的历史。浏览器未允许清除已保存的记录。";
    }
    history = [];
    showHistory(message);
    element("history-title").focus({ preventScroll: true });
}

function saveHistory(input, options, tree) {
    history = history.filter(entry => entry.input !== input || entry.skipEmpty !== options.skipEmpty);
    const label = tree.roots === 1 ? tree.nodes[0].tag : `${tree.nodes[0].tag} · ${tree.roots} 棵树`;
    history.unshift({ input, skipEmpty: options.skipEmpty, name: label, createdAt: Date.now() });
    history = history.slice(0, historyLimit);
    const saved = writeHistory();
    showHistory();
    return saved;
}

function showSelection(id = null) {
    if (!graph) return;
    const relevant = new Set(id ? [id] : []);
    for (const direction of [graph.from, graph.to]) {
        const pending = id ? [id] : [];
        const visited = new Set(pending);
        while (pending.length) {
            const next = pending.pop();
            for (const connected of direction.get(next)) {
                if (visited.has(connected)) continue;
                visited.add(connected);
                relevant.add(connected);
                pending.push(connected);
            }
        }
    }

    for (const [nodeId, group] of graph.groups) {
        group.classList.toggle("selected", nodeId === id);
        group.classList.toggle("dimmed", Boolean(id) && !relevant.has(nodeId));
        group.setAttribute("aria-pressed", String(nodeId === id));
    }
    for (const { group, from, to } of graph.edgeGroups) {
        group.classList.toggle("dimmed", Boolean(id) && !(relevant.has(from) && relevant.has(to)));
    }
    element("selection").textContent = id
        ? `${graph.tags.get(id)} · ${relevant.size - 1} 个关联节点`
        : "点击节点以查看连接";
}

function mountGraph(tree, svgText, svg) {
    const [, , width, height] = svg.getAttribute("viewBox").split(/\s+/).map(Number);
    const groups = new Map([...svg.querySelectorAll("g.node")].map(group =>
        [group.querySelector("title").textContent, group]
    ));
    const tags = new Map(tree.nodes.map(({ id, tag }) => [id, tag]));
    const from = new Map(tree.nodes.map(({ id }) => [id, []]));
    const to = new Map(tree.nodes.map(({ id }) => [id, []]));
    for (const edge of tree.edges) {
        from.get(edge.from).push(edge.to);
        to.get(edge.to).push(edge.from);
    }
    const edgeGroups = [...svg.querySelectorAll("g.edge")].map(group => {
        const [parent, child] = group.querySelector("title").textContent.split("->");
        return { group, from: parent.split(":")[0], to: child.split(":")[0] };
    });

    svg.setAttribute("aria-label", "PostgreSQL 节点树");
    for (const [id, group] of groups) {
        group.dataset.nodeId = id;
        group.setAttribute("tabindex", "0");
        group.setAttribute("role", "button");
        group.setAttribute("aria-label", `查看 ${tags.get(id)} 的连接`);
    }

    graph = { ...tree, svgText, svg, width, height, groups, tags, edgeGroups, from, to };
    savedView = undefined;
    surface.replaceChildren(svg);
    element("graph-metric").textContent = `${tree.roots} 棵树 · ${tree.nodes.length} 个节点 · ${tree.edges.length} 条连线`;
    showSelection();
    setGraphFeedback("");
}

async function renderCurrent({ trigger, record = false }) {
    if (rendering) return;
    const input = source.value.trim();
    const options = { skipEmpty: skipEmpty.checked };
    rendering = true;
    element("generate").disabled = true;
    element("load-example").disabled = true;
    setStatus("正在生成图形…");

    try {
        const tree = PGNode2Dot.node2dot(input, options);
        renderer ??= Viz.instance().catch(error => {
            renderer = undefined;
            throw error;
        });
        const viz = await renderer;
        // Give the browser a chance to paint the status before Graphviz lays out the tree.
        await new Promise(resolve => setTimeout(resolve, 0));
        const layout = JSON.parse(viz.renderString(tree.dot, { format: "json0" }));
        const dot = PGNode2Dot.leftAlignDot(tree, layout);
        const svgText = viz.renderString(dot, { format: "svg" });
        const svg = new DOMParser().parseFromString(svgText, "image/svg+xml").documentElement;
        mountGraph({ ...tree, dot }, svgText, svg);
        reopenButton.hidden = false;
        openGraphViewer(trigger);
        const saved = !record || saveHistory(input, options, tree);
        setStatus(saved ? "" : "图已生成，浏览器存储不可用。历史仅在当前页面保留。", !saved);
    } catch (error) {
        const message = error instanceof SyntaxError ? error.message : `图形生成失败。 ${error.message}`;
        setStatus(message, true);
    } finally {
        rendering = false;
        element("generate").disabled = false;
        element("load-example").disabled = false;
    }
}

function setZoom(value) {
    zoom = Math.max(minZoom, Math.min(maxZoom, value));
    const width = graph.width * zoom;
    const height = graph.height * zoom;
    graph.svg.setAttribute("width", width);
    graph.svg.setAttribute("height", height);
    surface.style.width = `max(100%, ${width + graphMargin}px)`;
    surface.style.height = `max(100%, ${height + graphMargin}px)`;
    element("zoom-level").textContent = `${Math.round(zoom * 100)}%`;
}

function fitGraph() {
    fitMode = true;
    setZoom(Math.min(
        (viewport.clientWidth - graphMargin) / graph.width,
        (viewport.clientHeight - graphMargin) / graph.height,
        1
    ));
    viewport.scrollTo(0, 0);
}

function viewportCenter() {
    const bounds = viewport.getBoundingClientRect();
    return {
        x: bounds.left + viewport.clientLeft + viewport.clientWidth / 2,
        y: bounds.top + viewport.clientTop + viewport.clientHeight / 2,
    };
}

function graphPointAt(anchor) {
    const bounds = graph.svg.getBoundingClientRect();
    return { x: (anchor.x - bounds.left) / zoom, y: (anchor.y - bounds.top) / zoom };
}

function scrollGraphPointTo(point, anchor) {
    const bounds = graph.svg.getBoundingClientRect();
    viewport.scrollLeft += bounds.left + point.x * zoom - anchor.x;
    viewport.scrollTop += bounds.top + point.y * zoom - anchor.y;
}

function resetZoom() {
    fitMode = false;
    setZoom(1);
    const root = graph.groups.get(graph.nodes[0].id).getBoundingClientRect();
    const bounds = viewport.getBoundingClientRect();
    viewport.scrollLeft += root.left - bounds.left - graphMargin / 2;
    viewport.scrollTop += root.top + root.height / 2 - viewportCenter().y;
}

function zoomGraph(factor, anchor = viewportCenter()) {
    const point = graphPointAt(anchor);
    fitMode = false;
    setZoom(zoom * factor);
    scrollGraphPointTo(point, anchor);
}

function restoreView(point) {
    if (fitMode) {
        fitGraph();
    } else {
        scrollGraphPointTo(point, viewportCenter());
    }
}

function updateFullscreenButton() {
    fullscreenButton.hidden = !document.fullscreenEnabled;
    fullscreenButton.textContent = document.fullscreenElement === graphPanel
        ? "退出浏览器全屏"
        : "浏览器全屏";
}

function openGraphViewer(trigger) {
    returnFocus = trigger;
    viewer.showModal();
    document.body.classList.add("viewer-open");
    updateFullscreenButton();
    if (savedView) restoreView(savedView);
    else resetZoom();
}

async function closeGraphViewer() {
    if (document.fullscreenElement === graphPanel) {
        await document.exitFullscreen().catch(() => {});
    }
    if (!viewer.open) return;
    savedView = graphPointAt(viewportCenter());
    viewer.close();
    document.body.classList.remove("viewer-open");
    returnFocus.focus({ preventScroll: true });
}

async function toggleBrowserFullscreen() {
    const point = graphPointAt(viewportCenter());
    try {
        if (document.fullscreenElement === graphPanel) {
            await document.exitFullscreen();
        } else {
            await graphPanel.requestFullscreen();
        }
        restoreView(point);
    } catch {
        setGraphFeedback("浏览器未能切换全屏，仍可在展开画布中查看。", true);
    }
}

async function copyDot() {
    const dot = graph?.dot;
    if (!dot) return;
    try {
        await navigator.clipboard.writeText(dot);
        setGraphFeedback("已复制 DOT 源码。");
        return;
    } catch {
        // Some browsers restrict the Clipboard API for file:// pages.
        const field = document.createElement("textarea");
        field.value = dot;
        field.style.cssText = "position:fixed;opacity:0;top:0;left:0;pointer-events:none";
        graphPanel.append(field);
        field.select();
        try {
            if (!document.execCommand("copy")) throw new Error("Clipboard rejected");
            setGraphFeedback("已复制 DOT 源码。");
        } catch {
            setGraphFeedback("浏览器未允许复制。", true);
        } finally {
            field.remove();
            element("copy-dot").focus();
        }
    }
}

function exportSvg() {
    if (!graph) return;
    const now = new Date();
    const [month, day, hours, minutes, seconds] = [
        now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds(),
    ].map(part => String(part).padStart(2, "0"));
    const url = URL.createObjectURL(new Blob([graph.svgText], { type: "image/svg+xml;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `nodegraph-${now.getFullYear()}${month}${day}-${hours}${minutes}${seconds}.svg`;
    graphPanel.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadExample(event) {
    if (rendering) return;
    source.value = example;
    skipEmpty.checked = skipEmpty.defaultChecked;
    renderCurrent({ trigger: event.currentTarget });
}

element("source-form").addEventListener("submit", event => {
    event.preventDefault();
    renderCurrent({ trigger: event.submitter || element("generate"), record: true });
});
element("load-example").addEventListener("click", loadExample);
element("copy-dot").addEventListener("click", copyDot);
element("export-svg").addEventListener("click", exportSvg);
element("zoom-out").addEventListener("click", () => zoomGraph(1 / 1.25));
element("zoom-in").addEventListener("click", () => zoomGraph(1.25));
element("reset-zoom").addEventListener("click", resetZoom);
element("fit-graph").addEventListener("click", fitGraph);
reopenButton.addEventListener("click", () => {
    if (!rendering) openGraphViewer(reopenButton);
});
element("close-graph").addEventListener("click", closeGraphViewer);
fullscreenButton.addEventListener("click", toggleBrowserFullscreen);
document.addEventListener("fullscreenchange", updateFullscreenButton);
viewer.addEventListener("cancel", event => {
    event.preventDefault();
    closeGraphViewer();
});

viewport.addEventListener("wheel", event => {
    if (!viewer.open || !event.ctrlKey || !event.cancelable || !event.deltaY) return;
    event.preventDefault();
    const unit = [1, 16, viewport.clientHeight][event.deltaMode] ?? 1;
    const delta = Math.max(-160, Math.min(160, event.deltaY * unit));
    zoomGraph(Math.exp(-delta * 0.0025), { x: event.clientX, y: event.clientY });
}, { passive: false });

viewport.addEventListener("click", event => {
    if (!pan?.moved) showSelection(event.target.closest("[data-node-id]")?.dataset.nodeId);
});
viewport.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
        const id = event.target.closest("[data-node-id]")?.dataset.nodeId;
        if (!id) return;
        event.preventDefault();
        showSelection(id);
    }
});
viewport.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !event.isPrimary) return;
    pan = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
        moved: false,
    };
});
viewport.addEventListener("pointermove", event => {
    if (event.pointerId !== pan?.pointerId) return;
    const x = event.clientX - pan.x;
    const y = event.clientY - pan.y;
    if (!pan.moved && Math.hypot(x, y) < 5) return;
    if (!pan.moved) {
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add("dragging");
        pan.moved = true;
    }
    viewport.scrollLeft = pan.left - x;
    viewport.scrollTop = pan.top - y;
});
function finishPan(event) {
    if (event.pointerId !== pan?.pointerId) return;
    pan.pointerId = null;
    viewport.classList.remove("dragging");
}
viewport.addEventListener("pointerup", finishPan);
viewport.addEventListener("pointercancel", finishPan);
viewport.addEventListener("lostpointercapture", finishPan);

new ResizeObserver(() => {
    if (viewer.open && fitMode) fitGraph();
}).observe(viewport);

clearHistoryButton.addEventListener("click", clearHistory);
window.addEventListener("storage", event => {
    if (event.storageArea === localStorage && (event.key === historyKey || event.key === null)) {
        history = readHistory();
        showHistory();
    }
});
showHistory();
