import OmniScriptMappings from '../mappings/OmniScript';
import { OmnistudioOrgDetails } from './orgUtils';
import { Constants } from './constants/stringContants';

export class DataModelService {
  private readonly orgs: OmnistudioOrgDetails;

  public constructor(orgs: OmnistudioOrgDetails) {
    this.orgs = orgs;
  }

  public getDataModel(): string {
    const { omniStudioOrgPermissionEnabled } = this.orgs;
    if (!omniStudioOrgPermissionEnabled) {
      return Constants.CustomDataModel;
    }
    return Constants.StandardDataModel;
  }
}

// Global instance and cached data model
let globalDataModelService: DataModelService | null = null;
let cachedDataModel: string | null = null;

// Initialize the global instance
export function initializeDataModelService(orgs: OmnistudioOrgDetails): void {
  globalDataModelService = new DataModelService(orgs);
  cachedDataModel = null; // Reset cache when reinitializing
}

// Get the global instance
export function getDataModelService(): DataModelService {
  return globalDataModelService;
}

// Convenience function to get data model info directly (with caching)
export function getDataModelInfo(): string {
  if (cachedDataModel === null) {
    cachedDataModel = getDataModelService().getDataModel();
  }
  return cachedDataModel;
}

// Convenience function to check if data model is standard
export function isStandardDataModel(): boolean {
  const dataModel = getDataModelInfo();
  return dataModel === Constants.StandardDataModel;
}

// Convenience function to check if data model is custom
export function isCustomDataModel(): boolean {
  const dataModel = getDataModelInfo();
  return dataModel === Constants.CustomDataModel;
}

export function getFieldKeyForOmniscript(namespacePrefix: string, fieldName: string): string {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  return isStandardDataModel() ? OmniScriptMappings[fieldName] : namespacePrefix + '__' + fieldName;
}
