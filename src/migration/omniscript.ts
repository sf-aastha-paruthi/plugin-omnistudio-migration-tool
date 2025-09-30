/* eslint-disable */
import { AnyJson } from '@salesforce/ts-types';

import OmniScriptMappings from '../mappings/OmniScript';
import ElementMappings from '../mappings/Element';
import OmniScriptDefinitionMappings from '../mappings/OmniScriptDefinition';
import {
  DataRaptorAssessmentInfo,
  DebugTimer,
  FlexCardAssessmentInfo,
  nameLocation,
  OmniscriptNameMapping,
  QueryTools,
  SortDirection,
} from '../utils';
import { BaseMigrationTool, ComponentType } from './base';
import {
  InvalidEntityTypeError,
  MigrationResult,
  MigrationStorage,
  MigrationTool,
  OmniScriptStorage,
  TransformData,
  UploadRecordResult,
} from './interfaces';
import { ObjectMapping } from './interfaces';
import { NetUtils, RequestMethod } from '../utils/net';
import { Connection, Messages } from '@salesforce/core';
import { UX } from '@salesforce/command';
import { OSAssessmentInfo, OmniAssessmentInfo, IPAssessmentInfo } from '../../src/utils';
import {
  getAllFunctionMetadata,
  getReplacedString,
  populateRegexForFunctionMetadata,
} from '../utils/formula/FormulaUtil';
import { StringVal } from '../utils/StringValue/stringval';
import { Logger } from '../utils/logger';
import { createProgressBar } from './base';
import { StorageUtil } from '../utils/storageUtil';
import { isStandardDataModel } from '../utils/dataModelService';

export class OmniScriptMigrationTool extends BaseMigrationTool implements MigrationTool {
  private readonly exportType: OmniScriptExportType;
  private readonly allVersions: boolean;
  private IS_STANDARD_DATA_MODEL: boolean = isStandardDataModel();

  // Reserved keys that should not be used for storing output
  private readonly reservedKeys = new Set<string>(['Request', 'Response', 'Condition']);

  // Tags to validate in PropertySet for reserved key usage
  private readonly tagsToValidate = new Set<string>(['additionalOutput']);

  // constants
  private readonly OMNISCRIPT = 'OmniScript';

  // Source Custom Object Names
  static readonly OMNISCRIPT_NAME = 'OmniScript__c';

  static readonly ELEMENT_NAME = 'Element__c';
  static readonly OMNISCRIPTDEFINITION_NAME = 'OmniScriptDefinition__c';

  // Target Standard Objects Name
  static readonly OMNIPROCESS_NAME = 'OmniProcess';
  static readonly OMNIPROCESSELEMENT_NAME = 'OmniProcessElement';
  static readonly OMNIPROCESSCOMPILATION_NAME = 'OmniProcessCompilation';

  constructor(
    exportType: OmniScriptExportType,
    namespace: string,
    connection: Connection,
    logger: Logger,
    messages: Messages,
    ux: UX,
    allVersions: boolean
  ) {
    super(namespace, connection, logger, messages, ux);
    this.exportType = exportType;
    this.allVersions = allVersions;
  }

  getName(
    singular: boolean = false
  ): 'Integration Procedures' | 'Integration Procedure' | 'Omniscripts' | 'Omniscript' {
    if (this.exportType === OmniScriptExportType.IP) {
      return singular ? 'Integration Procedure' : 'Integration Procedures';
    } else if (this.exportType === OmniScriptExportType.OS) {
      return singular ? 'Omniscript' : 'Omniscripts';
    }
  }

  getRecordName(record: string) {
    return (
      record[this.getFieldKey('Type__c')] +
      '_' +
      record[this.getFieldKey('SubType__c')] +
      (record[this.getFieldKey('Language__c')] ? '_' + record[this.getFieldKey('Language__c')] : '') +
      '_' +
      record[this.getFieldKey('Version__c')]
    );
  }

  getMappings(): ObjectMapping[] {
    return [
      {
        source: OmniScriptMigrationTool.OMNISCRIPT_NAME,
        target: OmniScriptMigrationTool.OMNIPROCESS_NAME,
      },
      {
        source: OmniScriptMigrationTool.ELEMENT_NAME,
        target: OmniScriptMigrationTool.OMNIPROCESSELEMENT_NAME,
      },
      {
        source: OmniScriptMigrationTool.OMNISCRIPTDEFINITION_NAME,
        target: OmniScriptMigrationTool.OMNIPROCESSCOMPILATION_NAME,
      },
    ];
  }

  async truncate(): Promise<void> {
    const objectName = OmniScriptMigrationTool.OMNIPROCESS_NAME;
    const allIds = await this.deactivateRecord(objectName);
    await this.truncateElements(objectName, allIds.os.parents);
    await this.truncateElements(objectName, allIds.os.childs);
    await this.truncateElements(objectName, allIds.ip.parents);
    await this.truncateElements(objectName, allIds.ip.childs);
  }

  async truncateElements(objectName: string, ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) {
      return;
    }

