/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, camelcase, comma-dangle */
import { expect } from 'chai';
import { CardMigrationTool } from '../../src/migration/flexcard';
import { NameMappingRegistry } from '../../src/migration/NameMappingRegistry';
import { initializeDataModelService } from '../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../src/utils/orgUtils';

describe('FlexCard Custom Data Model - OmniScript Navigate URL', () => {
  let cardTool: CardMigrationTool;
  let nameRegistry: NameMappingRegistry;
  let mockConnection: any;
  let mockMessages: any;
  let mockUx: any;
  let mockLogger: any;

  beforeEach(() => {
    nameRegistry = NameMappingRegistry.getInstance();
    nameRegistry.clear();

    const mockOrgDetails: OmnistudioOrgDetails = {
      packageDetails: { version: '1.0.0', namespace: 'omnistudio' },
      omniStudioOrgPermissionEnabled: false, // Custom Data Model
      orgDetails: { Name: 'Test Org', Id: '00D000000000000' },
      dataModel: 'Custom',
      hasValidNamespace: true,
      isFoundationPackage: false,
      isOmnistudioMetadataAPIEnabled: false,
    };
    initializeDataModelService(mockOrgDetails);

    mockConnection = {};
    mockMessages = {
      getMessage: (key: string, args?: string[]) => {
        if (key === 'webPageOmniScriptNavigationDetected') {
          return `OmniScript navigation URL detected: ${args?.[0]} -> ${args?.[1]}`;
        }
        return 'Mock message for testing';
      },
    };
    mockUx = {};
    mockLogger = {};

    cardTool = new CardMigrationTool('omnistudio', mockConnection, mockLogger, mockMessages, mockUx, false);
  });

  describe('Migration', () => {
    it('should convert absolute OmniScript Universal Page URL to relative standard URL', () => {
      const mockCardRecord = {
        Id: 'fc_mig_custom_os_url_abs',
        Name: 'MigCustomOmniUrlAbsolute',
        omnistudio__Datasource__c: JSON.stringify({ type: 'None' }),
        omnistudio__Definition__c: JSON.stringify({
          layout: 'Card',
          states: [
            {
              components: {
                'layer-0': {
                  children: [
                    {
                      element: 'action',
                      property: {
                        actionList: [
                          {
                            stateAction: {
                              type: 'Custom',
                              targetType: 'Web Page',
                              'Web Page': {
                                targetName:
                                  'https://migration01--devopsimpkg15.test1.vf.pc-rnd.force.com/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}&OmniScriptType=OS&OmniScriptSubType=Navigate&OmniScriptLang=English&PrefillDataRaptorBundle=&scriptMode=vertical&layout=lightning&ContextId={0}',
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
          events: [],
        }),
        omnistudio__Active__c: true,
        omnistudio__CardType__c: 'Parent',
        omnistudio__Version__c: 1,
      };

      const updates = new Set<string>();
      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map(), updates);
      const propertySetConfig = JSON.parse(result.PropertySetConfig);
      const targetName =
        propertySetConfig.states[0].components['layer-0'].children[0].property.actionList[0].stateAction['Web Page']
          .targetName;

      expect(targetName.startsWith('/lightning/page/omnistudio/omniscript?')).to.be.true;
      expect(targetName).to.not.include('migration01');
      expect(targetName).to.include('omniscript__type=OS');
      expect(targetName).to.include('omniscript__subType=Navigate');
      expect(targetName).to.include('omniscript__language=English');
      expect(targetName).to.include('omniscript__theme=lightning');
      expect(targetName).to.include('id=%7B0%7D');
      expect(targetName).to.include('ContextId=%7B0%7D');
      expect(updates.size).to.equal(1);
    });

    it('should clean special characters from OmniScriptType and OmniScriptSubType in standard URL', () => {
      const mockCardRecord = {
        Id: 'fc_mig_custom_os_url_clean',
        Name: 'MigCustomOmniUrlClean',
        omnistudio__Datasource__c: JSON.stringify({ type: 'None' }),
        omnistudio__Definition__c: JSON.stringify({
          layout: 'Card',
          states: [
            {
              components: {
                'layer-0': {
                  children: [
                    {
                      element: 'action',
                      property: {
                        actionList: [
                          {
                            stateAction: {
                              type: 'Custom',
                              targetType: 'Web Page',
                              'Web Page': {
                                targetName:
                                  '/apex/devopsimpkg15__OmniScriptUniversalPage?OmniScriptType=A%24&OmniScriptSubType=B%23-Navigate&OmniScriptLang=en_US&layout=lightning',
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
          events: [],
        }),
        omnistudio__Active__c: true,
        omnistudio__CardType__c: 'Parent',
        omnistudio__Version__c: 1,
      };

      const updates = new Set<string>();
      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map(), updates);
      const propertySetConfig = JSON.parse(result.PropertySetConfig);
      const targetName =
        propertySetConfig.states[0].components['layer-0'].children[0].property.actionList[0].stateAction['Web Page']
          .targetName;

      expect(targetName).to.include('omniscript__type=A');
      expect(targetName).to.include('omniscript__subType=BNavigate');
      expect(targetName).to.include('omniscript__language=en_US');
    });

    it('should rewrite OmniScript URL with slash-separated fragment params (#/Key/Val/...)', () => {
      const mockCardRecord = {
        Id: 'fc_mig_custom_os_url_fragment',
        Name: 'MigCustomOmniUrlFragment',
        omnistudio__Datasource__c: JSON.stringify({ type: 'None' }),
        omnistudio__Definition__c: JSON.stringify({
          layout: 'Card',
          states: [
            {
              components: {
                'layer-0': {
                  children: [
                    {
                      element: 'action',
                      property: {
                        actionList: [
                          {
                            stateAction: {
                              type: 'Custom',
                              targetType: 'Web Page',
                              'Web Page': {
                                targetName:
                                  'https://migration01--devopsimpkg15.test1.vf.pc-rnd.force.com/apex/devopsimpkg15__OmniScriptUniversalPage?id=%7B0%7D&layout=lightning#/OmniScriptType/OSNameClean$/OmniScriptSubType/Test$/OmniScriptLang/English/ContextId/%7B0%7D/PrefillDataRaptorBundle//true',
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
          events: [],
        }),
        omnistudio__Active__c: true,
        omnistudio__CardType__c: 'Parent',
        omnistudio__Version__c: 1,
      };

      const updates = new Set<string>();
      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map(), updates);
      const propertySetConfig = JSON.parse(result.PropertySetConfig);
      const targetName =
        propertySetConfig.states[0].components['layer-0'].children[0].property.actionList[0].stateAction['Web Page']
          .targetName;

      expect(targetName.startsWith('/lightning/page/omnistudio/omniscript?')).to.be.true;
      expect(targetName).to.not.include('migration01');
      expect(targetName).to.not.include('#');
      expect(targetName).to.include('id=%7B0%7D');
      expect(targetName).to.include('omniscript__theme=lightning');
      expect(targetName).to.include('omniscript__type=OSNameClean');
      expect(targetName).to.include('omniscript__subType=Test');
      expect(targetName).to.include('omniscript__language=English');
      expect(targetName).to.include('ContextId=%7B0%7D');
      expect(targetName).to.include('PrefillDataRaptorBundle=');
      expect(updates.size).to.equal(1);
    });
  });

  describe('Assessment', () => {
    it('should add warning for Custom type with Web Page target referencing OmniScript Universal Page', async () => {
      const mockFlexCard = {
        Id: 'fc_assess_custom_os_url',
        Name: 'AssessCustomOmniScriptUrl',
        omnistudio__Datasource__c: JSON.stringify({ type: 'None' }),
        omnistudio__Definition__c: JSON.stringify({
          states: [
            {
              components: {
                comp1: {
                  element: 'action',
                  property: {
                    actionList: [
                      {
                        stateAction: {
                          type: 'Custom',
                          targetType: 'Web Page',
                          'Web Page': {
                            targetName:
                              '/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}&OmniScriptType=OS&OmniScriptSubType=Navigate&OmniScriptLang=English&layout=lightning&ContextId={0}',
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = await (cardTool as any).processFlexCard(
        mockFlexCard,
        new Set<string>(),
        new Map<string, string>()
      );

      expect(result.warnings.length).to.be.greaterThan(0);
      expect(result.migrationStatus).to.equal('Warnings');
    });
  });
});
