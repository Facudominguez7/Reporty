import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    ignores: ['node_modules/**', '.next/**', '.open-next/**', '.wrangler/**', 'build/**', 'dist/**'],
  },
]

export default eslintConfig
