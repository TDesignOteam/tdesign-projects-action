import { Octokit } from '../../../types/index';
import { info as coreInfo, error as coreError } from '@actions/core';

/**
 * 获取 Issue Node ID 的结果接口
 */
export interface QueryIssueNodeId {
  repository?: {
    issue?: {
      id: string; // Issue 的全局 Node ID
      number: number; // Issue 的数字编号
      title: string; // Issue 标题
    };
  };
}

/**
 * 获取指定 Issue 的 Node ID
 * @param octokit - GitHub Octokit 实例
 * @param owner - 仓库所有者
 * @param repo - 仓库名称
 * @param issueNumber - Issue 数字编号
 * @returns Promise<string> - 解析为 Issue 的 Node ID
 */
export async function queryIssueNodeId(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<string> {
  // 参数验证
  if (!owner || !repo || !issueNumber || issueNumber <= 0) {
    const errorMsg = `无效参数: owner=${owner}, repo=${repo}, issueNumber=${issueNumber}`;
    coreError(errorMsg);
    throw new Error(errorMsg);
  }

  coreInfo(`查询仓库 ${owner}/${repo} 的 Issue #${issueNumber}`);

  const query = `
    query ($owner: String!, $repo: String!, $issueNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issueNumber) {
          id
          number
          title
        }
      }
    }
  `;

  try {
    const result = await octokit.graphql<QueryIssueNodeId>(query, {
      owner,
      repo,
      issueNumber
    });

    // 检查结果有效性
    if (!result?.repository?.issue?.id) {
      const errorMsg = `未找到 Issue #${issueNumber} 或缺少 ID`;
      coreError(errorMsg);
      throw new Error(errorMsg);
    }

    const { id, number, title } = result.repository.issue;
    coreInfo(`成功获取 Issue #${number}: ${title} => Node ID: ${id}`);

    return id;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    coreError(`获取 Issue Node ID 失败: ${errorMessage}`);
    throw error;
  }
}
