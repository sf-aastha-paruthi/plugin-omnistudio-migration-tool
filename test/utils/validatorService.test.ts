import { expect } from '@salesforce/command/lib/test';
import { Connection, Messages } from '@salesforce/core';
import sinon = require('sinon');
import { ValidatorService } from '../../src/utils/validatorService';
import { Logger } from '../../src/utils/logger';
import { OmnistudioOrgDetails } from '../../src/utils/orgUtils';
import { OrgPreferences } from '../../src/utils/orgPreferences';

describe('ValidatorService', () => {
  let connection: Connection;
  let messages: Messages;
  let sandbox: sinon.SinonSandbox;
  let loggerWarnStub: sinon.SinonStub;
  let loggerErrorStub: sinon.SinonStub;
  let loggerLogVerboseStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Mock Connection
    connection = {
      query: sandbox.stub(),
    } as unknown as Connection;

    // Mock Messages
    messages = {
      getMessage: sandbox.stub(),
    } as unknown as Messages;

    // Mock Logger
    loggerWarnStub = sandbox.stub(Logger, 'warn');
    loggerErrorStub = sandbox.stub(Logger, 'error');
    loggerLogVerboseStub = sandbox.stub(Logger, 'logVerbose');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('validateNamespace', () => {
    it('should return true and not log warning when namespace is valid', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'ValidNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = validator.validateNamespace();

      // Assert
      expect(result).to.be.true;
      expect(loggerWarnStub.called).to.be.false;
    });

    it('should return false and log error when namespace is invalid', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: false,
        packageDetails: { namespace: 'InvalidNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      (messages.getMessage as sinon.SinonStub)
        .withArgs('unknownNamespace')
        .returns("Org doesn't have Omnistudio namespace(s) configured");
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = validator.validateNamespace();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal("Org doesn't have Omnistudio namespace(s) configured");
    });

    it('should handle missing packageDetails gracefully', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: false,
        packageDetails: null,
        omniStudioOrgPermissionEnabled: false,
      } as unknown as OmnistudioOrgDetails;
      (messages.getMessage as sinon.SinonStub)
        .withArgs('unknownNamespace')
        .returns("Org doesn't have Omnistudio namespace(s) configured");
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = validator.validateNamespace();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal("Org doesn't have Omnistudio namespace(s) configured");
    });
  });

  describe('validatePackageInstalled', () => {
    it('should return true when package is installed', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = validator.validatePackageInstalled();

      // Assert
      expect(result).to.be.true;
      expect(loggerErrorStub.called).to.be.false;
    });

    it('should return false and log error when package is not installed (null)', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: null,
        omniStudioOrgPermissionEnabled: false,
      } as unknown as OmnistudioOrgDetails;
      (messages.getMessage as sinon.SinonStub).withArgs('noPackageInstalled').returns('No package installed');
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = validator.validatePackageInstalled();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal('No package installed');
    });

    it('should return false and log error when package is not installed (undefined)', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: undefined,
        omniStudioOrgPermissionEnabled: false,
      } as unknown as OmnistudioOrgDetails;
      (messages.getMessage as sinon.SinonStub).withArgs('noPackageInstalled').returns('No package installed');
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = validator.validatePackageInstalled();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal('No package installed');
    });
  });

  describe('validateOmniStudioOrgPermissionEnabled', () => {
    it('should return true when org permission is not enabled', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = validator.validateOmniStudioOrgPermissionEnabled();

      // Assert
      expect(result).to.be.true;
      expect(loggerErrorStub.called).to.be.false;
    });

    it('should return false and log error when org permission is already enabled', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: true,
      } as OmnistudioOrgDetails;
      (messages.getMessage as sinon.SinonStub).withArgs('alreadyStandardModel').returns('Already standard model');
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = validator.validateOmniStudioOrgPermissionEnabled();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal('Already standard model');
    });
  });

  describe('validateOmniStudioLicenses', () => {
    it('should return true when licenses exist with count > 0', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '5' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.true;
      expect(loggerErrorStub.called).to.be.false;
      expect((connection.query as sinon.SinonStub).calledOnce).to.be.true;
      expect((connection.query as sinon.SinonStub).firstCall.args[0]).to.include(
        "SELECT count(DeveloperName) total FROM PermissionSetLicense WHERE PermissionSetLicenseKey LIKE 'OmniStudio%' AND Status = 'Active'"
      );
    });

    it('should return true when count is exactly 1', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '1' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.true;
      expect(loggerErrorStub.called).to.be.false;
    });

    it('should return false and log error when no licenses exist (empty records)', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub).withArgs('noOmniStudioLicenses').returns('No licenses found');
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal('No licenses found');
    });

    it('should return false and log error when license count is 0', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '0' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub).withArgs('noOmniStudioLicenses').returns('No licenses found');
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal('No licenses found');
    });

    it('should return false when query result is null', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      (connection.query as sinon.SinonStub).resolves(null);
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.false;
    });

    it('should return false when query result has no records property', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const queryResult = {};
      (connection.query as sinon.SinonStub).resolves(queryResult);
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.false;
    });

    it('should return false and log error when query throws Error', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const error = new Error('Database connection failed');
      (connection.query as sinon.SinonStub).rejects(error);
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal(
        'Error validating OmniStudio licenses: Database connection failed'
      );
    });

    it('should return false and log generic error when query throws non-Error object', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const error = 'String error message';
      (connection.query as sinon.SinonStub).rejects(error);
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal('Error validating OmniStudio licenses: Unknown error');
    });

    it('should handle string counts correctly', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '10' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.true;
    });

    it('should handle non-numeric string counts as 0', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: 'invalid' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub).withArgs('noOmniStudioLicenses').returns('No licenses found');
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
    });
  });

  describe('validateDrVersioningDisabled', () => {
    it('should return true when DR versioning is disabled', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '5' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      sandbox.stub(OrgPreferences, 'checkDRVersioning').resolves(false);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingDrVersioningDisabled')
        .returns('Validating DR versioning disabled');
      (messages.getMessage as sinon.SinonStub).withArgs('drVersioningDisabled').returns('DR versioning is disabled');
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.true;
      expect(loggerLogVerboseStub.calledWith('Validating DR versioning disabled')).to.be.true;
      expect(loggerLogVerboseStub.calledWith('DR versioning is disabled')).to.be.true;
    });

    it('should return false when DR versioning is enabled', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '5' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      sandbox.stub(OrgPreferences, 'checkDRVersioning').resolves(true);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingDrVersioningDisabled')
        .returns('Validating DR versioning disabled');
      (messages.getMessage as sinon.SinonStub).withArgs('drVersioningEnabled').returns('DR versioning is enabled');
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.false;
      expect(loggerLogVerboseStub.calledWith('Validating DR versioning disabled')).to.be.true;
      expect(loggerErrorStub.calledWith('DR versioning is enabled')).to.be.true;
    });

    it('should return false when DR versioning check throws error', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '5' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      sandbox.stub(OrgPreferences, 'checkDRVersioning').rejects(new Error('Connection failed'));
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingDrVersioningDisabled')
        .returns('Validating DR versioning disabled');
      (messages.getMessage as sinon.SinonStub)
        .withArgs('errorValidatingDrVersioning')
        .returns('Error validating DR versioning');
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.false;
      expect(loggerLogVerboseStub.calledWith('Validating DR versioning disabled')).to.be.true;
      expect(loggerErrorStub.calledWith('Error validating DR versioning')).to.be.true;
    });
  });

  describe('validate', () => {
    it('should return true when all validations pass', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '5' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      sandbox.stub(OrgPreferences, 'checkDRVersioning').resolves(false);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingDrVersioningDisabled')
        .returns('Validating DR versioning disabled');
      (messages.getMessage as sinon.SinonStub).withArgs('drVersioningDisabled').returns('DR versioning is disabled');
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.true;
    });

    it('should return false when package validation fails', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: null,
        omniStudioOrgPermissionEnabled: false,
      } as unknown as OmnistudioOrgDetails;
      (messages.getMessage as sinon.SinonStub).withArgs('noPackageInstalled').returns('No package');
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
    });

    it('should return false when org permission validation fails', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: true,
      } as OmnistudioOrgDetails;
      (messages.getMessage as sinon.SinonStub).withArgs('alreadyStandardModel').returns('Already standard');
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
    });

    it('should return false when license validation fails', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub).withArgs('noOmniStudioLicenses').returns('No licenses');
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
    });

    it('should return false when license query throws error', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const error = new Error('Connection error');
      (connection.query as sinon.SinonStub).rejects(error);
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
    });

    it('should return false when namespace validation fails even if other validations pass', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: false,
        packageDetails: { namespace: 'InvalidNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '5' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      sandbox.stub(OrgPreferences, 'checkDRVersioning').resolves(false);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('unknownNamespace')
        .returns("Org doesn't have Omnistudio namespace(s) configured");
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingDrVersioningDisabled')
        .returns('Validating DR versioning disabled');
      (messages.getMessage as sinon.SinonStub).withArgs('drVersioningDisabled').returns('DR versioning is disabled');
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.false; // Should fail because namespace validation now returns false
      expect(loggerErrorStub.calledOnce).to.be.true; // Error should be logged
    });

    it('should return false when DR versioning validation fails', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '5' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      sandbox.stub(OrgPreferences, 'checkDRVersioning').resolves(true);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingDrVersioningDisabled')
        .returns('Validating DR versioning disabled');
      (messages.getMessage as sinon.SinonStub).withArgs('drVersioningEnabled').returns('DR versioning is enabled');
      const validator = new ValidatorService(orgs, connection, messages);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal('DR versioning is enabled');
    });
  });
});
