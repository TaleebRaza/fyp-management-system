import type { ProjectRatings } from '../config/projectRatings';

export type ProjectReviewMember = {
  _id?: string;
  name?: string;
  rollNo?: string;
  email?: string;
  program?: string;
};

export type ProjectReviewProject = {
  _id: string;
  triggerStudentId: string;
  members?: ProjectReviewMember[];
  supervisorName?: string;
  program?: string;
  batch?: string;
  semester?: string;
  projectTitle?: string;
  projectDesc?: string;
  domain?: string;
  domains?: string[];
  tools?: string;
  status?: string;
  stage?: string;
  version?: number;
  ratings?: ProjectRatings;
  pdfUrl?: string;
  maxTeamSize?: number;
};
