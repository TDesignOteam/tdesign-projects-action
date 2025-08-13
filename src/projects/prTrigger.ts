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

/*
 * @description 只匹配当前仓库的 issue
 */

function extractIssueNumber(
  extractBody: string,
  owner: string,
  repo: string,
): number[] {
  // 使用正则表达式匹配 #123、owner/repo#123、https://github.com/owner/repo/issues/123 格式
  const issueRegex
    = /(\w[\w-]*)\/(\w[\w-]*)#(\d+)|#(\d+)|(https?:\/\/github\.com\/(\w[\w-]*)\/(\w[\w-]*)\/issues\/(\d+))/g

  const issuesSet = new Set<number>()
  let match: RegExpExecArray | null

  match = issueRegex.exec(extractBody)
  while (match !== null) {
    if (match[3]) {
      // owner/repo#123 格式
      if (match[1] === owner && match[2] === repo) {
        issuesSet.add(Number(match[3]))
      }
    }
    else if (match[4]) {
      // #123 格式
      issuesSet.add(Number(match[4]))
    }
    else if (match[8]) {
      // https://github.com/owner/repo/issues/123 格式
      if (match[6] === owner && match[7] === repo) {
        issuesSet.add(Number(match[8]))
      }
    }
    match = issueRegex.exec(extractBody)
  }
  return Array.from(issuesSet)
}

interface PRDetailsQueryResult {
  repository: {
    pullRequest: {
      title: string
      body: string
      commits: {
        nodes: Array<{
          commit: {
            message: string
          }
        }>
      }
      reviews: {
        nodes: Array<{
          body: string
          comments: {
            nodes: Array<{
              body: string
            }>
          }
        }>
      }
      comments: {
        nodes: Array<{
          body: string
        }>
      }
    } | null
  } | null
}

export async function prTrigger(octokit: Octokit, projectId: number) {
  const { owner, repo } = context.repo
  const prNumber = context.payload.pull_request?.number

  const eventAction = context.payload.action
  const isMerged = context.payload.pull_request?.merged

  try {
    const query = `
      query GetPRDetails($owner: String!, $repo: String!, $prNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $prNumber) {
            title
            body
            commits(first: 100) {
              nodes {
                commit {
                  message
                }
              }
            }
            reviews(last: 100) {
              nodes {
                body
                comments(first: 100) {
                  nodes {
                    body
                  }
                }
              }
            }
            comments(first: 100) {
              nodes {
                body
              }
            }
          }
        }
      }
      `

    const result = await octokit.graphql<PRDetailsQueryResult>(query, {
      owner,
      repo,
      prNumber,
    })

    const prResultMessageStr = `
     ${result.repository?.pullRequest?.title || ''}
      ${result.repository?.pullRequest?.body || ''}
      ${result.repository?.pullRequest?.commits.nodes.map(commit => commit.commit.message).join('\n') || ''}
      ${result.repository?.pullRequest?.reviews.nodes.map(review => review.body).join('\n') || ''}
      ${result.repository?.pullRequest?.reviews.nodes.flatMap(review => review.comments.nodes.map(comment => comment.body)).join('\n') || ''}
      ${result.repository?.pullRequest?.comments.nodes.map(comment => comment.body).join('\n') || ''}
    `

    const issues = extractIssueNumber(prResultMessageStr, owner, repo)

    if (issues.length === 0) {
      coreWarning(
        `未找到关联的 issue!
        \n 这是 issue 匹配内容: ${prResultMessageStr}`,
      )
      return
    }
    coreInfo(`PR #${prNumber} linked issues: ${issues.join(', ')}`)

    const project = await getOrgProjectV2(octokit, owner, projectId)

    if (!project) {
      coreError('未提供 Project 对象')
      return null
    }

    const projectNodeId = await queryProjectNodeId(project)

    if (!projectNodeId) {
      coreError('未查询到 project ID')
      return null
    }

    issues.forEach(async (issueNumber) => {
      coreInfo(`Processing issue #${issueNumber} `)

      const projectItem = await queryIssueInProjectV2Items(
        octokit,
        owner,
        repo,
        projectNodeId,
        issueNumber,
      )

      coreInfo(`Project item: ${JSON.stringify(projectItem, null, 2)}`)

      if (projectItem.isInProject) {
        coreInfo(
          `Issue #${issueNumber} already in project node id: ${projectNodeId}, item id: ${projectItem?.item?.node_id}`,
        )

        if (!projectItem?.item?.node_id) {
          coreError('未找到 project item id')
          return
        }

        const repoField = await queryProjectField(
          project,
          repoFields[repo as RepoKey].field,
        )
        const fieldId = repoField?.id
        if (!fieldId) {
          coreError('未找到 fieldId')
          return
        }

        const needToDoOptionId = await queryFieldsSingleSelectOptionId(
          repoField.options,
          issueFieldType.needToDo,
        )

        const inProgressOptionId = await queryFieldsSingleSelectOptionId(
          repoField.options,
          issueFieldType.inProgress,
        )

        const finishedOptionId = await queryFieldsSingleSelectOptionId(
          repoField.options,
          issueFieldType.finished,
        )

        if (!needToDoOptionId || !inProgressOptionId || !finishedOptionId) {
          coreError('未找到所需的选项ID')
          return
        }

        let singleSelectOptionId = { singleSelectOptionId: '' }
        // 判断具体状态
        if (eventAction === 'opened') {
          coreInfo('PR被打开')
          singleSelectOptionId = { singleSelectOptionId: inProgressOptionId }
        }
        else if (eventAction === 'closed' && isMerged) {
          coreInfo('PR被合并')
          singleSelectOptionId = { singleSelectOptionId: finishedOptionId }
        }
        else if (eventAction === 'closed' && !isMerged) {
          coreInfo('PR被关闭但未合并')
          singleSelectOptionId = { singleSelectOptionId: needToDoOptionId }
        }
        else if (eventAction === 'reopened') {
          singleSelectOptionId = { singleSelectOptionId: inProgressOptionId }
          coreInfo('PR被重新打开')
        }
        else {
          coreInfo(`未匹配到事件: ${eventAction}`)
        }

        updateSingleSelectOptionField(
          octokit,
          projectNodeId,
          projectItem?.item?.node_id,
          fieldId,
          singleSelectOptionId,
        )
      }
    })
  }
  catch (error) {
    console.error('Failed to get linked issues:', error)
  }
}
