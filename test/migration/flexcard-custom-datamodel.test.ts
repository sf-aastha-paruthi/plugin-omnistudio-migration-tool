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

    /**
     * Build a single-action FlexCard fixture parameterized by `targetName`.
     * Used by the edge-case tests below to keep them focused on the URL value
     * rather than re-stating boilerplate JSON.
     */
    const buildSingleActionCard = (id: string, name: string, targetName: string): any => ({
      Id: id,
      Name: name,
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
                            'Web Page': { targetName },
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
    });

    const getRewrittenTargetName = (transformedCard: any): string =>
      JSON.parse(transformedCard.PropertySetConfig).states[0].components['layer-0'].children[0].property.actionList[0]
        .stateAction['Web Page'].targetName;

    it('should leave non-OmniScript external URLs untouched (fast-path skip)', () => {
      const original = 'https://help.acme.com/articles/12345';
      const card = buildSingleActionCard('fc_url_external', 'NonOmniExternal', original);

      const updates = new Set<string>();
      const result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);

      expect(getRewrittenTargetName(result)).to.equal(original);
      expect(updates.size).to.equal(0);
    });

    it('should leave malformed/unparseable URLs untouched without throwing', () => {
      // `[bad` is an invalid IPv6 host literal -> new URL throws TypeError.
      const original =
        'https://[bad/apex/devopsimpkg15__OmniScriptUniversalPage?OmniScriptType=A&OmniScriptSubType=B&OmniScriptLang=en';
      const card = buildSingleActionCard('fc_url_malformed', 'MalformedURL', original);

      const updates = new Set<string>();
      let result: any;
      expect(() => {
        result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);
      }).to.not.throw();

      expect(getRewrittenTargetName(result)).to.equal(original);
      expect(updates.size).to.equal(0);
    });

    it('should reject non-http(s) schemes such as javascript: even when OmniScript tokens are present', () => {
      const original =
        'javascript:alert(1)//apex/devopsimpkg15__OmniScriptUniversalPage?OmniScriptType=Foo&OmniScriptSubType=Bar&OmniScriptLang=English';
      const card = buildSingleActionCard('fc_url_javascript', 'JavascriptScheme', original);

      const updates = new Set<string>();
      const result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);

      expect(getRewrittenTargetName(result)).to.equal(original);
      expect(updates.size).to.equal(0);
    });

    it('should reject URLs whose required tokens are smuggled into query values rather than the path/params', () => {
      // pathname is `/foo`, not `/apex/...`; the `/apex/...` text is inside a query VALUE.
      const original =
        'https://evil.example.com/foo?bar=/apex/devopsimpkg15__OmniScriptUniversalPage&OmniScriptType=A&OmniScriptSubType=B&OmniScriptLang=en';
      const card = buildSingleActionCard('fc_url_smuggled', 'SmuggledTokens', original);

      const updates = new Set<string>();
      const result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);

      expect(getRewrittenTargetName(result)).to.equal(original);
      expect(updates.size).to.equal(0);
    });

    it('should rewrite without throwing when the fragment contains a malformed percent sequence', () => {
      // `Foo%` in the fragment would crash decodeURIComponent without our try/catch fallback.
      const original =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}#/OmniScriptType/Foo%/OmniScriptSubType/Bar/OmniScriptLang/English';
      const card = buildSingleActionCard('fc_url_bad_pct', 'MalformedPercent', original);

      const updates = new Set<string>();
      let result: any;
      expect(() => {
        result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);
      }).to.not.throw();

      const rewritten = getRewrittenTargetName(result);
      expect(rewritten.startsWith('/lightning/page/omnistudio/omniscript?')).to.be.true;
      // OmniScriptType/SubType pass through cleanName which strips non-alphanumerics
      // (including the literal '%' that survived the malformed-percent fallback).
      expect(rewritten).to.include('omniscript__type=Foo');
      expect(rewritten).to.not.include('Foo%');
      expect(rewritten).to.include('omniscript__subType=Bar');
      expect(rewritten).to.include('omniscript__language=English');
      expect(updates.size).to.equal(1);
    });

    it('should let query-string params win when the same key appears in both query and fragment', () => {
      const original =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?OmniScriptType=FromQuery&OmniScriptSubType=B&OmniScriptLang=en#/OmniScriptType/FromFragment';
      const card = buildSingleActionCard('fc_url_dup_keys', 'DupQueryFragment', original);

      const updates = new Set<string>();
      const result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);

      const rewritten = getRewrittenTargetName(result);
      expect(rewritten).to.include('omniscript__type=FromQuery');
      expect(rewritten).to.not.include('FromFragment');
      expect(updates.size).to.equal(1);
    });

    it('should rename layout to omniscript__theme and drop the original layout key', () => {
      const original =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?OmniScriptType=A&OmniScriptSubType=B&OmniScriptLang=en&layout=newport';
      const card = buildSingleActionCard('fc_url_layout_rename', 'LayoutThemeRename', original);

      const updates = new Set<string>();
      const result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);

      const rewritten = getRewrittenTargetName(result);
      expect(rewritten).to.include('omniscript__theme=newport');
      expect(rewritten).to.not.match(/(^|[?&])layout=/);
      expect(updates.size).to.equal(1);
    });

    it('should preserve Unicode characters in non-cleaned params and strip them from cleaned ones', () => {
      // OmniScriptLang is preserved as-is; OmniScriptType/SubType pass through cleanName
      // (which strips non [a-z0-9] characters, including Unicode letters like 'é').
      const original =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?OmniScriptType=Café&OmniScriptSubType=Über&OmniScriptLang=fr_CA';
      const card = buildSingleActionCard('fc_url_unicode', 'UnicodeChars', original);

      const updates = new Set<string>();
      let result: any;
      expect(() => {
        result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);
      }).to.not.throw();

      const rewritten = getRewrittenTargetName(result);
      expect(rewritten.startsWith('/lightning/page/omnistudio/omniscript?')).to.be.true;
      expect(rewritten).to.include('omniscript__type=Caf');
      expect(rewritten).to.include('omniscript__subType=ber');
      // OmniScriptLang is not in the clean list; Unicode survives (URL-encoded as %2F-style escapes for non-ASCII).
      expect(decodeURIComponent(rewritten)).to.include('omniscript__language=fr_CA');
      expect(updates.size).to.equal(1);
    });

    it('should rewrite very long URLs without truncation or crash', () => {
      // Build a ~50KB payload by padding a non-cleaned param value (id) with junk.
      const longValue = 'x'.repeat(50_000);
      const original =
        `/apex/devopsimpkg15__OmniScriptUniversalPage?id=${longValue}` +
        '&OmniScriptType=A&OmniScriptSubType=B&OmniScriptLang=en';
      const card = buildSingleActionCard('fc_url_very_long', 'VeryLongURL', original);

      const updates = new Set<string>();
      let result: any;
      expect(() => {
        result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);
      }).to.not.throw();

      const rewritten = getRewrittenTargetName(result);
      expect(rewritten.startsWith('/lightning/page/omnistudio/omniscript?')).to.be.true;
      expect(rewritten).to.include(`id=${longValue}`);
      expect(rewritten).to.include('omniscript__type=A');
      expect(updates.size).to.equal(1);
    });

    it('should rewrite multiple Custom Web Page actions within the same FlexCard', () => {
      const url1 =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?OmniScriptType=One&OmniScriptSubType=First&OmniScriptLang=en';
      const url2 =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?OmniScriptType=Two&OmniScriptSubType=Second&OmniScriptLang=en';

      const buildCustomWebPageAction = (targetName: string): any => ({
        stateAction: {
          type: 'Custom',
          targetType: 'Web Page',
          'Web Page': { targetName },
        },
      });

      const mockCardRecord = {
        Id: 'fc_url_multiple_actions',
        Name: 'MultipleURLActions',
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
                        actionList: [buildCustomWebPageAction(url1), buildCustomWebPageAction(url2)],
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

      const actionList = JSON.parse(result.PropertySetConfig).states[0].components['layer-0'].children[0].property
        .actionList;
      const rewritten1 = actionList[0].stateAction['Web Page'].targetName;
      const rewritten2 = actionList[1].stateAction['Web Page'].targetName;

      expect(rewritten1.startsWith('/lightning/page/omnistudio/omniscript?')).to.be.true;
      expect(rewritten1).to.include('omniscript__type=One');
      expect(rewritten1).to.include('omniscript__subType=First');

      expect(rewritten2.startsWith('/lightning/page/omnistudio/omniscript?')).to.be.true;
      expect(rewritten2).to.include('omniscript__type=Two');
      expect(rewritten2).to.include('omniscript__subType=Second');

      // Two distinct rewrites recorded in the summaries set.
      expect(updates.size).to.equal(2);
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
