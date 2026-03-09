/**
 * Pull Request 触发器
 *
 * 用途: 根据 PR 状态变化自动更新关联 issue 在 GitHub Project V2 中的状态
 *
 * 功能说明:
 * 1. 监听 PR 的打开、关闭、合并、重新打开等事件
 * 2. 从 PR 的多个位置提取关联的 issue 编号:
 *    - PR 标题和描述
 *    - 提交信息(commit messages)
 *    - PR 评论(comments)
 *    - PR 审查评论(review comments)
 * 3. 根据 PR 状态自动更新关联 issue 在项目中的状态:
 *    - PR opened: 设置为进行中(In Progress)
 *    - PR merged: 设置为已完成(Finished)
 *    - PR closed(未合并): 恢复为待办(To Do)
 *    - PR reopened: 设置为进行中(In Progress)
 *
 * Issue 识别格式:
 * - #123: 同仓库的 issue 引用
 * - owner/repo#123: 跨仓库的 issue 引用
 * - https://github.com/owner/repo/issues/123: 完整 URL 引用
 *
 * 注意: 只处理当前仓库的 issue,跨仓库引用会被过滤
 */

import type { Octokit } from '../types'
import type { RepoKey } from '../utils'
import { context } from '@actions/github'
import { issueFieldType, repoFields } from '../utils'
import { coreError, coreInfo, coreWarning } from '../utils/coreAlias'
import { queryIssueInProjectV2Items } from '../utils/github/query/queryIssueInProjectV2Items'
import { getOrgProjectV2 } from '../utils/github/query/queryOrgProjectV2'
import { queryFieldsSingleSelectOptionId } from '../utils/github/shared/queryFieldsSingleSelectOptionId'
import { queryProjectField } from '../utils/github/shared/queryProjectField'
import { queryProjectNodeId } from '../utils/github/shared/queryProjectNodeId'
import { updateSingleSelectOptionField } from '../utils/github/updates/updateField'

// 正则表达式常量
const CROSS_REPO_REGEX = /(\w[\w-]*)\/(\w[\w-]*)#(\d+)/g
const URL_REGEX = /https?:\/\/github\.com\/(\w[\w-]*)\/(\w[\w-]*)\/issues\/(\d+)/g
const SIMPLE_REGEX = /(?<![/\w-])#(\d+)/g

/**
 * 从文本中提取当前仓库的 issue 编号
 */
function extractIssueNumber(
  extractBody: string,
  owner: string,
  repo: string,
): number[] {
  const issuesSet = new Set<number>()

  // 匹配 owner/repo#123 格式
  for (const match of extractBody.matchAll(CROSS_REPO_REGEX)) {
    if (match[1] === owner && match[2] === repo) {
      issuesSet.add(Number(match[3]))
    }
  }

  // 匹配 https://github.com/owner/repo/issues/123 格式
  for (const match of extractBody.matchAll(URL_REGEX)) {
    if (match[1] === owner && match[2] === repo) {
      issuesSet.add(Number(match[3]))
    }
  }

  // 匹配独立的 #123 格式（排除已匹配的 owner/repo#123）
  for (const match of extractBody.matchAll(SIMPLE_REGEX)) {
    issuesSet.add(Number(match[1]))
  }

  return [...issuesSet]
}

// function sanitizeStringForWindows(str: string): string {
//   // 将所有 emoji 替换为 [emoji]
//   return str.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '[emoji]')
// }

interface PRDetailsQueryResult {
  repository: {
    pullRequest: {
      title: string
      body: string
      commits: {
        nodes: Array<{ commit: { message: string } }>
      }
      reviews: {
        nodes: Array<{
          body: string
          comments: { nodes: Array<{ body: string }> }
        }>
      }
      comments: {
        nodes: Array<{ body: string }>
      }
    } | null
  } | null
}

/**
 * 从 PR 详情中提取所有相关文本
 */
function extractPRTexts(pr: NonNullable<PRDetailsQueryResult['repository']>['pullRequest'] | undefined): string {
  if (!pr)
    return ''

  const texts = [
    pr.title,
    pr.body,
    ...pr.commits.nodes.map(n => n.commit.message),
    ...pr.reviews.nodes.map(r => r.body),
    ...pr.reviews.nodes.flatMap(r => r.comments.nodes.map(c => c.body)),
    ...pr.comments.nodes.map(c => c.body),
  ]

  return texts.filter(Boolean).join('\n')
}

/**
 * PR 事件到 issue 状态的映射
 */
type PREventKey = 'opened' | 'merged' | 'closed' | 'reopened'

function getPREventKey(eventAction: string, isMerged: boolean): PREventKey | null {
  if (eventAction === 'opened')
    return 'opened'
  if (eventAction === 'closed' && isMerged)
    return 'merged'
  if (eventAction === 'closed' && !isMerged)
    return 'closed'
  if (eventAction === 'reopened')
    return 'reopened'
  return null
}

