/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
import fs from 'fs';
import open from 'open';
import { AssessmentInfo } from '../interfaces';
import { DashboardParam } from '../reportGenerator/reportInterfaces';
import { OmnistudioOrgDetails } from '../orgUtils';
import { Constants } from '../constants/stringContants';
import { pushAssestUtilites } from '../file/fileUtil';
import { TemplateParser } from '../templateParser/generate';
import { getOrgDetailsForReport } from '../reportGenerator/reportUtil';
import { OSAssessmentReporter } from './OSAssessmentReporter';
import { ApexAssessmentReporter } from './ApexAssessmentReporter';
import { IPAssessmentReporter } from './IPAssessmentReporter';
import { DRAssessmentReporter } from './DRAssessmentReporter';
import { FlexcardAssessmentReporter } from './FlexcardAssessmentReporter';

export class AssessmentReporter {
  private static basePath = process.cwd() + '/assessment_reports';
  private static omniscriptAssessmentFilePath = this.basePath + '/omniscript_assessment.html';
  private static flexcardAssessmentFilePath = this.basePath + '/flexcard_assessment.html';
  private static integrationProcedureAssessmentFilePath = this.basePath + '/integration_procedure_assessment.html';
  private static dataMapperAssessmentFilePath = this.basePath + '/datamapper_assessment.html';
  private static apexAssessmentFilePath = this.basePath + '/apex_assessment.html';
  private static dashboardFilePath = this.basePath + '/dashboard.html';
  private static dashboardTemplate = process.cwd() + '/src/templates/dashboard.template';
  // TODO: Uncomment code once MVP for migration is completed
  // private static lwcAssessmentFilePath = this.basePath + '/lwc_assessment.html';
  public static async generate(
    result: AssessmentInfo,
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    assessOnly: string,
    relatedObjects: string[]
  ): Promise<void> {
    fs.mkdirSync(this.basePath, { recursive: true });

    const assessmentReportTemplate = fs.readFileSync(
      process.cwd() + '/src/templates/assessmentReport.template',
      'utf8'
    );
    if (!assessOnly) {
      this.createDocument(
        this.omniscriptAssessmentFilePath,
        TemplateParser.generate(
          assessmentReportTemplate,
          OSAssessmentReporter.getOmniscriptAssessmentData(
            result.omniAssessmentInfo.osAssessmentInfos,
            instanceUrl,
            omnistudioOrgDetails
          )
        )
      );

      this.createDocument(
        this.flexcardAssessmentFilePath,
        TemplateParser.generate(
          assessmentReportTemplate,
          FlexcardAssessmentReporter.getFlexcardAssessmentData(
            result.flexCardAssessmentInfos,
            instanceUrl,
            omnistudioOrgDetails
          )
        )
      );
      this.createDocument(
        this.apexAssessmentFilePath,
        TemplateParser.generate(
          assessmentReportTemplate,
          ApexAssessmentReporter.getApexAssessmentData(result.apexAssessmentInfos, omnistudioOrgDetails)
        )
      );

      // this.createDocument(
      //   lwcAssessmentFilePath,
      //   LWCAssessmentReporter.generateLwcAssesment(result.lwcAssessmentInfos, instanceUrl, orgDetails)
      // );

      this.createDocument(
        this.integrationProcedureAssessmentFilePath,
        TemplateParser.generate(
          assessmentReportTemplate,
          IPAssessmentReporter.getIntegrationProcedureAssessmentData(
            result.omniAssessmentInfo.ipAssessmentInfos,
            instanceUrl,
            omnistudioOrgDetails
          )
        )
      );

      this.createDocument(
        this.dataMapperAssessmentFilePath,
        TemplateParser.generate(
          assessmentReportTemplate,
          DRAssessmentReporter.getDatamapperAssessmentData(
            result.dataRaptorAssessmentInfos,
            instanceUrl,
            omnistudioOrgDetails
          )
        )
      );
    } else {
      switch (assessOnly) {
        case Constants.Omniscript:
          this.createDocument(
            this.omniscriptAssessmentFilePath,
            TemplateParser.generate(
              assessmentReportTemplate,
              OSAssessmentReporter.getOmniscriptAssessmentData(
                result.omniAssessmentInfo.osAssessmentInfos,
                instanceUrl,
                omnistudioOrgDetails
              )
            )
          );
          break;

        case Constants.Flexcard:
          this.createDocument(
            this.flexcardAssessmentFilePath,
            TemplateParser.generate(
              assessmentReportTemplate,
              FlexcardAssessmentReporter.getFlexcardAssessmentData(
                result.flexCardAssessmentInfos,
                instanceUrl,
                omnistudioOrgDetails
              )
            )
          );
          break;

        case Constants.IntegrationProcedure:
          this.createDocument(
            this.integrationProcedureAssessmentFilePath,
            TemplateParser.generate(
              assessmentReportTemplate,
              IPAssessmentReporter.getIntegrationProcedureAssessmentData(
                result.omniAssessmentInfo.ipAssessmentInfos,
                instanceUrl,
                omnistudioOrgDetails
              )
            )
          );
          break;

        case Constants.DataMapper:
          this.createDocument(
            this.dataMapperAssessmentFilePath,
            TemplateParser.generate(
              assessmentReportTemplate,
              DRAssessmentReporter.getDatamapperAssessmentData(
                result.dataRaptorAssessmentInfos,
                instanceUrl,
                omnistudioOrgDetails
              )
            )
          );
          break;

        default:
      }
    }

    if (relatedObjects && relatedObjects.includes(Constants.Apex)) {
      this.createDocument(
        this.apexAssessmentFilePath,
        TemplateParser.generate(
          assessmentReportTemplate,
          ApexAssessmentReporter.getApexAssessmentData(result.apexAssessmentInfos, omnistudioOrgDetails)
        )
      );
    }
    // TODO: Uncomment code once MVP for migration is completed
    // if (relatedObjects && relatedObjects.includes(Constants.LWC)) {
    //   this.createDocument(
    //     lwcAssessmentFilePath,
    //     LWCAssessmentReporter.generateLwcAssesment(result.lwcAssessmentInfos, instanceUrl, orgDetails)
    //   );
    // }

    // await this.createMasterDocument(nameUrls, basePath);
    this.createDashboard(this.basePath, result, omnistudioOrgDetails);
    pushAssestUtilites('javascripts', this.basePath);
    pushAssestUtilites('styles', this.basePath);
    await open('file://' + this.dashboardFilePath);
  }
  private static createDashboard(
    basePath: string,
    result: AssessmentInfo,
    omnistudioOrgDetails: OmnistudioOrgDetails
  ): void {
    const dashboardTemplate = fs.readFileSync(this.dashboardTemplate, 'utf8');
    this.createDocument(
      basePath + '/dashboard.html',
      TemplateParser.generate(dashboardTemplate, this.createDashboardParam(result, omnistudioOrgDetails))
    );
  }
  private static createDashboardParam(
    result: AssessmentInfo,
    omnistudioOrgDetails: OmnistudioOrgDetails
  ): DashboardParam {
    return {
      title: 'Assessment Reports',
      heading: 'Assessment Reports',
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toISOString(),
      summaryItems: [
        {
          name: 'OmniScript',
          total: result.omniAssessmentInfo.osAssessmentInfos.length,
          data: OSAssessmentReporter.getSummaryData(result.omniAssessmentInfo.osAssessmentInfos),
          file: this.omniscriptAssessmentFilePath,
        },
        {
          name: 'Flexcard',
          total: result.flexCardAssessmentInfos.length,
          data: FlexcardAssessmentReporter.getSummaryData(result.flexCardAssessmentInfos),
          file: this.flexcardAssessmentFilePath,
        },
        {
          name: 'Integration Procedure',
          total: result.omniAssessmentInfo.ipAssessmentInfos.length,
          data: IPAssessmentReporter.getSummaryData(result.omniAssessmentInfo.ipAssessmentInfos),
          file: this.integrationProcedureAssessmentFilePath,
        },
        {
          name: 'DataMapper',
          total: result.dataRaptorAssessmentInfos.length,
          data: DRAssessmentReporter.getSummaryData(result.dataRaptorAssessmentInfos),
          file: this.dataMapperAssessmentFilePath,
        },
        {
          name: 'Apex',
          total: result.apexAssessmentInfos.length,
          data: ApexAssessmentReporter.getSummaryData(result.apexAssessmentInfos),
          file: this.apexAssessmentFilePath,
        },
      ],
    };
  }

  private static createDocument(filePath: string, htmlBody: string): void {
    fs.writeFileSync(filePath, htmlBody);
  }
}
