/* eslint-disable camelcase */
import { expect } from '@salesforce/command/lib/test';
import { AnyJson } from '@salesforce/ts-types';
import { Connection } from '@salesforce/core';
import sinon = require('sinon');
import {
  getReplacedString,
  populateRegexForFunctionMetadata,
  getAllFunctionMetadata,
} from '../../../src/utils/formula/FormulaUtil';
import * as dataModelService from '../../../src/utils/dataModelService';
import * as QueryTools from '../../../src/utils/query';
import { DebugTimer } from '../../../src/utils/logging/debugtimer';

describe('FormulaUtilTest', () => {
  it('should generate new string with standard function format', () => {
    const namespacePrefix = 'test_namespace__';
    const mockedFunctionDefinitionMetadata = getMockedAllFunctionMetadata();
    populateRegexForFunctionMetadata(mockedFunctionDefinitionMetadata);
    const inputString = "TESTMETHODFIRST('hello','bye')";
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const result = getReplacedString(namespacePrefix, inputString, mockedFunctionDefinitionMetadata);
    const expectedResult = 'FUNCTION("testClassFirst","testMethodFirst",\'hello\',\'bye\')';

    expect(result).to.be.equal(expectedResult);
  });

  it('should generate new string with standard function format with nested custom formula', () => {
    const namespacePrefix = 'test_namespace__';
    const mockedFunctionDefinitionMetadata = getMockedAllFunctionMetadata();
    populateRegexForFunctionMetadata(mockedFunctionDefinitionMetadata);
    const inputString = "TESTMETHODFIRST('hello',TESTMETHOD('bye'))";
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const result = getReplacedString(namespacePrefix, inputString, mockedFunctionDefinitionMetadata);
    const expectedResult =
      'FUNCTION("testClassFirst","testMethodFirst",\'hello\',FUNCTION("testClass","testMethod",\'bye\'))';

    expect(result).to.be.equal(expectedResult);
  });

  it('should generate new string with standard function format with nested custom formula and a formula used more than Once', () => {
    const namespacePrefix = 'test_namespace__';
    const mockedFunctionDefinitionMetadata = getMockedAllFunctionMetadata();
    populateRegexForFunctionMetadata(mockedFunctionDefinitionMetadata);
    const inputString = "TESTMETHODFIRST('hello',TESTMETHOD(TESTMETHODFIRST('bye','check')))";
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const result = getReplacedString(namespacePrefix, inputString, mockedFunctionDefinitionMetadata);
    const expectedResult =
      'FUNCTION("testClassFirst","testMethodFirst",\'hello\',FUNCTION("testClass","testMethod",FUNCTION("testClassFirst","testMethodFirst",\'bye\',\'check\')))';
    expect(result).to.be.equal(expectedResult);
  });

  it('should include namespace prefix in class name when function has namespace', () => {
    const namespacePrefix = 'test_namespace__';
    const mockedFunctionDefinitionMetadata = getMockedFunctionMetadataWithNamespace();
    populateRegexForFunctionMetadata(mockedFunctionDefinitionMetadata);
    const inputString = "NAMESPACEDMETHOD('param1')";
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const result = getReplacedString(namespacePrefix, inputString, mockedFunctionDefinitionMetadata);
    const expectedResult = 'FUNCTION("pkg_namespace.NamespacedClass","namespacedMethod",\'param1\')';
    expect(result).to.be.equal(expectedResult);
  });

  it('should handle functions with and without namespace in same formula', () => {
    const namespacePrefix = 'test_namespace__';
    const mockedFunctionDefinitionMetadata = getMixedFunctionMetadata();
    populateRegexForFunctionMetadata(mockedFunctionDefinitionMetadata);
    const inputString = "TESTMETHOD('hello',NAMESPACEDMETHOD('world'))";
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const result = getReplacedString(namespacePrefix, inputString, mockedFunctionDefinitionMetadata);
    const expectedResult =
      'FUNCTION("testClass","testMethod",\'hello\',FUNCTION("pkg_namespace.NamespacedClass","namespacedMethod",\'world\'))';
    expect(result).to.be.equal(expectedResult);
  });
});

