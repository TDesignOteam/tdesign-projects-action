import { context } from '@actions/github';
import { Octokit } from '../types';
import { coreError, coreInfo } from '../utils/coreAlias';
import { getOrgProjectV2 } from '../utils/github/query/queryOrgProjectV2';
import { queryProjectNodeId } from '../utils/github/shared/queryProjectNodeId';

export const issueTrigger = async (octokit: Octokit, projectId: number) => {
  try {
    const { owner, repo, number: issue_number } = context.issue;
    // 获取 issue 详情
    const { data: issueDetail } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number
    });

    const hasTargetLabel = issueDetail.labels.some((label) =>
      typeof label === 'string'
        ? label === 'to be published'
        : label.name === 'to be published'
    );

    if (issueDetail.state === 'closed' && !hasTargetLabel) {
      coreInfo(`开始查询项目...`);

      const project = await getOrgProjectV2(octokit, owner, projectId);
      if (!project) {
        coreError('未提供 Project 对象');
        return null;
      }

      coreInfo(`开始查询项目节点 ID...`);
      const projectNodeId = await queryProjectNodeId(project);

      await octokit.graphql(
        `
          mutation RemoveFromProject($projectId: ID!, $itemId: ID!) {
            deleteProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) {
              deletedItemId
            }
          }
        `,
        {
          projectId: projectNodeId,
          itemId: issueDetail.node_id
        }
      );
    }

    coreInfo(
      `已将 issue ${issue_number} (node ID: ${issueDetail.node_id}) 从项目中移除`
    );
  } catch (error) {
    console.error('Error checking issue:', error);
    return false;
  }
};
