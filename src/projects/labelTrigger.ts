/**
 * Label 触发器
 *
 * 用途: 根据 issue 标签变化自动管理 GitHub Project V2 中的条目和字段
 *
 * 功能说明:
 * 1. 监听 issue 标签的添加/移除事件
 * 2. 当移除 'unconfirmed' 标签时，自动将 issue 添加到项目并设置为待办状态
 * 3. 根据不同标签自动更新项目字段:
 *    - 'to be published': 更新为已完成状态
 *    - bug/enhancement/其他分类标签: 更新为待办状态
 * 4. 自动填充项目字段(框架、设备、组件分类、问题分类等)
 *
 * 触发条件:
 * - issue 标签发生变化(labeled/unlabeled)
 * - 包含特定标签: 'to be published', 'unconfirmed', bug/enhancement 等分类标签
 *
 * 项目字段管理:
 * - 框架字段: 根据仓库自动设置(Vue/React/微信小程序等)
 * - Device 字段: 根据仓库类型设置
 * - 组件分类: 从 issue 标题 [组件名] 中提取
 * - 问题分类: 根据标签映射到对应的分类选项
 */

import type { AddProjectV2ItemResult, Octokit, ProjectV2 } from '../types/index'
import type {
  RepoKey,
} from '../utils'
import { context } from '@actions/github'
import {
  issueFieldOptions,
  issueFieldType,
  LABELS,
  repoFields,
} from '../utils'
import { coreError, coreInfo, coreWarning } from '../utils/coreAlias'
import { getComponentName } from '../utils/getComponentName'
import { queryIssueInProjectV2Items } from '../utils/github/query/queryIssueInProjectV2Items'
import { getOrgProjectV2 } from '../utils/github/query/queryOrgProjectV2'
import { queryFieldsSingleSelectOptionId } from '../utils/github/shared/queryFieldsSingleSelectOptionId'
import { queryProjectField } from '../utils/github/shared/queryProjectField'
import { queryProjectNodeId } from '../utils/github/shared/queryProjectNodeId'
import { updateSingleSelectOptionField } from '../utils/github/updates/updateField'

function toLogSafe(text: string): string {
  return text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '[emoji]')
}

function formatLabelsForLog(labels: string[]): string {
  return labels.map(toLogSafe).join(', ')
}

const UNCONFIRMED_LABEL_LOG = toLogSafe(LABELS.UNCONFIRMED)
// 类型声明
interface LabelStatus {
  isShouldNeedTodo: boolean
  isToBePublished: boolean
  isUnconfirmed: boolean
  isBug: boolean
  isEnhancement: boolean
  isContinue: boolean
}

interface BuildFieldUpdatesParams {
  project: ProjectV2
  repoKey: RepoKey
  frameFieldId: string
  frameSingleSelectOptionId: string
  issueDetail: { title: string }
  currentLabels: string[]
}

interface UpdateField {
  fieldId: string
  value: { singleSelectOptionId: string }
}

type EventLabel
  = | {
    name?: string
    id?: number
  }
  | string

// 判断标签状态
function getLabelStatus(labels: string[]): LabelStatus {
  const isUnconfirmed = labels.includes(LABELS.UNCONFIRMED)

  const isShouldNeedTodo = labels.some(
    (name: string) => name in issueFieldOptions,
  )
  const isToBePublished = labels.includes(LABELS.TO_BE_PUBLISHED)
  const isBug = labels.includes(LABELS.BUG)
  const isEnhancement = labels.includes(LABELS.ENHANCEMENT)

  const isContinue = isToBePublished || isShouldNeedTodo

  return {
    isShouldNeedTodo,
    isToBePublished,
    isUnconfirmed,
    isBug,
    isEnhancement,
    isContinue,
  }
}

/**
 * 确定是否移除 unconfirmed 标签操作
 */
function getIsUnconfirmedRemoved(
  eventAction: string,
  eventLabel: EventLabel,
): boolean {
  if (eventAction !== 'unlabeled') {
    return false
  }

  const labelName = typeof eventLabel === 'string' ? eventLabel : eventLabel?.name

  return labelName === LABELS.UNCONFIRMED
}

/**
 * 构建字段更新列表
 */
