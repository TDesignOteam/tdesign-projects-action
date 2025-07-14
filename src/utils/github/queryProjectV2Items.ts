import { Octokit } from '../../types/index';
import { info as coreInfo, error as coreError } from '@actions/core';

/**
 * 获取项目 V2 items 的结果
 */
export interface GetProjectV2ItemsResult {
  node?: {
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
}

/**
 * @param octokit GitHub Octokit instance
 * @param projectNodeId Project Node ID (not the number from URL)
 * @param first Number of items to fetch
 * @param after Cursor for pagination
 * @returns Project V2 items result
 */
export async function getProjectV2Items(
  octokit: Octokit,
  projectNodeId: string,
  first: number = 100,
  after?: string
) {
  // 验证 projectNodeId 是否为有效的 Node ID
  if (
    !projectNodeId ||
    typeof projectNodeId !== 'string' ||
    projectNodeId.trim() === ''
  ) {
    coreError(`无效的项目 Node ID: ${projectNodeId}`);
    throw new Error(`Invalid project node ID: ${projectNodeId}`);
  }

  coreInfo(`查询项目 Node ID: ${projectNodeId}`);

  const query = `
    query ($projectNodeId: ID!, $first: Int!, $after: String) {
      node(id: $projectNodeId) {
        ... on ProjectV2 {
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

  try {
    const result = await octokit.graphql<GetProjectV2ItemsResult>(query, {
      projectNodeId,
      first,
      after
    });

    const project = result?.node;
    if (!project) {
      coreError(`未找到对应的 Project, Node ID: ${projectNodeId}`);
      return;
    }

    coreInfo(`获取 Project Node ID: ${project.id}`);
    coreInfo(`获取到 ${project.items.nodes.length} 个 items`);

    return project;
  } catch (error) {
    coreError(
      `查询 Project V2 items 失败: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}
