import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

export default [
	// dev/ is a standalone test harness run by node directly, not module source.
	{ ignores: ['dev/**'] },
	...(await generateEslintConfig({ enableTypescript: true })),
]
