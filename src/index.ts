import { getInput } from '@actions/core';
import { coreInfo, coreSetFailed } from './utils/coreAlias.js';
import { getOctokit } from '@actions/github';
import { issue2Projects } from './projects/issue2Projects.js';
import { pr2Issue } from './projects/pr2Issue.js';

type ProjectType = 'ISSUE2PROJECTS' | 'PR2ISSUE';

async function run(): Promise<void> {
  try {
    const token =
      process.env?.GH_TOKEN ||
      getInput('GH_TOKEN') ||
      process.env?.GITHUB_TOKEN;
    if (!token) {
      coreSetFailed('GH_TOKEN is not set');
      return;
    }

    const octokit = getOctokit(token);

    const PROJECT_TYPE = (process.env?.PROJECT_TYPE ||
      getInput('PROJECT_TYPE')) as ProjectType;

    coreInfo(`PROJECT_TYPE: ${PROJECT_TYPE}`);

    if (PROJECT_TYPE === 'ISSUE2PROJECTS') {
      await issue2Projects(octokit);
      return;
    }
    if (PROJECT_TYPE === 'PR2ISSUE') {
      await pr2Issue(octokit);
      return;
    }

    coreSetFailed(
      "PROJECT_TYPE is not valid, not 'ISSUE2PROJECTS' or 'PR2ISSUE'"
    );
  } catch (error: unknown) {
    if (error instanceof Error) {
      coreSetFailed(error.message);
    } else {
      coreSetFailed(String(error));
    }
  }
}

run();
