import { Octokit } from '../../types/index';
import { info as coreInfo, error as coreError } from '@actions/core';

/**
 * 获取项目 V2 items 的结果
 */
export interface GetProjectV2ItemsResult {
  organization?: {
    projectV2?: {
      id: string;
      items: {
        pageInfo: {
          hasNextPage: boolean;
          endCursor?: string;
        };
        nodes: Array<{
          id: string;
        }>;
      };
    };
  };
}

/**
 * @param octokit GitHub Octokit instance
 * @param org Organization name
 * @param projectNumber Project number
 * @param first Number of items to fetch
 * @param after Cursor for pagination
 * @returns Project V2 items result
 */

export async function getProjectV2Items(
  octokit: Octokit,
  org: string,
  projectNumber: number,
  first: number = 100,
  after?: string
) {
  const query = `
    query ($org: String!, $projectNumber: Int!, $first: Int!, $after: String) {
      organization(login: $org) {
        projectV2(number: $projectNumber) {
          id
          items(first: $first, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
            }
          }
        }
      }
    }
  `;

  const result = await octokit.graphql<GetProjectV2ItemsResult>(query, {
    org,
    projectNumber,
    first,
    after
  });

  const project = result?.organization?.projectV2;
  if (!project) {
    coreError('未找到对应的 Project');
    return;
  }

  coreInfo(`获取 Project Node ID: ${project.id}`);
  coreInfo(`获取到 ${project.items.nodes.length} 个 items`);

  return project;
}
