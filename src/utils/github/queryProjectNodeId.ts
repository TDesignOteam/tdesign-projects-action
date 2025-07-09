import { coreSetFailed } from '../coreAlias';
import { coreInfo } from '../coreAlias';
import { ProjectV2 } from '../../types';

/**
 * 查询项目 Project node_id
 * @param project 项目
 * @returns node_id
 */
export async function queryProjectNodeId(
  project: ProjectV2 | undefined
): Promise<string | null> {
  if (!project) {
    coreSetFailed('未提供 Project 对象');
    return null;
  }

  if (!project.id) {
    coreSetFailed('Project 对象未包含 id');
    return null;
  }

  coreInfo(`Project 的 node_id 是: ${project.id}`);
  return project.id;
}
