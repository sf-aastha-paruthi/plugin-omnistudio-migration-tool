/* eslint-disable @typescript-eslint/no-explicit-any */
import { AnyJson } from '@salesforce/ts-types';
import OmniScriptMappings from '../mappings/OmniScript';
import ElementMappings from '../mappings/Element';
import DRBundleMappings from '../mappings/DRBundle';
import DRMapItemMappings from '../mappings/DRMapItem';
import VlocityCardMappings from '../mappings/VlocityCard';
import GlobalAutoNumberMappings from '../mappings/GlobalAutoNumber';
import { Logger } from './logger';

export interface StandardDataModelValidationResult {
  isCompatible: boolean;
  compatibilityScore: number; // 0-100 percentage
  fieldMappings: FieldMappingResult[];
  warnings: string[];
  errors: string[];
  recommendations: string[];
  standardObjectInfo: StandardObjectInfo;
}

export interface FieldMappingResult {
  sourceField: string;
  targetField: string | null;
  isSupported: boolean;
  dataType: string;
  isCustomField: boolean;
  migrationNote?: string;
}

export interface StandardObjectInfo {
  name: string;
  supportedFeatures: string[];
  limitations: string[];
  requiredFields: string[];
}

export interface ComponentTypeMapping {
  customObject: string;
  standardObject: string;
  mappings: Record<string, string>;
  requiredStandardFields: string[];
}

/**
 * Validates OmniStudio components for standard data model compatibility
 */
export class StandardDataModelValidator {
  private static componentMappings: Map<string, ComponentTypeMapping> = new Map([
    [
      'OmniScript',
      {
        customObject: 'OmniScript__c',
        standardObject: 'OmniProcess',
        mappings: OmniScriptMappings,
        requiredStandardFields: ['Name', 'Type', 'SubType', 'IsActive', 'VersionNumber'],
      },
    ],
    [
      'Element',
      {
        customObject: 'Element__c',
        standardObject: 'OmniProcessElement',
        mappings: ElementMappings,
        requiredStandardFields: ['Name', 'Type', 'OmniProcessId', 'SequenceNumber'],
      },
    ],
    [
      'DataRaptor',
      {
        customObject: 'DRBundle__c',
        standardObject: 'OmniDataTransformation',
        mappings: DRBundleMappings,
        requiredStandardFields: ['Name', 'Type', 'IsActive'],
      },
    ],
    [
      'DataRaptorItem',
      {
        customObject: 'DRMapItem__c',
        standardObject: 'OmniDataTransformationItem',
        mappings: DRMapItemMappings,
        requiredStandardFields: ['Name', 'OmniDataTransformationId'],
      },
    ],
    [
      'FlexCard',
      {
        customObject: 'VlocityCard__c',
        standardObject: 'FlexCard',
        mappings: VlocityCardMappings,
        requiredStandardFields: ['MasterLabel', 'DeveloperName', 'IsActive'],
      },
    ],
    [
      'GlobalAutoNumber',
      {
        customObject: 'GlobalAutoNumber__c',
        standardObject: 'OmniAutoNumber',
        mappings: GlobalAutoNumberMappings,
        requiredStandardFields: ['Name', 'Format', 'IsActive'],
      },
    ],
  ]);

  /**
   * Validates a component record for standard data model compatibility
   */
  public static validateComponent(
    componentType: string,
    record: AnyJson,
    namespace?: string
  ): StandardDataModelValidationResult {
    const mapping = this.componentMappings.get(componentType);
    if (!mapping) {
      return this.createFailureResult(`Unsupported component type: ${componentType}`);
    }

    const fieldMappings = this.validateFieldMappings(record, mapping, namespace);
    const standardObjectInfo = this.getStandardObjectInfo(componentType);
    const warnings: string[] = [];
    const errors: string[] = [];
    const recommendations: string[] = [];

    // Check for unmapped custom fields
    const unmappedFields = fieldMappings.filter((fm) => !fm.isSupported);
    if (unmappedFields.length > 0) {
      warnings.push(`${unmappedFields.length} custom fields may not migrate to standard object`);
      unmappedFields.forEach((field) => {
        warnings.push(`Field '${field.sourceField}' has no standard equivalent`);
      });
    }

    // Check for required standard fields
    const missingRequiredFields = mapping.requiredStandardFields.filter(
      (reqField) => !fieldMappings.some((fm) => fm.targetField === reqField && fm.isSupported)
    );

    if (missingRequiredFields.length > 0) {
      errors.push(`Missing required standard fields: ${missingRequiredFields.join(', ')}`);
    }

    // Calculate compatibility score
    const totalFields = fieldMappings.length;
    const mappedFields = fieldMappings.filter((fm) => fm.isSupported).length;
    const compatibilityScore = totalFields > 0 ? Math.round((mappedFields / totalFields) * 100) : 100;

    // Add recommendations
    if (compatibilityScore < 100) {
      recommendations.push('Review unmapped fields before migration');
      recommendations.push('Consider custom field alternatives or data preservation strategies');
    }

    if (unmappedFields.some((f) => f.isCustomField)) {
      recommendations.push('Document custom field usage for post-migration reference');
    }

    return {
      isCompatible: errors.length === 0,
      compatibilityScore,
      fieldMappings,
      warnings,
      errors,
      recommendations,
      standardObjectInfo,
    };
  }

  /**
   * Batch validates multiple components
   */
  public static validateComponents(
    components: Array<{ type: string; record: AnyJson }>,
    namespace?: string
  ): Map<string, StandardDataModelValidationResult[]> {
    const results = new Map<string, StandardDataModelValidationResult[]>();

    for (const component of components) {
      const componentResults = results.get(component.type) || [];
      componentResults.push(this.validateComponent(component.type, component.record, namespace));
      results.set(component.type, componentResults);
    }

    return results;
  }

