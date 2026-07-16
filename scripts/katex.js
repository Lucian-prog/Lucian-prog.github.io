'use strict';

const katex = require('katex');

const renderMath = (math, displayMode) => katex.renderToString(math.trim(), {
  displayMode,
  throwOnError: false,
  strict: 'warn'
});

hexo.extend.filter.register('marked:extensions', (extensions) => {
  extensions.push({
    name: 'blockMath',
    level: 'block',
    start(src) {
      return src.match(/\$\$/)?.index;
    },
    tokenizer(src) {
      const match = /^\$\$[ \t]*\r?\n([\s\S]+?)\r?\n\$\$(?:\r?\n|$)/.exec(src);
      if (!match) return undefined;

      return { type: 'blockMath', raw: match[0], math: match[1] };
    },
    renderer(token) {
      return `${renderMath(token.math, true)}\n`;
    }
  });

  extensions.push({
    name: 'inlineMath',
    level: 'inline',
    start(src) {
      return src.match(/\$/)?.index;
    },
    tokenizer(src) {
      const match = /^\$([^$\r\n]+?)\$/.exec(src);
      if (!match) return undefined;

      return { type: 'inlineMath', raw: match[0], math: match[1] };
    },
    renderer(token) {
      return renderMath(token.math, false);
    }
  });
});
