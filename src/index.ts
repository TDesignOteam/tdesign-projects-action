import { getInput } from '@actions/core';
import { coreInfo, coreSetFailed } from './utils/coreAlias';
import { getOctokit } from '@actions/github';
import { labelTrigger } from './projects/labelTrigger';
import { prTrigger } from './projects/prTrigger';
import { issueTrigger } from './projects/issueTrigger';

type ProjectType = 'ISSUE2TRIGGER' | 'PR2TRIGGER' | 'LABEL2TRIGGER';

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

    if (PROJECT_TYPE === 'LABEL2TRIGGER') {
      await labelTrigger(octokit, Number(PROJECT_ID));
      return;
    }
    if (PROJECT_TYPE === 'PR2TRIGGER') {
      await prTrigger(octokit, Number(PROJECT_ID));
      return;
    }
    if (PROJECT_TYPE === 'ISSUE2TRIGGER') {
      await issueTrigger(octokit, Number(PROJECT_ID));
      return;
    }

    coreSetFailed(
      "PROJECT_TYPE is not valid, not 'ISSUE2TRIGGER', 'PR2TRIGGER', or 'LABEL2TRIGGER'"
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
