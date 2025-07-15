import { getInput } from '@actions/core';
import { coreInfo, coreSetFailed } from './utils/coreAlias';
import { getOctokit } from '@actions/github';
import { issue2Projects } from './projects/issue2Projects';
import { pr2Issue } from './projects/pr2Issue';

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

    const PROJECT_ID = process.env?.PROJECT_ID || getInput('PROJECT_ID') || 1;

    coreInfo(`PROJECT_TYPE: ${PROJECT_TYPE}`);

    if (PROJECT_TYPE === 'ISSUE2PROJECTS') {
      await issue2Projects(octokit, Number(PROJECT_ID));
      return;
    }
    if (PROJECT_TYPE === 'PR2ISSUE') {
      await pr2Issue(octokit, Number(PROJECT_ID));
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
