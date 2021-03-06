import { join } from 'path';
import { spawn } from 'cross-spawn';

import { fillConfigDefaults, getUserConfigFile } from './util/config';
import { BuildContext, TaskInfo } from './util/interfaces';
import { Logger } from './logger/logger';
import { writeFileAsync } from './util/helpers';

export function babili(context: BuildContext, configFile?: string) {

  configFile = getUserConfigFile(context, taskInfo, configFile);
  const logger = new Logger('babili - experimental');

  return babiliWorker(context, configFile).then(() => {
    logger.finish();
  })
  .catch(err => {
    throw logger.fail(err);
  });
}


export function babiliWorker(context: BuildContext, configFile: string) {
  const babiliConfig: BabiliConfig = fillConfigDefaults(configFile, taskInfo.defaultConfigFile);
  // TODO - figure out source maps??
  return runBabili(context, babiliConfig).then((minifiedCode: string) => {
    // write the file back to disk
    const fileToWrite = join(context.buildDir, babiliConfig.destFileName);
    return writeFileAsync(fileToWrite, minifiedCode);
  });
}

function runBabili(context: BuildContext, config: BabiliConfig) {
  const babiliPath = join(context.rootDir, 'node_modules', '.bin', 'babili');
  const bundlePath = join(context.buildDir, config.sourceFile);
  return runBabiliImpl(babiliPath, bundlePath);
}

function runBabiliImpl(pathToBabili: string, pathToBundle: string) {
  // TODO - is there a better way to run this?
  let chunks: string[] = [];
  return new Promise((resolve, reject) => {
    const command = spawn(pathToBabili, [pathToBundle]);
    command.stdout.on('data', (buffer: Buffer) => {
      const stringRepresentation = buffer.toString();
      Logger.debug(`[Babili] ${stringRepresentation}`);
      chunks.push(stringRepresentation);
    });

    command.stderr.on('data', (buffer: Buffer) => {
      Logger.warn(`[Babili] ${buffer.toString()}`);
    });

    command.on('close', (code: number) => {
      if ( code !== 0) {
        return reject(new Error('Babili failed with a non-zero status code'));
      }
      return resolve(chunks.join(''));
    });
  });
}

export const taskInfo: TaskInfo = {
  fullArg: '--babili',
  shortArg: null,
  envVar: 'IONIC_EXP_BABILI',
  packageConfig: 'ionic_exp_babili',
  defaultConfigFile: 'babili.config'
};


export interface BabiliConfig {
  // https://www.npmjs.com/package/uglify-js
  sourceFile: string;
  destFileName: string;
}
