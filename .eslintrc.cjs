const createESLintConfig = require('lionconfig/eslint');

module.exports = createESLintConfig({
	rules: {
		'unicorn/no-process-exit': 'off',
	},
});
