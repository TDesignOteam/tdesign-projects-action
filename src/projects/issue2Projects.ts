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

export const issue2Projects = async (octokit: Octokit, projectId: number) => {
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

  const hasBugOrEnhancement = labelList.data.some((option) =>
    Object.keys(issueFieldOptions).includes(option.name)
  );
  const hasUnconfirmed = labelList.data.some(
    (label) => label.name === '🧐 unconfirmed'
  );

  if (!hasBugOrEnhancement) {
    coreError(
      `issue not have ${Object.keys(issueFieldOptions).join(',')} label`
    );
    return;
  }
  if (hasUnconfirmed) {
    coreError('issue have 🧐 unconfirmed label');
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

  const { data: issueDetail } = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number: Number(issue_number)
  });
  const issueNodeId = issueDetail.node_id;
  coreInfo(`issueNodeId: ${issueNodeId}`);

  // 添加到 project v2
  const addIssue2ProjectGraphql: AddProjectV2ItemResult = await octokit.graphql(
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

  const itemId = addIssue2ProjectGraphql.addProjectV2ItemById.item.id;
  coreInfo(`itemId: ${itemId}`);

  // 更新框架字段
  const repoField = await queryProjectField(
    project,
    repoFields[repo as RepoKey].field
  );
  const fieldId = repoField?.id;
  if (!fieldId) {
    coreError('未找到 fieldId');
    return;
  }
  const needToDoOptionId = await queryFieldsSingleSelectOptionId(
    repoField.options,
    issueFieldType.needToDo
  );

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
  const componentName = /\[(.*?)\]/.exec(issueTitle)?.[1];
  const componentField = await queryProjectField(project, '组件分类');
  const componentFieldId = componentField?.id;
  const componentOptionId = componentName
    ? await queryFieldsSingleSelectOptionId(deviceField.options, componentName)
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
      fieldId: fieldId,
      value: { singleSelectOptionId: needToDoOptionId }
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
        itemId,
        fieldId,
        value
      )
    )
  );
};
