import { defineConfig } from 'tsdown'
import packageJson from './package.json' with { type: 'json' }

export default defineConfig({
  entry: ['src/index.ts'],
  noExternal: [...Object.keys(packageJson.dependencies)],
  inlineOnly: [
    '@actions/core',
    '@actions/exec',
    '@actions/github',
    '@actions/http-client',
    '@actions/io',
    '@fastify/busboy',
    '@octokit/auth-token',
    '@octokit/core',
    '@octokit/endpoint',
    '@octokit/graphql',
    '@octokit/plugin-paginate-rest',
    '@octokit/plugin-rest-endpoint-methods',
    '@octokit/request',
    '@octokit/request-error',
    'before-after-hook',
    'deprecation',
    'fast-content-type-parse',
    'once',
    'tunnel',
    'undici',
    'universal-user-agent',
    'wrappy',
  ],
})