describe('getAllFunctionMetadata', () => {
  let sandbox: sinon.SinonSandbox;
  let connection: Connection;
  let isFoundationPackageStub: sinon.SinonStub;
  let queryAllStub: sinon.SinonStub;
  let debugTimerStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    connection = {} as Connection;
    isFoundationPackageStub = sandbox.stub(dataModelService, 'isFoundationPackage');
    queryAllStub = sandbox.stub(QueryTools.QueryTools, 'queryAll');

    // Mock DebugTimer to prevent 'Cannot read properties of undefined' error
    const mockDebugTimer = {
      lap: sandbox.stub(),
    };
    debugTimerStub = sandbox.stub(DebugTimer, 'getInstance').returns(mockDebugTimer as unknown as DebugTimer);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should return empty array when isFoundationPackage returns true', async () => {
    // Arrange
    isFoundationPackageStub.returns(true);
    const namespace = 'test_namespace';

    // Act
    const result = await getAllFunctionMetadata(namespace, connection);

    // Assert
    expect(result).to.be.an('array').that.is.empty;
    expect(isFoundationPackageStub.calledOnce).to.be.true;
    expect(queryAllStub.called).to.be.false; // Should not query when foundation package
    expect(debugTimerStub.called).to.be.false; // Should not call debug timer when foundation package
  });

  it('should query FunctionDefinition__mdt when isFoundationPackage returns false', async () => {
    // Arrange
    isFoundationPackageStub.returns(false);
    const namespace = 'test_namespace';
    const mockFunctionMetadata = getMockedAllFunctionMetadata();
    queryAllStub.resolves(mockFunctionMetadata);

    // Act
    const result = await getAllFunctionMetadata(namespace, connection);

    // Assert
    expect(result).to.deep.equal(mockFunctionMetadata);
    expect(isFoundationPackageStub.calledOnce).to.be.true;
    expect(queryAllStub.calledOnce).to.be.true;
    expect(queryAllStub.firstCall.args[0]).to.equal(connection);
    expect(queryAllStub.firstCall.args[1]).to.equal(namespace);
    expect(queryAllStub.firstCall.args[2]).to.equal('FunctionDefinition__mdt');
    expect(queryAllStub.firstCall.args[3]).to.be.an('array'); // Function definition fields
    expect(debugTimerStub.calledOnce).to.be.true; // Should call debug timer when foundation package is false
  });

  it('should handle empty function metadata result when isFoundationPackage is false', async () => {
    // Arrange
    isFoundationPackageStub.returns(false);
    const namespace = 'test_namespace';
    queryAllStub.resolves([]);

    // Act
    const result = await getAllFunctionMetadata(namespace, connection);

    // Assert
    expect(result).to.be.an('array').that.is.empty;
    expect(isFoundationPackageStub.calledOnce).to.be.true;
    expect(queryAllStub.calledOnce).to.be.true;
  });

  it('should throw error when query fails and isFoundationPackage is false', async () => {
    // Arrange
    isFoundationPackageStub.returns(false);
    const namespace = 'test_namespace';
    const error = new Error('Query failed');
    queryAllStub.rejects(error);

    // Act & Assert
    try {
      await getAllFunctionMetadata(namespace, connection);
      expect.fail('Expected an error to be thrown');
    } catch (err: unknown) {
      if (err instanceof Error) {
        expect(err.message).to.equal('Query failed');
      } else {
        expect.fail('Expected an Error object');
      }
    }

    expect(isFoundationPackageStub.calledOnce).to.be.true;
    expect(queryAllStub.calledOnce).to.be.true;
  });

  it('should pass correct namespace to queryAll when isFoundationPackage is false', async () => {
    // Arrange
    isFoundationPackageStub.returns(false);
    const namespace = 'custom_namespace__';
    const mockFunctionMetadata = [
      {
        DeveloperName: 'CUSTOMMETHOD',
        custom_namespace__ClassName__c: 'CustomClass',
        custom_namespace__MethodName__c: 'customMethod',
        NamespacePrefix: null,
      },
    ];
    queryAllStub.resolves(mockFunctionMetadata);

    // Act
    const result = await getAllFunctionMetadata(namespace, connection);

    // Assert
    expect(result).to.deep.equal(mockFunctionMetadata);
    expect(queryAllStub.firstCall.args[1]).to.equal('custom_namespace__');
  });
});

function getMockedAllFunctionMetadata(): AnyJson[] {
  return [
    {
      DeveloperName: 'TESTMETHOD',
      test_namespace__ClassName__c: 'testClass',
      test_namespace__MethodName__c: 'testMethod',
      NamespacePrefix: null,
    },
    {
      DeveloperName: 'TESTMETHODFIRST',
      test_namespace__ClassName__c: 'testClassFirst',
      test_namespace__MethodName__c: 'testMethodFirst',
      NamespacePrefix: null,
    },
    {
      DeveloperName: 'TESTMETHODSECOND',
      test_namespace__ClassName__c: 'testClassSecond',
      test_namespace__MethodName__c: 'testMethodSecond',
      NamespacePrefix: null,
    },
    {
      DeveloperName: 'TESTMETHODTHIRD',
      test_namespace__ClassName__c: 'testClassThird',
      test_namespace__MethodName__c: 'testMethodThird',
      NamespacePrefix: null,
    },
  ];
}

function getMockedFunctionMetadataWithNamespace(): AnyJson[] {
  return [
    {
      DeveloperName: 'NAMESPACEDMETHOD',
      test_namespace__ClassName__c: 'NamespacedClass',
      test_namespace__MethodName__c: 'namespacedMethod',
      NamespacePrefix: 'pkg_namespace',
    },
  ];
}

function getMixedFunctionMetadata(): AnyJson[] {
  return [
    {
      DeveloperName: 'TESTMETHOD',
      test_namespace__ClassName__c: 'testClass',
      test_namespace__MethodName__c: 'testMethod',
      NamespacePrefix: null,
    },
    {
      DeveloperName: 'NAMESPACEDMETHOD',
      test_namespace__ClassName__c: 'NamespacedClass',
      test_namespace__MethodName__c: 'namespacedMethod',
      NamespacePrefix: 'pkg_namespace',
    },
  ];
}
