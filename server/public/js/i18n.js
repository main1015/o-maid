let currentLang = localStorage.getItem('omaid_lang');

if (!currentLang) {
    const navLang = navigator.language.toLowerCase();
    currentLang = navLang.startsWith('zh') ? 'zh' : 'en';
}

window.i18n = {
    translations: {},
    currentLang: currentLang,
    t: function(key, params = {}) {
        let text = this.translations[key] || key;
        for (const p in params) {
            text = text.replace('{' + p + '}', params[p]);
        }
        return text;
    },
    setLang: function(lang) {
        localStorage.setItem('omaid_lang', lang);
        this.currentLang = lang;
    },
    getLang: function() {
        return this.currentLang;
    },
    applyI18n: function() {
        const t = this.t.bind(this);
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'textarea') {
                if (el.hasAttribute('placeholder')) {
                    el.placeholder = t(key);
                } else {
                    el.value = t(key);
                }
            } else {
                // Find if there is an icon before the text to preserve it
                const iconNode = el.querySelector('.icon, .stat-icon, .logout-icon');
                if (iconNode) {
                    Array.from(el.childNodes).forEach(node => {
                        if (node !== iconNode && node.nodeType === Node.TEXT_NODE) {
                            node.textContent = '';
                        } else if (node.tagName === 'SPAN' && !node.classList.contains('icon') && !node.classList.contains('stat-icon') && !node.classList.contains('logout-icon')) {
                            node.innerHTML = t(key);
                        }
                    });
                    if (!el.querySelector('span:not(.icon):not(.stat-icon):not(.logout-icon)')) {
                       const textSpan = document.createElement('span');
                       textSpan.innerHTML = t(key);
                       el.appendChild(textSpan);
                    }
                } else {
                    el.innerHTML = t(key);
                }
            }
        });

        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = t(key);
        });

        window.dispatchEvent(new Event('i18n_changed'));
    },
    init: async function() {
        try {
            const res = await fetch('/locales/' + this.currentLang + '.json');
            this.translations = await res.json();
        } catch (e) {
            console.error('Failed to load i18n dictionary:', e);
            this.translations = {};
        }
        this.applyI18n();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Inject Language Selector to Header
    const topHeader = document.querySelector('.header-meta');
    if (topHeader && !document.getElementById('lang-selector')) {
        const langSelect = document.createElement('select');
        langSelect.id = 'lang-selector';
        langSelect.className = 'lang-selector';
        langSelect.style.cssText = 'padding: 4px; border-radius: 4px; background: rgba(255,255,255,0.1); color: inherit; border: 1px solid rgba(255,255,255,0.2); margin-right: 12px; cursor: pointer; outline: none;';
        
        langSelect.innerHTML = `
            <option style="color: #333;" value="zh" ${window.i18n.currentLang === 'zh' ? 'selected' : ''}>🌐 中文</option>
            <option style="color: #333;" value="en" ${window.i18n.currentLang === 'en' ? 'selected' : ''}>🌐 EN</option>
        `;

        langSelect.addEventListener('change', (e) => {
            window.i18n.setLang(e.target.value);
            window.location.reload();
        });

        topHeader.insertBefore(langSelect, topHeader.firstChild);
    }
});