async function buildFieldUpdates({
  project,
  repoKey,
  frameFieldId,
  frameSingleSelectOptionId,
  issueDetail,
  currentLabels,
}: BuildFieldUpdatesParams): Promise<UpdateField[]> {
  const updates: UpdateField[] = []
  // 框架状态字段
  updates.push({
    fieldId: frameFieldId,
    value: { singleSelectOptionId: frameSingleSelectOptionId },
  })

  // Device 字段
  const deviceField = await queryProjectField(project, 'Device')
  const deviceFieldId = deviceField?.id
  if (deviceFieldId) {
    const deviceOptionId = await queryFieldsSingleSelectOptionId(
      deviceField.options,
      repoFields[repoKey].Device,
    )
    if (deviceOptionId) {
      updates.push({
        fieldId: deviceFieldId,
        value: { singleSelectOptionId: deviceOptionId },
      })
    }
  }

  // 组件分类字段
  const issueTitle = issueDetail.title
  const componentName = getComponentName(issueTitle)
  if (componentName) {
    const componentField = await queryProjectField(project, '组件分类')
    const componentFieldId = componentField?.id
    if (componentFieldId) {
      const componentOptionId = await queryFieldsSingleSelectOptionId(
        componentField.options,
        componentName,
      )
      if (componentOptionId) {
        updates.push({
          fieldId: componentFieldId,
          value: { singleSelectOptionId: componentOptionId },
        })
      }
    }
  }

  // 问题分类字段
  const issueTypeName = currentLabels.find((name: string) => name in issueFieldOptions)
  if (issueTypeName) {
    const issueTypeField = await queryProjectField(project, '问题分类')
    const issueTypeFieldId = issueTypeField?.id
    if (issueTypeFieldId) {
      const mappedTypeName
        = issueFieldOptions[issueTypeName as keyof typeof issueFieldOptions]
      if (mappedTypeName) {
        const issueTypeOptionId = await queryFieldsSingleSelectOptionId(
          issueTypeField.options,
          mappedTypeName,
        )
        if (issueTypeOptionId) {
          updates.push({
            fieldId: issueTypeFieldId,
            value: { singleSelectOptionId: issueTypeOptionId },
          })
        }
      }
    }
  }
  return updates
}

/**
 * 确定操作类型
 */
function determineOperationType(params: {
  isInProject: boolean
  isUnconfirmedRemoved: boolean
  isShouldNeedTodo: boolean
  isToBePublished: boolean
}):
  | 'ADD_TO_PROJECT'
  | 'UPDATE_TO_FINISHED'
  | 'UPDATE_TO_TODO'
  | 'NO_UPDATE'
  | 'INVALID_OPERATION'
  | 'NOT_ADD_TO_PROJECT' {
  const {
    isInProject,
    isUnconfirmedRemoved,
    isShouldNeedTodo,
    isToBePublished,
  } = params

  if (!isInProject && !isUnconfirmedRemoved) {
    return 'INVALID_OPERATION'
  }

  if (isUnconfirmedRemoved && !isInProject) {
    if (isShouldNeedTodo) {
      return 'ADD_TO_PROJECT'
    }
    return 'NOT_ADD_TO_PROJECT'
  }

  if (isToBePublished) {
    return 'UPDATE_TO_FINISHED'
  }

  if (isShouldNeedTodo) {
    return 'UPDATE_TO_TODO'
  }

  return 'NO_UPDATE'
}

/**
 * 将issue添加到项目
 */
async function addIssueToProject(
  octokit: Octokit,
  projectNodeId: string,
  issueNodeId: string,
  issueNumber: number,
): Promise<string> {
  coreInfo(
    `检测到移除 ${UNCONFIRMED_LABEL_LOG} 标签，将 issue ${issueNumber} 添加到项目并设置为待办`,
  )

  const addResult: AddProjectV2ItemResult = await octokit.graphql(
    `mutation AddToProject($projectId: ID!, $contentId: ID!) { 
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { 
        item { id } 
      } 
    }`,
    { projectId: projectNodeId, contentId: issueNodeId },
  )

  const projectItemId = addResult.addProjectV2ItemById.item.id
  coreInfo(`已添加到项目, projectItemId: ${projectItemId}`)

  return projectItemId
}

/**
 * 更新项目字段
 */
async function updateProjectFields(params: {
  octokit: Octokit
  projectNodeId: string
  projectItemId: string
  project: ProjectV2
  repoKey: RepoKey
  frameFieldId: string
  frameSingleSelectOptionId: string
  issueDetail: { title: string }
  currentLabels: string[]
}) {
  const updates = await buildFieldUpdates({
    project: params.project,
    repoKey: params.repoKey,
    frameFieldId: params.frameFieldId,
    frameSingleSelectOptionId: params.frameSingleSelectOptionId,
    issueDetail: params.issueDetail,
    currentLabels: params.currentLabels,
  })

  coreInfo(`准备更新 ${updates.length} 个字段: ${JSON.stringify(updates)}`)

  await Promise.all(
    updates.map(({ fieldId, value }) =>
      updateSingleSelectOptionField(
        params.octokit,
        params.projectNodeId,
        params.projectItemId,
        fieldId,
        value,
      ),
    ),
  )

  coreInfo('所有字段更新完成')
}

