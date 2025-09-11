/* eslint-disable camelcase */
const mappings = {
  Active__c: 'IsActive',
  InternalNotes__c: 'Description',
  Level__c: 'Level',
  Name: 'Name',
  OmniScriptId__c: 'OmniProcessId',
  Order__c: 'SequenceNumber',
  ParentElementId__c: 'ParentElementId',
  PropertySet__c: 'PropertySetConfig',
  SearchKey__c: 'EmbeddedOmniScriptKey',
  Type__c: 'Type',
};

const mappingsStandard = {
  IsActive: 'IsActive',
  Description: 'Description',
  Level: 'Level',
  Name: 'Name',
  OmniProcessId: 'OmniProcessId',
  SequenceNumber: 'SequenceNumber',
  ParentElementId: 'ParentElementId',
  PropertySetConfig: 'PropertySetConfig',
  EmbeddedOmniScriptKey: 'EmbeddedOmniScriptKey',
  Type: 'Type',
};

export default { mappings, mappingsStandard };
