// Adapted from PGNode2Graph's Python converter, based on yshen's node2dot.c.
(function (root) {
    "use strict";

    const colors = ["#2f63ac", "#157862", "#7b50a3", "#935622", "#246c83", "#a0446b"];
    const emptyValues = new Set(["<>", "()", "false", "0"]);
    const arrowSize = 0.7;
    const nodeSpacing = 0.3;
    const rankSpacing = 0.65;
    const pointsPerInch = 72;

    function unwrapInput(input) {
        const source = input.trim();
        const wrapped = source.match(/^(?:\$\d+\s*=\s*)?(?:\([^()\r\n]+\)\s*)?(?:0x[\da-f]+\s+)?"([\s\S]*)"\s*$/i);
        return wrapped ? wrapped[1].replace(/\\(["\\])/g, "$1") : source;
    }

    function parseNodeTree(input, { skipEmpty = false } = {}) {
        const source = unwrapInput(input);
        const start = source.search(/\{\s*[A-Z][A-Z0-9_]*(?=[\s}:])/);
        if (start < 0) {
            throw new SyntaxError("找不到 PostgreSQL 节点。请粘贴调试日志或 nodeToString() 的输出。");
        }

        const nodeName = /\{\s*([A-Z][A-Z0-9_]*)(?=[\s}:])/y;
        const fieldName = /:([A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z_][A-Za-z_0-9]*)*)(?=[\s{}()]|$)/y;
        const nodes = [];
        const stack = [];
        let position = start;

        while (position < source.length) {
            const frame = stack.at(-1);
            const character = source[position];

            if (character === "{") {
                nodeName.lastIndex = position;
                const matched = nodeName.exec(source);
                if (!matched) {
                    throw new SyntaxError("遇到了无法识别的节点名称。请检查文本是否完整。");
                }
                if (frame && !frame.field) {
                    throw new SyntaxError("子节点缺少对应的字段名。请检查文本格式。");
                }
                const node = { id: `n${nodes.length + 1}`, tag: matched[1], fields: [] };
                nodes.push(node);

                if (frame) {
                    appendFieldText(frame, source, position);
                    frame.field.children.push(node.id);
                }

                position = nodeName.lastIndex;
                stack.push({ node, field: null, valueStart: position });
                continue;
            }

            if (character === "}") {
                appendFieldText(frame, source, position);
                finishFields(frame.node, skipEmpty);
                stack.pop();
                position++;
                const parent = stack.at(-1);
                if (parent) {
                    parent.valueStart = position;
                } else {
                    while (/\s/.test(source[position] ?? "")) position++;
                    if (source[position] !== "{") break;
                }
                continue;
            }

            if (character === ":" && /\s/.test(source[position - 1] ?? "")) {
                fieldName.lastIndex = position;
                const matched = fieldName.exec(source);
                if (matched) {
                    appendFieldText(frame, source, position);
                    frame.field = { name: matched[1], segments: [], children: [] };
                    frame.node.fields.push(frame.field);
                    position = fieldName.lastIndex;
                    frame.valueStart = position;
                    continue;
                }
            }

            if (character === "\\") {
                position += 2;
            } else if (character === '"') {
                position = afterQuotedString(source, position + 1);
            } else {
                position++;
            }
        }

        if (stack.length) {
            throw new SyntaxError("节点树没有闭合。请检查复制的文本是否被截断。");
        }

        const edges = nodes.flatMap(node => node.fields.flatMap((field, index) =>
            field.children.map(child => ({ from: node.id, field: `f${index + 1}`, to: child }))
        ));
        return { nodes, edges, roots: nodes.length - edges.length };
    }

    function afterQuotedString(source, start) {
        for (let index = start; index < source.length; index++) {
            if (source[index] === '"') return index + 1;
            if (source[index] === "\\") index++;
        }
        throw new SyntaxError("文本中的字符串没有闭合。请检查复制的内容。");
    }

    function appendFieldText(frame, source, end) {
        if (!frame.field) return;
        const text = source.slice(frame.valueStart, end).trim().replace(/[\r\n]+\s*/g, " ");
        if (text) frame.field.segments.push(text);
    }

    function finishFields(node, skipEmpty) {
        for (const field of node.fields) {
            // Parentheses around a list of child nodes are already represented by its edges.
            const segments = field.children.length
                ? field.segments.filter(segment => !/^[()\s]+$/.test(segment))
                : field.segments;
            field.value = segments.join(" ");
            delete field.segments;
        }
        if (skipEmpty) {
            node.fields = node.fields.filter(field =>
                field.children.length || (field.value && !emptyValues.has(field.value))
            );
        }
    }

    function escapeLabel(text) {
        return text.replace(/[\\"{}<>|]/g, "\\$&");
    }

    function colorForTag(tag) {
        let index = 0;
        for (const character of tag) {
            index = (index * 31 + character.charCodeAt(0)) % colors.length;
        }
        return colors[index];
    }

    function writeDot(tree, layout) {
        const graphLayout = layout
            ? "layout=nop2, splines=true"
            : `rankdir=LR, nodesep=${nodeSpacing}, ranksep=${rankSpacing}`;
        const lines = [
            "digraph PGNodes {",
            `  graph [${graphLayout}, bgcolor="transparent", pad=0.25];`,
            '  node [shape=Mrecord, style=filled, fillcolor="#ffffff", fontname="Courier New", fontsize=14, fontcolor="#1a2d42"];',
            `  edge [color="#8093aa", arrowsize=${arrowSize}];`,
        ];
        for (const node of tree.nodes) {
            const fields = node.fields.map((field, index) =>
                `<f${index + 1}> ${field.name}${field.value ? `: ${escapeLabel(field.value)}` : ""}`
            );
            const columns = `<f0> ${node.tag}${fields.length ? ` | {${fields.join(" | ")}}` : ""}`;
            // dot's LR rank direction flips record fields. nop2 uses the default orientation.
            const label = layout ? columns : `{${columns}}`;
            const position = layout ? `, pos="${layout.nodes.get(node.id)}"` : "";
            lines.push(`  ${node.id} [color="${colorForTag(node.tag)}", label="${label}"${position}];`);
        }
        for (const edge of tree.edges) {
            const position = layout?.edges.get(edge.to);
            lines.push(`  ${edge.from}:${edge.field}:e -> ${edge.to}:f0:w${position ? ` [pos="${position}"]` : ""};`);
        }
        lines.push("}");
        return lines.join("\n");
    }

    function node2dot(input, options) {
        const tree = parseNodeTree(input, options);
        return { ...tree, dot: writeDot(tree) };
    }

    function findColumn(siblings, placed, preferred) {
        const gap = rankSpacing * pointsPerInch;
        const verticalClearance = nodeSpacing * pointsPerInch / 2;
        const blocked = [];
        for (const other of placed) {
            if (other.right + gap <= preferred) continue;
            let maxWidth = 0;
            for (const box of siblings) {
                if (box.top + verticalClearance > other.bottom && box.bottom - verticalClearance < other.top) {
                    maxWidth = Math.max(maxWidth, box.width);
                }
            }
            if (maxWidth) blocked.push([other.left - gap - maxWidth, other.right + gap]);
        }
        let column = preferred;
        for (const [left, right] of blocked.sort((a, b) => a[0] - b[0])) {
            if (column <= left) break;
            column = Math.max(column, right);
        }
        return column;
    }

    function curveClears(boxes, start, end, control) {
        // The candidate curve is monotone in both axes, so its y range inside a box
        // can be checked at the box's left and right boundaries.
        function yAt(x) {
            if (x <= start.x) return start.y;
            if (x >= end.x) return end.y;
            const fraction = (x - start.x) / (end.x - start.x);
            let lo = 0;
            let hi = 1;
            for (let step = 0; step < 16; step++) {
                const t = (lo + hi) / 2;
                if (t ** 3 + 3 * control * t * (1 - t) < fraction) lo = t;
                else hi = t;
            }
            const t = (lo + hi) / 2;
            return start.y + (end.y - start.y) * t ** 2 * (3 - 2 * t);
        }

        return boxes.every(box => {
            const a = yAt(box.left);
            const b = yAt(box.right);
            return Math.max(a, b) <= box.bottom || Math.min(a, b) >= box.top;
        });
    }

    function findBend(routes, start, end) {
        let latestStart = end.x;
        let earliestEnd = start.x;
        const blockers = [];
        for (const route of routes) {
            for (const box of route.obstacles) {
                if (box.bottom < start.y && start.y < box.top) latestStart = Math.min(latestStart, box.left);
                if (box.bottom < route.end.y && route.end.y < box.top) earliestEnd = Math.max(earliestEnd, box.right);
                blockers.push(box);
            }
        }

        let left = start.x;
        let widest = 2;
        let bend;
        blockers.sort((a, b) => a.left - b.left);
        for (const box of [...blockers, { left: end.x, right: end.x }]) {
            const right = Math.min(end.x, box.left);
            if (left <= latestStart && right >= earliestEnd && right - left > widest) {
                widest = right - left;
                bend = [left, right];
            }
            left = Math.max(left, box.right);
        }
        return bend;
    }

    function prepareEdge(pos, from, to, boxes) {
        if (!pos) return;
        const [arrow, tail] = pos.split(/\s+/);
        if (!arrow.startsWith("e,") || !tail) return;
        const start = { x: from.right, y: Number(tail.split(",")[1]) };
        const end = { x: to.left - 10 * arrowSize, y: Number(arrow.split(",")[2]) };
        if (!Number.isFinite(start.y) || !Number.isFinite(end.y) || end.x <= start.x) return;

        const padding = 2;
        const low = Math.min(start.y, end.y);
        const high = Math.max(start.y, end.y);
        const obstacles = boxes.filter(box => box !== from && box !== to &&
            box.right + padding > start.x && box.left - padding < to.left &&
            box.top + padding > low && box.bottom - padding < high
        ).map(box => ({
            left: box.left - padding, right: box.right + padding,
            bottom: box.bottom - padding, top: box.top + padding,
        }));
        return { target: to.name, tipX: to.left, start, end, obstacles };
    }

    function routePort(routes, positions) {
        if (routes.some(route => !route)) return;
        const { start, end } = routes[0];
        if (routes.some(route => route.start.y !== start.y || route.end.x !== end.x)) return;

        // Edges leaving the same field use the same horizontal curve coordinates,
        // so they keep their vertical order as they fan out.
        const control = [0.5, 0.75, 0.25].find(value =>
            routes.every(route => curveClears(route.obstacles, start, route.end, value))
        );
        const bend = control === undefined ? findBend(routes, start, end) : [start.x, end.x];
        if (!bend) return; // Let Graphviz route this entire set of edges.
        const [left, right] = bend;
        const middle = left + (right - left) * (control ?? 0.5);
        for (const route of routes) {
            const points = [[start.x, start.y]];
            const addHorizontal = (a, b, y) => {
                if (a < b) points.push([a + (b - a) / 3, y], [a + 2 * (b - a) / 3, y], [b, y]);
            };
            addHorizontal(start.x, left, start.y);
            points.push([middle, start.y], [middle, route.end.y], [right, route.end.y]);
            addHorizontal(right, end.x, route.end.y);
            const curve = points.map(([x, y]) => `${x.toFixed(3)},${y}`).join(" ");
            positions.set(route.target, `e,${route.tipX.toFixed(3)},${route.end.y} ${curve}`);
        }
    }

    function leftAlignDot(tree, { objects, edges = [] }) {
        const boxes = objects.map(({ name, pos, width, height }) => {
            const y = Number(pos.split(",")[1]);
            const halfHeight = height * pointsPerInch / 2;
            return { name, y, width: width * pointsPerInch, bottom: y - halfHeight, top: y + halfHeight, children: [] };
        });
        const nonRoots = new Set();
        for (const { tail, head } of edges) {
            boxes[tail].children.push(boxes[head]);
            nonRoots.add(boxes[head]);
        }
        const groups = boxes.filter(box => !nonRoots.has(box)).map(box => ({ parent: null, siblings: [box] }));
        const placed = [];
        const nodePositions = new Map();
        for (let index = 0; index < groups.length; index++) {
            const { parent, siblings } = groups[index];
            const preferred = parent ? parent.right + rankSpacing * pointsPerInch : 0;
            const left = findColumn(siblings, placed, preferred);
            for (const box of siblings) {
                box.left = left;
                box.right = left + box.width;
                nodePositions.set(box.name, `${(left + box.width / 2).toFixed(3)},${box.y}`);
                placed.push(box);
                if (box.children.length) groups.push({ parent: box, siblings: box.children });
            }
        }

        const ports = new Map();
        for (const { tail, head, tailport, pos } of edges) {
            const key = `${tail}:${tailport}`;
            const routes = ports.get(key) ?? [];
            routes.push(prepareEdge(pos, boxes[tail], boxes[head], placed));
            ports.set(key, routes);
        }
        const edgePositions = new Map();
        for (const routes of ports.values()) routePort(routes, edgePositions);
        return writeDot(tree, { nodes: nodePositions, edges: edgePositions });
    }

    const converter = { node2dot, leftAlignDot };
    if (typeof module === "object" && module.exports) {
        module.exports = converter;
    } else {
        root.PGNode2Dot = converter;
    }
})(globalThis);
