import { Octokit } from '../../types/index';
import { info as coreInfo, error as coreError } from '@actions/core';

/**
 * 项目项信息
 */
export interface ProjectItemInfo {
  node_id: string;
  url: string;
}

/**
 * 检查 Issue 是否在 GitHub Project V2 中的结果
 */
export interface QueryProjectV2Item {
  node?: {
    id: string;
    projectItems: {
      totalCount: number;
      nodes: Array<{
        id: string; // 项目项的 node_id
        url: string; // 项目项的 URL
      }>;
    };
  };
}

/**
 * 检查指定 Issue 是否在 GitHub Project V2 中，并返回关联的项目项信息
 * @param octokit GitHub Octokit 实例
 * @param issueNodeId Issue 的 Node ID
 * @returns 包含是否关联的标志和项目项信息（如果存在）
 */
export async function queryProjectV2Item(
  octokit: Octokit,
  issueNodeId: string
): Promise<{ isInProject: boolean; item?: ProjectItemInfo }> {
  // 验证 issueNodeId 是否为有效的 Node ID
  if (
    !issueNodeId ||
    typeof issueNodeId !== 'string' ||
    issueNodeId.trim() === ''
  ) {
    coreError(`无效的 Issue Node ID: ${issueNodeId}`);
    throw new Error(`Invalid issue node ID: ${issueNodeId}`);
  }

  coreInfo(`检查 Issue Node ID: ${issueNodeId} 是否关联 Project V2`);

  const query = `
    query ($issueNodeId: ID!) {
      node(id: $issueNodeId) {
        ... on Issue {
          id
          projectItems(first: 1) {
            totalCount
            nodes {
              id
              content {
                ... on Issue {
                  url
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const result = await octokit.graphql<QueryProjectV2Item>(query, {
      issueNodeId
    });

    // 检查节点是否存在且是 Issue
    const issueNode = result?.node;
    if (!issueNode || !issueNode.projectItems) {
      coreInfo(
        `未找到对应的 Issue 或 Project 关联数据, Node ID: ${issueNodeId}`
      );
      return { isInProject: false };
    }

    // 获取关联项目的数量
    const isInProject = issueNode.projectItems.totalCount > 0;
    coreInfo(`Issue ${isInProject ? '已关联' : '未关联'} Project V2`);

    // 如果有关联项目，返回项目项信息
    if (isInProject) {
      const firstItem = issueNode.projectItems.nodes[0];
      coreInfo(`关联项目项: node_id=${firstItem.id}, url=${firstItem.url}`);
      return {
        isInProject: true,
        item: {
          node_id: firstItem.id,
          url: firstItem.url
        }
      };
    }

    return { isInProject: false };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    coreError(`检查 Issue 是否在 Project V2 中失败: ${errorMessage}`);
    throw error;
  }
}
