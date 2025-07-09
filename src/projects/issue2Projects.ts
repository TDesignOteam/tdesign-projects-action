import { AddProjectV2ItemResult, Octokit } from '../types/index';
import { context } from '@actions/github';
import { coreError, coreInfo } from '../utils/coreAlias';
import { getOrgProjectV2 } from '../utils/github/queryOrgProjectV2';
import { queryProjectNodeId } from '../utils/github/queryProjectNodeId';
import { queryProjectField } from '../utils/github/queryProjectField';
import { issueFieldType, repoFields } from '../utils';
import { queryFieldsSingleSelectOptionId } from '../utils/github/queryFieldsSingleSelectOptionId';

type RepoKey = keyof typeof repoFields;

export const issue2Projects = async (octokit: Octokit) => {
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

  const hasBugOrEnhancement = labelList.data.some(
    (label) => label.name === '🐞 bug' || label.name === '💪🏻 enhancement'
  );
  const hasUnconfirmed = labelList.data.some(
    (label) => label.name === '🧐 unconfirmed'
  );

  if (!hasBugOrEnhancement) {
    coreError('issue not have 🐞 bug or 💪🏻 enhancement label');
    return;
  }
  if (hasUnconfirmed) {
    coreError('issue have 🧐 unconfirmed label');
    return;
  }

  coreInfo(`开始查询项目...`);
  const project = await getOrgProjectV2(octokit, owner, 1);

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

  const repoField = await queryProjectField(
    project,
    repoFields[repo as RepoKey].field
  );

  const fieldId = repoField?.id;
  if (!fieldId) {
    coreError('未找到 fieldId');
    return;
  }
  const NeedToDoOptionId = queryFieldsSingleSelectOptionId(
    repoField.options,
    issueFieldType.needToDo
  );

  const deviceField = await queryProjectField(project, 'Device');
  const deviceFieldId = deviceField?.id;
  if (!deviceFieldId) {
    coreError('未找到 deviceFieldId');
    return;
  }
  const DeviceOptionId = queryFieldsSingleSelectOptionId(
    deviceField.options,
    repoFields[repo as RepoKey].Device
  );

  // 更新多个字段
  const updates = [
    {
      fieldId: fieldId,
      value: { singleSelectOptionId: NeedToDoOptionId }
    },
    {
      fieldId: deviceFieldId,
      value: { singleSelectOptionId: DeviceOptionId }
    }
  ];

  await Promise.all(
    updates.map(({ fieldId, value }) =>
      octokit.graphql(
        `
          mutation UpdateField(
            $projectId: ID!,
            $itemId: ID!,
            $fieldId: ID!,
            $value: ProjectV2FieldValue!
          ) {
            updateProjectV2ItemFieldValue(
              input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: $value }
            ) {
              projectV2Item { id }
            }
          }
        `,
        {
          projectId: projectNodeId,
          itemId,
          fieldId,
          value
        }
      )
    )
  );
};
