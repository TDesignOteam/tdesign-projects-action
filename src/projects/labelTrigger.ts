import { AddProjectV2ItemResult, Octokit, ProjectV2 } from '../types/index';
import { context } from '@actions/github';
import { coreError, coreInfo, coreWarning } from '../utils/coreAlias';
import { getOrgProjectV2 } from '../utils/github/query/queryOrgProjectV2';
import { queryProjectNodeId } from '../utils/github/shared/queryProjectNodeId';
import { queryProjectField } from '../utils/github/shared/queryProjectField';
import {
  issueFieldOptions,
  issueFieldType,
  repoFields,
  RepoKey
} from '../utils';
import { queryFieldsSingleSelectOptionId } from '../utils/github/shared/queryFieldsSingleSelectOptionId';
import { updateSingleSelectOptionField } from '../utils/github/updates/updateField';
import { queryIssueInProjectV2Items } from '../utils/github/query/queryIssueInProjectV2Items';

// 类型声明
interface LabelStatus {
  isUnconfirmedRemoved: boolean;
  isShouldNeedTodo: boolean;
  isToBePublished: boolean;
  isUnconfirmed: boolean;
}

interface BuildFieldUpdatesParams {
  project: ProjectV2;
  repoKey: RepoKey;
  frameFieldId: string;
  frameSingleSelectOptionId: string;
  issueDetail: { title: string };
  currentLabels: string[];
}

interface UpdateField {
  fieldId: string;
  value: { singleSelectOptionId: string };
}

// 判断标签状态
function getLabelStatus(
  labels: string[],
  eventAction: string,
  eventLabel: unknown
): LabelStatus {
  const labelName =
    typeof eventLabel === 'object' && eventLabel && 'name' in eventLabel
      ? (eventLabel as { name?: string }).name
      : undefined;
  const isUnconfirmedRemoved =
    eventAction === 'unlabeled' && labelName === '🧐 unconfirmed';
  const isShouldNeedTodo = labels.some(
    (name: string) => name in issueFieldOptions
  );
  const isToBePublished = labels.includes('to be published');
  const isUnconfirmed = labels.includes('🧐 unconfirmed');
  return {
    isUnconfirmedRemoved,
    isShouldNeedTodo,
    isToBePublished,
    isUnconfirmed
  };
}

// 组装字段更新
async function buildFieldUpdates({
  project,
  repoKey,
  frameFieldId,
  frameSingleSelectOptionId,
  issueDetail,
  currentLabels
}: BuildFieldUpdatesParams): Promise<UpdateField[]> {
  const updates: UpdateField[] = [];
  // 框架状态字段
  updates.push({
    fieldId: frameFieldId,
    value: { singleSelectOptionId: frameSingleSelectOptionId }
  });

  // Device 字段
  const deviceField = await queryProjectField(project, 'Device');
  const deviceFieldId = deviceField?.id;
  if (deviceFieldId) {
    const deviceOptionId = await queryFieldsSingleSelectOptionId(
      deviceField.options,
      repoFields[repoKey].Device
    );
    if (deviceOptionId) {
      updates.push({
        fieldId: deviceFieldId,
        value: { singleSelectOptionId: deviceOptionId }
      });
    }
  }

  // 组件分类字段
  const issueTitle = issueDetail.title;
  const componentName = /\[(.*?)\]/.exec(issueTitle)?.[1] || '';
  if (componentName) {
    const componentField = await queryProjectField(project, '组件分类');
    const componentFieldId = componentField?.id;
    if (componentFieldId) {
      const componentOptionId = await queryFieldsSingleSelectOptionId(
        componentField.options,
        componentName
      );
      if (componentOptionId) {
        updates.push({
          fieldId: componentFieldId,
          value: { singleSelectOptionId: componentOptionId }
        });
      }
    }
  }

  // 问题分类字段
  const issueTypeName = currentLabels.find((name: string) =>
    Object.keys(issueFieldOptions).includes(name)
  );
  if (issueTypeName) {
    const issueTypeField = await queryProjectField(project, '问题分类');
    const issueTypeFieldId = issueTypeField?.id;
    if (issueTypeFieldId) {
      const mappedTypeName =
        issueFieldOptions[issueTypeName as keyof typeof issueFieldOptions];
      if (mappedTypeName) {
        const issueTypeOptionId = await queryFieldsSingleSelectOptionId(
          issueTypeField.options,
          mappedTypeName
        );
        if (issueTypeOptionId) {
          updates.push({
            fieldId: issueTypeFieldId,
            value: { singleSelectOptionId: issueTypeOptionId }
          });
        }
      }
    }
  }
  return updates;
}

