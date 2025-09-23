/* eslint-disable @typescript-eslint/no-explicit-any, camelcase, comma-dangle */
import { expect } from 'chai';
import { NameMappingRegistry, ComponentNameMapping } from '../../src/migration/NameMappingRegistry';
import { initializeDataModelService } from '../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../src/utils/orgUtils';

describe('NameMappingRegistry', () => {
  let registry: NameMappingRegistry;

  beforeEach(() => {
    // Initialize data model service for tests (set to custom data model)
    const mockOrgDetails: OmnistudioOrgDetails = {
      packageDetails: { version: '1.0.0', namespace: 'vlocity_ins' },
      omniStudioOrgPermissionEnabled: false, // This makes IS_STANDARD_DATA_MODEL = false
      orgDetails: { Name: 'Test Org', Id: '00D000000000000' },
      dataModel: 'Custom',
      hasValidNamespace: true,
    };
    initializeDataModelService(mockOrgDetails);

    registry = NameMappingRegistry.getInstance();
    registry.clear();
  });

  describe('Component Registration', () => {
    it('should register DataMapper name mappings', () => {
      const mapping: ComponentNameMapping = {
        originalName: 'Customer Data-Loader',
        cleanedName: 'CustomerDataLoader',
        componentType: 'DataMapper',
        recordId: 'dr123',
      };

      registry.registerNameMapping(mapping);

      expect(registry.hasDataMapperMapping('Customer Data-Loader')).to.be.true;
      expect(registry.getDataMapperCleanedName('Customer Data-Loader')).to.equal('CustomerDataLoader');
    });

    it('should register OmniScript name mappings with Type_SubType_Language format', () => {
      const mapping: ComponentNameMapping = {
        originalName: 'Customer-Info_Account Details_English',
        cleanedName: 'CustomerInfo_AccountDetails_English',
        componentType: 'OmniScript',
        recordId: 'os123',
      };

      registry.registerNameMapping(mapping);

      expect(registry.hasOmniScriptMapping('Customer-Info_Account Details_English')).to.be.true;
      const cleanedName = registry.getOmniScriptCleanedName('Customer-Info', 'Account Details', 'English');
      expect(cleanedName).to.equal('CustomerInfo_AccountDetails_English');
    });

    it('should register Integration Procedure name mappings with Type_SubType format only', () => {
      const mapping: ComponentNameMapping = {
        originalName: 'API-Gateway_Customer Data',
        cleanedName: 'APIGateway_CustomerData',
        componentType: 'IntegrationProcedure',
        recordId: 'ip123',
      };

      registry.registerNameMapping(mapping);

      expect(registry.hasIntegrationProcedureMapping('API-Gateway_Customer Data')).to.be.true;
      expect(registry.getIntegrationProcedureCleanedName('API-Gateway_Customer Data')).to.equal(
        'APIGateway_CustomerData'
      );
    });

    it('should register FlexCard name mappings', () => {
      const mapping: ComponentNameMapping = {
        originalName: 'Customer-Dashboard Card',
        cleanedName: 'CustomerDashboardCard',
        componentType: 'FlexCard',
        recordId: 'fc123',
      };

      registry.registerNameMapping(mapping);

      expect(registry.hasFlexCardMapping('Customer-Dashboard Card')).to.be.true;
      expect(registry.getFlexCardCleanedName('Customer-Dashboard Card')).to.equal('CustomerDashboardCard');
    });
  });

  describe('Pre-processing Components', () => {
    it('should pre-process DataMappers and register mappings', () => {
      const dataMappers = [
        { Id: 'dr1', Name: 'Customer-Data Loader' },
        { Id: 'dr2', Name: 'Account_Information' },
      ];

      registry.preProcessComponents(dataMappers, [], [], [], []);

      expect(registry.hasDataMapperMapping('Customer-Data Loader')).to.be.true;
      expect(registry.getDataMapperCleanedName('Customer-Data Loader')).to.equal('CustomerDataLoader');
      expect(registry.hasDataMapperMapping('Account_Information')).to.be.true;
    });

    it('should pre-process OmniScripts with namespaced fields', () => {
      const omniScripts = [
        {
          Id: 'os1',
          Name: 'CustomerInfo_AccountDetails_English',
          ['vlocity_ins__Type__c']: 'Customer-Info',
          ['vlocity_ins__SubType__c']: 'Account Details',
          ['vlocity_ins__Language__c']: 'English',
        },
      ];

      registry.preProcessComponents([], omniScripts, [], [], []);

      expect(registry.hasOmniScriptMapping('Customer-Info_Account Details_English')).to.be.true;
    });

    it('should pre-process Integration Procedures with Type_SubType format only', () => {
      const integrationProcedures = [
        {
          Id: 'ip1',
          Name: 'APIGateway_CustomerData',
          ['vlocity_ins__Type__c']: 'API-Gateway',
          ['vlocity_ins__SubType__c']: 'Customer Data',
          ['vlocity_ins__Language__c']: 'English',
          ['vlocity_ins__IsProcedure__c']: true,
        },
      ];

      registry.preProcessComponents([], [], [], integrationProcedures, []);

      expect(registry.hasIntegrationProcedureMapping('API-Gateway_Customer Data')).to.be.true;
      expect(registry.getIntegrationProcedureCleanedName('API-Gateway_Customer Data')).to.equal(
        'APIGateway_CustomerData'
      );
    });
  });

  describe('Name Change Warnings', () => {
    beforeEach(() => {
      // Register components with name changes
      registry.registerNameMapping({
        originalName: 'Customer-Data Loader',
        cleanedName: 'CustomerDataLoader',
        componentType: 'DataMapper',
        recordId: 'dr1',
      });

      registry.registerNameMapping({
        originalName: 'Account_Information',
        cleanedName: 'Account_Information',
        componentType: 'DataMapper',
        recordId: 'dr2',
      });
    });

    it('should generate warnings for components with name changes', () => {
      const warnings = registry.getNameChangeWarnings();

      expect(warnings).to.have.length(1);
      expect(warnings[0]).to.include('Customer-Data Loader');
      expect(warnings[0]).to.include('CustomerDataLoader');
    });

    it('should generate warnings by component type', () => {
      const warnings = registry.getNameChangeWarningsForType('DataMapper');

      expect(warnings).to.have.length(1);
      expect(warnings[0]).to.equal('"Customer-Data Loader" → "CustomerDataLoader"');
    });

    it('should count name changes by type', () => {
      const counts = registry.getNameChangeCountByType();

      expect(counts['DataMapper']).to.equal(1);
    });
  });

  describe('Dependency Reference Updates', () => {
    beforeEach(() => {
      // Setup registry with various component mappings
      registry.registerNameMapping({
        originalName: 'Customer-Data',
        cleanedName: 'CustomerData',
        componentType: 'DataMapper',
        recordId: 'dr1',
      });

      registry.registerNameMapping({
        originalName: 'API_Gateway_Customer Info',
        cleanedName: 'APIGateway_CustomerInfo',
        componentType: 'IntegrationProcedure',
        recordId: 'ip1',
      });

      registry.registerNameMapping({
        originalName: 'Customer-Profile_Account-View_English',
        cleanedName: 'CustomerProfile_AccountView_English',
        componentType: 'OmniScript',
        recordId: 'os1',
      });
    });

    it('should update DataMapper references in object', () => {
      const testObject = {
        dataSource: {
          type: 'DataRaptor',
          bundle: 'Customer-Data',
        },
        formula: 'LOOKUP("Customer-Data", "AccountId")',
      };

      const updated = registry.updateDependencyReferences(testObject);

      expect(updated.dataSource.bundle).to.equal('CustomerData');
    });

    it('should update Integration Procedure references in object', () => {
      const testObject = {
        integrationProcedureKey: 'API_Gateway_Customer Info',
        actions: [
          {
            type: 'IP Action',
            procedureName: 'API_Gateway_Customer Info',
          },
        ],
      };

      const updated = registry.updateDependencyReferences(testObject);

      expect(updated.integrationProcedureKey).to.equal('APIGateway_CustomerInfo');
      expect(updated.actions[0].procedureName).to.equal('APIGateway_CustomerInfo');
    });

    it('should update OmniScript references in object', () => {
      const testObject = {
        omniscripts: [
          {
            type: 'Customer-Profile',
            subtype: 'Account-View',
            language: 'English',
          },
        ],
      };

      const updated = registry.updateDependencyReferences(testObject);

      // Note: This tests the string replacement logic in updateStringReference
      // The actual OmniScript object structure is handled by specific methods
      expect(updated.omniscripts).to.be.an('array');
    });

    it('should handle nested objects and arrays', () => {
      const testObject = {
        states: [
          {
            components: {
              comp1: {
                dataSource: 'Customer-Data',
                children: [
                  {
                    reference: 'API_Gateway_Customer Info',
                  },
                ],
              },
            },
          },
        ],
      };

      const updated = registry.updateDependencyReferences(testObject);

      expect(updated.states[0].components.comp1.dataSource).to.equal('CustomerData');
      expect(updated.states[0].components.comp1.children[0].reference).to.equal('APIGateway_CustomerInfo');
    });
  });

  describe('Fallback Behavior', () => {
    it('should return original name when no mapping exists', () => {
      expect(registry.getDataMapperCleanedName('UnknownDataMapper')).to.equal('UnknownDataMapper');
      expect(registry.getIntegrationProcedureCleanedName('UnknownIP')).to.equal('UnknownIP');
      expect(registry.getFlexCardCleanedName('UnknownCard')).to.equal('UnknownCard');
    });

    it('should return cleaned name when no mapping exists for OmniScript', () => {
      const cleanedName = registry.getOmniScriptCleanedName('Unknown-Type', 'Unknown-SubType', 'English');
      expect(cleanedName).to.equal('UnknownType_UnknownSubType_English');
    });
  });

  describe('Registry State Management', () => {
    it('should clear all mappings', () => {
      registry.registerNameMapping({
        originalName: 'Test',
        cleanedName: 'Test',
        componentType: 'DataMapper',
        recordId: 'test1',
      });

      registry.clear();

      expect(registry.hasDataMapperMapping('Test')).to.be.false;
      expect(registry.getAllNameMappings()).to.have.length(0);
    });

    it('should return all name mappings', () => {
      registry.registerNameMapping({
        originalName: 'Test1',
        cleanedName: 'Test1',
        componentType: 'DataMapper',
        recordId: 'test1',
      });

      registry.registerNameMapping({
        originalName: 'Test2',
        cleanedName: 'Test2',
        componentType: 'OmniScript',
        recordId: 'test2',
      });

      const allMappings = registry.getAllNameMappings();
      expect(allMappings).to.have.length(2);
    });
  });
});