// 主流程
export async function labelTrigger(octokit: Octokit, projectId: number) {
  const { owner, repo, number: issue_number } = context.issue
  const eventAction: string = context.payload.action
    ? context.payload.action
    : ''
  const eventLabel: EventLabel = context.payload.label

  coreInfo(`事件类型: ${eventAction}`)
  if (eventLabel) {
    coreInfo(
      `涉及的标签: ${toLogSafe(
        typeof eventLabel === 'string'
          ? eventLabel
          : eventLabel?.name || '',
      )}`,
    )
  }

  /**
   * 判断是否移除 unconfirmed 标签的操作
   */
  const isUnconfirmedRemoved = getIsUnconfirmedRemoved(eventAction, eventLabel)

  // 获取当前 issue 的所有标签
  const labelList = await octokit.rest.issues.listLabelsOnIssue({
    owner,
    repo,
    issue_number,
  })
  coreInfo('查询 issue 的标签....')

  // 标签状态判断

  const currentLabels = labelList.data.map((label: { name: string }) => {
    coreInfo(`标签: ${toLogSafe(label.name)}`)
    return label.name
  })
  const { isContinue, isUnconfirmed, isToBePublished, isShouldNeedTodo } = getLabelStatus(currentLabels)

  // 判断是否需要继续处理
  const shouldContinue = isContinue || isUnconfirmedRemoved

  if (!shouldContinue && isUnconfirmed) {
    coreError(`${formatLabelsForLog(currentLabels)} 不符合处理条件，跳过处理`)
    return
  }

  coreInfo(`开始查询项目...`)
  const project = await getOrgProjectV2(octokit, owner, projectId)
  if (!project) {
    coreError('未提供 Project 对象')
    return
  }
  const projectNodeId = await queryProjectNodeId(project)
  if (!projectNodeId) {
    coreError('未提供 Project Node ID')
    return
  }

  // 获取 issue 详情
  const { data: issueDetail } = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number,
  })
  const issueNodeId = issueDetail.node_id
  coreInfo(`issueNodeId: ${issueNodeId}`)

  // 检查 issue 是否在项目中
  const projectItem = await queryIssueInProjectV2Items(
    octokit,
    owner,
    repo,
    projectNodeId,
    issue_number,
  )
  let projectItemId = projectItem.item?.node_id

  // 获取主状态字段配置
  const repoKey = repo as RepoKey
  const frameField = await queryProjectField(
    project,
    repoFields[repoKey].field,
  )
  const frameFieldId = frameField?.id
  if (!frameFieldId) {
    coreError('未找到 frameFieldId')
    return
  }

  // 获取状态选项ID
  const [needToDoOptionId, finishedOptionId] = await Promise.all([
    queryFieldsSingleSelectOptionId(
      frameField.options,
      issueFieldType.needToDo,
    ),
    queryFieldsSingleSelectOptionId(frameField.options, issueFieldType.finished),
  ])

  // 确定操作类型和对应的状态
  const operationType = determineOperationType({
    isInProject: projectItem.isInProject,
    isUnconfirmedRemoved,
    isShouldNeedTodo,
    isToBePublished,
  })

  // 执行相应操作
  let frameSingleSelectOptionId: string | null = null
  switch (operationType) {
    case 'ADD_TO_PROJECT':
      try {
        projectItemId = await addIssueToProject(
          octokit,
          projectNodeId,
          issueNodeId,
          issue_number,
        )
        if (!projectItemId) {
          coreError(
            `addIssueToProject 返回空值，参数: projectNodeId=${projectNodeId}, issueNodeId=${issueNodeId}, issue_number=${issue_number}`,
          )
          return
        }
      }
      catch (err) {
        coreError(
          `添加 issue ${issue_number} 到项目失败: ${(err as Error).message}`,
        )
        return
      }
      frameSingleSelectOptionId = needToDoOptionId
      break

    case 'UPDATE_TO_FINISHED':
      frameSingleSelectOptionId = finishedOptionId
      break

    case 'UPDATE_TO_TODO':
      frameSingleSelectOptionId = needToDoOptionId
      break

    case 'NOT_ADD_TO_PROJECT':
      coreWarning(
        `issue ${issue_number} 不在项目中，且移除 ${UNCONFIRMED_LABEL_LOG} 标签,但是却不是需要添加到项目的标签 ${formatLabelsForLog(currentLabels)}`,
      )
      return

    case 'NO_UPDATE':
      coreWarning('issue 在项目中但无需更新状态')
      return

    case 'INVALID_OPERATION':
      coreWarning(
        `issue ${issue_number} 不在项目中，且不是移除 ${UNCONFIRMED_LABEL_LOG} 的操作`,
      )
      return
  }

  if (!frameSingleSelectOptionId) {
    coreInfo('无需更新项目字段，操作完成')
    return
  }
  if (!projectItemId) {
    coreError(
      `projectItemId 为空，无法更新项目字段。操作类型: ${operationType}, issue_number: ${issue_number}, 项目查询结果: ${JSON.stringify(projectItem)}`,
    )
    return
  }

  // 组装并应用所有字段更新
  try {
    await updateProjectFields({
      octokit,
      projectNodeId,
      projectItemId,
      project,
      repoKey,
      frameFieldId,
      frameSingleSelectOptionId,
      issueDetail,
      currentLabels,
    })
  }
  catch (err) {
    coreError(
      `更新项目字段失败: ${(err as Error).message}, projectItemId: ${projectItemId}`,
    )
    throw err
  }
}
