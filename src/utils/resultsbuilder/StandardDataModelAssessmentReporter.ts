/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { StandardDataModelValidationResult } from '../standardDataModelValidator';
import {
  OSAssessmentInfo,
  IPAssessmentInfo,
  DataRaptorAssessmentInfo,
  FlexCardAssessmentInfo,
  GlobalAutoNumberAssessmentInfo,
} from '../interfaces';
import { OmnistudioOrgDetails } from '../orgUtils';

export interface StandardDataModelReportData {
  title: string;
  overallScore: number;
  totalComponents: number;
  fullyCompatibleCount: number;
  compatibilityDetails: ComponentCompatibilityDetail[];
  fieldMappingSummary: FieldMappingSummary;
  recommendationsSummary: string[];
  orgDetails: OmnistudioOrgDetails;
  instanceUrl: string;
}

export interface ComponentCompatibilityDetail {
  name: string;
  type: string;
  compatibilityScore: number;
  isCompatible: boolean;
  standardObject: string;
  supportedFeatures: string[];
  limitations: string[];
  warnings: string[];
  errors: string[];
  fieldMappings: FieldMappingDetail[];
}

export interface FieldMappingDetail {
  sourceField: string;
  targetField: string | null;
  isSupported: boolean;
  dataType: string;
  isCustomField: boolean;
  migrationNote?: string;
}

export interface FieldMappingSummary {
  totalFields: number;
  supportedFields: number;
  unsupportedFields: number;
  customFields: number;
  supportPercentage: number;
}

type AssessmentInfoUnion =
  | OSAssessmentInfo
  | IPAssessmentInfo
  | DataRaptorAssessmentInfo
  | FlexCardAssessmentInfo
  | GlobalAutoNumberAssessmentInfo;

/**
 * Generates standard data model assessment reports
 */
export class StandardDataModelAssessmentReporter {
  /**
   * Generates report data for OmniScript standard data model compatibility
   */
  public static getOmniscriptStandardDataModelReportData(
    osAssessmentInfos: OSAssessmentInfo[],
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails
  ): StandardDataModelReportData {
    const compatibilityDetails = osAssessmentInfos
      .filter((info) => info.standardDataModelValidation)
      .map((info) => this.convertToCompatibilityDetail(info, 'OmniScript', info.standardDataModelValidation));

    return this.generateReportData(
      'OmniScript Standard Data Model Compatibility',
      compatibilityDetails,
      instanceUrl,
      orgDetails
    );
  }

  /**
   * Generates report data for Integration Procedure standard data model compatibility
   */
  public static getIntegrationProcedureStandardDataModelReportData(
    ipAssessmentInfos: IPAssessmentInfo[],
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails
  ): StandardDataModelReportData {
    const compatibilityDetails = ipAssessmentInfos
      .filter((info) => info.standardDataModelValidation)
      .map((info) =>
        this.convertToCompatibilityDetail(info, 'Integration Procedure', info.standardDataModelValidation)
      );

    return this.generateReportData(
      'Integration Procedure Standard Data Model Compatibility',
      compatibilityDetails,
      instanceUrl,
      orgDetails
    );
  }

  /**
   * Generates report data for DataRaptor standard data model compatibility
   */
  public static getDataRaptorStandardDataModelReportData(
    drAssessmentInfos: DataRaptorAssessmentInfo[],
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails
  ): StandardDataModelReportData {
    const compatibilityDetails = drAssessmentInfos
      .filter((info) => info.standardDataModelValidation)
      .map((info) => this.convertToCompatibilityDetail(info, 'DataRaptor', info.standardDataModelValidation));

    return this.generateReportData(
      'DataRaptor Standard Data Model Compatibility',
      compatibilityDetails,
      instanceUrl,
      orgDetails
    );
  }

  /**
   * Generates report data for FlexCard standard data model compatibility
   */
  public static getFlexCardStandardDataModelReportData(
    fcAssessmentInfos: FlexCardAssessmentInfo[],
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails
  ): StandardDataModelReportData {
    const compatibilityDetails = fcAssessmentInfos
      .filter((info) => info.standardDataModelValidation)
      .map((info) => this.convertToCompatibilityDetail(info, 'FlexCard', info.standardDataModelValidation));

    return this.generateReportData(
      'FlexCard Standard Data Model Compatibility',
      compatibilityDetails,
      instanceUrl,
      orgDetails
    );
  }