    let success: boolean = await NetUtils.delete(this.connection, ids);
    if (!success) {
      throw new Error(this.messages.getMessage('couldNotTruncateOmnniProcess', [this.getName(), this.getName()]));
    }
  }

  async deactivateRecord(
    objectName: string
  ): Promise<{ os: { parents: string[]; childs: string[] }; ip: { parents: string[]; childs: string[] } }> {
    DebugTimer.getInstance().lap('Truncating ' + objectName + ' (' + this.exportType + ')');

    const filters = new Map<string, any>();
    const sorting = [
      { field: 'IsIntegrationProcedure', direction: SortDirection.ASC },
      { field: 'IsOmniScriptEmbeddable', direction: SortDirection.ASC },
    ];

    // Filter if only IP / OS
    if (this.exportType === OmniScriptExportType.IP) {
      filters.set('IsIntegrationProcedure', true);
    } else if (this.exportType === OmniScriptExportType.OS) {
      filters.set('IsIntegrationProcedure', false);
    }

    // const ids: string[] = await QueryTools.queryIds(this.connection, objectName, filters);
    const rows = await QueryTools.query(
      this.connection,
      objectName,
      ['Id', 'IsIntegrationProcedure', 'IsOmniScriptEmbeddable'],
      filters,
      sorting
    );
    if (rows.length === 0) {
      return { os: { parents: [], childs: [] }, ip: { parents: [], childs: [] } };
    }

    // We need to update one item at time. Otherwise, we'll have an UNKNOWN_ERROR
    for (let row of rows) {
      const id = row['Id'];

      await NetUtils.request(
        this.connection,
        `sobjects/${OmniScriptMigrationTool.OMNIPROCESS_NAME}/${id}`,
        {
          IsActive: false,
        },
        RequestMethod.PATCH
      );
    }

    // Sleep 5 seconds, let's wait for all row locks to be released. While this takes less than a second, there has been
    // times where it take a bit more.
    await this.sleep();

    return {
      os: {
        parents: rows
          .filter((row) => row.IsIntegrationProcedure === false && row.IsOmniScriptEmbeddable === false)
          .map((row) => row.Id),
        childs: rows
          .filter((row) => row.IsIntegrationProcedure === false && row.IsOmniScriptEmbeddable === true)
          .map((row) => row.Id),
      },
      ip: {
        parents: rows
          .filter((row) => row.IsIntegrationProcedure === true && row.IsOmniScriptEmbeddable === false)
          .map((row) => row.Id),
        childs: rows
          .filter((row) => row.IsIntegrationProcedure === true && row.IsOmniScriptEmbeddable === true)
          .map((row) => row.Id),
      },
    };
  }

  public async assess(
    dataRaptorAssessmentInfos: DataRaptorAssessmentInfo[],
    flexCardAssessmentInfos: FlexCardAssessmentInfo[]
  ): Promise<OmniAssessmentInfo> {
    try {
      const exportComponentType = this.getName() as ComponentType;
      Logger.log(this.messages.getMessage('startingOmniScriptAssessment', [exportComponentType]));
      const omniscripts = await this.getAllOmniScripts();

      Logger.log(this.messages.getMessage('foundOmniScriptsToAssess', [omniscripts.length, exportComponentType]));

      const omniAssessmentInfos = await this.processOmniComponents(
        omniscripts,
        dataRaptorAssessmentInfos,
        flexCardAssessmentInfos
      );

      await this.updateStorageForOmniscriptAssessment(omniAssessmentInfos?.osAssessmentInfos);

      return omniAssessmentInfos;
    } catch (err) {
      if (err instanceof InvalidEntityTypeError) {
        throw err;
      }
      Logger.error(this.messages.getMessage('errorDuringOmniScriptAssessment'), err);
    }
  }

  public async processOmniComponents(
    omniscripts: AnyJson[],
    dataRaptorAssessmentInfos: DataRaptorAssessmentInfo[],
    flexCardAssessmentInfos: FlexCardAssessmentInfo[]
  ): Promise<OmniAssessmentInfo> {
    const osAssessmentInfos: OSAssessmentInfo[] = [];
    const ipAssessmentInfos: IPAssessmentInfo[] = [];

    // Create a set to store existing OmniScript names and also extract DataRaptor and FlexCard names
    const existingOmniscriptNames = new Set<string>();
    const existingDataRaptorNames = new Set(dataRaptorAssessmentInfos.map((info) => info.name));
    const existingFlexCardNames = new Set(flexCardAssessmentInfos.map((info) => info.name));

    const progressBarType: ComponentType = this.getName() as ComponentType;
    const progressBar = createProgressBar('Assessing', progressBarType);
    let progressCounter = 0;
    progressBar.start(omniscripts.length, progressCounter);
    // First, collect all OmniScript names from the omniscripts array
    // Now process each OmniScript and its elements
    for (const omniscript of omniscripts) {
      Logger.info(this.messages.getMessage('processingOmniScript', [omniscript['Name']]));
      let omniAssessmentInfo: OSAssessmentInfo;
      try {
        omniAssessmentInfo = await this.processOmniScript(
          omniscript,
          existingOmniscriptNames,
          existingDataRaptorNames,
          existingFlexCardNames
        );
      } catch (e) {
        const omniProcessType = omniscript[this.getFieldKey('IsProcedure__c')] ? 'Integration Procedure' : 'OmniScript';
        if (omniProcessType === 'OmniScript') {
          osAssessmentInfos.push({
            name: omniscript['Name'],
            id: omniscript['Id'],
            oldName: omniscript['Name'],
            dependenciesIP: [],
            dependenciesDR: [],
            dependenciesOS: [],
            dependenciesRemoteAction: [],
            dependenciesLWC: [],
            infos: [],
            warnings: [],
            errors: [this.messages.getMessage('unexpectedError')],
            migrationStatus: 'Failed',
            type: 'OmniScript',
            missingIP: [],
            missingDR: [],
            missingOS: [],
          });
        } else {
          ipAssessmentInfos.push({
            name: omniscript['Name'],
            id: omniscript['Id'],
            oldName: omniscript['Name'],
            dependenciesIP: [],
            dependenciesDR: [],
            dependenciesOS: [],
            dependenciesRemoteAction: [],
            infos: [],
            warnings: [],
            errors: [this.messages.getMessage('unexpectedError')],
            path: '',
            migrationStatus: 'Failed',
          });
        }
        const error = e as Error;
        Logger.error('Error processing omniscripts', error);
        continue;
      }
      if (omniAssessmentInfo.type === 'OmniScript') {
        const type = omniscript[this.getFieldKey('IsLwcEnabled__c')] ? 'LWC' : 'Angular';
        const osAssessmentInfo: OSAssessmentInfo = {
          name: omniAssessmentInfo.name,
          type: type,
          oldName: omniAssessmentInfo.oldName,
          id: omniscript['Id'],
          dependenciesIP: omniAssessmentInfo.dependenciesIP,
          missingIP: [],
          dependenciesDR: omniAssessmentInfo.dependenciesDR,
          missingDR: [],
          dependenciesOS: omniAssessmentInfo.dependenciesOS,
          missingOS: omniAssessmentInfo.missingOS,
          dependenciesRemoteAction: omniAssessmentInfo.dependenciesRemoteAction,
          dependenciesLWC: omniAssessmentInfo.dependenciesLWC,
          infos: [],
          warnings: omniAssessmentInfo.warnings,
          errors: [],
          migrationStatus: omniAssessmentInfo.migrationStatus,
          nameMapping: omniAssessmentInfo.nameMapping,
        };
        osAssessmentInfos.push(osAssessmentInfo);
      } else {
        const ipAssessmentInfo: IPAssessmentInfo = {
          name: omniAssessmentInfo.name,
          id: omniscript['Id'],
          oldName: omniAssessmentInfo.oldName,
          dependenciesIP: omniAssessmentInfo.dependenciesIP,
          dependenciesDR: omniAssessmentInfo.dependenciesDR,
          dependenciesOS: omniAssessmentInfo.dependenciesOS,
          dependenciesRemoteAction: omniAssessmentInfo.dependenciesRemoteAction,
          infos: [],
          warnings: omniAssessmentInfo.warnings,
          migrationStatus: omniAssessmentInfo.migrationStatus,
          errors: [],
          path: '',
        };
        ipAssessmentInfos.push(ipAssessmentInfo);
      }
      progressBar.update(++progressCounter);
    }
    progressBar.stop();

    const omniAssessmentInfo: OmniAssessmentInfo = {
      osAssessmentInfos: osAssessmentInfos,
      ipAssessmentInfos: ipAssessmentInfos,
    };

    return omniAssessmentInfo;
  }

  private async processOmniScript(
    omniscript: AnyJson,
    existingOmniscriptNames: Set<string>,
    existingDataRaptorNames: Set<string>,
    existingFlexCardNames: Set<string>
  ): Promise<OSAssessmentInfo> {
    const elements = await this.getAllElementsForOmniScript(omniscript['Id']);

    const dependencyIP: nameLocation[] = [];
    const missingIP: string[] = [];
    const dependencyDR: nameLocation[] = [];
    const missingDR: string[] = [];
    const dependencyOS: nameLocation[] = [];
    const missingOS: string[] = [];
    const dependenciesRA: nameLocation[] = [];
    const dependenciesLWC: nameLocation[] = [];

    //const missingRA: string[] = [];

    // Check for duplicate element names within the same OmniScript
    const elementNames = new Set<string>();
    const duplicateElementNames = new Set<string>();

    // Track reserved keys found in PropertySet
    const foundReservedKeys = new Set<string>();

    for (const elem of elements) {
      const elemName = elem['Name'];
      if (elementNames.has(elemName)) {
        duplicateElementNames.add(elemName);
      } else {
        elementNames.add(elemName);
      }
    }

    for (const elem of elements) {
      const type = elem[this.getFieldKey('Type__c')];
      const elemName = `${elem['Name']}`;
      const propertySet = JSON.parse(elem[this.getFieldKey('PropertySet__c')] || '{}');

      // Collect reserved keys from PropertySet
      this.collectReservedKeys(propertySet, foundReservedKeys);

      // Check for OmniScript dependencies
      if (type === 'OmniScript') {
        const nameVal = `${elemName}`;
        const type = propertySet['Type'];
        const subtype = propertySet['Sub Type'];
        const language = propertySet['Language'];
        const osName = type + '_' + subtype + '_' + language;
        dependencyOS.push({
          name: osName,
          location: nameVal,
        });
        if (!existingOmniscriptNames.has(nameVal)) {
          missingOS.push(nameVal);
        }
      }

      // Check for Integration Procedure Action dependencies
      if (type === 'Integration Procedure Action') {
        const nameVal = `${elemName}`;
        dependencyIP.push({ name: propertySet['integrationProcedureKey'], location: nameVal });
        if (!existingOmniscriptNames.has(nameVal) && !existingFlexCardNames.has(nameVal)) {
          missingIP.push(nameVal);
        }
      }

      // Check for DataRaptor dependencies
      if (
        [
          'DataRaptor Extract Action',
          'DataRaptor Turbo Action',
          'DataRaptor Transform Action',
          'DataRaptor Post Action',
        ].includes(type)
      ) {
        const nameVal = `${elemName}`;
        dependencyDR.push({ name: propertySet['bundle'], location: nameVal });
        if (!existingOmniscriptNames.has(nameVal) && !existingDataRaptorNames.has(nameVal)) {
          missingDR.push(nameVal);
        }
      }

      if (type === 'Remote Action') {
        const nameVal = `${elemName}`;
        const className = propertySet['remoteClass'];
        const methodName = propertySet['remoteMethod'];
        if (className && methodName) dependenciesRA.push({ name: className + '.' + methodName, location: nameVal });
      }
      // To handle radio , multiselect
      if (propertySet['optionSource'] && propertySet['optionSource']['type'] === 'Custom') {
        const nameVal = `${elemName}`;
        dependenciesRA.push({ name: propertySet['optionSource']['source'], location: nameVal });
      }

      if (type === 'Custom Lightning Web Component') {
        const nameVal = `${elemName}`;
        const lwcName = propertySet['lwcName'];
        dependenciesLWC.push({ name: lwcName, location: nameVal });
      }
      // To fetch custom overrides
      if (propertySet['lwcComponentOverride']) {
        const nameVal = `${elemName}`;
        const lwcName = propertySet['lwcComponentOverride'];
        dependenciesLWC.push({ name: lwcName, location: nameVal });
      }
    }

    const omniProcessType = omniscript[this.getFieldKey('IsProcedure__c')] ? 'Integration Procedure' : 'OmniScript';

    const existingType = omniscript[this.getFieldKey('Type__c')];
    const existingTypeVal = new StringVal(existingType, 'type');
    const existingSubType = omniscript[this.getFieldKey('SubType__c')];
    const existingSubTypeVal = new StringVal(existingSubType, 'sub type');
    const omniScriptName = omniscript[this.getFieldKey('Name')];
    const existingOmniScriptNameVal = new StringVal(omniScriptName, 'name');
    let assessmentStatus: 'Ready for migration' | 'Warnings' | 'Needs Manual Intervention' = 'Ready for migration';

    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for missing mandatory fields for Integration Procedures
    if (omniProcessType === 'Integration Procedure') {
      if (!existingType || existingType.trim() === '') {
        errors.push(this.messages.getMessage('missingMandatoryField', ['Type', 'Integration Procedure']));
        assessmentStatus = 'Needs Manual Intervention';
      }
      if (!existingSubType || existingSubType.trim() === '') {
        errors.push(this.messages.getMessage('missingMandatoryField', ['SubType', 'Integration Procedure']));
        assessmentStatus = 'Needs Manual Intervention';
      }
    }

    // Check for Angular OmniScript dependencies
    for (const osDep of dependencyOS) {
      if (this.nameRegistry.isAngularOmniScript(osDep.name)) {
        warnings.push(this.messages.getMessage('angularOmniScriptDependencyWarning', [osDep.location, osDep.name]));
        assessmentStatus = 'Needs Manual Intervention';
      }
    }

    // This we need broken down, better create an object and propagate it
    // Here break it and then combine it
    const newType = existingTypeVal.cleanName();
    const newSubType = existingSubTypeVal.cleanName();
    const newLanguage = omniscript[this.getFieldKey('Language__c')]
      ? `${omniscript[this.getFieldKey('Language__c')]}`
      : '';

    const recordName =
      `${newType}_` +
      `${newSubType}` +
      (omniscript[this.getFieldKey('Language__c')] ? `_${omniscript[this.getFieldKey('Language__c')]}` : '') +
      `_${omniscript[this.getFieldKey('Version__c')]}`;

    const oldName =
      `${existingTypeVal.val}_` +
      `${existingSubTypeVal.val}` +
      (omniscript[this.getFieldKey('Language__c')] ? `_${omniscript[this.getFieldKey('Language__c')]}` : '') +
      `_${omniscript[this.getFieldKey('Version__c')]}`;

    if (!existingTypeVal.isNameCleaned()) {
      if (omniProcessType === 'Integration Procedure' && (!newType || newType.trim() === '')) {
        warnings.push(this.messages.getMessage('integrationProcedureTypeEmptyAfterCleaning', [existingTypeVal.val]));
        assessmentStatus = 'Needs Manual Intervention';
      } else {
        warnings.push(
          this.messages.getMessage('changeMessage', [
            existingTypeVal.type,
            existingTypeVal.val,
            existingTypeVal.cleanName(),
          ])
        );
        assessmentStatus = 'Warnings';
      }
    }
    if (!existingSubTypeVal.isNameCleaned()) {
      if (omniProcessType === 'Integration Procedure' && (!newSubType || newSubType.trim() === '')) {
        warnings.push(
          this.messages.getMessage('integrationProcedureSubtypeEmptyAfterCleaning', [existingSubTypeVal.val])
        );
        assessmentStatus = 'Needs Manual Intervention';
      } else {
        warnings.push(
          this.messages.getMessage('changeMessage', [
            existingSubTypeVal.type,
            existingSubTypeVal.val,
            existingSubTypeVal.cleanName(),
          ])
        );
        assessmentStatus = 'Warnings';
      }
    }

    if (!existingOmniScriptNameVal.isNameCleaned()) {
      warnings.push(
        this.messages.getMessage('changeMessage', [
          existingOmniScriptNameVal.type,
          existingOmniScriptNameVal.val,
          existingOmniScriptNameVal.cleanName(),
        ])
      );
      assessmentStatus = 'Warnings';
    }
    if (existingOmniscriptNames.has(recordName)) {
      warnings.push(this.messages.getMessage('duplicatedName') + '  ' + recordName);
      assessmentStatus = 'Needs Manual Intervention';
    } else {
      existingOmniscriptNames.add(recordName);
    }

    // Add warning for duplicate element names within the same OmniScript
    if (duplicateElementNames.size > 0) {
      const duplicateNamesList = Array.from(duplicateElementNames).join(', ');
      warnings.unshift(this.messages.getMessage('invalidOrRepeatingOmniscriptElementNames', [duplicateNamesList]));
      assessmentStatus = 'Needs Manual Intervention';
    }

    // Add warning for reserved keys found in PropertySet
    if (foundReservedKeys.size > 0) {
      const reservedKeysList = Array.from(foundReservedKeys).join(', ');
      warnings.unshift(this.messages.getMessage('reservedKeysFoundInPropertySet', [reservedKeysList]));
      assessmentStatus = 'Needs Manual Intervention';
    }

    if (omniProcessType === this.OMNISCRIPT) {
      const type = omniscript[this.getFieldKey('IsLwcEnabled__c')] ? 'LWC' : 'Angular';
      if (type === 'Angular') {
        warnings.unshift(this.messages.getMessage('angularOSWarning'));
        assessmentStatus = 'Needs Manual Intervention';
      }
    }

    const result: OSAssessmentInfo = {
      name: recordName,
      id: omniscript['Id'],
      oldName: oldName,
      dependenciesIP: dependencyIP,
      dependenciesDR: dependencyDR,
      dependenciesOS: dependencyOS,
      dependenciesRemoteAction: dependenciesRA,
      dependenciesLWC: dependenciesLWC,
      infos: [],
      warnings: warnings,
      errors: [],
      migrationStatus: assessmentStatus,
      type: omniProcessType,
      missingDR: missingDR,
      missingIP: missingIP,
      missingOS: missingOS,
    };

    if (omniProcessType === this.OMNISCRIPT) {
      const nameMapping: OmniscriptNameMapping = {
        oldType: existingType,
        oldSubtype: existingSubType,
        oldLanguage: omniscript[this.getFieldKey('Language__c')],
        newType: newType,
        newSubType: newSubType,
        newLanguage: newLanguage,
      };
      result.nameMapping = nameMapping;
    }

    return result;
  }

  private updateStorageForOmniscriptAssessment(osAssessmentInfo: OSAssessmentInfo[]): void {
    if (osAssessmentInfo === undefined || osAssessmentInfo === null) {
      Logger.error(this.messages.getMessage('missingInfo'));
      return;
    }

    let storage: MigrationStorage = StorageUtil.getOmnistudioAssessmentStorage();
    Logger.logVerbose(this.messages.getMessage('updatingStorageForOmniscipt', ['Assessment']));

    for (let currentOsRecordInfo of osAssessmentInfo) {
      try {
        let nameMapping = currentOsRecordInfo.nameMapping as OmniscriptNameMapping;

        if (nameMapping === undefined) {
          Logger.logVerbose(this.messages.getMessage('nameMappingUndefined'));
          continue;
        }

        let value: OmniScriptStorage = {
          type: nameMapping.newType,
          subtype: nameMapping.newSubType,
          language: nameMapping.newLanguage,
          isDuplicate: false,
        };

        if (currentOsRecordInfo.errors && currentOsRecordInfo.errors.length > 0) {
          value.error = currentOsRecordInfo.errors;
          value.migrationSuccess = false;
        } else {
          value.migrationSuccess = true;
        }

        let finalKey = `${nameMapping.oldType}${nameMapping.oldSubtype}${this.cleanLanguageName(
          nameMapping.oldLanguage
        )}`;

        finalKey = finalKey.toLowerCase();
        if (storage.osStorage.has(finalKey)) {
          // Key already exists - handle accordingly
          Logger.logVerbose(this.messages.getMessage('keyAlreadyInStorage', ['Omniscript', finalKey]));
          value.isDuplicate = true;
          storage.osStorage.set(finalKey, value);
        } else {
          // Key doesn't exist - safe to set
          storage.osStorage.set(finalKey, value);
        }
      } catch (error) {
        Logger.error(error);
      }
    }

    StorageUtil.printAssessmentStorage();
  }

  private cleanLanguageName(language: string): string {
    // replace -, ( and ) and space with ''
    return language.replace(/[-() ]/g, '');
  }

  async migrate(): Promise<MigrationResult[]> {
    // Get All Records from OmniScript__c (IP & OS Parent Records)
    const omniscripts = await this.getAllOmniScripts();

    const functionDefinitionMetadata = await getAllFunctionMetadata(this.namespace, this.connection);
    populateRegexForFunctionMetadata(functionDefinitionMetadata);

    const duplicatedNames = new Set<string>();

    // Variables to be returned After Migration
    let originalOsRecords = new Map<string, any>();
    let osUploadInfo = new Map<string, UploadRecordResult>();
    const exportComponentType = this.getName() as ComponentType;
    Logger.log(this.messages.getMessage('foundOmniScriptsToMigrate', [omniscripts.length, exportComponentType]));
    const progressBarType = exportComponentType;
    const progressBar = createProgressBar('Migrating', progressBarType);
    let progressCounter = 0;
    progressBar.start(omniscripts.length, progressCounter);

    let foundAngularBasedOmniScripts = false;
    const angularWarningMessage = this.messages.getMessage('angularOmniscriptWarningMessage');
    for (let omniscript of omniscripts) {
      const mappedRecords = [];
      // const originalRecords = new Map<string, AnyJson>();
      const recordId = omniscript['Id'];
      const isOsActive = omniscript[this.getFieldKey('IsActive__c')];

      progressBar.update(++progressCounter);

      // Create a map of the original OmniScript__c records
      originalOsRecords.set(recordId, omniscript);

      // Check if this is an Angular OmniScript that should be skipped
      const omniProcessType = omniscript[this.getFieldKey('IsProcedure__c')] ? 'Integration Procedure' : 'OmniScript';
      if (omniProcessType === 'OmniScript') {
        const type = omniscript[this.getFieldKey('IsLwcEnabled__c')] ? 'LWC' : 'Angular';
        if (type === 'Angular') {
          // Skip Angular OmniScripts and add a warning record

          const skippedResponse: UploadRecordResult = {
            referenceId: recordId,
            id: '',
            success: false,
            hasErrors: false,
            errors: [],
            warnings: [angularWarningMessage],
            newName: '',
            skipped: true,
          };
          osUploadInfo.set(recordId, skippedResponse);
          foundAngularBasedOmniScripts = true;
          continue;
        }
      }

      // Record is Active, Elements can't be Added, Modified or Deleted for that OS/IP
      omniscript[this.getFieldKey('IsActive__c')] = false;

      // Get All elements for each OmniScript__c record(i.e IP/OS)
      const elements = await this.getAllElementsForOmniScript(recordId);

      // Check for duplicate element names within the same OmniScript
      const elementNames = new Set<string>();
      const duplicateElementNames = new Set<string>();

      for (const elem of elements) {
        const elemName = elem['Name'];
        if (elementNames.has(elemName)) {
          duplicateElementNames.add(elemName);
        } else {
          elementNames.add(elemName);
        }
      }

      // If duplicate element names found, skip this OmniScript
      if (duplicateElementNames.size > 0) {
        const duplicateNamesList = Array.from(duplicateElementNames).join(', ');
        const skippedResponse: UploadRecordResult = {
          referenceId: recordId,
          id: '',
          success: false,
          hasErrors: false,
          errors: [],
          warnings: [this.messages.getMessage('invalidOrRepeatingOmniscriptElementNames', [duplicateNamesList])],
          newName: '',
          skipped: true,
        };
        osUploadInfo.set(recordId, skippedResponse);
        originalOsRecords.set(recordId, omniscript);
        continue;
      }

      if (omniscript[this.getFieldKey('IsProcedure__c')] === true) {
        // Check for missing mandatory fields for Integration Procedures
        const existingType = omniscript[this.getFieldKey('Type__c')];
        const existingSubType = omniscript[this.getFieldKey('SubType__c')];

        if (!existingType || existingType.trim() === '') {
          const skippedResponse: UploadRecordResult = {
            referenceId: recordId,
            id: '',
            success: false,
            hasErrors: true,
            errors: [this.messages.getMessage('missingMandatoryField', ['Type', 'Integration Procedure'])],
            warnings: [],
            newName: '',
            skipped: true,
          };
          osUploadInfo.set(recordId, skippedResponse);
          originalOsRecords.set(recordId, omniscript);
          continue;
        }

        if (!existingSubType || existingSubType.trim() === '') {
          const skippedResponse: UploadRecordResult = {
            referenceId: recordId,
            id: '',
            success: false,
            hasErrors: true,
            errors: [this.messages.getMessage('missingMandatoryField', ['SubType', 'Integration Procedure'])],
            warnings: [],
            newName: '',
            skipped: true,
          };
          osUploadInfo.set(recordId, skippedResponse);
          originalOsRecords.set(recordId, omniscript);
          continue;
        }

        // Check for reserved keys in PropertySet for Integration Procedures
        const foundReservedKeys = new Set<string>();

        // do the formula replacement from custom to standard notation
        if (functionDefinitionMetadata.length > 0 && elements.length > 0) {
          for (let ipElement of elements) {
            if (ipElement[this.getFieldKey('PropertySet__c')] != null) {
              // Check for reserved keys while processing the PropertySet
              const propertySet = JSON.parse(ipElement[this.getFieldKey('PropertySet__c')] || '{}');
              this.collectReservedKeys(propertySet, foundReservedKeys);

              var originalString = ipElement[this.getFieldKey('PropertySet__c')];
              try {
                originalString = getReplacedString(
                  this.namespacePrefix,
                  ipElement[this.getFieldKey('PropertySet__c')],
                  functionDefinitionMetadata
                );
                ipElement[this.getFieldKey('PropertySet__c')] = originalString;
              } catch (ex) {
                Logger.error('Error processing formula for integration procedure', ex);
                Logger.logVerbose(
                  this.messages.getMessage('formulaSyntaxError', [ipElement[this.getFieldKey('PropertySet__c')]])
                );
              }
            }
          }
        }

        // If reserved keys found, skip this IP
        if (foundReservedKeys.size > 0) {
          const reservedKeysList = Array.from(foundReservedKeys).join(', ');
          const skippedResponse: UploadRecordResult = {
            referenceId: recordId,
            id: '',
            success: false,
            hasErrors: false,
            errors: [],
            warnings: [this.messages.getMessage('reservedKeysFoundInPropertySet', [reservedKeysList])],
            newName: '',
            skipped: true,
          };
          osUploadInfo.set(recordId, skippedResponse);
          originalOsRecords.set(recordId, omniscript);
          continue;
        }
      }

      let mappedOmniScript: AnyJson = {};
      // Perform the transformation for OS/IP Parent Record from OmniScript__c
      mappedOmniScript = this.mapOmniScriptRecord(omniscript);

      // Clean type, subtype
      mappedOmniScript[OmniScriptMappings.Type__c] = this.cleanName(mappedOmniScript[OmniScriptMappings.Type__c]);
      mappedOmniScript[OmniScriptMappings.SubType__c] = this.cleanName(mappedOmniScript[OmniScriptMappings.SubType__c]);

      // Check if Type or SubType becomes empty after cleaning for Integration Procedures
      if (omniscript[this.getFieldKey('IsProcedure__c')]) {
        const originalType = omniscript[this.getFieldKey('Type__c')];
        const originalSubType = omniscript[this.getFieldKey('SubType__c')];

        if (
          !mappedOmniScript[OmniScriptMappings.Type__c] ||
          mappedOmniScript[OmniScriptMappings.Type__c].trim() === ''
        ) {
          const skippedResponse: UploadRecordResult = {
            referenceId: recordId,
            id: '',
            success: false,
            hasErrors: true,
            errors: [this.messages.getMessage('integrationProcedureTypeEmptyAfterCleaning', [originalType])],
            warnings: [],
            newName: '',
            skipped: true,
          };
          osUploadInfo.set(recordId, skippedResponse);
          originalOsRecords.set(recordId, omniscript);
          continue;
        }

        if (
          !mappedOmniScript[OmniScriptMappings.SubType__c] ||
          mappedOmniScript[OmniScriptMappings.SubType__c].trim() === ''
        ) {
          const skippedResponse: UploadRecordResult = {
            referenceId: recordId,
            id: '',
            success: false,
            hasErrors: true,
            errors: [this.messages.getMessage('integrationProcedureSubtypeEmptyAfterCleaning', [originalSubType])],
            warnings: [],
            newName: '',
            skipped: true,
          };
          osUploadInfo.set(recordId, skippedResponse);
          originalOsRecords.set(recordId, omniscript);
          continue;
        }
      }

      // Check duplicated name
      let mappedOsName;
      if (this.allVersions) {
        mappedOmniScript[OmniScriptMappings.Version__c] = omniscript[this.getFieldKey('Version__c')];
        mappedOsName =
          mappedOmniScript[OmniScriptMappings.Type__c] +
          '_' +
          mappedOmniScript[OmniScriptMappings.SubType__c] +
          (mappedOmniScript[OmniScriptMappings.Language__c]
            ? '_' + mappedOmniScript[OmniScriptMappings.Language__c]
            : '') +
          '_' +
          mappedOmniScript[OmniScriptMappings.Version__c];
      } else {
        mappedOsName =
          mappedOmniScript[OmniScriptMappings.Type__c] +
          '_' +
          mappedOmniScript[OmniScriptMappings.SubType__c] +
          (mappedOmniScript[OmniScriptMappings.Language__c]
            ? '_' + mappedOmniScript[OmniScriptMappings.Language__c]
            : '') +
          '_1';
      }

      if (duplicatedNames.has(mappedOsName)) {
        originalOsRecords.set(recordId, omniscript);
        const warningMessage = this.messages.getMessage('duplicatedOSName', [this.getName(true), mappedOsName]);
        const skippedResponse: UploadRecordResult = {
          referenceId: recordId,
          id: '',
          success: false,
          hasErrors: false,
          errors: [],
          warnings: [warningMessage],
          newName: '',
          skipped: true,
        };
        osUploadInfo.set(recordId, skippedResponse);
        continue;
      }

      // Save the mapped record
      duplicatedNames.add(mappedOsName);
      mappedRecords.push(mappedOmniScript);

      // Save the OmniScript__c records to Standard BPO i.e OmniProcess
      let osUploadResponse;
      if (!this.IS_STANDARD_DATA_MODEL) {
        osUploadResponse = await NetUtils.createOne(
          this.connection,
          OmniScriptMigrationTool.OMNIPROCESS_NAME,
          recordId,
          mappedOmniScript
        );
      } else {
        let standardRecordId = mappedOmniScript['Id'];
        delete mappedOmniScript['Id'];
        osUploadResponse = await NetUtils.updateOne(
          this.connection,
          OmniScriptMigrationTool.OMNIPROCESS_NAME,
          recordId,
          recordId,
          mappedOmniScript
        );
        osUploadResponse['id'] = standardRecordId;
      }

      if (!osUploadResponse?.success) {
        osUploadResponse.errors = Array.isArray(osUploadResponse.errors)
          ? osUploadResponse.errors
          : [osUploadResponse.errors];

        osUploadInfo.set(recordId, osUploadResponse);
        continue;
      }

      if (osUploadResponse?.success) {
        // Fix errors

        osUploadResponse.warnings = osUploadResponse.warnings || [];
        osUploadResponse.type = mappedOmniScript[OmniScriptMappings.Type__c];
        osUploadResponse.subtype = mappedOmniScript[OmniScriptMappings.SubType__c];
        osUploadResponse.language = mappedOmniScript[OmniScriptMappings.Language__c];

        let originalOsName: string;
        if (this.allVersions) {
          originalOsName =
            omniscript[this.getFieldKey('Type__c')] +
            '_' +
            omniscript[this.getFieldKey('SubType__c')] +
            '_' +
            omniscript[this.getFieldKey('Language__c')] +
            '_' +
            (omniscript[this.getFieldKey('Version__c')] || '1');
        } else {
          originalOsName =
            omniscript[this.getFieldKey('Type__c')] +
            '_' +
            omniscript[this.getFieldKey('SubType__c')] +
            '_' +
            omniscript[this.getFieldKey('Language__c')] +
            '_1';
        }
        // Always set the new name to show the migrated name
        osUploadResponse.newName = mappedOsName;

        // Only add warning if the name was actually modified
        if (originalOsName !== mappedOsName) {
          osUploadResponse.warnings.unshift(
            `${this.getName(true)} name has been modified to fit naming rules: ${mappedOsName}`
          );
        }

        try {
          // Upload All elements for each OmniScript__c record(i.e IP/OS)
          await this.uploadAllElements(osUploadResponse, elements);

          // Get OmniScript Compiled Definitions for OmniScript Record
          const omniscriptsCompiledDefinitions = await this.getOmniScriptCompiledDefinition(recordId);

          // Upload OmniScript Compiled Definition to OmniProcessCompilation
          await this.uploadAllOmniScriptDefinitions(osUploadResponse, omniscriptsCompiledDefinitions);

          if (isOsActive) {
            // Update the inserted OS record as it was Active and made InActive to insert.
            mappedRecords[0].IsActive = true;
            mappedRecords[0].Id = osUploadResponse.id;

            if (mappedRecords[0].IsIntegrationProcedure) {
              mappedRecords[0].Language = 'Procedure';
            }

            const updateResult = await NetUtils.updateOne(
              this.connection,
              OmniScriptMigrationTool.OMNIPROCESS_NAME,
              recordId,
              osUploadResponse.id,
              {
                [OmniScriptMappings.IsActive__c]: true,
              }
            );

            if (!updateResult.success) {
              osUploadResponse.hasErrors = true;
              osUploadResponse.errors = osUploadResponse.errors || [];

              osUploadResponse.errors.push(
                this.messages.getMessage('errorWhileActivatingOs', [this.getName(true)]) + updateResult.errors
              );
            }
          }
        } catch (e) {
          osUploadResponse.hasErrors = true;
          osUploadResponse.errors = osUploadResponse.errors || [];

          let error = 'UNKNOWN';
          if (typeof e === 'object') {
            try {
              const obj = JSON.parse(e.message || '{}');
              if (obj.hasErrors && obj.results && Array.isArray(obj.results)) {
                error = obj.results
                  .map((r) => {
                    return Array.isArray(r.errors) ? r.errors.map((e) => e.message).join('. ') : r.errors;
                  })
                  .join('. ');
              }
            } catch {
              error = e.toString();
            }
          }

          osUploadResponse.errors.push(
            this.messages.getMessage('errorWhileCreatingElements', [this.getName(true)]) + error
          );
        } finally {
          // Create the return records and response which have been processed
          osUploadInfo.set(recordId, osUploadResponse);
        }
      }

      originalOsRecords.set(recordId, omniscript);
    }
    progressBar.stop();

    if (foundAngularBasedOmniScripts) {
      Logger.warn(angularWarningMessage);
    }
    this.updateStorageForOmniscript(osUploadInfo, originalOsRecords);

    const objectMigrationResults: MigrationResult[] = [];

    if (this.exportType === OmniScriptExportType.All || this.exportType === OmniScriptExportType.IP) {
      objectMigrationResults.push(
        this.getMigratedRecordsByType('Integration Procedures', osUploadInfo, originalOsRecords)
      );
    }
    if (this.exportType === OmniScriptExportType.All || this.exportType === OmniScriptExportType.OS) {
      objectMigrationResults.push(this.getMigratedRecordsByType('Omniscripts', osUploadInfo, originalOsRecords));
    }

    return objectMigrationResults;
  }

  // Using this small method, As IP & OS lives in same object -> So returning the IP and OS in the end, after the migration is done
  // and the results are generated. Other way can be creating a separate IP class and migrating IP & OS separately
  // using common functions
  private getMigratedRecordsByType(
    type: string,
    results: Map<string, UploadRecordResult>,
    records: Map<string, any>
  ): MigrationResult {
    let recordMap: Map<string, any> = new Map<string, any>();
    let resultMap: Map<string, any> = new Map<string, any>();
    for (let record of Array.from(records.values())) {
      if (
        (type === 'Integration Procedures' && record[this.getFieldKey('IsProcedure__c')]) ||
        (type === 'Omniscripts' && !record[this.getFieldKey('IsProcedure__c')])
      ) {
        recordMap.set(record['Id'], records.get(record['Id']));
        if (results.get(record['Id'])) {
          resultMap.set(record['Id'], results.get(record['Id']));
        }
      }
    }
    return {
      name: type,
      records: recordMap,
      results: resultMap,
    };
  }

  private updateStorageForOmniscript(
    osUploadInfo: Map<string, UploadRecordResult>,
    originalOsRecords: Map<string, any>
  ) {
    let storage: MigrationStorage = StorageUtil.getOmnistudioMigrationStorage();
    Logger.logVerbose(this.messages.getMessage('updatingStorageForOmniscipt', ['Migration']));
    for (let key of Array.from(originalOsRecords.keys())) {
      try {
        let oldrecord = originalOsRecords.get(key);
        let newrecord = osUploadInfo.get(key);

        if (!oldrecord[this.getFieldKey('IsProcedure__c')]) {
          let value: OmniScriptStorage = {
            type: newrecord['type'],
            subtype: newrecord['subtype'],
            language: newrecord['language'],
            isDuplicate: false,
          };

          // New record can be undefined
          if (newrecord === undefined) {
            value.migrationSuccess = false;
          } else {
            if (newrecord.hasErrors) {
              value.error = newrecord.errors;
              value.migrationSuccess = false;
            } else {
              value.migrationSuccess = true;
            }
          }

          let finalKey = `${oldrecord[this.getFieldKey('Type__c')]}${
            oldrecord[this.getFieldKey('SubType__c')]
          }${this.cleanLanguageName(oldrecord[this.getFieldKey('Language__c')])}`;

          finalKey = finalKey.toLowerCase();
          if (storage.osStorage.has(finalKey)) {
            // Key already exists - handle accordingly
            Logger.logVerbose(this.messages.getMessage('keyAlreadyInStorage', ['Omniscript', finalKey]));
            value.isDuplicate = true;
            storage.osStorage.set(finalKey, value);
          } else {
            // Key doesn't exist - safe to set
            storage.osStorage.set(finalKey, value);
          }
        }
      } catch (error) {
        Logger.logVerbose(error);
      }
    }
    StorageUtil.printMigrationStorage();
  }

  // Get All OmniScript__c records i.e All IP & OS
  private async getAllOmniScripts(): Promise<AnyJson[]> {
    //DebugTimer.getInstance().lap('Query OmniScripts');
    Logger.info(this.messages.getMessage('allVersionsInfo', [this.allVersions]));
    const filters = new Map<string, any>();

    if (this.exportType === OmniScriptExportType.IP) {
      filters.set(this.getFieldKey('IsProcedure__c'), true);
    } else if (this.exportType === OmniScriptExportType.OS) {
      filters.set(this.getFieldKey('IsProcedure__c'), false);
    }

    if (this.allVersions) {
      const sortFields = [
        { field: this.getFieldKey('Type__c'), direction: SortDirection.ASC },
        { field: this.getFieldKey('SubType__c'), direction: SortDirection.ASC },
        { field: this.getFieldKey('Version__c'), direction: SortDirection.ASC },
      ];
      return await QueryTools.queryWithFilterAndSort(
        this.connection,
        this.getQueryNamespace(),
        this.getOmniscriptObjectName(),
        this.getOmniScriptFields(),
        filters,
        sortFields
      ).catch((err) => {
        if (err.errorCode === 'INVALID_TYPE') {
          throw new InvalidEntityTypeError(
            `${OmniScriptMigrationTool.OMNISCRIPT_NAME} type is not found under this namespace`
          );
        }
        throw err;
      });
    } else {
      filters.set(this.getFieldKey('IsActive__c'), true);
      return await QueryTools.queryWithFilter(
        this.connection,
        this.getQueryNamespace(),
        this.getOmniscriptObjectName(),
        this.getOmniScriptFields(),
        filters
      ).catch((err) => {
        if (err.errorCode === 'INVALID_TYPE') {
          throw new InvalidEntityTypeError(`${this.getOmniscriptObjectName()} type is not found under this namespace`);
        }
        throw err;
      });
    }
  }

  // Get All Elements w.r.t OmniScript__c i.e Elements tagged to passed in IP/OS
  private async getAllElementsForOmniScript(recordId: string): Promise<AnyJson[]> {
    // Query all Elements for an OmniScript
    const filters = new Map<string, any>();
    this.IS_STANDARD_DATA_MODEL
      ? filters.set('OmniProcessId', recordId)
      : filters.set(this.namespacePrefix + 'OmniScriptId__c', recordId);

    // const queryFilterStr = ` Where ${this.namespacePrefix}OmniScriptId__c = '${omniScriptData.keys().next().value}'`;
    return await QueryTools.queryWithFilter(
      this.connection,
      this.getQueryNamespace(),
      this.getElementObjectName(),
      this.getElementFields(),
      filters
    );
  }

  // Get All Compiled Definitions w.r.t OmniScript__c i.e Definitions tagged to passed in IP/OS
  private async getOmniScriptCompiledDefinition(recordId: string): Promise<AnyJson[]> {
    // Query all Definitions for an OmniScript
    const filters = new Map<string, any>();
    this.IS_STANDARD_DATA_MODEL
      ? filters.set('OmniProcessId', recordId)
      : filters.set(this.namespacePrefix + 'OmniScriptId__c', recordId);

    // const queryFilterStr = ` Where ${this.namespacePrefix}OmniScriptId__c = '${omniScriptData.keys().next().value}'`;
    return await QueryTools.queryWithFilter(
      this.connection,
      this.getQueryNamespace(),
      this.getOmniScriptCompiledDefinitionObjectName(),
      this.getOmniScriptDefinitionFields(),
      filters
    );
  }

  // Upload All the Elements tagged to a OmniScript__c record, after the parent record has been inserted
  private async uploadAllElements(
    omniScriptUploadResults: UploadRecordResult,
    elements: AnyJson[]
  ): Promise<Map<string, UploadRecordResult>> {
    let levelCount = 0; // To define and insert different levels(Parent-Child relationship) at a time
    let exit = false; // Counter variable to exit after all parent-child elements inserted
    var elementsUploadInfo = new Map<string, UploadRecordResult>(); // Info for Uploaded Elements to be returned

    do {
      let tempElements = []; // Stores Elements at a same level starting with levelCount = 0 level (parent elements)
      for (let element of elements) {
        if (element[this.getElementFieldKey('Level__c')] === levelCount) {
          let elementId = element['Id'];
          let elementParentId = element[this.getElementFieldKey('ParentElementId__c')];
          if (
            !elementsUploadInfo.has(elementId) &&
            (!elementParentId || (elementParentId && elementsUploadInfo.has(elementParentId)))
          ) {
            tempElements.push(element);
          }
        }
      }

      // If no elements exist after a certain level, Then everything is alraedy processed, otherwise upload
      if (tempElements.length === 0) {
        exit = true;
      } else {
        // Get Transformed Element__c to OmniProcessElement with updated OmniScriptId & ParentElementId
        let elementsTransformedData = await this.prepareElementsData(
          omniScriptUploadResults,
          tempElements,
          elementsUploadInfo
        );
        let elementsUploadResponse = new Map<string, UploadRecordResult>();

        if (!this.IS_STANDARD_DATA_MODEL) {
          // Upload the transformed Element__c
          elementsUploadResponse = await this.uploadTransformedData(
            OmniScriptMigrationTool.OMNIPROCESSELEMENT_NAME,
            elementsTransformedData
          );
        } else {
          for (let elementRecord of elementsTransformedData.mappedRecords) {
            let standardElementId = elementRecord['Id'];
            let standardOmniProcessId = elementRecord['OmniProcessId'];

            delete elementRecord['Id'];
            delete elementRecord['OmniProcessId'];
            let response: UploadRecordResult = await NetUtils.updateOne(
              this.connection,
              OmniScriptMigrationTool.OMNIPROCESSELEMENT_NAME,
              standardElementId,
              standardElementId,
              elementRecord
            );

            elementRecord['Id'] = standardElementId;
            elementRecord['OmniProcessId'] = standardOmniProcessId;
            elementsUploadResponse.set(standardElementId, response);
          }
        }
        // Keep appending upload Info for Elements at each level
        elementsUploadInfo = new Map([
          ...Array.from(elementsUploadInfo.entries()),
          ...Array.from(elementsUploadResponse.entries()),
        ]);
      }

      levelCount++;
    } while (exit === false);

    return elementsUploadInfo;
  }

  // Upload All the Definitions tagged to a OmniScript__c record, after the parent record has been inserted
  private async uploadAllOmniScriptDefinitions(
    omniScriptUploadResults: UploadRecordResult,
    osDefinitions: AnyJson[]
  ): Promise<Map<string, UploadRecordResult>> {
    let osDefinitionsData = await this.prepareOsDefinitionsData(omniScriptUploadResults, osDefinitions);
    if (!this.IS_STANDARD_DATA_MODEL) {
      return await this.uploadTransformedData(OmniScriptMigrationTool.OMNIPROCESSCOMPILATION_NAME, osDefinitionsData);
    } else {
      for (let osDefinitionRecord of osDefinitionsData.mappedRecords) {
        let standardOsDefintionId = osDefinitionRecord['Id'];
        let standardOmniProcessId = osDefinitionRecord['OmniProcessId'];
        delete osDefinitionRecord['Id'];
        delete osDefinitionRecord['OmniProcessId'];

        let osUploadResponse = await NetUtils.updateOne(
          this.connection,
          OmniScriptMigrationTool.OMNIPROCESSCOMPILATION_NAME,
          standardOsDefintionId,
          standardOsDefintionId,
          osDefinitionRecord
        );

        osUploadResponse['Id'] = standardOsDefintionId;
        osUploadResponse['OmniProcessId'] = standardOmniProcessId;
      }
    }
  }

  // Prepare Elements Data and Do the neccessary updates, transformation, validations etc.
  private async prepareElementsData(
    osUploadResult: UploadRecordResult,
    elements: AnyJson[],
    parentElementUploadResponse: Map<string, UploadRecordResult>
  ): Promise<TransformData> {
    const mappedRecords = [],
      originalRecords = new Map<string, AnyJson>(),
      invalidIpNames = new Map<String, String>();

    elements.forEach((element) => {
      // Perform the transformation. We need parent record & must have been migrated before
      if (osUploadResult.id) {
        mappedRecords.push(
          this.mapElementData(element, osUploadResult.id, parentElementUploadResponse, invalidIpNames)
        );
      }

      // Create a map of the original records
      originalRecords.set(element['Id'], element);
    });

    if (osUploadResult.id && invalidIpNames.size > 0) {
      const val = Array.from(invalidIpNames.entries())
        .map((e) => e[0])
        .join(', ');
      osUploadResult.errors.push('Integration Procedure Actions will need manual updates, please verify: ' + val);
    }

    return { originalRecords, mappedRecords };
  }

  // Prepare OmniScript Definitions to be uploaded
  private async prepareOsDefinitionsData(
    osUploadResult: UploadRecordResult,
    osDefinitions: AnyJson[]
  ): Promise<TransformData> {
    const mappedRecords = [],
      originalRecords = new Map<string, AnyJson>();

    osDefinitions.forEach((osDefinition) => {
      // Perform the transformation. We need parent record & must have been migrated before
      if (osUploadResult.id) {
        mappedRecords.push(this.mapOsDefinitionsData(osDefinition, osUploadResult.id));
      }

      // Create a map of the original records
      originalRecords.set(osDefinition['Id'], osDefinition);
    });

    return { originalRecords, mappedRecords };
  }

  /**
   * Maps an omniscript__c record to OmniProcess Record.
   * @param omniScriptRecord
   * @returns
   */
  private mapOmniScriptRecord(omniScriptRecord: AnyJson): AnyJson {
    // Transformed object
    let mappedObject = {};

    if (!this.IS_STANDARD_DATA_MODEL) {
      // Get the fields of the record
      const recordFields = Object.keys(omniScriptRecord);

      // Map individual fields
      recordFields.forEach((recordField) => {
        const cleanFieldName = this.getCleanFieldName(recordField);

        if (OmniScriptMappings.hasOwnProperty(cleanFieldName)) {
          mappedObject[OmniScriptMappings[cleanFieldName]] = omniScriptRecord[recordField];
        }
      });
    } else {
      mappedObject = { ...(omniScriptRecord as Object) };
    }

    mappedObject['Name'] = this.cleanName(mappedObject['Name']);

    // BATCH framework requires that each record has an "attributes" property
    mappedObject['attributes'] = {
      type: OmniScriptMigrationTool.OMNIPROCESS_NAME,
      referenceId: omniScriptRecord['Id'],
    };

    return mappedObject;
  }

  // Maps an individual Element into an OmniProcessElement record
  private mapElementData(
    elementRecord: AnyJson,
    omniProcessId: string,
    parentElementUploadResponse: Map<String, UploadRecordResult>,
    invalidIpReferences: Map<String, String>
  ) {
    // Transformed object
    let mappedObject = {};

    if (!this.IS_STANDARD_DATA_MODEL) {
      // Get the fields of the record
      const recordFields = Object.keys(elementRecord);

      // Map individual fields
      recordFields.forEach((recordField) => {
        const cleanFieldName = this.getCleanFieldName(recordField);

        if (ElementMappings.hasOwnProperty(cleanFieldName)) {
          mappedObject[ElementMappings[cleanFieldName]] = elementRecord[recordField];

          if (
            cleanFieldName === 'ParentElementId__c' &&
            parentElementUploadResponse.has(elementRecord[`${this.namespacePrefix}ParentElementId__c`])
          ) {
            mappedObject[ElementMappings[cleanFieldName]] = parentElementUploadResponse.get(
              elementRecord[`${this.namespacePrefix}ParentElementId__c`]
            ).id;
          }
        }
      });

      // Set the parent/child relationship
      mappedObject['OmniProcessId'] = omniProcessId;
    } else {
      mappedObject = { ...(elementRecord as Object) };
    }

    // We need to fix the child references
    const elementType = mappedObject[ElementMappings.Type__c];
    const propertySet = JSON.parse(mappedObject[ElementMappings.PropertySet__c] || '{}');

    // Use NameMappingRegistry to update all dependency references
    const updatedPropertySet = this.nameRegistry.updateDependencyReferences(propertySet);

    switch (elementType) {
      case 'OmniScript':
        // Use registry for OmniScript references with explicit fallback
        const osType = propertySet['Type'] || '';
        const osSubType = propertySet['Sub Type'] || '';
        const osLanguage = propertySet['Language'] || 'English';

        // Construct full OmniScript name to check registry
        const fullOmniScriptName = `${osType}_${osSubType}_${osLanguage}`;

        if (this.nameRegistry.isAngularOmniScript(fullOmniScriptName)) {
          // Referenced OmniScript is Angular - add warning and keep original reference
          Logger.logVerbose(
            `\n${this.messages.getMessage('angularOmniScriptDependencyWarning', [
              'OmniScript element',
              fullOmniScriptName,
            ])}`
          );
          // Keep original reference as-is since Angular OmniScript won't be migrated
          updatedPropertySet['Type'] = osType;
          updatedPropertySet['Sub Type'] = osSubType;
          updatedPropertySet['Language'] = osLanguage;
        } else if (this.nameRegistry.hasOmniScriptMapping(fullOmniScriptName)) {
          // Registry has mapping for this LWC OmniScript - extract cleaned parts
          const cleanedFullName = this.nameRegistry.getCleanedName(fullOmniScriptName, 'OmniScript');
          const parts = cleanedFullName.split('_');

          if (parts.length >= 2) {
            updatedPropertySet['Type'] = parts[0];
            updatedPropertySet['Sub Type'] = parts[1];
            // Language doesn't typically change, but update if provided
            if (parts.length >= 3) {
              updatedPropertySet['Language'] = parts[2];
            }
          }
        } else {
          // No registry mapping - use original fallback approach
          Logger.logVerbose(
            `\n${this.messages.getMessage('componentMappingNotFound', ['OmniScript', fullOmniScriptName])}`
          );
          updatedPropertySet['Type'] = this.cleanName(osType);
          updatedPropertySet['Sub Type'] = this.cleanName(osSubType);
        }
        break;
      case 'Integration Procedure Action':
        const remoteOptions = updatedPropertySet['remoteOptions'] || {};
        // Use registry for DataMapper references with explicit fallback
        const preTransformBundle = propertySet['remoteOptions']?.['preTransformBundle'];
        if (preTransformBundle) {
          if (this.nameRegistry.hasDataMapperMapping(preTransformBundle)) {
            remoteOptions['preTransformBundle'] = this.nameRegistry.getDataMapperCleanedName(preTransformBundle);
          } else {
            Logger.logVerbose(
              `\n${this.messages.getMessage('componentMappingNotFound', ['DataMapper', preTransformBundle])}`
            );
            remoteOptions['preTransformBundle'] = this.cleanName(preTransformBundle);
          }
        }

        const postTransformBundle = propertySet['remoteOptions']?.['postTransformBundle'];
        if (postTransformBundle) {
          if (this.nameRegistry.hasDataMapperMapping(postTransformBundle)) {
            remoteOptions['postTransformBundle'] = this.nameRegistry.getDataMapperCleanedName(postTransformBundle);
          } else {
            Logger.logVerbose(
              `\n${this.messages.getMessage('componentMappingNotFound', ['DataMapper', postTransformBundle])}`
            );
            remoteOptions['postTransformBundle'] = this.cleanName(postTransformBundle);
          }
        }
        updatedPropertySet['remoteOptions'] = remoteOptions;

        const preBundle = propertySet['preTransformBundle'];
        if (preBundle) {
          if (this.nameRegistry.hasDataMapperMapping(preBundle)) {
            updatedPropertySet['preTransformBundle'] = this.nameRegistry.getDataMapperCleanedName(preBundle);
          } else {
            Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['DataMapper', preBundle])}`);
            updatedPropertySet['preTransformBundle'] = this.cleanName(preBundle);
          }
        }

        const postBundle = propertySet['postTransformBundle'];
        if (postBundle) {
          if (this.nameRegistry.hasDataMapperMapping(postBundle)) {
            updatedPropertySet['postTransformBundle'] = this.nameRegistry.getDataMapperCleanedName(postBundle);
          } else {
            Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['DataMapper', postBundle])}`);
            updatedPropertySet['postTransformBundle'] = this.cleanName(postBundle);
          }
        }

        // Use registry for Integration Procedure references
        const key: String = propertySet['integrationProcedureKey'] || '';
        if (key) {
          const hasRegistryMapping = this.nameRegistry.hasIntegrationProcedureMapping(key as string);
          if (hasRegistryMapping) {
            const cleanedIpName = this.nameRegistry.getIntegrationProcedureCleanedName(key as string);
            updatedPropertySet['integrationProcedureKey'] = cleanedIpName;
          } else {
            Logger.logVerbose(
              `\n${this.messages.getMessage('componentMappingNotFound', ['IntegrationProcedure', key as string])}`
            );
            const parts = key.split('_');
            const newKey = parts.map((p) => this.cleanName(p, true)).join('_');
            if (parts.length > 2) {
              invalidIpReferences.set(mappedObject[ElementMappings.Name], key);
            }
            updatedPropertySet['integrationProcedureKey'] = newKey;
          }
        }
        break;
      case 'DataRaptor Turbo Action':
      case 'DataRaptor Transform Action':
      case 'DataRaptor Post Action':
      case 'DataRaptor Extract Action':
        // Use registry for DataMapper references with explicit fallback
        const bundleName = propertySet['bundle'];
        if (bundleName) {
          if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
            updatedPropertySet['bundle'] = this.nameRegistry.getDataMapperCleanedName(bundleName);
          } else {
            Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['DataMapper', bundleName])}`);
            updatedPropertySet['bundle'] = this.cleanName(bundleName);
          }
        }
        break;
    }

    mappedObject[ElementMappings.PropertySet__c] = JSON.stringify(updatedPropertySet);

    // BATCH framework requires that each record has an "attributes" property
    mappedObject['attributes'] = {
      type: OmniScriptMigrationTool.OMNIPROCESSELEMENT_NAME,
      referenceId: elementRecord['Id'],
    };

    return mappedObject;
  }

  // Maps an individual Definition into an OmniProcessCompilation record
  private mapOsDefinitionsData(osDefinition: AnyJson, omniProcessId: string) {
    // Transformed object
    let mappedObject = {};

    if (!this.IS_STANDARD_DATA_MODEL) {
      // Get the fields of the record
      const recordFields = Object.keys(osDefinition);

      // Map individual fields
      recordFields.forEach((recordField) => {
        const cleanFieldName = this.getCleanFieldName(recordField);

        if (OmniScriptDefinitionMappings.hasOwnProperty(cleanFieldName)) {
          mappedObject[OmniScriptDefinitionMappings[cleanFieldName]] = osDefinition[recordField];
        }
      });

      // Set the parent/child relationship
      mappedObject[OmniScriptDefinitionMappings.Name] = omniProcessId;
      mappedObject[OmniScriptDefinitionMappings.OmniScriptId__c] = omniProcessId;
    } else {
      mappedObject = { ...(osDefinition as Object) };
    }

    let content = mappedObject[OmniScriptDefinitionMappings.Content__c];
    if (content) {
      try {
        content = JSON.parse(content);
        if (content && content['sOmniScriptId']) {
          content['sOmniScriptId'] = omniProcessId;
        }

        // Process the nested JSON structure to update bundle/reference names
        if (content && content['children']) {
          this.processContentChildren(content['children']);
        }

        mappedObject[OmniScriptDefinitionMappings.Content__c] = JSON.stringify(content);
      } catch (ex) {
        // Log
      }
    }

    // BATCH framework requires that each record has an "attributes" property
    mappedObject['attributes'] = {
      type: OmniScriptMigrationTool.OMNIPROCESSCOMPILATION_NAME,
      referenceId: osDefinition['Id'],
    };

    return mappedObject;
  }

  /**
   * Recursively processes children elements in the content JSON to update bundle/reference names
   * @param children Array of child elements from the content JSON
   */
  private processContentChildren(children: any[]): void {
    if (!Array.isArray(children)) {
      return;
    }

    children.forEach((child) => {
      if (child && child.type && child.propSetMap) {
        this.processContentElement(child);
      }

      // Process nested children in Step elements
      if (child && child.children && Array.isArray(child.children)) {
        child.children.forEach((nestedChild) => {
          if (nestedChild && nestedChild.eleArray && Array.isArray(nestedChild.eleArray)) {
            nestedChild.eleArray.forEach((element) => {
              if (element && element.type && element.propSetMap) {
                this.processContentElement(element);
              }
            });
          }
        });
      }
    });
  }

  /**
   * Processes individual content element to update bundle/reference names based on type
   * @param element Individual element from the content JSON
   */
  private processContentElement(element: any): void {
    const elementType = element.type;
    const propSetMap = element.propSetMap;

    if (!elementType || !propSetMap) {
      return;
    }

    switch (elementType) {
      case 'Integration Procedure Action':
        this.processIntegrationProcedureAction(propSetMap);
        break;
      case 'DataRaptor Turbo Action':
      case 'DataRaptor Transform Action':
      case 'DataRaptor Post Action':
      case 'DataRaptor Extract Action':
        this.processDataRaptorAction(propSetMap);
        break;
      case 'OmniScript':
        this.processOmniScriptAction(propSetMap);
        break;
      case 'Step':
        this.processStepAction(propSetMap);
        break;
      default:
        // Handle other element types if needed
        break;
    }
  }

  /**
   * Processes Integration Procedure Action elements to update reference names
   * @param propSetMap Property set map from the element
   */
  private processIntegrationProcedureAction(propSetMap: any): void {
    // Handle remoteOptions pre/post transform bundles
    if (propSetMap.remoteOptions) {
      if (propSetMap.remoteOptions.preTransformBundle) {
        const bundleName = propSetMap.remoteOptions.preTransformBundle;
        if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
          propSetMap.remoteOptions.preTransformBundle = this.nameRegistry.getDataMapperCleanedName(bundleName);
        } else {
          propSetMap.remoteOptions.preTransformBundle = this.cleanName(bundleName);
        }
      }

      if (propSetMap.remoteOptions.postTransformBundle) {
        const bundleName = propSetMap.remoteOptions.postTransformBundle;
        if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
          propSetMap.remoteOptions.postTransformBundle = this.nameRegistry.getDataMapperCleanedName(bundleName);
        } else {
          propSetMap.remoteOptions.postTransformBundle = this.cleanName(bundleName);
        }
      }
    }

    // Handle direct pre/post transform bundles
    if (propSetMap.preTransformBundle) {
      const bundleName = propSetMap.preTransformBundle;
      if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
        propSetMap.preTransformBundle = this.nameRegistry.getDataMapperCleanedName(bundleName);
      } else {
        propSetMap.preTransformBundle = this.cleanName(bundleName);
      }
    }

    if (propSetMap.postTransformBundle) {
      const bundleName = propSetMap.postTransformBundle;
      if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
        propSetMap.postTransformBundle = this.nameRegistry.getDataMapperCleanedName(bundleName);
      } else {
        propSetMap.postTransformBundle = this.cleanName(bundleName);
      }
    }

    // Handle integrationProcedureKey
    if (propSetMap.integrationProcedureKey) {
      const key = propSetMap.integrationProcedureKey;
      if (this.nameRegistry.hasIntegrationProcedureMapping(key)) {
        propSetMap.integrationProcedureKey = this.nameRegistry.getIntegrationProcedureCleanedName(key);
      } else {
        const parts = key.split('_');
        // Integration Procedures should have Type_SubType format (2 parts)
        if (parts.length > 2) {
          Logger.logVerbose(this.messages.getMessage('integrationProcedureInvalidUnderscoreFormat', [key]));
          return;
        }

        propSetMap.integrationProcedureKey = parts.map((p) => this.cleanName(p, true)).join('_');
      }
    }
  }

  /**
   * Processes DataRaptor Action elements to update bundle names
   * @param propSetMap Property set map from the element
   */
  private processDataRaptorAction(propSetMap: any): void {
    if (propSetMap.bundle) {
      const bundleName = propSetMap.bundle;
      if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
        propSetMap.bundle = this.nameRegistry.getDataMapperCleanedName(bundleName);
      } else {
        propSetMap.bundle = this.cleanName(bundleName);
      }
    }
  }

  /**
   * Processes OmniScript Action elements to update reference names
   * @param propSetMap Property set map from the element
   */
  private processOmniScriptAction(propSetMap: any): void {
    const osType = propSetMap['Type'] || '';
    const osSubType = propSetMap['Sub Type'] || '';
    const osLanguage = propSetMap['Language'] || 'English';

    // Construct full OmniScript name to check registry
    const fullOmniScriptName = `${osType}_${osSubType}_${osLanguage}`;

    if (this.nameRegistry.isAngularOmniScript(fullOmniScriptName)) {
      // Keep original reference as-is since Angular OmniScript won't be migrated
      return;
    } else if (this.nameRegistry.hasOmniScriptMapping(fullOmniScriptName)) {
      // Registry has mapping for this LWC OmniScript - extract cleaned parts
      const cleanedFullName = this.nameRegistry.getCleanedName(fullOmniScriptName, 'OmniScript');
      const parts = cleanedFullName.split('_');

      if (parts.length >= 2) {
        propSetMap['Type'] = parts[0];
        propSetMap['Sub Type'] = parts[1];
        // Language doesn't typically change, but update if provided
        if (parts.length >= 3) {
          propSetMap['Language'] = parts[2];
        }
      }
    } else {
      // No registry mapping - use original fallback approach
      propSetMap['Type'] = this.cleanName(osType);
      propSetMap['Sub Type'] = this.cleanName(osSubType);
    }
  }

  /**
   * Processes Step elements to update reference names
   * @param propSetMap Property set map from the element
   */
  private processStepAction(propSetMap: any): void {
    // Handle remoteOptions pre/post transform bundles if they exist in Step elements
    // Note: remoteClass and remoteMethod cleaning is not required for omniscript content step dependencies
    if (propSetMap.remoteOptions) {
      if (propSetMap.remoteOptions.preTransformBundle) {
        const bundleName = propSetMap.remoteOptions.preTransformBundle;
        if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
          propSetMap.remoteOptions.preTransformBundle = this.nameRegistry.getDataMapperCleanedName(bundleName);
        } else {
          propSetMap.remoteOptions.preTransformBundle = this.cleanName(bundleName);
        }
      }

      if (propSetMap.remoteOptions.postTransformBundle) {
        const bundleName = propSetMap.remoteOptions.postTransformBundle;
        if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
          propSetMap.remoteOptions.postTransformBundle = this.nameRegistry.getDataMapperCleanedName(bundleName);
        } else {
          propSetMap.remoteOptions.postTransformBundle = this.cleanName(bundleName);
        }
      }
    }
  }

  private getOmniScriptFields(): string[] {
    return this.IS_STANDARD_DATA_MODEL ? Object.values(OmniScriptMappings) : Object.keys(OmniScriptMappings);
  }

  private getElementFields(): string[] {
    return this.IS_STANDARD_DATA_MODEL ? Object.values(ElementMappings) : Object.keys(ElementMappings);
  }

  private getOmniScriptCompiledDefinitionObjectName(): string {
    return this.IS_STANDARD_DATA_MODEL
      ? OmniScriptMigrationTool.OMNIPROCESSCOMPILATION_NAME
      : OmniScriptMigrationTool.OMNISCRIPTDEFINITION_NAME;
  }

  private getOmniScriptDefinitionFields(): string[] {
    return this.IS_STANDARD_DATA_MODEL
      ? Object.values(OmniScriptDefinitionMappings)
      : Object.keys(OmniScriptDefinitionMappings);
  }

  /**
   * Collects reserved keys found in PropertySet tagsToValidate
   * @param propertySet - The PropertySet JSON object to validate
   * @param foundReservedKeys - Set to collect found reserved keys
   */
  private collectReservedKeys(propertySet: any, foundReservedKeys: Set<string>): void {
    // Iterate through each tag that needs validation
    for (const tagToValidate of this.tagsToValidate) {
      const tagValue = propertySet[tagToValidate];

      if (tagValue) {
        if (typeof tagValue === 'object' && tagValue !== null) {
          // If it's an object, check all its keys
          const keys = Object.keys(tagValue);
          for (const key of keys) {
            if (this.reservedKeys.has(key)) {
              foundReservedKeys.add(key);
            }
          }
        } else if (typeof tagValue === 'string') {
          // If it's a string, check if the value itself is a reserved key
          if (this.reservedKeys.has(tagValue)) {
            foundReservedKeys.add(tagValue);
          }
        }
      }
    }
  }

  private getElementFieldKey(fieldName: string): string {
    return this.IS_STANDARD_DATA_MODEL ? ElementMappings[fieldName] : this.namespacePrefix + fieldName;
  }

  private getFieldKey(fieldName: string): string {
    return this.IS_STANDARD_DATA_MODEL ? OmniScriptMappings[fieldName] : this.namespacePrefix + fieldName;
  }

  private getQueryNamespace(): string {
    return this.IS_STANDARD_DATA_MODEL ? '' : this.namespace;
  }

  getOmniscriptObjectName(): string {
    return this.IS_STANDARD_DATA_MODEL
      ? OmniScriptMigrationTool.OMNIPROCESS_NAME
      : OmniScriptMigrationTool.OMNISCRIPT_NAME;
  }

  private getElementObjectName(): string {
    return this.IS_STANDARD_DATA_MODEL
      ? OmniScriptMigrationTool.OMNIPROCESSELEMENT_NAME
      : OmniScriptMigrationTool.ELEMENT_NAME;
  }

  private sleep() {
    return new Promise((resolve) => {
      setTimeout(resolve, 5000);
    });
  }
}

export enum OmniScriptExportType {
  All,
  OS,
  IP,
}
