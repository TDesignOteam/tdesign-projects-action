import { ProjectV2, Octokit } from '../../../types/index';
import { info as coreInfo, error as coreError } from '@actions/core';

/**
 * 获取组织项目 V2 的结果
 */
export interface GetOrgProjectV2Result {
  organization: {
    projectV2: ProjectV2 | null;
  } | null;
}

export async function getOrgProjectV2(
  octokit: Octokit,
  org: string,
  projectNumber: number
) {
  const query = `
    query ($org: String!, $projectNumber: Int!) {
      organization(login: $org) {
        projectV2(number: $projectNumber) {
          id                          # 返回项目 Node ID
          fields(first: 50) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `;
  const result = await octokit.graphql<GetOrgProjectV2Result>(query, {
    org,
    projectNumber
  });
  const project = result?.organization?.projectV2;
  if (!project) {
    coreError('未找到对应的 Project');
    return;
  }
  coreInfo(`获取 Project Node ID: ${project.id}`);
  return project;
}
