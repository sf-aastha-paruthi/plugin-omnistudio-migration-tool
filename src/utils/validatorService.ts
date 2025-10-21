import { Connection, Messages } from '@salesforce/core';
import { Logger } from '../utils/logger';
import { OmnistudioOrgDetails } from './orgUtils';
import { OrgPreferences } from './orgPreferences';

export class ValidatorService {
  private readonly connection: Connection;
  private readonly messages: Messages;
  private readonly orgs: OmnistudioOrgDetails;

  public constructor(orgs: OmnistudioOrgDetails, connection: Connection, messages: Messages) {
    this.orgs = orgs;
    this.connection = connection;
    this.messages = messages;
  }

  public async validate(): Promise<boolean> {
    return (
      this.validateNamespace() &&
      this.validatePackageInstalled() &&
      this.validateOmniStudioOrgPermissionEnabled() &&
      (await this.validateDrVersioningDisabled()) &&
      (await this.validateOmniStudioLicenses())
    );
  }

  public validatePackageInstalled(): boolean {
    const { packageDetails } = this.orgs;
    if (!packageDetails) {
      Logger.error(this.messages.getMessage('noPackageInstalled'));
      return false;
    }
    return true;
  }

  public validateOmniStudioOrgPermissionEnabled(): boolean {
    const { omniStudioOrgPermissionEnabled } = this.orgs;
    if (omniStudioOrgPermissionEnabled) {
      Logger.error(this.messages.getMessage('alreadyStandardModel'));
      return false;
    }
    return true;
  }

  public validateNamespace(): boolean {
    const { hasValidNamespace } = this.orgs;
    if (!hasValidNamespace) {
      Logger.error(this.messages.getMessage('unknownNamespace'));
      return false;
    }
    return true;
  }

  public async validateOmniStudioLicenses(): Promise<boolean> {
    try {
      const query =
        "SELECT count(DeveloperName) total FROM PermissionSetLicense WHERE PermissionSetLicenseKey LIKE 'OmniStudio%' AND Status = 'Active'";
      const result = await this.connection.query<{ total: string }>(query);

      // Salesforce returns records as an array in result.records
      if (result?.records && result?.records?.length > 0) {
        // Since we only get one record with the total count, check if count > 0
        const totalCount = Number(result.records[0].total);
        if (totalCount > 0) {
          return true;
        }
      }

      Logger.error(this.messages.getMessage('noOmniStudioLicenses'));
      return false;
    } catch (error) {
      if (error instanceof Error && error.message) {
        Logger.error(`Error validating OmniStudio licenses: ${error.message}`);
      } else {
        Logger.error('Error validating OmniStudio licenses: Unknown error');
      }
      return false;
    }
  }

  public async validateDrVersioningDisabled(): Promise<boolean> {
    Logger.logVerbose(this.messages.getMessage('validatingDrVersioningDisabled'));
    try {
      const drVersion = await OrgPreferences.readDrVersion(this.connection);
      if (!drVersion) {
        Logger.logVerbose(this.messages.getMessage('drVersioningDisabled'));
        return true;
      }
      Logger.error(this.messages.getMessage('drVersioningEnabled'));
    } catch (error) {
      Logger.error(this.messages.getMessage('errorValidatingDrVersioning'));
    }
    return false;
  }
}
