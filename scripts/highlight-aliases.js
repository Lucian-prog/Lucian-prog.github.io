'use strict';

const HDL_LANGUAGE_ALIASES = new Map([
  ['systemverilog', 'verilog'],
  ['sv', 'verilog']
]);

hexo.extend.filter.register('before_post_render', (data) => {
  if (!data.content) return data;

  data.content = data.content.replace(
    /(^|\n)([ \t]*)(`{3,}|~{3,})([ \t]*)(systemverilog|sv)([^\r\n]*)/gi,
    (match, lineStart, indent, fence, spacing, language, rest) => {
      const alias = HDL_LANGUAGE_ALIASES.get(language.toLowerCase());
      return `${lineStart}${indent}${fence}${spacing}${alias}${rest}`;
    }
  );

  return data;
}, 1);
