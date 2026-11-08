import { UserRole } from '@/types';

export type AnnotationTool = 
  | 'select'
  | 'comment'
  | 'highlight'
  | 'draw'
  | 'rectangle'
  | 'arrow'
  | 'eraser';

export interface Point {
  x: number;
  y: number;
}

export interface AnnotationStyle {
  color: string;
  thickness: number;
  opacity: number;
}

export interface BaseAnnotation {
  id: string;
  pageNumber: number;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
}

export interface CommentAnnotation extends BaseAnnotation {
  type: 'comment';
  position: Point;
  content: string;
  isResolved: boolean;
}

export interface HighlightAnnotation extends BaseAnnotation {
  type: 'highlight';
  startPoint: Point;
  endPoint: Point;
  style: Pick<AnnotationStyle, 'color' | 'opacity'>;
}

export interface DrawingAnnotation extends BaseAnnotation {
  type: 'drawing';
  points: Point[];
  style: AnnotationStyle;
}

export interface RectangleAnnotation extends BaseAnnotation {
  type: 'rectangle';
  startPoint: Point;
  endPoint: Point;
  style: AnnotationStyle;
}

export interface ArrowAnnotation extends BaseAnnotation {
  type: 'arrow';
  startPoint: Point;
  endPoint: Point;
  style: AnnotationStyle;
}

export type Annotation = 
  | CommentAnnotation 
  | HighlightAnnotation 
  | DrawingAnnotation 
  | RectangleAnnotation 
  | ArrowAnnotation;

export interface Signature {
  id: string;
  imageData: string;
  rawImageData?: string;
  signerId: string;
  signerName: string;
  signerRole: UserRole;
  timestamp: string;
  position: Point;
  pageNumber: number;
}

export interface ReviewAction {
  type: 'forward' | 'return' | 'approve' | 'collaborate';
  targetRole?: UserRole;
  isCollaboratorApproval?: boolean;
}

export interface ReviewerActions {
  role: UserRole;
  actions: {
    forward?: { label: string; targetRole: UserRole };
    approve?: { label: string };
    return?: { label: string };
    collaborator?: { label: string };
  };
}

export const REVIEWER_ACTIONS: Record<string, ReviewerActions> = {
  dept_head: {
    role: 'dept_head',
    actions: {
      return: { label: 'Return for Revision' },
      forward: { label: 'Forward to Dean', targetRole: 'dean' }
    },
  },
  dean: {
    role: 'dean',
    actions: {
      return: { label: 'Return for Revision' },
      forward: { label: 'Forward to CITL', targetRole: 'citl' }
    },
  },
  citl: {
    role: 'citl',
    actions: {
      return: { label: 'Return for Revision' },
      forward: { label: 'Forward to VPAA', targetRole: 'vpaa' },
    },
  },
  vpaa: {
    role: 'vpaa',
    actions: {
      return: { label: 'Return for Revision' },
      approve: { label: 'Final Approve' }
    },
  },
  faculty: {
    role: 'faculty',
    actions: {
      collaborator: { label: 'Add Collaborators' },
      forward: { label: 'Select Senior Faculty', targetRole: 'faculty_peer_reviewer' }
    },
  },
  faculty_peer_reviewer: {
    role: 'faculty_peer_reviewer',
    actions: {
      return: { label: 'Return for Revision' },
      forward: { label: 'Forward to Dept Head', targetRole: 'dept_head' },
    },
  },
  collaborator_reviewer: {
    role: 'collaborator_reviewer',
    actions: {
      forward: { label: 'Approved', targetRole: 'faculty_peer_reviewer' },
      return: { label: 'Return for Revision' },
    },
  },
};

export interface PDFReviewerState {
  currentPage: number;
  totalPages: number;
  zoom: number;
  activeTool: AnnotationTool;
  activeStyle: AnnotationStyle;
  annotations: Annotation[];
  signature: Signature | null;
  isSigned: boolean;
  comment: string;
  isLoading: boolean;
  error: string | null;
}

export const DEFAULT_ANNOTATION_STYLE: AnnotationStyle = {
  color: '#ef4444',
  thickness: 2,
  opacity: 1,
};

export const ANNOTATION_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#000000', // black
];

export const THICKNESS_OPTIONS = [1, 2, 3, 4, 6, 8];
