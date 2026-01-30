import { defineConfig } from 'tsdown'
import packageJson from './package.json' with { type: 'json' }

export default defineConfig({
  entry: ['src/index.ts'],
  noExternal: [...Object.keys(packageJson.dependencies)],
  inlineOnly: [
    '@actions/core',
    '@actions/http-client',
    'tunnel',
    'undici',
    '@actions/io',
    '@actions/exec',
    '@actions/github',
    '@fastify/busboy',
    'universal-user-agent',
    'before-after-hook',
    '@octokit/endpoint',
    'deprecation',
    'wrappy',
    'once',
    '@octokit/request-error',
    '@octokit/request',
    '@octokit/graphql',
    '@octokit/auth-token',
    '@octokit/core',
    '@octokit/plugin-rest-endpoint-methods',
    '@octokit/plugin-paginate-rest',
  ],
})
