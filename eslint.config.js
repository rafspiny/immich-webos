var browser = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', console: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  XMLHttpRequest: 'readonly', Promise: 'readonly', Image: 'readonly', requestAnimationFrame: 'readonly',
  module: 'writable', require: 'readonly', global: 'readonly', NodeList: 'readonly', CSS: 'readonly', fetch: 'readonly'
};
module.exports = [{
  files: ['core/**/*.js', 'shell-legacy/js/**/*.js'],
  languageOptions: { ecmaVersion: 5, sourceType: 'script', globals: browser },
  rules: { 'no-undef': 'error', 'no-redeclare': 'error' }
}];
