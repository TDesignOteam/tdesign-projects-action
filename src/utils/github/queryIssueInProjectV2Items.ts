import { Octokit } from '../../types/index';
import { coreInfo, coreError } from '../coreAlias';

/**
 * 项目项信息
 */
export interface ProjectItemInfo {
  node_id: string;
  url: string;
  project_id: string;
}

/**
 * 检查 Issue 是否在 GitHub Project V2 中的结果
 */
export interface QueryIssueInProjectV2Items {
  repository: {
    issue: {
      id: string;
      number: number;
      title: string;
      projectItems: {
        totalCount: number;
        nodes: Array<{
          id: string; // 项目项的 node_id
          project: {
            id: string;
            number: number;
            title: string;
          };
        }>;
      };
    };
  };
}

/**
 * 检查指定 Issue 是否在 GitHub Project V2 中，并返回关联的项目项信息
 * @param octokit GitHub Octokit 实例
 * @param owner 仓库所有者
 * @param repo 仓库名称
 * @param issueNumber Issue 编号
 * @returns 包含是否关联的标志和项目项信息（如果存在）
 */
export async function queryIssueInProjectV2Items(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<{ isInProject: boolean; item?: ProjectItemInfo }> {
  // 验证参数
  if (!owner || !repo || !issueNumber || issueNumber <= 0) {
    coreError(
      `无效的参数: owner=${owner}, repo=${repo}, issueNumber=${issueNumber}`
    );
    throw new Error(
      `Invalid parameters: owner=${owner}, repo=${repo}, issueNumber=${issueNumber}`
    );
  }

  coreInfo(
    `检查 Issue #${issueNumber} 在 ${owner}/${repo} 是否关联 Project V2`
  );

  const query = `
    query ($owner: String!, $repo: String!, $issueNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issueNumber) {
          id
          number
          title
          projectItems(first: 10) {
            totalCount
            nodes {
              id
              project {
                id
                number
                title
              }
            }
          }
        }
      }
    }
  `;

  try {
    const result = await octokit.graphql<QueryIssueInProjectV2Items>(query, {
      owner,
      repo,
      issueNumber
    });

    // 检查仓库和Issue是否存在
    const issue = result?.repository?.issue;
    if (!issue || !issue.projectItems) {
      coreInfo(
        `未找到对应的 Issue 或 Project 关联数据, Issue #${issueNumber} in ${owner}/${repo}`
      );
      return { isInProject: false };
    }

    // 获取关联项目的数量
    const isInProject = issue.projectItems.totalCount > 0;
    coreInfo(
      `Issue #${issueNumber} ${isInProject ? '已关联' : '未关联'} Project V2`
    );

    // 如果有关联项目，返回项目项信息
    if (isInProject) {
      const firstItem = issue.projectItems.nodes[0];
      coreInfo(
        `关联项目项: node_id=${firstItem.id}, project=${firstItem.project.title}`
      );
      return {
        isInProject: true,
        item: {
          node_id: firstItem.id,
          url: `https://github.com/orgs/${owner}/projects/${firstItem.project.number}`,
          project_id: firstItem.project.id
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
