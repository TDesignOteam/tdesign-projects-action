import { AddProjectV2ItemResult, Octokit } from '../types/index';
import { context } from '@actions/github';
import { coreError, coreInfo } from '../utils/coreAlias';
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

export const labelTrigger = async (octokit: Octokit, projectId: number) => {
  const { owner, repo, number: issue_number } = context.issue;

  // 1. 获取事件信息
  const eventAction = context.payload.action;
  const eventLabel = context.payload.label;
  coreInfo(`事件类型: ${eventAction}`);
  if (eventLabel) {
    coreInfo(`涉及的标签: ${eventLabel.name}`);
  }

  // 2. 获取当前 issue 的所有标签
  const labelList = await octokit.rest.issues.listLabelsOnIssue({
    owner,
    repo,
    issue_number
  });

  coreInfo('查询 issue 的标签....');
  labelList.data.forEach((i) => {
    coreInfo(`标签: ${i.name}`);
  });

  // 3. 分析标签状态
  const isUnconfirmedRemoved =
    eventAction === 'unlabeled' && eventLabel?.name === '🧐 unconfirmed';

  const currentLabels = labelList.data.map((label) => label.name);
  const isNeedTodo = currentLabels.some((name) =>
    Object.keys(issueFieldOptions).includes(name)
  );
  const isToBePublished = currentLabels.includes('to be published');
  const isUnconfirmed = currentLabels.includes('🧐 unconfirmed');

  // 4. 检查是否需要处理
  const shouldProcess =
    isNeedTodo || isToBePublished || isUnconfirmed || isUnconfirmedRemoved;

  if (!shouldProcess) {
    coreError(
      `${currentLabels.join(', ')} 不包含待办、发布或未确认标签，且不是移除未确认标签的操作`
    );
    return;
  }

  coreInfo(`开始查询项目...`);

  // 5. 获取项目信息
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

  // 6. 获取 issue 详情
  const { data: issueDetail } = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number: issue_number
  });
  const issueNodeId = issueDetail.node_id;
  coreInfo(`issueNodeId: ${issueNodeId}`);

  // 7. 检查 issue 是否在项目中
  const projectItem = await queryIssueInProjectV2Items(
    octokit,
    owner,
    repo,
    projectNodeId,
    issue_number
  );

  let projectItemId = projectItem.item?.node_id;

  // 8. 准备项目字段信息
  const frameField = await queryProjectField(
    project,
    repoFields[repo as RepoKey].field
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

  // 9. 根据标签状态决定操作和字段值
  let frameSingleSelectOptionId: string | null = null;

  if (isUnconfirmedRemoved && !projectItem.isInProject && isNeedTodo) {
    // 场景1: 移除 unconfirmed 标签，且 issue 不在项目中 -> 添加到项目，设为待办
    coreInfo(
      `检测到移除 🧐 unconfirmed 标签，将 issue ${issue_number} 添加到项目并设置为待办`
    );

    const addResult: AddProjectV2ItemResult = await octokit.graphql(
      `
      mutation AddToProject($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
          item { id }
        }
      }
    `,
      {
        projectId: projectNodeId,
        contentId: issueNodeId
      }
    );

    projectItemId = addResult.addProjectV2ItemById.item.id;
    frameSingleSelectOptionId = needToDoOptionId;
    coreInfo(`已添加到项目，projectItemId: ${projectItemId}`);
  } else if (projectItemId) {
    // issue 已在项目中，根据标签更新状态
    if (isToBePublished) {
      // 场景2: 有发布标签 -> 设为完成
      frameSingleSelectOptionId = finishedOptionId;
      coreInfo('设置状态为已完成（发布标签）');
    } else if (isNeedTodo) {
      // 场景3: 有待办相关标签 -> 设为待办
      frameSingleSelectOptionId = needToDoOptionId;
      coreInfo('设置状态为待办');
    } else {
      coreInfo('issue 在项目中但无需更新状态');
    }
  } else {
    // issue 不在项目中且不是移除 unconfirmed 的操作
    coreError('issue 不在项目中，且不符合添加条件');
    return;
  }

  // 只有需要更新状态时才继续
  if (!frameSingleSelectOptionId) {
    coreInfo('无需更新项目字段，操作完成');
    return;
  }

  // 确保 projectItemId 存在
  if (!projectItemId) {
    coreError('projectItemId 为空，无法更新项目字段');
    return;
  }

  // 10. 准备所有字段更新
  const updates = [];

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
      repoFields[repo as RepoKey].Device
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
  const issueTypeName = currentLabels.find((name) =>
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

  // 11. 执行所有字段更新
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
