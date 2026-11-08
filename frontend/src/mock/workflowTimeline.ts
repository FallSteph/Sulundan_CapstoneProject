import { SyllabusStatus, UserRole, ROLE_LABELS } from '@/types';

export interface WorkflowStep {
  status: SyllabusStatus;
  label: string;
  reviewerRole: UserRole | null;
  order: number;
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  { status: 'draft', label: 'Draft', reviewerRole: null, order: 0 },
  { status: 'submitted', label: 'Submitted', reviewerRole: null, order: 1 },
  { status: 'under_review_dept_head', label: 'Under Review by Dept Head', reviewerRole: 'dept_head', order: 2 },
  { status: 'under_review_dean', label: 'Under Review by Dean', reviewerRole: 'dean', order: 3 },
  { status: 'under_review_citl', label: 'Under Review by CITL', reviewerRole: 'citl', order: 4 },
  { status: 'under_review_vpaa', label: 'Under Review by VPAA', reviewerRole: 'vpaa', order: 5 },
  { status: 'approved', label: 'Approved', reviewerRole: null, order: 6 },
  { status: 'returned', label: 'Returned for Revision', reviewerRole: null, order: -1 },
];

export const getWorkflowStep = (status: SyllabusStatus): WorkflowStep | undefined => {
  return WORKFLOW_STEPS.find(step => step.status === status);
};

export const getCurrentReviewer = (status: SyllabusStatus): string => {
  const step = getWorkflowStep(status);
  if (step?.reviewerRole) {
    return ROLE_LABELS[step.reviewerRole];
  }
  return '';
};

export const getNextStep = (currentStatus: SyllabusStatus): WorkflowStep | undefined => {
  const currentStep = getWorkflowStep(currentStatus);
  if (!currentStep || currentStep.order < 0) return undefined;
  return WORKFLOW_STEPS.find(step => step.order === currentStep.order + 1);
};

export const getStatusProgress = (status: SyllabusStatus): number => {
  const step = getWorkflowStep(status);
  if (!step || step.order < 0) return 0;
  const maxOrder = 6; // approved
  return Math.round((step.order / maxOrder) * 100);
};

export default WORKFLOW_STEPS;
