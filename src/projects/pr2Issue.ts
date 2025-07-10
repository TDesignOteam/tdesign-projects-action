import { context } from '@actions/github';
import { Octokit } from '../types';
import { coreInfo } from '../utils/coreAlias';

type PRDetailsQueryResult = {
  repository: {
    pullRequest: {
      title: string;
      body: string;
      commits: {
        nodes: Array<{
          commit: {
            message: string;
          };
        }>;
      };
      reviews: {
        nodes: Array<{
          body: string;
        }>;
      };
    } | null;
  } | null;
};

export const pr2Issue = async (octokit: Octokit) => {
  const { owner, repo } = context.repo;
  const prNumber = context.payload.pull_request?.number;

  try {
    const query = `
      query GetPRDetails($owner: String!, $repo: String!, $prNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $prNumber) {
            title
            body
            commits(first: 100) {
              nodes {
                commit {
                  message
                }
              }
            }
            reviews(last: 100) {
              nodes {
                body
                comments(first: 100) {
                  nodes {
                    body
                  }
                }
              }
            }
            comments(first: 100) {
              nodes {
                body
              }
            }
          }
        }
      }
      `;

    const result = await octokit.graphql<PRDetailsQueryResult>(query, {
      owner,
      repo,
      prNumber
    });

    coreInfo(`PR Details: ${JSON.stringify(result, null, 2)}`);
  } catch (error) {
    console.error('Failed to get linked issues:', error);
  }
};
