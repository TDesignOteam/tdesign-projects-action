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

const TARGET_LABEL = 'to be published'

type IssueDetail = Awaited<ReturnType<Octokit['rest']['issues']['get']>>['data']
type IssueLabels = IssueDetail['labels']

/**
 * 检查 issue 是否包含指定标签
 */
function hasLabel(labels: IssueLabels, targetLabel: string): boolean {
  return labels.some((label) => {
    const labelName = typeof label === 'string' ? label : label.name
    return labelName === targetLabel
  })
}

export async function issueTrigger(octokit: Octokit, projectId: number) {
  const { owner, repo, number: issue_number } = context.issue

  // 1. 获取 issue 详情
  let issueState: string
  let issueLabels: IssueLabels
  try {
    const { data } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number,
    })
    issueState = data.state
    issueLabels = data.labels
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    coreError(`获取 issue 详情失败: ${errorMessage}`)
    return
  }

  // 2. 处理 open 状态
  if (issueState === 'open') {
    coreNotice(`成功创建 issue ${issue_number}`)
    return
  }

  // 3. 处理 closed 状态（带 target label 的跳过）
  if (issueState !== 'closed') {
    coreInfo(`未匹配到事件，当前 issue 状态为: ${issueState}`)
    return
  }

  if (hasLabel(issueLabels, TARGET_LABEL)) {
    coreInfo(`issue ${issue_number} 包含 '${TARGET_LABEL}' 标签，跳过移除`)
    return
  }

  // 4. 获取 Project 信息
  let project
  try {
    project = await getOrgProjectV2(octokit, owner, projectId)
    if (!project) {
      coreError('未提供 Project 对象')
      return
    }
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    coreError(`获取 Project 信息失败: ${errorMessage}`)
    return
  }

  // 5. 获取 Project Node ID
  let projectNodeId: string
  try {
    const nodeId = await queryProjectNodeId(project)
    if (!nodeId) {
      coreError('未查询到 Project Node ID')
      return
    }
    projectNodeId = nodeId
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    coreError(`查询 Project Node ID 失败: ${errorMessage}`)
    return
  }

  // 6. 检查 issue 是否在项目中
  let itemNodeId: string
  try {
    const projectItems = await queryIssueInProjectV2Items(
      octokit,
      owner,
      repo,
      projectNodeId,
      issue_number,
    )

    if (!projectItems.isInProject || !projectItems.item?.node_id) {
      coreWarning(`issue ${issue_number} 不在项目中`)
      return
    }
    itemNodeId = projectItems.item.node_id
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    coreError(`查询 issue 项目状态失败: ${errorMessage}`)
    return
  }

  // 7. 从项目中移除 issue
  try {
    coreInfo(`即将将 issue ${issue_number} (node ID: ${itemNodeId}) 从项目 ${projectNodeId} 中移除`)

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
        itemId: itemNodeId,
      },
    )

    coreInfo(`已将 issue ${issue_number} (node ID: ${itemNodeId}) 从项目中移除`)
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    coreError(`从项目移除 issue 失败: ${errorMessage}`)
  }
}
