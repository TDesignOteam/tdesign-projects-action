import { AddProjectV2ItemResult, Octokit } from '../types/index';
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

export const labelTrigger = async (octokit: Octokit, projectId: number) => {
  const { owner, repo, number: issue_number } = context.issue;
  const labelList = await octokit.rest.issues.listLabelsOnIssue({
    owner,
    repo,
    issue_number
  });

  coreInfo('查询 issue 的标签....');

  labelList.data.forEach((i) => {
    coreInfo(`标签: ${i.name}`);
  });

  const isNeedTodo = labelList.data.some((option) =>
    Object.keys(issueFieldOptions).includes(option.name)
  );

  const isToBePublished = labelList.data.some(
    (label) => label.name === 'to be published'
  );

  const isUnconfirmed = labelList.data.some(
    (label) => label.name === '🧐 unconfirmed'
  );

  if (!isNeedTodo && !isToBePublished && !isUnconfirmed) {
    coreError(
      `${labelList.data.map((i) => i.name).join(', ')} 不包含待办、发布或未确认标签`
    );
    return;
  }

  coreInfo(`开始查询项目...`);

  const project = await getOrgProjectV2(octokit, owner, projectId);
  if (!project) {
    coreError('未提供 Project 对象');
    return null;
  }

  coreInfo(`开始查询项目节点 ID...`);
  const projectNodeId = await queryProjectNodeId(project);

  if (!projectNodeId) {
    coreError('未提供 Project Node ID');
    return null;
  }

  const { data: issueDetail } = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number: issue_number
  });
  const issueNodeId = issueDetail.node_id;
  coreInfo(`issueNodeId: ${issueNodeId}`);

  // 检查 issue 是否已在 project v2 中

  const projectItem = await queryIssueInProjectV2Items(
    octokit,
    owner,
    repo,
    projectNodeId,
    issue_number
  );

  let projectItemId = projectItem.item?.node_id;

  if (!projectItem.isInProject || !projectItemId) {
    // 添加到 project v2
    const addIssue2ProjectGraphql: AddProjectV2ItemResult =
      await octokit.graphql(
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

    projectItemId = addIssue2ProjectGraphql.addProjectV2ItemById.item.id;
    coreInfo(`projectItemId: ${projectItemId}`);
  }

  if (!projectItemId) {
    coreError(`projectItemId: ${projectItemId}`);
    return;
  }

  // 更新框架字段
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

  let frameSingleSelectOptionId = null;
  if (isUnconfirmed) {
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
  } else if (isToBePublished) {
    frameSingleSelectOptionId = finishedOptionId;
  } else if (isNeedTodo) {
    frameSingleSelectOptionId = needToDoOptionId;
  } else {
    coreError('未找到所需的选项ID');
    return;
  }

  // 更新 Device 字段
  const deviceField = await queryProjectField(project, 'Device');
  const deviceFieldId = deviceField?.id;
  if (!deviceFieldId) {
    coreError('未找到 deviceFieldId');
    return;
  }
  const deviceOptionId = await queryFieldsSingleSelectOptionId(
    deviceField.options,
    repoFields[repo as RepoKey].Device
  );

  // 查询组件分类字段
  const issueTitle = issueDetail.title;
  const componentName = /\[(.*?)\]/.exec(issueTitle)?.[1] || '';
  const componentField = await queryProjectField(project, '组件分类');
  const componentFieldId = componentField?.id;
  const componentOptionId =
    componentFieldId && componentName
      ? await queryFieldsSingleSelectOptionId(
          componentField.options,
          componentName
        )
      : null;

  //  查询问题分类字段
  const issueTypeName = labelList.data.find((item) =>
    Object.keys(issueFieldOptions).includes(item.name)
  )?.name;
  const issueTypeField = await queryProjectField(project, '问题分类');
  const issueTypeFieldId = issueTypeField?.id;
  const issueTypeOptionId = issueTypeFieldId
    ? await queryFieldsSingleSelectOptionId(
        issueTypeField.options,
        issueFieldOptions[issueTypeName as keyof typeof issueFieldOptions] || ''
      )
    : null;

  // 更新多个字段
  const updates = [
    {
      fieldId: frameFieldId,
      value: {
        singleSelectOptionId: frameSingleSelectOptionId
      }
    },
    {
      fieldId: deviceFieldId,
      value: { singleSelectOptionId: deviceOptionId }
    }
  ];

  // 更新组件分类字段(可选)
  if (componentFieldId && componentOptionId) {
    const componentUpdates = {
      fieldId: componentFieldId,
      value: { singleSelectOptionId: componentOptionId }
    };
    updates.push(componentUpdates);
  }

  // 更新问题分类字段(可选)
  if (issueTypeFieldId && issueTypeOptionId) {
    const issueTypeUpdates = {
      fieldId: issueTypeFieldId,
      value: { singleSelectOptionId: issueTypeOptionId }
    };
    updates.push(issueTypeUpdates);
  }

  coreInfo(`updates: ${JSON.stringify(updates)}`);

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
};
