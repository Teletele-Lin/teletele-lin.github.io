(function () {
    'use strict';

    var storageKey = 'teletele-theme';
    var preference = null;
    var systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

    try {
        preference = localStorage.getItem(storageKey);
    } catch (error) {
        // 禁用存储时，仍然允许在当前页面切换主题。
    }
    if (preference !== 'light' && preference !== 'dark') preference = null;

    function applyTheme(theme) {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
        document.getElementById('theme-light').media = theme === 'light' ? 'all' : 'not all';
        document.getElementById('theme-dark').media = theme === 'dark' ? 'all' : 'not all';
        document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#111b29' : '#f8fafc';
        var button = document.getElementById('theme-toggle');
        if (button) {
            button.textContent = theme === 'dark' ? '浅色模式' : '深色模式';
            button.setAttribute('aria-label', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
        }
    }

    applyTheme(preference || (systemTheme.matches ? 'dark' : 'light'));

    document.addEventListener('DOMContentLoaded', function () {
        applyTheme(document.documentElement.dataset.theme);
        document.getElementById('theme-toggle').addEventListener('click', function () {
            preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            applyTheme(preference);
            try {
                localStorage.setItem(storageKey, preference);
            } catch (error) {
                // 主题切换不依赖持久化存储。
            }
        });
    });

    systemTheme.addEventListener('change', function (event) {
        if (!preference) applyTheme(event.matches ? 'dark' : 'light');
    });
}());
