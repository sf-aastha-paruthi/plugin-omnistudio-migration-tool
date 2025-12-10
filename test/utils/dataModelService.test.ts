import { expect } from '@salesforce/command/lib/test';
import sinon = require('sinon');
import {
  DataModelService,
  initializeDataModelService,
  getDataModelService,
  getDataModelInfo,
  isStandardDataModel,
  isCustomDataModel,
  isFoundationPackage,
} from '../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../src/utils/orgUtils';
import { Constants } from '../../src/utils/constants/stringContants';

describe('DataModelService', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('getDataModel', () => {
    it('should return standard data model when org permission is enabled', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: false,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: true,
      } as OmnistudioOrgDetails;
      const dataModelService = new DataModelService(orgs);

      // Act
      const result = dataModelService.getDataModel();

      // Assert
      expect(result).to.equal(Constants.StandardDataModel);
    });

    it('should return custom data model when org permission is not enabled', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: false,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const dataModelService = new DataModelService(orgs);

      // Act
      const result = dataModelService.getDataModel();

      // Assert
      expect(result).to.equal(Constants.CustomDataModel);
    });
  });

  describe('isFoundationPackage', () => {
    it('should return true when isFoundationPackage is true', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: true,
      } as OmnistudioOrgDetails;
      const dataModelService = new DataModelService(orgs);

      // Act
      const result = dataModelService.isFoundationPackage();

      // Assert
      expect(result).to.be.true;
    });

    it('should return false when isFoundationPackage is false', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: false,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: true,
      } as OmnistudioOrgDetails;
      const dataModelService = new DataModelService(orgs);

      // Act
      const result = dataModelService.isFoundationPackage();

      // Assert
      expect(result).to.be.false;
    });

    it('should return false when isFoundationPackage is undefined', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: true,
      } as OmnistudioOrgDetails;
      const dataModelService = new DataModelService(orgs);

      // Act
      const result = dataModelService.isFoundationPackage();

      // Assert
      expect(result).to.be.false;
    });

    it('should return false when isFoundationPackage is null', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: null,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: true,
      } as unknown as OmnistudioOrgDetails;
      const dataModelService = new DataModelService(orgs);

      // Act
      const result = dataModelService.isFoundationPackage();

      // Assert
      expect(result).to.be.false;
    });
  });

  describe('Global Functions', () => {
    beforeEach(() => {
      // Reset global state before each test
      // Note: Global state reset is handled by the service itself
    });

    it('should initialize global service correctly', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: false,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;

      // Act & Assert - No error should be thrown
      expect(() => initializeDataModelService(orgs)).to.not.throw();
    });

    it('should return global service instance after initialization', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: false,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: true,
      } as OmnistudioOrgDetails;

      initializeDataModelService(orgs);

      // Act
      const service = getDataModelService();

      // Assert
      expect(service).to.be.instanceOf(DataModelService);
      expect(service.getDataModel()).to.equal(Constants.StandardDataModel);
    });

    it('should return null when getDataModelService is called without initialization', () => {
      // Arrange - Clear any existing global state by importing fresh module
      delete require.cache[require.resolve('../../src/utils/dataModelService')];
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const freshDataModelService = require('../../src/utils/dataModelService');

      // Act
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const result = freshDataModelService.getDataModelService();

      // Assert
      expect(result).to.be.null;
    });

    it('should throw error when getDataModelInfo is called without initialization', () => {
      // Arrange - Clear any existing global state by importing fresh module
      delete require.cache[require.resolve('../../src/utils/dataModelService')];
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const freshDataModelService = require('../../src/utils/dataModelService');

      // Act & Assert
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        freshDataModelService.getDataModelInfo();
      }).to.throw();
    });

    it('should return cached data model on subsequent calls', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: false,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;

      initializeDataModelService(orgs);

      // Act
      const result1 = getDataModelInfo();
      const result2 = getDataModelInfo();

      // Assert
      expect(result1).to.equal(Constants.CustomDataModel);
      expect(result2).to.equal(Constants.CustomDataModel);
      // Both calls should return the same cached result
      expect(result1).to.equal(result2);
    });

    it('should return true for isStandardDataModel when data model is standard', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: false,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: true,
      } as OmnistudioOrgDetails;

      initializeDataModelService(orgs);

      // Act
      const result = isStandardDataModel();

      // Assert
      expect(result).to.be.true;
    });

    it('should return false for isStandardDataModel when data model is custom', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: false,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;

      initializeDataModelService(orgs);

      // Act
      const result = isStandardDataModel();

      // Assert
      expect(result).to.be.false;
    });

    it('should return true for isCustomDataModel when data model is custom', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: false,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;

      initializeDataModelService(orgs);

      // Act
      const result = isCustomDataModel();

      // Assert
      expect(result).to.be.true;
    });

    it('should return false for isCustomDataModel when data model is standard', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: false,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: true,
      } as OmnistudioOrgDetails;

      initializeDataModelService(orgs);

      // Act
      const result = isCustomDataModel();

      // Assert
      expect(result).to.be.false;
    });

    it('should reset cache when initializeDataModelService is called again', () => {
      // Arrange
      const orgs1: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: false,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const orgs2: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: false,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: true,
      } as OmnistudioOrgDetails;

      // Act
      initializeDataModelService(orgs1);
      const result1 = getDataModelInfo();

      initializeDataModelService(orgs2);
      const result2 = getDataModelInfo();

      // Assert
      expect(result1).to.equal(Constants.CustomDataModel);
      expect(result2).to.equal(Constants.StandardDataModel);
    });
  });

  describe('isFoundationPackage - Global Function', () => {
    it('should return true when foundation package is true', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: true,
      } as OmnistudioOrgDetails;

      initializeDataModelService(orgs);

      // Act
      const result = isFoundationPackage();

      // Assert
      expect(result).to.be.true;
    });

    it('should return false when foundation package is false', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: false,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: true,
      } as OmnistudioOrgDetails;

      initializeDataModelService(orgs);

      // Act
      const result = isFoundationPackage();

      // Assert
      expect(result).to.be.false;
    });

    it('should return false when foundation package is undefined', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: true,
      } as OmnistudioOrgDetails;

      initializeDataModelService(orgs);

      // Act
      const result = isFoundationPackage();

      // Assert
      expect(result).to.be.false;
    });

    it('should cache foundation package value on subsequent calls', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: true,
      } as OmnistudioOrgDetails;

      initializeDataModelService(orgs);

      // Act
      const result1 = isFoundationPackage();
      const result2 = isFoundationPackage();

      // Assert
      expect(result1).to.be.true;
      expect(result2).to.be.true;
      // Both calls should return the same cached result
      expect(result1).to.equal(result2);
    });

    it('should reset cache when initializeDataModelService is called again', () => {
      // Arrange
      const orgs1: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const orgs2: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        isFoundationPackage: false,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: true,
      } as OmnistudioOrgDetails;

      // Act
      initializeDataModelService(orgs1);
      const result1 = isFoundationPackage();

      initializeDataModelService(orgs2);
      const result2 = isFoundationPackage();

      // Assert
      expect(result1).to.be.true;
      expect(result2).to.be.false;
    });
  });
});
