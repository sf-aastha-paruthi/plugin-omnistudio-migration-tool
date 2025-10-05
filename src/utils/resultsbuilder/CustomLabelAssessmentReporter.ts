import { CustomLabelAssessmentInfo } from '../customLabels';
import { OmnistudioOrgDetails } from '../orgUtils';
import {
  FilterGroupParam,
  ReportHeaderGroupParam,
  ReportParam,
  ReportRowParam,
  SummaryItemDetailParam,
} from '../reportGenerator/reportInterfaces';
import { createRowDataParam, getOrgDetailsForReport } from '../reportGenerator/reportUtil';

export class CustomLabelAssessmentReporter {
  private static rowId = 0;
  private static rowIdPrefix = 'cl-row-data-';

  public static getCustomLabelAssessmentData(
    customLabelAssessmentInfos: CustomLabelAssessmentInfo[],
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    page = 1,
    pageSize = 1000
  ): ReportParam {
    const safeCustomLabelInfos = customLabelAssessmentInfos || [];

    // Sort labels by name for consistent ordering
    const sortedLabels = [...safeCustomLabelInfos].sort((a, b) => a.name.localeCompare(b.name));

    const totalLabels = sortedLabels.length;
    const totalPages = Math.ceil(totalLabels / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedLabels = sortedLabels.slice(startIndex, endIndex);

    const headerGroups = this.getHeaderGroupsForReport();
    const filterGroups = this.getFilterGroupsForReport();
    const rows = this.getRowsForReport(paginatedLabels, instanceUrl);

    const title = 'Custom Label Assessment';
    const heading = 'Custom Labels';

    const result: ReportParam = {
      title,
      heading,
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toString(),
      total: totalLabels,
      filterGroups,
      headerGroups,
      rows,
      rollbackFlags: undefined,
      callToAction: [],
      reportType: 'customlabels', // Identifier for Custom Labels specific CSS styling
    };

    // Only add pagination if there are multiple pages
    if (totalPages > 1) {
      result.pagination = {
        currentPage: page,
        totalPages,
        pageSize,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        nextPageFile: page < totalPages ? `customlabel_assessment_Page_${page + 1}_of_${totalPages}.html` : undefined,
        previousPageFile: page > 1 ? `customlabel_assessment_Page_${page - 1}_of_${totalPages}.html` : undefined,
      };
    }

    return result;
  }

  public static getSummaryData(customLabelAssessmentInfos: CustomLabelAssessmentInfo[]): SummaryItemDetailParam[] {
    const safeCustomLabelInfos = customLabelAssessmentInfos || [];
    const warnings = safeCustomLabelInfos.filter((label) => label.assessmentStatus === 'Warnings').length;

    const needsManualIntervention = safeCustomLabelInfos.filter(
      (label) => label.assessmentStatus === 'Needs Manual Intervention'
    ).length;

    const failed = safeCustomLabelInfos.filter((label) => label.assessmentStatus === 'Failed').length;

    return [
      {
        name: 'Warnings',
        count: warnings,
        cssClass: 'text-warning',
      },
      {
        name: 'Needs Manual Intervention',
        count: needsManualIntervention,
        cssClass: 'text-error',
      },
      {
        name: 'Failed',
        count: failed,
        cssClass: 'text-error',
      },
    ];
  }

  private static getRowsForReport(
    customLabelAssessmentInfos: CustomLabelAssessmentInfo[],
    instanceUrl: string
  ): ReportRowParam[] {
    const safeCustomLabelInfos = customLabelAssessmentInfos || [];
    const rows: ReportRowParam[] = [];

    const batchRows = safeCustomLabelInfos.map((info) => {
      return {
        rowId: `${this.rowIdPrefix}${this.rowId++}`,
        data: [
          createRowDataParam('name', info.name || '', true, 1, 1, false),
          createRowDataParam(
            'packageId',
            info.packageId || '<ID>',
            false,
            1,
            1,
            true,
            `${instanceUrl}/${info.packageId}`
          ),
          createRowDataParam(
            'packageValue',
            info.packageValue || '',
            false,
            1,
            1,
            false,
            undefined,
            undefined,
            undefined,
            true
          ),
          createRowDataParam('coreId', info.coreId || '<Core Id>', false, 1, 1, true, `${instanceUrl}/${info.coreId}`),
          createRowDataParam(
            'coreValue',
            info.coreValue || '',
            false,
            1,
            1,
            false,
            undefined,
            undefined,
            undefined,
            true
          ),
          createRowDataParam(
            'assessmentStatus',
            info.assessmentStatus || '',
            false,
            1,
            1,
            false,
            undefined,
            undefined,
            this.getStatusCssClass(info.assessmentStatus)
          ),
          createRowDataParam('summary', info.summary || '', false, 1, 1, false, undefined, undefined, undefined, true),
        ],
      };
    });

    rows.push(...batchRows);
    return rows;
  }

  private static getHeaderGroupsForReport(): ReportHeaderGroupParam[] {
    return [
      {
        header: [
          {
            name: 'Name',
            colspan: 1,
            rowspan: 2,
          },
          {
            name: 'Package',
            colspan: 2,
            rowspan: 1,
          },
          {
            name: 'Core',
            colspan: 2,
            rowspan: 1,
          },
          {
            name: 'Assessment Status',
            colspan: 1,
            rowspan: 2,
          },
          {
            name: 'Summary',
            colspan: 1,
            rowspan: 2,
          },
        ],
      },
      {
        header: [
          {
            name: 'Id',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Value',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Id',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Value',
            colspan: 1,
            rowspan: 1,
          },
        ],
      },
    ];
  }

  private static getFilterGroupsForReport(): FilterGroupParam[] {
    return [
      {
        label: 'Assessment Status',
        key: 'assessmentStatus',
        filters: [
          { label: 'Ready for migration' },
          { label: 'Needs Manual Intervention' },
          { label: 'Warnings' },
          { label: 'Failed' },
        ],
      },
    ];
  }

  private static getStatusCssClass(status: string): string {
    switch (status) {
      case 'Warnings':
        return 'text-warning';
      case 'Needs Manual Intervention':
        return 'text-error';
      case 'Failed':
        return 'text-error';
      case 'Ready for migration':
        return 'text-success';
      default:
        return 'text-success';
    }
  }
}
