import * as fs from 'fs';
import * as shell from 'shelljs';
import { Org, Messages } from '@salesforce/core';
import { sfProject } from '../../utils/sfcli/project/sfProject';
import { FileUtil, File } from '../../utils/file/fileUtil';
import { Logger } from '../../utils/logger';
import { Constants } from '../../utils/constants/stringContants';
import { PageJson, Region } from '../interfaces';
import { FileDiffUtil } from '../../utils/lwcparser/fileutils/FileDiffUtil';
import { ExperienceSiteAssessmentInfo } from '../../utils';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';

Messages.importMessagesDirectory(__dirname);

const EXPERIENCE_SITES_PATH = '/force-app/main/default/experiences/selfservicepolicyholder1';

export class ExperienceSiteMigration extends BaseRelatedObjectMigration {
  private targetNamespace: string;

  public constructor(projectPath: string, namespace: string, org: Org, targetNameSpace?: string) {
    super(projectPath, namespace, org);
    this.targetNamespace = targetNameSpace;
  }

  public processObjectType(): string {
    return Constants.Apex;
  }

  public migrate(): ExperienceSiteAssessmentInfo[] {
    Logger.logVerbose('StartingExperienceSiteMigration');
    const pwd = shell.pwd();
    Logger.logVerbose('A');
    shell.cd(this.projectPath);
    Logger.logVerbose('B');

    const targetOrg: Org = this.org;
    Logger.logVerbose('C');

    sfProject.retrieve('ExperienceBundle', targetOrg.getUsername());

    Logger.logVerbose('Successfully retreived the experience site metadata. Now starting processing the sites');

    const experienceSiteInfo = this.processExperienceSites(this.projectPath, 'migration');
    Logger.info('successfullyProcessed Experience Sites for Migration');
    shell.cd(pwd);
    return experienceSiteInfo;
  }

  public processExperienceSites(dir: string, type = 'migration'): ExperienceSiteAssessmentInfo[] {
    dir += EXPERIENCE_SITES_PATH;
    const directoryMap: Map<string, File[]> = FileUtil.readAllFiles(dir);

    // TODO - Can do chunking here later, so as to minimize the memory usage
    const experienceSiteAssessmentInfo: ExperienceSiteAssessmentInfo[] = [];
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
          const experienceSiteInfo = this.processExperienceSite(file, type);

          experienceSiteAssessmentInfo.push(experienceSiteInfo);
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
    return experienceSiteAssessmentInfo;
  }

  public processExperienceSite(file: File, type = 'migration'): ExperienceSiteAssessmentInfo {
    // Here we are reading the file. Before only the metadata is being fetchedl
    if (file.name === 'lwcos') {
      const fileContent = fs.readFileSync(file.location, 'utf8');
      Logger.logVerbose('ABCD - Printing the parsed file content' + file.name);
      Logger.logVerbose(JSON.stringify(fileContent));

      const abc = JSON.parse(fileContent) as PageJson; // Later covert to a wrapper so that later can change easily with 3rd party if required
      const normalizedOriginal = JSON.stringify(abc, null, 2);

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

            // TODO - Replace with namespace - targetNamespace
            Logger.logVerbose('The target namespace is ' + this.targetNamespace);
            if (component?.componentName === 'vlocity_ins:vlocityLWCOmniWrapper') {
              Logger.logVerbose('EUREKA - Component has been found -------------- EUREKA');
              component.componentName = 'KAPOOR';

              component.type = 'ABC';
              component.subtype = 'DEF';
              component.language = 'GHI';
            }
          }
        }

        // In each region take the object having components key. This value of that will be an object array lets call it RegionComponents
        // For each RegionComponents, iterate over all the components and replace the keys with hardcoded values.
      }

      Logger.logVerbose('Now printing the updated object' + JSON.stringify(abc));

      const noarmalizeUpdatedFileContent = JSON.stringify(abc, null, 2); // Pretty-print with 2 spaces
      const difference = new FileDiffUtil().getFileDiff(file.name, normalizedOriginal, noarmalizeUpdatedFileContent);

      Logger.logVerbose('Printing the difference' + JSON.stringify(difference));

      if (normalizedOriginal !== noarmalizeUpdatedFileContent) {
        Logger.logVerbose('Updating the file content');
        fs.writeFileSync(file.location, noarmalizeUpdatedFileContent, 'utf8');
      }

      const warningMessage: string[] = [];
      const updateMessage: string[] = [];
      return {
        name: file.name,
        warnings: warningMessage,
        infos: updateMessage,
        path: file.location,
        diff: JSON.stringify(difference),
      };
    } else {
      Logger.logVerbose('File name is ' + file.name);
      return {
        name: file.name,
        warnings: [],
        infos: [],
        path: file.location,
        diff: '[]',
      };
    }
  }
}