const PR_EVENT_STATUS_MAP: Record<PREventKey, { status: keyof typeof issueFieldType, message: string }> = {
  opened: { status: 'inProgress', message: 'PR被打开' },
  merged: { status: 'finished', message: 'PR被合并' },
  closed: { status: 'needToDo', message: 'PR被关闭但未合并' },
  reopened: { status: 'inProgress', message: 'PR被重新打开' },
}

export async function prTrigger(octokit: Octokit, projectId: number) {
  const { owner, repo } = context.repo
  const prNumber = context.payload.pull_request?.number
  const eventAction = context.payload.action ?? ''
  const isMerged = context.payload.pull_request?.merged ?? false

  // 确定事件类型
  const eventKey = getPREventKey(eventAction, isMerged)
  if (!eventKey) {
    coreInfo(`未匹配到事件: eventAction: ${eventAction}, isMerged: ${isMerged}`)
    return
  }

  const { status, message } = PR_EVENT_STATUS_MAP[eventKey]
  coreInfo(message)

  // 1. 获取 PR 详情并提取关联 issues
  let issues: number[]
  try {
    const query = `
      query GetPRDetails($owner: String!, $repo: String!, $prNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $prNumber) {
            title
            body
            commits(first: 100) {
              nodes { commit { message } }
            }
            reviews(last: 100) {
              nodes {
                body
                comments(first: 100) { nodes { body } }
              }
            }
            comments(first: 100) { nodes { body } }
          }
        }
      }`

    const result = await octokit.graphql<PRDetailsQueryResult>(query, {
      owner,
      repo,
      prNumber,
    })

    const prTexts = extractPRTexts(result.repository?.pullRequest)
    issues = extractIssueNumber(prTexts, owner, repo)

    coreInfo(`PR #${prNumber} linked issues: ${issues.join(', ')}`)

    if (issues.length === 0) {
      coreWarning(`未找到关联的 issue!`)
      return
    }
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    coreError(`获取 PR 详情失败: ${errorMessage}`)
    return
  }

  // 2. 获取 Project 信息
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

  // 3. 获取 Project Node ID
  let projectNodeId: string
  try {
    const nodeId = await queryProjectNodeId(project)
    if (!nodeId) {
      coreError('未查询到 project ID')
      return
    }
    projectNodeId = nodeId
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    coreError(`查询 Project Node ID 失败: ${errorMessage}`)
    return
  }

  // 4. 获取字段配置
  let fieldId: string
  let targetOptionId: string
  try {
    const repoField = await queryProjectField(project, repoFields[repo as RepoKey].field)
    if (!repoField?.id) {
      coreError('未找到 fieldId')
      return
    }
    fieldId = repoField.id

    const optionId = await queryFieldsSingleSelectOptionId(
      repoField.options,
      issueFieldType[status],
    )
    if (!optionId) {
      coreError(`未找到状态选项ID: ${status}`)
      return
    }
    targetOptionId = optionId
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    coreError(`获取字段配置失败: ${errorMessage}`)
    return
  }

  // 5. 处理每个关联的 issue
  const updatePromises = issues.map(issueNumber => processIssue(
    octokit,
    owner,
    repo,
    projectNodeId,
    issueNumber,
    fieldId,
    targetOptionId,
  ))

  const results = await Promise.allSettled(updatePromises)
  const failedCount = results.filter(r => r.status === 'rejected').length
  if (failedCount > 0) {
    coreWarning(`${failedCount}/${issues.length} 个 issue 处理失败`)
  }
}

async function processIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  projectNodeId: string,
  issueNumber: number,
  fieldId: string,
  targetOptionId: string,
) {
  try {
    coreInfo(`Processing issue #${issueNumber}`)

    const projectItem = await queryIssueInProjectV2Items(
      octokit,
      owner,
      repo,
      projectNodeId,
      issueNumber,
    )

    if (!projectItem.isInProject) {
      coreInfo(`Issue #${issueNumber} not in project, skipping`)
      return
    }

    const itemNodeId = projectItem.item?.node_id
    if (!itemNodeId) {
      coreError(`未找到 project item id for issue #${issueNumber}`)
      return
    }

    coreInfo(`Issue #${issueNumber} in project, item id: ${itemNodeId}`)

    await updateSingleSelectOptionField(
      octokit,
      projectNodeId,
      itemNodeId,
      fieldId,
      { singleSelectOptionId: targetOptionId },
    )

    coreInfo(`Issue #${issueNumber} 状态更新成功`)
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    coreError(`Failed to process issue #${issueNumber}: ${errorMessage}`)
  }
}
