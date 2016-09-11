import { basename, join } from 'path';
import { BuildContext, TaskInfo, TsConfig } from './interfaces';
import { copy as fsCopy, emptyDirSync, outputJsonSync, readJsonSync, statSync } from 'fs-extra';
import { fillConfigDefaults, generateContext, Logger } from './util';


export function ngc(context?: BuildContext) {
  const logger = new Logger('ngc');
  context = generateContext(context);
  fillConfigDefaults(context, NGC_TASK_INFO);

  // first make a copy of src TS files
  // and copy them into the tmp directory
  return copySrcTsToTmpDir(context).then(() => {
    // ts files have finishe being copied to the tmp directory
    // now compile the copied TS files with NGC
    return runNgc(context);

  }).then(() => {
    return logger.finish();
  }).catch(reason => {
    return logger.fail(reason);
  });
}


function runNgc(context: BuildContext) {
  return new Promise((resolve, reject) => {
    // make a copy of the users src tsconfig file
    // and save the modified copy into the tmp directory
    createTmpTsConfig(context);

    // let's kick off the actual ngc command on our copied TS files
    // use the user's ngc in their node_modules to ensure ngc
    // versioned and working along with the user's ng2 version
    const spawn = require('cross-spawn');
    const ngcCmd = join(context.rootDir, 'node_modules', '.bin', 'ngc');
    const ngcCmdArgs = [
      '--project', getTmpTsConfigPath(context)
    ];
    let hadAnError = false;

    // would love to not use spawn here but import and run ngc directly
    const ls = spawn(ngcCmd, ngcCmdArgs);

    ls.stdout.on('data', (data: string) => {
      Logger.info(data);
    });

    ls.stderr.on('data', (data: string) => {
      Logger.error(`ngc error: ${data}`);
      hadAnError = true;
    });

    ls.on('close', (code: string) => {
      if (hadAnError) {
        reject(`NGC encountered an error`);
      } else {
        resolve();
      }
    });

  });
}


function createTmpTsConfig(context: BuildContext) {
  // create the tsconfig from the original src
  const tsConfig = getSrcTsConfig(context);

  // delete outDir if it's set since we only want
  // to compile to the same directory we're in
  delete tsConfig.compilerOptions.outDir;

  // downstream, we have a dependency on es5 code and
  // es2015 modules, so force them
  tsConfig.compilerOptions.module = 'es2015';
  tsConfig.compilerOptions.target = 'es2015';
  tsConfig.compilerOptions.removeComments = true;

  // force where to look for ts files
  tsConfig.include = context.ngcConfig.include;

  // save the modified copy into the tmp directory
  outputJsonSync(getTmpTsConfigPath(context), tsConfig);
}


function copySrcTsToTmpDir(context: BuildContext) {
  return new Promise((resolve, reject) => {

    // ensure the tmp directory is ready to go
    try {
      emptyDirSync(context.tmpDir);
    } catch (e) {
      throw new Error(`tmpDir error: ${e}`);
    }

    const copyOpts: any = {
      filter: filterCopyFiles
    };

    fsCopy(context.srcDir, context.tmpDir, copyOpts, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}


function filterCopyFiles(filePath: any, hoop: any) {
  let shouldInclude = false;

  try {
    const stats = statSync(filePath);
    if (stats.isDirectory()) {
      shouldInclude = (EXCLUDE_DIRS.indexOf(basename(filePath)) < 0);

    } else {
      if (filePath.substr(filePath.length - 3) === '.ts') {
        if (filePath.substr(filePath.length - 5) !== '.d.ts') {
          shouldInclude = true;
        }
      }
    }

  } catch (e) {}

  return shouldInclude;
}


function getSrcTsConfig(context: BuildContext): TsConfig {
  let srcTsConfig: TsConfig = null;
  const srcTsConfigPath = join(context.rootDir, TS_CONFIG_FILE);

  try {
    srcTsConfig = readJsonSync(srcTsConfigPath);
  } catch (e) {
    throw new Error(`Error reading tsconfig file "${srcTsConfigPath}", ${e}`);
  }

  if (!srcTsConfig) {
    throw new Error(`Invalid tsconfig file "${srcTsConfigPath}"`);
  }

  if (!srcTsConfig.compilerOptions) {
    throw new Error('TSConfig is missing necessary compiler options');
  }

  return srcTsConfig;
}


function getTmpTsConfigPath(context: BuildContext) {
  return join(context.tmpDir, TS_CONFIG_FILE);
}


const EXCLUDE_DIRS = ['assets', 'theme'];
const TS_CONFIG_FILE = 'tsconfig.json';

const NGC_TASK_INFO: TaskInfo = {
  contextProperty: 'ngcConfig',
  fullArgOption: '--ngc',
  shortArgOption: '-n',
  defaultConfigFilename: 'ngc.config'
};