const fs = require('fs');
const path = require('path');

const locales = {};

// 预加载字典
['en', 'zh'].forEach(lang => {
    try {
        const filePath = path.join(__dirname, '..', 'locales', `${lang}.json`);
        if (fs.existsSync(filePath)) {
            locales[lang] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (err) {
        console.error(`Failed to load locale file: ${lang}.json`, err);
    }
});

const i18nMiddleware = (req, res, next) => {
    // 1. 获取客户端语言
    let lang = 'zh'; // 默认语言
    const acceptLanguage = req.headers['accept-language'];
    
    if (acceptLanguage) {
        // 解析 accept-language 头部，例如: zh-CN,zh;q=0.9,en;q=0.8
        const langs = acceptLanguage.split(',').map(item => {
            const [code, qStr] = item.split(';');
            let q = 1;
            if (qStr && qStr.startsWith('q=')) {
                q = parseFloat(qStr.split('=')[1]);
            }
            return { code: code.trim().toLowerCase(), q };
        }).sort((a, b) => b.q - a.q);

        for (const l of langs) {
            if (l.code.startsWith('en')) {
                lang = 'en';
                break;
            } else if (l.code.startsWith('zh')) {
                lang = 'zh';
                break;
            }
        }
    }

    // 2. 挂载翻译函数 req.t 到 request 对象
    req.t = (key) => {
        const dictionary = locales[lang] || locales['zh'] || {};
        return dictionary[key] || locales['zh'][key] || key;
    };

    next();
};

module.exports = i18nMiddleware;