  /**
   * Generates report data for GlobalAutoNumber standard data model compatibility
   */
  public static getGlobalAutoNumberStandardDataModelReportData(
    ganAssessmentInfos: GlobalAutoNumberAssessmentInfo[],
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails
  ): StandardDataModelReportData {
    const compatibilityDetails = ganAssessmentInfos
      .filter((info) => info.standardDataModelValidation)
      .map((info) => this.convertToCompatibilityDetail(info, 'GlobalAutoNumber', info.standardDataModelValidation));

    return this.generateReportData(
      'GlobalAutoNumber Standard Data Model Compatibility',
      compatibilityDetails,
      instanceUrl,
      orgDetails
    );
  }

  /**
   * Generates HTML table rows for compatibility details
   */
  public static generateCompatibilityTableRows(details: ComponentCompatibilityDetail[]): string {
    return details
      .map(
        (detail) => `
      <tr class="data-row-${detail.isCompatible ? 'compatible' : 'incompatible'}">
        <td><strong>${detail.name}</strong></td>
        <td>${detail.type}</td>
        <td>${detail.standardObject}</td>
        <td>
          <div class="compatibility-score ${this.getScoreClass(detail.compatibilityScore)}">
            ${detail.compatibilityScore}%
          </div>
        </td>
        <td>
          <span class="status-badge ${detail.isCompatible ? 'compatible' : 'incompatible'}">
            ${detail.isCompatible ? 'Compatible' : 'Issues Found'}
          </span>
        </td>
        <td>
          ${detail.warnings.length > 0 ? `<div class="warnings">${detail.warnings.join('<br>')}</div>` : '-'}
        </td>
        <td>
          ${detail.errors.length > 0 ? `<div class="errors">${detail.errors.join('<br>')}</div>` : '-'}
        </td>
        <td>
          <button class="btn-details" onclick="showFieldMappingDetails('${detail.name}')">
            View Field Mappings
          </button>
        </td>
      </tr>
    `
      )
      .join('');
  }

