import { context } from '@actions/github';
import { Octokit } from '../types';
import {
  coreError,
  coreInfo,
  coreNotice,
  coreWarning
} from '../utils/coreAlias';
import { getOrgProjectV2 } from '../utils/github/query/queryOrgProjectV2';
import { queryProjectNodeId } from '../utils/github/shared/queryProjectNodeId';
import { queryIssueInProjectV2Items } from '../utils/github/query/queryIssueInProjectV2Items';

export const issueTrigger = async (octokit: Octokit, projectId: number) => {
  try {
    const { owner, repo, number: issue_number } = context.issue;
    // 获取 issue 详情
    const { data: issueDetail } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number
    });

    const hasTargetLabel = issueDetail.labels.some((label) => {
      if (typeof label === 'string') {
        coreInfo(`label: ${label}`);
        return label === 'to be published';
      }
      coreInfo(`label: ${label.name}`);
      return label.name === 'to be published';
    });
    if (issueDetail.state === 'open') {
      coreNotice(`成功创建 issue ${issue_number} `);
      return;
    }

    if (issueDetail.state === 'closed' && !hasTargetLabel) {
      const project = await getOrgProjectV2(octokit, owner, projectId);
      if (!project) {
        coreError('未提供 Project 对象');
        return null;
      }

      const projectNodeId = await queryProjectNodeId(project);
      if (!projectNodeId) {
        coreError('未提供 Project Node ID');
        return null;
      }

      const projectItems = await queryIssueInProjectV2Items(
        octokit,
        owner,
        repo,
        projectNodeId,
        issue_number
      );

      if (!projectItems.isInProject) {
        coreWarning(`issue ${issue_number} 不在项目中`);
        return;
      }

      coreInfo(
        `即将将 issue ${issue_number} (node ID: ${projectItems.item?.node_id}) 从项目 ${projectNodeId} 中移除`
      );

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
          itemId: projectItems.item?.node_id
        }
      );
      coreInfo(
        `已将 issue ${issue_number} (node ID: ${projectItems.item?.node_id}) 从项目中移除`
      );
    }

    coreError(`未匹配到事件，当前 issue 状态为: ${issueDetail.state}`);
  } catch (error) {
    console.error('Error checking issue:', error);
    return false;
  }
};