  /**
   * Gets overall compatibility summary for all components
   */
  public static getCompatibilitySummary(validationResults: Map<string, StandardDataModelValidationResult[]>): {
    overallScore: number;
    componentScores: Map<string, number>;
    totalErrors: number;
    totalWarnings: number;
    isFullyCompatible: boolean;
  } {
    let totalScore = 0;
    let componentCount = 0;
    let totalErrors = 0;
    let totalWarnings = 0;
    const componentScores = new Map<string, number>();

    for (const [componentType, results] of validationResults) {
      const componentTotalScore = results.reduce((sum, result) => sum + result.compatibilityScore, 0);
      const avgComponentScore = results.length > 0 ? componentTotalScore / results.length : 0;

      componentScores.set(componentType, avgComponentScore);
      totalScore += avgComponentScore;
      componentCount++;

      totalErrors += results.reduce((sum, result) => sum + result.errors.length, 0);
      totalWarnings += results.reduce((sum, result) => sum + result.warnings.length, 0);
    }

    const overallScore = componentCount > 0 ? totalScore / componentCount : 0;
    const isFullyCompatible = totalErrors === 0 && overallScore === 100;

    return {
      overallScore: Math.round(overallScore),
      componentScores,
      totalErrors,
      totalWarnings,
      isFullyCompatible,
    };
  }

  /**
   * Logs validation summary to console
   */
  public static logValidationSummary(validationResults: Map<string, StandardDataModelValidationResult[]>): void {
    const summary = this.getCompatibilitySummary(validationResults);

    Logger.log('\n=== Standard Data Model Compatibility Summary ===');
    Logger.log(`Overall Compatibility Score: ${summary.overallScore}%`);
    Logger.log(`Fully Compatible: ${summary.isFullyCompatible ? 'Yes' : 'No'}`);
    Logger.log(`Total Errors: ${summary.totalErrors}`);
    Logger.log(`Total Warnings: ${summary.totalWarnings}`);

    Logger.log('\nComponent Scores:');
    for (const [componentType, score] of summary.componentScores) {
      Logger.log(`  ${componentType}: ${Math.round(score)}%`);
    }
  }

  /**
   * Validates field mappings for a record
   */
  private static validateFieldMappings(
    record: AnyJson,
    mapping: ComponentTypeMapping,
    namespace?: string
  ): FieldMappingResult[] {
    const results: FieldMappingResult[] = [];
    const recordFields = Object.keys(record);

    for (const sourceField of recordFields) {
      const cleanFieldName = this.getCleanFieldName(sourceField, namespace);
      const targetField = mapping.mappings[cleanFieldName] || null;
      const isSupported = targetField !== null;
      const isCustomField = sourceField.includes('__c');

      results.push({
        sourceField: cleanFieldName,
        targetField,
        isSupported,
        dataType: this.inferDataType(record[sourceField]),
        isCustomField,
        migrationNote: !isSupported && isCustomField ? 'Custom field - review migration strategy' : undefined,
      });
    }

    return results;
  }

  /**
   * Gets standard object information for a component type
   */
  private static getStandardObjectInfo(componentType: string): StandardObjectInfo {
    const baseInfo = {
      supportedFeatures: ['Standard field mappings', 'Salesforce platform integration', 'Built-in validation rules'],
      limitations: ['Limited custom field support', 'May require data transformation'],
      requiredFields: this.componentMappings.get(componentType)?.requiredStandardFields || [],
    };

    switch (componentType) {
      case 'OmniScript':
        return {
          name: 'OmniProcess',
          ...baseInfo,
          supportedFeatures: [
            ...baseInfo.supportedFeatures,
            'Integration procedure support',
            'Web component enablement',
            'Localization support',
          ],
        };
      case 'DataRaptor':
        return {
          name: 'OmniDataTransformation',
          ...baseInfo,
          supportedFeatures: [
            ...baseInfo.supportedFeatures,
            'Complex data transformations',
            'JSON/XML processing',
            'Batch processing support',
          ],
        };
      case 'FlexCard':
        return {
          name: 'FlexCard',
          ...baseInfo,
          supportedFeatures: [...baseInfo.supportedFeatures, 'Lightning Web Component support', 'Responsive design'],
        };
      default:
        return {
          name: this.componentMappings.get(componentType)?.standardObject || 'Unknown',
          ...baseInfo,
        };
    }
  }

  /**
   * Removes namespace prefix from field names
   */
  private static getCleanFieldName(fieldName: string, namespace?: string): string {
    if (namespace && fieldName.startsWith(`${namespace}__`)) {
      return fieldName.substring(namespace.length + 2);
    }
    return fieldName;
  }

  /**
   * Infers data type from field value
   */
  private static inferDataType(value: any): string {
    if (value === null || value === undefined) return 'Unknown';
    if (typeof value === 'boolean') return 'Boolean';
    if (typeof value === 'number') return 'Number';
    if (typeof value === 'string') {
      if (value.includes('T') && value.includes('Z')) return 'DateTime';
      if (value.length > 255) return 'LongTextArea';
      return 'Text';
    }
    if (typeof value === 'object') return 'JSON';
    return 'Unknown';
  }

  /**
   * Creates a failure result for unsupported components
   */
  private static createFailureResult(errorMessage: string): StandardDataModelValidationResult {
    return {
      isCompatible: false,
      compatibilityScore: 0,
      fieldMappings: [],
      warnings: [],
      errors: [errorMessage],
      recommendations: ['Verify component type and mapping configuration'],
      standardObjectInfo: {
        name: 'Unknown',
        supportedFeatures: [],
        limitations: [],
        requiredFields: [],
      },
    };
  }
}
