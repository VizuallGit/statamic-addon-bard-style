(function () {
    'use strict';

    // ── Hjælpefunktioner til vizuStyle CSS-string manipulation ──────────────
    function setCssProp(styleStr, prop, value) {
        const parts = (styleStr || '').split(';').map(s => s.trim()).filter(Boolean);
        const escaped = prop.replace(/[-]/g, '\\-');
        const filtered = parts.filter(p => !new RegExp(`^${escaped}\\s*:`,'i').test(p));
        if (value !== null && value !== undefined) filtered.push(`${prop}: ${value}`);
        return filtered.join('; ') || null;
    }

    function readVizuProp(editor, prop) {
        try {
            const { state } = editor;
            const { from, to } = state.selection;
            const vizuType = state.schema.marks.vizuStyle;
            if (!vizuType) return null;
            let value = null;
            const escaped = prop.replace(/[-]/g, '\\-');
            const r = new RegExp(`(?:^|;)\\s*${escaped}:\\s*([^;]+)`, 'i');
            state.doc.nodesBetween(from, to === from ? to + 1 : to, node => {
                if (value) return false;
                if (node.isText) {
                    const m = node.marks.find(m => m.type === vizuType);
                    if (m?.attrs.style) { const match = m.attrs.style.match(r); if (match) value = match[1].trim(); }
                }
            });
            return value;
        } catch { return null; }
    }

    function readVizuBlockProp(editor, prop) {
        try {
            const { $from } = editor.state.selection;
            let styleStr = '';
            for (let d = $from.depth; d >= 0; d--) {
                const node = $from.node(d);
                if ((node.type.name === 'paragraph' || node.type.name === 'heading') && node.attrs.vizuBlockStyle) {
                    styleStr = node.attrs.vizuBlockStyle; break;
                }
            }
            if (!styleStr) return null;
            const escaped = prop.replace(/[-]/g, '\\-');
            const r = new RegExp(`(?:^|;)\\s*${escaped}:\\s*([^;]+)`, 'i');
            const match = styleStr.match(r);
            return match ? match[1].trim() : null;
        } catch { return null; }
    }

    function readVizuClass(editor) {
        try {
            const { $from } = editor.state.selection;
            for (let d = $from.depth; d >= 0; d--) {
                const node = $from.node(d);
                if ((node.type.name === 'paragraph' || node.type.name === 'heading') && node.attrs.vizuClass) {
                    return node.attrs.vizuClass;
                }
            }
            return null;
        } catch { return null; }
    }

    // ── Swatch-fetch (cached, bruges af farveknappen) ──────────────────────
    let _swatchesCache = null;
    function fetchSwatches() {
        if (_swatchesCache !== null) return Promise.resolve(_swatchesCache);
        const cpRoot = document.querySelector('meta[name="cp-root"]')?.content || '/cp';
        return fetch(`${cpRoot}/color-scheme/swatches`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin',
        })
        .then(r => r.ok ? r.json() : [])
        .catch(() => [])
        .then(s => { _swatchesCache = s; return s; });
    }

    // ── Injicér CSS-variabler i CP så var(--primary-N) og var(--size-N) virker i Bard ──
    Statamic.booting(() => {
        const cpRoot = document.querySelector('meta[name="cp-root"]')?.content || '/cp';

        fetchSwatches().then(swatches => {
            if (!swatches.length) return;
            const css = swatches
                .filter(s => s.var)
                .map(s => `${s.var}:${s.hex}`)
                .join(';');
            const style = document.createElement('style');
            style.id = 'cp-theme-vars';
            style.textContent = `:root{${css}}`;
            document.head.appendChild(style);
        });

        fetch(`${cpRoot}/bard-style/size-vars`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin',
        })
        .then(r => r.ok ? r.json() : [])
        .catch(() => [])
        .then(sizeVars => {
            if (!sizeVars.length) return;
            const css = sizeVars.map(s => `--${s.handle}:${s.value}`).join(';');
            const style = document.createElement('style');
            style.id = 'cp-size-vars';
            style.textContent = `:root{${css}}`;
            document.head.appendChild(style);
        });
    });

    // ── Bard color mark + toolbar button ─────────────────────────────────────

    Statamic.booting(() => {
        Statamic.$bard.buttons((buttons, makeButton) => {
            buttons.push(makeButton({
                name:      'color',
                text:      'Tekstfarve',
                component: 'bard-button-color',
                html:      '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37-1.34-1.34a1 1 0 0 0-1.41 0L9 12.25 11.75 15l8.96-8.96a1 1 0 0 0 0-1.41z"/></svg>',
            }));
        });
    });

    Statamic.booting(() => {
        const { h, ref, onMounted, onUnmounted } = window.Vue;

        // vizuStyle — combined inline style mark (color + font-size + text-transform + ...)
        Statamic.$bard.addExtension(({ tiptap }) => {
            return tiptap.core.Mark.create({
                name: 'vizuStyle',
                priority: 1000,

                addAttributes() {
                    return {
                        style: {
                            default: null,
                            parseHTML: el => el.getAttribute('style') || null,
                            renderHTML: attrs => attrs.style ? { 'data-vizu': '', style: attrs.style } : {},
                        },
                    };
                },

                parseHTML() {
                    return [{ tag: 'span[data-vizu]' }];
                },

                renderHTML({ HTMLAttributes }) {
                    return ['span', HTMLAttributes, 0];
                },

                addCommands() {
                    const applyVizu = fn => ({ tr, state, dispatch }) => {
                        const vizuType = state.schema.marks.vizuStyle;
                        if (!vizuType) return false;
                        const { from, to } = state.selection;
                        const nodes = [];
                        state.doc.nodesBetween(from, to, (node, pos) => { if (node.isText) nodes.push({ node, pos }); });
                        nodes.forEach(({ node, pos }) => {
                            const nodeFrom = Math.max(from, pos);
                            const nodeTo   = Math.min(to, pos + node.nodeSize);
                            const m        = node.marks.find(m => m.type === vizuType);
                            const newStyle = fn(m?.attrs.style || null);
                            tr.removeMark(nodeFrom, nodeTo, vizuType);
                            if (newStyle) tr.addMark(nodeFrom, nodeTo, vizuType.create({ style: newStyle }));
                        });
                        if (dispatch) dispatch(tr);
                        return true;
                    };
                    return {
                        setVizuProp:   (prop, val) => applyVizu(s => setCssProp(s, prop, val)),
                        clearVizuProp: prop        => applyVizu(s => setCssProp(s, prop, null)),
                    };
                },
            });
        });

        // btsSpan mark — nødvendig for at Tiptap kan loade gammelt indhold.
        // Migratoren konverterer det straks til vizuStyle ved editor create.
        Statamic.$bard.addExtension(({ tiptap }) => {
            return tiptap.core.Mark.create({
                name: 'btsSpan',
                priority: 100,
                addAttributes() {
                    return { class: { default: null } };
                },
                parseHTML() {
                    return [
                        { tag: 'span[data-bts-style]', getAttrs: el => ({ class: el.getAttribute('data-bts-style') }) },
                        { tag: 'span[class]',           getAttrs: el => ({ class: el.getAttribute('class') || null }) },
                    ];
                },
                renderHTML({ HTMLAttributes }) {
                    return ['span', HTMLAttributes, 0];
                },
            });
        });

        // Migrator: convert old themeColor + btsSpan marks → vizuStyle on editor create
        Statamic.$bard.addExtension(({ tiptap }) => {
            const BTSSPAN_MAP = (() => {
                const styles = Statamic.$config.get('bard-styles') || [];
                const map = {};
                styles.forEach(s => { map[s.handle.replace(/_/g, '-')] = { prop: s.prop, value: s.value }; });
                return map;
            })();

            return tiptap.core.Extension.create({
                name: 'vizuStyleMigrator',
                onCreate() {
                    const { schema, doc } = this.editor.state;
                    const tcType  = schema.marks.themeColor;
                    const btsType = schema.marks.btsSpan;
                    const vzType  = schema.marks.vizuStyle;
                    if (!vzType) return;
                    const ops = [];
                    doc.descendants((node, pos) => {
                        if (!node.isText) return;
                        const tc   = tcType  && node.marks.find(m => m.type === tcType);
                        const btss = btsType ? node.marks.filter(m => m.type === btsType) : [];
                        const vz   = node.marks.find(m => m.type === vzType);
                        if (!tc && !btss.length) return;
                        let style = vz?.attrs.style || null;
                        const removals = [];
                        if (tc) { style = setCssProp(style, 'color', tc.attrs.color); removals.push(tc); }
                        btss.forEach(m => {
                            const def = BTSSPAN_MAP[m.attrs.class || ''];
                            if (def) style = setCssProp(style, def.prop, def.value);
                            removals.push(m);
                        });
                        ops.push({ pos, size: node.nodeSize, vz, removals, style });
                    });
                    if (!ops.length) return;
                    const tr = this.editor.state.tr;
                    ops.forEach(({ pos, size, vz, removals, style }) => {
                        removals.forEach(m => tr.removeMark(pos, pos + size, m));
                        if (vz) tr.removeMark(pos, pos + size, vzType);
                        if (style) tr.addMark(pos, pos + size, vzType.create({ style }));
                    });
                    tr.setMeta('vizuMigrate', true);
                    this.editor.view.dispatch(tr);
                },
            });
        });

        // vizuSpanClass — mark for class-baserede paragraph-styles
        Statamic.$bard.addExtension(({ tiptap }) => {
            const paragraphStyles = (Statamic.$config.get('bard-styles') || [])
                .filter(s => s.type === 'paragraph' && s.class);
            if (!paragraphStyles.length) return tiptap.core.Extension.create({ name: 'vizuSpanClassNoop' });
            return tiptap.core.Mark.create({
                name: 'vizuSpanClass',
                addAttributes() {
                    return {
                        class: {
                            default: null,
                            parseHTML: el => el.getAttribute('data-vsc') || null,
                            renderHTML: attrs => attrs.class
                                ? { 'data-vsc': attrs.class, class: attrs.class }
                                : {},
                        },
                    };
                },
                parseHTML() { return [{ tag: 'span[data-vsc]' }]; },
                renderHTML({ HTMLAttributes }) { return ['span', HTMLAttributes, 0]; },
            });
        });

        // Injicér CP-preview CSS for paragraph-styles
        (() => {
            const paragraphStyles = (Statamic.$config.get('bard-styles') || [])
                .filter(s => s.type === 'paragraph' && s.class && s.cp_css);
            if (!paragraphStyles.length) return;
            const css = paragraphStyles.map(s => `.ProseMirror .${s.class} { ${s.cp_css} }`).join('\n');
            const el  = document.createElement('style');
            el.textContent = css;
            document.head.appendChild(el);
        })();

        // CSS: picker active-state synlig for knapper uden bard-toolbar-button klasse
        (() => {
            const el = document.createElement('style');
            el.textContent = `.bard-fixed-toolbar.bard-toolbar-setting button.active{background-color:var(--theme-color-gray-600)!important;color:var(--color-white)!important;}`;
            document.head.appendChild(el);
        })();

        // themeColor mark — bevares for bagudkompatibilitet (gammel format)
        Statamic.$bard.addExtension(({ tiptap }) => {
            return tiptap.core.Mark.create({
                name: 'themeColor',
                priority: 1000,

                addAttributes() {
                    return {
                        color: {
                            default: null,
                            parseHTML: el => {
                                const m = (el.getAttribute('style') || '').match(/(?:^|;)\s*color:\s*([^;]+)/);
                                return m ? m[1].trim() : null;
                            },
                            renderHTML: attrs => attrs.color ? { style: `color: ${attrs.color}` } : {},
                        },
                    };
                },

                parseHTML() {
                    return [{
                        tag: 'span',
                        getAttrs: el => {
                            const m = (el.getAttribute('style') || '').match(/(?:^|;)\s*color:\s*([^;]+)/);
                            if (!m) return false;
                            return { color: m[1].trim() };
                        },
                    }];
                },

                renderHTML({ HTMLAttributes }) {
                    return ['span', HTMLAttributes, 0];
                },

                addCommands() {
                    return {
                        setThemeColor:   color => ({ commands }) => commands.setMark(this.name, { color }),
                        unsetThemeColor: ()    => ({ commands }) => commands.unsetMark(this.name),
                    };
                },
            });
        });

        // Farveknap — paint brush icon, swatch dropdown via portal
        Statamic.$components.register('bard-button-color', {
            props: {
                editor: { type: Object, required: true },
                bard:   { type: Object, default: null },
                config: { type: Object, default: null },
            },
            setup(props) {
                const container   = ref(null);
                const isOpen      = ref(false);
                const activeColor = ref(null);
                const portalEl    = { value: null };
                const COLS        = 12;

                function readActiveColor() {
                    const vizuColor = readVizuProp(props.editor, 'color');
                    if (vizuColor) return vizuColor;
                    try {
                        const { state }  = props.editor;
                        const { from, to } = state.selection;
                        const markType   = state.schema.marks.themeColor;
                        if (!markType) return null;
                        let color = null;
                        state.doc.nodesBetween(from, to === from ? to + 1 : to, (node) => {
                            if (color) return false;
                            if (node.isText) {
                                const m = node.marks.find(m => m.type === markType);
                                if (m) color = m.attrs.color;
                            }
                        });
                        return color;
                    } catch { return null; }
                }

                function updatePos() {
                    if (!container.value || !portalEl.value) return;
                    const r  = container.value.getBoundingClientRect();
                    const pw = portalEl.value.offsetWidth || 340;
                    portalEl.value.style.left = Math.max(4, Math.min(r.left, window.innerWidth - pw - 4)) + 'px';
                    portalEl.value.style.top  = (r.bottom + 4) + 'px';
                }

                function buildPortalContent(swatches) {
                    const div     = portalEl.value;
                    const current = readActiveColor();
                    div.innerHTML = '';

                    const currentEntry = swatches.find(s => (s.var ? `var(${s.var})` : s.hex) === current);
                    const currentHex   = currentEntry?.hex || null;

                    const header = document.createElement('div');
                    header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px 8px;border-bottom:1px solid #3f3f46;margin-bottom:8px';

                    const swatchEl = document.createElement('div');
                    swatchEl.style.cssText = `width:28px;height:28px;border-radius:50%;background:${currentHex || 'transparent'};border:2px solid ${currentHex ? currentHex : '#52525b'};flex-shrink:0`;
                    header.appendChild(swatchEl);

                    const label = document.createElement('span');
                    label.style.cssText = 'font-size:12px;font-family:monospace;color:#a1a1aa;flex:1';
                    label.textContent = current || 'Ingen farve';
                    header.appendChild(label);

                    if (current) {
                        const removeBtn = document.createElement('button');
                        removeBtn.type = 'button';
                        removeBtn.innerHTML = '&times;';
                        removeBtn.title = 'Fjern farve';
                        removeBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:#a1a1aa;font-size:16px;line-height:1;padding:0 4px;border-radius:4px';
                        removeBtn.onmouseenter = () => { removeBtn.style.color = '#f87171'; };
                        removeBtn.onmouseleave = () => { removeBtn.style.color = '#a1a1aa'; };
                        removeBtn.addEventListener('click', () => {
                            props.editor.chain().focus().clearVizuProp('color').run();
                            closePortal();
                        });
                        header.appendChild(removeBtn);
                    }
                    div.appendChild(header);

                    const grid = document.createElement('div');
                    grid.style.cssText = `display:grid;grid-template-columns:repeat(${COLS},1fr);gap:4px;padding:0 4px`;

                    swatches.forEach(({ hex, var: cssVar }) => {
                        const stored = cssVar ? `var(${cssVar})` : hex;
                        const btn    = document.createElement('button');
                        btn.type     = 'button';
                        btn.title    = cssVar ? `${cssVar} — ${hex}` : hex;
                        const active = stored === current;
                        btn.style.cssText = `width:24px;height:24px;border-radius:50%;background:${hex};border:2px solid ${active ? '#fff' : 'transparent'};cursor:pointer;outline:${active ? '2px solid '+hex : 'none'};outline-offset:2px;transition:transform .1s`;
                        btn.onmouseenter = () => { btn.style.transform = 'scale(1.18)'; };
                        btn.onmouseleave = () => { btn.style.transform = 'scale(1)'; };
                        btn.addEventListener('click', () => {
                            if (active) {
                                props.editor.chain().focus().clearVizuProp('color').run();
                            } else {
                                props.editor.chain().focus().setVizuProp('color', stored).run();
                            }
                            closePortal();
                        });
                        grid.appendChild(btn);
                    });
                    div.appendChild(grid);
                }

                function openPortal() {
                    if (portalEl.value) return;
                    const div = document.createElement('div');
                    div.style.cssText = 'position:fixed;z-index:99999;background:#18181b;border:1px solid #3f3f46;border-radius:10px;padding:8px 4px;box-shadow:0 8px 32px rgba(0,0,0,.7);min-width:200px';
                    document.body.appendChild(div);
                    portalEl.value = div;
                    div.innerHTML = '<div style="padding:12px;text-align:center;color:#71717a;font-size:12px">Henter farver…</div>';
                    window.addEventListener('scroll', updatePos, true);
                    requestAnimationFrame(updatePos);
                    fetchSwatches().then(swatches => {
                        if (!portalEl.value) return;
                        buildPortalContent(swatches);
                        requestAnimationFrame(updatePos);
                    });
                }

                function closePortal() {
                    if (!portalEl.value) return;
                    document.body.removeChild(portalEl.value);
                    portalEl.value = null;
                    window.removeEventListener('scroll', updatePos, true);
                    isOpen.value = false;
                }

                function toggle() {
                    isOpen.value ? closePortal() : (isOpen.value = true, openPortal());
                }

                function handleOutsideClick(e) {
                    if (!isOpen.value) return;
                    if (container.value?.contains(e.target) || portalEl.value?.contains(e.target)) return;
                    closePortal();
                }

                function onEditorUpdate() {
                    activeColor.value = readActiveColor();
                }

                onMounted(() => {
                    document.addEventListener('mousedown', handleOutsideClick);
                    props.editor?.on('selectionUpdate', onEditorUpdate);
                    props.editor?.on('transaction',     onEditorUpdate);
                });

                onUnmounted(() => {
                    document.removeEventListener('mousedown', handleOutsideClick);
                    props.editor?.off('selectionUpdate', onEditorUpdate);
                    props.editor?.off('transaction',     onEditorUpdate);
                    closePortal();
                });

                function brushSvg(color) {
                    return h('svg', { width: '14', height: '14', viewBox: '0 0 24 24' }, [
                        h('path', { fill: 'currentColor', d: 'M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37-1.34-1.34a1 1 0 0 0-1.41 0L9 12.25 11.75 15l8.96-8.96a1 1 0 0 0 0-1.41z' }),
                        color ? h('rect', { x: '1', y: '21', width: '22', height: '2.5', rx: '1.25', fill: color }) : null,
                    ]);
                }

                return () => {
                    const color = activeColor.value;
                    return h('div', { ref: container, style: 'display:inline-flex' }, [
                        h('button', {
                            type: 'button',
                            class: ['bard-toolbar-button', isOpen.value && 'active'].filter(Boolean).join(' '),
                            title: 'Tekstfarve',
                            onClick: toggle,
                        }, [ brushSvg(color) ]),
                    ]);
                };
            },
        });
    });

    // ── vizuDiv — wrapper-node til block-indhold (fx two-columns) ───────────
    Statamic.booting(() => {
        Statamic.$bard.addExtension(({ tiptap }) => {
            return tiptap.core.Node.create({
                name: 'vizuDiv',
                group: 'block',
                content: 'block+',
                defining: true,

                addAttributes() {
                    return { class: { default: null } };
                },

                parseHTML() {
                    return [{ tag: 'div[data-vzd]' }];
                },

                renderHTML({ node }) {
                    const attrs = { 'data-vzd': '' };
                    if (node.attrs.class) attrs.class = node.attrs.class;
                    return ['div', attrs, 0];
                },

                addCommands() {
                    return {
                        toggleVizuDiv: (cls) => ({ state, commands }) => {
                            const { $from } = state.selection;
                            for (let d = $from.depth; d > 0; d--) {
                                const n = $from.node(d);
                                if (n.type.name === 'vizuDiv' && n.attrs.class === cls) {
                                    return commands.lift('vizuDiv');
                                }
                            }
                            return commands.wrapIn('vizuDiv', { class: cls });
                        },
                    };
                },
            });
        });
    });

    // ── Bard Style-knapper ────────────────────────────────────────────────────
    Statamic.booting(() => {
        const allStyles = Object.values(Statamic.$config.get('bard-styles') || []);
        const allGroups = Statamic.$config.get('bard-groups') || {};
        if (!allStyles.length) return;

        const { h, ref, onMounted, onUnmounted, getCurrentInstance, withDirectives, resolveDirective } = window.Vue;

        function withTooltip(vnode, text) {
            const vTooltip = resolveDirective('tooltip');
            return vTooltip ? withDirectives(vnode, [[vTooltip, text]]) : vnode;
        }

        function renderIdent(ident, fallback) {
            const str = ident || fallback || '?';
            if (typeof str === 'string' && str.trimStart().startsWith('<')) {
                return h('span', { innerHTML: str, style: 'display:inline-flex;align-items:center;pointer-events:none' });
            }
            return str;
        }

        // Inject CP CSS so div-styles (fx two-columns) vises korrekt i editoren
        const divCssParts = allStyles
            .filter(s => s.type === 'div' && s.class && s.cp_css)
            .map(s => `[data-vzd].${s.class}{${s.cp_css}}`);
        if (divCssParts.length && !document.getElementById('cp-vizu-div-styles')) {
            const el = document.createElement('style');
            el.id = 'cp-vizu-div-styles';
            el.textContent = divCssParts.join('\n');
            document.head.appendChild(el);
        }

        // JS Tiptap-extension: tilføjer vizuClass og vizuBlockStyle som attributter på paragraph/heading
        Statamic.$bard.addExtension(({ tiptap }) => {
            const knownVizuClasses = allStyles.filter(s => s.type === 'paragraph' && s.class).map(s => s.class);
            return tiptap.core.Extension.create({
                name: 'vizuBlockAttrs',
                addGlobalAttributes() {
                    return [{
                        types: ['paragraph', 'heading'],
                        attributes: {
                            vizuClass: {
                                default: null,
                                parseHTML: el => {
                                    const cls = el.getAttribute('class');
                                    return (cls && knownVizuClasses.includes(cls)) ? cls : null;
                                },
                                renderHTML: attrs => attrs.vizuClass ? { class: attrs.vizuClass } : {},
                            },
                            vizuBlockStyle: {
                                default: null,
                                parseHTML: el => el.getAttribute('data-vbs') || null,
                                renderHTML: attrs => attrs.vizuBlockStyle
                                    ? { 'data-vbs': attrs.vizuBlockStyle, style: attrs.vizuBlockStyle }
                                    : {},
                            },
                        },
                    }];
                },
                addCommands() {
                    function forEachBlock(state, fn) {
                        const { from, to } = state.selection;
                        const tr = state.tr;
                        state.doc.nodesBetween(from, to, (node, pos) => {
                            if (node.type.name === 'paragraph' || node.type.name === 'heading') fn(node, pos, tr);
                        });
                        return tr;
                    }
                    return {
                        setVizuBlockProp: (prop, value) => ({ state, dispatch }) => {
                            const tr = forEachBlock(state, (node, pos, tr) => {
                                const newStyle = setCssProp(node.attrs.vizuBlockStyle || '', prop, value) || null;
                                tr.setNodeMarkup(pos, undefined, { ...node.attrs, vizuBlockStyle: newStyle });
                            });
                            if (dispatch) dispatch(tr.scrollIntoView());
                            return true;
                        },
                        clearVizuBlockProp: (prop) => ({ state, dispatch }) => {
                            const tr = forEachBlock(state, (node, pos, tr) => {
                                const newStyle = setCssProp(node.attrs.vizuBlockStyle || '', prop, null) || null;
                                tr.setNodeMarkup(pos, undefined, { ...node.attrs, vizuBlockStyle: newStyle });
                            });
                            if (dispatch) dispatch(tr.scrollIntoView());
                            return true;
                        },
                        setVizuClass: (cls) => ({ state, dispatch }) => {
                            const tr = forEachBlock(state, (node, pos, tr) => {
                                tr.setNodeMarkup(pos, undefined, { ...node.attrs, vizuClass: cls });
                            });
                            if (dispatch) dispatch(tr.scrollIntoView());
                            return true;
                        },
                        clearVizuClass: () => ({ state, dispatch }) => {
                            const tr = forEachBlock(state, (node, pos, tr) => {
                                tr.setNodeMarkup(pos, undefined, { ...node.attrs, vizuClass: null });
                            });
                            if (dispatch) dispatch(tr.scrollIntoView());
                            return true;
                        },
                    };
                },
            });
        });

        const groupedMap = {};
        const ungrouped  = [];

        allStyles.forEach(style => {
            if (style.group) {
                if (!groupedMap[style.group]) groupedMap[style.group] = [];
                groupedMap[style.group].push(style);
            } else {
                ungrouped.push(style);
            }
        });

        function buildGroupComponent(groupName, groupStyles, groupMeta) {
            return {
                props: { editor: { type: Object, required: true }, button: { type: Object, default: null }, bard: { type: Object, default: null }, config: { type: Object, default: null } },
                setup(props) {
                    const container   = ref(null);
                    const isOpen      = ref(false);
                    const portalEl    = { value: null };
                    const activeStyle = ref(null);

                    function getActive() {
                        for (const s of groupStyles) {
                            if (s.target === 'block') {
                                if (s.prop && readVizuBlockProp(props.editor, s.prop) === s.value) return s;
                            } else if (s.type === 'paragraph') {
                                if (readVizuClass(props.editor) === s.class) return s;
                            } else if (s.prop && readVizuProp(props.editor, s.prop) === s.value) return s;
                        }
                        return null;
                    }

                    function updatePos() {
                        if (!container.value || !portalEl.value) return;
                        const r  = container.value.getBoundingClientRect();
                        const pw = portalEl.value.offsetWidth || 180;
                        portalEl.value.style.left = Math.max(4, Math.min(r.left, window.innerWidth - pw - 4)) + 'px';
                        portalEl.value.style.top  = (r.bottom + 4) + 'px';
                    }

                    function buildContent() {
                        const div = portalEl.value;
                        div.innerHTML = '';
                        const active = getActive();

                        groupStyles.forEach(style => {
                            const isCur = active?.handle === style.handle;
                            const btn = document.createElement('button');
                            btn.type = 'button';
                            btn.style.cssText = `display:flex;align-items:center;gap:8px;width:100%;padding:5px 10px;border:none;cursor:pointer;text-align:left;background:${isCur ? 'rgba(59,130,246,.18)' : 'transparent'};border-radius:4px;color:${isCur ? '#93c5fd' : '#e2e8f0'};`;
                            btn.addEventListener('mouseover', () => { if (!isCur) btn.style.background = 'rgba(255,255,255,.07)'; });
                            btn.addEventListener('mouseout',  () => { if (!isCur) btn.style.background = 'transparent'; });
                            btn.addEventListener('click', () => {
                                if (style.target === 'block') {
                                    if (isCur) props.editor.chain().focus().clearVizuBlockProp(style.prop).run();
                                    else props.editor.chain().focus().setVizuBlockProp(style.prop, style.value).run();
                                } else if (style.type === 'paragraph') {
                                    if (isCur) props.editor.chain().focus().clearVizuClass().run();
                                    else props.editor.chain().focus().setVizuClass(style.class).run();
                                } else {
                                    if (isCur) props.editor.chain().focus().clearVizuProp(style.prop).run();
                                    else props.editor.chain().focus().setVizuProp(style.prop, style.value).run();
                                }
                                closePortal();
                            });
                            const badge = document.createElement('span');
                            badge.style.cssText = `display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:18px;padding:0 3px;border-radius:3px;font-size:9px;font-weight:700;font-family:monospace;background:${isCur ? '#3b82f6' : 'rgba(255,255,255,.15)'};color:${isCur ? '#fff' : '#94a3b8'};flex-shrink:0;`;
                            const identStr = style.ident || '?';
                            if (typeof identStr === 'string' && identStr.trimStart().startsWith('<')) {
                                badge.innerHTML = identStr;
                                badge.style.padding = '0 1px';
                            } else {
                                badge.textContent = identStr;
                            }
                            btn.appendChild(badge);
                            const label = document.createElement('span');
                            label.style.cssText = 'font-size:12px;flex:1;';
                            label.textContent = style.name;
                            btn.appendChild(label);
                            if (isCur) {
                                const chk = document.createElement('span');
                                chk.textContent = '✓';
                                chk.style.cssText = 'font-size:11px;color:#3b82f6;';
                                btn.appendChild(chk);
                            }
                            div.appendChild(btn);
                        });
                    }

                    function openPortal() {
                        if (portalEl.value) return;
                        const div = document.createElement('div');
                        div.style.cssText = 'position:fixed;z-index:99999;background:#1a1f2e;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:4px;box-shadow:0 8px 24px rgba(0,0,0,.5);min-width:160px;';
                        document.body.appendChild(div);
                        portalEl.value = div;
                        window.addEventListener('scroll', updatePos, true);
                        requestAnimationFrame(() => { updatePos(); buildContent(); });
                    }

                    function closePortal() {
                        if (!portalEl.value) return;
                        document.body.removeChild(portalEl.value);
                        portalEl.value = null;
                        window.removeEventListener('scroll', updatePos, true);
                        isOpen.value = false;
                    }

                    function toggle() { isOpen.value ? closePortal() : (isOpen.value = true, openPortal()); }

                    function handleOutside(e) {
                        if (!isOpen.value) return;
                        if (container.value?.contains(e.target) || portalEl.value?.contains(e.target)) return;
                        closePortal();
                    }

                    function onEditorUpdate() {
                        queueMicrotask(() => { activeStyle.value = getActive(); });
                        if (portalEl.value) buildContent();
                    }

                    onMounted(() => {
                        document.addEventListener('mousedown', handleOutside);
                        props.editor?.on('selectionUpdate', onEditorUpdate);
                        props.editor?.on('transaction', onEditorUpdate);
                        activeStyle.value = getActive();
                    });
                    onUnmounted(() => {
                        document.removeEventListener('mousedown', handleOutside);
                        props.editor?.off('selectionUpdate', onEditorUpdate);
                        props.editor?.off('transaction', onEditorUpdate);
                        closePortal();
                    });

                    return () => {
                        const active = activeStyle.value;
                        const btn = h('button', {
                            type: 'button',
                            class: ['bard-toolbar-button', (isOpen.value || !!active) && 'active'].filter(Boolean).join(' '),
                            onClick: toggle,
                        }, renderIdent(active ? active.ident : groupMeta.ident, groupName[0].toUpperCase()));
                        return h('div', { ref: container, style: 'display:inline-flex' }, [
                            withTooltip(btn, groupMeta.name || groupName),
                        ]);
                    };
                },
            };
        }

        function buildIndividualComponent(style) {
            const isParagraph = style.type === 'paragraph';
            const isDiv       = style.type === 'div';
            return {
                props: { editor: { type: Object, required: true }, button: { type: Object, default: null }, bard: { type: Object, default: null }, config: { type: Object, default: null } },
                setup(props) {
                    const isActive = ref(false);

                    function check() {
                        queueMicrotask(() => {
                            if (isDiv) {
                                try {
                                    const { $from } = props.editor.state.selection;
                                    let found = false;
                                    for (let d = $from.depth; d > 0; d--) {
                                        const n = $from.node(d);
                                        if (n.type.name === 'vizuDiv' && n.attrs.class === style.class) { found = true; break; }
                                    }
                                    isActive.value = found;
                                } catch { isActive.value = false; }
                            } else if (style.target === 'block') {
                                isActive.value = readVizuBlockProp(props.editor, style.prop) === style.value;
                            } else if (isParagraph) {
                                isActive.value = readVizuClass(props.editor) === style.class;
                            } else {
                                isActive.value = readVizuProp(props.editor, style.prop) === style.value;
                            }
                        });
                    }

                    onMounted(() => {
                        props.editor?.on('selectionUpdate', check);
                        props.editor?.on('transaction', check);
                    });
                    onUnmounted(() => {
                        props.editor?.off('selectionUpdate', check);
                        props.editor?.off('transaction', check);
                    });

                    function toggle() {
                        if (isDiv) {
                            props.editor.chain().focus().toggleVizuDiv(style.class).run();
                        } else if (style.target === 'block') {
                            if (isActive.value) props.editor.chain().focus().clearVizuBlockProp(style.prop).run();
                            else props.editor.chain().focus().setVizuBlockProp(style.prop, style.value).run();
                        } else if (isParagraph) {
                            if (isActive.value) props.editor.chain().focus().clearVizuClass().run();
                            else props.editor.chain().focus().setVizuClass(style.class).run();
                        } else if (isActive.value) {
                            props.editor.chain().focus().clearVizuProp(style.prop).run();
                        } else {
                            props.editor.chain().focus().setVizuProp(style.prop, style.value).run();
                        }
                    }

                    return () => withTooltip(h('button', {
                        type: 'button',
                        class: ['bard-toolbar-button', isActive.value && 'active'].filter(Boolean).join(' '),
                        onClick: toggle,
                    }, renderIdent(style.ident)), style.name);
                },
            };
        }

        Statamic.$bard.buttons(function(buttons, makeButton) {
            const { markRaw } = window.Vue;
            const toAdd = [];

            // Grupper i den rækkefølge de er defineret under 'groups' i bard_styles.php
            Object.keys(allGroups).forEach(groupName => {
                if (!groupedMap[groupName]) return;
                const meta = allGroups[groupName];
                const slug = groupName.replace(/_/g, '-');
                toAdd.push(makeButton({
                    name:      `bard-group-${slug}`,
                    text:      meta.name || groupName,
                    html:      (typeof meta.ident === 'string' && meta.ident.trimStart().startsWith('<')) ? (meta.name || groupName)[0].toUpperCase() : (meta.ident || groupName[0].toUpperCase()),
                    component: markRaw(buildGroupComponent(groupName, groupedMap[groupName], meta)),
                }));
            });

            // Ungrouped styles i den rækkefølge de er defineret under 'styles'
            ungrouped.forEach(style => {
                const slug = style.handle.replace(/_/g, '-');
                toAdd.push(makeButton({
                    name:      `bard-${slug}`,
                    text:      style.name,
                    html:      (typeof style.ident === 'string' && style.ident.trimStart().startsWith('<')) ? (style.name || '?')[0].toUpperCase() : (style.ident || '?'),
                    component: markRaw(buildIndividualComponent(style)),
                }));
            });

            const valid = toAdd.filter(Boolean);
            if (valid.length) buttons.splice(0, 0, ...valid);
        });
    });

}());