// 主流程
export const labelTrigger = async (octokit: Octokit, projectId: number) => {
  const { owner, repo, number } = context.issue;
  const issue_number =
    typeof number === 'number' ? number : parseInt(String(number), 10);
  const eventAction: string =
    typeof context.payload.action === 'string' ? context.payload.action : '';
  const eventLabel = context.payload.label;
  coreInfo(`事件类型: ${eventAction}`);
  if (eventLabel) coreInfo(`涉及的标签: ${eventLabel.name}`);

  // 获取当前 issue 的所有标签
  const labelList = await octokit.rest.issues.listLabelsOnIssue({
    owner,
    repo,
    issue_number
  });
  coreInfo('查询 issue 的标签....');
  const currentLabels = labelList.data.map((label: { name: string }) => {
    coreInfo(`标签: ${label.name}`);
    return label.name;
  });

  // 标签状态判断
  const {
    isUnconfirmedRemoved,
    isShouldNeedTodo,
    isToBePublished,
    isUnconfirmed
  } = getLabelStatus(currentLabels, eventAction, eventLabel);
  const shouldNext =
    isShouldNeedTodo ||
    isToBePublished ||
    isUnconfirmed ||
    isUnconfirmedRemoved;
  if (!shouldNext) {
    coreError(`${currentLabels.join(', ')} 不符合处理条件，跳过处理`);
    return;
  }

  coreInfo(`开始查询项目...`);
  const project = await getOrgProjectV2(octokit, owner, projectId);
  if (!project) {
    coreError('未提供 Project 对象');
    return;
  }
  const projectNodeId = await queryProjectNodeId(project);
  if (!projectNodeId) {
    coreError('未提供 Project Node ID');
    return;
  }

  // 获取 issue 详情
  const { data: issueDetail } = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number
  });
  const issueNodeId = issueDetail.node_id;
  coreInfo(`issueNodeId: ${issueNodeId}`);

  // 检查 issue 是否在项目中
  const projectItem = await queryIssueInProjectV2Items(
    octokit,
    owner,
    repo,
    projectNodeId,
    issue_number
  );
  let projectItemId = projectItem.item?.node_id;
  if (!projectItem.isInProject && !isUnconfirmedRemoved) {
    coreWarning(
      `issue ${issue_number} 不在项目中，且不是移除 unconfirmed 的操作，无法处理`
    );
    return;
  }

  // 获取主状态字段
  const repoKey = repo as RepoKey;
  const frameField = await queryProjectField(
    project,
    repoFields[repoKey].field
  );
  const frameFieldId = frameField?.id;
  if (!frameFieldId) {
    coreError('未找到 frameFieldId');
    return;
  }
  const needToDoOptionId = await queryFieldsSingleSelectOptionId(
    frameField.options,
    issueFieldType.needToDo
  );
  const finishedOptionId = await queryFieldsSingleSelectOptionId(
    frameField.options,
    issueFieldType.finished
  );

  // 决定主状态字段值
  let frameSingleSelectOptionId: string | null = null;
  if (isUnconfirmedRemoved && !projectItem.isInProject && isShouldNeedTodo) {
    // 场景1: 移除 unconfirmed 且不在项目中，添加到项目
    coreInfo(
      `检测到移除 🧐 unconfirmed 标签，将 issue ${issue_number} 添加到项目并设置为待办`
    );
    const addResult: AddProjectV2ItemResult = await octokit.graphql(
      `mutation AddToProject($projectId: ID!, $contentId: ID!) { addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } } }`,
      { projectId: projectNodeId, contentId: issueNodeId }
    );
    projectItemId = addResult.addProjectV2ItemById.item.id;
    frameSingleSelectOptionId = needToDoOptionId;
    coreInfo(`已添加到项目，projectItemId: ${projectItemId}`);
  } else if (projectItemId) {
    if (isToBePublished) {
      frameSingleSelectOptionId = finishedOptionId;
      coreInfo('设置状态为已完成（发布标签）');
    } else if (isShouldNeedTodo) {
      frameSingleSelectOptionId = needToDoOptionId;
      coreInfo('设置状态为待办');
    } else {
      coreInfo('issue 在项目中但无需更新状态');
    }
  } else {
    return coreError('issue 不在项目中，且不符合添加条件');
  }

  if (!frameSingleSelectOptionId) {
    coreInfo('无需更新项目字段，操作完成');
    return;
  }
  if (!projectItemId) return coreError('projectItemId 为空，无法更新项目字段');

  // 组装所有字段更新
  const updates = await buildFieldUpdates({
    project,
    repoKey,
    frameFieldId,
    frameSingleSelectOptionId,
    issueDetail,
    currentLabels
  });
  coreInfo(`准备更新 ${updates.length} 个字段: ${JSON.stringify(updates)}`);
  await Promise.all(
    updates.map(({ fieldId, value }) =>
      updateSingleSelectOptionField(
        octokit,
        projectNodeId,
        projectItemId,
        fieldId,
        value
      )
    )
  );
  coreInfo('所有字段更新完成');
};