  /**
   * Generates field mapping details for a specific component
   */
  public static generateFieldMappingDetails(detail: ComponentCompatibilityDetail): string {
    const mappingRows = detail.fieldMappings
      .map(
        (field) => `
      <tr class="${field.isSupported ? 'supported' : 'unsupported'}">
        <td>${field.sourceField}</td>
        <td>${field.targetField || 'No Mapping'}</td>
        <td>${field.dataType}</td>
        <td>
          <span class="mapping-status ${field.isSupported ? 'supported' : 'unsupported'}">
            ${field.isSupported ? 'Supported' : 'Not Mapped'}
          </span>
        </td>
        <td>${field.isCustomField ? 'Yes' : 'No'}</td>
        <td>${field.migrationNote || '-'}</td>
      </tr>
    `
      )
      .join('');

    return `
      <div class="field-mapping-details">
        <h4>Field Mappings for ${detail.name}</h4>
        <table class="field-mapping-table">
          <thead>
            <tr>
              <th>Source Field</th>
              <th>Target Field</th>
              <th>Data Type</th>
              <th>Status</th>
              <th>Custom Field</th>
              <th>Migration Note</th>
            </tr>
          </thead>
          <tbody>
            ${mappingRows}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Converts assessment info to compatibility detail
   */
  private static convertToCompatibilityDetail(
    assessmentInfo: AssessmentInfoUnion,
    componentType: string,
    validation: StandardDataModelValidationResult
  ): ComponentCompatibilityDetail {
    const name =
      'name' in assessmentInfo
        ? (assessmentInfo as OSAssessmentInfo).name
        : (assessmentInfo as DataRaptorAssessmentInfo).oldName;

    return {
      name,
      type: componentType,
      compatibilityScore: validation.compatibilityScore,
      isCompatible: validation.isCompatible,
      standardObject: validation.standardObjectInfo.name,
      supportedFeatures: validation.standardObjectInfo.supportedFeatures,
      limitations: validation.standardObjectInfo.limitations,
      warnings: validation.warnings,
      errors: validation.errors,
      fieldMappings: validation.fieldMappings.map((fm) => ({
        sourceField: fm.sourceField,
        targetField: fm.targetField,
        isSupported: fm.isSupported,
        dataType: fm.dataType,
        isCustomField: fm.isCustomField,
        migrationNote: fm.migrationNote,
      })),
    };
  }

  /**
   * Generates the complete report data structure
   */
  private static generateReportData(
    title: string,
    compatibilityDetails: ComponentCompatibilityDetail[],
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails
  ): StandardDataModelReportData {
    const totalComponents = compatibilityDetails.length;
    const fullyCompatibleCount = compatibilityDetails.filter((detail) => detail.isCompatible).length;
    const overallScore =
      totalComponents > 0
        ? Math.round(compatibilityDetails.reduce((sum, detail) => sum + detail.compatibilityScore, 0) / totalComponents)
        : 100;

    const fieldMappingSummary = this.calculateFieldMappingSummary(compatibilityDetails);
    const recommendationsSummary = this.generateRecommendationsSummary(compatibilityDetails, overallScore);

    return {
      title,
      overallScore,
      totalComponents,
      fullyCompatibleCount,
      compatibilityDetails,
      fieldMappingSummary,
      recommendationsSummary,
      orgDetails,
      instanceUrl,
    };
  }

  /**
   * Calculates field mapping summary statistics
   */
  private static calculateFieldMappingSummary(
    compatibilityDetails: ComponentCompatibilityDetail[]
  ): FieldMappingSummary {
    let totalFields = 0;
    let supportedFields = 0;
    let customFields = 0;

    compatibilityDetails.forEach((detail) => {
      detail.fieldMappings.forEach((field) => {
        totalFields++;
        if (field.isSupported) supportedFields++;
        if (field.isCustomField) customFields++;
      });
    });

    const unsupportedFields = totalFields - supportedFields;
    const supportPercentage = totalFields > 0 ? Math.round((supportedFields / totalFields) * 100) : 100;

    return {
      totalFields,
      supportedFields,
      unsupportedFields,
      customFields,
      supportPercentage,
    };
  }

  /**
   * Generates summary recommendations based on compatibility analysis
   */
  private static generateRecommendationsSummary(
    compatibilityDetails: ComponentCompatibilityDetail[],
    overallScore: number
  ): string[] {
    const recommendations: string[] = [];

    if (overallScore < 100) {
      recommendations.push('Review all unmapped fields before proceeding with migration');
    }

    if (overallScore < 80) {
      recommendations.push('Consider implementing data preservation strategies for custom fields');
      recommendations.push('Plan for post-migration data validation and testing');
    }

    const hasCustomFields = compatibilityDetails.some((detail) =>
      detail.fieldMappings.some((field) => field.isCustomField && !field.isSupported)
    );

    if (hasCustomFields) {
      recommendations.push('Document custom field usage and business logic for reference');
      recommendations.push('Consider alternative approaches for unmapped custom functionality');
    }

    const hasErrors = compatibilityDetails.some((detail) => detail.errors.length > 0);
    if (hasErrors) {
      recommendations.push('Address all errors before migration to ensure successful completion');
    }

    const hasWarnings = compatibilityDetails.some((detail) => detail.warnings.length > 0);
    if (hasWarnings) {
      recommendations.push('Review all warnings and plan appropriate migration strategies');
    }

    // Default recommendations
    if (recommendations.length === 0) {
      recommendations.push('Components appear fully compatible with standard data model');
      recommendations.push('Proceed with migration following standard best practices');
    }

    return recommendations;
  }

  /**
   * Gets CSS class for compatibility score
   */
  private static getScoreClass(score: number): string {
    if (score >= 90) return 'score-excellent';
    if (score >= 75) return 'score-good';
    if (score >= 50) return 'score-fair';
    return 'score-poor';
  }
}
