import * as fs from 'fs';
import * as shell from 'shelljs';
import { Org, Messages } from '@salesforce/core';
import { sfProject } from '../../utils/sfcli/project/sfProject';
import { FileUtil, File } from '../../utils/file/fileUtil';
import { Logger } from '../../utils/logger';
import { Constants } from '../../utils/constants/stringContants';
import { PageJson, Region } from '../interfaces';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';

Messages.importMessagesDirectory(__dirname);

const EXPERIENCE_SITES_PATH = '/force-app/main/default/experiences/selfservicepolicyholder1';

export class ExperienceSiteMigration extends BaseRelatedObjectMigration {
  public constructor(projectPath: string, namespace: string, org: Org, targetApexNameSpace?: string) {
    super(projectPath, namespace, org);
  }

  public processObjectType(): string {
    return Constants.Apex;
  }

  public migrate(): void {
    Logger.logVerbose('StartingExperienceSiteMigration');
    const pwd = shell.pwd();
    Logger.logVerbose('A');
    shell.cd(this.projectPath);
    Logger.logVerbose('B');

    const targetOrg: Org = this.org;
    Logger.logVerbose('C');

    sfProject.retrieve('ExperienceBundle', targetOrg.getUsername());

    Logger.logVerbose('Successfully retreived the experience site metadata. Now starting processing the sites');

    this.processExperienceSites(this.projectPath, 'migration');
    Logger.info('successfullyProcessed Experience Sites for Migration');
    shell.cd(pwd);
  }

  public processExperienceSites(dir: string, type = 'migration'): void {
    dir += EXPERIENCE_SITES_PATH;
    const directoryMap: Map<string, File[]> = FileUtil.readAllFiles(dir);

    // TODO - Can do chunking here later, so as to minimize the memory usage
    for (const directory of directoryMap.keys()) {
      const fileArray = directoryMap.get(directory);

      Logger.logVerbose('------------------------------------------------');
      Logger.logVerbose('The directory path is ' + directory);
      for (const file of fileArray) {
        if (file.ext !== '.json') {
          Logger.logVerbose('skippingNonJsonFile file.name - ' + file.name);
          continue;
        }
        try {
          Logger.logVerbose('Started processing the file - ' + file.name);
          this.processExperienceSite(file, type);

          // TODO - Later fileAssessmentInfo.push(apexAssementInfo);
          Logger.logVerbose('successfullyProcessedExperienceSite');
        } catch (err) {
          Logger.error('errorProcessingExperienceSite' + file.name);
          Logger.error(JSON.stringify(err));
          if (err instanceof Error) {
            Logger.error(err.stack);
          }
        }
        Logger.logVerbose('successfullyProcessedExperienceSite');
      }
    }
  }

  public processExperienceSite(file: File, type = 'migration'): void {
    // Here we are reading the file. Before only the metadata is being fetchedl
    if (file.name === 'lwcos') {
      const fileContent = fs.readFileSync(file.location, 'utf8');
      Logger.logVerbose('ABCD - Printing the parsed file content' + file.name);
      Logger.logVerbose(JSON.stringify(fileContent));

      const abc = JSON.parse(fileContent) as PageJson; // Later covert to a wrapper so that later can change easily with 3rd party if required
      Logger.logVerbose('Printing the parsed content');
      Logger.logVerbose(JSON.stringify(abc));

      // Now we have to take regions array and iterate over it
      const regions: Region[] = abc['regions'];

      for (const region of regions) {
        Logger.logVerbose('-------');
        Logger.logVerbose('Now printing the regions ABCD ' + JSON.stringify(region));

        // Now for each region we want to process the components and change its values
        const regionComponents = region['components'];

        if (Array.isArray(regionComponents)) {
          for (const component of regionComponents) {
            Logger.logVerbose('----Now printing the components----');
            Logger.logVerbose('Printing the component ' + JSON.stringify(component));
          }
        }
      }

      // In each region take the object having components key. This value of that will be an object array lets call it RegionComponents
      // For each RegionComponents, iterate over all the components and replace the keys with hardcoded values.

      // Here our json parser will come
      // TODO
      /*
      let difference = [];
      difference = new FileDiffUtil().getFileDiff(file.name, fileContent, updatedContent);
      */
      /*
      return {
        name: file.name,
        warnings: warningMessage,
        infos: updateMessages,
        path: file.location,
        diff: JSON.stringify(difference),
      };
      */
    } else {
      Logger.logVerbose('File name is ' + file.name);
    }
  }
}
