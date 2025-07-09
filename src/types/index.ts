import { GitHub } from '@actions/github/lib/utils.js';

export type Octokit = InstanceType<typeof GitHub>;

/**
 * 组织项目 V2 ProjectV2 的结构
 */
export interface ProjectV2 {
  id: string;
  fields: {
    nodes: Array<{
      id: string;
      name: string;
      options: Array<{
        id: string;
        name: string;
      }>;
    }>;
  };
}

/**
 * 添加项目 V2 项的结果
 */
export interface AddProjectV2ItemResult {
  addProjectV2ItemById: {
    item: {
      id: string;
    };
  };
}
