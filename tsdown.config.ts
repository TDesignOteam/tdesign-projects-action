import { defineConfig } from 'tsdown'
import packageJson from './package.json' with { type: 'json' }

export default defineConfig({
  entry: ['src/index.ts'],
  deps: {
    alwaysBundle: [...Object.keys(packageJson.dependencies)],
    onlyAllowBundle: [
      '@actions/core',
      '@actions/exec',
      '@actions/github',
      '@actions/http-client',
      '@actions/io',
      '@octokit/auth-token',
      '@octokit/core',
      '@octokit/endpoint',
      '@octokit/graphql',
      '@octokit/plugin-paginate-rest',
      '@octokit/plugin-rest-endpoint-methods',
      '@octokit/request',
      '@octokit/request-error',
      'before-after-hook',
      'fast-content-type-parse',
      'tunnel',
      'undici',
      'universal-user-agent',
    ],
  },
})
