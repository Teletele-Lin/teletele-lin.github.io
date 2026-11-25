/* Reusable Markdown workspace for the three CMS Markdown fields. */
(() => {
    'use strict';
    let fullscreenEditor = null;
    const make = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    };
    const modes = [['source', '源码'], ['split', '分栏'], ['preview', '预览']];
    const commands = [
        ['toggleHeading2', 'H2', '二级标题'],
        ['toggleHeading3', 'H3', '三级标题'],
        ['toggleBold', 'B', '粗体 (Ctrl / ⌘ + B)'],
        ['toggleItalic', 'I', '斜体 (Ctrl / ⌘ + I)'],
        ['toggleStrikethrough', 'S̶', '删除线'],
        ['toggleBlockquote', '❝', '引用'],
        ['toggleUnorderedList', '• 列表', '无序列表'],
        ['toggleOrderedList', '1. 列表', '有序列表'],
        ['toggleCheckList', '☑', '任务列表'],
        ['toggleCodeBlock', '</>', '代码块'],
        ['drawLink', '链接', '插入链接'],
        ['drawTable', '表格', '插入表格'],
        ['undo', '↶', '撤销 (Ctrl / ⌘ + Z)'],
        ['redo', '↷', '重做']
    ];
    function imageFiles(data) {
        const files = Array.from(data?.files || []);
        if (!files.length) for (const item of Array.from(data?.items || [])) {
            if (item.kind !== 'file') continue;
            const file = item.getAsFile();
            if (file) files.push(file);
        }
        return files.filter(file => file.type.startsWith('image/'));
    }

    class StudioEditor {
        constructor(textarea, options) {
            this.textarea = textarea;
            this.options = options;
            this.id = textarea.id.replace(/-body$/, '');
            this.form = textarea.closest('form');
            this.mode = matchMedia('(min-width: 1000px)').matches ? 'split' : 'source';
            this.suppressChange = false;
            this.previewTimer = null;
            this.root = make('section', 'studio-editor');
            this.root.id = this.id + '-writing';
            this.root.setAttribute('aria-label', textarea.getAttribute('aria-label') || 'Markdown 编辑器');

            const header = make('div', 'studio-editor-header');
            this.heading = make('strong', 'studio-document-title', 'Markdown');
            this.heading.title = '当前编辑的文档';
            const actions = make('div', 'studio-editor-actions');
            const tabs = make('div', 'studio-mode-tabs');
            tabs.setAttribute('aria-label', '编辑模式');
            this.modeButtons = new Map();
            for (const [mode, label] of modes) {
                const button = this.button(label, () => this.setMode(mode, true), label + '模式', 'studio-mode');
                button.dataset.editor = mode;
                tabs.append(button); this.modeButtons.set(mode, button);
            }
            this.fullscreenButton = this.button('⛶ 全屏', () => this.toggleFullscreen(), '全屏编辑（Ctrl/⌘ + Shift + F）', 'button secondary small');
            this.fullscreenButton.id = this.id + '-fullscreen';
            this.fullscreenButton.setAttribute('aria-pressed', 'false');
            this.saveButton = this.button('保存并发布', () => this.form.requestSubmit(), '保存并发布（Ctrl/⌘ + S）', 'button primary small studio-save');
            actions.append(tabs, this.fullscreenButton, this.saveButton);
            header.append(this.heading, actions);

            const toolbar = make('div', 'studio-format-toolbar');
            toolbar.setAttribute('aria-label', 'Markdown 格式工具');
            const formatGroup = make('div', 'studio-format-group');
            this.formatButtons = [];
            for (const [action, label, title] of commands) {
                const button = this.button(label, () => window.EasyMDE[action](this.mde), title, 'studio-tool');
                button.dataset.format = action;
                if (action === 'toggleBold' || action === 'toggleItalic') button.classList.add(action === 'toggleBold' ? 'format-bold' : 'format-italic');
                formatGroup.append(button); this.formatButtons.push(button);
            }
            const images = make('div', 'studio-format-group studio-image-group');
            this.uploadButton = this.button('↥ 上传图片', () => { this.pendingSelection = this.selection(); this.fileInput.click(); }, '上传图片', 'button secondary small');
            this.uploadButton.id = this.id + '-upload-image';
            this.pickButton = this.button('▧ 图片库', () => this.options.onPick(this, this.selection()), '从图片库插入图片', 'button secondary small');
            this.pickButton.id = this.id === 'article' ? 'insert-image' : this.id + '-insert-image';
            this.fileInput = make('input'); this.fileInput.type = 'file'; this.fileInput.hidden = true; this.fileInput.multiple = true;
            this.fileInput.accept = 'image/png,image/jpeg,image/webp,image/gif,image/avif';
            this.fileInput.addEventListener('change', event => {
                event.stopPropagation();
                const files = Array.from(this.fileInput.files);
                this.fileInput.value = '';
                if (files.length) this.options.onUpload(files, this, this.pendingSelection || this.selection());
            });
            images.append(this.uploadButton, this.pickButton, this.fileInput);
            toolbar.append(formatGroup, images);

            this.body = make('div', 'studio-editor-body');
            this.body.id = this.id + '-editor';
            this.source = make('div', 'studio-source');
            this.preview = make('div', 'markdown-preview studio-preview');
            this.preview.id = this.id + '-preview';
            this.preview.setAttribute('aria-label', 'Markdown 实时预览');
            this.preview.tabIndex = 0;
            this.preview.addEventListener('click', event => { if (event.target.closest('a')) event.preventDefault(); });
            this.body.append(this.source, this.preview);
            const footer = make('div', 'studio-editor-status');
            footer.append(make('span', 'studio-editor-hint', 'Markdown · 截图 Ctrl / ⌘ + V 或拖入图片自动上传'));
            this.counter = make('span', 'studio-editor-counter');
            footer.append(this.counter);
            this.root.append(header, toolbar, this.body, footer);
            textarea.before(this.root);
            this.source.append(textarea);

            this.mde = new window.EasyMDE({
                element: textarea, toolbar: false, status: false, autoDownloadFontAwesome: false,
                spellChecker: false, nativeSpellcheck: false, forceSync: true,
                lineNumbers: true, lineWrapping: true, indentWithTabs: false, tabSize: 4,
                inputStyle: 'textarea', minHeight: '0px', uploadImage: false,
                promptURLs: true, promptTexts: { link: '请输入链接 URL：', image: '请输入图片 URL：' },
                shortcuts: { togglePreview: null, toggleSideBySide: null, toggleFullScreen: null },
                // Never enable the library's raw HTML renderer, even if an
                // internal keyboard action is called by another integration.
                previewRender: value => options.previewHTML(value),
                autosave: { enabled: false }
            });
            this.cm = this.mde.codemirror;
            this.cm.getInputField().setAttribute('aria-label', textarea.getAttribute('aria-label') || 'Markdown 源码编辑');
            this.cm.on('change', () => {
                this.updateCounter();
                if (!this.suppressChange) this.options.onChange();
                clearTimeout(this.previewTimer);
                this.previewTimer = setTimeout(() => this.render(), 120);
            });
            this.cm.on('cursorActivity', () => this.updateCounter());
            this.cm.on('scroll', () => this.syncScroll());
            this.source.addEventListener('paste', event => {
                const files = imageFiles(event.clipboardData);
                if (!files.length || this.options.busy()) return;
                event.preventDefault(); event.stopPropagation();
                this.options.onUpload(files, this, this.selection());
            }, true);
            this.source.addEventListener('dragover', event => {
                if (Array.from(event.dataTransfer?.types || []).includes('Files')) event.preventDefault();
            }, true);
            this.source.addEventListener('drop', event => {
                const files = imageFiles(event.dataTransfer);
                if (!files.length || this.options.busy()) return;
                event.preventDefault(); event.stopPropagation();
                const position = this.cm.coordsChar({ left: event.clientX, top: event.clientY }, 'window');
                this.options.onUpload(files, this, { from: position, to: position });
            }, true);

            this.form.addEventListener('keydown', event => {
                if (this.options.busy()) return;
                const modifier = event.ctrlKey || event.metaKey;
                if (modifier && event.key.toLowerCase() === 's') {
                    event.preventDefault(); this.form.requestSubmit();
                } else if (modifier && event.shiftKey && event.key.toLowerCase() === 'f') {
                    event.preventDefault(); this.toggleFullscreen();
                } else if (event.key === 'F9') {
                    event.preventDefault(); this.setMode(this.mode === 'split' ? 'source' : 'split', true);
                } else if (event.key === 'F11') {
                    event.preventDefault(); this.toggleFullscreen();
                }
            }, true);
            this.form.addEventListener('invalid', () => this.setFullscreen(false), true);
            this.setMode(this.mode);
            this.updateCounter();
        }
        button(text, action, title, className) {
            const button = make('button', className, text);
            button.type = 'button'; button.title = title; button.setAttribute('aria-label', title);
            button.addEventListener('click', action);
            return button;
        }
        get value() { return this.cm.getValue(); }
        setValue(value, preserve = false) {
            this.suppressChange = true;
            try {
                if (!preserve || this.value !== value) {
                    this.cm.setValue(value);
                    if (!preserve) { this.cm.clearHistory(); this.cm.setCursor(0, 0); }
                }
                this.cm.save();
            } finally { this.suppressChange = false; }
            this.updateCounter(); this.render(); this.refresh();
        }
        selection() { return { from: this.cm.getCursor('from'), to: this.cm.getCursor('to') }; }
        insertAt(markdown, range) {
            const index = this.cm.indexFromPos(range.from);
            this.cm.replaceRange(markdown, range.from, range.to, '+input');
            this.cm.setCursor(this.cm.posFromIndex(index + markdown.length));
            this.render();
        }
        setTitle(value) { this.heading.textContent = value || 'Markdown'; }
        focus() {
            if (this.mode === 'preview') this.preview.focus();
            else this.cm.focus();
        }
        refresh() {
            requestAnimationFrame(() => { if (this.mode !== 'preview' && this.root.getClientRects().length) this.cm.refresh(); });
        }
        render() {
            if (this.mode !== 'source') this.options.renderPreview(this.value, this.preview);
        }
        setMode(mode, focus = false) {
            this.mode = mode; this.body.dataset.mode = mode;
            this.source.hidden = mode === 'preview'; this.preview.hidden = mode === 'source';
            for (const [name, b] of this.modeButtons) {
                b.classList.toggle('active', name === mode); b.setAttribute('aria-pressed', String(name === mode));
            }
            for (const b of [...this.formatButtons, this.uploadButton, this.pickButton]) b.disabled = mode === 'preview';
            this.render(); this.refresh();
            if (focus) requestAnimationFrame(() => this.focus());
        }
        updateCounter() {
            const pos = this.cm.getCursor();
            this.counter.textContent = this.cm.lineCount() + ' 行 · ' + this.value.length + ' 字符 · Ln ' + (pos.line + 1) + ', Col ' + (pos.ch + 1);
        }
        syncScroll() {
            if (this.mode !== 'split') return;
            const info = this.cm.getScrollInfo();
            const max = info.height - info.clientHeight;
            if (max > 0) this.preview.scrollTop = (info.top / max) * Math.max(0, this.preview.scrollHeight - this.preview.clientHeight);
        }
        toggleFullscreen() { this.setFullscreen(!this.root.classList.contains('is-fullscreen'), true); }
        setFullscreen(enabled, focus = false) {
            if (enabled && fullscreenEditor && fullscreenEditor !== this) fullscreenEditor.setFullscreen(false);
            if (enabled) fullscreenEditor = this;
            else if (fullscreenEditor === this) fullscreenEditor = null;
            this.root.classList.toggle('is-fullscreen', enabled);
            document.body.classList.toggle('studio-focus', !!fullscreenEditor);
            this.fullscreenButton.textContent = enabled ? '⛶ 退出全屏' : '⛶ 全屏';
            this.fullscreenButton.setAttribute('aria-pressed', String(enabled));
            this.fullscreenButton.title = enabled ? '退出全屏（Esc）' : '全屏编辑（Ctrl/⌘ + Shift + F）';
            this.fullscreenButton.setAttribute('aria-label', this.fullscreenButton.title);
            this.refresh();
            if (focus) requestAnimationFrame(() => this.focus());
        }
        reset() {
            this.setFullscreen(false);
            this.setValue('');
        }
    }

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !fullscreenEditor || document.querySelector('dialog[open]')) return;
        event.preventDefault(); fullscreenEditor.setFullscreen(false, true);
    }, true);
    window.StudioEditor = StudioEditor;
})();
