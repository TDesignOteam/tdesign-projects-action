/**
 * Issue 触发器
 *
 * 用途: 自动管理 GitHub Project V2 中的 issue 条目
 *
 * 功能说明:
 * 1. 监听 issue 状态变化事件
 * 2. 当 issue 被关闭且不包含 'to be published' 标签时，自动从项目看板中移除
 * 3. 保持项目看板整洁，避免已关闭的无关 issue 堆积
 *
 * 触发条件:
 * - issue 状态为 closed
 * - issue 不包含 'to be published' 标签
 * - issue 存在于指定的 Project V2 中
 */

import type { Octokit } from '../types'
import { context } from '@actions/github'
import {
  coreError,
  coreInfo,
  coreNotice,
  coreWarning,
} from '../utils/coreAlias'
import { queryIssueInProjectV2Items } from '../utils/github/query/queryIssueInProjectV2Items'
import { getOrgProjectV2 } from '../utils/github/query/queryOrgProjectV2'
import { queryProjectNodeId } from '../utils/github/shared/queryProjectNodeId'

export async function issueTrigger(octokit: Octokit, projectId: number) {
  try {
    const { owner, repo, number: issue_number } = context.issue
    // 获取 issue 详情
    const { data: issueDetail } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number,
    })

    const hasTargetLabel = issueDetail.labels.some((label) => {
      if (typeof label === 'string') {
        coreInfo(`label: ${label}`)
        return label === 'to be published'
      }
      coreInfo(`label: ${label.name}`)
      return label.name === 'to be published'
    })
    if (issueDetail.state === 'open') {
      coreNotice(`成功创建 issue ${issue_number} `)
      return
    }

    if (issueDetail.state === 'closed' && !hasTargetLabel) {
      const project = await getOrgProjectV2(octokit, owner, projectId)
      if (!project) {
        coreError('未提供 Project 对象')
        return null
      }

      const projectNodeId = await queryProjectNodeId(project)
      if (!projectNodeId) {
        coreError('未提供 Project Node ID')
        return null
      }

      const projectItems = await queryIssueInProjectV2Items(
        octokit,
        owner,
        repo,
        projectNodeId,
        issue_number,
      )

      if (!projectItems.isInProject) {
        coreWarning(`issue ${issue_number} 不在项目中`)
        return
      }

      coreInfo(
        `即将将 issue ${issue_number} (node ID: ${projectItems.item?.node_id}) 从项目 ${projectNodeId} 中移除`,
      )

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
          itemId: projectItems.item?.node_id,
        },
      )
      coreInfo(
        `已将 issue ${issue_number} (node ID: ${projectItems.item?.node_id}) 从项目中移除`,
      )
    }

    coreError(`未匹配到事件，当前 issue 状态为: ${issueDetail.state}`)
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    coreError(`Error checking issue: ${errorMessage}`)
    return false
  }
}
